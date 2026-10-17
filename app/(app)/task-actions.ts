"use server";

import { revalidatePath } from "next/cache";
import { denied, viewer } from "@/app/(app)/viewer";
import { completeTask, createTask, updateTask } from "@/lib/engine/tasks";
import { orgByName } from "@/lib/engine/accounts/edit";
import type { ActionState } from "@/lib/shared/action-state";

/* ── งาน (docs/ux-plan.md U5 · docs/crm-plan.md E1) ── สร้าง · เลื่อน · ปิด = งานประจำ (write) · งานแคมเปญปิดที่หน้าแคมเปญ */

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

function refresh(fd: FormData) {
  revalidatePath("/app/tasks");
  revalidatePath("/app/today");
  const org = str(fd, "orgId"), deal = str(fd, "dealId"), person = str(fd, "personId");
  if (org) revalidatePath(`/app/accounts/${org}`);
  if (deal) revalidatePath(`/app/deals/${deal}`);
  if (person) revalidatePath(`/app/customers/${person}`);
}

export async function completeTaskAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "write");
  if (no) return { error: no };
  const res = await completeTask(v.tenantId, str(fd, "taskId"), str(fd, "outcome"), { id: v.actor, clearance: v.clearance });
  if (!res.ok) return { error: res.error };
  refresh(fd);
  return { ok: "ปิดงานแล้ว" };
}

export async function createTaskAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "write");
  if (no) return { error: no };
  /* จากหน้างาน: ช่องบริษัทเป็นชื่อ (OrgPicker) — หาบริษัทฝั่งเซิร์ฟเวอร์ */
  let orgId = str(fd, "orgId");
  if (!orgId && str(fd, "orgName").trim()) {
    orgId = (await orgByName(v.tenantId, str(fd, "orgName"))) ?? "";
    if (!orgId) return { error: "ไม่พบบริษัทชื่อนี้ — พิมพ์แล้วเลือกจากรายการ หรือเว้นว่าง" };
  }
  const res = await createTask(v.tenantId, {
    title: str(fd, "title"), due: str(fd, "due"), owner: str(fd, "owner"), orgId: orgId || undefined,
    personId: str(fd, "personId") || undefined, dealId: str(fd, "dealId") || undefined, priority: str(fd, "priority") || undefined,
  }, { id: v.actor, clearance: v.clearance });
  if (!res.ok) return { error: res.error };
  refresh(fd);
  if (orgId) revalidatePath(`/app/accounts/${orgId}`);
  return { ok: "สร้างงานแล้ว" };
}

export async function updateTaskAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "write");
  if (no) return { error: no };
  const res = await updateTask(v.tenantId, str(fd, "taskId"), {
    due: fd.has("due") ? str(fd, "due") : undefined, owner: fd.has("owner") ? str(fd, "owner") : undefined,
    priority: fd.has("priority") ? str(fd, "priority") : undefined,
  }, { id: v.actor, clearance: v.clearance });
  if (!res.ok) return { error: res.error };
  refresh(fd);
  return { ok: "บันทึกแล้ว" };
}
