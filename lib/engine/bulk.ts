import { setAccountOwner } from "@/lib/engine/accounts/edit";
import { moveDeal, setDealOwner } from "@/lib/engine/deals";
import { setValue } from "@/lib/engine/custom-fields";
import { setForecast, setOrgTeam } from "@/lib/engine/forecast";
import { logActivity } from "@/lib/engine/db";
import { orgAccess, type Viewer } from "@/lib/engine/accounts";

/* ── ทำทีละหลายรายการ (docs/crm-plan.md E3) ─────────────────────────────────

   ทุกแถวผ่านฟังก์ชันเดียวกับการแก้ทีละแถว — ด่านบริษัท (orgAccess) และประวัติทำงานต่อแถว
   แถวที่ไม่ผ่าน (เกินสิทธิ์ · ค่าไม่ถูก) ถูกข้ามพร้อมเหตุผล ไม่ล้มทั้งชุด · สูงสุด 200 แถวต่อครั้ง
   ไม่มีการลบหรือปิดดีลแบบหลายรายการ — ปิดดีลต้องมีเหตุผลต่อดีล (E2) · ลบไปถังขยะทีละรายการ (D3) */

export const MAX_BULK = 200;
export type BulkResult = { done: number; skipped: { id: string; reason: string }[] };

export type OrgBulk = { kind: "owner"; owner: string } | { kind: "team"; teamId: string } | { kind: "field"; fieldId: string; value: string };
export type DealBulk = { kind: "owner"; owner: string } | { kind: "stage"; stage: string } | { kind: "forecast"; category: string } | { kind: "field"; fieldId: string; value: string };

async function each(ids: string[], fn: (id: string) => Promise<{ ok: true } | { ok: false; error: string }>): Promise<BulkResult> {
  const uniq = [...new Set(ids.filter(Boolean))].slice(0, MAX_BULK);
  const out: BulkResult = { done: 0, skipped: [] };
  for (const id of uniq) {
    const r = await fn(id);
    if (r.ok) out.done++; else out.skipped.push({ id, reason: r.error });
  }
  return out;
}

export async function bulkOrgs(tenantId: string, ids: string[], op: OrgBulk, viewer: Viewer): Promise<BulkResult> {
  const res = await each(ids, async (id) => {
    if (op.kind === "owner") {
      const access = await orgAccess(tenantId, id, viewer, "claim");
      if (!access.ok) return access;
      return setAccountOwner(tenantId, id, op.owner.trim() || null, viewer.id);
    }
    if (op.kind === "team") return setOrgTeam(tenantId, id, op.teamId, viewer);
    return setValue(tenantId, "org", id, op.fieldId, op.value, viewer);
  });
  await logActivity(tenantId, viewer.id, "bulk_orgs", `${op.kind} · ${res.done} done · ${res.skipped.length} skipped`);
  return res;
}

export async function bulkDeals(tenantId: string, ids: string[], op: DealBulk, viewer: Viewer): Promise<BulkResult> {
  if (op.kind === "stage" && (op.stage === "won" || op.stage === "lost")) {
    return { done: 0, skipped: ids.map((id) => ({ id, reason: "ปิดดีลต้องเลือกเหตุผลต่อดีลที่หน้าดีล" })) };
  }
  const res = await each(ids, async (id) => {
    if (op.kind === "owner") return setDealOwner(tenantId, id, op.owner, viewer);
    if (op.kind === "stage") { const r = await moveDeal(tenantId, id, op.stage, viewer); return r.ok ? { ok: true } : r; }
    if (op.kind === "forecast") return setForecast(tenantId, id, op.category, viewer);
    return setValue(tenantId, "deal", id, op.fieldId, op.value, viewer);
  });
  await logActivity(tenantId, viewer.id, "bulk_deals", `${op.kind} · ${res.done} done · ${res.skipped.length} skipped`);
  return res;
}
