import type { Metadata } from "next";
import Link from "next/link";
import {
  CTA,
  Panel,
  Label,
  More,
  NextUp,
  Note,
  PageHero,
  Quote,
  Section,
} from "@/components/ui";
import { Numeral, Reveal, Stagger } from "@/components/reveal";
import { CostEstimator } from "@/components/cost-estimator";
import { PricingLd } from "@/components/json-ld";
import {
  CAP_ROWS,
  CREDIT_PACKS,
  MESSAGE_COST_BAHT,
  PLANS,
  PLAN_ORDER,
  annualBaht,
  annualDiscountPct,
  breakEvenBaht,
  capLabel,
  perMessage,
  type Plan,
} from "@/lib/shared/plans";

/* ทุกตัวเลขในหน้านี้มาจาก lib/plans.ts ซึ่งเป็นไฟล์เดียวกับที่ชั้น
   dispatch และหน้า /app/billing บังคับใช้ — ตารางราคาที่พิมพ์มือคือ
   ตารางราคาที่จะไม่ตรงกับสิ่งที่ระบบทำจริงภายในสัปดาห์แรก */

export const metadata: Metadata = {
  title: "ราคา",
  description:
    `Pilot ฿0 · Growth ฿${PLANS.growth.monthlyBaht?.toLocaleString("en-US")} · ` +
    `Multi ฿${PLANS.multi.monthlyBaht?.toLocaleString("en-US")} · ` +
    `Chain ฿${PLANS.chain.monthlyBaht?.toLocaleString("en-US")} ขึ้นไป — ` +
    "คิดราคาตามจำนวนลูกค้าที่ติดต่อได้จริง ค่าข้อความเป็นเครดิตจ่ายล่วงหน้าและไม่ซ่อนในค่าสมาชิก",
};

const th = (n: number) => n.toLocaleString("en-US");

const priceOf = (p: Plan) =>
  p.monthlyBaht == null ? "ประเมินราคา" : th(p.monthlyBaht);

const FAQ: { q: string; a: string }[] = [
  {
    q: "ทำไมค่าข้อความไม่รวมในค่าสมาชิก?",
    a:
      `การส่งมีต้นทุนประมาณ ฿${MESSAGE_COST_BAHT} ต่อข้อความ หากรวมไว้ในค่าสมาชิก ` +
      "ผู้ใช้ที่ส่งน้อยจะต้องช่วยจ่ายให้ผู้ใช้ที่ส่งมาก การแยกเครดิตทำให้ทุกคนจ่ายตามการใช้งานจริง",
  },
  {
    q: "ถ้าเครดิตหมดกลางแคมเปญจะเกิดอะไรขึ้น?",
    a:
      "ระบบส่งเท่าที่เครดิตเหลือ แล้วแจ้งจำนวนคนที่ยังรออยู่ ไม่มีการเรียกเก็บย้อนหลัง " +
      "เติมเครดิตแล้วกดส่งต่อได้โดยไม่มีใครได้รับข้อความซ้ำ",
  },
  {
    q: "เครดิตหมดอายุไหม?",
    a: "ไม่หมดอายุ เครดิตอยู่ในบัญชีจนกว่าจะใช้ และไม่ถูกรีเซ็ตตามรอบบิล",
  },
  {
    q: "นับ “ลูกค้าที่ระบุตัวตนได้” อย่างไร?",
    a:
      "นับคนที่มีตัวระบุอย่างน้อยหนึ่งอย่างและติดต่อได้จริง ไม่ได้นับจำนวนแถวในไฟล์ " +
      "ลูกค้าที่จ่ายเงินสดแล้วไม่ทิ้งข้อมูลไว้จะไม่ถูกนับและไม่ถูกคิดเงิน",
  },
  {
    q: "ถ้าฐานลูกค้าเกินเพดานของแผนจะเกิดอะไรขึ้น?",
    a:
      "ระบบปฏิเสธการนำเข้าและบอกจำนวนที่เกินอย่างชัดเจนตั้งแต่ต้น " +
      "ไม่รับข้อมูลครึ่งทางแล้วค่อยส่งใบแจ้งหนี้ตามหลัง",
  },
  {
    q: "ถ้ายกเลิก ข้อมูลจะเป็นอย่างไร?",
    a:
      "ข้อมูลเป็นของคุณ ขอไฟล์กลับหรือขอให้ลบทั้งหมดได้ทุกเมื่อ " +
      "แผนรายเดือนไม่มีระยะเวลาขั้นต่ำ",
  },
];

const NOT_READY = [
  {
    t: "API นำเข้าข้อมูล",
    d: "วันนี้รองรับการลาก CSV วาง ใช้ได้กับ POS แทบทุกระบบ แต่ยังต้องทำด้วยตนเอง",
  },
  {
    t: "ส่งอัตโนมัติ",
    d: "ทุกแคมเปญยังต้องมีคนอนุมัติ เหมาะกับช่วงแรกและยังไม่ควรถูกนำมาคิดเงิน",
  },
  {
    t: "ส่งผ่าน LINE จริง",
    d: "ระบบบันทึกและหักเครดิตพร้อมแล้ว ส่วน Messaging API จะเชื่อมต่อเมื่อเริ่มโครงการทดลอง",
  },
];

export default function PricingPage() {
  return (
    <>
      {/* ราคาในรูปแบบที่เครื่องอ่านได้ — ดึงจาก PLANS ตัวเดียวกับที่หน้านี้แสดง */}
      <PricingLd
        offers={PLAN_ORDER.map((id) => ({
          name: PLANS[id].name,
          monthlyBaht: PLANS[id].monthlyBaht,
          from: Boolean(PLANS[id].priceSuffix),
        }))}
      />
      <PageHero
        label="ราคา"
        title="คิดตามจำนวนลูกค้าที่ติดต่อได้ ไม่ได้คิดตามจำนวนผู้ใช้"
        lead="คุณค่าของระบบโตตามขนาดฐานลูกค้า ไม่ใช่จำนวนคนที่ล็อกอิน และสิ่งที่มีต้นทุนจริงจะไม่ถูกซ่อนไว้ใต้คำว่าไม่จำกัด"
      />

      {/* free tier logic */}
      <Section tone="paper" size="band-sm">
        <div className="shell">
          <Reveal>
            <div className="grid gap-10 border-b border-line pb-12 lg:grid-cols-[1fr_1.4fr] lg:gap-20">
              <div>
                <Label>แนวคิดของแผน Pilot</Label>
              </div>
              <div>
                <p className="t-h3 pretty text-ink">
                  เริ่มจากดูว่ารายได้รั่วตรงไหน ใครกำลังจะเงียบ และทดลองส่งจริงได้
                  หนึ่งแคมเปญพร้อมกลุ่มเปรียบเทียบ ก่อนตัดสินใจสมัครแผนรายเดือน
                </p>
                
              </div>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* tier cards */}
      <Section tone="paper" size="band-sm">
        <div className="shell">
          <div className="grid gap-px bg-line md:grid-cols-2 xl:grid-cols-4">
            {PLAN_ORDER.map((id, i) => {
              const t = PLANS[id];
              const annual = annualBaht(t);
              return (
                <Reveal key={t.id} delay={i * 90} dir="scale">
                  <div
                    className={`flex h-full flex-col justify-between gap-10 p-8 ${
                      t.featured
                        ? "bg-white ring-1 ring-signal/40 ring-inset"
                        : "bg-paper"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <h2 className="t-h3 text-ink">{t.name}</h2>
                        {t.featured && (
                          <span className="t-label rounded-full bg-signal px-3 py-1.5 text-white">
                            แนะนำ
                          </span>
                        )}
                      </div>
                      <p className="mt-7 flex items-baseline gap-2">
                        <span className="t-numeral-lg text-ink">
                          <Numeral value={priceOf(t)} />
                        </span>
                        {t.monthlyBaht != null && t.monthlyBaht > 0 && (
                          <span className="t-small text-ink-4">
                            ฿ / เดือน{t.priceSuffix ? ` ${t.priceSuffix}` : ""}
                          </span>
                        )}
                      </p>
                      {annual != null && annual > 0 && (
                        <p className="t-small mt-2.5 text-ink-4">
                          รายปี ฿{th(annual)} — ประหยัด {annualDiscountPct}%
                        </p>
                      )}

                      <dl className="mt-7 flex flex-col gap-2.5 border-t border-line pt-6">
                        <div className="flex items-baseline justify-between gap-3">
                          <dt className="t-small text-ink-4">
                            ลูกค้าที่ระบุตัวตนได้
                          </dt>
                          <dd className="t-small text-ink">
                            {t.contactCap == null ? "ประเมินราคา" : `สูงสุด ${th(t.contactCap)}`}
                          </dd>
                        </div>
                        <div className="flex items-baseline justify-between gap-3">
                          <dt className="t-small text-ink-4">เครดิตแรกเข้า</dt>
                          <dd className="t-small text-ink">
                            {t.welcomeCredits > 0 ? th(t.welcomeCredits) : "—"}
                          </dd>
                        </div>
                        <div className="flex items-baseline justify-between gap-3">
                          <dt className="t-small text-ink-4">ส่งจริงได้</dt>
                          <dd className="t-small text-ink">
                            {t.caps.reach.kind === "yes" ? "✓" : "—"}
                          </dd>
                        </div>
                      </dl>

                      <p className="t-small t-thai mt-6 text-ink-3">{t.who}</p>
                    </div>
                    <Link
                      href="/contact"
                      className={`btn w-full ${
                        t.featured ? "btn-primary" : "btn-ghost"
                      }`}
                    >
                      {t.id === "free" ? "เริ่มใช้ฟรี" : "ติดต่อเรา"}
                    </Link>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </Section>

      {/* ── ค่าข้อความ ── */}
      <Section tone="mist">
        <div className="shell">
          <Reveal>
            <Label>ค่าข้อความ — แยกจากค่าสมาชิก</Label>
          </Reveal>

          <Reveal delay={70}>
            <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:gap-20">
              <p className="t-h3 pretty text-ink">
                เครดิตจ่ายล่วงหน้า หมดแล้วหยุด ไม่มีบิลตามมาทีหลัง
              </p>
              <div>
                <p className="t-body t-thai pretty text-ink-3">
                  ค่าสมาชิกคือค่าระบบ ส่วนข้อความคิดตามการใช้งานจริง
                  ถ้ารวมสองอย่างเข้าด้วยกัน ราคาที่เห็นจะไม่ใช่ราคาที่จ่ายจริง
                </p>
                <More label="ส่วนต่างราคาครอบคลุมอะไร">
                  การส่งมีต้นทุนประมาณ ฿{MESSAGE_COST_BAHT} ต่อข้อความ ส่วนต่างคือค่าระบบ
                  ที่คัดกลุ่ม เขียนข้อความ กันกลุ่มเปรียบเทียบ และวัดผลไปพร้อมกับทุกการส่ง
                </More>
              </div>
            </div>
          </Reveal>

          <Stagger
            step={100}
            start={140}
            dir="scale"
            className="mt-14 grid gap-px bg-line md:grid-cols-3"
          >
            {CREDIT_PACKS.map((pk) => (
              <div key={pk.messages} className="bg-mist p-8">
                  <p className="t-numeral-md text-ink">
                    <Numeral value={th(pk.messages)} />
                  </p>
                  <p className="t-small mt-1 text-ink-4">ข้อความ</p>
                  <p className="t-body mt-6 text-ink">฿{th(pk.baht)}</p>
                  <p className="t-small mt-1.5 text-ink-4">
                    ข้อความละ ฿{perMessage(pk).toFixed(2)}
                  </p>
              </div>
            ))}
          </Stagger>

          <Reveal delay={210}>
            <div className="mt-12">
              <Note>
                เครดิตไม่มีวันหมดอายุและไม่ถูกรีเซ็ตตามรอบบิล · ค่าสื่อสำหรับหาลูกค้าใหม่
                จ่ายตรงให้แพลตฟอร์มโฆษณา ไม่ผ่านเรา
              </Note>
            </div>
          </Reveal>

          {/* ── คูณให้ดู ──
              ราคาทุกตัวถูกประกาศครบอยู่แล้วข้างบน แต่คนซื้อต้องประกอบเอง
              ข้ามสองระบบ (ขั้นบันไดตามคน · แพ็กตามข้อความ) ซึ่งเป็นคำถาม
              เดียวที่เจ้าของร้านถามจริง — เดือนหน้าจ่ายเท่าไร */}
          <Reveal delay={120}>
            <div className="mt-16">
              <CostEstimator />
            </div>
          </Reveal>
        </div>
      </Section>

      {/* comparison */}
      <Section tone="paper">
        <div className="shell">
          <Reveal>
            <Label>แต่ละแผนมีอะไรบ้าง</Label>
          </Reveal>

          <Reveal delay={80}>
            <div className="scroll-x mt-12">
              <table className="dtable min-w-[48rem]">
                <thead>
                  <tr>
                    <th className="w-[17rem]" />
                    {PLAN_ORDER.map((id) => (
                      <th
                        key={id}
                        className={PLANS[id].featured ? "text-signal" : undefined}
                      >
                        {PLANS[id].name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="t-small whitespace-nowrap text-ink-3">
                      ค่าสมาชิกรายเดือน
                    </td>
                    {PLAN_ORDER.map((id) => (
                      <td
                        key={id}
                        className={
                          PLANS[id].featured
                            ? "font-medium text-signal"
                            : "text-ink"
                        }
                      >
                        {priceOf(PLANS[id])}
                        {PLANS[id].priceSuffix ? ` ${PLANS[id].priceSuffix}` : ""}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="t-small whitespace-nowrap text-ink-3">
                      ลูกค้าที่ระบุตัวตนได้
                    </td>
                    {PLAN_ORDER.map((id) => (
                      <td
                        key={id}
                        className={
                          PLANS[id].featured
                            ? "font-medium text-signal"
                            : "text-ink"
                        }
                      >
                        {PLANS[id].contactCap == null
                          ? "ประเมินราคา"
                          : `สูงสุด ${th(PLANS[id].contactCap!)}`}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="t-small whitespace-nowrap text-ink-3">
                      เครดิตแรกเข้า (ครั้งเดียว)
                    </td>
                    {PLAN_ORDER.map((id) => (
                      <td
                        key={id}
                        className={
                          PLANS[id].featured
                            ? "font-medium text-signal"
                            : PLANS[id].welcomeCredits === 0
                              ? "text-ink-4"
                              : "text-ink"
                        }
                      >
                        {PLANS[id].welcomeCredits > 0
                          ? th(PLANS[id].welcomeCredits)
                          : "—"}
                      </td>
                    ))}
                  </tr>
                  {CAP_ROWS.map((r) => (
                    <tr key={r.key}>
                      <td className="t-small t-thai whitespace-nowrap text-ink-3">
                        {r.label}
                      </td>
                      {PLAN_ORDER.map((id) => {
                        const c = PLANS[id].caps[r.key];
                        return (
                          <td
                            key={id}
                            className={
                              c.kind === "no"
                                ? "text-ink-4"
                                : c.kind === "roadmap"
                                  ? "text-ink-4 italic"
                                  : PLANS[id].featured
                                    ? "font-medium text-signal"
                                    : "text-ink"
                            }
                          >
                            {capLabel(c)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr>
                    <td className="t-small whitespace-nowrap text-ink-3">
                      จำนวนผู้ใช้
                    </td>
                    {PLAN_ORDER.map((id) => (
                      <td key={id} className="text-ink">
                        ไม่จำกัด
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </Reveal>

          <Reveal delay={160}>
            <div className="mt-12">
              <Note>
                สิ่งที่ระบุว่า “กำลังพัฒนา” ยังไม่มีให้ใช้วันนี้ เราไม่คิดเงินส่วนนี้
                และไม่ใช้เป็นเหตุผลให้ลูกค้าขยับไปแผนที่สูงขึ้น
              </Note>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* ── จุดคุ้มทุน ── */}
      <Section tone="dark">
        <div className="shell">
          <Reveal>
            {/* แถบนี้เป็น surface-dark — ป้ายต้องใช้โทนสำหรับพื้นเข้ม
                เดิมเขียน tone="dark" เพราะอ่านว่า "แถบนี้เข้ม" แต่ tone
                หมายถึงสีตัวอักษร ป้ายจึงเป็น ink-4 บนพื้น abyss = 3.84:1 */}
            <Label onDark>
              ต้องสร้างรายได้เพิ่มเท่าไรจึงคุ้มทุน
            </Label>
          </Reveal>
          <Reveal delay={70}>
            <p className="t-h3 pretty mt-10 max-w-3xl text-frost">
              คำถามไม่ใช่ “แพงไหม” แต่คือ “ต้องมีรายได้ส่วนเพิ่มเท่าไร
              จึงครอบคลุมค่าสมาชิกหนึ่งปี”
            </p>
            <p className="t-small t-thai mt-5 text-frost/50">
              รายได้ส่วนเพิ่มต่อปีที่ต้องได้เพื่อคุ้มทุน เมื่อกำไรขั้นต้น 40%
            </p>
          </Reveal>

          <Reveal delay={140}>
            <div className="mt-14 grid gap-8 md:grid-cols-3">
              {PLAN_ORDER.filter((id) => breakEvenBaht(PLANS[id]) != null).map(
                (id) => {
                  const p = PLANS[id];
                  const be = breakEvenBaht(p)!;
                  return (
                    <div key={id} className="border-t border-frost/20 pt-7">
                      <p className="t-label text-frost/50">{p.name}</p>
                      <p className="t-numeral-md mt-4 text-cyan">
                        <Numeral value={`฿${th(be)}`} />
                      </p>
                      <p className="t-small t-thai mt-4 text-frost/60">
                        ประมาณ ฿{th(Math.round(be / 12))} ต่อเดือน
                      </p>
                    </div>
                  );
                },
              )}
            </div>
          </Reveal>

          <Reveal delay={210}>
            <p className="t-small t-thai pretty mt-14 max-w-3xl text-frost/50">
              นี่คือเกณฑ์ที่ระบบต้องทำให้ผ่าน ไม่ใช่คำสัญญาว่าจะผ่านเสมอ
              ระบบวัดผลเทียบกับกลุ่มเปรียบเทียบ หากไม่คุ้ม คุณจะเห็นว่าไม่คุ้มตรงๆ
            </p>
          </Reveal>
        </div>
      </Section>

      {/* honesty on billing */}
      <Section tone="paper">
        <div className="shell">
          <Reveal>
            <Label>สิ่งที่เราตั้งใจไม่ทำ</Label>
          </Reveal>
          <div className="mt-14 grid gap-8 md:grid-cols-3">
            {[
              {
                t: "ไม่ใช้คำว่าไม่จำกัดกับสิ่งที่มีต้นทุนจริง",
                d: "ถ้าเราเป็นผู้จ่ายต้นทุนการประมวลผล ผู้ใช้ที่หนักที่สุดจะกลายเป็นขาดทุนสูงสุด และสุดท้ายทุกคนต้องจ่ายแพงขึ้น",
              },
              {
                t: "ไม่ซ่อนค่าข้อความในค่าสมาชิก",
                d: "แยกเป็นเครดิตที่มองเห็นได้ ไม่เฉลี่ยใส่ราคาให้คนส่งน้อยช่วยจ่ายแทนคนส่งมาก",
              },
              {
                t: "ไม่คิดเงินตามจำนวนผู้ใช้",
                d: "จำนวนคนที่ล็อกอินไม่เกี่ยวกับคุณค่าที่ส่งมอบ ฐานลูกค้าเท่ากัน ราคาจึงเท่ากัน",
              },
            ].map((x, i) => (
              <Reveal key={x.t} delay={i * 80}>
                <Panel className="h-full">
                  <span className="marker-num">0{i + 1}</span>
                  <h3 className="t-h3 mt-4 text-ink">{x.t}</h3>
                  <p className="t-small t-thai mt-5 text-ink-3">{x.d}</p>
                </Panel>
              </Reveal>
            ))}
          </div>

          <Reveal delay={240}>
            <div className="mt-16 max-w-3xl">
              <Quote>
                ต้นทุนที่ต้องจับตาคือการส่งข้อความ หากไม่แยกเครดิต
                ลูกค้าที่ใช้งานหนักที่สุดจะกลายเป็นลูกค้าที่สร้างต้นทุนสูงที่สุด
              </Quote>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* ── ยังไม่พร้อม ── */}
      <Section tone="mist">
        <div className="shell">
          <Reveal>
            <Label>ยังไม่พร้อม และยังไม่คิดเงิน</Label>
          </Reveal>
          <Reveal delay={70}>
            <p className="t-body t-thai pretty mt-10 max-w-3xl text-ink-3">
              การขายสิ่งที่ยังไม่มี คือหนี้ที่ต้องชำระตั้งแต่วันแรกที่ลูกค้าเริ่มใช้
            </p>
          </Reveal>
          <Stagger step={90} className="mt-14 grid gap-8 md:grid-cols-3">
            {NOT_READY.map((x) => (
              <div key={x.t} className="border-t border-line pt-7">
                <p className="t-label t-thai text-ink-4">กำลังพัฒนา</p>
                <h3 className="t-h3 mt-4 text-ink">{x.t}</h3>
                <p className="t-small t-thai mt-5 text-ink-3">{x.d}</p>
              </div>
            ))}
          </Stagger>
        </div>
      </Section>

      {/* ── คำถามที่ถามจริง ── */}
      <Section tone="paper">
        <div className="shell">
          <Reveal>
            <Label>คำถามที่ลูกค้าถามจริง</Label>
          </Reveal>
          <Stagger step={60} className="mt-12 grid gap-px bg-line lg:grid-cols-2">
            {FAQ.map((f) => (
              <div key={f.q} className="h-full bg-paper p-8">
                <h3 className="t-body t-thai text-ink">{f.q}</h3>
                <More label="ดูคำตอบ">{f.a}</More>
              </div>
            ))}
          </Stagger>
        </div>
      </Section>

      <NextUp
        items={[
          { href: "/product#features", label: "ผลิตภัณฑ์", title: "ดูฟีเจอร์ทั้งหมด" },
          { href: "/contact", label: "เริ่มต้น", title: "ขอทดลองใช้" },
          { href: "/investors", label: "นักลงทุน", title: "เศรษฐศาสตร์เบื้องหลังราคา" },
        ]}
      />

      <CTA />
    </>
  );
}
