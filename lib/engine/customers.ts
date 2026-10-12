import { all, get, insertMany, tx, type Param, type Sql } from "@/lib/engine/sql";
import { logActivity } from "@/lib/engine/db";
import { findCustomersByContact, listContactPoints, type ContactPoint } from "@/lib/engine/contacts";
import {
  CONTACT_KINDS,
  CONTACT_POINT_COLUMNS,
  contactPointRow,
  contactStorageReady,
  customerIdFor,
  normaliseContact,
  type ContactKind,
} from "@/lib/engine/pii";
import { IDENTITY_KINDS } from "@/lib/shared/contact-kinds";
import { playById } from "@/lib/shared/plays";

/* ── จัดการฐานลูกค้าทีละคน ─────────────────────────────────────

   ที่ผ่านมาทางเดียวที่ข้อมูลเข้าระบบคือการนำเข้าไฟล์ และไม่มีทางแก้หรือลบ
   ทีละคนเลย — ลูกค้าโทรมาขอเปลี่ยนเบอร์ ขอถอนความยินยอม หรือขอให้ลบข้อมูล
   (สิทธิ์ตาม PDPA) ร้านต้องแก้ไฟล์แล้วนำเข้าใหม่ทั้งก้อน

   ไฟล์นี้คือชั้นข้อมูลของหน้า /app/customers ทั้งรายชื่อ หน้าของแต่ละคน
   และการเพิ่ม · แก้ · ลบ ทุกคำสั่งมี tenant_id ในเงื่อนไขเสมอ บน Postgres
   RLS กันซ้ำอีกชั้น แต่ฝั่ง SQLite ไม่มี RLS — เงื่อนไขนี้จึงเป็นด่านเดียว

   ค่าติดต่อเต็มไม่เคยออกจากไฟล์นี้ หน้าจอได้แค่ค่าที่ปิดบางส่วน การเปิดดู
   ค่าเต็มต้องผ่าน revealContactPoint ซึ่งบันทึกทุกครั้ง
   ───────────────────────────────────────────────────────────── */

export const PAGE_SIZE = 50;

export type CustomerFilter = "all" | "buyers" | "never" | "line" | "phone" | "email" | "consent" | "no_consent";
export type CustomerSort = "recent" | "name" | "spent" | "last";

export const CUSTOMER_FILTERS: CustomerFilter[] = [
  "all", "buyers", "never", "line", "phone", "email", "consent", "no_consent",
];
export const CUSTOMER_SORTS: CustomerSort[] = ["last", "spent", "recent", "name"];

export type CustomerRow = {
  id: string;
  name: string;
  createdAt: string;
  orders: number;
  spent: number;
  lastAt: string | null;
  kinds: string[];
  consent: boolean;
};

const CONSENT_NOW = `EXISTS (SELECT 1 FROM consents s WHERE s.customer_id = c.id
  AND s.purpose = 'marketing' AND s.granted_at IS NOT NULL AND s.revoked_at IS NULL)`;

const hasKind = (kind: string) =>
  `EXISTS (SELECT 1 FROM contact_points p WHERE p.customer_id = c.id AND p.kind = '${kind}')`;

/* ค่าพวกนี้มาจากรายการคงที่ด้านบนเท่านั้น ไม่ใช่จากผู้ใช้ — ประกอบเป็น SQL ได้ */
const FILTER_SQL: Record<CustomerFilter, string> = {
  all: "",
  buyers: "AND a.orders > 0",
  never: "AND a.orders IS NULL",
  line: `AND ${hasKind("line")}`,
  phone: `AND ${hasKind("phone")}`,
  email: `AND ${hasKind("email")}`,
  consent: `AND ${CONSENT_NOW}`,
  no_consent: `AND NOT ${CONSENT_NOW}`,
};

/* NULL เรียงคนละทางใน SQLite กับ Postgres — COALESCE ให้ทั้งสองฝั่งเรียงเหมือนกัน */
const SORT_SQL: Record<CustomerSort, string> = {
  recent: "c.created_at DESC, c.id",
  name: "c.name, c.id",
  spent: "COALESCE(a.spent, 0) DESC, c.id",
  last: "COALESCE(a.last_at, '') DESC, c.id",
};

/** ค่าที่พิมพ์ในช่องค้นหาตรงกับเบอร์ อีเมล LINE หรือรหัสสมาชิกของใครบ้าง — ใช้ index ไม่ถอดรหัส */
async function idsByContact(tenantId: string, q: string): Promise<string[]> {
  const kinds: ContactKind[] = q.includes("@")
    ? ["email", "line"]
    : /\d{6,}/.test(q.replace(/[\s-]/g, ""))
      ? ["phone", "member_no"]
      : ["line", "member_no"];
  const found = await Promise.all(kinds.map((k) => findCustomersByContact(tenantId, k, q)));
  return [...new Set(found.flat())];
}

export async function searchCustomers(
  tenantId: string,
  opts: { q?: string; filter?: CustomerFilter; sort?: CustomerSort; page?: number },
): Promise<{ rows: CustomerRow[]; total: number; page: number; pages: number }> {
  const q = (opts.q ?? "").trim();
  const filter = opts.filter && FILTER_SQL[opts.filter] != null ? opts.filter : "all";
  const sort = opts.sort && SORT_SQL[opts.sort] ? opts.sort : "last";

  const params: Param[] = [tenantId, tenantId];
  let where = "";
  if (q) {
    /* ชื่อค้นได้ทุกส่วนของคำ ("สุข" เจอ "ธนาสุข") ส่วนเบอร์ อีเมล และรหัสต้องตรงทั้งค่า
       เพราะเก็บแบบเข้ารหัส — จับคู่ได้ด้วยกุญแจ แต่ค้นกลางคำไม่ได้โดยการออกแบบ */
    const ids = await idsByContact(tenantId, q);
    const like = `%${q.toLowerCase().replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    where = `AND (LOWER(c.name) LIKE ? ESCAPE '\\' OR c.id = ?${ids.length ? ` OR c.id IN (${ids.map(() => "?").join(",")})` : ""})`;
    params.push(like, q, ...ids);
  }

  const from = `FROM customers c
    LEFT JOIN (
      SELECT customer_id, COUNT(*) AS orders, SUM(total) AS spent, MAX(occurred_at) AS last_at
      FROM transactions WHERE tenant_id = ? GROUP BY customer_id
    ) a ON a.customer_id = c.id
    WHERE c.tenant_id = ? ${where} ${FILTER_SQL[filter]}`;

  const total = Number((await get<{ n: number | string }>(`SELECT COUNT(*) AS n ${from}`, ...params))?.n ?? 0);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(opts.page ?? 1)), pages);

  const raw = await all<{
    id: string; name: string; created_at: string;
    orders: number | string | null; spent: number | string | null; last_at: string | null;
  }>(
    `SELECT c.id, c.name, c.created_at, a.orders, a.spent, a.last_at ${from}
     ORDER BY ${SORT_SQL[sort]} LIMIT ? OFFSET ?`,
    ...params,
    PAGE_SIZE,
    (page - 1) * PAGE_SIZE,
  );

  /* ช่องทางและความยินยอมของคนในหน้านี้เท่านั้น — 50 คน ไม่ใช่ทั้งฐาน */
  const ids = raw.map((r) => r.id);
  const marks = ids.map(() => "?").join(",");
  const [kindRows, consentRows] = ids.length
    ? await Promise.all([
        all<{ customer_id: string; kind: string }>(
          `SELECT DISTINCT customer_id, kind FROM contact_points
           WHERE tenant_id = ? AND customer_id IN (${marks})`,
          tenantId, ...ids,
        ),
        all<{ customer_id: string }>(
          `SELECT customer_id FROM consents WHERE tenant_id = ? AND purpose = 'marketing'
           AND granted_at IS NOT NULL AND revoked_at IS NULL AND customer_id IN (${marks})`,
          tenantId, ...ids,
        ),
      ])
    : [[], []];
  const kinds = new Map<string, string[]>();
  for (const k of kindRows) kinds.set(k.customer_id, [...(kinds.get(k.customer_id) ?? []), k.kind]);
  const consented = new Set(consentRows.map((r) => r.customer_id));

  return {
    rows: raw.map((r) => ({
      id: r.id,
      name: r.name,
      createdAt: r.created_at,
      orders: Number(r.orders ?? 0),
      spent: Number(r.spent ?? 0),
      lastAt: r.last_at,
      kinds: kinds.get(r.id) ?? [],
      consent: consented.has(r.id),
    })),
    total,
    page,
    pages,
  };
}

/* ── หน้าของลูกค้าหนึ่งคน ─────────────────────────────────────── */

export const PROFILE_FIELDS = [
  "first_name", "last_name", "nickname", "gender", "birthday", "company", "job_title",
  "subdistrict", "district", "province", "postcode", "note",
] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number];
export type Profile = Record<ProfileField, string | null>;

export type TimelineItem =
  | { kind: "purchase"; at: string; total: number; discount: number; channel: string; items: string[] }
  | { kind: "message"; at: string; play: string; campaignId: string; status: string }
  | { kind: "holdout"; at: string; play: string; campaignId: string }
  | { kind: "event"; at: string; type: string; meta: string | null }
  | { kind: "consent"; at: string; granted: boolean; source: string }
  | { kind: "created"; at: string };

export type CustomerRecord = {
  id: string;
  name: string;
  createdAt: string;
  profile: Profile | null;
  contacts: ContactPoint[];
  consent: { granted: boolean; at: string | null; source: string | null };
  membership: { kind: string; startedAt: string; expiresAt: string | null } | null;
  stats: {
    orders: number;
    spent: number;
    avgOrder: number;
    firstAt: string | null;
    lastAt: string | null;
    /** รอบซื้อของคนนี้เอง (วัน) — null ถ้าซื้อไม่ถึงสองครั้ง */
    cycleDays: number | null;
    /** รอบที่ระบบคำนวณไว้ล่วงหน้า (รวมกรณีซื้อครั้งเดียวที่ใช้ค่ากลางของกลุ่ม) */
    modelCycleDays: number | null;
    cycleEstimated: boolean;
  };
  timeline: TimelineItem[];
};

export async function getCustomer(tenantId: string, id: string): Promise<CustomerRecord | null> {
  const c = await get<{ id: string; name: string; created_at: string }>(
    "SELECT id, name, created_at FROM customers WHERE tenant_id = ? AND id = ?",
    tenantId, id,
  );
  if (!c) return null;

  const [profile, contacts, consent, membership, txns, msgs, holdouts, events, feature] = await Promise.all([
    get<Profile>(
      `SELECT ${PROFILE_FIELDS.join(", ")} FROM contact_profiles WHERE tenant_id = ? AND customer_id = ?`,
      tenantId, id,
    ),
    listContactPoints(tenantId, id),
    get<{ granted_at: string | null; revoked_at: string | null; source: string }>(
      "SELECT granted_at, revoked_at, source FROM consents WHERE tenant_id = ? AND customer_id = ? AND purpose = 'marketing'",
      tenantId, id,
    ),
    get<{ kind: string; started_at: string; expires_at: string | null }>(
      "SELECT kind, started_at, expires_at FROM memberships WHERE tenant_id = ? AND customer_id = ? ORDER BY started_at DESC LIMIT 1",
      tenantId, id,
    ),
    all<{ id: string; occurred_at: string; total: number | string; discount_total: number | string; channel: string }>(
      `SELECT id, occurred_at, total, discount_total, channel FROM transactions
       WHERE tenant_id = ? AND customer_id = ? ORDER BY occurred_at DESC`,
      tenantId, id,
    ),
    all<{ campaign_id: string; status: string; sent_at: string | null; play_id: string }>(
      `SELECT m.campaign_id, m.status, m.sent_at, k.play_id FROM messages m
       JOIN campaigns k ON k.id = m.campaign_id
       WHERE m.tenant_id = ? AND m.customer_id = ?`,
      tenantId, id,
    ),
    all<{ campaign_id: string; approved_at: string; play_id: string }>(
      `SELECT a.campaign_id, k.approved_at, k.play_id FROM campaign_audience a
       JOIN campaigns k ON k.id = a.campaign_id
       WHERE a.tenant_id = ? AND a.customer_id = ? AND a.arm = 'holdout' AND k.dry_run = 0`,
      tenantId, id,
    ),
    all<{ type: string; occurred_at: string; meta: string | null }>(
      `SELECT type, occurred_at, meta FROM events WHERE tenant_id = ? AND customer_id = ?
       ORDER BY occurred_at DESC LIMIT 60`,
      tenantId, id,
    ),
    get<{ payload: string }>(
      "SELECT payload FROM customer_features WHERE tenant_id = ? AND customer_id = ?",
      tenantId, id,
    ),
  ]);

  /* ของที่ซื้อในแต่ละบิล — สามรายการแรกพอให้รู้ว่าเขาซื้ออะไร ไม่ใช่ใบเสร็จเต็ม */
  const items = new Map<string, string[]>();
  const recent = txns.slice(0, 40);
  if (recent.length) {
    const rows = await all<{ txn_id: string; name: string | null; qty: number }>(
      `SELECT li.txn_id, p.name, li.qty FROM line_items li
       LEFT JOIN products p ON p.id = li.product_id
       WHERE li.tenant_id = ? AND li.txn_id IN (${recent.map(() => "?").join(",")})`,
      tenantId, ...recent.map((t) => t.id),
    );
    for (const r of rows) {
      const label = `${r.name ?? "สินค้า"}${r.qty > 1 ? ` ×${r.qty}` : ""}`;
      items.set(r.txn_id, [...(items.get(r.txn_id) ?? []), label]);
    }
  }

  const playName = (pid: string) => playById(pid)?.name ?? pid;
  const timeline: TimelineItem[] = [
    ...txns.map((t): TimelineItem => ({
      kind: "purchase", at: t.occurred_at, total: Number(t.total), discount: Number(t.discount_total),
      channel: t.channel, items: (items.get(t.id) ?? []).slice(0, 3),
    })),
    ...msgs.filter((m) => m.sent_at).map((m): TimelineItem => ({
      kind: "message", at: m.sent_at!, play: playName(m.play_id), campaignId: m.campaign_id, status: m.status,
    })),
    ...holdouts.map((h): TimelineItem => ({
      kind: "holdout", at: h.approved_at, play: playName(h.play_id), campaignId: h.campaign_id,
    })),
    ...events.map((e): TimelineItem => ({ kind: "event", at: e.occurred_at, type: e.type, meta: e.meta })),
    ...(consent?.granted_at ? [{ kind: "consent", at: consent.granted_at, granted: true, source: consent.source } as TimelineItem] : []),
    ...(consent?.revoked_at ? [{ kind: "consent", at: consent.revoked_at, granted: false, source: consent.source } as TimelineItem] : []),
    { kind: "created", at: c.created_at } as TimelineItem,
  ].sort((a, b) => b.at.localeCompare(a.at));

  const spent = txns.reduce((s, t) => s + Number(t.total), 0);
  const firstAt = txns.length ? txns[txns.length - 1].occurred_at : null;
  const lastAt = txns.length ? txns[0].occurred_at : null;
  const cycleDays =
    txns.length >= 2
      ? Math.round((Date.parse(lastAt!) - Date.parse(firstAt!)) / 86400000 / (txns.length - 1))
      : null;
  const f = feature ? (JSON.parse(feature.payload) as { personal_cycle_days?: number; cycle_is_estimated?: boolean }) : null;

  return {
    id: c.id,
    name: c.name,
    createdAt: c.created_at,
    profile: profile ?? null,
    contacts,
    consent: {
      granted: Boolean(consent?.granted_at && !consent.revoked_at),
      at: consent?.revoked_at ?? consent?.granted_at ?? null,
      source: consent?.source ?? null,
    },
    membership: membership
      ? { kind: membership.kind, startedAt: membership.started_at, expiresAt: membership.expires_at }
      : null,
    stats: {
      orders: txns.length,
      spent,
      avgOrder: txns.length ? spent / txns.length : 0,
      firstAt,
      lastAt,
      cycleDays,
      modelCycleDays: f?.personal_cycle_days != null ? Math.round(f.personal_cycle_days) : null,
      cycleEstimated: Boolean(f?.cycle_is_estimated),
    },
    timeline,
  };
}

/* ── เพิ่ม · แก้ · ลบ ──────────────────────────────────────────── */

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; existingId?: string };

const clean = (v: unknown) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s.slice(0, 500) : null;
};

function profileValues(input: Partial<Record<ProfileField, unknown>>): Profile {
  const p = Object.fromEntries(PROFILE_FIELDS.map((f) => [f, clean(input[f])])) as Profile;
  if (p.birthday && !/^\d{4}-\d{2}-\d{2}$/.test(p.birthday)) p.birthday = null;
  if (p.gender && !["male", "female", "other"].includes(p.gender)) p.gender = null;
  if (p.note) p.note = p.note.slice(0, 2000);
  return p;
}

async function upsertProfile(q: Sql, tenantId: string, customerId: string, p: Profile) {
  const cols = PROFILE_FIELDS as readonly string[];
  await q.run(
    `INSERT INTO contact_profiles (customer_id, tenant_id, ${cols.join(", ")}, updated_at)
     VALUES (?, ?, ${cols.map(() => "?").join(", ")}, ?)
     ON CONFLICT (customer_id) DO UPDATE SET ${cols.map((c) => `${c} = excluded.${c}`).join(", ")},
       updated_at = excluded.updated_at`,
    customerId, tenantId, ...PROFILE_FIELDS.map((f) => p[f]), new Date().toISOString(),
  );
}

function displayName(name: string | null, p: Profile): string {
  return name || [p.first_name, p.last_name].filter(Boolean).join(" ") || p.nickname || "ลูกค้าไม่ระบุชื่อ";
}

export type NewCustomerInput = {
  name?: string;
  contacts: { kind: string; value: string }[];
  profile: Partial<Record<ProfileField, unknown>>;
  consent: boolean;
};

export async function createCustomer(
  tenantId: string,
  input: NewCustomerInput,
  actor: string,
): Promise<Result<{ id: string }>> {
  if (!contactStorageReady()) {
    return { ok: false, error: "ยังเก็บข้อมูลติดต่อไม่ได้ — ระบบยังไม่ได้ตั้งกุญแจเข้ารหัส" };
  }

  const contacts: { kind: ContactKind; value: string }[] = [];
  for (const c of input.contacts) {
    if (!c.value.trim()) continue;
    if (!(CONTACT_KINDS as readonly string[]).includes(c.kind)) continue;
    const kind = c.kind as ContactKind;
    const value = normaliseContact(kind, c.value);
    if (!value) return { ok: false, error: `${c.value} ไม่ใช่${kind === "email" ? "อีเมล" : kind === "phone" ? "เบอร์โทร" : "ค่า"}ที่ใช้ได้` };
    if (!contacts.some((x) => x.kind === kind && x.value === value)) contacts.push({ kind, value });
  }

  /* ID มาจากตัวระบุตัวแรกตามลำดับเดียวกับการนำเข้า — ไฟล์ที่นำเข้าทีหลัง
     ที่มีเบอร์นี้จึงเติมประวัติให้คนเดิม ไม่ใช่สร้างคนซ้ำ */
  const ident = IDENTITY_KINDS.map((k) => contacts.find((c) => c.kind === k)).find(Boolean);
  if (!ident) {
    return { ok: false, error: "ใส่อย่างน้อยหนึ่งอย่าง: เบอร์โทร อีเมล LINE หรือรหัสสมาชิก — ระบบใช้ค่านี้รู้ว่าเป็นคนเดียวกันตอนนำเข้าไฟล์ครั้งถัดไป" };
  }
  const id = customerIdFor(tenantId, ident.kind, ident.value);

  const existing = await get<{ name: string }>(
    "SELECT name FROM customers WHERE tenant_id = ? AND id = ?", tenantId, id,
  );
  if (existing) return { ok: false, error: `มีลูกค้าคนนี้อยู่แล้ว: ${existing.name}`, existingId: id };

  for (const c of contacts) {
    if (c.kind !== "phone" && c.kind !== "email" && c.kind !== "member_no") continue;
    const owners = await findCustomersByContact(tenantId, c.kind, c.value);
    if (owners.length) {
      const o = await get<{ name: string }>("SELECT name FROM customers WHERE tenant_id = ? AND id = ?", tenantId, owners[0]);
      return {
        ok: false,
        error: `${c.kind === "email" ? "อีเมล" : c.kind === "phone" ? "เบอร์" : "รหัสสมาชิก"}นี้เป็นของ ${o?.name ?? "ลูกค้าอีกคน"} อยู่แล้ว — เปิดหน้าของเขาแล้วเพิ่มข้อมูลที่นั่นแทน`,
        existingId: owners[0],
      };
    }
  }

  const profile = profileValues(input.profile);
  const name = displayName(clean(input.name), profile);
  const now = new Date().toISOString();
  await tx(async (q) => {
    await q.run("INSERT INTO customers (id, tenant_id, name, created_at) VALUES (?, ?, ?, ?)", id, tenantId, name, now);
    await insertMany(
      q, "contact_points", CONTACT_POINT_COLUMNS,
      contacts.map((c, i) => contactPointRow(tenantId, id, c.kind, c.value, null,
        contacts.findIndex((x) => x.kind === c.kind) === i, "manual")),
      { onConflict: "ON CONFLICT DO NOTHING" },
    );
    if (Object.values(profile).some((v) => v != null)) await upsertProfile(q, tenantId, id, profile);
    /* ติ๊กยินยอมได้เฉพาะเมื่อลูกค้าให้ความยินยอมกับร้านจริง — ค่าตั้งต้นคือไม่ยินยอม
       เหมือนการนำเข้าไฟล์ เพราะการมีเบอร์ไม่ใช่การได้รับอนุญาตให้ส่ง */
    await q.run(
      "INSERT INTO consents (tenant_id, customer_id, purpose, granted_at, revoked_at, source) VALUES (?, ?, 'marketing', ?, NULL, 'manual')",
      tenantId, id, input.consent ? now : null,
    );
  });
  await logActivity(tenantId, actor, "create_customer", id);
  return { ok: true, id };
}

export async function updateCustomer(
  tenantId: string,
  id: string,
  input: { name?: string; profile: Partial<Record<ProfileField, unknown>> },
  actor: string,
): Promise<Result> {
  const profile = profileValues(input.profile);
  const name = displayName(clean(input.name), profile);
  const changed = await tx(async (q) => {
    const r = await q.run("UPDATE customers SET name = ? WHERE tenant_id = ? AND id = ?", name, tenantId, id);
    if (!r.changes) return false;
    await upsertProfile(q, tenantId, id, profile);
    return true;
  });
  if (!changed) return { ok: false, error: "ไม่พบลูกค้าคนนี้ในบัญชีนี้" };
  await logActivity(tenantId, actor, "update_customer", id);
  return { ok: true };
}

export async function addContact(
  tenantId: string,
  id: string,
  kindRaw: string,
  raw: string,
  label: string | null,
  actor: string,
): Promise<Result<{ sharedWith: number }>> {
  if (!contactStorageReady()) return { ok: false, error: "ยังเก็บข้อมูลติดต่อไม่ได้ — ระบบยังไม่ได้ตั้งกุญแจเข้ารหัส" };
  if (!(CONTACT_KINDS as readonly string[]).includes(kindRaw)) return { ok: false, error: "ไม่รู้จักช่องทางนี้" };
  const kind = kindRaw as ContactKind;
  const value = normaliseContact(kind, raw);
  if (!value) return { ok: false, error: "รูปแบบไม่ถูกต้อง — ลองพิมพ์ใหม่" };
  const owner = await get<{ id: string }>("SELECT id FROM customers WHERE tenant_id = ? AND id = ?", tenantId, id);
  if (!owner) return { ok: false, error: "ไม่พบลูกค้าคนนี้ในบัญชีนี้" };

  const others = (await findCustomersByContact(tenantId, kind, value)).filter((x) => x !== id);
  const hasPrimary = await get<{ x: number }>(
    "SELECT 1 AS x FROM contact_points WHERE tenant_id = ? AND customer_id = ? AND kind = ? AND is_primary = 1",
    tenantId, id, kind,
  );
  const n = await tx((q) =>
    insertMany(q, "contact_points", CONTACT_POINT_COLUMNS,
      [contactPointRow(tenantId, id, kind, value, clean(label), !hasPrimary, "manual")],
      { onConflict: "ON CONFLICT DO NOTHING" }),
  );
  if (!n) return { ok: false, error: "มีค่านี้อยู่แล้ว" };
  await logActivity(tenantId, actor, "add_contact", `${kind} · ${id}`);
  /* คนในบ้านเดียวกันใช้เบอร์บ้านร่วมกันได้ จึงไม่ห้าม แต่บอกให้รู้ */
  return { ok: true, sharedWith: others.length };
}

export async function removeContact(tenantId: string, pointId: string, actor: string): Promise<Result> {
  const row = await get<{ customer_id: string; kind: string; is_primary: number }>(
    "SELECT customer_id, kind, is_primary FROM contact_points WHERE tenant_id = ? AND id = ?",
    tenantId, pointId,
  );
  if (!row) return { ok: false, error: "ไม่พบช่องทางนี้" };
  await tx(async (q) => {
    await q.run("DELETE FROM contact_points WHERE tenant_id = ? AND id = ?", tenantId, pointId);
    /* ลบตัวหลักไปแล้ว ให้ตัวที่เหลือของชนิดเดียวกันขึ้นมาแทน ไม่ปล่อยให้ไม่มีตัวหลัก */
    if (row.is_primary) {
      const next = await q.get<{ id: string }>(
        "SELECT id FROM contact_points WHERE tenant_id = ? AND customer_id = ? AND kind = ? ORDER BY created_at LIMIT 1",
        tenantId, row.customer_id, row.kind,
      );
      if (next) await q.run("UPDATE contact_points SET is_primary = 1 WHERE tenant_id = ? AND id = ?", tenantId, next.id);
    }
  });
  await logActivity(tenantId, actor, "remove_contact", `${row.kind} · ${row.customer_id}`);
  return { ok: true };
}

export async function setConsent(tenantId: string, id: string, granted: boolean, actor: string): Promise<Result> {
  const owner = await get<{ id: string }>("SELECT id FROM customers WHERE tenant_id = ? AND id = ?", tenantId, id);
  if (!owner) return { ok: false, error: "ไม่พบลูกค้าคนนี้ในบัญชีนี้" };
  const now = new Date().toISOString();
  /* ถอน = เก็บวันที่ถอนไว้ ไม่ลบแถว เพราะต้องพิสูจน์ได้ว่าหยุดส่งตั้งแต่เมื่อไร */
  await tx((q) =>
    q.run(
      `INSERT INTO consents (tenant_id, customer_id, purpose, granted_at, revoked_at, source)
       VALUES (?, ?, 'marketing', ?, ?, 'manual')
       ON CONFLICT (customer_id, purpose) DO UPDATE SET
         granted_at = ${granted ? "excluded.granted_at" : "consents.granted_at"},
         revoked_at = excluded.revoked_at, source = excluded.source`,
      tenantId, id, granted ? now : null, granted ? null : now,
    ),
  );
  await logActivity(tenantId, actor, granted ? "grant_consent" : "revoke_consent", id);
  return { ok: true };
}

/* ── ลบคนหนึ่งคนออกทั้งหมด (สิทธิ์ขอให้ลบตาม PDPA) ──

   ลูกก่อนแม่ เพราะ Postgres บังคับ foreign key ทันที — ลำดับเดียวกับ
   wipeCustomerData แต่จำกัดที่คนเดียว ผลการวัดของแคมเปญที่สรุปไปแล้ว
   (attributions) เป็นตัวเลขรวมของกลุ่ม ไม่มีตัวคนอยู่ข้างใน จึงไม่ต้องแตะ
   activity_log เก็บแค่รหัส ไม่มีชื่อหรือเบอร์ — หลังลบแล้วสืบกลับเป็นตัวคนไม่ได้ */
export async function deleteCustomer(tenantId: string, id: string, actor: string): Promise<Result<{ name: string }>> {
  const c = await get<{ name: string }>("SELECT name FROM customers WHERE tenant_id = ? AND id = ?", tenantId, id);
  if (!c) return { ok: false, error: "ไม่พบลูกค้าคนนี้ในบัญชีนี้" };
  await tx(async (q) => {
    await q.run(
      "DELETE FROM line_items WHERE tenant_id = ? AND txn_id IN (SELECT id FROM transactions WHERE tenant_id = ? AND customer_id = ?)",
      tenantId, tenantId, id,
    );
    for (const t of [
      "transactions", "events", "consents", "memberships", "contact_points", "contact_profiles",
      "customer_features", "campaign_audience", "messages",
    ]) {
      await q.run(`DELETE FROM ${t} WHERE tenant_id = ? AND customer_id = ?`, tenantId, id);
    }
    await q.run("DELETE FROM customers WHERE tenant_id = ? AND id = ?", tenantId, id);
  });
  await logActivity(tenantId, actor, "delete_customer", id);
  return { ok: true, name: c.name };
}
