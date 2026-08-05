"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { signInAction } from "@/app/login/actions";

/* ปุ่มต้องรู้สถานะของฟอร์มที่มันอยู่ ซึ่ง useFormStatus อ่านได้จาก
   คอมโพเนนต์ลูกเท่านั้น จึงต้องแยกออกมา ไม่ใช่รวมอยู่ในฟอร์ม */
function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="c-btn c-btn-primary w-full justify-center"
    >
      {pending ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
    </button>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState(signInAction, null);

  return (
    <form action={action} className="flex flex-col gap-4">
      {next && <input type="hidden" name="next" value={next} />}

      <label className="flex flex-col gap-2">
        <span className="c-label-th">อีเมล</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          className="c-input"
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="c-label-th">รหัสผ่าน</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="c-input"
        />
      </label>

      {state?.error && (
        <p className="c-msg c-msg-err" role="alert">
          {state.error}
        </p>
      )}

      <div className="mt-1">
        <Submit />
      </div>
    </form>
  );
}
