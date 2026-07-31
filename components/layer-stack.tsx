"use client";

import { useInView } from "@/components/reveal";

/* ── ห้าชั้น วาดเป็นทางเดินของไฟล์หนึ่งไฟล์ ────────────────────

   เดิมส่วนนี้เป็นรายการห้าแถวที่สูงเท่ากันเป๊ะ (164px ทุกแถว) แต่ละแถว
   เห็นแค่ 13–18 คำ ส่วนคำอธิบายจริงถูกพับไว้ในบานพับที่ปิดอยู่ทั้งห้าอัน
   หน้าจอจึงแสดง "รายการ" ทั้งที่หัวเรื่องพูดว่า "ชั้น" — คำอุปมาหลัก
   ของหน้าถูกพูด แต่ไม่เคยถูกแสดง

   ที่นี่วาดเป็นรางเดียวที่ไหลลงจากบนลงล่าง เพราะหัวเรื่องบอกทิศทางไว้แล้ว
   ว่า "from a raw POS file to a difference you can defend" — เข้าทางบน
   ออกทางล่าง ตรงกับลำดับการอ่านของเว็บพอดี ไม่ต้องให้ใครอ่านย้อน

   ── ทำไมไม่ใช้ chrome + แถบเหมือน specimen ตัวอื่น ──

   specimen ห้าชิ้นก่อนหน้านี้เป็นกรอบหน้าจอกับแถบสัดส่วนทั้งหมด
   ชิ้นที่หกที่หน้าตาเหมือนกันอีกจะอ่านว่า "เทมเพลตเดียวกันใส่ตัวเลขต่างกัน"
   และที่นี่สาระไม่ใช่ขนาด แต่เป็น "ลำดับ" กับ "อะไรรองรับอะไร"
   ราง + จุด จึงตรงกับเนื้อหามากกว่าแถบ */

export type LayerRow = {
  n: string;
  name: string;
  one: string;
  kicker: string;
  body: string;
  tag: string;
  /* ชั้นที่ผู้ใช้เห็นจริง กับชั้นที่คู่แข่งลอกยาก ควรอ่านออกจากหน้าจอ
     ไม่ใช่ต้องเปิดบานพับถึงจะรู้ — ห้าแถวที่เหมือนกันหมดบอกอะไรไม่ได้เลย */
  weight: "surface" | "moat" | "engine";
};

const TAG_STYLE: Record<LayerRow["weight"], string> = {
  surface: "border-signal/40 text-signal",
  moat: "border-ink/25 text-ink",
  engine: "border-line text-ink-4",
};

export function LayerStack({ layers }: { layers: LayerRow[] }) {
  const { ref, seen } = useInView<HTMLDivElement>();

  return (
    <div ref={ref} className="relative">
      {/* รางที่ไหลลง — ยาวขึ้นเมื่อเลื่อนถึง */}
      <span
        aria-hidden
        className="stack-rail absolute top-0 left-[7px] w-px bg-signal/35"
        style={{ height: seen ? "100%" : 0 }}
      />

      <p className="t-label relative pl-8 text-ink-4">
        in · a CSV nobody cleaned
      </p>

      <ol className="mt-6 flex flex-col">
        {layers.map((l, i) => (
          <li
            key={l.n}
            className="stack-node relative border-t border-line py-8 pl-8 last:border-b"
            data-in={seen}
            style={{ transitionDelay: `${180 + i * 130}ms` }}
          >
            {/* จุดบนราง — ทำเครื่องหมายว่าไฟล์ผ่านชั้นนี้แล้ว */}
            <span
              aria-hidden
              className="absolute top-[2.35rem] left-[3px] block h-2.5 w-2.5 border border-signal bg-paper"
            />

            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
              <span className="marker-num">{l.n}</span>
              <h3 className="t-h3 text-ink">{l.name}</h3>
              <span
                className={`t-label rounded-full border px-2.5 py-1 ${TAG_STYLE[l.weight]}`}
              >
                {l.tag}
              </span>
            </div>

            <p className="t-body t-thai mt-3 text-signal">{l.one}</p>

            {/* ── kicker อยู่ข้างนอก ไม่ใช่ในบานพับ ──
                ห้าประโยคนี้ตอบข้อกังวลที่คนซื้อมีจริง (ต้องต่อ API ก่อนไหม ·
                ลอกได้ไหม · AI จะส่งเองไหม) แล้วเดิมมันถูกปิดไว้ทั้งห้าอัน */}
            <p className="t-small t-thai measure mt-3 text-ink-3">{l.kicker}</p>

            {/* ── สลับกับของเดิม ──
                เดิม kicker อยู่ข้างใน body อยู่ข้างใน ทั้งคู่ปิด ตอนนี้
                ประโยคคมอยู่ข้างนอก ส่วนร้อยแก้วยาวย้ายเข้ามาอยู่ในนี้แทน
                — คนที่อยากรู้ลึกยังกดได้ คนที่แค่กวาดตายังได้สาระ */}
            <details className="more mt-4">
              <summary>
                <span className="more-label">how this layer works</span>
                <span className="more-sign" aria-hidden />
              </summary>
              <div className="more-body">{l.body}</div>
            </details>
          </li>
        ))}
      </ol>

      <p className="t-label relative mt-6 pl-8 text-signal">
        out · a difference you can defend
      </p>
    </div>
  );
}
