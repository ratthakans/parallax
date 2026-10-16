"use server";

import { revalidatePath } from "next/cache";
import { denied, viewer } from "@/app/(app)/viewer";
import { setDigestPrefs } from "@/lib/engine/digest";
import { currentUser } from "@/lib/shared/session";
import { membershipEnforced } from "@/lib/engine/access";
import type { ActionState } from "@/lib/shared/action-state";
import { WEEKDAY_TH, isDigestWeekday } from "@/lib/shared/digest";

/* ── สรุปรายสัปดาห์ถึงตัวเอง (docs/solo-plan.md S8) ─────────────────
   ความชอบเป็นของผู้ใช้แต่ละคนในแต่ละบัญชี — บัญชีและผู้ใช้มาจากฝั่งเซิร์ฟเวอร์เสมอ ไม่รับจากฟอร์ม */

export async function saveDigestPrefsAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "write");
  if (no) return { error: no };
  const user = membershipEnforced() ? await currentUser() : null;
  if (!user) return { error: "โหมดเดโมไม่มีการเข้าสู่ระบบ — ตั้งสรุปรายสัปดาห์ได้เมื่อเชื่อม Supabase" };
  const enabled = fd.get("enabled") === "1";
  const weekday = Number(fd.get("weekday"));
  const res = await setDigestPrefs(v.tenantId, user.userId, { enabled, weekday });
  if (!res.ok) return { error: res.error };
  revalidatePath("/app/settings");
  return { ok: enabled && isDigestWeekday(weekday) ? `จะส่งสรุปทุก${WEEKDAY_TH[weekday]} 08:00 ถึง ${user.email}` : "ปิดสรุปรายสัปดาห์แล้ว" };
}
