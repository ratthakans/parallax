import type { Metadata } from "next";
import Link from "next/link";
import { BriefMock } from "@/components/brief-mock";
import { CTA, Label, Panel, Section } from "@/components/ui";
import { Reveal, Stagger } from "@/components/reveal";

export const metadata: Metadata = {
  title: "ดูตัวอย่างระบบ",
  description:
    "เปิดดูตัวอย่างบรีฟเช้าของ Parallax ได้ทันที ไม่ต้องสมัครหรือเข้าสู่ระบบ",
};

const STEPS = [
  {
    n: "01",
    title: "ระบบเลือก 3 งานที่คุ้มที่สุด",
    body: "คัดจากจังหวะซื้อ มูลค่าลูกค้า ช่องทางที่ติดต่อได้ และเพดานที่ธุรกิจกำหนดไว้",
  },
  {
    n: "02",
    title: "คุณอ่านเหตุผลแล้วเป็นคนอนุมัติ",
    body: "ก่อนส่งจะเห็นกลุ่มลูกค้า จำนวนคน ข้อเสนอ และมูลค่าที่คาดไว้ครบในที่เดียว",
  },
  {
    n: "03",
    title: "ระบบกันกลุ่มไว้เพื่อวัดผล",
    body: "เมื่อครบระยะจะเทียบกับสิ่งที่น่าจะเกิดขึ้นเอง แล้วรายงานรายได้ส่วนเพิ่มที่วัดได้จริง",
  },
];

export default function DemoPage() {
  return (
    <>
      <section className="surface-dark relative overflow-hidden pt-32 pb-20 md:pt-40 md:pb-28">
        <div className="shell">
          <div className="grid items-start gap-14 lg:grid-cols-[0.72fr_1.28fr] lg:gap-16">
            <div className="hero-in">
              <div>
                <Label onDark>เดโมสาธารณะ · ไม่ต้องเข้าสู่ระบบ</Label>
                <h1 className="t-h1 balance mt-8 text-frost">
                  ทุกเช้า เหลือเพียงสามงานที่ควรทำก่อน
                </h1>
                <p className="t-lead t-thai pretty mt-7 text-frost/68">
                  ตัวอย่างนี้ใช้ข้อมูลสังเคราะห์ ไม่มีข้อความถูกส่งออกจริง
                  แต่ลำดับการตัดสินใจและวิธีวัดผลเหมือนระบบที่ใช้งานจริง
                </p>
                <div className="mt-9 flex flex-wrap gap-3">
                  <Link href="/contact" className="btn btn-frost">
                    ทดลองกับข้อมูลของคุณ
                  </Link>
                  <Link href="/app" className="btn btn-outline-frost">
                    เข้าสู่ระบบสำหรับลูกค้า
                  </Link>
                </div>
              </div>
            </div>

            <div className="hero-in" style={{ animationDelay: "120ms" }}>
              <BriefMock />
            </div>
          </div>
        </div>
      </section>

      <Section tone="paper">
        <div className="shell">
          <Reveal>
            <Label>จากข้อมูล ไปสู่การตัดสินใจ</Label>
            <h2 className="t-h2 balance mt-8 max-w-3xl text-ink">
              ระบบเตรียมงานทั้งหมดให้ คุณยังเป็นคนตัดสินใจเสมอ
            </h2>
          </Reveal>
          <Stagger step={90} className="mt-12 grid gap-px bg-line md:grid-cols-3">
            {STEPS.map((step) => (
              <Panel key={step.n} className="rounded-none border-0">
                <p className="marker-num">{step.n}</p>
                <h3 className="t-h3 mt-5 text-ink">{step.title}</h3>
                <p className="t-small t-thai mt-4 text-ink-3">{step.body}</p>
              </Panel>
            ))}
          </Stagger>
        </div>
      </Section>

      <CTA
        title="อยากเห็นสามงานจากข้อมูลของธุรกิจคุณไหม?"
        body="เริ่มจากไฟล์ยอดขายหกเดือน เราจะบอกตรงๆ ว่าข้อมูลพอทำอะไรได้ และอะไรยังพิสูจน์ไม่ได้"
      />
    </>
  );
}
