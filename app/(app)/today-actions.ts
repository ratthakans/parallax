"use server";

import { revalidatePath } from "next/cache";
import { denied, viewer } from "@/app/(app)/viewer";
import { acknowledgeItem, snoozeItem } from "@/lib/engine/today";
import type { ActionState } from "@/lib/shared/action-state";
import { bangkokDay } from "@/lib/shared/format";

/* ── หน้า "วันนี้" (docs/solo-plan.md S1) ─────────────────────────
   เลื่อน/รับทราบเป็นของผู้ใช้แต่ละคน — บัญชีและผู้ใช้มาจากฝั่งเซิร์ฟเวอร์เสมอ (viewer.ts) */

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

export async function snoozeAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "write");
  if (no) return { error: no };
  const days = Math.max(1, Math.min(30, Number(str(fd, "days")) || 1));
  const res = await snoozeItem(v.tenantId, v.actor, str(fd, "kind"), str(fd, "id"), bangkokDay(Date.now() + days * 864e5));
  if (!res.ok) return { error: res.error };
  revalidatePath("/app/today");
  return { ok: days === 1 ? "เลื่อนไปพรุ่งนี้แล้ว" : `เลื่อนไป ${days} วันแล้ว` };
}

export async function acknowledgeAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "write");
  if (no) return { error: no };
  const res = await acknowledgeItem(v.tenantId, v.actor, str(fd, "kind"), str(fd, "id"));
  if (!res.ok) return { error: res.error };
  revalidatePath("/app/today");
  return { ok: "รับทราบแล้ว" };
}
