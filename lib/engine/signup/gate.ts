import { createHash } from "node:crypto";
import { get } from "@/lib/engine/sql";
import { isSignupTenantId } from "@/lib/shared/tenants";
import { SIGNUP_SYNTHETIC, onboardingStep, trialDaysLeft, type OnboardingStep } from "@/lib/shared/signup";
import { fileBytes, generateSynthetic } from "@/lib/shared/synthetic-b2b";
import type { MfaLevel } from "@/lib/shared/roles";
import type { BillingState } from "@/lib/engine/ai/policy";

/* ── ด่านของบัญชีสมัครเอง (docs/solo-plan.md S9) ─────────────────────────

   แยกจาก lib/engine/signup/index.ts เพราะตัวนำเข้าไฟล์ (vault/intake · ingest) ต้อง import ด่านนี้
   ส่วน index.ts import ตัวนำเข้าเพื่อโหลดข้อมูลสมมุติ — ถ้าอยู่ไฟล์เดียวกันจะวนกัน

   ไม่มีอะไรในนี้แก้ข้อมูล · ทุกฟังก์ชันอ่านสองแถว (tenant_settings · tenant_billing) ของบัญชีเดียว
   ───────────────────────────────────────────────────────────── */

export type TenantSettings = {
  tenant_id: string;
  mode: "solo" | "team";
  today_quiet_days: number;
  weekly_digest_day: number | null;
  signup_source: "invite" | "self";
  dpa_version: string | null;
  dpa_accepted_at: string | null;
  dpa_accepted_by: string | null;
  mfa_confirmed_at: string | null;
  templates_chosen_at: string | null;
  demo_loaded_at: string | null;
  onboarded_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function tenantSettings(tenantId: string): Promise<TenantSettings | null> {
  const row = await get<TenantSettings>("SELECT * FROM tenant_settings WHERE tenant_id = ?", tenantId);
  if (!row) return null;
  return { ...row, today_quiet_days: Number(row.today_quiet_days), weekly_digest_day: row.weekly_digest_day == null ? null : Number(row.weekly_digest_day) };
}

/* บัญชีสมัครเอง = signup_source 'self' หรือรหัสรูปแบบ s-… — อย่างใดอย่างหนึ่งพอ (fail closed:
   แถวค่าตั้งหายไปก็ยังถูกนับเป็นบัญชีสมัครเอง ไม่ใช่หลุดเป็นบัญชีที่รับไฟล์จริงได้) */
export async function isSelfSignup(tenantId: string): Promise<boolean> {
  if (isSignupTenantId(tenantId)) return true;
  return (await tenantSettings(tenantId))?.signup_source === "self";
}

export type SignupInfo = {
  selfSignup: boolean;
  settings: TenantSettings | null;
  step: OnboardingStep;
  billingState: BillingState | null;
  trialEndsAt: string | null;
  daysLeft: number;
  expired: boolean;
};

/** สถานะของบัญชีสำหรับ layout และด่าน action — บัญชีที่ไม่ได้สมัครเองได้ selfSignup = false และไม่ถูกกั้น */
export async function signupInfo(tenantId: string, mfa: MfaLevel, now = new Date()): Promise<SignupInfo> {
  const settings = await tenantSettings(tenantId);
  const selfSignup = isSignupTenantId(tenantId) || settings?.signup_source === "self";
  if (!selfSignup) return { selfSignup, settings, step: "done", billingState: null, trialEndsAt: null, daysLeft: 0, expired: false };
  const bill = await get<{ state: BillingState; trial_ends_at: string | null }>(
    "SELECT state, trial_ends_at FROM tenant_billing WHERE tenant_id = ?", tenantId);
  const step = onboardingStep(settings ?? { dpa_accepted_at: null, templates_chosen_at: null, demo_loaded_at: null }, mfa);
  const trialEndsAt = bill?.trial_ends_at ?? null;
  /* ไม่มีแถวการชำระ = หมดสิทธิ์ (fail closed) · ชำระแล้ว = ไม่มีวันหมด · ระงับ = เหมือนหมด */
  const expired = !bill || bill.state === "suspended" || (bill.state !== "paid" && (!trialEndsAt || now.getTime() >= Date.parse(trialEndsAt)));
  return { selfSignup, settings, step, billingState: bill?.state ?? null, trialEndsAt, daysLeft: trialDaysLeft(trialEndsAt, now), expired };
}

/** หน้าที่ต้องไปก่อนใช้คอนโซล — null = ใช้ได้ */
export function consoleGate(info: SignupInfo): "/upgrade" | "/onboarding" | null {
  if (!info.selfSignup) return null;
  if (info.expired) return "/upgrade";
  if (info.step !== "done") return "/onboarding";
  return null;
}

export const TRIAL_EXPIRED_TH = "ช่วงทดลองใช้หมดแล้ว — ติดต่อทีมเพื่อชำระเงินแล้วใช้งานต่อ (หน้าอัปเกรด)";
export const ONBOARDING_FIRST_TH = "ตั้งค่าบัญชีให้ครบก่อน — ข้อตกลงข้อมูล · ยืนยันตัวตนสองชั้น · แม่แบบ · ข้อมูลสมมุติ";

/** ข้อความที่ด่าน Server Action ใช้ปฏิเสธ — null = ไม่ถูกกั้น */
export function signupLock(info: SignupInfo): string | null {
  const to = consoleGate(info);
  return to === "/upgrade" ? TRIAL_EXPIRED_TH : to === "/onboarding" ? ONBOARDING_FIRST_TH : null;
}

/* ── ไฟล์ที่บัญชีสมัครเองรับได้ ──
   เฉพาะไฟล์ที่ตัวสร้างข้อมูลสมมุติสร้างด้วยค่าตั้งของ S9 เท่านั้น — ตรวจด้วย sha256 ของเนื้อไฟล์
   ไม่ใช่ธงที่ผู้เรียกส่งมา: ไฟล์จริงไม่มีทางมี hash ตรงกับไฟล์สมมุติ ด่านจึงไม่ขึ้นกับว่าใครเรียก */
let digests: Set<string> | null = null;
export function syntheticDigests(): Set<string> {
  digests ??= new Set(
    generateSynthetic({ ...SIGNUP_SYNTHETIC }).files.map((f) => createHash("sha256").update(fileBytes(f)).digest("hex")),
  );
  return digests;
}

export const REAL_FILES_BLOCKED_TH =
  "บัญชีสมัครเองยังรับข้อมูลจริงไม่ได้จนกว่าการทดสอบเจาะระบบจะผ่าน — ใช้ข้อมูลสมมุติที่โหลดให้ระหว่างตั้งค่าบัญชี";

/** null = นำเข้าได้ · digest = sha256 ของไฟล์ (ไม่ส่ง = ช่องทางที่ไม่ใช่ไฟล์สมมุติ เช่นนำเข้า CSV ค้าปลีก · เพิ่มคนเอง) */
export async function importBlockedReason(tenantId: string, digest?: string): Promise<string | null> {
  if (!(await isSelfSignup(tenantId))) return null;
  if (digest && syntheticDigests().has(digest)) return null;
  return REAL_FILES_BLOCKED_TH;
}
