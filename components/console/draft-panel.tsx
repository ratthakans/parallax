"use client";

import { useActionState, useEffect, useState } from "react";
import type { ActionState } from "@/lib/shared/action-state";
import type { DraftState } from "@/lib/shared/policy";
import { ActionForm } from "@/components/console/action-form";

/* ── ร่างข้อความหลังผ่านนโยบาย (docs/solo-plan.md S7) ─────────────────────
   ระบบไม่ส่งเอง: ผู้ใช้คัดลอกหรือเปิดโปรแกรมอีเมลแล้วส่งเอง จากนั้นกลับมากด "ส่งแล้ว"
   ลิงก์เปิดอีเมลใส่แค่หัวเรื่อง (ไม่มีชื่อ ไม่มีที่อยู่ผู้รับ) — เนื้อความใช้ปุ่มคัดลอก ข้อมูลส่วนบุคคลไม่ไปอยู่ใน URL
   ร่างอยู่ในหน้าจอนี้เท่านั้น ไม่ถูกเก็บ */

export function DraftPanel({
  draftAction, sentAction, campaignId, targetId,
}: {
  draftAction: (prev: DraftState, fd: FormData) => Promise<DraftState>;
  sentAction: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  campaignId: string;
  targetId: string;
}) {
  const [state, formAction, pending] = useActionState(draftAction, null);
  const draft = state?.draft;
  const [body, setBody] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => { setBody(draft?.body ?? ""); setCopied(false); }, [draft]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(draft?.channel === "email" && draft.subject ? `${draft.subject}\n\n${body}` : body);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="grid gap-2">
      <form action={formAction}>
        <input type="hidden" name="targetId" value={targetId} />
        <button type="submit" disabled={pending} aria-busy={pending || undefined} className="c-btn c-btn-ghost c-btn-sm">
          {pending ? "กำลังตรวจนโยบายและร่าง…" : draft ? "ร่างใหม่" : "ร่างข้อความ"}
        </button>
      </form>
      {state?.error && <p role="alert" className="c-msg c-msg-err">{state.error}</p>}
      {draft && (
        <div className="grid gap-2 rounded-md border border-[var(--c-line)] p-3">
          {state?.ok && <p role="status" className="c-msg c-msg-ok">{state.ok}</p>}
          {draft.note && <p className="text-[var(--c-text-4)]">{draft.note}</p>}
          {draft.channel === "email" && (
            <p className="text-[var(--c-text-2)]">หัวเรื่อง: <span className="text-[var(--c-text)]">{draft.subject}</span></p>
          )}
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={10} className="c-input min-h-[10rem]" aria-label="ร่างข้อความ" />
          <ul className="grid gap-0.5 text-[var(--c-text-4)]">
            {draft.introducedBy && <li>· อ้างการแนะนำของคุณ{draft.introducedBy} — มีความสัมพันธ์ “ได้รับการแนะนำโดย” ที่ยืนยันแล้ว</li>}
            {draft.optOut && <li>· ใส่วิธียกเลิกรับตามแม่แบบแล้ว (ข้อความการตลาด)</li>}
            <li>· รุ่นนโยบาย <span className="c-mono">{draft.policyVersion}</span></li>
            {draft.evidence.length > 0 && <li>· หลักฐานที่ใช้: {draft.evidence.map((e) => `${e.id} ${e.text}`).join(" · ")}</li>}
          </ul>
          <div className="flex flex-wrap items-start gap-2">
            <button type="button" onClick={copy} className="c-btn c-btn-ghost c-btn-sm">{copied ? "คัดลอกแล้ว" : "คัดลอก"}</button>
            {draft.channel === "email" && (
              <a href={`mailto:?subject=${encodeURIComponent(draft.subject)}`} className="c-btn c-btn-ghost c-btn-sm">เปิดอีเมล</a>
            )}
          </div>
          <ActionForm action={sentAction} fields={{ campaignId, targetId }} label="ส่งแล้ว" pendingLabel="กำลังตรวจนโยบาย…" size="sm" variant="primary"
            note={<p className="text-[var(--c-text-4)]">ส่งเองนอกระบบแล้วค่อยกด — ระบบตรวจนโยบายซ้ำก่อนบันทึก ถ้าเจ้าของข้อมูลถอนหรือคัดค้านระหว่างนี้ จะบันทึกไม่ได้</p>} />
        </div>
      )}
    </div>
  );
}
