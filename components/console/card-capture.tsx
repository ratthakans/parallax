"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { captureCardsAction } from "@/app/(app)/capture-actions";
import type { CaptureResult, CardInput, CardOutcome } from "@/lib/engine/vault/cards";
import { CARD_BATCH_MAX } from "@/lib/shared/capture";
import { num } from "./ui";

/* ── กรอกนามบัตรทีละชุด (docs/solo-plan.md S6 · 6a) ─────────────────────

   ชื่องานและวันที่ถามครั้งเดียวต่อชุด · แต่ละใบ: ชื่อ ตำแหน่ง บริษัท อีเมล เบอร์
   กดบันทึก = ทั้งชุดเข้า Data Vault แล้วตรวจตัวตนทันที — ตรงกับคนเดิมไม่สร้างคนซ้ำ · ไม่แน่ใจ = คิวตรวจ */

const LABEL = "c-thai flex min-w-0 flex-col gap-1 text-[0.8rem] text-[var(--c-text-3)]";
const blank = (): CardInput => ({ name: "", title: "", company: "", email: "", phone: "" });
const OUTCOME_TH: Record<CardOutcome, string> = {
  new: "คนใหม่",
  existing: "ตรงกับคนเดิม — เพิ่มเข้าคนเดิม ไม่สร้างซ้ำ",
  review: "ไปคิวตรวจ — อาจเป็นคนเดิม ให้คนตัดสิน",
  rejected: "ไม่บันทึก",
  suspended: "พักไว้ — ตรงกับคนที่ถูกลบ",
};

export function CardCapture({ today }: { today: string }) {
  const [event, setEvent] = useState("");
  const [date, setDate] = useState(today);
  const [cards, setCards] = useState<CardInput[]>([blank()]);
  const [result, setResult] = useState<Extract<CaptureResult, { ok: true }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const set = (i: number, k: keyof CardInput, v: string) => setCards((cs) => cs.map((c, j) => (j === i ? { ...c, [k]: v } : c)));

  function save() {
    setError(null);
    const fd = new FormData();
    fd.set("event", event);
    fd.set("date", date);
    fd.set("cards", JSON.stringify(cards));
    start(async () => {
      const res = await captureCardsAction(fd);
      if (!res.ok) { setError(res.error); return; }
      setResult(res);
      setCards([blank()]);
    });
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-3">
        <label className={`${LABEL} md:col-span-2`}>ได้นามบัตรชุดนี้จากงานไหน
          <input value={event} onChange={(e) => setEvent(e.target.value)} className="c-input" placeholder="เช่น งานแสดงสินค้าพลังงาน 2026" />
        </label>
        <label className={LABEL}>วันที่ของงาน
          <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className="c-input" />
        </label>
      </div>

      {cards.map((c, i) => (
        <fieldset key={i} className="grid gap-2 border-t border-[var(--c-line)] pt-3 md:grid-cols-5">
          <legend className="c-thai mb-1 text-[0.76rem] text-[var(--c-text-4)]">ใบที่ {num(i + 1)}</legend>
          <label className={LABEL}>ชื่อ-นามสกุล<input value={c.name} onChange={(e) => set(i, "name", e.target.value)} className="c-input" /></label>
          <label className={LABEL}>ตำแหน่ง<input value={c.title} onChange={(e) => set(i, "title", e.target.value)} className="c-input" /></label>
          <label className={LABEL}>บริษัท<input value={c.company} onChange={(e) => set(i, "company", e.target.value)} className="c-input" /></label>
          <label className={LABEL}>อีเมล<input type="email" value={c.email} onChange={(e) => set(i, "email", e.target.value)} className="c-input" /></label>
          <label className={LABEL}>เบอร์<input type="tel" value={c.phone} onChange={(e) => set(i, "phone", e.target.value)} className="c-input" /></label>
          {cards.length > 1 && (
            <div className="md:col-span-5">
              <button type="button" className="c-btn c-btn-ghost c-btn-sm" onClick={() => setCards((cs) => cs.filter((_, j) => j !== i))}>เอาใบนี้ออก</button>
            </div>
          )}
        </fieldset>
      ))}

      <div className="flex flex-wrap gap-2">
        <button type="button" className="c-btn c-btn-ghost" disabled={cards.length >= CARD_BATCH_MAX} onClick={() => setCards((cs) => [...cs, blank()])}>เพิ่มอีกใบ</button>
        <button type="button" className="c-btn c-btn-primary" disabled={pending || !event.trim()} aria-busy={pending || undefined} onClick={save}>
          {pending ? "กำลังบันทึก…" : `บันทึก ${num(cards.length)} ใบ`}
        </button>
      </div>
      {error && <p role="alert" className="c-msg c-msg-err">{error}</p>}

      {result && (
        <div role="status" className="c-msg c-msg-ok">
          <p className="c-thai">
            บันทึกแล้ว {num(result.cards.length)} ใบ · คนใหม่ {num(result.cards.filter((c) => c.outcome === "new").length)}
            {" "}· ตรงกับคนเดิม {num(result.cards.filter((c) => c.outcome === "existing").length)}
            {" "}· ไปคิวตรวจ {num(result.cards.filter((c) => c.outcome === "review").length)}
          </p>
          <ul className="c-thai mt-1 text-[0.8rem]">
            {result.cards.map((c) => (
              <li key={c.line}>ใบที่ {num(c.line)}: {OUTCOME_TH[c.outcome]}{c.reason ? ` (${c.reason})` : ""}</li>
            ))}
          </ul>
          {result.resolveError && <p className="mt-1">ตรวจตัวตนไม่สำเร็จ: {result.resolveError} — สั่งตรวจใหม่ได้จากหน้าคิวตรวจ</p>}
          <p className="mt-1 text-[0.8rem]">
            <Link href={`/app/vault/batches/${result.batchId}`} className="underline">ดูผลรายใบ</Link>
            {" · "}<Link href="/app/vault/review" className="underline">คิวตรวจ</Link>
          </p>
        </div>
      )}
    </div>
  );
}
