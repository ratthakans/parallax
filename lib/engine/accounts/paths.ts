import { all } from "@/lib/engine/sql";
import { BRIDGE_TYPES, RELATIONSHIP_TH, canSee, type RelationshipType } from "@/lib/shared/accounts";
import { thaiDate } from "@/lib/shared/format";
import type { Classification } from "@/lib/shared/vault";

/* ── เส้นทางเข้าถึง (docs/solo-plan.md S2) ─────────────────────────────

   "ใครในทีมรู้จักใคร" — ไม่เกินสองทอด ไม่ใช่การค้นทั้งกราฟ และไม่มีคะแนนความอุ่น
     ทอดเดียว  สมาชิกทีม → คนเป้าหมาย
     สองทอด    สมาชิกทีม → คนกลาง → คนเป้าหมาย  (ผ่านความสัมพันธ์คน↔คนที่ยืนยันแล้ว หรือคนกลางอยู่บริษัทเดียวกันตอนนี้)
   ทุกทอดต้องเป็นความสัมพันธ์ที่ยืนยันแล้วและยังไม่สิ้นสุด · ทุกเส้นทางเป็นข้อความที่ตรวจกับหลักฐานได้
   คนกลางที่คัดค้าน/ขอจำกัด หรือระดับความลับเกินสิทธิ์ผู้อ่าน = ไม่มีเส้นทางผ่านเขา (ไม่ใช่แค่ซ่อนชื่อ —
   เส้นทางที่บอกว่า "ผ่านบุคคลที่จำกัดการเข้าถึง" ก็ยังเผยว่ามีคนนั้นอยู่)
   เรียงตาม: ทอดเดียวก่อน → ยืนยันล่าสุดก่อน → รหัส (รันซ้ำได้ลำดับเดิม) */

export type WarmPath = {
  hops: 1 | 2;
  member: string;
  via: { id: string; name: string } | null;
  person: { id: string; name: string };
  text: string;
  relationshipIds: string[];
  /** วันที่สมาชิกยืนยันว่ารู้จัก (ทอดแรก) */
  confirmedAt: string | null;
};

type MemberLink = { relId: string; member: string; type: RelationshipType; confirmedAt: string | null };
type Bridge = { relId: string; other: string; type: RelationshipType; outward: boolean };

export type PathGraph = {
  memberLinks: Map<string, MemberLink[]>;
  bridges: Map<string, Bridge[]>;
  peopleAt: Map<string, string[]>;
  person: Map<string, { name: string; visible: boolean }>;
  blocked: Set<string>;
};

const push = <K, V>(m: Map<K, V[]>, k: K, v: V) => m.set(k, [...(m.get(k) ?? []), v]);

/** โหลดครั้งเดียวต่อคำขอ — ใช้ได้ทั้งแฟ้มบริษัทและการสร้างรายชื่อแคมเปญ */
export async function loadPathGraph(tenantId: string, clearance: Classification, at = new Date().toISOString()): Promise<PathGraph> {
  const day = at.slice(0, 10);
  const [rels, affs, people, prefs] = await Promise.all([
    all<{ id: string; from_kind: string; from_id: string; to_kind: string; to_id: string; type: string; confirmed_at: string | null }>(
      `SELECT id, from_kind, from_id, to_kind, to_id, type, confirmed_at FROM relationship_assertions
       WHERE tenant_id = ? AND lifecycle_state = 'confirmed' AND confirmed_by IS NOT NULL AND (valid_to IS NULL OR valid_to > ?)
         AND to_kind = 'person' AND from_kind IN ('member', 'person')`, tenantId, day),
    all<{ customer_id: string; org_id: string }>(
      "SELECT customer_id, org_id FROM affiliations WHERE tenant_id = ? AND (valid_to IS NULL OR valid_to > ?)", tenantId, day),
    all<{ id: string; name: string; classification: string | null }>(
      `SELECT id, name, classification FROM customers WHERE tenant_id = ? AND id IN (
         SELECT to_id FROM relationship_assertions WHERE tenant_id = ? AND to_kind = 'person'
         UNION SELECT from_id FROM relationship_assertions WHERE tenant_id = ? AND from_kind = 'person'
         UNION SELECT customer_id FROM affiliations WHERE tenant_id = ?)`, tenantId, tenantId, tenantId, tenantId),
    all<{ customer_id: string }>(
      "SELECT DISTINCT customer_id FROM preferences WHERE tenant_id = ? AND kind IN ('objection', 'restriction')", tenantId),
  ]);
  const g: PathGraph = {
    memberLinks: new Map(), bridges: new Map(), peopleAt: new Map(),
    person: new Map(people.map((p) => [p.id, { name: p.name, visible: canSee(clearance, (p.classification ?? "confidential") as Classification) }])),
    blocked: new Set(prefs.map((p) => p.customer_id)),
  };
  for (const r of rels) {
    const type = r.type as RelationshipType;
    if (r.from_kind === "member") push(g.memberLinks, r.to_id, { relId: r.id, member: r.from_id, type, confirmedAt: r.confirmed_at });
    else if ((BRIDGE_TYPES as readonly string[]).includes(type)) {
      push(g.bridges, r.to_id, { relId: r.id, other: r.from_id, type, outward: false });
      push(g.bridges, r.from_id, { relId: r.id, other: r.to_id, type, outward: true });
    }
  }
  for (const a of affs) push(g.peopleAt, a.org_id, a.customer_id);
  return g;
}

const nameIn = (g: PathGraph, id: string) => g.person.get(id)?.name ?? "ไม่ทราบ";
/** คนกลางใช้ได้: เห็นได้ตามสิทธิ์ และไม่ได้คัดค้าน/ขอจำกัด */
const usable = (g: PathGraph, id: string) => Boolean(g.person.get(id)?.visible) && !g.blocked.has(id);
const sinceText = (l: MemberLink) => (l.confirmedAt ? ` (ยืนยัน ${thaiDate(l.confirmedAt)})` : "");

function sortPaths(ps: WarmPath[]): WarmPath[] {
  const seen = new Set<string>();
  return ps
    .sort((a, b) => a.hops - b.hops || (b.confirmedAt ?? "").localeCompare(a.confirmedAt ?? "") || a.relationshipIds.join().localeCompare(b.relationshipIds.join()))
    .filter((p) => {
      const k = `${p.member}|${p.via?.id ?? ""}|${p.person.id}`;
      return seen.has(k) ? false : (seen.add(k), true);
    });
}

/** เส้นทางถึงคนหนึ่งคน · orgId = บริษัทปัจจุบันของเขา (ให้คนกลางที่อยู่บริษัทเดียวกันนับเป็นทอดที่สองได้) */
export function pathsToPerson(g: PathGraph, personId: string, orgId?: string | null): WarmPath[] {
  const target = { id: personId, name: nameIn(g, personId) };
  const out: WarmPath[] = [];
  for (const l of g.memberLinks.get(personId) ?? []) {
    out.push({
      hops: 1, member: l.member, via: null, person: target, relationshipIds: [l.relId], confirmedAt: l.confirmedAt,
      text: `${l.member} ${RELATIONSHIP_TH[l.type]} ${target.name} โดยตรง${sinceText(l)}`,
    });
  }
  for (const b of g.bridges.get(personId) ?? []) {
    if (b.other === personId || !usable(g, b.other)) continue;
    const via = { id: b.other, name: nameIn(g, b.other) };
    /* outward = ความสัมพันธ์บันทึกจากเป้าหมายไปหาคนกลาง — ข้อความต้องตามทิศที่บันทึก */
    const bridgeText = b.outward ? `${target.name} ${RELATIONSHIP_TH[b.type]} ${via.name}` : `${via.name} ${RELATIONSHIP_TH[b.type]} ${target.name}`;
    for (const l of g.memberLinks.get(b.other) ?? []) {
      out.push({
        hops: 2, member: l.member, via, person: target, relationshipIds: [l.relId, b.relId], confirmedAt: l.confirmedAt,
        text: `${l.member} ${RELATIONSHIP_TH[l.type]} ${via.name}${sinceText(l)} · ${bridgeText}`,
      });
    }
  }
  if (orgId) {
    for (const colleague of g.peopleAt.get(orgId) ?? []) {
      if (colleague === personId || !usable(g, colleague)) continue;
      const via = { id: colleague, name: nameIn(g, colleague) };
      for (const l of g.memberLinks.get(colleague) ?? []) {
        out.push({
          hops: 2, member: l.member, via, person: target, relationshipIds: [l.relId], confirmedAt: l.confirmedAt,
          text: `${l.member} ${RELATIONSHIP_TH[l.type]} ${via.name}${sinceText(l)} · ${via.name} อยู่บริษัทเดียวกับ ${target.name} ตอนนี้`,
        });
      }
    }
  }
  return sortPaths(out);
}

/** เส้นทางถึงบริษัท = เส้นทางถึงคนที่สังกัดอยู่ตอนนี้ (เฉพาะคนที่ผู้อ่านเห็นได้) · ไม่นับคนกลางที่อยู่บริษัทเดียวกัน (จะซ้ำกับทอดเดียว) */
export function pathsToOrg(g: PathGraph, orgId: string): WarmPath[] {
  const people = (g.peopleAt.get(orgId) ?? []).filter((p) => g.person.get(p)?.visible);
  return sortPaths(people.flatMap((p) => pathsToPerson(g, p)));
}

/* ── ข้อเสนอ "คุณน่าจะรู้จักคนนี้" ── คุยกับคนนี้แล้ว ≥ 2 ครั้ง (ปฏิสัมพันธ์ที่ผู้อ่านเป็นเจ้าของ) และยังไม่ได้บันทึกว่ารู้จัก
   เป็นแค่ข้อเสนอ — ไม่สร้างความสัมพันธ์เอง ผู้อ่านต้องกดยืนยันพร้อมบริบท */
export async function suggestKnows(
  tenantId: string, member: { id: string; clearance: Classification }, orgId?: string,
): Promise<{ personId: string; name: string; interactions: number; last: string }[]> {
  const rows = await all<{ customer_id: string; name: string; classification: string | null; n: number | string; last_at: string }>(
    `SELECT i.customer_id, c.name, c.classification, COUNT(*) AS n, MAX(i.occurred_at) AS last_at
     FROM interactions i JOIN customers c ON c.id = i.customer_id AND c.tenant_id = i.tenant_id
     WHERE i.tenant_id = ? AND i.owner_id = ? AND i.customer_id IS NOT NULL${orgId ? " AND i.org_id = ?" : ""}
       AND NOT EXISTS (SELECT 1 FROM relationship_assertions r WHERE r.tenant_id = i.tenant_id AND r.from_kind = 'member'
         AND r.from_id = i.owner_id AND r.to_kind = 'person' AND r.to_id = i.customer_id AND r.valid_to IS NULL)
     GROUP BY i.customer_id, c.name, c.classification HAVING COUNT(*) >= 2 ORDER BY MAX(i.occurred_at) DESC, i.customer_id`,
    ...[tenantId, member.id, ...(orgId ? [orgId] : [])]);
  return rows
    .filter((r) => canSee(member.clearance, (r.classification ?? "confidential") as Classification))
    .map((r) => ({ personId: r.customer_id, name: r.name, interactions: Number(r.n), last: r.last_at }));
}
