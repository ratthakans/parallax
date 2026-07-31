import { cookies } from "next/headers";
import { DEFAULT_TENANT_ID, isKnownTenant, profileFor } from "@/lib/shared/tenants";

/* ── บัญชีที่กำลังเปิดอยู่ ──────────────────────────────────────
   เก็บใน cookie เพราะ Console ยังไม่มีระบบล็อกอิน

   นี่คือของชั่วคราวสำหรับเดโม ไม่ใช่การแยกผู้เช่าที่ปลอดภัย:
   ใครก็ตามที่แก้ cookie ได้ ย่อมสลับไปดูข้อมูลของบัญชีอื่นได้
   ตอนต่อ auth จริง ต้องเปลี่ยนมาอ่านบัญชีจาก session ของผู้ใช้
   และตรวจสิทธิ์ทุกครั้งว่าคนนี้เข้าถึงบัญชีนี้ได้จริง

   ค่าจาก cookie ถูกตรวจกับทะเบียนก่อนใช้เสมอ ค่าที่ไม่รู้จักจะตกไป
   เป็นบัญชีตั้งต้น ไม่ใช่ถูกยัดลงคำสั่ง SQL ตรง ๆ
   ───────────────────────────────────────────────────────────── */

export const TENANT_COOKIE = "parallax_tenant";

export async function getActiveTenantId(): Promise<string> {
  const store = await cookies();
  const raw = store.get(TENANT_COOKIE)?.value ?? "";
  return isKnownTenant(raw) ? raw : DEFAULT_TENANT_ID;
}

/** โปรไฟล์ของบัญชีที่เปิดอยู่ — คำเรียกและข้อจำกัดมาจากที่นี่ */
export async function getActiveProfile() {
  return profileFor(await getActiveTenantId());
}
