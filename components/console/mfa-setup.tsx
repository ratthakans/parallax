"use client";

import { useActionState } from "react";
import { startMfaEnrollAction } from "@/app/(app)/mfa-actions";
import { MfaCodeForm } from "@/components/console/mfa-code-form";

/* เพิ่มแอปยืนยันตัวตน: กดเริ่ม → สแกน QR (หรือพิมพ์รหัสลับ) → ใส่รหัส 6 หลักเพื่อยืนยัน
   QR เป็น SVG data URL จาก Supabase — ไม่ผ่านบริการภายนอก */
export function MfaSetup() {
  const [state, start, pending] = useActionState(startMfaEnrollAction, null);
  if (!state?.factorId) {
    return (
      <form action={start} className="mt-3">
        <button type="submit" disabled={pending} className="c-btn c-btn-primary c-btn-sm">{pending ? "กำลังเริ่ม…" : "เปิดใช้ยืนยันสองชั้น"}</button>
        {state?.error && <p role="alert" className="c-msg c-msg-err mt-3">{state.error}</p>}
      </form>
    );
  }
  return (
    <div className="mt-4 grid gap-5 sm:grid-cols-[12rem_minmax(0,1fr)]">
      <div>
        {/* eslint-disable-next-line @next/next/no-img-element -- data URL ของ SVG ไม่ต้องผ่านตัวปรับรูป */}
        <img src={state.qr} alt="QR สำหรับแอปยืนยันตัวตน" className="w-48 rounded bg-white p-2" />
        <p className="c-thai mt-2 text-[0.75rem] text-[var(--c-text-4)]">สแกนไม่ได้? พิมพ์รหัสนี้ในแอป</p>
        <p className="c-mono break-all text-[0.75rem] text-[var(--c-text-2)]">{state.secret}</p>
      </div>
      <div className="max-w-xs">
        <p className="c-thai mb-3 text-[0.84rem] text-[var(--c-text-3)]">สแกนด้วย Google Authenticator, Microsoft Authenticator หรือแอปที่คล้ายกัน แล้วใส่รหัสที่แอปแสดงเพื่อยืนยัน</p>
        <MfaCodeForm factorId={state.factorId} label="ยืนยันและเปิดใช้" />
      </div>
    </div>
  );
}
