import type { Metadata } from "next";
import {
  CTA,
  Panel,
  Label,
  NextUp,
  Note,
  PageHero,
  Quote,
  Section,
} from "@/components/ui";
import { Reveal } from "@/components/reveal";

export const metadata: Metadata = {
  title: "ความเป็นส่วนตัวและการกำกับดูแล",
  description:
    "PDPA บันทึกความยินยอม การปกปิดตัวตนก่อนประมวลผล เพดานการส่ง และขอบเขตที่ระบบอัตโนมัติไม่ข้าม",
};

const PRINCIPLES = [
  {
    t: "ข้อมูลของร้านเป็นของร้าน",
    d: "ชื่อ เบอร์ และประวัติการซื้ออยู่ภายในบัญชีนั้น ไม่ข้ามบัญชีและไม่ถูกขาย",
  },
  {
    t: "ปกปิดตัวตนก่อนประมวลผล",
    d: "ตัวระบุถูกแยกออกก่อนคำนวณ สถิติทั้งหมดทำงานบนข้อมูลที่ปกปิดแล้ว",
  },
  {
    t: "ความยินยอมผูกกับตัวตน",
    d: "เมื่อถอนความยินยอม ตัวตนนั้นจะหลุดจากทุกกลุ่มและกลุ่มเป้าหมายในรอบถัดไป",
  },
  {
    t: "ตรวจสอบย้อนหลังได้",
    d: "ทุกการส่งบันทึกว่าใครอนุมัติ ส่งอะไร ให้ใคร เมื่อไร และอ้างอิงความยินยอมใด",
  },
  {
    t: "แฮชก่อนส่งออก",
    d: "กลุ่มเป้าหมายใช้ตัวระบุที่แฮชแล้วและส่งออกเฉพาะแถวที่มีความยินยอม",
  },
  {
    t: "ปิดการเรียนรู้ข้ามบัญชีได้",
    d: "การเข้าร่วมเป็นค่าเริ่มต้นที่ปิดได้ ไม่ใช่เงื่อนไขบริการ และทุกฟีเจอร์ยังทำงานเมื่อปิด",
  },
];

const LIMITS = [
  { k: "ข้อความสูงสุดต่อคนต่อสัปดาห์", v: "ตั้งค่าได้และมีเพดานของระบบกำกับอีกชั้น" },
  { k: "ช่วงเวลาห้ามส่ง", v: "ตั้งค่าได้ โดยค่าเริ่มต้นครอบคลุมกลางคืนและวันหยุด" },
  { k: "เพดานส่วนลดที่ระบบเสนอ", v: "ตั้งค่าได้ สิ่งที่เกินเพดานต้องผ่านคน" },
  { k: "ส่งข้อความใหม่อัตโนมัติ", v: "ปิดเสมอจนกว่าคนจะอนุมัติรูปแบบข้อความ" },
  {
    k: "ระบบอัตโนมัติกับหมวดที่มีกฎกำกับ",
    v: "ปิดถาวร — อาหารเสริม เครื่องสำอาง และบริการทางการแพทย์",
  },
];

export default function TrustPage() {
  return (
    <>
      <PageHero
        label="ความเป็นส่วนตัวและการกำกับดูแล"
        title="ระบบที่ส่งข้อความหาคนจริง ต้องกำหนดขอบเขตก่อนลงมือ ไม่ใช่ภายหลัง"
        lead="คำถามแรกไม่ใช่ว่าระบบฉลาดแค่ไหน แต่คือส่งอย่างถูกกฎหมายหรือไม่ เราจึงตอบเรื่องนี้ก่อนพูดถึงฟีเจอร์"
      />

      <Section tone="paper">
        <div className="shell">
          <Reveal>
            <Label>บังคับใช้ที่ระดับระบบ</Label>
          </Reveal>
          <Reveal delay={70}>
            <h2 className="t-h2 balance mt-9 max-w-3xl text-ink">
              หลักทั้งหกข้อเป็นข้อจำกัดในโค้ด ไม่ใช่เพียงข้อความในนโยบาย
            </h2>
          </Reveal>

          <div className="mt-16 grid gap-px bg-line md:grid-cols-2 xl:grid-cols-3">
            {PRINCIPLES.map((p, i) => (
              <Reveal key={p.t} delay={i * 50}>
                <div className="flex h-full flex-col gap-5 bg-paper p-8">
                  <span className="marker-num">0{i + 1}</span>
                  <h3 className="t-h3 text-ink">{p.t}</h3>
                  <p className="t-small t-thai text-ink-3">{p.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </Section>

      {/* limits */}
      <Section tone="mist">
        <div className="shell">
          <div className="grid gap-14 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
            <Reveal>
              <div>
                <Label>เพดานที่ตั้งอยู่เสมอ</Label>
                <h2 className="t-h2 balance mt-9 text-ink">
                  ระบบที่ส่งได้ไม่จำกัด คือระบบที่ทำให้ร้านถูกปิดเสียง
                </h2>
                <p className="t-body t-thai pretty mt-8 max-w-md text-ink-3">
                  การส่งมากเกินไปทำลายความสัมพันธ์ที่เรากำลังช่วยสร้าง
                  เพดานจึงมีในทุกแผน รวมถึงแผนที่ราคาสูงที่สุด
                </p>
              </div>
            </Reveal>
            <Reveal delay={120}>
              <ul className="flex flex-col">
                {LIMITS.map((l, i) => (
                  <li
                    key={l.k}
                    className={`flex flex-col gap-2 border-t border-line py-6 md:flex-row md:items-baseline md:justify-between md:gap-10 ${
                      i === LIMITS.length - 1 ? "border-b border-b-line" : ""
                    }`}
                  >
                    <span className="t-body t-thai text-ink">{l.k}</span>
                    <span className="t-small t-thai shrink-0 text-ink-3 md:max-w-[18rem] md:text-right">
                      {l.v}
                    </span>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </div>
      </Section>

      {/* pdpa */}
      <Section tone="paper">
        <div className="shell">
          <div className="grid gap-14 lg:grid-cols-2 lg:gap-20">
            <Reveal>
              <div>
                <Label>PDPA</Label>
                <h2 className="t-h2 balance mt-9 text-ink">
                  ร้านคือผู้ควบคุมข้อมูล เราคือผู้ประมวลผลข้อมูล
                </h2>
                <p className="t-body t-thai pretty mt-8 text-ink-3">
                  ความสัมพันธ์นี้กำหนดทุกอย่าง ร้านเป็นเจ้าของฐาน กำหนดวัตถุประสงค์
                  และเป็นผู้ที่ลูกค้าให้ความยินยอม เราประมวลผลตามคำสั่งของร้าน
                  ภายใต้ข้อตกลงประมวลผลข้อมูล
                </p>
              </div>
            </Reveal>
            <Reveal delay={120}>
              <div className="flex flex-col gap-6">
                {[
                  {
                    t: "แบบฟอร์มความยินยอม",
                    d: "สำหรับจุดขาย ฟอร์ม และ LINE OA โดยแยกวัตถุประสงค์การติดต่อออกจากการตลาด",
                  },
                  {
                    t: "สิทธิของเจ้าของข้อมูล",
                    d: "เข้าถึง แก้ไข ถอนความยินยอม และลบ ทุกคำขอมีเส้นทางผ่านระบบ ไม่ใช่แก้ spreadsheet ด้วยมือ",
                  },
                  {
                    t: "ข้อตกลงประมวลผลข้อมูล",
                    d: "มีให้ทุกแผนรวมถึงแผนฟรี ไม่ได้สงวนไว้เฉพาะองค์กรใหญ่",
                  },
                  {
                    t: "ที่จัดเก็บข้อมูล",
                    d: "ข้อมูลลูกค้าถูกประมวลผลและเก็บในภูมิภาค พร้อมบันทึกว่าผู้ประมวลผลช่วงใดแตะข้อมูลอะไร",
                  },
                ].map((x) => (
                  <Panel key={x.t}>
                    <h3 className="t-h3 text-ink">{x.t}</h3>
                    <p className="t-small t-thai mt-4 text-ink-3">{x.d}</p>
                  </Panel>
                ))}
              </div>
            </Reveal>
          </div>

          <Reveal delay={200}>
            <div className="mt-16 max-w-3xl">
              <Quote>
                ระบบที่ส่งแทนผู้อื่นต้องทำให้การส่งผิดยากกว่าการส่งถูก
                ไม่ใช่เพียงเขียนคำเตือนไว้ในเอกสาร
              </Quote>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* terms */}
      {/* ── คุกกี้ ──────────────────────────────────────────────
          หน้าความเป็นส่วนตัวที่ไม่เอ่ยถึงคุกกี้เลยสักคำ บนผลิตภัณฑ์ที่
          ขายเรื่อง PDPA เป็นช่องว่างที่คนตรวจสอบจะสังเกตก่อนใคร

          และคำตอบที่นี่แข็งแรงพอที่จะพูดออกมาดัง ๆ ได้: มีคุกกี้ตัวเดียว
          ทั้งเว็บ ไม่มีตัววัดพฤติกรรม ไม่มีพิกเซลโฆษณา — จึงไม่มีแถบ
          ขอความยินยอมให้ต้องกดปิด เพราะไม่มีอะไรให้ยินยอม */}
      <Section tone="paper" id="cookies" size="band-sm">
        <div className="shell">
          <div className="grid gap-14 lg:grid-cols-2 lg:gap-20">
            <Reveal>
              <div>
                <Label>คุกกี้</Label>
                <h2 className="t-h2 balance mt-9 text-ink">
                  มีคุกกี้หนึ่งตัว และไม่มีสิ่งใดติดตามคุณ
                </h2>
                <p className="t-body t-thai pretty mt-8 text-ink-3">
                  เว็บไซต์นี้ไม่มีแถบขอความยินยอม เพราะไม่มีระบบวิเคราะห์พฤติกรรม
                  ไม่มีพิกเซลโฆษณา ไม่มีตัวติดตามจากบุคคลที่สาม
                  และไม่มีสิ่งใดติดตามผู้เข้าชมไปยังเว็บไซต์อื่น
                </p>
                <p className="t-small t-thai pretty mt-6 text-ink-4">
                  คุกกี้หนึ่งตัวมีไว้ให้ระบบจำว่ากำลังเปิดบัญชีใด อ่านได้เฉพาะเซิร์ฟเวอร์
                  ไม่อ่านผ่านสคริปต์บนหน้า และเก็บเพียงรหัสบัญชี ไม่เก็บชื่อ เบอร์โทร
                  หรือข้อมูลเกี่ยวกับลูกค้าของร้าน
                </p>
              </div>
            </Reveal>
            <Reveal delay={120}>
              <div className="flex flex-col gap-6">
                {[
                  {
                    t: "parallax_tenant",
                    d: "ระบุว่าระบบกำลังแสดงบัญชีใด เป็นสิ่งจำเป็นที่ระบบขาดไม่ได้",
                  },
                  {
                    t: "เก็บไว้ 30 วัน",
                    d: "จากนั้นหมดอายุเอง การล้างคุกกี้จะพากลับไปบัญชีเริ่มต้นและไม่เปลี่ยนแปลงอย่างอื่น",
                  },
                  {
                    t: "HttpOnly · Secure · SameSite Lax",
                    d: "สคริปต์บนหน้าอ่านไม่ได้ ส่งผ่าน HTTPS เท่านั้น และไม่แนบกับฟอร์มข้ามเว็บไซต์",
                  },
                ].map((c) => (
                  <div key={c.t} className="panel p-7">
                    <p className="t-numeral text-ink">{c.t}</p>
                    <p className="t-small t-thai pretty mt-3 text-ink-3">{c.d}</p>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </div>
      </Section>

      <Section tone="mist" id="terms" size="band-sm">
        <div className="shell">
          <Reveal>
            <div className="grid gap-10 lg:grid-cols-[1fr_2fr] lg:gap-20">
              <div>
                <Label>เอกสารทางกฎหมาย</Label>
              </div>
              <div className="flex flex-col gap-8">
                <p className="t-body t-thai pretty text-ink-2">
                  นโยบายความเป็นส่วนตัว เงื่อนไขการใช้งาน และข้อตกลงประมวลผลข้อมูลฉบับเต็ม
                  อยู่ระหว่างการตรวจทางกฎหมาย และจะเผยแพร่พร้อมเปิดโครงการทดลอง
                </p>
                <Note>
                  ระหว่างนี้เรายินดีส่งร่างทั้งสามฉบับล่วงหน้าให้ผู้ที่กำลังพิจารณาทดลองใช้
                  ติดต่อ{" "}
                  <a
                    href="mailto:privacy@parallax.co.th"
                    className="ulink text-signal"
                  >
                    privacy@parallax.co.th
                  </a>
                </Note>
              </div>
            </div>
          </Reveal>
        </div>
      </Section>

      <NextUp
        items={[
          {
            href: "/platform/learning",
            label: "แพลตฟอร์ม",
            title: "สิ่งใดเรียนรู้ข้ามบัญชี และสิ่งใดไม่ข้ามเด็ดขาด",
          },
          { href: "/platform", label: "แพลตฟอร์ม", title: "ตัวตนและความยินยอม" },
          { href: "/contact", label: "ติดต่อ", title: "ขอรับร่างเอกสาร" },
        ]}
      />

      <CTA />
    </>
  );
}
