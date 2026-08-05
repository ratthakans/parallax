import type { ReactNode } from "react";
import type { Verdict } from "@/lib/shared/types";

export function Panel({
  children,
  className = "",
  flat = false,
}: {
  children: ReactNode;
  className?: string;
  flat?: boolean;
}) {
  return (
    <div className={`${flat ? "c-panel-flat" : "c-panel"} ${className}`}>
      {children}
    </div>
  );
}

/* ── ป้ายกำกับเลือกคลาสจากภาษาของตัวมันเอง ────────────────────

   .c-label เป็น scaffolding แบบอังกฤษ — mono · ตัวพิมพ์ใหญ่ · ถ่างช่องไฟ
   ซึ่งอ่านดีกับ MORNING BRIEF แต่ทำลายจังหวะสระและวรรณยุกต์ของอักษรไทย
   (เหตุผลเต็มอยู่ใน console.css)

   ให้คอมโพเนนต์ตัดสินจากเนื้อความเอง ดีกว่าให้จุดเรียกทุกจุดจำ — Metric
   กับ PageHead ถูกเรียกหลายสิบจุดข้ามทุกหน้า และจะมีจุดใหม่เพิ่มอีก
   กฎที่ต้องจำคือกฎที่จะหลุดในอีกหกเดือน */
const HAS_THAI = /[฀-๿]/;
export const labelClass = (s: string) => (HAS_THAI.test(s) ? "c-label-th" : "c-label");

export function PageHead({
  label,
  title,
  lead,
  actions,
}: {
  label: string;
  title: string;
  lead?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-5">
      <div className="min-w-0">
        <p className={labelClass(label)}>{label}</p>
        <h1 className="c-h1 mt-3 text-[var(--c-text)]">{title}</h1>
        {lead && (
          <p className="c-thai mt-3 max-w-2xl text-[0.9rem] text-[var(--c-text-3)]">
            {lead}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Metric({
  label,
  value,
  sub,
  tone = "plain",
  size = "md",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "plain" | "accent" | "good" | "bad" | "muted";
  size?: "sm" | "md" | "lg";
}) {
  const color =
    tone === "accent"
      ? "text-[var(--c-cyan)]"
      : tone === "good"
        ? "text-[var(--c-good)]"
        : tone === "bad"
          ? "text-[var(--c-bad)]"
          : tone === "muted"
            ? "text-[var(--c-text-3)]"
            : "text-[var(--c-text)]";
  const fs =
    size === "lg" ? "text-[2.4rem]" : size === "sm" ? "text-[1.3rem]" : "text-[1.8rem]";
  return (
    <div className="min-w-0">
      <p className={labelClass(label)}>{label}</p>
      <p className={`c-num mt-2.5 ${fs} ${color}`}>{value}</p>
      {sub && (
        <p className="c-thai mt-1.5 text-[0.78rem] text-[var(--c-text-4)]">{sub}</p>
      )}
    </div>
  );
}

export function EnginePill({ engine }: { engine: "keep" | "reach" }) {
  return (
    <span className={`c-pill ${engine === "keep" ? "c-pill-keep" : "c-pill-reach"}`}>
      {engine === "keep" ? "KEEP" : "REACH"}
    </span>
  );
}

const VERDICT_META: Record<Verdict, { label: string; cls: string }> = {
  positive: { label: "Worked", cls: "c-pill-good" },
  no_effect: { label: "No different", cls: "c-pill-bad" },
  insufficient_data: { label: "Not enough yet", cls: "c-pill-warn" },
};

export function VerdictPill({ verdict }: { verdict: Verdict }) {
  const m = VERDICT_META[verdict];
  return <span className={`c-pill ${m.cls}`}>{m.label}</span>;
}

export const MEASUREMENT_LABEL: Record<string, string> = {
  per_campaign_holdout: "Per-campaign holdout",
  pooled_90d_holdout: "Pooled 90-day holdout",
  time_shifted: "Time-shifted",
};

export function Meter({ treated, holdout }: { treated: number; holdout: number }) {
  const total = Math.max(1, treated + holdout);
  return (
    <div className="c-meter" role="img" aria-label={`${treated} treated, ${holdout} held back`}>
      <span
        style={{
          width: `${(treated / total) * 100}%`,
          background: "var(--c-accent)",
        }}
      />
      <span
        style={{
          width: `${(holdout / total) * 100}%`,
          background: "var(--c-warn)",
        }}
      />
    </div>
  );
}

/* ป้ายบอกที่มาของข้อความ — ผู้ใช้ควรรู้ว่าประโยคที่อ่านอยู่มาจากไหน
   ai = เรียกโมเดลจริง · cache = เคยเรียกแล้วใช้ผลเดิม · fallback = สูตรสำเร็จ

   เดิมเหตุผล (note) อยู่ใน title= บน <span> ที่โฟกัสไม่ได้ — คีย์บอร์ด
   กับมือถือจึงเข้าไม่ถึงเลย ทั้งที่มันคือคำตอบว่าทำไมป้ายถึงเขียนว่า
   "Template copy" ตอนนี้เขียนออกมาให้อ่านตรง ๆ ข้างป้าย สั้นพอที่จะไม่เกะกะ */
export function AiBadge({
  source,
  note,
}: {
  source: "ai" | "fallback" | "cache";
  note?: string;
}) {
  const meta =
    source === "ai"
      ? { label: "AI เขียน", cls: "c-pill-good" }
      : source === "cache"
        ? { label: "AI เขียน · จากแคช", cls: "c-pill-keep" }
        : { label: "สูตรสำเร็จ", cls: "c-pill-warn" };
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className={`c-pill ${meta.cls}`}>{meta.label}</span>
      {note && (
        <span className="c-thai text-[0.74rem] text-[var(--c-text-4)]">{note}</span>
      )}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="c-panel-flat c-thai px-6 py-12 text-center text-[0.88rem] text-[var(--c-text-3)]">
      {children}
    </div>
  );
}

export { baht, num, pct } from "@/lib/shared/format";
