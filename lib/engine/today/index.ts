import { all, get, run } from "@/lib/engine/sql";
import { MASKED_ORG, MASKED_PERSON, type Viewer } from "@/lib/engine/accounts";
import { targetDecision } from "@/lib/engine/campaigns";
import { loadPathGraph } from "@/lib/engine/accounts/paths";
import { jobMoves } from "@/lib/engine/today/moves";
import { retentionForPeople } from "@/lib/engine/retention";
import { listRequests } from "@/lib/engine/dsar";
import { DSAR_KIND_TH } from "@/lib/shared/dsar";
import { SIGNAL_TH } from "@/lib/engine/vault/review";
import { canSee } from "@/lib/shared/accounts";
import { bangkokDay, thaiDate } from "@/lib/shared/format";
import { CHANNEL_TH, type Channel } from "@/lib/shared/policy";
import {
  MAX_SNOOZES, QUEUE_SECTION_CAP, QUEUE_SECTIONS, QUIET_DAYS,
  type QueueItem, type QueueItemKind, type QueueSection, type TodayQueue,
} from "@/lib/shared/today";
import { PREFERENCE_TH, type Classification, type PreferenceKind } from "@/lib/shared/vault";

/* ── หน้า "วันนี้" (docs/solo-plan.md S1) ─────────────────────────────

   คิวเดียวแทนการเดินห้าหน้า: ต้องหยุด → ครบกำหนด → เลยกำหนด → คนที่รู้จักย้ายบริษัท → รอตรวจที่กระทบงาน → บัญชีที่เงียบ
   - อ่านอย่างเดียวจากตารางเดิม + queue_marks (การเลื่อน/รับทราบของผู้ใช้แต่ละคน)
   - ลำดับเป็นหมวดตายตัว ภายในหมวดเรียงตามเวลาแล้วตามรหัส — รันซ้ำได้ลำดับเดิม ไม่มีคะแนน
   - รายการติดต่อตรวจนโยบายซ้ำตอนแสดง (ไม่เชื่อสถานะตอนสร้างรายชื่อ) และไม่เขียนผลกลับ — หน้าจอไม่ใช่ที่เปลี่ยนข้อมูล
   - บริษัทที่ระดับความลับเกินสิทธิ์และผู้อ่านไม่ได้เป็นเจ้าของ ไม่ขึ้นเป็นรายการเลย (ไม่เผยชื่อหรือจำนวน)
     งานของผู้อ่านเองที่ชี้ไปบริษัท/คนที่เกินสิทธิ์ ยังขึ้น แต่ชื่อถูกแทนด้วยป้ายปิดบัง */

const FINAL = ["won", "lost", "not_interested", "cancelled"];
const STOP_KINDS: PreferenceKind[] = ["withdrawal", "objection", "restriction"];
const STOP_WINDOW_DAYS = 7;
const inList = (n: number) => Array.from({ length: n }, () => "?").join(",");
const cls = (c: string | null | undefined) => (c ?? "confidential") as Classification;

type Mark = { mark: "snooze" | "ack"; until: string | null; count: number };
const keyOf = (kind: QueueItemKind, id: string) => `${kind}:${id}`;

async function marksFor(tenantId: string, userId: string): Promise<Map<string, Mark>> {
  const rows = await all<{ item_kind: QueueItemKind; item_id: string; mark: Mark["mark"]; until: string | null; count: number | string }>(
    "SELECT item_kind, item_id, mark, until, count FROM queue_marks WHERE tenant_id = ? AND user_id = ?", tenantId, userId);
  return new Map(rows.map((r) => [keyOf(r.item_kind, r.item_id), { mark: r.mark, until: r.until, count: Number(r.count) }]));
}

const hidden = (m: Mark | undefined, today: string) =>
  m ? m.mark === "ack" || (m.mark === "snooze" && m.until != null && m.until > today) : false;

export async function todayQueue(tenantId: string, viewer: Viewer, now = new Date()): Promise<TodayQueue> {
  const today = bangkokDay(now);
  const dayAfter = bangkokDay(+now + 2 * 864e5);
  const marks = await marksFor(tenantId, viewer.id);
  const items: QueueItem[] = [];
  const keep = (it: Omit<QueueItem, "snoozes">) => {
    const m = marks.get(keyOf(it.kind, it.id));
    if (!hidden(m, today)) items.push({ ...it, snoozes: m?.mark === "snooze" ? m.count : 0 });
  };
  const seeOrg = (o: { classification: string | null; account_owner_id: string | null; data_owner_id: string | null }) =>
    canSee(viewer.clearance, cls(o.classification)) || [o.account_owner_id, o.data_owner_id].includes(viewer.id);

  /* ── 1 · ต้องหยุด ── ถอน · คัดค้าน · ขอจำกัด ใน 7 วัน — recordPreference ยกเลิกงานค้างให้แล้ว
     หมวดนี้มีไว้ให้รู้ว่าอะไรถูกหยุด ไม่ใช่ให้ตัดสินใจซ้ำ → เลื่อนไม่ได้ รับทราบได้ */
  const since = new Date(+now - STOP_WINDOW_DAYS * 864e5).toISOString();
  const stops = await all<{ id: string; customer_id: string; kind: PreferenceKind; channel: string; recorded_at: string;
    purpose: string | null; name: string; classification: string | null }>(
    `SELECT f.id, f.customer_id, f.kind, f.channel, f.recorded_at, p.name AS purpose, c.name, c.classification
     FROM preferences f JOIN customers c ON c.id = f.customer_id AND c.tenant_id = f.tenant_id
     LEFT JOIN purposes p ON p.id = f.purpose_id AND p.tenant_id = f.tenant_id
     WHERE f.tenant_id = ? AND f.kind IN (${inList(STOP_KINDS.length)}) AND f.recorded_at >= ?
     ORDER BY f.recorded_at DESC, f.id`, tenantId, ...STOP_KINDS, since);
  for (const s of stops) {
    const cancelled = await get<{ n: number | string }>(
      "SELECT COUNT(*) AS n FROM campaign_targets WHERE tenant_id = ? AND customer_id = ? AND status = 'cancelled' AND updated_at >= ?",
      tenantId, s.customer_id, s.recorded_at);
    const n = Number(cancelled?.n ?? 0);
    const visible = canSee(viewer.clearance, cls(s.classification));
    keep({
      section: "stop", kind: "preference", id: s.id,
      title: `${PREFERENCE_TH[s.kind]} · ${visible ? s.name : MASKED_PERSON}`,
      detail: [
        s.purpose ? `วัตถุประสงค์ “${s.purpose}”` : "ทุกวัตถุประสงค์",
        s.channel === "any" ? "ทุกช่องทาง" : `ช่องทาง${CHANNEL_TH[s.channel as Channel] ?? s.channel}`,
        n ? `ยกเลิกเป้าหมายในแคมเปญแล้ว ${n} รายการ` : "ไม่มีเป้าหมายในแคมเปญที่ต้องยกเลิก",
        `บันทึก ${thaiDate(s.recorded_at)}`,
      ],
      href: visible ? `/app/customers/${s.customer_id}` : null,
      at: s.recorded_at, eligibility: null, snoozable: false, ackable: true,
    });
  }

  /* ── คำขอสิทธิที่เปิดอยู่ (B6) ── ทุกคำขอที่ยังไม่ปิด ใกล้ครบกำหนดก่อน · เลื่อน/รับทราบไม่ได้ (กำหนดตามกฎหมาย ไม่ใช่ของผู้ใช้)
     ชื่อผู้ขอไม่ขึ้นในคิว — คิวไม่ใช่ที่รวมว่าใครใช้สิทธิอะไร (หน้าคำขอแสดงเมื่อเปิดดู) */
  for (const r of await listRequests(tenantId, now)) {
    if (r.status !== "open") continue;
    items.push({
      section: "requests", kind: "dsar", id: r.id,
      title: `${r.ref} · ${DSAR_KIND_TH[r.kind]} · ${r.daysLeft < 0 ? `เลยกำหนด ${-r.daysLeft} วัน` : r.daysLeft === 0 ? "ครบกำหนดวันนี้" : `เหลือ ${r.daysLeft} วัน`}`,
      detail: [
        `รับเมื่อ ${thaiDate(r.receivedAt)} · ครบกำหนด ${thaiDate(r.dueAt)}`,
        r.verifiedAt ? "ยืนยันตัวตนแล้ว" : "ยังไม่ยืนยันตัวตน",
        r.subjectId ? "" : "ไม่พบข้อมูลของผู้ขอในระบบ — ตอบผู้ขอว่าไม่มีข้อมูล",
      ].filter(Boolean),
      href: `/app/requests/${r.id}`, at: r.dueAt, eligibility: null, snoozable: false, ackable: false, snoozes: 0,
    });
  }

  /* ── 2–3 · งานที่ครบกำหนดและเลยกำหนด ── ของผู้อ่าน + งานที่ยังไม่มีผู้รับผิดชอบ */
  const tasks = await all<{ id: string; title: string; due_at: string; owner_id: string | null; org_id: string | null; customer_id: string | null;
    campaign_id: string | null; org: string | null; oc: string | null; o_owner: string | null; o_data: string | null;
    person: string | null; pc: string | null }>(
    `SELECT k.id, k.title, k.due_at, k.owner_id, k.org_id, k.customer_id, k.campaign_id,
       o.name AS org, o.classification AS oc, o.account_owner_id AS o_owner, o.data_owner_id AS o_data,
       c.name AS person, c.classification AS pc
     FROM tasks k LEFT JOIN orgs o ON o.id = k.org_id AND o.tenant_id = k.tenant_id
     LEFT JOIN customers c ON c.id = k.customer_id AND c.tenant_id = k.tenant_id
     WHERE k.tenant_id = ? AND k.status = 'open' AND k.due_at IS NOT NULL AND k.due_at < ?
       AND (k.owner_id = ? OR k.owner_id IS NULL OR k.owner_id = '')
     ORDER BY k.due_at, k.id`, tenantId, dayAfter, viewer.id);
  for (const k of tasks) {
    const day = k.due_at.slice(0, 10);
    const section: QueueSection = day < today ? "overdue" : "due";
    const personHidden = k.customer_id != null && !canSee(viewer.clearance, cls(k.pc));
    const orgHidden = k.org_id != null && !seeOrg({ classification: k.oc, account_owner_id: k.o_owner, data_owner_id: k.o_data });
    let title = k.title;
    /* ชื่องานถูกสร้างจากชื่อคน ("ติดต่อ … — แคมเปญ") — ต้องไม่ใช่ทางรั่วของชื่อที่ถูกปิดบัง */
    if (personHidden && k.person) title = title.split(k.person).join(MASKED_PERSON);
    let eligibility: QueueItem["eligibility"] = null;
    if (k.campaign_id && k.customer_id) {
      const d = await targetDecision(tenantId, k.campaign_id, k.customer_id);
      eligibility = d
        ? { status: d.failed ? "review_required" : d.status, reasons: d.failed ? ["บริการนโยบายใช้ไม่ได้ตอนนี้ — อย่าเพิ่งติดต่อ"] : d.reasons }
        : null;
    }
    keep({
      section, kind: "task", id: k.id, title,
      detail: [
        section === "overdue" ? `เลยกำหนด ${thaiDate(k.due_at)}` : day === today ? "ครบกำหนดวันนี้" : "ครบกำหนดพรุ่งนี้",
        ...(k.org_id ? [orgHidden ? MASKED_ORG : (k.org ?? "")] : []),
        k.owner_id ? "งานของคุณ" : "ยังไม่มีผู้รับผิดชอบ",
      ].filter(Boolean),
      href: k.campaign_id ? `/app/sales/${k.campaign_id}` : k.org_id && !orgHidden ? `/app/accounts/${k.org_id}` : null,
      at: k.due_at, eligibility, snoozable: true, ackable: false,
    });
  }

  /* ── 4 · คนที่รู้จักย้ายบริษัท (S3) ── ไม่มีปุ่มติดต่อ: ย้ายบริษัทไม่ได้แปลว่าฐานการติดต่อย้ายตาม */
  const moves = await jobMoves(tenantId, viewer, await loadPathGraph(tenantId, viewer.clearance, now.toISOString()), now);
  const MOVE_TH = { moved_in: "เข้ามาอยู่ในบัญชีที่คุณกำลังขาย", moved_out: "ออกจากบริษัทที่มีโอกาสขายเปิดอยู่ — ใครแทน?", moved: "ย้ายบริษัท" } as const;
  for (const m of moves) {
    keep({
      section: "moved", kind: "affiliation", id: m.affiliationId,
      title: `${m.name}: ${m.from.name} → ${m.to.name}`,
      detail: [
        MOVE_TH[m.kind],
        m.since ? `เริ่มที่ใหม่ ${thaiDate(m.since)}` : "ไม่ทราบวันเริ่มที่ใหม่",
        ...m.why,
        "ตรวจฐานการติดต่อก่อน — ฐานเดิมอาจผูกกับบริษัทเก่า",
      ],
      href: m.kind === "moved_out" && !m.from.hidden ? `/app/accounts/${m.from.id}` : !m.to.hidden ? `/app/accounts/${m.to.id}` : null,
      at: m.since ?? "", eligibility: null, snoozable: true, ackable: true,
    });
  }

  /* ── 5 · รอตรวจที่กระทบงาน ── คนในเป้าหมายที่ยังไม่จบ หรือมีงานเปิด · องค์กรที่มีงาน/โอกาสเปิด
     ที่เหลือแสดงแค่จำนวน: คิวตรวจทั้งหมดคืองานของวันที่ว่าง ไม่ใช่ของทุกเช้า */
  const [busyPeople, busyOrgs, reviews] = await Promise.all([
    all<{ id: string }>(
      `SELECT customer_id AS id FROM campaign_targets WHERE tenant_id = ? AND status NOT IN (${inList(FINAL.length)})
       UNION SELECT customer_id AS id FROM tasks WHERE tenant_id = ? AND status = 'open' AND customer_id IS NOT NULL`,
      tenantId, ...FINAL, tenantId),
    all<{ id: string }>(
      `SELECT org_id AS id FROM campaign_targets WHERE tenant_id = ? AND status NOT IN (${inList(FINAL.length)}) AND org_id IS NOT NULL
       UNION SELECT org_id AS id FROM tasks WHERE tenant_id = ? AND status = 'open' AND org_id IS NOT NULL
       UNION SELECT org_id AS id FROM opportunities WHERE tenant_id = ? AND stage NOT IN ('won', 'lost')`,
      tenantId, ...FINAL, tenantId, tenantId),
    all<{ id: string; kind: string; subject_ids: string; signals: string; created_at: string }>(
      "SELECT id, kind, subject_ids, signals, created_at FROM review_items WHERE tenant_id = ? AND status = 'open' ORDER BY created_at, id", tenantId),
  ]);
  const people = new Set(busyPeople.map((r) => r.id));
  const orgs = new Set(busyOrgs.map((r) => r.id));
  let reviewsNotBlocking = 0;
  for (const r of reviews) {
    const ids = JSON.parse(r.subject_ids) as string[];
    const blocking = r.kind === "person_pair" ? ids.some((i) => people.has(i)) : ids.some((i) => orgs.has(i));
    if (!blocking) { reviewsNotBlocking++; continue; }
    /* คนไม่มีเจ้าของบัญชี — คอลัมน์เจ้าของเป็น null ทำให้ใช้กติกาเดียวกับองค์กรได้ (เห็นเมื่อระดับสิทธิ์ถึง) */
    const names = await all<{ id: string; name: string; classification: string | null; account_owner_id: string | null; data_owner_id: string | null }>(
      r.kind === "person_pair"
        ? `SELECT id, name, classification, NULL AS account_owner_id, NULL AS data_owner_id FROM customers WHERE tenant_id = ? AND id IN (${inList(ids.length)})`
        : `SELECT id, name, classification, account_owner_id, data_owner_id FROM orgs WHERE tenant_id = ? AND id IN (${inList(ids.length)})`,
      tenantId, ...ids);
    const masked = r.kind === "person_pair" ? MASKED_PERSON : MASKED_ORG;
    const ordered = ids.map((i) => names.find((n) => n.id === i)).filter((n): n is (typeof names)[number] => Boolean(n));
    const label = (n: (typeof names)[number]) => (seeOrg(n) ? n.name : masked);
    keep({
      section: "review", kind: "review", id: r.id,
      title: `${r.kind === "person_pair" ? "อาจเป็นคนเดียวกัน" : "อาจเป็นบริษัทเดียวกัน"}: ${ordered.map(label).join(" ↔ ")}`,
      detail: [
        ...(JSON.parse(r.signals) as string[]).map((s) => SIGNAL_TH[s] ?? s),
        r.kind === "person_pair" ? "มีคนนี้ในแคมเปญที่ยังเปิดหรือมีงานค้าง" : "บริษัทนี้มีงานหรือโอกาสขายเปิดอยู่",
      ],
      href: "/app/vault/review", at: r.created_at, eligibility: null, snoozable: true, ackable: false,
    });
  }

  /* ── 6 · ข้อมูลครบอายุ (B6) ── ระบบไม่ลบเอง: การลบย้อนไม่ได้ จึงให้คนตัดสินที่หน้าคน
     คนที่เกินสิทธิ์ยังขึ้น (ข้อมูลต้องถูกจัดการไม่ว่าใครเห็นได้) แต่ชื่อถูกปิดบังและไม่มีลิงก์ */
  const TRIGGER_TH: Record<string, string> = {
    last_interaction: "นับจากติดต่อล่าสุด", received: "นับจากวันที่ได้รับข้อมูล", last_participation: "นับจากร่วมงานล่าสุด",
    withdrawal: "นับจากวันที่ถอนความยินยอม", referred: "นับจากได้รับการแนะนำหรือคุยล่าสุด",
  };
  for (const r of await retentionForPeople(tenantId, viewer, now)) {
    if (r.status !== "due" && r.status !== "due_soon") continue;
    const last = r.purposes.find((x) => x.dueAt === r.dueAt) ?? r.purposes[0];
    keep({
      section: "expiring", kind: "customer", id: r.customerId,
      title: `${r.visible ? r.name : MASKED_PERSON} · ${r.status === "due" ? "ครบอายุแล้ว" : "จะครบอายุ"} ${thaiDate(r.dueAt)}`,
      detail: [
        ...r.purposes.map((x) => `${x.purpose}: เก็บ ${x.days} วัน ${TRIGGER_TH[x.trigger ?? ""] ?? ""} (${thaiDate(x.anchor)})`),
        r.purposes.length > 1 ? `ใช้วันที่ช้าที่สุดของทุกวัตถุประสงค์ (${last.purpose})` : "",
      ].filter(Boolean),
      href: r.visible ? `/app/customers/${r.customerId}` : null,
      at: r.dueAt ?? "", eligibility: null, snoozable: true, ackable: false,
    });
  }

  /* ── 7 · บัญชีที่เงียบ ── มีโอกาสเปิด แต่ไม่มีปฏิสัมพันธ์ ≥ QUIET_DAYS วัน (หรือไม่เคยมี) */
  const quietBefore = new Date(+now - QUIET_DAYS * 864e5).toISOString();
  const quiet = await all<{ id: string; name: string; classification: string | null; account_owner_id: string | null; data_owner_id: string | null;
    last_at: string | null; open_opps: number | string }>(
    `SELECT o.id, o.name, o.classification, o.account_owner_id, o.data_owner_id,
       (SELECT MAX(i.occurred_at) FROM interactions i WHERE i.tenant_id = o.tenant_id AND i.org_id = o.id) AS last_at,
       (SELECT COUNT(*) FROM opportunities p WHERE p.tenant_id = o.tenant_id AND p.org_id = o.id AND p.stage NOT IN ('won', 'lost')) AS open_opps
     FROM orgs o WHERE o.tenant_id = ?
       AND EXISTS (SELECT 1 FROM opportunities p WHERE p.tenant_id = o.tenant_id AND p.org_id = o.id AND p.stage NOT IN ('won', 'lost'))
     ORDER BY o.id`, tenantId);
  quiet
    .filter((o) => (o.last_at == null || o.last_at < quietBefore) && seeOrg(o))
    .sort((a, b) => (a.last_at ?? "").localeCompare(b.last_at ?? "") || a.id.localeCompare(b.id))
    .forEach((o) => keep({
      section: "quiet", kind: "org", id: o.id, title: o.name,
      detail: [
        `โอกาสขายเปิด ${Number(o.open_opps)} รายการ`,
        o.last_at ? `ปฏิสัมพันธ์ล่าสุด ${thaiDate(o.last_at)}` : "ยังไม่มีปฏิสัมพันธ์ที่บันทึก",
        o.account_owner_id ? `เจ้าของบัญชี ${o.account_owner_id}` : "ยังไม่มีเจ้าของบัญชี",
      ],
      href: `/app/accounts/${o.id}`, at: o.last_at ?? "", eligibility: null, snoozable: true, ackable: false,
    }));

  return {
    sections: QUEUE_SECTIONS.map((section) => {
      const all = items.filter((i) => i.section === section);
      const cap = QUEUE_SECTION_CAP[section];
      return { section, items: all.slice(0, cap), more: Math.max(0, all.length - cap) };
    }),
    reviewsNotBlocking,
    generatedAt: now.toISOString(),
  };
}

/* ── เลื่อน / รับทราบ ── ของผู้ใช้แต่ละคน · ไม่มีข้อความอิสระ (คิวไม่ควรเป็นที่เก็บข้อมูลส่วนบุคคลแห่งใหม่) */

async function itemExists(tenantId: string, kind: QueueItemKind, id: string) {
  const table = { preference: "preferences", task: "tasks", review: "review_items", org: "orgs", affiliation: "affiliations", customer: "customers", dsar: "dsar_requests" }[kind];
  if (!table) return false;
  return Boolean(await get(`SELECT 1 AS x FROM ${table} WHERE tenant_id = ? AND id = ?`, tenantId, id));
}

const KINDS: QueueItemKind[] = ["preference", "task", "review", "org", "affiliation", "customer"];
const ACKABLE: QueueItemKind[] = ["preference", "affiliation"];

export async function snoozeItem(
  tenantId: string, userId: string, kind: string, id: string, until: string, now = new Date(),
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!KINDS.includes(kind as QueueItemKind)) return { ok: false, error: "ไม่รู้จักรายการนี้" };
  const k = kind as QueueItemKind;
  if (k === "preference") return { ok: false, error: "รายการที่ต้องหยุดเลื่อนไม่ได้ — กดรับทราบแทน" };
  const today = bangkokDay(now);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(until) || until <= today) return { ok: false, error: "เลือกวันที่หลังวันนี้" };
  if (until > bangkokDay(+now + 30 * 864e5)) return { ok: false, error: "เลื่อนได้ไม่เกิน 30 วัน" };
  if (!(await itemExists(tenantId, k, id))) return { ok: false, error: "ไม่พบรายการนี้" };
  const prev = await get<{ count: number | string; mark: string }>(
    "SELECT count, mark FROM queue_marks WHERE tenant_id = ? AND user_id = ? AND item_kind = ? AND item_id = ?", tenantId, userId, k, id);
  const count = prev?.mark === "snooze" ? Number(prev.count) : 0;
  if (count >= MAX_SNOOZES) return { ok: false, error: `เลื่อนรายการนี้ครบ ${MAX_SNOOZES} ครั้งแล้ว — ทำ หรือยกเลิกงานนี้` };
  await run(
    `INSERT INTO queue_marks (tenant_id, user_id, item_kind, item_id, mark, until, count, updated_at) VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT (tenant_id, user_id, item_kind, item_id) DO UPDATE SET mark = excluded.mark, until = excluded.until, count = excluded.count, updated_at = excluded.updated_at`,
    tenantId, userId, k, id, "snooze", until, count + 1, now.toISOString());
  return { ok: true };
}

export async function acknowledgeItem(
  tenantId: string, userId: string, kind: string, id: string, now = new Date(),
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!ACKABLE.includes(kind as QueueItemKind)) return { ok: false, error: "รับทราบได้เฉพาะรายการที่ต้องหยุดและคนที่ย้ายบริษัท" };
  if (!(await itemExists(tenantId, kind as QueueItemKind, id))) return { ok: false, error: "ไม่พบรายการนี้" };
  await run(
    `INSERT INTO queue_marks (tenant_id, user_id, item_kind, item_id, mark, until, count, updated_at) VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT (tenant_id, user_id, item_kind, item_id) DO UPDATE SET mark = excluded.mark, until = excluded.until, updated_at = excluded.updated_at`,
    tenantId, userId, kind, id, "ack", null, 0, now.toISOString());
  return { ok: true };
}
