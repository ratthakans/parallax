"use client";

import { useActionState } from "react";
import { signUpAction } from "@/app/(gate)/signup/actions";
import { PASSWORD_MIN } from "@/lib/shared/signup";

/* ฟอร์มสมัคร (S9) — อีเมล + รหัสผ่าน · ยืนยันสองชั้นบังคับในขั้นตั้งต้นถัดไป ไม่ใช่ที่นี่ */
export function SignupForm() {
  const [state, action, pending] = useActionState(signUpAction, null);
  if (state?.ok) return <p role="status" className="c-msg c-msg-ok">{state.ok}</p>;
  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-2">
        <span className="c-label-th">อีเมลที่ใช้ทำงาน</span>
        <input name="email" type="email" autoComplete="email" required className="c-input" />
      </label>
      <label className="flex flex-col gap-2">
        <span className="c-label-th">รหัสผ่าน (อย่างน้อย {PASSWORD_MIN} ตัวอักษร)</span>
        <input name="password" type="password" autoComplete="new-password" minLength={PASSWORD_MIN} required className="c-input" />
      </label>
      <label className="flex flex-col gap-2">
        <span className="c-label-th">รหัสผ่านอีกครั้ง</span>
        <input name="confirm" type="password" autoComplete="new-password" minLength={PASSWORD_MIN} required className="c-input" />
      </label>
      <label className="c-thai flex items-start gap-2.5 text-[0.84rem] leading-relaxed text-[var(--c-text-2)]">
        <input type="checkbox" name="synthetic" value="yes" required className="mt-1" />
        <span>เข้าใจว่าระหว่างทดลองใช้ บัญชีนี้ใช้ข้อมูลสมมุติที่ระบบสร้างให้เท่านั้น และจะไม่นำข้อมูลส่วนบุคคลจริงเข้าระบบ</span>
      </label>
      {state?.error && <p className="c-msg c-msg-err" role="alert">{state.error}</p>}
      <button type="submit" disabled={pending} className="c-btn c-btn-primary mt-1 w-full justify-center">
        {pending ? "กำลังสมัคร…" : "สมัครทดลองใช้ 14 วัน"}
      </button>
    </form>
  );
}
