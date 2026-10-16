import { cache } from "react";
import { all, get, usingPostgres } from "@/lib/engine/sql";
import {
  DEFAULT_TENANT_ID,
  isKnownTenant,
  isStaticTenant,
  CONSOLE_PROFILES,
} from "@/lib/shared/tenants";
import { roleFrom, type Role } from "@/lib/shared/roles";

/* ── ใครแตะบัญชีไหนได้ ─────────────────────────────────────────

   ไฟล์นี้อยู่ใน lib/engine ไม่ใช่ lib/shared เพราะมันถามฐานข้อมูล
   และกฎ boundary ข้อ 2 ห้าม shared ดึง engine — ถ้า shared แตะฐานได้
   กฎข้อ 1 (เว็บการตลาดห้ามแตะเครื่องยนต์) จะถูกข้ามผ่าน shared ทันที

   ── เดิมบัญชีที่เปิดอยู่คือค่าในคุกกี้ ──

   switchTenantAction เขียนกำกับไว้เองว่า "ของเดโม ไม่ใช่การควบคุมสิทธิ์"
   ซึ่งจริงตามนั้น: ใครแก้คุกกี้ก็เปิดบัญชีไหนก็ได้ และ RLS ทั้ง 39 ข้อ
   ไม่มีความหมายเพราะไม่มีตัวตนให้ผูก

   ตอนนี้คุกกี้เหลือหน้าที่เดียวคือ "ครั้งก่อนดูบัญชีไหนอยู่" ส่วนสิทธิ์
   มาจาก tenant_users เสมอ
   ───────────────────────────────────────────────────────────── */

/* ── บัญชีที่ผู้ใช้คนนี้เข้าถึงได้จริง ──────────────────────────

   ถูกถามสองครั้งต่อคำขอเสมอ — ครั้งหนึ่งตอนตัดสินว่าเปิดบัญชีไหน
   (resolveTenant) อีกครั้งตอนวาดตัวสลับบัญชีบนแถบข้าง (switchableTenants)
   ทั้งสองอยู่คนละต้นไม้ของ React จึงแชร์ผลกันเองไม่ได้ถ้าไม่แคช

   จุดเดียวที่เขียน tenant_users จากคำขอคือการสมัครเอง (app.create_signup_tenant · S9)
   ซึ่งจบด้วย redirect ไม่อ่านต่อ (คำเชิญยังทำมือผ่าน SQL) คำตอบจึงคงที่ตลอดคำขอ */
export const tenantsForUser = cache(async function tenantsForUser(
  userId: string,
): Promise<string[]> {
  const rows = await all<{ tenant_id: string }>(
    "SELECT tenant_id FROM tenant_users WHERE user_id = ? ORDER BY tenant_id",
    userId,
  );
  return rows.map((r) => r.tenant_id).filter(isKnownTenant);
});

/* ── โหมดเดโม ────────────────────────────────────────────────

   บนไฟล์ sqlite ไม่มี Supabase Auth และ tenant_users ว่างเปล่า
   ถ้าบังคับตรวจสมาชิกที่นี่ เครื่องพัฒนาและ CI จะเปิดคอนโซลไม่ได้เลย

   การแยกบัญชียังทำงานอยู่แม้ในโหมดนี้ เพราะทุก query มี
   WHERE tenant_id = ? ของตัวเอง — RLS เป็นชั้นที่สอง ไม่ใช่ชั้นเดียว */
export const membershipEnforced = () => usingPostgres();

/* ── บทบาทในบัญชี ── หกบทบาท (lib/shared/roles.ts) จาก tenant_users.role
   โหมดเดโมไม่มีสมาชิก จึงถือเป็น owner เหมือนที่เปิดได้ทุกอย่างอยู่แล้ว
   ไม่พบแถว = viewer (สิทธิ์น้อยสุด) ไม่ใช่ owner · operator เดิม = หัวหน้าทีม */
export type TenantRole = Role;
export async function tenantRole(tenantId: string, userId: string | null | undefined): Promise<TenantRole> {
  if (!membershipEnforced()) return "owner";
  if (!userId) return "viewer";
  return roleFrom((await get<{ role: string }>("SELECT role FROM tenant_users WHERE tenant_id = ? AND user_id = ?", tenantId, userId))?.role);
}

/**
 * บัญชีที่ควรเปิดให้ผู้ใช้คนนี้
 *
 * @param userId  null = ยังไม่ได้ล็อกอิน (โหมดเดโมเท่านั้น)
 * @param wanted  ค่าจากคุกกี้ — เป็นความชอบ ไม่ใช่สิทธิ์
 */
export async function resolveTenant(
  userId: string | null,
  wanted: string,
): Promise<string> {
  /* โหมดเดโมเปิดได้เฉพาะบัญชีในทะเบียนนิ่ง — บัญชีสมัครเองมีได้เฉพาะบนฐานที่บังคับสมาชิก */
  if (!membershipEnforced()) {
    return isStaticTenant(wanted) ? wanted : DEFAULT_TENANT_ID;
  }

  if (!userId) throw new Error("ต้องล็อกอินก่อนจึงจะเปิดบัญชีได้");

  const mine = await tenantsForUser(userId);
  if (!mine.length) {
    throw new Error("บัญชีผู้ใช้นี้ยังไม่ถูกผูกกับร้านใดเลย");
  }
  /* คุกกี้ชี้ไปบัญชีที่ไม่ใช่ของเขา — ไม่ใช่ error ที่ต้องแสดง
     เพราะเกิดได้ทุกวันจากการสลับผู้ใช้บนเครื่องเดียวกัน
     ให้เปิดบัญชีแรกที่เขามีสิทธิ์แทน */
  return mine.includes(wanted) ? wanted : mine[0];
}

/** ใช้ตอนแสดงตัวเลือกสลับบัญชี — เดโมเห็นทุกบัญชี ของจริงเห็นเฉพาะของตัวเอง */
export async function switchableTenants(
  userId: string | null,
): Promise<string[]> {
  if (!membershipEnforced()) return CONSOLE_PROFILES.map((t) => t.id);
  return userId ? tenantsForUser(userId) : [];
}
