"use client";

import { useInView } from "@/components/reveal";

/* ── สี่รูปทรงวงจร วาดบนเส้นเวลาเดียวกัน ───────────────────────

   หน้า /customers บอกว่า "เราคัดด้วยรูปทรงของวงจรรายได้ ไม่ใช่ป้ายอุตสาหกรรม"
   ซึ่งเป็นข้อโต้แย้งทั้งหมดของหน้า แล้วอธิบายรูปทรงทั้งสี่ด้วยคำล้วน
   คนอ่านจึงต้องจินตนาการเองว่า "Replenish" ต่างจาก "Expiry" ตรงไหน

   ทั้งสี่คือจังหวะของเหตุการณ์บนแกนเวลา — พอวาดบนแกนเดียวกันแล้ว
   ความต่างอ่านออกในครั้งเดียวโดยไม่ต้องอ่านคำอธิบายสักตัว

   ── ภาษาภาพที่สาม ──

   specimen ใช้ chrome + แถบ (สาระคือขนาด) · LayerStack ใช้รางกับจุด
   (สาระคือลำดับ) ที่นี่สาระคือ "จังหวะเมื่อเวลาผ่านไป" จึงเป็นแกนนอน
   กับเหตุการณ์ที่วางตามเวลาจริง ถ้าทำเป็นแถบอีกจะเป็นชิ้นที่เจ็ดที่
   หน้าตาเหมือนกันหมด และจะอ่านว่าเทมเพลตเดียวใส่ข้อมูลต่างกัน */

type Mark =
  /** การซื้อ/การมาใช้บริการที่เกิดขึ้นแล้ว */
  | { at: number; type: "event"; label?: string }
  /** ร่องรอยความสนใจ — สัญญาณอ่อน ยังไม่ใช่การซื้อ */
  | { at: number; type: "trace" }
  /** จุดที่ระบบลงมือ — สิ่งเดียวบนเส้นที่เป็นของ PARALLAX */
  | { at: number; type: "act"; label: string }
  /** เส้นตาย: วันหมดอายุ หรือวันที่มูลค่าหายไปทั้งก้อน */
  | { at: number; type: "deadline"; label: string };

export type CycleRow = {
  name: string;
  axis: string;
  marks: Mark[];
  /** ช่วงที่มูลค่ายังมีชีวิตอยู่ (ใช้กับ Expiry) */
  span?: [number, number];
  /** ช่วงที่เงียบผิดจังหวะของตัวเอง (ใช้กับ Replenish) */
  drift?: [number, number];
};

export const CYCLE_ROWS: CycleRow[] = [
  {
    name: "Replenish",
    axis: "buys on their own rhythm, then drifts past it",
    marks: [
      { at: 4, type: "event" },
      { at: 20, type: "event" },
      { at: 36, type: "event" },
      { at: 52, type: "event" },
      { at: 78, type: "act", label: "act while the gap is still recoverable" },
    ],
    drift: [52, 96],
  },
  {
    name: "Recall",
    axis: "one service sets the date they should return",
    marks: [
      { at: 6, type: "event", label: "service" },
      { at: 66, type: "act", label: "contact in week five" },
      { at: 88, type: "deadline", label: "due" },
    ],
  },
  {
    name: "Expiry",
    axis: "a block of value that ends on a fixed date",
    marks: [
      { at: 4, type: "event" },
      { at: 22, type: "event" },
      { at: 40, type: "event" },
      { at: 68, type: "act", label: "act before it lapses" },
      { at: 92, type: "deadline", label: "expires" },
    ],
    span: [4, 92],
  },
  {
    name: "Considered",
    axis: "traces of interest gather before one large purchase",
    marks: [
      { at: 10, type: "trace" },
      { at: 26, type: "trace" },
      { at: 38, type: "trace" },
      { at: 46, type: "trace" },
      { at: 54, type: "trace" },
      { at: 60, type: "trace" },
      { at: 74, type: "act", label: "closest to deciding" },
      { at: 94, type: "event", label: "purchase" },
    ],
  },
];

function Row({ row, seen, index }: { row: CycleRow; seen: boolean; index: number }) {
  const base = index * 90;
  return (
    <div className="cyc-row" data-in={seen} style={{ transitionDelay: `${base}ms` }}>
      <div className="relative h-16">
        {/* ช่วงที่มูลค่ายังอยู่ */}
        {row.span && (
          <span
            aria-hidden
            className="cyc-span absolute top-[1.35rem] h-1 bg-signal/22"
            style={{
              left: `${row.span[0]}%`,
              width: seen ? `${row.span[1] - row.span[0]}%` : 0,
              transitionDelay: `${base + 120}ms`,
            }}
          />
        )}

        {/* ช่วงที่เงียบเกินจังหวะของตัวเอง */}
        {row.drift && (
          <span
            aria-hidden
            className="cyc-drift absolute top-[1.72rem]"
            style={{
              left: `${row.drift[0]}%`,
              width: seen ? `${row.drift[1] - row.drift[0]}%` : 0,
              transitionDelay: `${base + 220}ms`,
            }}
          />
        )}

        {/* แกนเวลา — ลากจากซ้ายไปขวาเมื่อเลื่อนถึง */}
        <span
          aria-hidden
          className="cyc-axis absolute top-[1.75rem] left-0 h-px bg-line"
          style={{ width: seen ? "100%" : 0, transitionDelay: `${base}ms` }}
        />

        {row.marks.map((m, i) => (
          <span
            key={`${m.type}-${m.at}`}
            className={`cyc-mark cyc-mark--${m.type} absolute`}
            data-in={seen}
            /* ป้ายที่อยู่เกินครึ่งขวาของแกนจะล้นขอบถ้าจัดชิดซ้าย
               ให้คอมโพเนนต์ตัดสินจากตำแหน่งจริง ไม่ใช่ให้ CSS เดาจากสตริง */
            data-align={m.at > 55 ? "end" : "start"}
            style={{ left: `${m.at}%`, transitionDelay: `${base + 260 + i * 70}ms` }}
          >
            {"label" in m && m.label && (
              <span className="cyc-mark__label">{m.label}</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

export function CycleTimeline({ rows = CYCLE_ROWS }: { rows?: CycleRow[] }) {
  const { ref, seen } = useInView<HTMLDivElement>();
  return (
    <div ref={ref}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <p className="t-label text-ink-4">the same axis, four rhythms</p>
        <p className="t-label text-signal">◆ where the system acts</p>
      </div>

      <div className="mt-8 flex flex-col gap-px bg-line">
        {rows.map((r, i) => (
          <div key={r.name} className="bg-paper py-6">
            {/* ── ชื่อรูปทรงตรงนี้ไม่ใช่หัวเรื่อง ──
                ทั้งสี่ชื่อปรากฏเป็น h2 ของบทความข้างล่างอยู่แล้ว การทำเป็น
                h3 ซ้ำอีกชุดทำให้รายการหัวเรื่องมีของซ้ำแปดตัว ซึ่งทำให้
                การไล่หัวเรื่องแย่ลง ไม่ใช่ดีขึ้น — ที่นี่เป็นคำอธิบายภาพ */}
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <p className="t-h3 text-ink">{r.name}</p>
              <p className="t-small t-thai text-ink-3">{r.axis}</p>
            </div>
            <div className="mt-4">
              <Row row={r} seen={seen} index={i} />
            </div>
          </div>
        ))}
      </div>

      <p className="t-small t-thai mt-5 text-ink-4">
        Time runs left to right on every row, so the shapes can be compared rather
        than described. An illustration of the rhythm, not one account&apos;s data.
      </p>
    </div>
  );
}
