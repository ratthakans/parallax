"use server";

import { revalidatePath } from "next/cache";
import { denied, viewer } from "@/app/(app)/viewer";
import { bulkDeals, bulkOrgs, MAX_BULK, type BulkResult, type DealBulk, type OrgBulk } from "@/lib/engine/bulk";
import type { ActionState } from "@/lib/shared/action-state";
import { applyOrgUpdate, planOrgUpdate, undoOrgUpdate, type OrgUpdatePlan, type Target } from "@/lib/engine/org-update";
import { MAX_UPLOAD_BYTES } from "@/lib/engine/vault/scan";
import { restoreTrash, trashDeal, trashOrg } from "@/lib/engine/trash";
import { redirect } from "next/navigation";
import { get } from "@/lib/engine/sql";

/* ── ทำทีละหลายรายการ (docs/crm-plan.md E3) ── สิทธิ์ write · ทุกแถวตรวจด่านบริษัทและเขียนประวัติเหมือนแก้ทีละแถว */

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");
const idsOf = (fd: FormData) => fd.getAll("ids").map(String).filter(Boolean);

function summary(r: BulkResult): ActionState {
  if (!r.done && r.skipped.length) return { error: `ไม่ได้เปลี่ยนเลย — ${r.skipped[0].reason}` };
  const reasons = [...new Set(r.skipped.map((s) => s.reason))].slice(0, 2).join(" · ");
  return { ok: `เปลี่ยนแล้ว ${r.done} รายการ${r.skipped.length ? ` · ข้าม ${r.skipped.length} (${reasons})` : ""}` };
}

export async function bulkOrgsAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "write");
  if (no) return { error: no };
  const ids = idsOf(fd);
  if (!ids.length) return { error: "ติ๊กเลือกบริษัทก่อน" };
  if (ids.length > MAX_BULK) return { error: `เลือกได้ครั้งละไม่เกิน ${MAX_BULK} รายการ` };
  const kind = str(fd, "op");
  const op: OrgBulk | null = kind === "owner" ? { kind, owner: str(fd, "owner") }
    : kind === "team" ? { kind, teamId: str(fd, "teamId") }
    : kind.startsWith("cf.") ? { kind: "field", fieldId: kind.slice(3), value: str(fd, "value") } : null;
  if (!op) return { error: "เลือกว่าจะเปลี่ยนอะไร" };
  /* เจ้าของว่าง = ปล่อยบัญชีทุกแถวที่ติ๊ก — ต้องติ๊กยืนยันเอง ไม่ใช่ผลข้างเคียงของช่องที่ลืมกรอก (BUG-09) */
  if (op.kind === "owner" && !op.owner.trim() && str(fd, "confirmRelease") !== "1") {
    return { error: `ช่องเจ้าของว่าง = ปล่อยบัญชีทั้ง ${ids.length} รายการ — ใส่เจ้าของใหม่ หรือติ๊ก "ปล่อยบัญชีที่ติ๊กทั้งหมด" แล้วกดอีกครั้ง` };
  }
  const r = await bulkOrgs(v.tenantId, ids, op, { id: v.actor, clearance: v.clearance });
  revalidatePath("/app/accounts");
  return summary(r);
}

export async function bulkDealsAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "write");
  if (no) return { error: no };
  const ids = idsOf(fd);
  if (!ids.length) return { error: "ติ๊กเลือกดีลก่อน" };
  if (ids.length > MAX_BULK) return { error: `เลือกได้ครั้งละไม่เกิน ${MAX_BULK} รายการ` };
  const kind = str(fd, "op");
  const op: DealBulk | null = kind === "owner" ? { kind, owner: str(fd, "owner") }
    : kind === "stage" ? { kind, stage: str(fd, "stage") }
    : kind === "forecast" ? { kind, category: str(fd, "category") }
    : kind.startsWith("df.") ? { kind: "field", fieldId: kind.slice(3), value: str(fd, "value") } : null;
  if (!op) return { error: "เลือกว่าจะเปลี่ยนอะไร" };
  const r = await bulkDeals(v.tenantId, ids, op, { id: v.actor, clearance: v.clearance });
  revalidatePath("/app/deals");
  return summary(r);
}

/* ── นำเข้าไฟล์ระดับบริษัทเพื่ออัปเดต (docs/crm-plan.md D2) ── สิทธิ์ import · ดูตัวอย่าง → ยืนยัน → ย้อนได้ทั้งชุด
   ไฟล์อยู่ที่เบราว์เซอร์ระหว่างสองขั้นและส่งซ้ำตอนยืนยัน (เทียบ sha256) — เซิร์ฟเวอร์ไม่เก็บไฟล์ */
async function fileOf(fd: FormData): Promise<{ bytes: Uint8Array; name: string } | string> {
  const f = fd.get("file");
  if (!(f instanceof File)) return "ไม่พบไฟล์ — เลือกไฟล์ใหม่";
  if (f.size > MAX_UPLOAD_BYTES) return `ไฟล์ใหญ่เกิน ${MAX_UPLOAD_BYTES / 1_000_000}MB`;
  return { bytes: new Uint8Array(await f.arrayBuffer()), name: f.name };
}
function mappingOf(fd: FormData): Record<number, Target> | undefined {
  try { const m = JSON.parse(str(fd, "mapping") || "null"); return m && typeof m === "object" ? m : undefined; } catch { return undefined; }
}

export async function planOrgUpdateAction(fd: FormData): Promise<{ ok: true; plan: OrgUpdatePlan } | { ok: false; error: string }> {
  const v = await viewer();
  const no = denied(v, "import");
  if (no) return { ok: false, error: no };
  const file = await fileOf(fd);
  if (typeof file === "string") return { ok: false, error: file };
  return planOrgUpdate(v.tenantId, file.bytes, file.name, { id: v.actor, clearance: v.clearance }, mappingOf(fd));
}

export async function applyOrgUpdateAction(fd: FormData): Promise<{ ok: true; changes: number } | { ok: false; error: string }> {
  const v = await viewer();
  const no = denied(v, "import");
  if (no) return { ok: false, error: no };
  const file = await fileOf(fd);
  if (typeof file === "string") return { ok: false, error: file };
  const r = await applyOrgUpdate(v.tenantId, file.bytes, file.name, str(fd, "sha256"), { id: v.actor, clearance: v.clearance }, mappingOf(fd));
  if (!r.ok) return r;
  revalidatePath("/app/data/update");
  revalidatePath("/app/accounts");
  return { ok: true, changes: r.changes };
}

export async function undoOrgUpdateAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "import");
  if (no) return { error: no };
  const r = await undoOrgUpdate(v.tenantId, str(fd, "batchId"), { id: v.actor, clearance: v.clearance });
  if (!r.ok) return { error: r.error };
  revalidatePath("/app/data/update");
  revalidatePath("/app/accounts");
  return { ok: `ย้อนแล้ว ${r.reverted} ช่อง${r.kept ? ` · คงไว้ ${r.kept} ช่องที่มีคนแก้ต่อหลังนำเข้า` : ""}` };
}

/* ── ถังขยะ (docs/crm-plan.md D3) ── ลบดีล = write · ลบแฟ้มบริษัทว่าง = review · กู้คืนใช้สิทธิ์เดียวกับการลบของชนิดนั้น */
export async function trashDealAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "write");
  if (no) return { error: no };
  const r = await trashDeal(v.tenantId, str(fd, "dealId"), { id: v.actor, clearance: v.clearance });
  if (!r.ok) return { error: r.error };
  revalidatePath("/app/deals");
  revalidatePath("/app/data/trash");
  redirect("/app/deals?deleted=1");
}

export async function trashOrgAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "review");
  if (no) return { error: no };
  const r = await trashOrg(v.tenantId, str(fd, "orgId"), { id: v.actor, clearance: v.clearance });
  if (!r.ok) return { error: r.error };
  revalidatePath("/app/accounts");
  revalidatePath("/app/data/trash");
  redirect("/app/accounts?deleted=1");
}

export async function restoreTrashAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const kind = (await get<{ kind: string }>("SELECT kind FROM trash WHERE tenant_id = ? AND id = ?", v.tenantId, str(fd, "trashId")))?.kind;
  const no = denied(v, kind === "org" ? "review" : "write");
  if (no) return { error: no };
  const r = await restoreTrash(v.tenantId, str(fd, "trashId"), { id: v.actor, clearance: v.clearance });
  if (!r.ok) return { error: r.error };
  revalidatePath("/app/data/trash");
  revalidatePath(r.kind === "deal" ? "/app/deals" : "/app/accounts");
  return { ok: "กู้คืนแล้ว" };
}
