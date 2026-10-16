"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/shared/supabase";
import { currentUser } from "@/lib/shared/session";
import { enterIdentity } from "@/lib/engine/sql";
import { createSignupTenant } from "@/lib/engine/signup";
import { SIGNUP_CLOSED_TH, signupEnabled, signupInputError } from "@/lib/shared/signup";
import { siteUrl } from "@/lib/shared/site-url";
import { TENANT_COOKIE, TENANT_COOKIE_OPTIONS } from "@/lib/shared/active-tenant";
import type { ActionState } from "@/lib/shared/action-state";

/* ── สมัครเอง (docs/solo-plan.md S9) ─────────────────────────────────

   สอง action ที่เกิด "ก่อนมีบัญชี" จึงไม่ผ่าน denied() — ยังไม่มีบัญชีให้มีบทบาท
   ด่านของทั้งคู่คือ SIGNUP_ENABLED (ปิดโดยปริยาย) เป็นบรรทัดแรก · การสร้างบัญชีมีด่านซ้ำใน engine
   และบน Postgres ฐานข้อมูลเองตรวจว่าทำให้ตัวเองครั้งเดียว (app.create_signup_tenant · 0019)

   ⚠ ธงนี้คุมแค่แอปของเรา — Supabase Auth รับสมัครผ่าน API ได้เองถ้าโปรเจกต์เปิด "Allow new users to sign up"
   คนที่สมัครทางนั้นตอนธงปิดจะได้ผู้ใช้เปล่า ไม่มีบัญชี (createWorkspaceAction ปฏิเสธ) — ปิดที่ Supabase ด้วยระหว่างนี้ */

export async function signUpAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  if (!signupEnabled()) return { error: SIGNUP_CLOSED_TH };
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  const bad = signupInputError(email, password, String(fd.get("confirm") ?? ""));
  if (bad) return { error: bad };
  if (fd.get("synthetic") !== "yes") return { error: "ยืนยันก่อนว่าจะใช้ข้อมูลสมมุติเท่านั้นระหว่างทดลอง" };

  const sb = await supabaseServer();
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${siteUrl()}/auth/confirm` },
  });
  /* ข้อความเดียวไม่ว่าเหตุผลอะไร (ยกเว้นรหัสผ่านอ่อน) — ไม่ให้หน้านี้เป็นเครื่องมือเช็กว่าอีเมลไหนมีบัญชีแล้ว */
  if (error) {
    if (error.code === "weak_password") return { error: "รหัสผ่านเดาง่ายเกินไป — ใช้วลียาว ๆ ที่ไม่ใช่คำทั่วไป" };
    return { error: "สมัครไม่สำเร็จ — ตรวจอีเมลและรหัสผ่าน แล้วลองอีกครั้งในอีกสักครู่" };
  }
  /* โปรเจกต์ที่ไม่บังคับยืนยันอีเมลได้ session ทันที — ไปตั้งค่าบัญชีต่อเลย */
  if (data.session) redirect("/onboarding");
  return { ok: "ส่งลิงก์ยืนยันไปที่อีเมลแล้ว — กดลิงก์ในอีเมล แล้วเข้าสู่ระบบเพื่อตั้งค่าบัญชีต่อ" };
}

/** ผู้ใช้ที่ล็อกอินแล้วแต่ยังไม่มีบัญชี → บัญชีของตัวเองหนึ่งบัญชี (เจ้าของ · โหมดคนเดียว · ทดลอง 14 วัน · AI ปิด) */
export async function createWorkspaceAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  if (!signupEnabled()) return { error: SIGNUP_CLOSED_TH };
  const user = await currentUser();
  if (!user) redirect("/login?next=/app");
  if (user.mfa === "pending") redirect("/login/mfa?next=/onboarding");
  /* ทุก query ต่อจากนี้ในนามผู้ใช้ — บน Postgres ฟังก์ชันสร้างบัญชีอ่าน auth.uid() จากตรงนี้ */
  enterIdentity(user.userId);
  const res = await createSignupTenant(user.userId, String(fd.get("name") ?? ""), user.email || user.userId);
  if (!res.ok) return { error: res.error };
  (await cookies()).set(TENANT_COOKIE, res.tenantId, TENANT_COOKIE_OPTIONS);
  redirect("/onboarding");
}
