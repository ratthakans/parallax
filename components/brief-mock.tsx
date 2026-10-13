"use client";

import { Mark } from "@/components/brand";
import { Numeral, useInView } from "@/components/reveal";

type Item = {
  n: string;
  who: string;
  why: string;
  action: string;
  value: string;
  tag: string;
};

const ITEMS: Item[] = [
  {
    n: "01",
    who: "165",
    why: "รอบซื้อซ้ำจะปิดใน 10 วัน · ยอดเฉลี่ย ฿4,200",
    action: "ส่งข้อเสนอให้กลับมาซื้อจากสินค้าที่เคยเลือกไว้",
    value: "฿693,000",
    tag: "ใกล้ถึงรอบซื้อซ้ำ",
  },
  {
    n: "02",
    who: "119",
    why: "กลุ่มมูลค่าสูง · ซื้อราคาเต็มและไม่รอส่วนลด",
    action: "เปิดตัวสินค้าแบบส่วนตัว พร้อมให้พนักงานติดตาม",
    value: "฿786,800",
    tag: "ลูกค้ามูลค่าสูง",
  },
  {
    n: "03",
    who: "98",
    why: "ซื้อไดรเวอร์แล้ว แต่ยังไม่เคยซื้อลูกกอล์ฟ",
    action: "แนะนำรุ่นลูกกอล์ฟที่ลูกค้ากลุ่มเดียวกันมักซื้อถัดไป",
    value: "฿147,000",
    tag: "เสี่ยงเงียบหาย",
  },
];

/* ── การ์ดสามใบไล่กันขึ้นมา แทนที่จะโผล่พร้อมกันเสร็จแล้ว ──

   นี่คือพระเอกของหน้าแรก และมันเคยนิ่งสนิททั้งที่สิ่งที่มันเล่าคือ
   "สามการตัดสินใจก่อนเก้าโมง" — ลำดับคือสาระ ไม่ใช่การตกแต่ง

   ในหน้าแรกมันอยู่คู่กับ SignalField ที่เคลื่อนไหวอยู่แล้ว จังหวะจึง
   สั้นกว่า (compact) เพื่อไม่ให้สองอย่างแย่งสายตากัน */
export function BriefMock({ compact = false }: { compact?: boolean }) {
  const { ref, seen } = useInView<HTMLDivElement>();
  const step = compact ? 110 : 170;
  return (
    <div ref={ref} className="specimen relative w-full p-1.5 backdrop-blur-md">
      <div className="bg-paper">
        {/* head */}
        <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4 md:px-7">
          <div className="flex items-center gap-2.5 text-ink">
            <Mark className="h-4 w-4" />
            <span className="t-label t-thai">บรีฟเช้าวันนี้</span>
          </div>
          <span className="t-label t-thai text-ink-4">08:12 · พร้อมทำ 3 งาน</span>
        </div>

        {/* items */}
        <ul>
          {ITEMS.map((it, i) => (
            <li
              key={it.n}
              className="spec-row group border-b border-line px-5 py-6 last:border-b-0 hover:bg-white md:px-7"
              data-in={seen}
              style={{ transitionDelay: `${i * step}ms` }}
            >
              <div className="flex items-start justify-between gap-5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="marker-num">{it.n}</span>
                    <span className="t-numeral text-[1.65rem] text-ink">
                      <Numeral value={it.who} />
                    </span>
                    <span className="t-small t-thai text-ink-4">คน</span>
                    <span className="t-label rounded-full border border-line px-2.5 py-1 text-ink-4">
                      {it.tag}
                    </span>
                  </div>
                  <p className="t-small t-thai mt-2.5 text-ink-3">{it.why}</p>
                  <p className="t-body t-thai pretty mt-3 text-ink">{it.action}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="t-label t-thai text-ink-4">มูลค่าที่คาดไว้</p>
                  <p className="t-numeral mt-2.5 text-[1.35rem] text-signal">
                    <Numeral value={it.value} />
                  </p>
                </div>
              </div>

              {!compact && (
                <div className="mt-5 flex flex-wrap items-center gap-2.5">
                  <span className="inline-flex h-8 items-center rounded-full bg-signal px-4 text-[0.78rem] font-medium text-white">
                    อนุมัติ
                  </span>
                  <span className="inline-flex h-8 items-center rounded-full border border-line px-4 text-[0.78rem] text-ink-2">
                    ดูเหตุผล
                  </span>
                  <span className="inline-flex h-8 items-center rounded-full border border-line px-4 text-[0.78rem] text-ink-2">
                    ไว้ทีหลัง
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>

        {/* foot */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4 md:px-7">
          <span className="t-small text-ink-3">
            สามงาน สิบวินาที แล้วกลับไปทำงานต่อ
          </span>
          <span className="t-label text-ink-4">
            ผลต่างย้อนหลัง 90 วัน · +7.4% ± 2.1
          </span>
        </div>
      </div>
    </div>
  );
}
