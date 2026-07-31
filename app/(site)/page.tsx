import Image from "next/image";
import Link from "next/link";
import {
  ArrowLink,
  CTA,
  Cmd,
  Field,
  Label,
  More,
  Quote,
  Section,
  SignalCard,
  SignalField,
  Metric,
  MetricBand,
  SysBar,
} from "@/components/ui";
import { LineReveal, Numeral, Reveal, Stagger } from "@/components/reveal";
import { BriefMock } from "@/components/brief-mock";
import { Convergence } from "@/components/convergence";

/* เนื้อหาเดินตามเด็คนักลงทุน 16 สไลด์ แต่ย่อเหลือเก้าช่วง
   สองช่วงที่ถูกตัด (From signal to ship · Data moat) พูดซ้ำสิ่งที่
   ช่วงอื่นพูดไปแล้ว จึงยุบประโยคที่ดีที่สุดของแต่ละช่วงเข้าไปแทน
   ที่จะให้ผู้อ่านเลื่อนผ่านอีกสองจอ */

const LEAK = [
  {
    index: "who",
    title: (
      <>
        Same follow-up.
        <br />
        Different customers.
      </>
    ),
    body: "Broad segments flatten the signal that should change the move.",
  },
  {
    index: "when",
    title: (
      <>
        Repeat windows
        <br />
        close quietly.
      </>
    ),
    body: "By the time the dashboard notices, the moment has already moved.",
  },
  {
    index: "proof",
    title: (
      <>
        Revenue happened.
        <br />
        Cause unknown.
      </>
    ),
    body: "“Revenue from the sent group” is a total, not an answer.",
  },
];

const LIVE = [
  {
    index: "recency",
    title: "The next window is moving",
    body: "Every day of silence changes what the right moment looks like.",
  },
  {
    index: "context",
    title: "Each interaction rewrites the best action",
    body: "What worked last cycle is a prior, not an instruction.",
  },
  {
    index: "consent",
    title: "The channel that worked may be gone",
    body: "Permission is state, not a one-time checkbox.",
  },
  {
    index: "outcome",
    title: "Every result should change tomorrow",
    body: "A measured difference is the only honest input to the next decision.",
  },
];

/* กายวิภาคของหนึ่งการตัดสินใจ — เดิมเป็นทั้ง section
   ตอนนี้เป็นแถบเดียวต่อจากบรีฟ เพราะมันคือคำอธิบายของบรีฟ ไม่ใช่หัวข้อใหม่ */
const ANATOMY = [
  { k: "Who", v: "119 high-value customers" },
  { k: "Why now", v: "Repeat window closes in 10 days" },
  { k: "What", v: "Private preview + advisor follow-up" },
  { k: "Proof", v: "Matched holdout at T+90" },
];

const GOVERNANCE = [
  {
    t: "Patterns travel. Identities don’t.",
    d: "Timing, plays and audience shape learn across accounts. Names, numbers and transactions never leave the one they came from.",
    href: "/platform/learning",
  },
  {
    t: "A human approves",
    d: "Every campaign passes a person before it sends, and never opens for regulated categories.",
    href: "/trust",
  },
  {
    t: "Limits that are always set",
    d: "Messages per person per week, quiet hours, and a discount ceiling.",
    href: "/trust",
  },
];

export default function HomePage() {
  return (
    <>
      {/* ── hero — บรีฟอยู่ในจอแรก ไม่ใช่จอที่สาม ───────────── */}
      <header className="relative overflow-hidden pt-32 pb-20 md:pt-40 md:pb-28">
        <SignalField />
        <div className="shell">
          <div className="grid items-center gap-14 lg:grid-cols-[1.06fr_0.94fr] lg:gap-14">
            <div>
              <Reveal>
                <SysBar
                  onDark
                  left="sys / agentic revenue os"
                  right="status / signals live"
                />
              </Reveal>

              <Reveal delay={90}>
                <h1 className="t-display-split mt-9 text-frost">
                  <LineReveal text="Your customer data" />
                  <LineReveal text="has a next move." step={190} />
                </h1>
              </Reveal>

              {/* ── ประโยคที่ต้องอ่านได้ในสิบวินาที ──

                  ประโยคนี้เคยอยู่แต่ใน meta description ซึ่งไม่มีใครเห็น
                  ส่วนบนหน้าจอมีสามชื่อที่ไม่ตรงกัน — title บอกว่า
                  "Agentic Lead Generation & CRM Platform" · description
                  บอกว่า "agentic revenue OS" · H1 ไม่พูดทั้งสองอย่าง
                  คนแปลกหน้าจึงเล่าต่อไม่ได้ว่านี่คืออะไร

                  ตอนนี้เหลือชื่อหมวดเดียว (agentic revenue OS ใน SysBar
                  ข้างบนกับใน description) และคำสัญญาเดียวคือบรรทัดนี้ */}
              <Reveal delay={210}>
                <p className="t-lead pretty mt-8 max-w-lg text-frost/78">
                  Everyone measures cost per lead.{" "}
                  <span className="text-frost">
                    We measure cost per returning customer.
                  </span>
                </p>
              </Reveal>

              <Reveal delay={250}>
                <p className="t-small pretty mt-4 max-w-md text-frost/55">
                  Three decisions before 9AM, each one measured against what
                  would have happened anyway.
                </p>
              </Reveal>

              <Reveal delay={280}>
                <div className="mt-8 flex flex-wrap items-center gap-2.5">
                  <Cmd hot>decide</Cmd>
                  <Cmd>act</Cmd>
                  <Cmd>prove</Cmd>
                </div>
              </Reveal>

              {/* ── ปุ่มเดียวที่เป็นหลัก และตอนนี้มันคือคอนโซล ──

                  เดิมหน้านี้มี CTA เก้าปุ่มหกข้อความ ถามหกอย่างพร้อมกัน
                  จึงไม่ได้ถามอะไรเลย ที่เหลือลดเป็นลิงก์ข้อความ

                  ปุ่มหลักเคยเป็น "Start a pilot" ซึ่งเหมาะกับตอนมีลูกค้าแล้ว
                  ตอนนี้ยังไม่มีสักราย ทุกคนที่มาถึงจึงมาแบบเย็นสนิทและยัง
                  ไม่มีเหตุผลจะคุยกับเรา แต่มีเหตุผลจะลอง

                  และคอนโซลคือสิ่งเดียวบนเว็บนี้ที่ไม่ใช่คำพูด — ที่เหลือ
                  ทั้งหมดคือการอ้าง กดเข้าไปแล้วเห็นของทำงานจริงมีน้ำหนัก
                  กว่าอีกสามหมื่นคำที่เขียนไว้ */}
              <Reveal delay={350}>
                <div className="mt-10 flex flex-wrap items-center gap-x-7 gap-y-4">
                  <Link href="/app" className="btn btn-frost">
                    Open the live console
                  </Link>
                  <ArrowLink href="/contact" onDark>
                    Start a pilot
                  </ArrowLink>
                </div>
                <p className="t-small mt-6 max-w-md text-frost/55">
                  Four businesses, real calculations, no signup. Day one runs on
                  the POS export you already have.
                </p>
              </Reveal>
            </div>

            <Reveal delay={180} dir="scale">
              <div className="relative">
                <div
                  className="absolute -inset-10 -z-10 rounded-full bg-[radial-gradient(circle_at_55%_45%,rgba(98,231,255,0.22),transparent_68%)] blur-3xl"
                  aria-hidden
                />
                <BriefMock compact />
              </div>
            </Reveal>
          </div>
        </div>
      </header>

      {/* ── กายวิภาคของหนึ่งการตัดสินใจ ───────────────────── */}
      <Section tone="paper" size="band-sm">
        <div className="shell">
          <Reveal>
            <SysBar left="anatomy of one move" right="decision ≠ recommendation" />
          </Reveal>
          <Reveal delay={80}>
            <dl className="mt-9 grid gap-px border border-line bg-line md:grid-cols-2 xl:grid-cols-4">
              {ANATOMY.map((d) => (
                <div key={d.k} className="bg-paper p-6">
                  <dt className="t-label text-ink-4">{d.k}</dt>
                  <dd className="t-h3 mt-3.5 text-ink">{d.v}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
          <Reveal delay={140}>
            <p className="t-body measure mt-8 text-ink-3">
              You make the call. PARALLAX does the prep — the cohort, the copy,
              the held-back group, and the arithmetic that says whether it worked.
            </p>
          </Reveal>
        </div>
      </Section>

      {/* ── market numbers ─────────────────────────────────── */}
      <section className="surface-paper relative">
        <div className="shell">
          <Reveal>
            <MetricBand
              items={[
                {
                  value: "7,024",
                  label: "Thai businesses closed",
                  sub: "First half of 2026",
                },
                {
                  value: "12.49%",
                  label: "Growth in the closure rate",
                  sub: "Year over year",
                },
                {
                  value: "44,773",
                  label: "New registrations",
                  sub: "Same period",
                },
                {
                  value: "6×",
                  label: "Deaths accelerating faster than births",
                  sub: "By growth rate",
                },
              ]}
            />
          </Reveal>
        </div>
      </section>

      {/* ── the revenue leak ───────────────────────────────── */}
      <Section tone="paper">
        <div className="shell">
          <Reveal>
            <Label>The revenue leak</Label>
          </Reveal>
          <Reveal delay={80}>
            <h2 className="t-h1 balance mt-8 max-w-3xl text-ink">
              <LineReveal text="The data is there." />
              <span className="text-signal">
                <LineReveal text="The decision isn’t." step={200} />
              </span>
            </h2>
          </Reveal>

          <Stagger step={90} className="mt-14 grid gap-10 md:grid-cols-3">
            {LEAK.map((x) => (
              <SignalCard
                key={x.index}
                index={x.index}
                title={x.title}
                body={x.body}
              />
            ))}
          </Stagger>

          <Reveal delay={180}>
            <div className="mt-14 max-w-3xl">
              <Quote>Miss the signal today. Pay to reacquire it tomorrow.</Quote>
              {/* ทางเข้าเดียวของ /problem จากเนื้อหา — หน้านั้นขยายสามข้อ
                  ข้างบนนี้ให้เต็ม และเดิมเข้าถึงไม่ได้เลยนอกจากพิมพ์ URL */}
              <div className="mt-9">
                <ArrowLink href="/problem">
                  The three ways a standing business loses
                </ArrowLink>
              </div>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* ── why agentic — แถบเข้มที่หนึ่งจากสอง ─────────────── */}
      <Section tone="dark" className="overflow-hidden">
        <Field variant="deep" />
        <div className="shell">
          <div className="grid gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
            <Reveal dir="left">
              <div className="lg:sticky lg:top-28">
                <Label onDark>Why agentic, why now</Label>
                {/* จังหวะยาว — ตัดสร้อยสองจังหวะที่ใช้ซ้ำทั้งหน้า */}
                <h2 className="t-h2 balance mt-8 text-frost">
                  A rule written last quarter is a photograph of a customer who
                  has already moved.
                </h2>
                <p className="t-body measure mt-8 text-frost/62">
                  These four inputs change while you sleep. Nothing written down
                  in advance keeps up with all of them.
                </p>
                <p className="t-label mt-10 text-cyan/60">
                  observe → decide → act → learn
                </p>
              </div>
            </Reveal>

            <Stagger step={90} dir="right" className="flex flex-col gap-9">
              {LIVE.map((x) => (
                <SignalCard
                  key={x.index}
                  onDark
                  index={x.index}
                  title={x.title}
                  body={x.body}
                  status="live"
                />
              ))}
            </Stagger>
          </div>
        </div>
      </Section>

      {/* ── the thesis — เวทีของมันเอง ไม่มี body copy ─────── */}
      <section className="surface-paper relative overflow-hidden">
        <div className="shell pt-28 text-center md:pt-36">
          <Reveal>
            <Label className="justify-center">The name</Label>
          </Reveal>
          <Reveal delay={90}>
            <p className="t-display balance mx-auto mt-9 max-w-4xl text-ink">
              <LineReveal text="Two views." />
              <span className="text-signal">
                <LineReveal text="One true distance." step={220} />
              </span>
            </p>
          </Reveal>
        </div>
        <Reveal delay={140} dir="scale">
          <Convergence className="mx-auto -mb-1 w-full max-w-6xl" />
        </Reveal>
      </section>

      {/* ── proof layer — แถบเข้มที่สอง ────────────────────── */}
      <Section tone="dark" className="overflow-hidden">
        <Field variant="deep" />
        <div className="shell">
          <Reveal>
            <Label onDark>Proof layer</Label>
          </Reveal>
          <Reveal delay={80}>
            <h2 className="t-h1 balance mt-8 max-w-3xl text-frost">
              Revenue happened.
              <br />
              <span className="text-cyan">Did we cause it?</span>
            </h2>
          </Reveal>

          <Reveal delay={150}>
            <div className="mt-14 grid gap-px border border-cyan/15 bg-cyan/15 md:grid-cols-[1fr_1fr_1.1fr]">
              <div className="bg-abyss/80 p-8 backdrop-blur-xl">
                <p className="t-label text-frost/50">a / sent group return</p>
                <p className="t-numeral-lg mt-5 text-frost">
                  <Numeral value="24%" />
                </p>
                <p className="t-small measure mt-4 text-frost/58">
                  Observed return after the intervention.
                </p>
              </div>
              <div className="bg-abyss/80 p-8 backdrop-blur-xl">
                <p className="t-label text-frost/50">
                  b / expected holdout return
                </p>
                <p className="t-numeral-lg mt-5 text-frost/70">
                  <Numeral value="15%" />
                </p>
                <p className="t-small measure mt-4 text-frost/58">
                  What likely would have happened anyway.
                </p>
              </div>
              <div className="bg-signal/16 p-8 backdrop-blur-xl">
                <p className="t-label text-cyan">δ / the number we report</p>
                <p className="t-numeral-lg mt-5 text-cyan">
                  <Numeral value="9" />
                  <span className="t-h3"> pts</span>
                </p>
                <p className="t-small measure mt-4 text-frost/70">
                  Incremental customers → cost per incremental return.
                </p>
              </div>
            </div>
          </Reveal>

          <Reveal delay={220}>
            <div className="mt-10">
              <ArrowLink href="/platform/proof" onDark>
                How the measurement works
              </ArrowLink>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* ── validation ─────────────────────────────────────── */}
      <Section tone="paper">
        <div className="shell">
          <Reveal>
            <Label>Validated on real data · MST Golf</Label>
          </Reveal>
          <div className="mt-8 grid gap-14 lg:grid-cols-2 lg:gap-20">
            <Reveal dir="left">
              <div>
                <h2 className="t-h2 balance text-ink">
                  One file. 967 next-best actions.
                </h2>
                <p className="t-body measure mt-7 text-ink-3">
                  Single-location golf retail — wrong ICP by every textbook, and
                  the engine still worked.
                </p>
                <More label="why that matters">
                  It is the evidence that the filter should be revenue-cycle
                  shape rather than industry label. Actionability is validated;
                  incremental lift is next to prove, and we will not claim it
                  before the holdout matures.
                </More>
                <div className="mt-9">
                  <ArrowLink href="/playbook">See every number</ArrowLink>
                </div>
              </div>
            </Reveal>

            <Reveal delay={140} dir="right">
              <div className="grid grid-cols-2 gap-px border border-line bg-line">
                {[
                  ["967", "Customers ranked", "From a single export"],
                  ["78%", "Usable identity coverage", undefined],
                  ["1,240", "Purchase records ingested", undefined],
                  ["119", "High-value return", undefined],
                ].map(([v, l, sub]) => (
                  <div key={l} className="bg-paper p-7">
                    <Metric value={v!} label={l!} sub={sub} />
                  </div>
                ))}
              </div>
            </Reveal>
          </div>

          <Reveal delay={200}>
            <div className="mt-14 overflow-hidden border border-line">
              <Image
                src="/img/agentic-revenue-console.jpg"
                alt="The Morning Brief as rendered in the PARALLAX console"
                width={1672}
                height={941}
                sizes="(min-width: 1024px) 76vw, 100vw"
                className="h-auto w-full"
              />
            </div>
          </Reveal>
        </div>
      </Section>

      {/* ── governance — ดูดคูเมืองข้อมูลเข้ามาเป็นใบแรก ───── */}
      <Section tone="mist" size="band-sm">
        <div className="shell">
          <Reveal>
            <SysBar left="governance" right="always on" />
          </Reveal>
          <Stagger step={90} className="mt-10 grid gap-10 md:grid-cols-3">
            {GOVERNANCE.map((x) => (
              <div key={x.t} className="border-t border-line pt-7">
                <h3 className="t-h3 text-ink">{x.t}</h3>
                <p className="t-small measure mt-4 text-ink-3">{x.d}</p>
                <div className="mt-5">
                  <ArrowLink href={x.href}>Read more</ArrowLink>
                </div>
              </div>
            ))}
          </Stagger>
        </div>
      </Section>

      <CTA
        title="Start from the export you already have."
        body="One file, one brief, one proof design. Nothing to install."
      />
    </>
  );
}
