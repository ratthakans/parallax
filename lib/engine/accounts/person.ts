import { all } from "@/lib/engine/sql";
import { personIdsOf } from "@/lib/engine/vault/merge";
import { preferencesOf } from "@/lib/engine/policy/preferences";
import { canSee } from "@/lib/shared/accounts";
import type { Classification, PreferenceKind } from "@/lib/shared/vault";
import type { Viewer } from "@/lib/engine/accounts";

/* ── ข้อมูลฝั่ง B2B ของคนหนึ่งคน สำหรับหน้าผู้ติดต่อ (docs/ux-plan.md U2) ─────────────

   สังกัดตามเวลา · กิจกรรม · แคมเปญที่อยู่ · ความต้องการ (ยินยอม/ถอน/คัดค้าน/จำกัด) — รวมรหัสที่ถูกรวมเข้ามา
   ตัดตามสิทธิ์ผู้อ่านแบบเดียวกับแฟ้มบริษัท: บริษัทเกินสิทธิ์ = ชื่อปิดบัง ไม่มีลิงก์ ·
   บันทึกปฏิสัมพันธ์เกินสิทธิ์ = เห็นว่ามี แต่ไม่เห็นเนื้อหา (ยกเว้นผู้บันทึกเอง) */

export type PersonB2B = {
  jobs: { orgId: string; org: string; visible: boolean; title: string | null; from: string | null; to: string | null; current: boolean }[];
  interactions: { id: string; kind: string; at: string; org: string | null; orgId: string | null; summary: string | null; outcome: string | null; owner: string | null; masked: boolean }[];
  campaigns: { id: string; name: string; eligibility: string; status: string; assignedTo: string | null }[];
  preferences: { kind: PreferenceKind; purpose: string | null; channel: string; at: string; by: string; note: string | null }[];
  /** การถอน/คัดค้าน/ขอจำกัดล่าสุดที่ยังมีผล — ใช้เป็นป้ายบนหัวระเบียน */
  stop: PreferenceKind | null;
};

const cls = (c: string | null | undefined) => (c ?? "confidential") as Classification;

export async function personB2B(tenantId: string, customerId: string, viewer: Viewer): Promise<PersonB2B> {
  const ids = await personIdsOf(tenantId, customerId);
  const IN = ids.map(() => "?").join(",");
  const [jobs, inter, camps, prefs] = await Promise.all([
    all<{ org_id: string; org: string; classification: string | null; owner: string | null; data_owner: string | null; title: string | null; valid_from: string | null; valid_to: string | null }>(
      `SELECT a.org_id, o.name AS org, o.classification, o.account_owner_id AS owner, o.data_owner_id AS data_owner, a.title, a.valid_from, a.valid_to
       FROM affiliations a JOIN orgs o ON o.id = a.org_id AND o.tenant_id = a.tenant_id
       WHERE a.tenant_id = ? AND a.customer_id IN (${IN}) ORDER BY a.valid_to IS NULL DESC, COALESCE(a.valid_from, '') DESC`, tenantId, ...ids),
    all<{ id: string; kind: string; occurred_at: string; org_id: string | null; org: string | null; summary: string | null; outcome: string | null; owner_id: string | null; classification: string | null }>(
      `SELECT i.id, i.kind, i.occurred_at, i.org_id, o.name AS org, i.summary, i.outcome, i.owner_id, i.classification
       FROM interactions i LEFT JOIN orgs o ON o.id = i.org_id AND o.tenant_id = i.tenant_id
       WHERE i.tenant_id = ? AND i.customer_id IN (${IN}) ORDER BY i.occurred_at DESC LIMIT 50`, tenantId, ...ids),
    all<{ id: string; name: string; eligibility: string; status: string; assigned_to: string | null }>(
      `SELECT c.id, c.name, t.eligibility, t.status, t.assigned_to FROM campaign_targets t
       JOIN sales_campaigns c ON c.id = t.campaign_id AND c.tenant_id = t.tenant_id
       WHERE t.tenant_id = ? AND t.customer_id IN (${IN}) ORDER BY t.updated_at DESC`, tenantId, ...ids),
    preferencesOf(tenantId, customerId),
  ]);
  const seeOrg = (j: { classification: string | null; owner: string | null; data_owner: string | null }) =>
    canSee(viewer.clearance, cls(j.classification)) || [j.owner, j.data_owner].includes(viewer.id);
  const stopKinds: PreferenceKind[] = ["withdrawal", "objection", "restriction"];
  /* ป้ายบนหัว: ความต้องการล่าสุด ถ้าเป็นการหยุด (ยินยอมใหม่หลังถอน = ไม่ขึ้น) — การตัดสินจริงต่อวัตถุประสงค์อยู่ที่บริการนโยบาย */
  const latest = prefs[0];
  return {
    jobs: jobs.map((j) => {
      const visible = seeOrg(j);
      return { orgId: j.org_id, org: visible ? j.org : "บริษัทที่จำกัดการเข้าถึง", visible, title: visible ? j.title : null, from: j.valid_from, to: j.valid_to, current: j.valid_to == null };
    }),
    interactions: inter.map((i) => {
      const masked = !canSee(viewer.clearance, cls(i.classification)) && i.owner_id !== viewer.id;
      return { id: i.id, kind: i.kind, at: i.occurred_at, org: i.org, orgId: i.org_id, summary: masked ? null : i.summary, outcome: masked ? null : i.outcome, owner: i.owner_id, masked };
    }),
    campaigns: camps.map((c) => ({ id: c.id, name: c.name, eligibility: c.eligibility, status: c.status, assignedTo: c.assigned_to })),
    preferences: prefs.map((p) => ({ kind: p.kind, purpose: p.purpose, channel: p.channel, at: p.effective_at, by: p.recorded_by, note: p.note })),
    stop: latest && stopKinds.includes(latest.kind) ? latest.kind : null,
  };
}
