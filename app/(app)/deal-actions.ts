"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { denied, viewer } from "@/app/(app)/viewer";
import { createDeal, moveDeal, updateDeal } from "@/lib/engine/deals";
import { orgByName } from "@/lib/engine/accounts/edit";
import type { ActionState } from "@/lib/shared/action-state";

/* ── ดีล (docs/ux-plan.md U4) ── สร้าง · ย้ายขั้น · แก้ทีละช่อง = งานประจำของคนขาย (write)
   บัญชีและผู้กระทำมาจากฝั่งเซิร์ฟเวอร์ · แฟ้มบริษัทที่เกินสิทธิ์ถูกปฏิเสธใน engine (orgAccess) */

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

function refresh(id?: string, orgId?: string) {
  revalidatePath("/app/deals");
  if (id) revalidatePath(`/app/deals/${id}`);
  if (orgId) revalidatePath(`/app/accounts/${orgId}`);
}

export async function createDealAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "write");
  if (no) return { error: no };
  /* ช่องบริษัทส่งชื่อ (OrgPicker) — หาบริษัทจากชื่อฝั่งเซิร์ฟเวอร์ */
  /* มาจากปุ่ม "+ ดีล" ของหน้าบริษัท และไม่ได้แก้ชื่อ = บริษัทนั้นแน่นอน (ชื่อซ้ำกันได้) — engine ตรวจสิทธิ์ซ้ำ */
  const prefilled = str(fd, "prefillOrgId") && str(fd, "orgName").trim() === str(fd, "prefillOrgName") ? str(fd, "prefillOrgId") : "";
  const orgId = prefilled || (await orgByName(v.tenantId, str(fd, "orgName")));
  if (!orgId) return { error: "ไม่พบบริษัทชื่อนี้ — พิมพ์แล้วเลือกจากรายการ (บริษัทใหม่: เพิ่มผู้ติดต่อพร้อมชื่อบริษัทก่อน)" };
  const res = await createDeal(v.tenantId, {
    orgId, name: str(fd, "name"), value: str(fd, "value"), expectedClose: str(fd, "expectedClose"), stage: str(fd, "stage"),
  }, { id: v.actor, clearance: v.clearance });
  if (!res.ok) return { error: res.error };
  refresh(res.id, orgId);
  redirect(`/app/deals/${res.id}`);
}

/** ใช้ทั้งจากฟอร์ม (Path ในหน้าดีล) และจากการลากในไปป์ไลน์ */
export async function moveDealAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "write");
  if (no) return { error: no };
  const id = str(fd, "dealId");
  const res = await moveDeal(v.tenantId, id, str(fd, "stage"), { id: v.actor, clearance: v.clearance });
  if (!res.ok) return { error: res.error };
  refresh(id);
  return { ok: "ย้ายขั้นแล้ว" };
}

export async function updateDealAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "write");
  if (no) return { error: no };
  const id = str(fd, "dealId");
  const field = str(fd, "field");
  if (field !== "value" && field !== "expected_close" && field !== "name") return { error: "ช่องนี้แก้ไม่ได้" };
  const res = await updateDeal(v.tenantId, id, field, str(fd, "value_raw"), { id: v.actor, clearance: v.clearance });
  if (!res.ok) return { error: res.error };
  refresh(id);
  return { ok: "บันทึกแล้ว" };
}
