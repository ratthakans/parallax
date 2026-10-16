"use server";

import { revalidatePath } from "next/cache";
import { viewer } from "@/app/(app)/viewer";
import { approveExport, cancelExport, requestExport, scopeFrom } from "@/lib/engine/exports";
import { thaiDateTime } from "@/lib/shared/format";
import type { ActionState } from "@/lib/shared/action-state";

/* ── ส่งออกแบบขออนุมัติ (B6) ── ขอ · อนุมัติ · ยกเลิก = เจ้าของบัญชี (เหมือนสิทธิ์ส่งออกเดิม)
   บัญชีและผู้กระทำมาจากฝั่งเซิร์ฟเวอร์เสมอ · กติกาคนเดียว/สองคนอยู่ใน engine */

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");
const OWNER_ONLY = "เฉพาะเจ้าของบัญชีเท่านั้นที่ส่งออกรายชื่อได้";

export async function requestExportAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  if (v.role !== "owner") return { error: OWNER_ONLY };
  const res = await requestExport(v.tenantId, scopeFrom({ q: str(fd, "q"), filter: str(fd, "filter"), sort: str(fd, "sort") }), str(fd, "reason"), v.actor);
  if (!res.ok) return { error: res.error };
  revalidatePath("/app/exports");
  return { ok: "ส่งคำขอแล้ว — รออนุมัติด้านล่าง" };
}

export async function approveExportAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  if (v.role !== "owner") return { error: OWNER_ONLY };
  const res = await approveExport(v.tenantId, str(fd, "requestId"), v.actor);
  if (!res.ok) return { error: res.error };
  revalidatePath("/app/exports");
  return { ok: res.self ? `อนุมัติตัวเองแล้ว — ดาวน์โหลดได้ตั้งแต่ ${thaiDateTime(res.readyAt)} (ยกเลิกได้ระหว่างรอ)` : "อนุมัติแล้ว — ผู้ขอดาวน์โหลดได้ทันที" };
}

export async function cancelExportAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  if (v.role !== "owner") return { error: OWNER_ONLY };
  const res = await cancelExport(v.tenantId, str(fd, "requestId"), v.actor);
  if (!res.ok) return { error: res.error };
  revalidatePath("/app/exports");
  return { ok: "ยกเลิกแล้ว" };
}
