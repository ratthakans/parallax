"use server";

import { revalidatePath } from "next/cache";
import { activeTenantId } from "@/app/(app)/tenant";
import { currentUser } from "@/lib/shared/session";
import { supabaseServer } from "@/lib/shared/supabase";
import { logActivity } from "@/lib/engine/db";
import type { ActionState } from "@/lib/shared/action-state";
import { isSelfSignup } from "@/lib/engine/signup/gate";

/* ── เปิด/ปิดยืนยันตัวตนสองชั้น (TOTP · B6) ─────────────────────
   เป็นเรื่องของผู้ใช้แต่ละคน ไม่ใช่ของบัญชี — ทุกบทบาททำได้ · Supabase ถือความลับ ระบบเราไม่เก็บ
   ยืนยันแอปที่เพิ่ม = verifyMfaAction (app/login/actions.ts) พร้อม factorId · ปิดได้เฉพาะรอบที่ยืนยันสองชั้นแล้ว (Supabase บังคับ) */

export type EnrollState = { error?: string; factorId?: string; qr?: string; secret?: string } | null;

export async function startMfaEnrollAction(_p: EnrollState): Promise<EnrollState> {
  const user = await currentUser();
  if (!user) return { error: "เข้าสู่ระบบก่อน" };
  const sb = await supabaseServer();
  /* แอปที่เริ่มเพิ่มแล้วไม่ได้ยืนยัน ค้างอยู่จะทำให้เพิ่มใหม่ไม่ได้ — ลบทิ้งก่อน */
  const { data: list } = await sb.auth.mfa.listFactors();
  for (const f of list?.all ?? []) if (f.status === "unverified") await sb.auth.mfa.unenroll({ factorId: f.id });
  const { data, error } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: `PARALLAX ${new Date().toISOString().slice(0, 10)}` });
  if (error || !data) return { error: "เริ่มเปิดใช้ไม่สำเร็จ — ลองอีกครั้ง" };
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

export async function removeMfaAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await currentUser();
  if (!user) return { error: "เข้าสู่ระบบก่อน" };
  if (user.mfa !== "verified") return { error: "ปิดยืนยันสองชั้นได้เฉพาะรอบที่เข้าสู่ระบบด้วยรหัสจากแอปแล้ว" };
  /* บัญชีสมัครเองบังคับยืนยันสองชั้นตั้งแต่วันแรก (S9) — ปิดแล้วคอนโซลจะพากลับไปขั้นตั้งค่าอยู่ดี จึงไม่ให้ปิด */
  if (await isSelfSignup(await activeTenantId())) return { error: "บัญชีที่สมัครเองต้องเปิดยืนยันสองชั้นไว้เสมอ — เพิ่มแอปใหม่ก่อนถ้าจะเปลี่ยนเครื่อง" };
  const sb = await supabaseServer();
  const { error } = await sb.auth.mfa.unenroll({ factorId: String(fd.get("factorId") ?? "") });
  if (error) return { error: "ปิดไม่สำเร็จ — ลองอีกครั้ง" };
  await logActivity(await activeTenantId(), user.email, "mfa_disable", user.userId);
  revalidatePath("/app/settings");
  return { ok: "ปิดยืนยันสองชั้นแล้ว — การส่งออกและคำขอสิทธิจะทำไม่ได้จนกว่าจะเปิดอีกครั้ง" };
}
