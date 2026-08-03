import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/shared/supabase";

/* ── ใครเป็นเจ้าของคำขอนี้ ─────────────────────────────────────

   ชั้นเข้าถึงข้อมูลตามที่เอกสาร Next แนะนำ (authentication.md §Authorization)
   — ตรวจสิทธิ์ที่จุดที่ดึงข้อมูล ไม่ใช่ที่ proxy อย่างเดียว

   proxy.ts ทำได้แค่ "มีคุกกี้ไหม" ซึ่งเป็นการตรวจแบบมองโลกในแง่ดี
   และวิ่งบนทุกเส้นทางรวมถึงที่ถูก prefetch ไว้ การตรวจจริงต้องอยู่ตรงนี้
   ที่ที่ข้อมูลถูกอ่าน

   cache() ของ React ทำให้เรียกซ้ำในหน้าเดียวกันไม่ยิง Supabase ซ้ำ —
   หน้าคอนโซลหนึ่งหน้าถามว่า "ใครล็อกอินอยู่" หลายที่
   ───────────────────────────────────────────────────────────── */

export type Session = { userId: string; email: string };

/** คนที่ล็อกอินอยู่ หรือ null ถ้ายังไม่ได้ล็อกอิน */
export const currentUser = cache(async (): Promise<Session | null> => {
  const sb = await supabaseServer();
  /* getUser() ตรวจ token กับเซิร์ฟเวอร์ Supabase จริง
     ต่างจาก getSession() ที่อ่านจากคุกกี้เฉย ๆ ซึ่งปลอมได้ */
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) return null;
  return { userId: data.user.id, email: data.user.email ?? "" };
});

/** ต้องล็อกอิน — ไม่งั้นส่งไปหน้าเข้าสู่ระบบ */
export const requireUser = cache(async (): Promise<Session> => {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
});
