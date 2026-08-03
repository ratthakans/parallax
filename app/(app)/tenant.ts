import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { TENANT_COOKIE } from "@/lib/shared/active-tenant";
import { currentUser } from "@/lib/shared/session";
import { resolveTenant, switchableTenants } from "@/lib/engine/access";
import { enterIdentity } from "@/lib/engine/sql";

/* ── บัญชีที่เปิดอยู่ ประกอบจากสามอย่าง ──────────────────────────

   ตัวประกอบอยู่ชั้น app ไม่ใช่ใน lib เพราะมันต้องรู้ทั้งสามเรื่องพร้อมกัน:

     คุกกี้        ครั้งก่อนเขาดูบัญชีไหน — เป็นความชอบ ไม่ใช่สิทธิ์
     session      เขาเป็นใคร
     tenant_users เขาแตะบัญชีไหนได้บ้าง

   lib/shared แตะฐานข้อมูลไม่ได้ (กฎ boundary ข้อ 2) และ lib/engine
   ไม่ควรรู้จักคุกกี้ของ Next ชั้น app คือที่เดียวที่เห็นครบทั้งสาม

   cache() ทำให้หน้าหนึ่งหน้าถามครั้งเดียว ไม่ใช่ครั้งละคำถามต่อ
   คอมโพเนนต์ — หน้าคอนโซลหนึ่งหน้าเรียกตัวนี้หลายที่
   ───────────────────────────────────────────────────────────── */

export const activeTenantId = cache(async (): Promise<string> => {
  const store = await cookies();
  const wanted = store.get(TENANT_COOKIE)?.value ?? "";
  const user = await currentUser();

  /* ── ผูกตัวตนให้ทุก query ที่ตามมาในคำขอนี้ ──

     ทุกหน้าและเกือบทุก action เรียกตัวนี้ก่อนแตะข้อมูล จุดนี้จึงเป็น
     ที่เดียวที่ครอบได้ทั้งคำขอโดยไม่ต้องแก้ 17 action ทีละตัว

     จากตรงนี้ไป all/get/run จะเปิดธุรกรรมพร้อม claims ให้เอง แล้ว RLS
     ทั้ง 39 ข้อทำงาน — ลืมเติม WHERE tenant_id = ได้ศูนย์แถว
     ไม่ใช่ได้ข้อมูลของคนอื่น */
  if (user) enterIdentity(user.userId);

  return resolveTenant(user?.userId ?? null, wanted);
});

/** บัญชีที่เขาสลับไปได้จริง — ใช้กับตัวสลับบัญชีบนแถบข้าง */
export const myTenants = cache(async (): Promise<string[]> => {
  const user = await currentUser();
  return switchableTenants(user?.userId ?? null);
});
