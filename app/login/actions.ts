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
  /* redirect ทำงานด้วยการ throw จึงต้องอยู่นอกบล็อกที่จับ error */
  redirect(next.startsWith("/app") ? next : "/app");
}

export async function signOutAction() {
  const sb = await supabaseServer();
  await sb.auth.signOut();
  revalidatePath("/app", "layout");
  redirect("/login");
}
