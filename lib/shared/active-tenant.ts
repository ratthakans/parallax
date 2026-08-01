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

/* ── แอตทริบิวต์ของคุกกี้ อยู่ที่เดียว ──────────────────────────

   เดิมตัวเลือกถูกเขียนอินไลน์ตรงจุดที่ set และขาด `secure` ไป
   ผลคือเบราว์เซอร์ยอมส่งคุกกี้นี้ผ่าน http ธรรมดาได้ HSTS preload
   ปิดช่องนั้นไว้เกือบหมดแล้วก็จริง แต่ HSTS เป็นการป้องกันชั้นเครือข่าย
   ส่วน `secure` เป็นการป้องกันชั้นคุกกี้ — เมื่อวันหนึ่งมีโดเมนย่อย
   หรือสภาพแวดล้อมทดสอบที่ยังไม่ได้ preload ชั้นที่หายไปจะสำคัญขึ้นมา

   ปิด `secure` เฉพาะตอน dev เพราะ localhost เป็น http และ Safari
   ไม่รับคุกกี้ที่ตั้ง Secure บน http แม้จะเป็น localhost ก็ตาม

   ไม่ใช้คำนำหน้า __Host- ด้วยเหตุผลเดียวกัน — มันบังคับให้มี Secure
   เสมอ ซึ่งจะทำให้ dev บน Safari ใช้ไม่ได้ ค่าที่ได้เพิ่มจาก __Host-
   (กันโดเมนย่อยเขียนทับ) ยังไม่คุ้มกับการทำให้เครื่องนักพัฒนาพัง
   จนกว่าจะมีโดเมนย่อยจริงให้กัน

   sameSite: "lax" ถูกแล้ว — คุกกี้นี้ต้องติดไปกับการกดลิงก์เข้าคอนโซล
   จากภายนอก ส่วน "strict" จะทำให้คนที่กดลิงก์เข้ามาเห็นบัญชีตั้งต้นเสมอ */
export const TENANT_COOKIE_OPTIONS = {
  path: "/",
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 30,
} as const;

export async function getActiveTenantId(): Promise<string> {
  const store = await cookies();
  const raw = store.get(TENANT_COOKIE)?.value ?? "";
  return isKnownTenant(raw) ? raw : DEFAULT_TENANT_ID;
}

/** โปรไฟล์ของบัญชีที่เปิดอยู่ — คำเรียกและข้อจำกัดมาจากที่นี่ */
export async function getActiveProfile() {
  return profileFor(await getActiveTenantId());
}
