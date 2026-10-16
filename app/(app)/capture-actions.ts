"use server";

import { revalidatePath } from "next/cache";
import { denied, viewer } from "@/app/(app)/viewer";
import { orgAccess } from "@/lib/engine/accounts";
import { confirmNote, draftNote, type DraftResult } from "@/lib/engine/accounts/notes";
import { captureCards, type CaptureResult, type CardInput } from "@/lib/engine/vault/cards";
import type { ActionState } from "@/lib/shared/action-state";
import type { Classification } from "@/lib/shared/vault";

/* ── จดก่อน จัดทีหลัง (docs/solo-plan.md S6) ───────────────────────
   บัญชี ผู้กระทำ และระดับสิทธิ์มาจากฝั่งเซิร์ฟเวอร์เสมอ (viewer.ts)
   โน้ต = งานประจำ (write) · นามบัตร = นำเข้าแหล่งข้อมูล (import) */

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");
const who = (v: { actor: string; clearance: Classification }) => ({ id: v.actor, clearance: v.clearance });

/** แยกโน้ตเป็นร่าง — ไม่บันทึกอะไร ผู้ใช้ต้องยืนยันในขั้นถัดไป */
export async function draftNoteAction(fd: FormData): Promise<DraftResult> {
  const v = await viewer();
  const no = denied(v, "write");
  if (no) return { ok: false, error: no };
  const orgId = str(fd, "orgId");
  const gate = await orgAccess(v.tenantId, orgId, who(v));
  if (!gate.ok) return { ok: false, error: gate.error };
  return draftNote(v.tenantId, orgId, str(fd, "note"), who(v));
}

export async function confirmNoteAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "write");
  if (no) return { error: no };
  const orgId = str(fd, "orgId");
  const gate = await orgAccess(v.tenantId, orgId, who(v));
  if (!gate.ok) return { error: gate.error };
  const res = await confirmNote(v.tenantId, orgId, {
    note: str(fd, "note"), kind: str(fd, "kind"), occurredAt: str(fd, "occurredAt"), personIds: fd.getAll("personIds").map(String),
    summary: str(fd, "summary"), outcome: str(fd, "outcome"), taskTitle: str(fd, "taskTitle"), taskDue: str(fd, "taskDue"),
    interests: str(fd, "interests").split(/\n|·/).map((x) => x.trim()).filter(Boolean), classification: str(fd, "classification"),
  }, who(v));
  if (!res.ok) return { error: res.error };
  revalidatePath(`/app/accounts/${orgId}`);
  revalidatePath("/app/today");
  return { ok: res.taskId ? "บันทึกการติดต่อและงานถัดไปแล้ว — โน้ตต้นฉบับเก็บเป็นหลักฐาน" : "บันทึกการติดต่อแล้ว — โน้ตต้นฉบับเก็บเป็นหลักฐาน" };
}

/** นามบัตรทั้งชุด (กรอกมือ) → Data Vault แหล่ง namecard → ตรวจตัวตน */
export async function captureCardsAction(fd: FormData): Promise<CaptureResult> {
  const v = await viewer();
  const no = denied(v, "import");
  if (no) return { ok: false, error: no };
  let cards: CardInput[] = [];
  try {
    const raw = JSON.parse(str(fd, "cards") || "[]") as unknown;
    cards = Array.isArray(raw) ? raw.map((c) => {
      const o = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
      const s = (k: string) => (typeof o[k] === "string" ? (o[k] as string).slice(0, 200) : "");
      return { name: s("name"), title: s("title"), company: s("company"), email: s("email"), phone: s("phone") };
    }) : [];
  } catch {
    return { ok: false, error: "อ่านรายการนามบัตรไม่ได้ — ลองใหม่อีกครั้ง" };
  }
  const res = await captureCards(v.tenantId, { event: str(fd, "event"), date: str(fd, "date"), cards }, v.actor);
  if (res.ok) revalidatePath("/app/vault");
  return res;
}
