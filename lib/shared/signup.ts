import type { MfaLevel } from "@/lib/shared/roles";

/* ── สมัครเองและขั้นตั้งต้น (docs/solo-plan.md S9) ─────────────────────────

   ไฟล์นี้เป็นข้อมูลและฟังก์ชันบริสุทธิ์ล้วน — ตัวที่แตะฐานอยู่ที่ lib/engine/signup/

   ── ข้อจำกัดก่อนประตูข้อมูลจริง ──
   ก่อน pentest อิสระผ่าน การสมัครเองเปิดได้แค่ "บัญชีเดโมที่ใช้ข้อมูลสมมุติ":
     · ปิดไว้โดยปริยาย — เปิดด้วย SIGNUP_ENABLED=1 เท่านั้น
     · บัญชีสมัครเองนำเข้าไฟล์จริงไม่ได้ (lib/engine/signup/gate.ts) ได้ชุดข้อมูลสมมุติแทน
     · ทดลองใช้ 14 วัน · AI ปิดตลอดช่วงทดลอง · ไม่มีระบบรับชำระเงิน (ยังไม่เลือกผู้ให้บริการ) — ติดต่อทีม
   ───────────────────────────────────────────────────────────── */

/** สวิตช์เดียวของการสมัครเอง — ไม่ใช่ "1" = ปิด (fail closed) */
export function signupEnabled(): boolean {
  return process.env.SIGNUP_ENABLED === "1";
}

export const SIGNUP_CLOSED_TH = "ยังไม่เปิดรับสมัคร — ระบบเปิดเฉพาะบัญชีที่ได้รับเชิญ ขอทดลองใช้ได้ที่หน้าติดต่อเรา";

export const TRIAL_DAYS = 14;

export const PASSWORD_MIN = 12;

/** ตรวจฟอร์มสมัคร — คืนข้อความผิดพลาด หรือ null ถ้าผ่าน */
export function signupInputError(email: string, password: string, confirm: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return "กรอกอีเมลให้ถูกรูปแบบ";
  if (password.length < PASSWORD_MIN) return `รหัสผ่านต้องยาวอย่างน้อย ${PASSWORD_MIN} ตัวอักษร`;
  if (password.length > 128) return "รหัสผ่านยาวเกิน 128 ตัวอักษร";
  const local = email.split("@")[0].toLowerCase();
  if (local.length >= 4 && password.toLowerCase().includes(local)) return "รหัสผ่านต้องไม่มีชื่ออีเมลอยู่ข้างใน";
  if (password !== confirm) return "รหัสผ่านสองช่องไม่ตรงกัน";
  return null;
}

export function workspaceNameError(name: string): string | null {
  const n = name.trim();
  if (n.length < 2 || n.length > 80) return "ชื่อบัญชีต้องยาว 2–80 ตัวอักษร";
  return null;
}

/* ── ข้อตกลงการประมวลผลข้อมูล (DPA) ──
   ⚠ ร่าง — รอนักกฎหมาย (O3) · ห้ามใช้กับข้อมูลจริงจนกว่าจะผ่านการตรวจ
   เปลี่ยนเนื้อหา = เปลี่ยน DPA_VERSION (การยอมรับเก็บรุ่นไว้ จึงรู้ว่าใครยอมรับข้อความไหน) */
export const DPA_VERSION = "draft-2026-10";
export const DPA_DRAFT_BANNER = "ร่าง — รอนักกฎหมาย (O3)";
export const DPA_DRAFT_TH: { title: string; body: string }[] = [
  { title: "บทบาท", body: "ผู้ใช้ (องค์กรของผู้สมัคร) เป็นผู้ควบคุมข้อมูลส่วนบุคคล · Parallax เป็นผู้ประมวลผลข้อมูลส่วนบุคคลตามคำสั่งของผู้ใช้เท่านั้น" },
  { title: "ขอบเขต", body: "Parallax ประมวลผลข้อมูลเพื่อให้บริการระบบบริหารลูกค้าองค์กรตามที่ผู้ใช้สั่ง ไม่นำข้อมูลไปใช้เพื่อวัตถุประสงค์อื่น และไม่ขายหรือเปิดเผยแก่บุคคลภายนอก" },
  { title: "ความปลอดภัย", body: "ข้อมูลติดต่อเข้ารหัส · แยกบัญชีด้วย RLS · บังคับยืนยันตัวตนสองชั้น · บันทึกตรวจสอบที่แก้ย้อนหลังไม่ได้" },
  { title: "ผู้ประมวลผลช่วง", body: "รายชื่อผู้ให้บริการโครงสร้างพื้นฐาน (ฐานข้อมูล · โฮสติ้ง) จะแนบในฉบับจริง" },
  { title: "สิทธิของเจ้าของข้อมูล", body: "Parallax ช่วยผู้ใช้ตอบคำขอสิทธิภายในระยะเวลาที่กฎหมายกำหนด ผ่านเครื่องมือคำขอสิทธิในระบบ" },
  { title: "ช่วงทดลองใช้", body: "ระหว่างทดลองใช้ บัญชีนี้รับเฉพาะข้อมูลสมมุติที่ระบบสร้างให้ — ห้ามนำข้อมูลส่วนบุคคลจริงเข้าระบบ" },
  { title: "สิ้นสุดบริการ", body: "เมื่อเลิกใช้บริการ ผู้ใช้ขอส่งออกและลบข้อมูลได้ ระยะเวลาเก็บหลังเลิกใช้จะกำหนดในฉบับจริง" },
];

/* ── ลำดับขั้นตั้งต้น ── ข้ามขั้นไม่ได้ · ยืนยันสองชั้นอ่านจาก session ทุกครั้ง (ปิดทีหลัง = กลับมาขั้นนี้) */
export const ONBOARDING_STEPS = ["dpa", "mfa", "templates", "demo", "done"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];
export const STEP_TH: Record<OnboardingStep, string> = {
  dpa: "ยอมรับข้อตกลงการประมวลผลข้อมูล",
  mfa: "เปิดยืนยันตัวตนสองชั้น",
  templates: "เลือกแม่แบบวัตถุประสงค์ 1–3 ตัว",
  demo: "โหลดข้อมูลสมมุติชุดแรก",
  done: "พร้อมใช้งาน",
};

export type OnboardingMarks = {
  dpa_accepted_at: string | null;
  templates_chosen_at: string | null;
  demo_loaded_at: string | null;
};

export function onboardingStep(m: OnboardingMarks, mfa: MfaLevel): OnboardingStep {
  if (!m.dpa_accepted_at) return "dpa";
  if (mfa !== "verified") return "mfa";
  if (!m.templates_chosen_at) return "templates";
  if (!m.demo_loaded_at) return "demo";
  return "done";
}

export const TEMPLATE_MIN = 1;
export const TEMPLATE_MAX = 3;

/** ชุดข้อมูลสมมุติของบัญชีสมัครเอง — ไฟล์จากตัวสร้างนี้เท่านั้นที่บัญชีสมัครเองรับได้ (ตรวจด้วย sha256) */
export const SIGNUP_SYNTHETIC = { segment: "events", sourceRows: 200 } as const;

/** วันที่เหลือของช่วงทดลอง (ปัดขึ้น) — 0 = หมดแล้ว */
export function trialDaysLeft(endsAt: string | null, now = new Date()): number {
  if (!endsAt) return 0;
  return Math.max(0, Math.ceil((Date.parse(endsAt) - now.getTime()) / 864e5));
}
