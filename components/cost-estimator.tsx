"use client";

import { useId, useState } from "react";
import {
  PLANS,
  PLAN_ORDER,
  priceForMessages,
  rateForMessages,
  type Plan,
} from "@/lib/shared/plans";
import { Numeral } from "@/components/reveal";

/* ── บิลเดือนหน้าเป็นเท่าไร ───────────────────────────────────

   หน้านี้เปิดเผยราคาครบอยู่แล้ว — ค่าซับรายเดือนตามจำนวนคน · แพ็กเครดิต
   สามขนาดพร้อมราคาต่อข้อความ · ต้นทุนส่งจริงต่อข้อความ · เครดิตไม่หมดอายุ
   ไม่มีอะไรถูกซ่อน

   สิ่งที่ยังไม่มีคือการคูณให้ดู คนซื้อต้องประกอบเองข้ามสองระบบราคา
   (ขั้นบันไดตามจำนวนคน กับแพ็กตามจำนวนข้อความ) และนั่นคือคำถามเดียว
   ที่เจ้าของร้านถามจริง: "เดือนหน้าฉันจ่ายเท่าไร"

   ── สองช่องแยกกันโดยตั้งใจ ──

   ฐานลูกค้ากำหนดค่าซับ · จำนวนข้อความกำหนดค่าเครดิต และสองอย่างนี้
   ไม่ควรผูกกัน เพราะข้อโต้แย้งทั้งหมดของผลิตภัณฑ์คือ "ส่งหาคนที่ควรได้รับ
   ไม่ใช่ส่งหาทุกคน" ถ้ารวมเป็นช่องเดียวเครื่องคิดนี้จะสอนสิ่งที่ตรงข้าม
   กับสิ่งที่เราขาย — ฐานหมื่นคนที่ส่งเดือนละ 800 ข้อความคือการใช้ที่ถูก
   ไม่ใช่การใช้ที่น้อย */

const BASES = [500, 1_500, 3_000, 8_000, 20_000, 50_000];
const SENDS = [200, 800, 2_000, 5_000];

function planForBase(n: number): Plan {
  for (const id of PLAN_ORDER) {
    const p = PLANS[id];
    if (p.contactCap == null || n <= p.contactCap) return p;
  }
  return PLANS.chain;
}

const th = (n: number) => n.toLocaleString("en-US");

export function CostEstimator() {
  const [base, setBase] = useState(3_000);
  const [sends, setSends] = useState(800);
  const baseId = useId();
  const sendId = useId();

  const plan = planForBase(base);
  const sub = plan.monthlyBaht;
  const credits = priceForMessages(sends);
  const rate = rateForMessages(sends);

  /* ชั้น Chain ไม่มีราคาตายตัว — ห้ามแสดงยอดรวมที่เว็บไม่ได้ประกาศ */
  const quotable = sub != null && !(plan.id === "chain");

  return (
    <div className="panel p-7 md:p-9">
      <p className="t-label t-thai text-ink-4">ประมาณค่าใช้จ่ายต่อเดือน</p>

      <div className="mt-8 grid gap-8 md:grid-cols-2">
        <fieldset>
          <label htmlFor={baseId} className="t-small t-thai block text-ink-2">
            จำนวนลูกค้าที่ระบุตัวตนได้
          </label>
          <p className="t-small t-thai mt-1 text-ink-4">ใช้กำหนดระดับค่าสมาชิก</p>
          <div id={baseId} className="mt-4 flex flex-wrap gap-2">
            {BASES.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setBase(n)}
                aria-pressed={base === n}
                className={`t-numeral rounded-full border px-4 py-2 text-[0.95rem] transition-colors ${
                  base === n
                    ? "border-signal bg-signal text-white"
                    : "border-line text-ink-2 hover:border-ink-4"
                }`}
              >
                {th(n)}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <label htmlFor={sendId} className="t-small t-thai block text-ink-2">
            จำนวนข้อความที่ส่งจริงต่อเดือน
          </label>
          {/* ── ประโยคนี้คือข้อโต้แย้งของผลิตภัณฑ์ ไม่ใช่คำอธิบายช่อง ── */}
          <p className="t-small t-thai mt-1 text-ink-4">
            ไม่ใช่ส่งทั้งฐาน ส่งเฉพาะกลุ่มที่ระบบคัดเลือก
          </p>
          <div id={sendId} className="mt-4 flex flex-wrap gap-2">
            {SENDS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setSends(n)}
                aria-pressed={sends === n}
                className={`t-numeral rounded-full border px-4 py-2 text-[0.95rem] transition-colors ${
                  sends === n
                    ? "border-signal bg-signal text-white"
                    : "border-line text-ink-2 hover:border-ink-4"
                }`}
              >
                {th(n)}
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      <hr className="mt-9 border-line" />

      <div className="mt-8 grid gap-x-8 gap-y-7 sm:grid-cols-3">
        <div>
          <p className="t-label t-thai text-ink-4">{plan.name} · ค่าสมาชิก</p>
          <p className="t-numeral-md mt-3 text-ink">
            {sub == null ? "ประเมินราคา" : sub === 0 ? "฿0" : `฿${th(sub)}`}
          </p>
          <p className="t-small t-thai mt-2 text-ink-3">
            {plan.contactCap == null
              ? "กำหนดตามสัญญา"
              : `สูงสุด ${th(plan.contactCap)} คน`}
          </p>
        </div>

        <div>
          <p className="t-label t-thai text-ink-4">เครดิตข้อความ</p>
          <p className="t-numeral-md mt-3 text-ink">
            <Numeral value={`฿${th(credits)}`} />
          </p>
          <p className="t-small t-thai mt-2 text-ink-3">
            {th(sends)} ข้อความ · ข้อความละ ฿{rate.toFixed(2)}
          </p>
        </div>

        <div>
          <p className="t-label t-thai text-signal">รวมเดือนนี้</p>
          <p className="t-numeral-lg mt-3 text-signal">
            {quotable ? (
              <Numeral value={`฿${th((sub ?? 0) + credits)}`} />
            ) : (
              "ประเมินราคา"
            )}
          </p>
          <p className="t-small t-thai mt-2 text-ink-3">
            {quotable
              ? "ค่าระบบรวมกับข้อความที่ส่งจริง"
              : "แผน Chain เริ่ม ฿15,000 และประเมินตามกลุ่มธุรกิจ"}
          </p>
        </div>
      </div>

      {/* ── ข้อจำกัดต้องอยู่ติดตัวเลข ไม่ใช่ท้ายหน้า ── */}
      <p className="t-small t-thai measure mt-8 text-ink-4">
        เครดิตจ่ายล่วงหน้าและไม่มีวันหมดอายุ เดือนที่ส่งน้อยจึงยกยอดไปใช้ต่อได้
        ค่าสื่อสำหรับหาลูกค้าใหม่จ่ายตรงให้แพลตฟอร์มโฆษณาและไม่รวมในนี้
        ตัวเลขนี้เป็นการคำนวณจากราคาด้านบน ไม่ใช่ใบเสนอราคา
      </p>
    </div>
  );
}
