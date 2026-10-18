"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { confirmNoteAction, draftNoteAction } from "@/app/(app)/capture-actions";
import { ActionForm } from "./action-form";
import { INTERACTION_KINDS, INTERACTION_TH } from "@/lib/shared/accounts";
import { CLASSIFICATIONS, CLASSIFICATION_TH } from "@/lib/shared/vault";
import type { NoteDraft } from "@/lib/shared/capture";

/* ── โน้ตหลังพบลูกค้า (docs/solo-plan.md S6 · 6b) ─────────────────────

   ช่องเดียว พิมพ์หรือวาง → แยกเป็นร่าง → ผู้ใช้แก้ทุกช่องได้ → กดยืนยันจึงบันทึก
   ร่างไม่ถูกเก็บที่ไหนเลยจนกดยืนยัน · ชื่อที่ไม่มีในแฟ้มแสดงเป็น "คนที่ไม่รู้จัก" — ระบบไม่สร้างคนให้ */

const LABEL = "c-thai flex min-w-0 flex-col gap-1 text-[0.8rem] text-[var(--c-text-3)]";

/* subject = คนที่เปิดหน้าอยู่ (หน้าผู้ติดต่อ) — ติ๊กไว้ให้เสมอ ไม่งั้นโน้ตไปผูกแค่บริษัทและไม่ขึ้นที่หน้าคนนั้น (docs/qa-plan.md BUG-20) */
export function NoteCapture({ orgId, people, subject }: { orgId: string; people: { personId: string; name: string }[]; subject?: string }) {
  const [note, setNote] = useState("");
  const [draft, setDraft] = useState<NoteDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const [pending, start] = useTransition();

  function parse() {
    setError(null);
    const fd = new FormData();
    fd.set("orgId", orgId);
    fd.set("note", note);
    start(async () => {
      const res = await draftNoteAction(fd);
      if (!res.ok) { setDraft(null); setError(res.error); return; }
      setDraft(res.draft);
      setRound((r) => r + 1);
    });
  }

  function reset() {
    setDraft(null);
    setError(null);
    setNote("");
  }

  const chosen = new Set([...(draft?.participants.map((p) => p.personId) ?? []), ...(subject ? [subject] : [])]);

  return (
    <div className="grid gap-3">
      <label className={LABEL}>โน้ตหลังพบลูกค้า — พิมพ์หรือวางได้เลย ไม่ต้องจัดรูป
        <textarea
          value={note}
          onChange={(e) => { setNote(e.target.value); setDraft(null); }}
          rows={5}
          className="c-input"
          placeholder="เช่น ประชุมกับคุณวิภาเมื่อวาน สนใจแพ็กเกจบูธ 2 ล็อก ขอใบเสนอราคาภายในศุกร์หน้า"
          maxLength={4000}
        />
      </label>
      {!draft && (
        <div>
          <button type="button" className="c-btn c-btn-primary" disabled={pending || !note.trim()} aria-busy={pending || undefined} onClick={parse}>
            {pending ? "กำลังแยก…" : "แยกโน้ต"}
          </button>
          <p className="c-thai mt-2 text-[0.76rem] text-[var(--c-text-4)]">ยังไม่มีอะไรถูกบันทึก — ระบบแสดงผลแยกให้ตรวจก่อน</p>
        </div>
      )}
      {error && <p role="alert" className="c-msg c-msg-err">{error}</p>}

      {draft && (
        <div key={round} className="grid gap-3 border-t border-[var(--c-line)] pt-3">
          <p className="c-thai text-[0.8rem] text-[var(--c-text-3)]">
            {draft.source === "ai"
              ? `AI แยกให้แล้ว — ตรวจและแก้ก่อนกดยืนยัน${draft.dropped ? ` · ทิ้ง ${draft.dropped} ค่าที่ไม่ผ่านการตรวจ` : ""}`
              : `บันทึกเป็นโน้ตดิบ — ${draft.note ?? "AI ไม่ได้ใช้"} · แก้ช่องด้านล่างเองได้`}
          </p>
          {draft.unknownPeople.length > 0 && (
            <div className="c-msg">
              <p className="c-thai text-[0.84rem]">คนที่ไม่รู้จัก (ไม่มีในแฟ้มบริษัทนี้): {draft.unknownPeople.join(" · ")}</p>
              <p className="c-thai mt-1 text-[0.76rem] text-[var(--c-text-3)]">
                ระบบไม่สร้างคนใหม่จากโน้ต — ถ้าต้องการเพิ่ม <Link href="/app/vault/cards" className="underline">เพิ่มเป็นคนใหม่ผ่านนามบัตร</Link> หรือนำเข้าใน Data Vault
              </p>
            </div>
          )}
          <ActionForm
            action={confirmNoteAction}
            fields={{ orgId, note }}
            label="ยืนยันและบันทึก"
            pendingLabel="กำลังบันทึก…"
            variant="primary"
            className="grid gap-3 md:grid-cols-3"
          >
            <label className={LABEL}>ชนิด
              <select name="kind" className="c-select" defaultValue={draft.kind}>
                {INTERACTION_KINDS.map((k) => <option key={k} value={k}>{INTERACTION_TH[k]}</option>)}
              </select>
            </label>
            <label className={LABEL}>วันที่<input type="date" name="occurredAt" defaultValue={draft.occurredAt} className="c-input" required /></label>
            <label className={LABEL}>ระดับความลับ
              <select name="classification" className="c-select" defaultValue="confidential">
                {CLASSIFICATIONS.map((c) => <option key={c} value={c}>{CLASSIFICATION_TH[c]}{c === "restricted_high" ? " (เห็นเฉพาะคุณ · ไม่ส่งให้ AI)" : ""}</option>)}
              </select>
            </label>
            <fieldset className={`${LABEL} md:col-span-3`}>
              <legend className="mb-1">ผู้เข้าร่วม (เฉพาะคนในแฟ้ม)</legend>
              {people.length ? (
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {people.map((p) => (
                    <label key={p.personId} className="inline-flex items-center gap-1.5 text-[var(--c-text-2)]">
                      <input type="checkbox" name="personIds" value={p.personId} defaultChecked={chosen.has(p.personId)} /> {p.name}
                    </label>
                  ))}
                </div>
              ) : <span>ยังไม่มีคนในแฟ้มบริษัทนี้</span>}
            </fieldset>
            <label className={`${LABEL} md:col-span-3`}>คุยอะไร
              <textarea name="summary" rows={3} className="c-input" defaultValue={draft.summary} required />
            </label>
            <label className={`${LABEL} md:col-span-3`}>ผล<input name="outcome" className="c-input" defaultValue={draft.outcome} /></label>
            <label className={`${LABEL} md:col-span-2`}>งานถัดไป (ไม่บังคับ)<input name="taskTitle" className="c-input" defaultValue={draft.task.title} /></label>
            <label className={LABEL}>กำหนด<input type="date" name="taskDue" className="c-input" defaultValue={draft.task.dueAt} /></label>
            <label className={`${LABEL} md:col-span-3`}>ความสนใจที่พูดถึง (หนึ่งบรรทัดต่อเรื่อง)
              <textarea name="interests" rows={2} className="c-input" defaultValue={draft.interests.join("\n")} />
            </label>
          </ActionForm>
          <div>
            <button type="button" className="c-btn c-btn-ghost c-btn-sm" onClick={reset}>ทิ้งร่างนี้</button>
          </div>
        </div>
      )}
    </div>
  );
}
