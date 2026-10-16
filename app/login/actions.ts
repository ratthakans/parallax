"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/shared/supabase";
import type { ActionState } from "@/lib/shared/action-state";

/* ── เข้าสู่ระบบ / ออกจากระบบ ───────────────────────────────────

   ทุกความล้มเหลวเป็นค่าที่คืนออกมา ไม่ใช่การ throw — Next ตัดข้อความ
   ของ error ที่โยนออกจากเซิร์ฟเวอร์ทิ้งบน production ผู้ใช้จะได้เห็นแค่
   "เกิดข้อผิดพลาด" ซึ่งไม่ช่วยอะไรกับหน้าที่มีช่องกรอกสองช่อง
   ───────────────────────────────────────────────────────────── */

export async function signInAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "") || "/app";

  if (!email || !password) return { error: "กรอกอีเมลและรหัสผ่าน" };

  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithPassword({ email, password });

  if (error) {
    /* ── ข้อความเดียวสำหรับทั้งอีเมลผิดและรหัสผ่านผิด ──

       ถ้าแยกสองข้อความ หน้านี้จะกลายเป็นเครื่องมือตรวจว่าอีเมลไหน
       มีบัญชีอยู่ในระบบ ซึ่งเป็นข้อมูลที่ไม่ควรแจกให้คนที่ยังไม่ล็อกอิน */
    return { error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" };
  }

  revalidatePath("/app", "layout");
  const dest = next.startsWith("/app") ? next : "/app";
  /* เปิดยืนยันสองชั้นไว้ = รหัสผ่านอย่างเดียวยังไม่พอ ไปหน้ารหัสจากแอปก่อน */
  const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") redirect(`/login/mfa?next=${encodeURIComponent(dest)}`);
  /* redirect ทำงานด้วยการ throw จึงต้องอยู่นอกบล็อกที่จับ error */
  redirect(dest);
}

/* ── รหัสจากแอปยืนยันตัวตน (TOTP) ── ใช้ตอนเข้าสู่ระบบ และตอนยืนยันแอปที่เพิ่งเพิ่ม (factorId มาจากฟอร์มเปิดใช้)
   ไม่บอกว่ารหัสผิดเพราะอะไร · Supabase จำกัดจำนวนครั้งที่ลองเอง */
export async function verifyMfaAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  const next = String(formData.get("next") ?? "") || "/app";
  if (!/^\d{6}$/.test(code)) return { error: "ใส่รหัส 6 หลักจากแอป" };
  const sb = await supabaseServer();
  let factorId = String(formData.get("factorId") ?? "");
  if (!factorId) {
    const { data } = await sb.auth.mfa.listFactors();
    factorId = data?.totp?.[0]?.id ?? "";
  }
  if (!factorId) return { error: "บัญชีนี้ยังไม่ได้เปิดยืนยันสองชั้น" };
  const { error } = await sb.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) return { error: "รหัสไม่ถูกต้องหรือหมดเวลา — ลองรหัสใหม่จากแอป" };
  revalidatePath("/app", "layout");
  if (formData.get("factorId")) return { ok: "เปิดยืนยันตัวตนสองชั้นแล้ว — ครั้งหน้าเข้าสู่ระบบต้องใช้รหัสจากแอปด้วย" };
  redirect(next.startsWith("/app") ? next : "/app");
}

export async function signOutAction() {
  const sb = await supabaseServer();
  await sb.auth.signOut();
  revalidatePath("/app", "layout");
  redirect("/login");
}
