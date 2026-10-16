"use server";

import { revalidatePath } from "next/cache";
import { denied, viewer } from "@/app/(app)/viewer";
import { approveExport, cancelExport, requestExport, scopeFrom } from "@/lib/engine/exports";
import { thaiDateTime } from "@/lib/shared/format";
import type { ActionState } from "@/lib/shared/action-state";

/* ── ส่งออกแบบขออนุมัติ (B6) ── ขอ/ยกเลิก = export_request · อนุมัติ = export_approve (lib/shared/roles.ts)
   บัญชีและผู้กระทำมาจากฝั่งเซิร์ฟเวอร์เสมอ · กติกาคนเดียว/สองคนอยู่ใน engine */

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

export async function requestExportAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "export_request");
  if (no) return { error: no };
  const res = await requestExport(v.tenantId, scopeFrom({ q: str(fd, "q"), filter: str(fd, "filter"), sort: str(fd, "sort") }), str(fd, "reason"), v.actor);
  if (!res.ok) return { error: res.error };
  revalidatePath("/app/exports");
  return { ok: "ส่งคำขอแล้ว — รออนุมัติด้านล่าง" };
}

export async function approveExportAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "export_approve");
  if (no) return { error: no };
  const res = await approveExport(v.tenantId, str(fd, "requestId"), v.actor);
  if (!res.ok) return { error: res.error };
  revalidatePath("/app/exports");
  return { ok: res.self ? `อนุมัติตัวเองแล้ว — ดาวน์โหลดได้ตั้งแต่ ${thaiDateTime(res.readyAt)} (ยกเลิกได้ระหว่างรอ)` : "อนุมัติแล้ว — ผู้ขอดาวน์โหลดได้ทันที" };
}

export async function cancelExportAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "export_request") && denied(v, "export_approve");
  if (no) return { error: no };
  const res = await cancelExport(v.tenantId, str(fd, "requestId"), v.actor);
  if (!res.ok) return { error: res.error };
  revalidatePath("/app/exports");
  return { ok: "ยกเลิกแล้ว" };
}
