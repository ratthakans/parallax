import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/* ── ตัวเชื่อม Supabase Auth ฝั่งเซิร์ฟเวอร์ ────────────────────

   ระบบนี้ใช้ Supabase สองทางที่ไม่เกี่ยวกัน และการแยกให้ชัดสำคัญมาก:

     lib/engine/sql.ts   ต่อ Postgres ตรงเพื่ออ่านเขียนข้อมูลธุรกิจ
     ไฟล์นี้             คุยกับ Supabase Auth เพื่อรู้ว่าใครเป็นใคร

   ที่นี่ไม่แตะข้อมูลธุรกิจเลย หน้าที่เดียวคือตอบว่า "คำขอนี้เป็นของใคร"
   แล้วส่งรหัสผู้ใช้ต่อให้ชั้นข้อมูลไปผูกกับ RLS

   ── ทำไมต้องเป็น publishable key ไม่ใช่ service key ──

   supabase/migrations/0002_rls.sql เขียนเตือนไว้ตรงหัวไฟล์ว่า
   service_role ข้าม RLS ทั้งหมดตามการออกแบบของ Postgres ถ้าเผลอใช้
   ที่นี่ นโยบายทั้ง 39 ข้อจะไม่ทำงานเลยแม้แต่ข้อเดียว และเรากลับไปอยู่
   ที่เดิมคือหวังว่าคนเขียน query จะจำเติม WHERE tenant_id เอง
   ───────────────────────────────────────────────────────────── */

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

/** ตัวเชื่อมที่อ่านและเขียนคุกกี้ของ session ผ่าน Next */
export async function supabaseServer() {
  const store = await cookies();

  return createServerClient(
    env("NEXT_PUBLIC_SUPABASE_URL"),
    env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    {
      cookies: {
        getAll() {
          return store.getAll();
        },
        setAll(list) {
          /* ── Server Component เขียนคุกกี้ไม่ได้ ──

             การต่ออายุ session เกิดขึ้นใน proxy.ts ซึ่งเขียนได้ ที่นี่
             จึงกลืน error ทิ้งแทนที่จะโยน ไม่งั้นทุกหน้าที่แค่ "อ่าน"
             ว่าใครล็อกอินอยู่จะพังทั้งหน้าเมื่อ token ใกล้หมดอายุพอดี */
          try {
            for (const c of list) store.set(c.name, c.value, c.options);
          } catch {
            /* อ่านอย่างเดียว — proxy จัดการต่ออายุให้แล้ว */
          }
        },
      },
    },
  );
}
