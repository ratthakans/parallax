import { all, get } from "@/lib/engine/sql";

/* ── คิวตรวจ: สิ่งที่คนต้องเห็นก่อนตัดสิน (Blueprint 2.0 บท 3 · docs/plan.md B3) ─────

   "แสดงผลกระทบก่อนรวม" — สองฝั่งเทียบกัน: ชื่อ · ช่องทางแบบปิดบาง · สังกัด · แหล่งที่มา · จำนวนแถวต้นทาง
   ค่าเต็มของอีเมล/เบอร์ไม่ออกจากฐานข้อมูลในหน้านี้ — เทียบด้วยค่าปิดบางและ "ตรงกัน" จาก HMAC */

export type ReviewKind = "person_pair" | "org_group";

export type PersonSide = {
  id: string; name: string; lifecycle: string; restriction: string; createdAt: string;
  contacts: { kind: string; masked: string; hmac: string }[];
  affiliations: { org: string; title: string | null; from: string | null; to: string | null }[];
  sources: string[]; rows: number; interactions: number; participations: number;
};
export type OrgSide = { id: string; name: string; domain: string | null; domains: string[]; people: number; taxId: string | null };

export type ReviewItem = {
  id: string; kind: ReviewKind; signals: string[]; confidence: number; createdAt: string;
  people: PersonSide[]; orgs: OrgSide[];
  /** ช่องทางที่สองฝั่งมีร่วมกัน (เทียบ HMAC) — หลักฐานที่ทำให้เข้าคิว */
  shared: string[];
};

export const SIGNAL_TH: Record<string, string> = {
  phone_same_name_differs: "เบอร์เดียวกัน แต่ชื่อต่างกัน",
  email_same_name_differs: "อีเมลเดียวกัน แต่ชื่อต่างกัน",
  same_name_same_org: "ชื่อเดียวกันในบริษัทหรือโดเมนเดียวกัน",
  matches_two_existing: "ข้อมูลใหม่ตรงกับคนที่มีอยู่แล้วสองคน",
  same_domain_different_name: "โดเมนอีเมลเดียวกัน แต่ชื่อบริษัทต่างกัน",
};

const inList = (ids: string[]) => ids.map(() => "?").join(",");

export async function personSides(tenantId: string, ids: string[]): Promise<PersonSide[]> {
  if (!ids.length) return [];
  const [people, points, affs, srcs, rowN, interN, partN] = await Promise.all([
    all<{ id: string; name: string; lifecycle_state: string; restriction_status: string | null; created_at: string }>(
      `SELECT id, name, lifecycle_state, restriction_status, created_at FROM customers WHERE tenant_id = ? AND id IN (${inList(ids)})`, tenantId, ...ids),
    all<{ customer_id: string; kind: string; value_masked: string; value_hmac: string }>(
      `SELECT customer_id, kind, value_masked, value_hmac FROM contact_points WHERE tenant_id = ? AND customer_id IN (${inList(ids)}) ORDER BY kind, value_masked`,
      tenantId, ...ids),
    all<{ customer_id: string; org: string; title: string | null; valid_from: string | null; valid_to: string | null }>(
      `SELECT a.customer_id, o.name AS org, a.title, a.valid_from, a.valid_to FROM affiliations a
       JOIN orgs o ON o.id = a.org_id AND o.tenant_id = a.tenant_id
       WHERE a.tenant_id = ? AND a.customer_id IN (${inList(ids)}) ORDER BY a.valid_from`, tenantId, ...ids),
    all<{ customer_id: string; name: string }>(
      `SELECT DISTINCT r.customer_id, s.name FROM import_rows r
       JOIN import_batches b ON b.id = r.batch_id AND b.tenant_id = r.tenant_id
       JOIN sources s ON s.id = b.source_id AND s.tenant_id = b.tenant_id
       WHERE r.tenant_id = ? AND r.customer_id IN (${inList(ids)})`, tenantId, ...ids),
    all<{ customer_id: string; n: number | string }>(
      `SELECT customer_id, COUNT(*) AS n FROM import_rows WHERE tenant_id = ? AND customer_id IN (${inList(ids)}) GROUP BY customer_id`, tenantId, ...ids),
    all<{ customer_id: string; n: number | string }>(
      `SELECT customer_id, COUNT(*) AS n FROM interactions WHERE tenant_id = ? AND customer_id IN (${inList(ids)}) GROUP BY customer_id`, tenantId, ...ids),
    all<{ customer_id: string; n: number | string }>(
      `SELECT customer_id, COUNT(*) AS n FROM participations WHERE tenant_id = ? AND customer_id IN (${inList(ids)}) GROUP BY customer_id`, tenantId, ...ids),
  ]);
  const count = (xs: { customer_id: string; n: number | string }[], id: string) => Number(xs.find((x) => x.customer_id === id)?.n ?? 0);
  return ids.flatMap((id) => {
    const p = people.find((x) => x.id === id);
    if (!p) return [];
    return [{
      id, name: p.name, lifecycle: p.lifecycle_state, restriction: p.restriction_status ?? "none", createdAt: p.created_at,
      contacts: points.filter((x) => x.customer_id === id).map((x) => ({ kind: x.kind, masked: x.value_masked, hmac: x.value_hmac })),
      affiliations: affs.filter((x) => x.customer_id === id).map((x) => ({ org: x.org, title: x.title, from: x.valid_from, to: x.valid_to })),
      sources: srcs.filter((x) => x.customer_id === id).map((x) => x.name),
      rows: count(rowN, id), interactions: count(interN, id), participations: count(partN, id),
    }];
  });
}

async function orgSides(tenantId: string, ids: string[]): Promise<OrgSide[]> {
  if (!ids.length) return [];
  const [orgs, domains, people] = await Promise.all([
    all<{ id: string; name: string; primary_domain: string | null; tax_id: string | null }>(
      `SELECT id, name, primary_domain, tax_id FROM orgs WHERE tenant_id = ? AND id IN (${inList(ids)})`, tenantId, ...ids),
    all<{ org_id: string; domain: string }>(
      `SELECT org_id, domain FROM org_domains WHERE tenant_id = ? AND org_id IN (${inList(ids)}) ORDER BY domain`, tenantId, ...ids),
    all<{ org_id: string; n: number | string }>(
      `SELECT org_id, COUNT(DISTINCT customer_id) AS n FROM affiliations WHERE tenant_id = ? AND org_id IN (${inList(ids)}) GROUP BY org_id`, tenantId, ...ids),
  ]);
  return ids.flatMap((id) => {
    const o = orgs.find((x) => x.id === id);
    if (!o) return [];
    return [{
      id, name: o.name, domain: o.primary_domain, taxId: o.tax_id,
      domains: domains.filter((d) => d.org_id === id).map((d) => d.domain),
      people: Number(people.find((p) => p.org_id === id)?.n ?? 0),
    }];
  });
}

type ItemRow = { id: string; kind: ReviewKind; subject_ids: string; signals: string; confidence: number | string; created_at: string };

async function hydrate(tenantId: string, r: ItemRow): Promise<ReviewItem> {
  const ids = JSON.parse(r.subject_ids) as string[];
  const people = r.kind === "person_pair" ? await personSides(tenantId, ids) : [];
  const orgs = r.kind === "org_group" ? await orgSides(tenantId, ids) : [];
  let shared: string[] = [];
  if (people.length === 2) {
    const b = new Set(people[1].contacts.map((c) => c.hmac));
    shared = people[0].contacts.filter((c) => b.has(c.hmac)).map((c) => c.masked);
  } else if (orgs.length > 1) {
    shared = orgs[0].domains.filter((d) => orgs.slice(1).every((o) => o.domains.includes(d)));
  }
  return {
    id: r.id, kind: r.kind, signals: JSON.parse(r.signals) as string[], confidence: Number(r.confidence), createdAt: r.created_at,
    people, orgs, shared,
  };
}

/** รายการค้างตรวจ — ความมั่นใจสูงก่อน (ตัดสินง่ายและได้ผลมากที่สุดก่อน) */
export async function listOpenReviews(tenantId: string, kind: ReviewKind, limit = 10, offset = 0): Promise<ReviewItem[]> {
  const rows = await all<ItemRow>(
    `SELECT id, kind, subject_ids, signals, confidence, created_at FROM review_items
     WHERE tenant_id = ? AND kind = ? AND status = 'open' ORDER BY confidence DESC, created_at, id LIMIT ? OFFSET ?`,
    tenantId, kind, limit, offset,
  );
  return Promise.all(rows.map((r) => hydrate(tenantId, r)));
}

export async function getReview(tenantId: string, id: string): Promise<ReviewItem | null> {
  const r = await get<ItemRow>(
    "SELECT id, kind, subject_ids, signals, confidence, created_at FROM review_items WHERE tenant_id = ? AND id = ?", tenantId, id,
  );
  return r ? hydrate(tenantId, r) : null;
}

export async function reviewCounts(tenantId: string) {
  const rows = await all<{ kind: string; status: string; n: number | string }>(
    "SELECT kind, status, COUNT(*) AS n FROM review_items WHERE tenant_id = ? GROUP BY kind, status", tenantId,
  );
  const n = (kind: string, status: string) => Number(rows.find((r) => r.kind === kind && r.status === status)?.n ?? 0);
  return {
    personOpen: n("person_pair", "open"), orgOpen: n("org_group", "open"),
    merged: n("person_pair", "merged") + n("org_group", "merged"),
    keptApart: n("person_pair", "kept_apart") + n("org_group", "kept_apart"),
  };
}

/** ประวัติการรวม พร้อมชื่อปัจจุบันของสองฝั่ง (ฝั่งที่ถูกรวมใช้ชื่อจากภาพก่อนรวม) */
export async function mergeHistory(tenantId: string, limit = 20) {
  const rows = await all<{
    id: string; survivor_id: string; merged_id: string; rule: string | null; decided_by: string; decided_at: string;
    undone_at: string | null; undone_by: string | null; impact: string; survivor_name: string | null;
  }>(
    `SELECT m.id, m.survivor_id, m.merged_id, m.rule, m.decided_by, m.decided_at, m.undone_at, m.undone_by, m.impact,
       COALESCE(c.name, o.name) AS survivor_name
     FROM merge_log m
     LEFT JOIN customers c ON c.id = m.survivor_id AND c.tenant_id = m.tenant_id
     LEFT JOIN orgs o ON o.id = m.survivor_id AND o.tenant_id = m.tenant_id
     WHERE m.tenant_id = ? ORDER BY m.decided_at DESC LIMIT ?`, tenantId, limit,
  );
  return rows.map((r) => {
    const impact = JSON.parse(r.impact) as { kind?: string; drop?: { name?: string }; moved?: Record<string, unknown[]> };
    return {
      id: r.id, kind: impact.kind === "org" ? "org" : "person", survivorId: r.survivor_id, survivorName: r.survivor_name ?? "—", mergedName: impact.drop?.name ?? "—",
      moved: Object.values(impact.moved ?? {}).reduce((a, xs) => a + xs.length, 0),
      decidedBy: r.decided_by, decidedAt: r.decided_at, undoneAt: r.undone_at, undoneBy: r.undone_by,
    };
  });
}
