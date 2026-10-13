import Link from "next/link";
import { BriefMock } from "@/components/brief-mock";
import { ArrowLink, CTA, Label, Section } from "@/components/ui";
import { Reveal, Stagger } from "@/components/reveal";

const STEPS = [
  {
    n: "1",
    title: "ส่งไฟล์ยอดขาย",
    body: "ใช้ไฟล์จาก POS ที่มีอยู่แล้ว ไม่ต้องเปลี่ยนระบบเดิม",
  },
  {
    n: "2",
    title: "รับ 3 งานที่ควรทำ",
    body: "รู้ทันทีว่าควรดูแลลูกค้ากลุ่มไหน และควรทำอะไรต่อ",
  },
  {
    n: "3",
    title: "วัดยอดที่เพิ่มขึ้นจริง",
    body: "แยกยอดจากแคมเปญ ออกจากยอดที่น่าจะเกิดขึ้นอยู่แล้ว",
  },
];

const BENEFITS = [
  {
    title: "รู้ว่าต้องคุยกับใคร",
    body: "จัดลำดับลูกค้าจากโอกาสซื้อซ้ำ มูลค่า และจังหวะที่เหมาะสม",
  },
  {
    title: "รู้ว่าควรทำอะไรวันนี้",
    body: "ได้ข้อเสนอ ข้อความ และช่องทางที่พร้อมนำไปใช้ ไม่ใช่รายงานที่ต้องตีความต่อ",
  },
  {
    title: "รู้ว่าสิ่งที่ทำได้ผลไหม",
    body: "มีวิธีวัดผลและกลุ่มเปรียบเทียบเตรียมไว้ตั้งแต่ก่อนเริ่มแคมเปญ",
  },
];

const TRUST = [
  "คุณเป็นคนอนุมัติก่อนส่งทุกครั้ง",
  "ชื่อ เบอร์ และธุรกรรมไม่ถูกส่งข้ามบัญชี",
  "กำหนดเพดานข้อความ เวลา และส่วนลดได้",
];

export default function HomePage() {
  return (
    <>
      <header className="surface-dark relative overflow-hidden pt-28 pb-16 md:pt-36 md:pb-24">
        <div
          className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_78%_30%,rgba(7,93,255,0.34),transparent_42%),radial-gradient(circle_at_52%_90%,rgba(98,231,255,0.12),transparent_38%)]"
          aria-hidden
        />
        <div className="shell">
          <div className="grid items-center gap-12 lg:grid-cols-[0.92fr_1.08fr] lg:gap-16">
            <div>
              <div className="hero-in">
                <p className="t-label text-cyan">ระบบช่วยเพิ่มยอดขายจากลูกค้าเดิม</p>
              </div>
              <div className="hero-in" style={{ animationDelay: "80ms" }}>
                <h1 className="mt-6 max-w-2xl text-[clamp(2.5rem,4vw,3.6rem)] leading-[1.22] font-normal text-frost">
                  <span className="block">เปลี่ยนไฟล์ยอดขาย</span>
                  <span className="block text-cyan">เป็น 3 งานสำคัญ</span>
                  <span className="block text-cyan">ของวันนี้</span>
                </h1>
              </div>
              <div className="hero-in" style={{ animationDelay: "150ms" }}>
                <p className="t-lead pretty mt-7 max-w-xl text-frost/72">
                  PARALLAX บอกว่าควรดูแลลูกค้ากลุ่มไหน ทำอะไรต่อ
                  และวัดได้ว่ายอดขายเพิ่มขึ้นจากสิ่งที่ทำจริงหรือไม่
                </p>
              </div>
              <div className="hero-in" style={{ animationDelay: "220ms" }}>
                <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Link href="/demo" className="btn btn-frost">
                    ดูเดโม ไม่ต้องสมัคร
                  </Link>
                  <Link href="/contact" className="btn btn-outline-frost">
                    ทดลองกับข้อมูลจริง
                  </Link>
                </div>
                <p className="t-small mt-5 text-frost/52">
                  เริ่มได้จากไฟล์ยอดขาย 6 เดือน · ไม่ต้องติดตั้งระบบเพิ่ม
                </p>
              </div>
            </div>

            <div className="hero-in" style={{ animationDelay: "120ms" }}>
              <BriefMock compact />
            </div>
          </div>
        </div>
      </header>

      <Section tone="paper" size="band-sm">
        <div className="shell">
          <Reveal>
            <div className="max-w-2xl">
              <Label>เริ่มง่าย ใช้ของที่มีอยู่แล้ว</Label>
              <h2 className="t-h2 balance mt-6 text-ink">
                จากไฟล์หนึ่งไฟล์ ไปสู่งานที่ลงมือทำได้
              </h2>
            </div>
          </Reveal>

          <Stagger step={80} className="mt-10 grid gap-px border border-line bg-line md:grid-cols-3">
            {STEPS.map((step) => (
              <article key={step.n} className="bg-paper p-6 md:p-8">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-signal text-sm font-semibold text-white">
                  {step.n}
                </span>
                <h3 className="t-h3 mt-6 text-ink">{step.title}</h3>
                <p className="t-small pretty mt-3 text-ink-3">{step.body}</p>
              </article>
            ))}
          </Stagger>
        </div>
      </Section>

      <Section tone="mist">
        <div className="shell">
          <div className="grid gap-12 lg:grid-cols-[0.78fr_1.22fr] lg:gap-20">
            <Reveal dir="left">
              <div className="lg:sticky lg:top-28">
                <Label>สิ่งที่คุณได้ทุกเช้า</Label>
                <h2 className="t-h1 balance mt-6 text-ink">
                  ไม่ใช่รายงานเพิ่ม
                  <br />
                  แต่คือคำตอบว่าต้องทำอะไร
                </h2>
                <div className="mt-8">
                  <ArrowLink href="/product">ดูรายละเอียดผลิตภัณฑ์</ArrowLink>
                </div>
              </div>
            </Reveal>

            <Stagger step={80} className="divide-y divide-line border-y border-line">
              {BENEFITS.map((benefit, index) => (
                <article key={benefit.title} className="grid gap-4 py-7 sm:grid-cols-[2.5rem_1fr] md:py-9">
                  <span className="marker-num">0{index + 1}</span>
                  <div>
                    <h3 className="t-h3 text-ink">{benefit.title}</h3>
                    <p className="t-body pretty mt-3 max-w-xl text-ink-3">{benefit.body}</p>
                  </div>
                </article>
              ))}
            </Stagger>
          </div>
        </div>
      </Section>

      <Section tone="paper">
        <div className="shell">
          <Reveal>
            <div className="grid gap-10 border border-line p-7 md:grid-cols-[0.8fr_1.2fr] md:p-10 lg:gap-16 lg:p-14">
              <div>
                <Label>ทดสอบกับข้อมูลจริง · MST Golf</Label>
                <p className="mt-7 text-[clamp(3.5rem,8vw,6.5rem)] leading-none font-semibold tracking-[-0.055em] text-signal">
                  967
                </p>
                <p className="t-body mt-3 text-ink-2">งานที่จัดลำดับได้จากไฟล์เดียว</p>
              </div>
              <div className="flex flex-col justify-center border-t border-line pt-8 md:border-t-0 md:border-l md:pt-0 md:pl-10 lg:pl-16">
                <h2 className="t-h2 balance text-ink">
                  เห็นโอกาสที่ทำต่อได้ โดยไม่ต้องเปลี่ยนระบบหน้าร้าน
                </h2>
                <p className="t-body pretty mt-5 max-w-xl text-ink-3">
                  นำเข้ารายการซื้อ 1,240 รายการ และพบว่าข้อมูลลูกค้า 78%
                  พร้อมใช้สำหรับจัดลำดับงานต่อทันที
                </p>
                <div className="mt-7">
                  <ArrowLink href="/playbook">ดูกรณีศึกษาทั้งหมด</ArrowLink>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </Section>

      <Section tone="dark" size="band-sm">
        <div className="shell">
          <Reveal>
            <div className="grid gap-9 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
              <div>
                <Label onDark>ควบคุมได้ทุกขั้นตอน</Label>
                <h2 className="t-h2 balance mt-6 text-frost">ระบบช่วยเตรียมงาน คนยังเป็นผู้ตัดสินใจ</h2>
              </div>
              <ul className="grid gap-3">
                {TRUST.map((item) => (
                  <li key={item} className="flex min-h-14 items-center gap-4 border border-frost/14 px-5 text-frost/76">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan/12 text-sm text-cyan" aria-hidden>
                      ✓
                    </span>
                    <span className="t-body">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </Section>

      <CTA
        title="พร้อมดู 3 งานจากข้อมูลของคุณหรือยัง?"
        body="ส่งไฟล์ยอดขายตัวอย่างมาให้เรา เราจะบอกตรงๆ ว่าข้อมูลทำอะไรได้ และอะไรยังพิสูจน์ไม่ได้"
      />
    </>
  );
}
