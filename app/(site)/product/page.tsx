import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLink,
  CTA,
  Panel,
  Field,
  Label,
  More,
  NextUp,
  Note,
  PageHero,
  Quote,
  Section,
} from "@/components/ui";
import { Reveal } from "@/components/reveal";
import { BriefMock } from "@/components/brief-mock";

export const metadata: Metadata = {
  title: "สิ่งที่คุณได้ใช้",
  description:
    "บรีฟเช้าคือหน้าหลักของผลิตภัณฑ์ สามงาน สิบวินาที ทุกเช้า ส่วนที่เหลือคือระบบที่เตรียมคำตอบให้",
};

const NAMES = [
  { n: "บรีฟเช้าวันนี้", d: "หน้าที่เปิดทุกวัน สามงาน สิบวินาที", href: "#brief" },
  { n: "รักษาลูกค้าเดิม", d: "ทำงานกับฐานลูกค้าที่คุณมีอยู่แล้ว", href: "/platform/keep" },
  { n: "หาลูกค้าใหม่", d: "หากลุ่มใหม่จากลักษณะของลูกค้าที่พิสูจน์แล้ว", href: "/platform/reach" },
  { n: "ผลที่วัดได้", d: "วัดส่วนต่างและบอกว่าระบบคุ้มจริงหรือไม่", href: "/platform/proof" },
];

const FEATURES: {
  group: string;
  question: string;
  items: string[];
}[] = [
  {
    group: "นำเข้าข้อมูล",
    question: "“ข้อมูลกระจัดกระจาย ต้องจ้างคนมาจัดก่อนหรือไม่?”",
    items: [
      "ลาก CSV หรือ Excel จาก POS ใดก็ได้มาวาง",
      "อ่านหัวตาราง ทำความเข้าใจความหมาย และทำความสะอาดแถวอัตโนมัติ",
      "ส่งรายงานเข้าอีเมลระบบเพื่ออัปเดตอัตโนมัติ",
      "API สำหรับเชื่อมต่อแพลตฟอร์ม POS พาร์ตเนอร์",
    ],
  },
  {
    group: "ตัวตนและสิทธิ",
    question: "“ส่งข้อความนี้ได้อย่างถูกกฎหมายหรือไม่?”",
    items: [
      "รวมตัวตนจาก POS, marketplace, LINE และฟอร์ม",
      "บันทึกความยินยอมผูกกับตัวตนและตรวจสอบย้อนหลังได้",
      "ปกปิดตัวระบุก่อนประมวลผล",
      "เก็บตัวตนที่จุดขายสำหรับร้านที่ใบเสร็จยังไม่ผูกกับลูกค้า",
    ],
  },
  {
    group: "ทำความเข้าใจ",
    question: "“ควรติดต่อลูกค้าคนใดก่อน?”",
    items: [
      "คำนวณ RFM รายคนเทียบกับวงจรของลูกค้าคนนั้น",
      "ประเมินความเสี่ยงเงียบหายเทียบกับพฤติกรรมปกติของตัวเอง",
      "ระดับราคาและความไวต่อส่วนลด",
      "แผนที่โอกาสจากความใกล้ถึงรอบ × มูลค่า",
    ],
  },
  {
    group: "รักษาลูกค้าเดิม",
    question: "“ไม่มีเวลาคิดแคมเปญทุกวัน”",
    items: [
      "บรีฟเช้า — สามงานสำหรับวันนี้",
      "เตรียมข้อความแคมเปญให้เลือกสามโทน",
      "ส่ง LINE รายคนหรือรายกลุ่ม",
      "ทำงานตามวงจร วันครบกำหนด และวันหมดอายุ",
    ],
  },
  {
    group: "หาลูกค้าใหม่",
    question: "“โฆษณาพามาแต่คนที่ซื้อครั้งเดียว”",
    items: [
      "สกัดลักษณะจากลูกค้าที่ซื้อซ้ำในราคาเต็ม",
      "ซิงก์กลุ่มเป้าหมายแบบแฮชไปยัง Meta, TikTok และ Google",
      "ร่างโฆษณาสามแบบพร้อม landing page",
      "ให้คะแนน lead ตั้งแต่เข้ามา แล้วส่งต่อให้ระบบรักษาลูกค้าเดิม",
    ],
  },
  {
    group: "วัดผล",
    question: "“ระบบสร้างรายได้คุ้มค่าตัวจริงหรือไม่?”",
    items: [
      "เลือกวิธีกันกลุ่มเปรียบเทียบตามขนาดกลุ่ม",
      "ติดตาม ROI — ค่าเฉลี่ยย้อนหลัง 90 วันพร้อมช่วงความเชื่อมั่น",
      "ต้นทุนต่อลูกค้าที่กลับมาซื้อ",
      "รายงานตรงๆ ว่า “ข้อมูลยังไม่พอสรุป” เมื่อผลยังไม่นิ่ง",
    ],
  },
];

export default function ProductPage() {
  return (
    <>
      <PageHero
        label="สิ่งที่คุณได้ใช้"
        title="ผลิตภัณฑ์อยู่ในหน้าจอเดียว ส่วนที่เหลือคือระบบที่เตรียมคำตอบให้"
        lead="ทุกเช้าเจ้าของธุรกิจเปิดเพียงบรีฟเดียว โดยไม่จำเป็นต้องรู้ว่าสถาปัตยกรรมด้านล่างซับซ้อนแค่ไหน"
      />

      {/* naming system */}
      <Section tone="paper">
        <div className="shell">
          <Reveal>
            <Label>ชื่อของแต่ละส่วน</Label>
          </Reveal>
          <div className="mt-14 grid gap-px bg-line md:grid-cols-2 xl:grid-cols-4">
            {NAMES.map((x, i) => (
              <Reveal key={x.n} delay={i * 70}>
                <Link
                  href={x.href}
                  className="group flex h-full flex-col justify-between gap-10 bg-paper p-8 transition-colors duration-300 hover:bg-white"
                >
                  <span className="marker-num">0{i + 1}</span>
                  <div>
                    <h2 className="t-h3 text-ink transition-colors group-hover:text-signal">
                      {x.n}
                    </h2>
                    <p className="t-small t-thai mt-4 text-ink-3">{x.d}</p>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
          <Reveal delay={220}>
            <div className="mt-12">
              <Note>
                บรีฟคือผลิตภัณฑ์ ส่วนที่เหลือคือระบบที่อยู่ข้างหลัง
                เมื่อผู้ใช้หยุดเปิดบรีฟ นั่นคือสัญญาณเตือนการยกเลิกที่มาก่อนตัวเลขอื่น
              </Note>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* the brief */}
      <Section tone="dark" id="brief" className="overflow-hidden">
        <Field variant="deep" />
        <div className="shell">
          <div className="grid gap-16 lg:grid-cols-[0.78fr_1.22fr] lg:gap-20">
            <Reveal>
              <div>
                <Label onDark>
                  หน้าหลักของผลิตภัณฑ์
                </Label>
                <h2 className="t-h1 balance mt-9 text-frost">บรีฟเช้าวันนี้</h2>
                <p className="t-lead t-thai mt-8 text-frost/70">
                  สามงาน สิบวินาที ทุกเช้า
                </p>
                <div className="mt-10 flex flex-col gap-6">
                  {[
                    ["ทำไมมีสามงาน", "เพราะสิบงานแทบไม่ต่างจากไม่มีงาน ระบบเลือกสามอันดับแรกจากแผนที่โอกาส และเก็บที่เหลือไว้รอบถัดไป"],
                    ["ทำไมใช้สิบวินาที", "เพราะเจ้าของธุรกิจไม่มีเวลาว่าง สิ่งที่ต้องอ่านมีเพียงใคร กี่คน ทำไมต้องตอนนี้ และคาดว่าจะได้อะไร"],
                    ["ทำไมต้องอนุมัติ", "เพราะความไว้ใจเกิดจากการให้คนควบคุม ระบบอัตโนมัติจะใช้ได้ภายหลังเฉพาะกับรูปแบบที่คนเคยอนุมัติแล้ว"],
                  ].map(([q, a]) => (
                    <div key={q} className="border-t border-cyan/12 pt-6">
                      <p className="t-label text-cyan/60">{q}</p>
                      <p className="t-small t-thai mt-3 text-frost/66">{a}</p>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
            <Reveal delay={140}>
              <BriefMock />
            </Reveal>
          </div>
        </div>
      </Section>

      {/* feature matrix */}
      <Section tone="paper" id="features">
        <div className="shell">
          <Reveal>
            <Label>ฟีเจอร์ทั้งหมด</Label>
          </Reveal>
          <Reveal delay={70}>
            <h2 className="t-h2 balance mt-9 max-w-3xl text-ink">
              ทุกฟีเจอร์ตอบคำถามที่เจ้าของธุรกิจถามจริง ไม่ใช่ข้อกำหนดของฝ่ายไอที
            </h2>
          </Reveal>

          <div className="mt-16 flex flex-col">
            {FEATURES.map((f, i) => (
              <Reveal key={f.group} delay={i * 50}>
                <div
                  className={`grid gap-6 border-t py-11 lg:grid-cols-[12rem_1fr_1.1fr] lg:gap-12 ${
                    i === FEATURES.length - 1 ? "border-b border-b-line" : ""
                  } border-line`}
                >
                  <div>
                    <span className="marker-num">0{i + 1}</span>
                    <h3 className="t-h3 mt-3 text-ink">{f.group}</h3>
                  </div>
                  <p className="t-body t-thai pretty text-signal lg:pt-1">
                    {f.question}
                  </p>
                  <ul className="flex flex-col gap-3.5">
                    {f.items.map((it) => (
                      <li
                        key={it}
                        className="t-small t-thai flex gap-4 text-ink-2"
                      >
                        <span
                          className="mt-[0.8em] h-px w-3.5 shrink-0 bg-line"
                          aria-hidden
                        />
                        {it}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={180}>
            <div className="mt-14 grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
              <Quote>
                ลำดับการพัฒนา — ตัวตนลูกค้าและบรีฟเช้ามาก่อน
                ฟีเจอร์อื่นทั้งหมดทำงานต่อจากสองส่วนนี้
              </Quote>
              <ArrowLink href="/pricing">ดูว่าแต่ละฟีเจอร์อยู่ในแผนใด</ArrowLink>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* onboarding */}
      <Section tone="mist">
        <div className="shell">
          <Reveal>
            <Label>วันแรก</Label>
          </Reveal>
          <Reveal delay={70}>
            <h2 className="t-h2 balance mt-9 max-w-3xl text-ink">
              วางไฟล์ แล้วเห็นสิ่งที่ควรทำต่อภายในสามนาที
            </h2>
          </Reveal>

          <div className="mt-14 grid gap-8 md:grid-cols-3">
            {[
              {
                t: "นาทีที่ 0",
                d: "ส่งออกประวัติยอดขายจาก POS เป็น CSV หรือ Excel แล้วลากมาวาง ไม่ต้องจัดคอลัมน์หรือลบแถวว่าง",
              },
              {
                t: "นาทีที่ 1",
                d: "ระบบอ่านหัวตารางและจับคู่วันที่ ยอดเงิน สินค้า และตัวระบุลูกค้า คุณตรวจเฉพาะจุดที่จับคู่ผิด",
              },
              {
                t: "นาทีที่ 3",
                d: "ฐานลูกค้าถูกแบ่งกลุ่ม เห็นจำนวนคนที่กำลังจะเงียบ และบรีฟแรกพร้อมให้อ่าน",
              },
            ].map((x, i) => (
              <Reveal key={x.t} delay={i * 80}>
                <Panel className="h-full">
                  <p className="t-label text-signal">{x.t}</p>
                  <More label="ดูรายละเอียด">{x.d}</More>
                </Panel>
              </Reveal>
            ))}
          </div>

          <Reveal delay={240}>
            <div className="mt-12">
              <Note>
                สิ่งที่ต้องมีคือประวัติการซื้ออย่างน้อยหกเดือน และตัวระบุลูกค้าอย่างน้อยหนึ่งแบบ:
                เบอร์โทร อีเมล หรือรหัสสมาชิก
              </Note>
            </div>
          </Reveal>
        </div>
      </Section>

      <NextUp
        items={[
          { href: "/platform", label: "แพลตฟอร์ม", title: "ระบบห้าชั้นที่อยู่หลังหน้าจอเดียว" },
          { href: "/pricing", label: "ราคา", title: "สี่แผนและสิ่งที่รวมอยู่" },
          { href: "/playbook", label: "หลักฐาน", title: "ผลลัพธ์จากข้อมูลจริง" },
          { href: "/demo", label: "เดโม", title: "ดูตัวอย่างระบบ" },
        ]}
      />

      <CTA />
    </>
  );
}
