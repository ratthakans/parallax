import { randomBytes } from "node:crypto";
import { all, asUser, get, run, tx, usingPostgres } from "@/lib/engine/sql";
import { logActivity } from "@/lib/engine/db";
import { adoptTemplate } from "@/lib/engine/policy/templates";
import { registerSource } from "@/lib/engine/vault/sources";
import { analyseUpload, commitUpload } from "@/lib/engine/vault/intake";
import { resolveTenant as resolveIdentities } from "@/lib/engine/vault/resolve";
import { isSelfSignup, tenantSettings } from "@/lib/engine/signup/gate";
import {
  DPA_VERSION, SIGNUP_CLOSED_TH, SIGNUP_SYNTHETIC, STEP_TH, TEMPLATE_MAX, TEMPLATE_MIN, TRIAL_DAYS,
  onboardingStep, signupEnabled, workspaceNameError, type OnboardingStep,
} from "@/lib/shared/signup";
import { templateOf } from "@/lib/shared/purpose-templates";
import { fileBytes, generateSynthetic } from "@/lib/shared/synthetic-b2b";
import type { MfaLevel } from "@/lib/shared/roles";

/* ── สมัครเองและขั้นตั้งต้น (docs/solo-plan.md S9) ─────────────────────────

   1. createSignupTenant — ผู้ใช้ที่ล็อกอินแล้วแต่ยังไม่มีบัญชี ได้บัญชีของตัวเองหนึ่งบัญชี
      (เจ้าของ · โหมดคนเดียว · ทดลองใช้ 14 วัน · AI ปิด) ในธุรกรรมเดียว
   2. ขั้นตั้งต้นบังคับตามลำดับ: DPA → ยืนยันสองชั้น → แม่แบบ 1–3 ตัว → ข้อมูลสมมุติ → หน้า "วันนี้"
      ทุกขั้นตรวจว่าเป็นขั้นปัจจุบันจริง — ยิง action ข้ามขั้นตรง ๆ ไม่ได้

   ฟังก์ชันที่นี่ไม่รู้จักคุกกี้หรือ session — ผู้เรียก (Server Action) ส่งระดับยืนยันตัวตนมาเอง
   ───────────────────────────────────────────────────────────── */

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const iso = (d = new Date()) => d.toISOString();

export async function tenantsOfUser(userId: string): Promise<string[]> {
  return (await all<{ tenant_id: string }>("SELECT tenant_id FROM tenant_users WHERE user_id = ?", userId)).map((r) => r.tenant_id);
}

/* ── สร้างบัญชี ──
   Postgres: ผ่าน app.create_signup_tenant (0019) ในนามผู้ใช้ — ฐานข้อมูลตรวจเองว่าทำให้ auth.uid() เท่านั้น
   และผู้ใช้ยังไม่มีบัญชี (เหตุผลที่ไม่ใช้ asSystem อยู่หัวไฟล์ migration)
   sqlite (เครื่องพัฒนา · ชุดตรวจ): ไม่มี RLS และฟังก์ชัน — ทำเงื่อนไขเดียวกันในธุรกรรมเดียว */
export async function createSignupTenant(userId: string, name: string, actor: string): Promise<Result<{ tenantId: string }>> {
  if (!signupEnabled()) return { ok: false, error: SIGNUP_CLOSED_TH };
  const nameErr = workspaceNameError(name);
  if (nameErr) return { ok: false, error: nameErr };
  const clean = name.trim();
  const id = `s-${randomBytes(6).toString("hex")}`;
  const ALREADY = "ผู้ใช้นี้มีบัญชีอยู่แล้ว — เข้าสู่ระบบแล้วไปที่คอนโซลได้เลย";

  if (usingPostgres()) {
    try {
      await asUser(userId, (t) => t.get("SELECT app.create_signup_tenant(?, ?) AS id", id, clean));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      return { ok: false, error: msg.includes("มีบัญชีอยู่แล้ว") ? ALREADY : "สร้างบัญชีไม่สำเร็จ — ลองอีกครั้ง" };
    }
  } else {
    const now = new Date();
    const at = iso(now), ends = iso(new Date(now.getTime() + TRIAL_DAYS * 864e5));
    const made = await tx(async (q) => {
      if (await q.get("SELECT 1 AS x FROM tenant_users WHERE user_id = ?", userId)) return false;
      await q.run("INSERT INTO tenants (id, name, cycle_shape, tier, created_at, message_credits) VALUES (?,?,?,?,?,?)", id, clean, "considered", "growth", at, 0);
      await q.run("INSERT INTO tenant_users (tenant_id, user_id, role, created_at) VALUES (?,?,?,?)", id, userId, "owner", at);
      await q.run("INSERT INTO tenant_billing (tenant_id, state, is_customer, trial_ends_at, updated_at, updated_by) VALUES (?,?,?,?,?,?)", id, "trial", 1, ends, at, "signup");
      await q.run("INSERT INTO tenant_settings (tenant_id, mode, signup_source, created_at, updated_at) VALUES (?,?,?,?,?)", id, "solo", "self", at, at);
      return true;
    });
    if (!made) return { ok: false, error: ALREADY };
  }
  await logActivity(id, actor, "signup_tenant_created", `trial ${TRIAL_DAYS} days · mode solo`);
  return { ok: true, tenantId: id };
}

/* ── ขั้นปัจจุบัน ── ทุกขั้นเรียกตัวนี้ก่อนทำงาน */
export async function onboardingStatus(tenantId: string, mfa: MfaLevel): Promise<{ selfSignup: boolean; step: OnboardingStep }> {
  if (!(await isSelfSignup(tenantId))) return { selfSignup: false, step: "done" };
  const s = await tenantSettings(tenantId);
  return { selfSignup: true, step: onboardingStep(s ?? { dpa_accepted_at: null, templates_chosen_at: null, demo_loaded_at: null }, mfa) };
}

async function expect(tenantId: string, mfa: MfaLevel, want: OnboardingStep): Promise<string | null> {
  const { selfSignup, step } = await onboardingStatus(tenantId, mfa);
  if (!selfSignup) return "ขั้นตั้งต้นมีเฉพาะบัญชีที่สมัครเอง";
  if (step === want) return null;
  if (step === "done") return "ตั้งค่าบัญชีเสร็จแล้ว";
  return `ทำขั้น "${STEP_TH[step]}" ก่อน`;
}

/** ขั้น 1 · ยอมรับ DPA (ร่าง — รอนักกฎหมาย O3) · เก็บรุ่นของข้อความที่ยอมรับ */
export async function acceptDpa(tenantId: string, accepted: boolean, actor: string, mfa: MfaLevel): Promise<Result> {
  const no = await expect(tenantId, mfa, "dpa");
  if (no) return { ok: false, error: no };
  if (!accepted) return { ok: false, error: "ติ๊กยอมรับข้อตกลงก่อน — ยอมรับในนามองค์กรของคุณในฐานะผู้ควบคุมข้อมูล" };
  const at = iso();
  await run("UPDATE tenant_settings SET dpa_version = ?, dpa_accepted_at = ?, dpa_accepted_by = ?, updated_at = ? WHERE tenant_id = ?",
    DPA_VERSION, at, actor, at, tenantId);
  await logActivity(tenantId, actor, "dpa_accepted", DPA_VERSION);
  return { ok: true };
}

/** ขั้น 2 · ยืนยันสองชั้น — อ่านระดับจาก session ที่ผู้เรียกส่งมา ไม่ใช่จากฐาน (ปิดทีหลัง = กลับมาขั้นนี้เอง) */
export async function confirmMfa(tenantId: string, actor: string, mfa: MfaLevel): Promise<Result> {
  if (mfa !== "verified") return { ok: false, error: "ยังไม่ได้ยืนยันด้วยรหัสจากแอป — สแกน QR แล้วใส่รหัส 6 หลักก่อน" };
  const s = await tenantSettings(tenantId);
  if (!(await isSelfSignup(tenantId)) || !s) return { ok: false, error: "ขั้นตั้งต้นมีเฉพาะบัญชีที่สมัครเอง" };
  if (!s.dpa_accepted_at) return { ok: false, error: `ทำขั้น "${STEP_TH.dpa}" ก่อน` };
  if (!s.mfa_confirmed_at) {
    const at = iso();
    await run("UPDATE tenant_settings SET mfa_confirmed_at = ?, updated_at = ? WHERE tenant_id = ?", at, at, tenantId);
    await logActivity(tenantId, actor, "onboarding_mfa_confirmed");
  }
  return { ok: true };
}

/** ขั้น 3 · แม่แบบวัตถุประสงค์ 1–3 ตัว (S4) — แต่ละตัวต้องพิมพ์ยืนยันข้อเท็จจริงตามที่แม่แบบกำหนด */
export async function chooseTemplates(
  tenantId: string, picks: { code: string; confirmation: string }[], actor: string, mfa: MfaLevel,
): Promise<Result<{ purposeIds: string[] }>> {
  const no = await expect(tenantId, mfa, "templates");
  if (no) return { ok: false, error: no };
  const codes = [...new Set(picks.map((p) => p.code))];
  if (codes.length < TEMPLATE_MIN || codes.length > TEMPLATE_MAX) return { ok: false, error: `เลือกแม่แบบ ${TEMPLATE_MIN}–${TEMPLATE_MAX} ตัว` };
  if (codes.some((c) => !templateOf(c))) return { ok: false, error: "ไม่พบแม่แบบที่เลือก" };
  const purposeIds: string[] = [];
  for (const code of codes) {
    const r = await adoptTemplate(tenantId, code, picks.find((p) => p.code === code)?.confirmation ?? "", actor);
    if (!r.ok) return { ok: false, error: `${templateOf(code)!.name}: ${r.error}` };
    purposeIds.push(r.purposeId);
  }
  const at = iso();
  /* ถึงขั้นนี้ได้แปลว่ายืนยันสองชั้นแล้ว (onboardingStep) — คนที่มี aal2 มาตั้งแต่ต้นข้ามปุ่มขั้น 2 จึงบันทึกที่นี่ */
  await run("UPDATE tenant_settings SET templates_chosen_at = ?, mfa_confirmed_at = COALESCE(mfa_confirmed_at, ?), updated_at = ? WHERE tenant_id = ?", at, at, at, tenantId);
  return { ok: true, purposeIds };
}

const DEMO_SOURCE = "ข้อมูลสมมุติชุดแรก (ตัวสร้าง B2B)";

/** ขั้น 4 · ข้อมูลสมมุติ — ผ่านเส้นทางนำเข้าจริง (แหล่ง → ตรวจไฟล์ → ตรวจตัวตน) ด้วยไฟล์จากตัวสร้างเท่านั้น
    ด่านไฟล์จริง (gate.ts) ยอมเพราะ hash ตรงกับไฟล์สมมุติ ไม่ใช่เพราะมีธงพิเศษ · ทำซ้ำได้ (ไฟล์ที่เข้าแล้วข้าม) */
export async function loadSignupDemo(tenantId: string, actor: string, mfa: MfaLevel): Promise<Result<{ rows: number; people: number }>> {
  const no = await expect(tenantId, mfa, "demo");
  if (no) return { ok: false, error: no };
  const purpose = await get<{ id: string }>(
    "SELECT id FROM purposes WHERE tenant_id = ? AND template_code IS NOT NULL ORDER BY created_at, id LIMIT 1", tenantId);
  if (!purpose) return { ok: false, error: `ทำขั้น "${STEP_TH.templates}" ก่อน` };

  let sourceId = (await get<{ id: string }>("SELECT id FROM sources WHERE tenant_id = ? AND name = ?", tenantId, DEMO_SOURCE))?.id;
  if (!sourceId) {
    const src = await registerSource(tenantId, {
      name: DEMO_SOURCE, kind: "file", purposeId: purpose.id,
      acquisitionNote: "ข้อมูลสมมุติที่ระบบสร้างให้ระหว่างทดลองใช้ — ไม่ใช่ข้อมูลของใคร (อีเมลโดเมน .example)",
      fields: ["customer_name", "first_name", "last_name", "company", "job_title", "email", "phone", "occurred_at"],
    }, actor);
    if (!src.ok) return { ok: false, error: src.error };
    sourceId = src.id;
  }

  let rows = 0;
  for (const f of generateSynthetic({ ...SIGNUP_SYNTHETIC }).files) {
    const bytes = fileBytes(f);
    const an = await analyseUpload(tenantId, sourceId, bytes, f.name, actor);
    if (!an.ok) return { ok: false, error: `${f.name}: ${an.error}` };
    if (an.duplicateOf) continue;
    const done = await commitUpload(tenantId, sourceId, bytes, f.name, Object.fromEntries(an.columns.map((c) => [c.index, c.field])), an.sha256, actor);
    if (!done.ok) return { ok: false, error: `${f.name}: ${done.error}` };
    rows += done.total;
  }
  const stats = await resolveIdentities(tenantId, actor);
  const at = iso();
  await run("UPDATE tenant_settings SET demo_loaded_at = ?, onboarded_at = ?, updated_at = ? WHERE tenant_id = ?", at, at, at, tenantId);
  await logActivity(tenantId, actor, "onboarding_done", `${rows} synthetic rows`);
  return { ok: true, rows, people: stats.people };
}
