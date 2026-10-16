import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/shared/supabase";
import type { MfaLevel } from "@/lib/shared/roles";

/* ── ใครเป็นเจ้าของคำขอนี้ ─────────────────────────────────────

   ชั้นเข้าถึงข้อมูลตามที่เอกสาร Next แนะนำ (authentication.md §Authorization)
   — ตรวจสิทธิ์ที่จุดที่ดึงข้อมูล ไม่ใช่ที่ proxy อย่างเดียว

   proxy.ts ทำได้แค่ "มีคุกกี้ไหม" ซึ่งเป็นการตรวจแบบมองโลกในแง่ดี
   และวิ่งบนทุกเส้นทางรวมถึงที่ถูก prefetch ไว้ การตรวจจริงต้องอยู่ตรงนี้
   ที่ที่ข้อมูลถูกอ่าน

   cache() ของ React ทำให้เรียกซ้ำในหน้าเดียวกันไม่ยิง Supabase ซ้ำ —
   หน้าคอนโซลหนึ่งหน้าถามว่า "ใครล็อกอินอยู่" หลายที่
   ───────────────────────────────────────────────────────────── */

/** mfa: "verified" = ยืนยันสองชั้นในรอบนี้แล้ว (aal2) · "pending" = มีแอปยืนยันแต่ยังไม่ได้ใส่รหัส (aal1 → ต้องไปหน้ารหัส)
    "none" = ยังไม่ได้เปิดใช้ยืนยันสองชั้น */
export type Session = { userId: string; email: string; mfa: MfaLevel };

/** คนที่ล็อกอินอยู่ หรือ null ถ้ายังไม่ได้ล็อกอิน */
export const currentUser = cache(async (): Promise<Session | null> => {
  /* ยังไม่ได้ตั้งค่า Supabase Auth = ไม่มีใครล็อกอินได้ ตอบ null เหมือน
     proxy.ts ที่ปล่อยผ่าน ไม่ใช่โยน error จนทุกหน้าใน /app ล้ม

     ไม่ใช่ทางลัดข้ามสิทธิ์: บน Postgres resolveTenant ยังปฏิเสธคนที่ไม่มี
     session อยู่ดี โหมดไม่ล็อกอินจึงเปิดได้แค่บน SQLite ซึ่งเป็นข้อมูลเดโม
     ทั้งก้อน — คือ deploy ทดสอบที่ไม่เชื่อมอะไรเลย */
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ) {
    return null;
  }
  const sb = await supabaseServer();
  /* getUser() ตรวจ token กับเซิร์ฟเวอร์ Supabase จริง
     ต่างจาก getSession() ที่อ่านจากคุกกี้เฉย ๆ ซึ่งปลอมได้ */
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) return null;
  /* ระดับยืนยันตัวตนอ่านจาก JWT ที่ getUser() เพิ่งตรวจ — อ่านไม่ได้ = ถือว่ายังไม่ได้เปิดใช้ (ไม่ทำให้ล็อกอินพัง)
     แต่การกระทำที่ต้องยืนยันสองชั้นจะยังถูกปฏิเสธ เพราะไม่ใช่ "verified" */
  const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  const mfa = aal?.currentLevel === "aal2" ? "verified" : aal?.nextLevel === "aal2" ? "pending" : "none";
  return { userId: data.user.id, email: data.user.email ?? "", mfa };
});

