"use client";

import { useActionState, useState, type ReactNode } from "react";
import type { ActionState } from "@/lib/shared/action-state";

/* ── ฟอร์มเดียวที่ทุกปุ่มในคอนโซลใช้ ────────────────────────────

   เดิมทุกฟอร์มเป็น <form action={serverAction}> เปล่า ๆ กดแล้วเงียบสนิท
   จนกว่าหน้าจะเปลี่ยน สองปุ่มที่ย้อนกลับไม่ได้ (Approve · Send) จึงไม่มี
   อะไรบอกว่ากดติดแล้ว — คนก็กดซ้ำ ฐานข้อมูลกันการส่งซ้ำไว้แล้วก็จริง
   (F12) แต่นั่นแก้ที่ข้อมูล ไม่ได้แก้ที่ความรู้สึกว่ากดไม่ติด

   และการกดที่ "ไม่เกิดอะไรขึ้น" ก็ต้องบอกด้วย — กด Send ตอนสี่ทุ่มแล้ว
   ติดช่วงห้ามส่ง หน้าเดิมเรนเดอร์ใหม่เหมือนเดิมเป๊ะ ทั้งที่ไม่มีใครได้รับ
   ข้อความสักคน

   confirm ใช้กับปุ่มที่ลบของ: กดครั้งแรกเปลี่ยนเป็นคำถาม กดซ้ำจึงทำงาน
   เลือกวิธีนี้แทน dialog เพราะไม่ขโมยโฟกัสและกดพลาดแล้วแค่กดที่อื่น */

export function ActionForm({
  action,
  label,
  pendingLabel,
  fields,
  variant = "ghost",
  size = "md",
  full = false,
  disabled = false,
  confirm,
  note,
  className = "",
  buttonClassName = "",
  children,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  label: ReactNode;
  pendingLabel?: ReactNode;
  fields?: Record<string, string | number>;
  variant?: "primary" | "ghost" | "danger";
  size?: "sm" | "md";
  full?: boolean;
  /* ปิดปุ่มแต่ยังเรนเดอร์ฟอร์มไว้ที่เดิม — สำคัญกับปุ่มที่ทำงานแล้ว
     "หมดหน้าที่" เช่น Send ที่ส่งครบแล้ว ถ้าสลับไปเป็น element อื่น
     ฟอร์มจะถูกถอดออกจากต้นไม้ พร้อมกับรายงานผลที่เพิ่งเขียนออกมา
     ผู้ใช้กดส่งสำเร็จแล้วจึงไม่เห็นว่าส่งไปกี่คนและเหลือเครดิตเท่าไร */
  disabled?: boolean;
  confirm?: string;
  note?: ReactNode;
  className?: string;
  buttonClassName?: string;
  children?: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [armed, setArmed] = useState(false);

  const needsConfirm = confirm != null && !armed;
  const btnClass = [
    "c-btn",
    variant === "primary"
      ? "c-btn-primary"
      : variant === "danger"
        ? "c-btn-danger"
        : "c-btn-ghost",
    size === "sm" ? "c-btn-sm" : "",
    full ? "w-full" : "",
    buttonClassName,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <form action={formAction} className={className}>
      {fields &&
        Object.entries(fields).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={String(v)} />
        ))}
      {children}

      <button
        type={needsConfirm ? "button" : "submit"}
        onClick={needsConfirm ? () => setArmed(true) : undefined}
        onBlur={confirm ? () => setArmed(false) : undefined}
        disabled={pending || disabled}
        aria-busy={pending || undefined}
        className={btnClass}
      >
        {pending ? (pendingLabel ?? "Working…") : armed ? confirm : label}
      </button>

      {(state?.error || state?.ok) && (
        <div className="mt-3 flex flex-col gap-1.5">
          {state.error && (
            <p role="alert" className="c-msg c-msg-err">
              {state.error}
            </p>
          )}
          {state.ok && (
            <p role="status" className="c-msg c-msg-ok">
              {state.ok}
            </p>
          )}
        </div>
      )}

      {note && <div className="mt-2.5">{note}</div>}
    </form>
  );
}
