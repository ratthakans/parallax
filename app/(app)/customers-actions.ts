"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { activeTenantId } from "@/app/(app)/tenant";
import { denied, viewer } from "@/app/(app)/viewer";
import { currentUser } from "@/lib/shared/session";
import { membershipEnforced } from "@/lib/engine/access";
import { get } from "@/lib/engine/sql";
import { revealContactPoint } from "@/lib/engine/contacts";
import {
  PROFILE_FIELDS,
  addContact,
  createCustomer,
  deleteCustomer,
  mergeCustomers,
  removeContact,
  setConsent,
  updateCustomer,
} from "@/lib/engine/customers";
import { CONTACT_KIND_ORDER } from "@/lib/shared/contact-kinds";
import type { ActionState } from "@/lib/shared/action-state";

/* ── การจัดการลูกค้าทีละคน ───────────────────────────────────────

   แยกจาก actions.ts เพราะไฟล์นั้นยาวกว่า 500 บรรทัดแล้ว และทุกอย่างที่นี่
   เป็นเรื่องเดียวกัน: ข้อมูลของคนหนึ่งคน

   บัญชีที่ทำงานด้วยมาจากฝั่งเซิร์ฟเวอร์เสมอ (activeTenantId) — ค่า tenantId
   ในฟอร์มใช้ตรวจแค่ว่าหน้าจอเปิดอยู่กับบัญชีเดียวกัน เหมือน currentTenant
   ใน actions.ts ส่วนรหัสลูกค้าที่ส่งมา ชั้น engine ตรวจซ้ำว่าอยู่ในบัญชีนี้จริง */

async function scope(fd: FormData): Promise<{ tenantId: string; actor: string }> {
  const tenantId = await activeTenantId();
  const claimed = String(fd.get("tenantId") ?? "");
  if (claimed && claimed !== tenantId) {
    throw new Error("หน้านี้เปิดอยู่กับบัญชีอื่น — โหลดหน้าใหม่ก่อน");
  }
  const user = await currentUser();
  return { tenantId, actor: user?.email || "owner" };
}

const field = (fd: FormData, k: string) => String(fd.get(k) ?? "");

function profileFrom(fd: FormData) {
  return Object.fromEntries(PROFILE_FIELDS.map((f) => [f, field(fd, f)]));
}

function refresh(id?: string) {
  revalidatePath("/app/customers");
  if (id) revalidatePath(`/app/customers/${id}`);
}

export async function createCustomerAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { tenantId, actor } = await scope(fd);
  const contacts = CONTACT_KIND_ORDER.map((kind) => ({ kind, value: field(fd, `contact_${kind}`) }));
  const res = await createCustomer(
    tenantId,
    { name: field(fd, "name"), contacts, profile: profileFrom(fd), consent: fd.get("consent") === "1" },
    actor,
  );
  if (!res.ok) return { error: res.error };
  refresh(res.id);
  redirect(`/app/customers/${res.id}?created=1`);
}

export async function updateCustomerAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { tenantId, actor } = await scope(fd);
  const id = field(fd, "customerId");
  const res = await updateCustomer(tenantId, id, { name: field(fd, "name"), profile: profileFrom(fd) }, actor);
  if (!res.ok) return { error: res.error };
  refresh(id);
  return { ok: "บันทึกแล้ว" };
}

export async function addContactAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { tenantId, actor } = await scope(fd);
  const id = field(fd, "customerId");
  const res = await addContact(tenantId, id, field(fd, "kind"), field(fd, "value"), field(fd, "label"), actor);
  if (!res.ok) return { error: res.error };
  refresh(id);
  return {
    ok: res.sharedWith
      ? `เพิ่มแล้ว · ค่านี้มีลูกค้าอีก ${res.sharedWith} คนใช้อยู่ด้วย (เช่น เบอร์บ้าน)`
      : "เพิ่มแล้ว",
  };
}

export async function removeContactAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { tenantId, actor } = await scope(fd);
  const res = await removeContact(tenantId, field(fd, "pointId"), actor);
  if (!res.ok) return { error: res.error };
  refresh(field(fd, "customerId"));
  return { ok: "ลบแล้ว" };
}

/* ค่าเต็มกลับไปเป็นข้อความผลลัพธ์ของปุ่มเท่านั้น ไม่ถูกเรนเดอร์ลงหน้า
   หรือ cache — โหลดหน้าใหม่แล้วกลับเป็นค่าที่ปิดบางส่วนเหมือนเดิม */
export async function revealContactAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { tenantId, actor } = await scope(fd);
  const value = await revealContactPoint(tenantId, field(fd, "pointId"), actor);
  return value == null ? { error: "ไม่พบช่องทางนี้" } : { ok: value };
}

export async function setConsentAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { tenantId, actor } = await scope(fd);
  const id = field(fd, "customerId");
  const granted = field(fd, "granted") === "1";
  const res = await setConsent(tenantId, id, granted, actor);
  if (!res.ok) return { error: res.error };
  refresh(id);
  return {
    ok: granted
      ? "บันทึกว่ายินยอมแล้ว — จะเข้าเกณฑ์ของบรีฟหลังคำนวณข้อมูลลูกค้ารอบถัดไป"
      : "ถอนแล้ว — จะไม่มีข้อความออกไปหาคนนี้ ตั้งแต่ตอนนี้ แม้อยู่ในแคมเปญที่อนุมัติไว้แล้ว",
  };
}

export async function deleteCustomerAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { tenantId, actor } = await scope(fd);
  const no = denied(await viewer(), "privacy");
  if (no) return { error: no };
  const id = field(fd, "customerId");
  const reason = (["request", "retention", "manual"] as const).find((r) => r === field(fd, "reason")) ?? "manual";
  const res = await deleteCustomer(tenantId, id, actor, { reason, requestRef: field(fd, "requestRef") || null });
  if (!res.ok) return { error: res.error };
  refresh(id);
  // ไม่ใส่ชื่อใน URL — ชื่อคือข้อมูลส่วนบุคคล และ URL ไปอยู่ใน log กับประวัติเบราว์เซอร์
  redirect("/app/customers?deleted=1");
}

/* รวมอีกคนเข้ามาที่คนนี้ — คนที่เปิดหน้าอยู่คือคนที่เหลือ อีกคนหายไป */
export async function mergeCustomerAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { tenantId, actor } = await scope(fd);
  const keepId = field(fd, "customerId");
  const dropId = field(fd, "otherId");
  const res = await mergeCustomers(tenantId, keepId, dropId, actor);
  if (!res.ok) return { error: res.error };
  refresh(keepId);
  revalidatePath(`/app/customers/${dropId}`);
  /* กลับมาหน้าเดิมพร้อมป้ายบอก — ส่วน "อาจเป็นคนเดียวกัน" หายไปหลังรวม
     ข้อความผลลัพธ์ของปุ่มจึงหายตามไปด้วย ผู้ใช้จะไม่รู้ว่ารวมสำเร็จ */
  redirect(`/app/customers/${keepId}?merged=${res.moved}`);
}
