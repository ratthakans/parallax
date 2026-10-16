"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { moveDealAction } from "@/app/(app)/deal-actions";
import { DEAL_STAGE_TH, type DealStage } from "@/lib/shared/deals";

/* ── ไปป์ไลน์ดีลแบบลากวาง (docs/ux-plan.md U4 · 5.3) ─────────────────────
   ลากการ์ดไปคอลัมน์อื่น = ย้ายขั้น (เซิร์ฟเวอร์เขียนรุ่นใน record_versions) · ขยับบนจอทันทีแล้วค่อยยืนยันกับเซิร์ฟเวอร์
   ย้ายไม่สำเร็จ (เช่น สิทธิ์ไม่พอ) = การ์ดกลับที่เดิมพร้อมข้อความ
   ลากไม่ได้ (คีย์บอร์ด · มือถือ) ใช้ตัวเลือกขั้นบนการ์ดแทน */

export type BoardDeal = { id: string; name: string; org: string; stage: string; value: number | null; expectedClose: string | null; owner: string | null };

const baht = (n: number) => `฿${n.toLocaleString("th-TH", { maximumFractionDigits: 0 })}`;

export function DealBoard({ deals, stages }: { deals: BoardDeal[]; stages: DealStage[] }) {
  const router = useRouter();
  const [items, setItems] = useState(deals);
  const [over, setOver] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  function move(id: string, stage: DealStage) {
    const before = items.find((d) => d.id === id);
    if (!before || before.stage === stage) return;
    setError(null);
    setItems((xs) => xs.map((d) => (d.id === id ? { ...d, stage } : d)));
    start(async () => {
      const fd = new FormData();
      fd.set("dealId", id);
      fd.set("stage", stage);
      const res = await moveDealAction(null, fd);
      if (res?.error) {
        setItems((xs) => xs.map((d) => (d.id === id ? { ...d, stage: before.stage } : d)));
        setError(res.error);
      } else router.refresh();
    });
  }

  return (
    <>
      {error && <p role="alert" className="c-msg c-msg-err mb-3">{error}</p>}
      <div className="c-scroll -mx-1 pb-2">
        <div className="grid auto-cols-[minmax(15rem,1fr)] grid-flow-col gap-3 px-1">
          {stages.map((s) => {
            const col = items.filter((d) => d.stage === s);
            const sum = col.reduce((t, d) => t + (d.value ?? 0), 0);
            return (
              <section
                key={s}
                aria-label={`ขั้น ${DEAL_STAGE_TH[s]}`}
                onDragOver={(e) => { e.preventDefault(); setOver(s); }}
                onDragLeave={() => setOver((x) => (x === s ? null : x))}
                onDrop={(e) => { e.preventDefault(); setOver(null); move(e.dataTransfer.getData("text/plain"), s); }}
                className={`flex min-h-[20rem] flex-col rounded-[var(--c-radius)] border p-2 ${over === s ? "border-[var(--c-accent)] bg-[var(--c-hover)]" : "border-[var(--c-line)] bg-[var(--c-panel-2)]"}`}
              >
                <header className="px-1.5 pb-2">
                  <p className="text-[0.88rem] font-semibold text-[var(--c-text)]">{DEAL_STAGE_TH[s]} <span className="font-normal text-[var(--c-text-4)]">({col.length})</span></p>
                  <p className="c-mono text-[0.75rem] text-[var(--c-text-3)]">{sum ? baht(sum) : "—"}</p>
                </header>
                <ul className="flex flex-col gap-2">
                  {col.map((d) => (
                    <li
                      key={d.id}
                      draggable
                      onDragStart={(e) => { e.dataTransfer.setData("text/plain", d.id); e.dataTransfer.effectAllowed = "move"; }}
                      className="c-panel cursor-grab p-3 active:cursor-grabbing"
                    >
                      <Link href={`/app/deals/${d.id}`} className="block text-[0.88rem] font-medium text-[var(--c-accent)] hover:underline">{d.name}</Link>
                      <p className="c-thai mt-0.5 truncate text-[0.78rem] text-[var(--c-text-3)]">{d.org}</p>
                      <p className="c-thai mt-1 flex flex-wrap justify-between gap-x-2 text-[0.76rem] text-[var(--c-text-3)]">
                        <span className="c-mono">{d.value != null ? baht(d.value) : "ไม่ระบุมูลค่า"}</span>
                        {d.expectedClose && <span>ปิด {new Date(d.expectedClose).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}</span>}
                      </p>
                      <label className="sr-only" htmlFor={`stage-${d.id}`}>ย้ายขั้นของ {d.name}</label>
                      <select
                        id={`stage-${d.id}`}
                        value={d.stage}
                        onChange={(e) => move(d.id, e.target.value as DealStage)}
                        className="c-select mt-2 min-h-8 py-1 text-[0.78rem]"
                      >
                        {stages.map((x) => <option key={x} value={x}>{DEAL_STAGE_TH[x]}</option>)}
                      </select>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </>
  );
}
