import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { SignupForm } from "@/components/console/signup-form";
import { SIGNUP_CLOSED_TH, TRIAL_DAYS, signupEnabled } from "@/lib/shared/signup";

export const metadata: Metadata = { title: "สมัครทดลองใช้", robots: { index: false, follow: false } };

/* ── สมัครเอง (docs/solo-plan.md S9) ──
   ปิดโดยปริยาย: ไม่มี SIGNUP_ENABLED=1 = หน้านี้บอกว่ายังไม่เปิดรับ และ action ปฏิเสธ (ไม่ใช่แค่ซ่อนฟอร์ม)
   connection(): อ่านธงตอนขอ ไม่ใช่ตอน build — และหน้าที่ใช้ nonce ของ CSP ต้อง render ตอนขออยู่แล้ว */
export default async function SignupPage() {
  await connection();
  const open = signupEnabled();
  return (
    <div className="max-w-sm">
      <h1 className="c-h1 text-[var(--c-text)]">สมัครทดลองใช้</h1>
      {!open ? (
        <>
          <p className="c-thai mt-3 text-[0.88rem] leading-relaxed text-[var(--c-text-3)]">{SIGNUP_CLOSED_TH}</p>
          <div className="c-thai mt-8 flex flex-col gap-2.5 text-[0.82rem] text-[var(--c-text-3)]">
            <Link href="/contact" className="text-[var(--c-cyan)] underline underline-offset-4">ขอทดลองใช้</Link>
            <Link href="/login" className="underline underline-offset-4">มีบัญชีแล้ว? เข้าสู่ระบบ</Link>
          </div>
        </>
      ) : (
        <>
          <p className="c-thai mt-3 text-[0.88rem] leading-relaxed text-[var(--c-text-3)]">
            ทดลองใช้ {TRIAL_DAYS} วัน · บังคับยืนยันตัวตนสองชั้น · AI ปิดระหว่างทดลอง · ระหว่างนี้บัญชีสมัครเองใช้
            <strong className="text-[var(--c-text-2)]"> ข้อมูลสมมุติเท่านั้น</strong> — ยังไม่รับไฟล์จริงจนกว่าการทดสอบเจาะระบบจะผ่าน
          </p>
          <div className="mt-8"><SignupForm /></div>
          <p className="c-thai mt-8 text-[0.82rem] text-[var(--c-text-3)]">
            มีบัญชีแล้ว? <Link href="/login" className="text-[var(--c-cyan)] underline underline-offset-4">เข้าสู่ระบบ</Link>
          </p>
        </>
      )}
    </div>
  );
}
