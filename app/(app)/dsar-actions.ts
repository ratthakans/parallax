"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { denied, viewer } from "@/app/(app)/viewer";
import { closeRequest, openRequest, verifyIdentity } from "@/lib/engine/dsar";
import type { ActionState } from "@/lib/shared/action-state";

/* ── คำขอสิทธิ (docs/plan.md หัวข้อ 7.4 · B6) ─────────────────────
   บัญชีและผู้กระทำมาจากฝั่งเซิร์ฟเวอร์เสมอ (viewer.ts) · รหัสคำขอ/คนที่ส่งมา engine ตรวจซ้ำว่าอยู่ในบัญชีนี้
   เปิด/ยืนยันตัวตน = เขียนได้ · ปิดคำขอ = เจ้าของบัญชี (ปิดคำขอลบ = ลบคนจริง · ปิดคำขอเข้าถึง = ยืนยันว่าส่งข้อมูลเต็มออกไปแล้ว) */

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

function refresh(id?: string) {
  revalidatePath("/app/requests");
  revalidatePath("/app/today");
  revalidatePath("/app/customers");
  if (id) revalidatePath(`/app/requests/${id}`);
}

export async function openRequestAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "write");
  if (no) return { error: no };
  const res = await openRequest(v.tenantId, {
    kind: str(fd, "kind"), channel: str(fd, "channel"), receivedAt: str(fd, "receivedAt"),
    subjectId: str(fd, "subjectId") || undefined, contactKind: str(fd, "contactKind"), contactValue: str(fd, "contactValue"),
  }, v.actor);
  if (!res.ok) return { error: res.error };
  refresh(res.id);
  // ไปหน้าคำขอ — URL มีแค่รหัสคำขอ ไม่มีอีเมลหรือเบอร์ที่พิมพ์มา
  redirect(`/app/requests/${res.id}`);
}

export async function verifyIdentityAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "write");
  if (no) return { error: no };
  const id = str(fd, "requestId");
  const res = await verifyIdentity(v.tenantId, id, str(fd, "note"), v.actor);
  if (!res.ok) return { error: res.error };
  refresh(id);
  return { ok: "บันทึกการยืนยันตัวตนแล้ว" };
}

export async function closeRequestAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "privacy");
  if (no) return { error: no };
  const id = str(fd, "requestId");
  const res = await closeRequest(v.tenantId, id, { outcome: str(fd, "outcome"), note: str(fd, "note"), purposeId: str(fd, "purposeId") || null }, v.actor);
  if (!res.ok) return { error: res.error };
  refresh(id);
  return { ok: `ปิดคำขอแล้ว — ${res.effect}` };
}
