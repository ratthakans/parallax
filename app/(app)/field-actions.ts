"use server";

import { revalidatePath } from "next/cache";
import { denied, viewer } from "@/app/(app)/viewer";
import { archiveField, createField, setValue, type FieldEntity } from "@/lib/engine/custom-fields";
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
