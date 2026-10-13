import type { Metadata } from "next";
import { Label, PageHero, Section, Note, Panel } from "@/components/ui";
import { Reveal } from "@/components/reveal";
import { ContactForm } from "@/components/contact-form";

export const metadata: Metadata = {
  title: "ติดต่อเรา",
  description:
    "ขอทดลองใช้ พูดคุยเรื่องการเชื่อมต่อ POS หรือขอข้อมูลสำหรับนักลงทุน",
};

const CHANNELS = [
  {
    t: "ขอทดลองใช้",
    d: "ส่งประวัติยอดขายหกเดือน แล้วเราจะคืนชุดงานแรกที่ควรทำต่อให้ดูก่อนตัดสินใจ",
    mail: "hello@parallax.co.th",
  },
  {
    t: "พาร์ตเนอร์ POS และเอเจนซี",
    d: "เชื่อมต่อ API วางใน app store หรือจัดการหลายร้านในระบบเดียว",
    mail: "partners@parallax.co.th",
  },
  {
    t: "นักลงทุน",
    d: "ขอเอกสารฉบับเต็ม รวมสมมติฐาน แผนสำรอง และสิ่งที่ยังไม่ได้พิสูจน์",
    mail: "investors@parallax.co.th",
  },
  {
    t: "ความเป็นส่วนตัวและ PDPA",
    d: "ขอร่างข้อตกลงประมวลผลข้อมูล หรือใช้สิทธิของเจ้าของข้อมูล",
    mail: "privacy@parallax.co.th",
  },
];

export default function ContactPage() {
  return (
    <>
      <PageHero
        label="ติดต่อเรา"
        title="เล่าวงจรรายได้ของคุณ แล้วเราจะบอกตรงๆ ว่า PARALLAX เหมาะหรือไม่"
        lead="ถ้ายังไม่เหมาะ คุณจะได้รู้ตั้งแต่การคุยครั้งแรก ไม่ใช่หลังตัดสินใจซื้อ"
      />

      <Section tone="paper">
        <div className="shell">
          <div className="grid gap-16 lg:grid-cols-[1.15fr_0.85fr] lg:gap-20">
            <Reveal>
              <div>
                <Label>ส่งรายละเอียด</Label>
                <div className="mt-12">
                  <ContactForm />
                </div>
              </div>
            </Reveal>

            <Reveal delay={120}>
              <div className="flex flex-col gap-6">
                <Label>หรือส่งอีเมลโดยตรง</Label>
                {CHANNELS.map((c) => (
                  <Panel key={c.t}>
                    <h2 className="t-h3 text-ink">{c.t}</h2>
                    <p className="t-small t-thai mt-4 text-ink-3">{c.d}</p>
                    <a
                      href={`mailto:${c.mail}`}
                      className="ulink mt-5 inline-block t-small font-medium text-signal"
                    >
                      {c.mail}
                    </a>
                  </Panel>
                ))}
                <Note>
                  PARALLAX · กรุงเทพฯ ประเทศไทย · ตอบกลับภายใน 2 วันทำการ
                </Note>
              </div>
            </Reveal>
          </div>
        </div>
      </Section>
    </>
  );
}
