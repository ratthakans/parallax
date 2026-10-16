import { all, get } from "@/lib/engine/sql";
import { canSee } from "@/lib/shared/accounts";
import type { Classification } from "@/lib/shared/vault";
import type { Viewer } from "@/lib/engine/accounts";

/* ── กลุ่มบริษัทในเครือ (docs/crm-plan.md C2) ─────────────────────────────

   บริษัทแม่/ลูกมาจาก orgs.parent_id (แก้ในแท็บรายละเอียดของแฟ้มบริษัท พร้อมที่มา)
   รวมทั้งกลุ่มจากบนสุดลงล่าง: คนปัจจุบัน · ดีลเปิดและมูลค่า · ติดต่อล่าสุด · ใครในทีมรู้จักใครในเครือ
   บริษัทในเครือที่เกินสิทธิ์ผู้อ่าน = นับรวมไม่ได้ และไม่แสดงชื่อ (ขึ้นว่ามีบริษัทที่จำกัดการเข้าถึงกี่แห่ง) */

export type GroupMember = {
  id: string; name: string; depth: number; parentId: string | null; current: number;
  openDeals: number; openValue: number; lastAt: string | null; self: boolean;
};
export type OrgGroup = {
  rootId: string; members: GroupMember[]; hidden: number;
  totals: { orgs: number; current: number; openDeals: number; openValue: number; lastAt: string | null };
  knows: { member: string; person: string; personId: string; org: string; orgId: string }[];
};

const MAX = 200;

export async function orgGroup(tenantId: string, orgId: string, viewer: Viewer): Promise<OrgGroup | null> {
  /* ขึ้นไปหาบนสุด (กันวงด้วยเพดาน — setParent กันวงตอนบันทึกอยู่แล้ว) */
  let root = orgId;
  for (let i = 0; i < 20; i++) {
    const p = await get<{ parent_id: string | null }>("SELECT parent_id FROM orgs WHERE tenant_id = ? AND id = ?", tenantId, root);
    if (!p) return null;
    if (!p.parent_id) break;
    root = p.parent_id;
  }
  /* ลงล่างทีละชั้น */
  type O = { id: string; name: string; parent_id: string | null; classification: string | null; account_owner_id: string | null; data_owner_id: string | null };
  const all_: (O & { depth: number })[] = [];
  let level = [root], depth = 0;
  const seen = new Set<string>();
  while (level.length && all_.length < MAX && depth < 20) {
    const rows = await all<O>(
      `SELECT id, name, parent_id, classification, account_owner_id, data_owner_id FROM orgs WHERE tenant_id = ? AND id IN (${level.map(() => "?").join(",")})`,
      tenantId, ...level);
    for (const r of rows) if (!seen.has(r.id)) { seen.add(r.id); all_.push({ ...r, depth }); }
    const kids = await all<{ id: string }>(
      `SELECT id FROM orgs WHERE tenant_id = ? AND parent_id IN (${level.map(() => "?").join(",")}) ORDER BY name`, tenantId, ...level);
    level = kids.map((k) => k.id).filter((id) => !seen.has(id));
    depth++;
  }
  const visible = all_.filter((o) => canSee(viewer.clearance, (o.classification ?? "confidential") as Classification)
    || [o.account_owner_id, o.data_owner_id].includes(viewer.id));
  const ids = visible.map((o) => o.id);
  if (!ids.length) return null;
  const IN = ids.map(() => "?").join(",");
  const [people, deals, last, knows] = await Promise.all([
    all<{ org_id: string; n: number | string }>(
      `SELECT org_id, COUNT(DISTINCT customer_id) AS n FROM affiliations WHERE tenant_id = ? AND valid_to IS NULL AND org_id IN (${IN}) GROUP BY org_id`, tenantId, ...ids),
    all<{ org_id: string; n: number | string; v: number | string | null }>(
      `SELECT org_id, COUNT(*) AS n, SUM(COALESCE(value, 0)) AS v FROM opportunities WHERE tenant_id = ? AND stage NOT IN ('won', 'lost') AND org_id IN (${IN}) GROUP BY org_id`, tenantId, ...ids),
    all<{ org_id: string; at: string }>(
      `SELECT org_id, MAX(occurred_at) AS at FROM interactions WHERE tenant_id = ? AND org_id IN (${IN}) GROUP BY org_id`, tenantId, ...ids),
    all<{ member: string; person_id: string; person: string; person_class: string | null; org_id: string }>(
      `SELECT DISTINCT r.from_id AS member, c.id AS person_id, c.name AS person, c.classification AS person_class, a.org_id
       FROM relationship_assertions r
       JOIN affiliations a ON a.tenant_id = r.tenant_id AND a.customer_id = r.to_id AND a.valid_to IS NULL
       JOIN customers c ON c.tenant_id = r.tenant_id AND c.id = r.to_id
       WHERE r.tenant_id = ? AND r.from_kind = 'member' AND r.to_kind = 'person' AND r.valid_to IS NULL AND a.org_id IN (${IN})
       ORDER BY r.from_id, c.name`, tenantId, ...ids),
  ]);
  const pm = new Map(people.map((p) => [p.org_id, Number(p.n)]));
  const dm = new Map(deals.map((d) => [d.org_id, { n: Number(d.n), v: Number(d.v ?? 0) }]));
  const lm = new Map(last.map((l) => [l.org_id, l.at]));
  const name = new Map(visible.map((o) => [o.id, o.name]));
  const members: GroupMember[] = visible.map((o) => ({
    id: o.id, name: o.name, depth: o.depth, parentId: o.parent_id, current: pm.get(o.id) ?? 0,
    openDeals: dm.get(o.id)?.n ?? 0, openValue: dm.get(o.id)?.v ?? 0, lastAt: lm.get(o.id) ?? null, self: o.id === orgId,
  }));
  const lastAt = members.map((m) => m.lastAt).filter((x): x is string => Boolean(x)).sort().at(-1) ?? null;
  return {
    rootId: root, members, hidden: all_.length - visible.length,
    totals: {
      orgs: members.length, current: members.reduce((t, m) => t + m.current, 0),
      openDeals: members.reduce((t, m) => t + m.openDeals, 0), openValue: members.reduce((t, m) => t + m.openValue, 0), lastAt,
    },
    knows: knows
      .filter((k) => canSee(viewer.clearance, (k.person_class ?? "confidential") as Classification))
      .map((k) => ({ member: k.member, person: k.person, personId: k.person_id, org: name.get(k.org_id) ?? "", orgId: k.org_id })),
  };
}
