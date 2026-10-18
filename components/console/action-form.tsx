"use client";

import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
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
  id,
  ariaLabel,
  closeOnSuccess = false,
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
  /* ให้ช่องที่อยู่นอกฟอร์มผูกเข้ามาได้ด้วย form="<id>" — เช่น ช่องติ๊กเลือกหลายแถว (U5) */
  id?: string;
  /* ชื่อปุ่มสำหรับโปรแกรมอ่านจอ เมื่อป้ายเป็นสัญลักษณ์ เช่น "×" (BUG-08) */
  ariaLabel?: string;
  /* ฟอร์มในหน้าต่างลอย (<details>) — สำเร็จแล้วพับหน้าต่างและแจ้งผลมุมจอ (BUG-02) */
  closeOnSuccess?: boolean;
  children?: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [armed, setArmed] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  /* ── ไม่ล้างช่องเมื่อส่งไม่ผ่าน (docs/qa-plan.md BUG-24) ──
     <form action> ของ React 19 ล้างฟอร์มเองหลังทุกการส่ง รวมถึงตอนที่เซิร์ฟเวอร์ปฏิเสธ — ผู้ใช้ต้องพิมพ์ใหม่หมด
     และคำแนะนำอย่าง "ติ๊กแล้วกดอีกครั้ง" ทำตามไม่ได้ · ส่งเองผ่าน onSubmit แล้วล้างเฉพาะเมื่อสำเร็จ */
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter;
    const fd = new FormData(e.currentTarget, submitter ?? undefined);
    startTransition(() => formAction(fd));
  }
  useEffect(() => {
    if (!state?.ok) return;
    formRef.current?.reset();
    if (closeOnSuccess) formRef.current?.closest("details")?.removeAttribute("open");
  }, [state, closeOnSuccess]);

  /* ปุ่มเดี่ยวขนาดเล็ก (หัวระเบียน · ตาราง · Path) แสดงผลเป็นข้อความลอยมุมจอ — แทรกในแถวแล้วดันปุ่มข้าง ๆ
     จนคลิกพลาด (docs/qa-plan.md BUG-11) · ฟอร์มที่มีช่องกรอกยังแสดงใต้ฟอร์มตามเดิม */
  const floating = (!children && size === "sm") || closeOnSuccess;
  const [shown, setShown] = useState<ActionState>(null);
  useEffect(() => {
    if (!floating || !state) return;
    setShown(state);
    const t = setTimeout(() => setShown(null), state.error ? 8000 : 4000);
    return () => clearTimeout(t);
  }, [state, floating]);

  const needsConfirm = confirm != null && !armed;
  const btnClass = [
    "c-btn",
    variant === "primary"
      ? "c-btn-primary"
      : variant === "danger"
        ? "c-btn-danger"
        : "c-btn-ghost",
    size === "sm" ? "c-btn-sm" : "",
    /* ไม่ยืดตามช่องของ grid/flex (BUG-22) */
    full ? "w-full" : "self-start justify-self-start",
    buttonClassName,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <form id={id} ref={formRef} action={formAction} onSubmit={onSubmit} className={className}>
      {fields &&
        Object.entries(fields).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={String(v)} />
        ))}
      {children}

      <button
        type={needsConfirm ? "button" : "submit"}
        /* preventDefault จำเป็น: React เปลี่ยน type เป็น submit ก่อนที่เบราว์เซอร์จะตัดสินว่าคลิกนี้ส่งฟอร์มไหม
           ไม่กันไว้ = กดครั้งแรกก็ส่งเลย ขั้นยืนยันหายไปเงียบ ๆ (เจอตอนทดสอบปุ่มอนุมัติส่งออก B6) */
        onClick={needsConfirm ? (e) => { e.preventDefault(); setArmed(true); } : undefined}
        onBlur={confirm ? () => setArmed(false) : undefined}
        disabled={pending || disabled}
        aria-busy={pending || undefined}
        aria-label={ariaLabel && !pending && !armed ? ariaLabel : undefined}
        className={btnClass}
      >
        {pending ? (pendingLabel ?? "Working…") : armed ? confirm : label}
      </button>

      {floating && (shown?.error || shown?.ok) && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm">
          <p role={shown.error ? "alert" : "status"} className={`c-msg c-toast ${shown.error ? "c-msg-err" : "c-msg-ok"}`}>{shown.error ?? shown.ok}</p>
        </div>
      )}
      {!floating && (state?.error || state?.ok) && (
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
