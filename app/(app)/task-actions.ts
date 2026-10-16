"use server";

import { revalidatePath } from "next/cache";
import { denied, viewer } from "@/app/(app)/viewer";
import { completeTask } from "@/lib/engine/tasks";
import type { ActionState } from "@/lib/shared/action-state";

/* ── งาน (docs/ux-plan.md U5) ── ปิดงานทั่วไป = งานประจำ (write) · งานแคมเปญปิดที่หน้าแคมเปญ */
export async function completeTaskAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "write");
  if (no) return { error: no };
  const res = await completeTask(v.tenantId, String(fd.get("taskId") ?? ""), String(fd.get("outcome") ?? ""), { id: v.actor, clearance: v.clearance });
  if (!res.ok) return { error: res.error };
  revalidatePath("/app/tasks");
  revalidatePath("/app/today");
  return { ok: "ปิดงานแล้ว" };
}
