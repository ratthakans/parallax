import type { Metadata } from "next";
import { CUSTOMER_MODES, CUSTOMER_MODE_TH } from "@/lib/shared/tenants";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { currentUser } from "@/lib/shared/session";
import { enterIdentity } from "@/lib/engine/sql";
import { membershipEnforced, tenantsForUser } from "@/lib/engine/access";
import { signupInfo } from "@/lib/engine/signup/gate";
import { viewer } from "@/app/(app)/viewer";
import { createWorkspaceAction } from "@/app/(gate)/signup/actions";
import { acceptDpaAction, chooseTemplatesAction, confirmMfaStepAction, loadDemoAction } from "@/app/(app)/onboarding-actions";
import { signOutAction } from "@/app/login/actions";
import { ActionForm } from "@/components/console/action-form";
import { MfaSetup } from "@/components/console/mfa-setup";
import {
  DPA_DRAFT_BANNER, DPA_DRAFT_TH, DPA_VERSION, ONBOARDING_STEPS, SIGNUP_CLOSED_TH, SIGNUP_SYNTHETIC, STEP_TH,
  TEMPLATE_MAX, TEMPLATE_MIN, TRIAL_DAYS, signupEnabled, type OnboardingStep,
} from "@/lib/shared/signup";
import { PURPOSE_TEMPLATES } from "@/lib/shared/purpose-templates";

export const metadata: Metadata = { title: "ตั้งค่าบัญชี", robots: { index: false, follow: false } };

/* ── ขั้นตั้งต้นบังคับของบัญชีสมัครเอง (docs/solo-plan.md S9) ──
   ยังไม่มีบัญชี → ตั้งชื่อบัญชี (สร้างบัญชี) · มีแล้ว → ทำทีละขั้นตามลำดับ จนถึงหน้า "วันนี้"
   หน้านี้แสดงเฉพาะขั้นปัจจุบัน — ลำดับจริงบังคับที่ engine ไม่ใช่ที่หน้าจอ */

function Steps({ current }: { current: OnboardingStep | "workspace" }) {
  const all: (OnboardingStep | "workspace")[] = ["workspace", ...ONBOARDING_STEPS.filter((s) => s !== "done")];
  const at = all.indexOf(current);
  return (
    <ol className="c-thai mt-6 flex flex-col gap-1.5 text-[0.84rem]">
      {all.map((s, i) => (
        <li key={s} className={i === at ? "text-[var(--c-text)]" : i < at ? "text-[var(--c-text-3)] line-through" : "text-[var(--c-text-4)]"}>
          {i + 1}. {s === "workspace" ? "ตั้งชื่อบัญชี" : STEP_TH[s]}
          {i === at ? " ←" : ""}
        </li>
      ))}
    </ol>
  );
}

function SignOut() {
  return (
    <form action={signOutAction} className="c-thai mt-10 text-[0.8rem] text-[var(--c-text-4)]">
      <button type="submit" className="underline underline-offset-4">ออกจากระบบ</button>
    </form>
  );
}

export default async function OnboardingPage() {
  /* render ตอนขอเสมอ — ขึ้นกับผู้ใช้ ฐานข้อมูล และ nonce ของ CSP (ไม่งั้น build จะ prerender เป็นหน้านิ่งของโหมดเดโม) */
  await connection();
  /* โหมดเดโม (sqlite ไม่มีการล็อกอิน) ไม่มีบัญชีสมัครเอง */
  if (!membershipEnforced()) {
    return (
      <div className="c-thai max-w-md text-[0.9rem] text-[var(--c-text-3)]">
        <h1 className="c-h1 text-[var(--c-text)]">ตั้งค่าบัญชี</h1>
        <p className="mt-3">หน้านี้ใช้กับบัญชีที่สมัครเองบนระบบที่เชื่อมฐานข้อมูลจริง — เครื่องนี้เป็นโหมดเดโม</p>
        <Link href="/app" className="mt-6 inline-block text-[var(--c-cyan)] underline underline-offset-4">ไปที่คอนโซลเดโม</Link>
      </div>
    );
  }
  const user = await currentUser();
  if (!user) redirect("/login?next=/app");
  if (user.mfa === "pending") redirect("/login/mfa?next=/onboarding");
  enterIdentity(user.userId);

  if (!(await tenantsForUser(user.userId)).length) {
    if (!signupEnabled()) {
      return (
        <div className="max-w-md">
          <h1 className="c-h1 text-[var(--c-text)]">ยังไม่มีบัญชี</h1>
          <p className="c-thai mt-3 text-[0.88rem] leading-relaxed text-[var(--c-text-3)]">
            ผู้ใช้นี้ยังไม่ถูกผูกกับบัญชีใด · {SIGNUP_CLOSED_TH}
          </p>
          <Link href="/contact" className="c-thai mt-6 inline-block text-[0.84rem] text-[var(--c-cyan)] underline underline-offset-4">ติดต่อทีม</Link>
          <SignOut />
        </div>
      );
    }
    return (
      <div className="max-w-md">
        <h1 className="c-h1 text-[var(--c-text)]">ตั้งค่าบัญชี</h1>
        <p className="c-thai mt-3 text-[0.88rem] leading-relaxed text-[var(--c-text-3)]">
          ใช้เวลาไม่เกิน 30 นาที · ทดลองใช้ {TRIAL_DAYS} วัน · AI ปิดระหว่างทดลอง · ข้อมูลสมมุติเท่านั้น
        </p>
        <Steps current="workspace" />
        <ActionForm action={createWorkspaceAction} label="สร้างบัญชี" pendingLabel="กำลังสร้าง…" variant="primary" className="mt-8 flex flex-col gap-4">
          <label className="flex flex-col gap-2">
            <span className="c-label-th">ชื่อบัญชี (ชื่อองค์กรหรือทีมของคุณ)</span>
            <input name="name" required minLength={2} maxLength={80} className="c-input" />
          </label>
          {/* โหมดลูกค้า (docs/crm-plan.md F1) — เปลี่ยนภายหลังได้ที่ ตั้งค่า */}
          <fieldset className="flex flex-col gap-2">
            <legend className="c-label-th mb-2">ลูกค้าของคุณเป็นใคร</legend>
            {CUSTOMER_MODES.map((m) => (
              <label key={m} className="c-thai flex items-start gap-2.5 rounded-[var(--c-radius)] border border-[var(--c-line)] p-3 text-[0.86rem]">
                <input type="radio" name="mode" value={m} defaultChecked={m === "b2b"} className="mt-1" />
                <span><span className="font-semibold text-[var(--c-text)]">{CUSTOMER_MODE_TH[m].label}</span>
                  <span className="block text-[0.78rem] text-[var(--c-text-3)]">{CUSTOMER_MODE_TH[m].lead}</span></span>
              </label>
            ))}
            <span className="c-thai text-[0.75rem] text-[var(--c-text-4)]">เปลี่ยนภายหลังได้ที่ ตั้งค่า</span>
          </fieldset>
        </ActionForm>
        <SignOut />
      </div>
    );
  }

  const v = await viewer();
  const info = await signupInfo(v.tenantId, v.mfa);
  if (!info.selfSignup) redirect("/app");
  if (info.expired) redirect("/upgrade");
  if (info.step === "done") redirect("/app/today");

  return (
    <div className="max-w-2xl">
      <h1 className="c-h1 text-[var(--c-text)]">ตั้งค่าบัญชี</h1>
      <p className="c-thai mt-3 text-[0.88rem] text-[var(--c-text-3)]">ทดลองใช้เหลือ {info.daysLeft} วัน · ทำตามลำดับ ข้ามขั้นไม่ได้</p>
      <Steps current={info.step} />

      <section className="c-panel mt-8 p-6">
        <h2 className="c-h2 c-thai text-[var(--c-text)]">{STEP_TH[info.step]}</h2>

        {info.step === "dpa" && (
          <>
            <p className="c-msg c-msg-err c-thai mt-4">{DPA_DRAFT_BANNER} · ฉบับ {DPA_VERSION} — ใช้ได้กับบัญชีทดลองที่มีแต่ข้อมูลสมมุติเท่านั้น</p>
            <ol className="c-thai mt-4 flex flex-col gap-3 text-[0.86rem] leading-relaxed text-[var(--c-text-2)]">
              {DPA_DRAFT_TH.map((c, i) => (
                <li key={c.title}><strong className="text-[var(--c-text)]">{i + 1}. {c.title}</strong> — {c.body}</li>
              ))}
            </ol>
            <ActionForm action={acceptDpaAction} label="ยอมรับและไปต่อ" pendingLabel="กำลังบันทึก…" variant="primary" className="mt-6 flex flex-col gap-4">
              <label className="c-thai flex items-start gap-2.5 text-[0.84rem] text-[var(--c-text-2)]">
                <input type="checkbox" name="accept" value="yes" required className="mt-1" />
                <span>ยอมรับข้อตกลงนี้ในนามองค์กรของฉัน ในฐานะผู้ควบคุมข้อมูลส่วนบุคคล</span>
              </label>
            </ActionForm>
          </>
        )}

        {info.step === "mfa" && (
          <>
            <p className="c-thai mt-3 text-[0.86rem] leading-relaxed text-[var(--c-text-3)]">
              บัญชีสมัครเองต้องเปิดยืนยันตัวตนสองชั้นก่อนใช้คอนโซล — ทุกครั้งที่เข้าสู่ระบบต้องใช้รหัสจากแอปด้วย
            </p>
            <MfaSetup />
            <ActionForm action={confirmMfaStepAction} label="ยืนยันแล้ว — ไปขั้นถัดไป" pendingLabel="กำลังตรวจ…" className="mt-6" />
          </>
        )}

        {info.step === "templates" && (
          <ActionForm action={chooseTemplatesAction} label="ใช้แม่แบบที่เลือก" pendingLabel="กำลังสร้างวัตถุประสงค์…" variant="primary" className="mt-4 flex flex-col gap-4">
            <p className="c-thai text-[0.86rem] text-[var(--c-text-3)]">
              เลือก {TEMPLATE_MIN}–{TEMPLATE_MAX} ตัว · แต่ละตัวต้องพิมพ์ยืนยันข้อเท็จจริงสั้น ๆ (เก็บเป็นหลักฐานของฐานการประมวลผล) · แม่แบบทุกตัวเป็นร่างที่รอนักกฎหมายตรวจ
            </p>
            {PURPOSE_TEMPLATES.map((t) => (
              <fieldset key={t.code} className="c-panel-flat c-thai flex flex-col gap-2 p-4 text-[0.84rem]">
                <label className="flex items-start gap-2.5 text-[var(--c-text)]">
                  <input type="checkbox" name="code" value={t.code} className="mt-1" />
                  <span><strong>{t.name}</strong> — <span className="text-[var(--c-text-3)]">{t.description}</span></span>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[var(--c-text-4)]">ยืนยัน: {t.mustConfirm}</span>
                  <textarea name={`confirm_${t.code}`} rows={2} maxLength={300} className="c-input" />
                </label>
              </fieldset>
            ))}
          </ActionForm>
        )}

        {info.step === "demo" && (
          <>
            <p className="c-thai mt-3 text-[0.86rem] leading-relaxed text-[var(--c-text-3)]">
              ระบบจะสร้างไฟล์สมมุติ {SIGNUP_SYNTHETIC.sourceRows} แถว (รายชื่อลงทะเบียนงาน · สปอนเซอร์ · นามบัตร — อีเมลโดเมน .example ไม่ใช่ของใคร)
              แล้วนำเข้าผ่านเส้นทางจริง: ลงทะเบียนแหล่ง → ตรวจไฟล์ → ตรวจตัวตน · บัญชีทดลองยังรับไฟล์จริงไม่ได้
            </p>
            <ActionForm action={loadDemoAction} label="โหลดข้อมูลสมมุติแล้วไปหน้าวันนี้" pendingLabel="กำลังนำเข้าและตรวจตัวตน…" variant="primary" className="mt-6" />
          </>
        )}
      </section>
      <SignOut />
    </div>
  );
}
