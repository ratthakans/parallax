"use server";

import { revalidatePath } from "next/cache";
import { denied, viewer } from "@/app/(app)/viewer";
import { archiveField, createField, setValue, type FieldEntity } from "@/lib/engine/custom-fields";
import { deleteView, saveView } from "@/lib/engine/saved-views";
import { can } from "@/lib/shared/roles";
import type { ActionState } from "@/lib/shared/action-state";

/* ── ฟิลด์กำหนดเอง (docs/crm-plan.md C4) ── นิยามฟิลด์ = สิทธิ์ fields · กรอกค่า = สิทธิ์ write
   บัญชีและผู้กระทำมาจากฝั่งเซิร์ฟเวอร์ · ระเบียนเกินสิทธิ์ถูกปฏิเสธใน engine (orgAccess) */

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

export async function createFieldAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "fields");
  if (no) return { error: no };
  const res = await createField(v.tenantId, { entity: str(fd, "entity"), label: str(fd, "label"), kind: str(fd, "kind"), options: str(fd, "options") }, v.actor);
  if (!res.ok) return { error: res.error };
  revalidatePath("/app/settings/fields");
  return { ok: "เพิ่มฟิลด์แล้ว — กรอกค่าได้ในแท็บรายละเอียดของบริษัทหรือหน้าดีล" };
}

export async function archiveFieldAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "fields");
  if (no) return { error: no };
  const res = await archiveField(v.tenantId, str(fd, "fieldId"), str(fd, "archived") === "1", v.actor);
  if (!res.ok) return { error: res.error };
  revalidatePath("/app/settings/fields");
  return { ok: str(fd, "archived") === "1" ? "ซ่อนแล้ว — ค่าเดิมยังอยู่" : "เปิดใช้อีกครั้งแล้ว" };
}

export async function setFieldValueAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "write");
  if (no) return { error: no };
  const entity = str(fd, "entity") === "deal" ? "deal" : "org" as FieldEntity;
  const id = str(fd, "recordId");
  const res = await setValue(v.tenantId, entity, id, str(fd, "fieldId"), str(fd, "value"), { id: v.actor, clearance: v.clearance });
  if (!res.ok) return { error: res.error };
  revalidatePath(entity === "deal" ? `/app/deals/${id}` : `/app/accounts/${id}`);
  return { ok: "บันทึกแล้ว" };
}

/* ── มุมมองรายการที่บันทึกไว้ (C5) ── ส่วนตัว = สิทธิ์ write · แชร์ให้ทั้งบัญชี = สิทธิ์ fields */
const LIST_PATH: Record<string, string> = { accounts: "/app/accounts", deals: "/app/deals", pivot: "/app/reports/pivot" };

export async function saveViewAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "write");
  if (no) return { error: no };
  const shared = str(fd, "shared") === "1";
  if (shared && !can(v.role, "fields")) return { error: "แชร์มุมมองให้ทั้งบัญชีได้เฉพาะ Data steward หัวหน้าทีม หรือเจ้าของบัญชี — บันทึกเป็นมุมมองส่วนตัวแทน" };
  const res = await saveView(v.tenantId, { list: str(fd, "list"), name: str(fd, "name"), query: str(fd, "query"), shared }, v.actor);
  if (!res.ok) return { error: res.error };
  revalidatePath(LIST_PATH[str(fd, "list")] ?? "/app");
  return { ok: "บันทึกมุมมองแล้ว" };
}

export async function deleteViewAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "write");
  if (no) return { error: no };
  const res = await deleteView(v.tenantId, str(fd, "viewId"), v.actor);
  if (!res.ok) return { error: res.error };
  revalidatePath(LIST_PATH[str(fd, "list")] ?? "/app");
  return { ok: "ลบมุมมองแล้ว" };
}
