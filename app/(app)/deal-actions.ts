"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { denied, viewer } from "@/app/(app)/viewer";
import { createDeal, moveDeal, removeDealPerson, setDealPerson, updateDeal } from "@/lib/engine/deals";
import { logInteraction, orgByName } from "@/lib/engine/accounts/edit";
import { get } from "@/lib/engine/sql";
import { addItem, listItems, removeItem } from "@/lib/engine/deal-items";
import { orgAccess } from "@/lib/engine/accounts";
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

/* ── คนในดีลพร้อมบทบาท · กิจกรรมของดีล (docs/crm-plan.md C1) ── */
export async function setDealPersonAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "write");
  if (no) return { error: no };
  const id = str(fd, "dealId");
  const res = await setDealPerson(v.tenantId, id, str(fd, "personId"), str(fd, "role"), { id: v.actor, clearance: v.clearance });
  if (!res.ok) return { error: res.error };
  refresh(id);
  return { ok: "บันทึกแล้ว" };
}

export async function removeDealPersonAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "write");
  if (no) return { error: no };
  const id = str(fd, "dealId");
  const res = await removeDealPerson(v.tenantId, id, str(fd, "personId"), { id: v.actor, clearance: v.clearance });
  if (!res.ok) return { error: res.error };
  refresh(id);
  return { ok: "เอาออกแล้ว" };
}

export async function logDealActivityAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "write");
  if (no) return { error: no };
  const id = str(fd, "dealId");
  /* บริษัทมาจากดีลในฐาน ไม่ใช่จากฟอร์ม · ตรวจสิทธิ์บริษัทเหมือนการแก้ดีล */
  const d = await get<{ org_id: string }>("SELECT org_id FROM opportunities WHERE tenant_id = ? AND id = ?", v.tenantId, id);
  if (!d) return { error: "ไม่พบดีลนี้" };
  const access = await orgAccess(v.tenantId, d.org_id, { id: v.actor, clearance: v.clearance });
  if (!access.ok) return { error: access.error };
  const res = await logInteraction(v.tenantId, d.org_id, {
    kind: str(fd, "kind"), occurredAt: str(fd, "occurredAt"), personId: str(fd, "personId") || undefined, opportunityId: id,
    summary: str(fd, "summary"), outcome: str(fd, "outcome"), classification: str(fd, "classification") || undefined,
  }, v.actor);
  if (!res.ok) return { error: res.error };
  refresh(id, d.org_id);
  const person = str(fd, "personId");
  if (person) revalidatePath(`/app/customers/${person}`);
  return { ok: "บันทึกแล้ว — ขึ้นทั้งหน้าดีล หน้าบริษัท และหน้าผู้ติดต่อ" };
}

/* ── แพ็กเกจในดีล (docs/crm-plan.md C4) ── */
export async function addDealItemAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "write");
  if (no) return { error: no };
  const id = str(fd, "dealId");
  const res = await addItem(v.tenantId, id, { package: str(fd, "package"), qty: str(fd, "qty"), unitPrice: str(fd, "unitPrice") }, { id: v.actor, clearance: v.clearance });
  if (!res.ok) return { error: res.error };
  refresh(id);
  return { ok: "เพิ่มแพ็กเกจแล้ว" };
}

export async function removeDealItemAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "write");
  if (no) return { error: no };
  const id = str(fd, "dealId");
  const res = await removeItem(v.tenantId, id, str(fd, "itemId"), { id: v.actor, clearance: v.clearance });
  if (!res.ok) return { error: res.error };
  refresh(id);
  return { ok: "เอาออกแล้ว" };
}

/** ใช้ยอดรวมของแพ็กเกจเป็นมูลค่าดีล — ผ่าน updateDeal จึงมีรุ่นในประวัติเหมือนแก้เอง */
export async function syncDealValueAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "write");
  if (no) return { error: no };
  const id = str(fd, "dealId");
  const items = await listItems(v.tenantId, id);
  if (!items.length) return { error: "ยังไม่มีแพ็กเกจ" };
  const total = items.reduce((t, i) => t + (i.total ?? 0), 0);
  const res = await updateDeal(v.tenantId, id, "value", String(total), { id: v.actor, clearance: v.clearance });
  if (!res.ok) return { error: res.error };
  refresh(id);
  return { ok: "ตั้งมูลค่าดีลตามยอดรวมแพ็กเกจแล้ว" };
}
