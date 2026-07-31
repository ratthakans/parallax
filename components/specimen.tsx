"use client";

import { Mark } from "@/components/brand";
import { Numeral, useInView } from "@/components/reveal";

/* ── ตัวอย่างหน้าจอคอนโซล วาดด้วย HTML จริง ไม่ใช่ภาพหน้าจอ ────

   เว็บนี้มีหน้าที่ไม่มีทั้งภาพและภาพประกอบเลยเก้าจากสิบหกหน้า และหน้าที่
   หนักที่สุดคือหน้าที่เถียงเรื่องการวัดผล ซึ่งเล่าด้วยร้อยแก้วสิบย่อหน้า
   โดยไม่วาดการวัดผลให้ดูสักครั้ง

   ทำไมไม่ใช้ภาพหน้าจอ:
     · ภาพจะเก่าทันทีที่คอนโซลเปลี่ยน แต่ HTML ไม่เก่า
     · คมทุกความละเอียด ไม่ต้องมีไฟล์ @2x
     · ~2 KB เทียบกับภาพ jpg ที่ใช้อยู่ตอนนี้ 370 KB
     · และเคลื่อนไหวได้ ซึ่งเป็นเหตุผลที่แรงที่สุด

   ── การเคลื่อนไหวที่นี่ทำงาน ไม่ได้ตกแต่ง ──

   ทั้งเว็บมี <Reveal> อยู่ 196 จุด แต่ส่งค่า dir แค่ 6 จุด แปลว่าเกือบ
   ทุกอย่างเฟดขึ้นเหมือนกันหมด ซึ่งพอทำซ้ำมากพอก็อ่านเหมือนไม่มีอะไร
   เคลื่อนไหวเลย

   ที่นี่ความยาวของแถบคือตัวเลข การที่มันโตให้ดูคือการอธิบาย —
   สัดส่วนสองกลุ่ม · การคัดกรองที่ลบออกทีละขั้น · ค่าที่ไต่ขึ้นเมื่อ
   บัญชีสะสมมากขึ้น ทุกตัวเคารพ prefers-reduced-motion ผ่าน CSS

   ── ตัวเลขเป็นค่าคงที่ ไม่ได้ดึงสด ──
     กฎเส้นแบ่งข้อ 1 ห้าม app/(site) import lib/engine (ดู
     verify/boundaries.mts) หน้าเว็บการตลาดจึงแตะเครื่องยนต์ไม่ได้
     โดยตั้งใจ — และไม่ควรแตะ เพราะเป็นหน้าสาธารณะที่ไม่ควรรู้จัก
     ข้อมูลลูกค้า ทุกชิ้นจึงเขียนกำกับว่าเป็นตัวอย่างการแสดงผล */

function Chrome({
  label,
  right,
  children,
}: {
  label: string;
  right?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="specimen relative w-full p-1.5 backdrop-blur-md">
      <div className="bg-paper">
        <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
          <div className="flex items-center gap-2.5 text-ink">
            <Mark className="h-4 w-4" />
            <span className="t-label">{label}</span>
          </div>
          {right && <span className="t-label text-ink-4">{right}</span>}
        </div>
        {children}
      </div>
    </div>
  );
}

function Caption({ children }: { children: React.ReactNode }) {
  return <p className="t-small t-thai mt-4 text-ink-4">{children}</p>;
}

/** แถบที่กว้างจาก 0 ไปหาค่าจริงเมื่อเลื่อนถึง */
function Bar({
  pct,
  seen,
  delay = 0,
  className = "bg-signal",
}: {
  pct: number;
  seen: boolean;
  delay?: number;
  className?: string;
}) {
  return (
    <span
      className={`spec-bar ${className}`}
      style={{ width: seen ? `${pct}%` : 0, transitionDelay: `${delay}ms` }}
    />
  );
}

/* ── สองกลุ่มที่ทำให้คำนวณระยะได้ ──────────────────────────── */
export function HoldoutSplit({
  treated = 1204,
  held = 212,
}: {
  treated?: number;
  held?: number;
}) {
  const { ref, seen } = useInView<HTMLDivElement>();
  const total = treated + held;
  const pct = (n: number) => (n / total) * 100;

  return (
    <div ref={ref}>
      <Chrome label="frozen cohort" right={`${total.toLocaleString("en-US")} people`}>
        <div className="px-5 py-6">
          {/* แถบสองสีโตพร้อมกัน — สัดส่วนคือสาระ ไม่ใช่การตกแต่ง */}
          <div className="flex h-1.5 w-full bg-line">
            <Bar pct={pct(treated)} seen={seen} />
            <Bar pct={pct(held)} seen={seen} delay={120} className="bg-ink-4" />
          </div>

          <div className="mt-6 grid grid-cols-2 gap-px bg-line">
            {[
              { k: "Sent the message", v: treated, tone: "text-signal", sub: "treated" },
              { k: "Deliberately not sent", v: held, tone: "text-ink-3", sub: "held back" },
            ].map((c) => (
              <div key={c.sub} className="bg-paper p-5">
                <p className="t-label text-ink-4">{c.sub}</p>
                <p className={`t-numeral mt-3 text-[1.7rem] ${c.tone}`}>
                  <Numeral value={c.v.toLocaleString("en-US")} />
                </p>
                <p className="t-small t-thai mt-2 text-ink-3">{c.k}</p>
              </div>
            ))}
          </div>

          <p className="t-small t-thai mt-6 text-ink-3">
            The held-back group never receives it. If they buy at the same rate anyway,
            the message caused nothing — and the console says so in those words.
          </p>
        </div>
      </Chrome>
    </div>
  );
}

/* ── ตารางคำตัดสิน — แถวคลี่ทีละแถวจากบนลงล่าง ──────────────
   ลำดับสำคัญ: T+7 ที่สรุปไม่ได้ต้องมาก่อน แล้วค่อยเป็นสองแถวที่สรุปได้
   คนอ่านจึงเห็นว่าระบบยอมพูดว่ายังไม่รู้ ก่อนจะเห็นว่ามันได้ผล */
const ROWS = [
  { h: 7, treated: "฿87", held: "฿74", diff: "+฿13", ci: "−4.1 to 22.6%", verdict: "Not enough yet" },
  { h: 30, treated: "฿239", held: "฿201", diff: "+฿38", ci: "2.8 to 27.1%", verdict: "Worked" },
  { h: 90, treated: "฿604", held: "฿512", diff: "+฿92", ci: "6.2 to 24.9%", verdict: "Worked" },
];

export function VerdictTable() {
  const { ref, seen } = useInView<HTMLDivElement>();
  return (
    <div ref={ref}>
      <Chrome label="measured results" right="MST Golf · reactivation">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse">
            <thead>
              <tr className="border-b border-line">
                {["horizon", "per head · sent", "per head · held", "difference", "95% CI", "verdict"].map(
                  (h) => (
                    <th
                      key={h}
                      className="t-label px-4 py-3 text-left whitespace-nowrap text-ink-4"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r, i) => {
                const worked = r.verdict === "Worked";
                return (
                  <tr
                    key={r.h}
                    className="spec-row border-b border-line last:border-b-0"
                    data-in={seen}
                    style={{ transitionDelay: `${i * 170}ms` }}
                  >
                    <td className="t-numeral px-4 py-4 text-ink">T+{r.h}</td>
                    <td className="t-numeral px-4 py-4 text-ink-2">{r.treated}</td>
                    <td className="t-numeral px-4 py-4 text-ink-3">{r.held}</td>
                    <td
                      className={`t-numeral px-4 py-4 ${worked ? "text-signal" : "text-ink-3"}`}
                    >
                      {r.diff}
                    </td>
                    <td className="t-numeral px-4 py-4 whitespace-nowrap text-ink-3">
                      {r.ci}
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`t-label inline-flex rounded-full border px-2.5 py-1 whitespace-nowrap ${
                          worked ? "border-signal/40 text-signal" : "border-line text-ink-4"
                        }`}
                      >
                        {r.verdict}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Chrome>
      <Caption>
        The T+7 row is the point. Its interval crosses zero, so the console reports
        that it cannot conclude — rather than rounding it up into a win. Figures
        illustrate the display; they are not a live customer&apos;s result.
      </Caption>
    </div>
  );
}

/* ── บัญชีใหม่เริ่มจากค่าที่เรียนมาแล้ว — แถบไต่ขึ้นทีละขั้น ── */
const PRIOR = [
  { label: "Account 10 · no history", rate: 6.0, note: "starts at the play's default" },
  { label: "Account 60 · same cycle", rate: 11.4, note: "prior from 41 earlier runs" },
  { label: "Account 200 · same cycle", rate: 14.8, note: "prior from 168 earlier runs" },
];

export function PriorLadder() {
  const { ref, seen } = useInView<HTMLDivElement>();
  const max = 18;
  return (
    <div ref={ref}>
      <Chrome label="expected response · before the first send" right="Replenish cycle">
        <div className="flex flex-col gap-px bg-line">
          {PRIOR.map((p, i) => (
            <div key={p.label} className="bg-paper p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="t-small text-ink-2">{p.label}</span>
                <span className="t-numeral text-[1.15rem] text-signal">
                  <Numeral value={`${p.rate.toFixed(1)}%`} />
                </span>
              </div>
              <div className="mt-3 h-1 w-full bg-line">
                <Bar pct={(p.rate / max) * 100} seen={seen} delay={i * 220} />
              </div>
              <p className="t-small t-thai mt-2.5 text-ink-4">{p.note}</p>
            </div>
          ))}
        </div>
      </Chrome>
      <Caption>
        Only aggregate statistics cross between accounts — counts of runs and
        responses per cycle shape. No customer row ever leaves the account it belongs
        to. Figures illustrate the display.
      </Caption>
    </div>
  );
}

/* ── กลุ่มเป้าหมายที่หดลงทีละขั้น ─────────────────────────────
   แถบไล่สั้นลงตามลำดับ ทำให้เห็นว่าทุกขั้นคือการลบออก ไม่ใช่การเพิ่มเข้า
   ซึ่งเป็นข้อโต้แย้งทั้งหมดของหน้านี้ */
const FILTERS = [
  { k: "Everyone in the base", n: 12480 },
  { k: "Matches the top cohort's shape", n: 3120 },
  { k: "Reachable — LINE on file", n: 1902 },
  { k: "Consent still valid", n: 1661 },
  { k: "Not messaged in the last 7 days", n: 1416 },
];

export function AudienceFunnel() {
  const { ref, seen } = useInView<HTMLDivElement>();
  const top = FILTERS[0].n;
  return (
    <div ref={ref}>
      <Chrome label="audience build" right="every step is subtraction">
        <div className="flex flex-col gap-px bg-line">
          {FILTERS.map((f, i) => {
            const last = i === FILTERS.length - 1;
            return (
              <div key={f.k} className="bg-paper px-5 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="t-small t-thai text-ink-2">{f.k}</span>
                  <span
                    className={`t-numeral text-[1.05rem] ${
                      last ? "text-signal" : "text-ink-3"
                    }`}
                  >
                    <Numeral value={f.n.toLocaleString("en-US")} />
                  </span>
                </div>
                <div className="mt-2.5 h-1 w-full bg-line">
                  <Bar
                    pct={(f.n / top) * 100}
                    seen={seen}
                    delay={i * 160}
                    className={last ? "bg-signal" : "bg-ink-4"}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Chrome>
      <Caption>
        Nobody is added along the way. Reach starts from people who already bought and
        removes everyone it cannot legitimately message. Figures illustrate the
        display.
      </Caption>
    </div>
  );
}
