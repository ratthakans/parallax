import { all } from "@/lib/engine/sql";
import type { Viewer } from "@/lib/engine/accounts";
import type { PathGraph } from "@/lib/engine/accounts/paths";
import { RELATIONSHIP_TH, canSee } from "@/lib/shared/accounts";
import { MOVED_WINDOW_DAYS } from "@/lib/shared/today";
import type { Classification } from "@/lib/shared/vault";

/* ── คนที่รู้จักย้ายบริษัท (docs/solo-plan.md S3) ─────────────────────────

   CRM ทั่วไปเขียนทับบริษัทเดิมเมื่อคนย้าย ข้อมูลว่า "ลูกค้าเก่าของเราไปอยู่ไหน" จึงหายไป
   ที่นี่สังกัดเก็บเป็นช่วงเวลา (valid_from/valid_to) — การย้ายคือ สังกัดเดิมที่ปิดแล้ว + สังกัดปัจจุบันที่บริษัทอื่น

   คำนวณสดจากสังกัด ไม่เก็บเป็นตารางแยก: ย้อนการรวม (unmerge) หรือแก้ช่วงสังกัด ผลตามทันทีโดยไม่ต้องตามล้างสัญญาณ
   และไม่ใช้ recorded_at เป็นตัวบอก "ใหม่" เพราะการตรวจตัวตนรอบใหม่เขียน recorded_at ทับทุกแถว
   การรับทราบ/เลื่อนผูกกับรหัสสังกัดใหม่ (queue_marks) — รับทราบแล้วไม่กลับมา

   ขึ้นเมื่อครบทุกข้อ:
   - สังกัดใหม่มีหลักฐาน (คนยืนยัน หรือมาจากแหล่งที่ลงทะเบียน) และเริ่มภายใน MOVED_WINDOW_DAYS วัน (หรือไม่ทราบวันเริ่ม)
   - คนนี้เป็นที่รู้จัก: มีคนในทีมรู้จัก (ยืนยันแล้ว) · เคยอยู่ในโอกาสขาย · หรือเคยนัดประชุม/ส่งข้อเสนอ/ปิดได้ในแคมเปญ
   - คนนี้ไม่อยู่ในคิวตรวจตัวตนที่ยังเปิด — ยังไม่แน่ว่าเป็นคนเดียวกัน ก็ยังไม่ใช่การย้าย
   - บริษัทเดิมกับบริษัทใหม่ไม่ได้รอตรวจว่าเป็นบริษัทเดียวกัน — บริษัทเปลี่ยนชื่อไม่ใช่คนย้ายงาน
   - ผู้อ่านเห็นคนนี้ได้ตามระดับสิทธิ์ (การย้ายของคนที่ถูกปิดบังก็คือข้อมูลของเขา) */

export type JobMove = {
  affiliationId: string;
  personId: string;
  name: string;
  from: { id: string; name: string; hidden: boolean };
  to: { id: string; name: string; hidden: boolean };
  since: string | null;
  kind: "moved_in" | "moved_out" | "moved";
  why: string[];
};

const cls = (c: string | null | undefined) => (c ?? "confidential") as Classification;

export async function jobMoves(tenantId: string, viewer: Viewer, graph: PathGraph, now = new Date()): Promise<JobMove[]> {
  const day = now.toISOString().slice(0, 10);
  const windowStart = new Date(+now - MOVED_WINDOW_DAYS * 864e5).toISOString().slice(0, 10);
  const rows = await all<{ id: string; customer_id: string; org_id: string; valid_from: string | null; prev_org: string; prev_to: string;
    name: string; pc: string | null }>(
    `SELECT a.id, a.customer_id, a.org_id, a.valid_from, b.org_id AS prev_org, b.valid_to AS prev_to, c.name, c.classification AS pc
     FROM affiliations a
     JOIN affiliations b ON b.tenant_id = a.tenant_id AND b.customer_id = a.customer_id AND b.org_id <> a.org_id
       AND b.valid_to IS NOT NULL AND b.valid_to <= ?
     JOIN customers c ON c.id = a.customer_id AND c.tenant_id = a.tenant_id
     WHERE a.tenant_id = ? AND (a.valid_to IS NULL OR a.valid_to > ?)
       AND (a.confirmed_by IS NOT NULL OR a.source_id IS NOT NULL)
       AND (a.valid_from IS NULL OR a.valid_from >= ?)
     ORDER BY a.id, b.valid_to DESC`, day, tenantId, day, windowStart);
  if (!rows.length) return [];

  const [oppPeople, metTargets, inReview, orgs] = await Promise.all([
    all<{ customer_id: string; name: string }>(
      `SELECT DISTINCT op.customer_id, p.name FROM opportunity_people op JOIN opportunities p ON p.id = op.opportunity_id AND p.tenant_id = op.tenant_id
       WHERE op.tenant_id = ?`, tenantId),
    all<{ customer_id: string; status: string }>(
      "SELECT DISTINCT customer_id, status FROM campaign_targets WHERE tenant_id = ? AND status IN ('meeting', 'proposal', 'won')", tenantId),
    all<{ kind: string; subject_ids: string }>("SELECT kind, subject_ids FROM review_items WHERE tenant_id = ? AND status = 'open'", tenantId),
    all<{ id: string; name: string; classification: string | null; account_owner_id: string | null; data_owner_id: string | null; open_opps: number | string }>(
      `SELECT o.id, o.name, o.classification, o.account_owner_id, o.data_owner_id,
         (SELECT COUNT(*) FROM opportunities p WHERE p.tenant_id = o.tenant_id AND p.org_id = o.id AND p.stage NOT IN ('won', 'lost')) AS open_opps
       FROM orgs o WHERE o.tenant_id = ? AND o.id IN (${[...new Set(rows.flatMap((r) => [r.org_id, r.prev_org]))].map(() => "?").join(",")})`,
      tenantId, ...new Set(rows.flatMap((r) => [r.org_id, r.prev_org]))),
  ]);
  const reviewing = new Set(inReview.filter((r) => r.kind === "person_pair").flatMap((r) => JSON.parse(r.subject_ids) as string[]));
  const orgGroups = inReview.filter((r) => r.kind === "org_group").map((r) => new Set(JSON.parse(r.subject_ids) as string[]));
  const maybeSameOrg = (a: string, b: string) => orgGroups.some((grp) => grp.has(a) && grp.has(b));
  const orgById = new Map(orgs.map((o) => [o.id, o]));
  const orgEnd = (id: string) => {
    const o = orgById.get(id);
    const hidden = !o || !(canSee(viewer.clearance, cls(o.classification)) || [o.account_owner_id, o.data_owner_id].includes(viewer.id));
    return { id, name: hidden ? "บริษัทที่จำกัดการเข้าถึง" : o!.name, hidden };
  };

  const seen = new Set<string>();
  const out: JobMove[] = [];
  for (const r of rows) {
    if (seen.has(r.id)) continue; // แถวแรกของแต่ละสังกัดใหม่ = สังกัดเดิมที่ปิดล่าสุด (ORDER BY b.valid_to DESC)
    seen.add(r.id);
    if (reviewing.has(r.customer_id) || maybeSameOrg(r.org_id, r.prev_org) || !canSee(viewer.clearance, cls(r.pc))) continue;
    const why = [
      ...(graph.memberLinks.get(r.customer_id) ?? []).map((l) => `${l.member} ${RELATIONSHIP_TH[l.type]}`),
      ...oppPeople.filter((p) => p.customer_id === r.customer_id).slice(0, 2).map((p) => `เคยอยู่ในโอกาสขาย “${p.name}”`),
      ...(metTargets.some((t) => t.customer_id === r.customer_id) ? ["เคยนัดประชุมหรือคุยข้อเสนอในแคมเปญ"] : []),
    ];
    if (!why.length) continue;
    const to = orgById.get(r.org_id), from = orgById.get(r.prev_org);
    const kind = to && (Number(to.open_opps) > 0 || to.account_owner_id) ? "moved_in" : from && Number(from.open_opps) > 0 ? "moved_out" : "moved";
    out.push({
      affiliationId: r.id, personId: r.customer_id, name: r.name, from: orgEnd(r.prev_org), to: orgEnd(r.org_id),
      since: r.valid_from, kind, why,
    });
  }
  return out.sort((a, b) => (b.since ?? "").localeCompare(a.since ?? "") || a.affiliationId.localeCompare(b.affiliationId));
}
