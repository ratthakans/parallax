import type { Metadata } from "next";
import {
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
  Metric,
} from "@/components/ui";
import { Reveal } from "@/components/reveal";
import { PriorLadder } from "@/components/specimen";

export const metadata: Metadata = {
  title: "Shared intelligence",
  description:
    "One shop cannot learn from itself, so signatures are trained at the revenue-cycle level and adapted per account — which is why account 200 starts ahead of account 10.",
};

const FUNNEL = [
  { k: "Monthly ad spend", v: "฿20,000" },
  { k: "Leads generated", v: "~150" },
  { k: "Closed", v: "15" },
  { k: "Repeat within 90 days", v: "4" },
];

const SHARED = [
  "Which offer works at which length of silence",
  "The timing that gets the highest reply rate in this cycle",
  "Which audience shapes return one-time buyers",
  "The message sequence that reaches a second purchase",
];

const NEVER = [
  "Names, phone numbers and emails of individual customers",
  "Line-level purchase history",
  "The membership of any one shop's cohort or audience",
  "That shop's revenue and margin",
];

export default function LearningPage() {
  return (
    <>
      <PageHero
        label="Platform · Shared intelligence"
        title="One shop cannot learn from itself. Start by admitting that."
        lead="This is the half of the name that earns its meaning, and the part to get right early — because it changes both how we sell and the order we enter markets."
      />

      {/* the constraint */}
      <Section tone="paper">
        <div className="shell">
          <div className="grid gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
            <Reveal>
              <div>
                <Label>The limit to accept first</Label>
                <h2 className="t-h2 balance mt-9 text-ink">
                  Nobody concludes anything from a sample of four
                </h2>
                <More label="detail">This is the real funnel of a mid-sized shop already
              running ads. Split it into three test arms and each is left with a
              single-digit sample. No statistical method rescues that
                </More>
              </div>
            </Reveal>

            <Reveal delay={120}>
              <div>
                <ol className="flex flex-col">
                  {FUNNEL.map((f, i) => (
                    <li
                      key={f.k}
                      className={`flex items-baseline justify-between gap-6 border-t py-7 ${
                        i === FUNNEL.length - 1
                          ? "border-t-signal/35 border-b border-b-signal/35"
                          : "border-line"
                      }`}
                    >
                      <span
                        className={`t-body t-thai ${
                          i === FUNNEL.length - 1 ? "text-signal" : "text-ink-2"
                        }`}
                      >
                        {f.k}
                      </span>
                      <span
                        className={`t-numeral t-h2 ${
                          i === FUNNEL.length - 1 ? "text-signal" : "text-ink"
                        }`}
                      >
                        {f.v}
                      </span>
                    </li>
                  ))}
                </ol>
                <p className="t-small t-thai mt-6 text-ink-3">
                  Illustrative figures based on a typical SME ad funnel, not measured from
              any single customer.
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </Section>

      {/* the answer */}
      <Section tone="dark" className="overflow-hidden">
        <Field variant="deep" />
        <div className="shell">
          <Reveal>
            <Label tone="light">
              The way out
            </Label>
          </Reveal>
          <Reveal delay={70}>
            <h2 className="t-h1 balance mt-9 max-w-4xl text-frost">
              Learn at the cycle level, not the shop level
            </h2>
          </Reveal>
          <Reveal delay={130}>
            <p className="t-lead t-thai pretty mt-9 max-w-2xl text-frost/70">
              Forty golf retailers together have enough data. Sixty aesthetic clinics
                together have enough data. Signatures are trained at the revenue-cycle
                level, then adapted to each individual shop.
            </p>
          </Reveal>

          <div className="mt-16 grid gap-8 lg:grid-cols-2">
            <Reveal delay={80}>
              <div className="panel-dark h-full p-8 md:p-10">
                <p className="t-label text-cyan/70">what crosses accounts</p>
                <ul className="mt-8 flex flex-col gap-5">
                  {SHARED.map((s) => (
                    <li
                      key={s}
                      className="t-body t-thai flex gap-4 text-frost/70"
                    >
                      <span
                        className="mt-[0.75em] h-px w-4 shrink-0 bg-cyan/50"
                        aria-hidden
                      />
                      {s}
                    </li>
                  ))}
                </ul>
                <p className="t-small t-thai mt-9 border-t border-cyan/12 pt-6 text-frost/52">
                  All statistical patterns, never any individual’s data
                </p>
              </div>
            </Reveal>

            <Reveal delay={150}>
              <div className="panel-dark h-full p-8 md:p-10">
                <p className="t-label text-frost/58">what never crosses</p>
                <ul className="mt-8 flex flex-col gap-5">
                  {NEVER.map((s) => (
                    <li
                      key={s}
                      className="t-body t-thai flex gap-4 text-frost/70"
                    >
                      <span
                        className="mt-[0.75em] h-px w-4 shrink-0 bg-frost/25"
                        aria-hidden
                      />
                      {s}
                    </li>
                  ))}
                </ul>
                <p className="t-small t-thai mt-9 border-t border-cyan/12 pt-6 text-frost/52">
                  All of it stays inside that shop’s account
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </Section>

      {/* business consequence */}
      <Section tone="mist">
        <div className="shell">
          <Reveal>
            <Label>What this structure means commercially</Label>
          </Reveal>
          <Reveal delay={70}>
            <h2 className="t-h2 balance mt-9 max-w-3xl text-ink">
              The more accounts in a cycle, the better every new account in that cycle starts
            </h2>
          </Reveal>

          {/* หน้านี้อธิบายว่าบัญชีที่ 200 เริ่มเก่งกว่าบัญชีที่ 10
              ด้วยคำพูดล้วน — วาดให้เห็นว่าเก่งกว่าเท่าไร */}
          <Reveal delay={130}>
            <div className="mt-14 max-w-2xl">
              <PriorLadder />
            </div>
          </Reveal>

          <Reveal delay={140}>
            <div className="mt-16 grid grid-cols-2 gap-x-8 gap-y-12 border-t border-line pt-12 md:grid-cols-4">
              <Metric value="200" label="The 200th account" sub="Outperforms the 10th" />
              <Metric value="40" label="Accounts per cycle" sub="Where signatures become measurable" />
              <Metric value="0" label="Individual rows crossing accounts" sub="By construction, not by policy" />
              <Metric value="1" label="Cycle entered at a time" sub="Before opening the next" />
            </div>
          </Reveal>

          <Reveal delay={200}>
            <div className="mt-16 grid gap-8 lg:grid-cols-3">
              {[
                {
                  t: "A later entrant starts accumulating from zero",
                  d: "Cycle-level signatures cannot be bought. They only come from real usage — the same is true of the identity graph.",
                },
                {
                  t: "So go deep one cycle at a time, never broad across industries",
                  d: "Forty accounts in one cycle are worth more than forty spread across four — which is why we turn down deals outside the cycle we are working.",
                },
                {
                  t: "And why we don’t discount to win volume",
                  d: "An account in the wrong cycle adds no value to the system — only support cost and diluted focus.",
                },
              ].map((x, i) => (
                <Panel key={x.t} className="h-full">
                  <span className="marker-num">0{i + 1}</span>
                  <h3 className="t-h3 mt-4 text-ink">{x.t}</h3>
                  <p className="t-small t-thai mt-5 text-ink-3">{x.d}</p>
                </Panel>
              ))}
            </div>
          </Reveal>

          <Reveal delay={240}>
            <div className="mt-14 max-w-3xl">
              <Quote>
                This is the real network effect — not more users making it livelier, but
              more users making it more accurate.
              </Quote>
            </div>
          </Reveal>

          <Reveal delay={280}>
            <div className="mt-12">
              <Note>
                Any account can opt out of cycle-level training without losing access to a
              single feature. Participation is a default you can switch off, never a
              condition of service.
              </Note>
            </div>
          </Reveal>
        </div>
      </Section>

      <NextUp
        items={[
          { href: "/customers", label: "Customers", title: "Cycles we take" },
          { href: "/trust", label: "Governance", title: "Privacy and PDPA" },
          { href: "/investors", label: "Investors", title: "Why this structure is the moat" },
        ]}
      />

      <CTA />
    </>
  );
}
