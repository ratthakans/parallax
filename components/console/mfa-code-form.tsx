"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { verifyMfaAction } from "@/app/login/actions";

/* รหัส 6 หลักจากแอปยืนยันตัวตน — ใช้ทั้งตอนเข้าสู่ระบบ และตอนยืนยันแอปที่เพิ่งเพิ่ม (มี factorId) */
function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="c-btn c-btn-primary justify-center">
      {pending ? "กำลังตรวจ…" : label}
    </button>
  );
}

export function MfaCodeForm({ next, factorId, label = "ยืนยัน" }: { next?: string; factorId?: string; label?: string }) {
  const [state, action] = useActionState(verifyMfaAction, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      {next && <input type="hidden" name="next" value={next} />}
      {factorId && <input type="hidden" name="factorId" value={factorId} />}
      <label className="flex flex-col gap-2">
        <span className="c-label-th">รหัส 6 หลักจากแอป</span>
        <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required className="c-input c-mono tracking-[0.3em]" />
      </label>
      {state?.error && <p className="c-msg c-msg-err" role="alert">{state.error}</p>}
      {state?.ok && <p className="c-msg c-msg-ok" role="status">{state.ok}</p>}
      <Submit label={label} />
    </form>
  );
}
