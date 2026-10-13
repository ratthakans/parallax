import { createHash } from "node:crypto";
import { all, insertMany, tx, type Param } from "@/lib/engine/sql";
import { logActivity } from "@/lib/engine/db";
import {
  CONTACT_POINT_COLUMNS, contactPointRow, customerIdFor, matchKey, normaliseContact, openRecord,
} from "@/lib/engine/pii";
import { detectDateOrder, normaliseDate } from "@/lib/engine/ingest";
import {
  compareNames, emailInfo, nameInfo, nameKey, orgInfo, type EmailInfo, type NameInfo,
} from "@/lib/shared/identity";
import type { VaultField } from "@/lib/shared/vault";

/* ── ตรวจตัวตน: แถวที่รอตรวจ → คน · องค์กร · สังกัด (docs/plan.md B3 · Blueprint 2.0 บท 3) ─────

   กติกาจาก Blueprint: "ชื่อเหมือนกัน อีเมลโดเมนเดียวกัน หรือเข้าร่วมงานเดียวกัน เป็นสัญญาณให้ตรวจ
   ไม่ใช่เหตุผลรวมคนอัตโนมัติ อีเมลกลางอาจเป็นของหลายคน อีเมลบริษัทอาจถูกนำไปใช้ใหม่
   และบริษัทในเครือต้องไม่ถูกรวมเป็นนิติบุคคลเดียว"

   รวมเอง (หลักฐานแน่น):
     อีเมลเดียวกัน (ไม่ใช่อีเมลกลาง) และชื่อไม่ขัดกัน
     เบอร์มือถือเดียวกัน และชื่อไม่ขัดกัน
     ("ไม่ขัด" = ชื่อเดียวกันหลังปรับรูป หรือเทียบไม่ได้ เช่นแถวหนึ่งเขียนไทยอีกแถวเขียนอังกฤษ)
   เข้าคิวให้คนตรวจ (ไม่รวมเอง):
     อีเมลหรือเบอร์เดียวกันแต่ชื่อต่างกัน — อีเมลอาจถูกนำไปใช้ใหม่ · เบอร์อาจเป็นของคนอื่นในบ้าน/ที่ทำงาน
     ชื่อเดียวกันในบริษัทเดียวกัน (ชื่อบริษัทเดียวกัน หรือโดเมนอีเมลเดียวกัน)
     ตรงกับคนที่มีอยู่แล้วมากกว่าหนึ่งคน — คนที่มีอยู่แล้วไม่ถูกรวมกันเองโดยระบบ
   องค์กร: ชื่อเดียวกันหลังตัดรูปแบบนิติบุคคล = องค์กรเดียว · ชื่อต่างกันแต่โดเมนเดียวกัน = กลุ่มให้คนตรวจ
     (อาจเป็นชื่อไทย/อังกฤษของบริษัทเดียว หรือบริษัทในเครือที่เป็นคนละนิติบุคคล — ระบบไม่เดา)

   ทุก ID กำหนดได้จากข้อมูล: ตรวจซ้ำกี่รอบก็ได้ผลเดิม · สิ่งที่คนตัดสินแล้ว (resolution_overrides) ชนะเสมอ */

type Row = {
  batchId: string; line: number; uploadedAt: string; sourceId: string;
  v: Partial<Record<VaultField, string>>;
  name: NameInfo; emails: EmailInfo[]; phones: string[]; orgKey: string; orgDisplay: string; when: string | null;
};

export type ResolveStats = {
  rows: number; people: number; newPeople: number; matchedExisting: number; orgs: number;
  orgOnlyRows: number; personPairs: number; orgGroups: number;
};

const h24 = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 24);
export const orgIdFor = (tenantId: string, key: string) => `o-${matchKey(tenantId, "org", key).slice(0, 24)}`;

class UnionFind {
  private p: number[] = [];
  add(): number { this.p.push(this.p.length); return this.p.length - 1; }
  find(x: number): number { while (this.p[x] !== x) { this.p[x] = this.p[this.p[x]]; x = this.p[x]; } return x; }
  union(a: number, b: number) { const ra = this.find(a), rb = this.find(b); if (ra !== rb) this.p[Math.max(ra, rb)] = Math.min(ra, rb); }
}

/* ชื่อเต็มจากคอลัมน์ที่มี — ไฟล์ที่มีแค่ "ชื่อ" + "นามสกุล" ทำให้ customer_name เป็นแค่ชื่อต้น จึงต่อนามสกุลให้ */
function personName(v: Row["v"]): string {
  const base = v.customer_name || v.first_name || "";
  if (v.last_name && !base.includes(v.last_name)) return `${base} ${v.last_name}`.trim();
  return base;
}

async function loadPending(tenantId: string): Promise<Row[]> {
  const raw = await all<{ batch_id: string; line: number | string; payload_enc: string; uploaded_at: string; source_id: string }>(
    `SELECT r.batch_id, r.line, r.payload_enc, b.uploaded_at, b.source_id
     FROM import_rows r JOIN import_batches b ON b.id = r.batch_id AND b.tenant_id = r.tenant_id
     WHERE r.tenant_id = ? AND r.status = 'pending_review' AND r.payload_enc IS NOT NULL
     ORDER BY b.uploaded_at, r.batch_id, r.line`,
    tenantId,
  );
  const decoded = raw.map((r) => ({ r, v: JSON.parse(openRecord(tenantId, "import_row", r.payload_enc)) as Row["v"] }));
  /* ลำดับวันที่ต่อชุด — ไฟล์หนึ่งเขียนแบบเดียว (วัน/เดือน หรือ เดือน/วัน) */
  const orderByBatch = new Map<string, "dmy" | "mdy">();
  for (const b of new Set(decoded.map((d) => d.r.batch_id))) {
    orderByBatch.set(b, detectDateOrder(decoded.filter((d) => d.r.batch_id === b).map((d) => d.v.occurred_at ?? "")));
  }
  return decoded.map(({ r, v }) => {
    const emails = [normaliseContact("email", v.email ?? "")].map((e) => emailInfo(e)).filter((e): e is EmailInfo => Boolean(e));
    const phones = [v.phone, v.phone_alt].map((p) => normaliseContact("phone", p ?? "")).filter((p): p is string => Boolean(p));
    const org = orgInfo(v.company);
    return {
      batchId: r.batch_id, line: Number(r.line), uploadedAt: r.uploaded_at, sourceId: r.source_id, v,
      name: nameInfo(personName(v)), emails, phones: phones.slice(0, 1), orgKey: org.key, orgDisplay: org.display,
      when: v.occurred_at ? normaliseDate(v.occurred_at, orderByBatch.get(r.batch_id)) : null,
    };
  });
}

/** คนที่มีอยู่แล้วซึ่งใช้อีเมลหรือเบอร์เดียวกัน — ค้นด้วย HMAC ไม่ถอดรหัส */
async function existingByContact(tenantId: string, kind: "email" | "phone", values: string[]) {
  const out = new Map<string, string[]>();
  const uniq = [...new Set(values)];
  for (let i = 0; i < uniq.length; i += 500) {
    const chunk = uniq.slice(i, i + 500);
    const hmacs = chunk.map((v) => matchKey(tenantId, kind, v));
    const byHmac = new Map(hmacs.map((h, j) => [h, chunk[j]]));
    const rows = await all<{ customer_id: string; value_hmac: string }>(
      `SELECT customer_id, value_hmac FROM contact_points WHERE tenant_id = ? AND kind = ? AND value_hmac IN (${hmacs.map(() => "?").join(",")})`,
      tenantId, kind, ...hmacs,
    );
    for (const r of rows) {
      const v = byHmac.get(r.value_hmac)!;
      out.set(v, [...new Set([...(out.get(v) ?? []), r.customer_id])]);
    }
  }
  return out;
}

export async function resolveTenant(tenantId: string, actor: string): Promise<ResolveStats> {
  const rows = await loadPending(tenantId);
  const stats: ResolveStats = { rows: rows.length, people: 0, newPeople: 0, matchedExisting: 0, orgs: 0, orgOnlyRows: 0, personPairs: 0, orgGroups: 0 };
  if (!rows.length) return stats;

  // ── คนที่มีอยู่แล้ว ──
  const exEmail = await existingByContact(tenantId, "email", rows.flatMap((r) => r.emails.filter((e) => !e.generic).map((e) => e.email)));
  const exPhone = await existingByContact(tenantId, "phone", rows.flatMap((r) => r.phones));
  const existingIds = [...new Set([...exEmail.values(), ...exPhone.values()].flat())];
  const exName = new Map<string, NameInfo>();
  for (let i = 0; i < existingIds.length; i += 500) {
    const chunk = existingIds.slice(i, i + 500);
    for (const c of await all<{ id: string; name: string }>(
      `SELECT id, name FROM customers WHERE tenant_id = ? AND id IN (${chunk.map(() => "?").join(",")})`, tenantId, ...chunk,
    )) exName.set(c.id, nameInfo(c.name));
  }
  const overrides = await all<{ kind: string; verdict: string; a_id: string; b_id: string }>(
    "SELECT kind, verdict, a_id, b_id FROM resolution_overrides WHERE tenant_id = ?", tenantId,
  );
  const apart = new Set(overrides.filter((o) => o.kind === "person" && o.verdict === "different").map((o) => [o.a_id, o.b_id].sort().join("|")));
  const orgAlias = new Map(overrides.filter((o) => o.kind === "org_alias").map((o) => [o.a_id, o.b_id]));
  const orgApart = new Set(overrides.filter((o) => o.kind === "org" && o.verdict === "different").map((o) => [o.a_id, o.b_id].sort().join("|")));

  // ── กราฟ: แถวหนึ่งแถว = หนึ่งโหนด · คนที่มีอยู่แล้ว = หนึ่งโหนด ──
  const uf = new UnionFind();
  rows.forEach(() => uf.add());
  const personRows = rows.map((r, i) => i).filter((i) => rows[i].name.tokens.length || rows[i].phones.length || rows[i].emails.some((e) => !e.generic));
  const isPersonRow = new Set(personRows);
  const exNode = new Map<string, number>();
  const existingOfNode = new Map<number, string>();
  const nodeOfExisting = (id: string) => {
    if (!exNode.has(id)) { const n = uf.add(); exNode.set(id, n); existingOfNode.set(n, id); }
    return exNode.get(id)!;
  };
  const nameOfNode = (n: number): NameInfo => (n < rows.length ? rows[n].name : exName.get(existingOfNode.get(n)!) ?? nameInfo(""));
  const weak: { a: number; b: number; why: string }[] = [];
  let phoneConflict = (_a: number, _b: number) => false;
  let afterUnion = (_a: number, _b: number) => {};

  /* ตัวระบุเดียวกัน: แยกเป็น "สมอ" ตามชื่อที่ไม่ขัดกัน — ชื่อที่ขัดกับทุกสมอได้สมอใหม่ และเข้าคิวตรวจ */
  /* crossScript: ยอมให้ชื่อคนละอักษร (ไทย/อังกฤษ) ซึ่งเทียบกันไม่ได้ ถือว่าไม่ขัดกันไหม
     อีเมลบริษัทเช่น somchai.j@ ใช้ร่วมกันได้สองคน (คนละนามสกุลแต่อักษรแรกเดียวกัน) — วัดแล้ว
     การยอมให้อีเมลรวมแถวไทยกับแถวอังกฤษทำ precision ตกเหลือ 93% · เบอร์มือถือเป็นของคนเดียวมากกว่า */
  const linkBy = (key: (i: number) => string[], why: string, existing: Map<string, string[]> | undefined, crossScript: boolean) => {
    const fits = (a: NameInfo, b: NameInfo) => {
      const c = compareNames(a, b);
      if (c === "same") return true;
      if (c === "different") return false;
      return crossScript || !a.tokens.length || !b.tokens.length;
    };
    const groups = new Map<string, number[]>();
    for (const i of personRows) for (const k of key(i)) groups.set(k, [...(groups.get(k) ?? []), i]);
    for (const [k, members] of groups) {
      const anchors: number[] = (existing?.get(k) ?? []).map(nodeOfExisting);
      for (const i of members) {
        const fit = anchors.find((a) => fits(nameOfNode(a), rows[i].name) && !phoneConflict(a, i));
        if (fit !== undefined) { uf.union(fit, i); afterUnion(fit, i); }
        else {
          if (anchors.length) weak.push({ a: anchors[0], b: i, why });
          anchors.push(i);
        }
      }
    }
  };
  linkBy((i) => rows[i].phones, "phone_same_name_differs", exPhone, true);

  /* เบอร์มือถือของแต่ละกลุ่มหลังเชื่อมด้วยเบอร์ — อีเมลเดียวกันแต่เบอร์มือถือต่างกัน = อย่ารวมเอง
     (สองคนชื่อเหมือนกันในบริษัทเดียวกันมักได้อีเมลบริษัทแบบเดียวกัน แต่ไม่ได้มือถือเครื่องเดียวกัน) */
  const phonesOf = new Map<number, Set<string>>();
  rows.forEach((r, i) => { const root = uf.find(i); for (const p of r.phones) phonesOf.set(root, (phonesOf.get(root) ?? new Set()).add(p)); });
  phoneConflict = (a: number, b: number) => {
    const pa = phonesOf.get(uf.find(a)), pb = phonesOf.get(uf.find(b));
    return Boolean(pa?.size && pb?.size && ![...pa].some((p) => pb.has(p)));
  };
  afterUnion = (a: number, b: number) => {
    const ra = uf.find(a);
    const merged = new Set([...(phonesOf.get(ra) ?? []), ...(phonesOf.get(uf.find(b)) ?? [])]);
    phonesOf.set(ra, merged);
  };
  linkBy((i) => rows[i].emails.filter((e) => !e.generic).map((e) => e.email), "email_same_name_differs", exEmail, false);

  /* ชื่อเดียวกันในบริษัทเดียวกัน → คิวตรวจเท่านั้น */
  const sameName = new Map<string, number[]>();
  for (const i of personRows) {
    const nk = nameKey(rows[i].name);
    if (!nk) continue;
    const corp = rows[i].emails.filter((e) => !e.free).map((e) => `d:${e.domain}`);
    for (const ctx of [rows[i].orgKey ? `o:${orgAlias.get(rows[i].orgKey) ?? rows[i].orgKey}` : "", ...corp].filter(Boolean)) {
      const k = `${nk}|${ctx}`;
      sameName.set(k, [...(sameName.get(k) ?? []), i]);
    }
  }
  for (const members of sameName.values()) for (let j = 1; j < members.length; j++) weak.push({ a: members[0], b: members[j], why: "same_name_same_org" });

  /* คนที่มีอยู่แล้วสองคนตกในกลุ่มเดียวกัน — ไม่รวมเอง แยกกลับเป็นคู่ในคิว */
  const clusterOf = new Map<number, number[]>();
  for (const i of personRows) { const r = uf.find(i); clusterOf.set(r, [...(clusterOf.get(r) ?? []), i]); }
  const exInCluster = new Map<number, string[]>();
  for (const [id, n] of exNode) { const r = uf.find(n); exInCluster.set(r, [...(exInCluster.get(r) ?? []), id].sort()); }

  // ── กลุ่ม → คน ──
  const personOfRoot = new Map<number, string>();
  for (const [root, members] of clusterOf) {
    const ex = exInCluster.get(root);
    if (ex?.length) {
      personOfRoot.set(root, ex[0]);
      stats.matchedExisting++;
      continue;
    }
    /* ID จากแถวแรกของกลุ่ม ไม่ใช่จากอีเมลหรือเบอร์ — สองกลุ่มที่ถูกแยกไว้ (เช่นสองคนใช้อีเมลบริษัทเดียวกัน)
       จะได้ ID เดียวกันถ้าใช้ตัวระบุที่ใช้ร่วมกัน แล้วถูกรวมเงียบ ๆ ตอนเขียน (verify:resolution จับได้)
       การจับคู่กับคนเดิมใช้ HMAC ของช่องทางอยู่แล้ว จึงไม่ต้องให้ ID ตรงกับช่องทาง */
    const head = rows[members[0]];
    personOfRoot.set(root, customerIdFor(tenantId, "row", `${head.batchId}#${head.line}`));
    stats.newPeople++;
  }
  const personOfNode = (n: number) => {
    const root = uf.find(n);
    if (personOfRoot.has(root)) return personOfRoot.get(root)!;
    return existingOfNode.get(n) ?? null;
  };

  // ── คู่ในคิว (ระหว่างคน ไม่ใช่ระหว่างแถว) ──
  const pairs = new Map<string, { ids: [string, string]; why: Set<string> }>();
  const addPair = (a: string | null, b: string | null, why: string) => {
    if (!a || !b || a === b) return;
    const ids = [a, b].sort() as [string, string];
    const k = ids.join("|");
    if (apart.has(k)) return;
    const p = pairs.get(k) ?? { ids, why: new Set<string>() };
    p.why.add(why);
    pairs.set(k, p);
  };
  for (const w of weak) addPair(personOfNode(w.a), personOfNode(w.b), w.why);
  for (const ex of exInCluster.values()) for (let j = 1; j < ex.length; j++) addPair(ex[0], ex[j], "matches_two_existing");

  // ── องค์กร ──
  const orgKeyOf = (r: Row) => (r.orgKey ? orgAlias.get(r.orgKey) ?? r.orgKey : "");
  const orgRows = new Map<string, Row[]>();
  for (const r of rows) if (orgKeyOf(r)) orgRows.set(orgKeyOf(r), [...(orgRows.get(orgKeyOf(r)) ?? []), r]);
  const mostCommon = (xs: string[]) => {
    const n = new Map<string, number>();
    for (const x of xs) if (x) n.set(x, (n.get(x) ?? 0) + 1);
    return [...n].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0] ?? null;
  };
  const now = new Date().toISOString();
  const orgRowsSql: Param[][] = [];
  const domainRows: Param[][] = [];
  const domainToOrgs = new Map<string, Set<string>>();
  for (const [key, rs] of orgRows) {
    /* alias ชี้ไปที่ org id ที่รวมแล้ว — กุญแจที่ถูก alias คือ id ไม่ใช่กุญแจชื่อ */
    const id = key.startsWith("o-") ? key : orgIdFor(tenantId, key);
    const domains = rs.flatMap((r) => r.emails.filter((e) => !e.free).map((e) => e.domain));
    const primary = mostCommon(domains);
    if (!key.startsWith("o-")) orgRowsSql.push([id, tenantId, mostCommon(rs.map((r) => r.orgDisplay)) ?? key, key, primary, now, now]);
    for (const d of new Set(domains)) {
      domainRows.push([tenantId, id, d]);
      domainToOrgs.set(d, (domainToOrgs.get(d) ?? new Set()).add(id));
    }
  }
  const groups = new Map<string, string[]>();
  for (const ids of domainToOrgs.values()) {
    if (ids.size < 2) continue;
    const list = [...ids].sort();
    const allApart = list.every((a, i) => list.slice(i + 1).every((b) => orgApart.has([a, b].sort().join("|"))));
    if (!allApart) groups.set(list.join("|"), list);
  }

  // ── สังกัด: (คน, องค์กร) ช่วงเวลาจากวันที่ในไฟล์ ──
  type Aff = { person: string; org: string; title: string | null; first: string; last: string; source: string };
  const affs = new Map<string, Aff>();
  const personInfo = new Map<string, { name: string | null; first: string | null; last: string | null; company: string | null; title: string | null; source: string; at: string; firstAt: string }>();
  const points = new Map<string, Param[]>();
  const rowUpdates: Param[][] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const person = isPersonRow.has(i) ? personOfNode(i) : null;
    const when = r.when ?? r.uploadedAt;
    if (!person) {
      stats.orgOnlyRows++;
      rowUpdates.push([tenantId, r.batchId, r.line, "accepted", now, null]);
      continue;
    }
    rowUpdates.push([tenantId, r.batchId, r.line, "accepted", now, person]);
    const display = r.name.display || null;
    const prev = personInfo.get(person);
    /* ค่าบนตัวคน = ค่าล่าสุดที่มี (กฎเลือกค่า "ล่าสุด") · วันที่สร้าง = วันที่เห็นครั้งแรก */
    const firstAt = prev && prev.firstAt < when ? prev.firstAt : when;
    if (!prev || when >= prev.at) {
      personInfo.set(person, {
        name: display ?? prev?.name ?? null, first: r.v.first_name ?? prev?.first ?? null, last: r.v.last_name ?? prev?.last ?? null,
        company: r.v.company ?? prev?.company ?? null, title: r.v.job_title ?? prev?.title ?? null, source: r.sourceId, at: when, firstAt,
      });
    } else prev.firstAt = firstAt;
    for (const e of r.emails.filter((x) => !x.generic)) {
      const row = contactPointRow(tenantId, person, "email", e.email, null, false, `vault:${r.batchId}`);
      points.set(String(row[0]), row);
    }
    for (const p of r.phones) {
      const row = contactPointRow(tenantId, person, "phone", p, null, false, `vault:${r.batchId}`);
      points.set(String(row[0]), row);
    }
    const ok = orgKeyOf(r);
    if (ok) {
      const org = ok.startsWith("o-") ? ok : orgIdFor(tenantId, ok);
      const k = `${person}|${org}`;
      const a = affs.get(k);
      if (!a) affs.set(k, { person, org, title: r.v.job_title ?? null, first: when, last: when, source: r.sourceId });
      else {
        if (when < a.first) a.first = when;
        if (when >= a.last) { a.last = when; a.title = r.v.job_title ?? a.title; }
      }
    }
  }
  /* ย้ายงาน: ถ้าคนหนึ่งอยู่สององค์กร และเห็นที่เก่าครั้งสุดท้ายก่อนเห็นที่ใหม่ครั้งแรก → ปิดช่วงที่เก่า */
  const byPerson = new Map<string, Aff[]>();
  for (const a of affs.values()) byPerson.set(a.person, [...(byPerson.get(a.person) ?? []), a]);
  const affRows: Param[][] = [];
  for (const list of byPerson.values()) {
    list.sort((x, y) => (x.first < y.first ? -1 : 1));
    list.forEach((a, j) => {
      const next = list[j + 1];
      const to = next && a.last < next.first ? next.first : null;
      affRows.push([`a-${h24(`${tenantId}|${a.person}|${a.org}`)}`, tenantId, a.person, a.org, a.title, a.first, to, a.source, now]);
    });
  }
  const inReview = new Set([...pairs.values()].flatMap((p) => p.ids));

  // ── เขียน ──
  const people = [...personInfo];
  stats.people = people.length;
  stats.orgs = orgRowsSql.length;
  stats.personPairs = pairs.size;
  stats.orgGroups = groups.size;
  await tx(async (q) => {
    await insertMany(q, "orgs", ["id", "tenant_id", "name", "name_norm", "primary_domain", "created_at", "recorded_at"], orgRowsSql, {
      onConflict: "ON CONFLICT(id) DO UPDATE SET primary_domain = COALESCE(orgs.primary_domain, excluded.primary_domain), recorded_at = excluded.recorded_at",
    });
    await insertMany(q, "org_domains", ["tenant_id", "org_id", "domain"], domainRows, { onConflict: "ON CONFLICT DO NOTHING" });
    await insertMany(q, "customers",
      ["id", "tenant_id", "name", "created_at", "lifecycle_state", "source_id", "recorded_at"],
      people.map(([id, p]) => [id, tenantId, p.name ?? "ไม่ระบุชื่อ", p.firstAt, inReview.has(id) ? "pending_review" : "received", p.source, now]),
      {
        onConflict: `ON CONFLICT(id) DO UPDATE SET name = CASE WHEN excluded.name = 'ไม่ระบุชื่อ' THEN customers.name ELSE excluded.name END,
          lifecycle_state = CASE WHEN excluded.lifecycle_state = 'pending_review' THEN 'pending_review' ELSE customers.lifecycle_state END,
          recorded_at = excluded.recorded_at`,
      });
    await insertMany(q, "contact_points", CONTACT_POINT_COLUMNS, [...points.values()], { onConflict: "ON CONFLICT DO NOTHING" });
    await insertMany(q, "contact_profiles", ["customer_id", "tenant_id", "first_name", "last_name", "company", "job_title", "updated_at"],
      people.map(([id, p]) => [id, tenantId, p.first, p.last, p.company, p.title, now]),
      {
        onConflict: `ON CONFLICT(customer_id) DO UPDATE SET first_name = COALESCE(excluded.first_name, contact_profiles.first_name),
          last_name = COALESCE(excluded.last_name, contact_profiles.last_name), company = COALESCE(excluded.company, contact_profiles.company),
          job_title = COALESCE(excluded.job_title, contact_profiles.job_title), updated_at = excluded.updated_at`,
      });
    await insertMany(q, "affiliations", ["id", "tenant_id", "customer_id", "org_id", "title", "valid_from", "valid_to", "source_id", "recorded_at"], affRows, {
      onConflict: `ON CONFLICT(id) DO UPDATE SET title = COALESCE(excluded.title, affiliations.title),
        valid_from = CASE WHEN excluded.valid_from < affiliations.valid_from THEN excluded.valid_from ELSE affiliations.valid_from END,
        valid_to = excluded.valid_to, recorded_at = excluded.recorded_at`,
    });
    await insertMany(q, "review_items", ["id", "tenant_id", "kind", "subject_ids", "signals", "confidence", "status", "created_at"],
      [
        ...[...pairs.values()].map((p) => [
          `rv-${h24(`${tenantId}|person|${p.ids.join("|")}`)}`, tenantId, "person_pair", JSON.stringify(p.ids), JSON.stringify([...p.why].sort()),
          p.why.has("same_name_same_org") && p.why.size > 1 ? 0.8 : p.why.has("matches_two_existing") ? 0.75 : 0.55, "open", now,
        ]),
        ...[...groups.values()].map((ids) => [
          `rv-${h24(`${tenantId}|org|${ids.join("|")}`)}`, tenantId, "org_group", JSON.stringify(ids), JSON.stringify(["same_domain_different_name"]), 0.6, "open", now,
        ]),
      ],
      { onConflict: "ON CONFLICT DO NOTHING" });
    await insertMany(q, "import_rows", ["tenant_id", "batch_id", "line", "status", "recorded_at", "customer_id"], rowUpdates, {
      onConflict: "ON CONFLICT(batch_id, line) DO UPDATE SET status = excluded.status, customer_id = excluded.customer_id",
    });
    await logActivity(tenantId, actor, "resolve_identities",
      `${stats.rows} rows · ${stats.people} people (${stats.newPeople} new · ${stats.matchedExisting} existing) · ${stats.orgs} orgs · ${stats.personPairs} pairs · ${stats.orgGroups} org groups`);
  });
  return stats;
}
