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
  title: "What you get",
  description:
    "The Morning Brief is the product — three moves, ten seconds, every morning. Everything else is the engine that gives it something to say.",
};

const NAMES = [
  { n: "Morning Brief", d: "The product surface. Three moves, ten seconds, daily", href: "#brief" },
  { n: "Keep", d: "The side that works the base you already have", href: "/platform/keep" },
  { n: "Reach", d: "The side that finds new customers from a proven signature", href: "/platform/reach" },
  { n: "Proof", d: "The layer that measures the difference — and makes churn hard", href: "/platform/proof" },
];

const FEATURES: {
  group: string;
  question: string;
  items: string[];
}[] = [
  {
    group: "Ingest",
    question: "“The data is scattered — do I need to hire someone?”",
    items: [
      "Drag and drop — CSV or Excel from any POS",
      "Headers read automatically, meaning inferred, rows cleaned",
      "Mail the report to a system address for automatic updates",
      "Native API for partner POS platforms",
    ],
  },
  {
    group: "Identity",
    question: "“Is sending this even legal?”",
    items: [
      "Identity resolved across POS, marketplace, LINE and forms",
      "A consent ledger bound to the identity, auditable after the fact",
      "Masked before processing",
      "Point-of-sale capture for shops whose receipts aren't tied to people yet",
    ],
  },
  {
    group: "Understanding",
    question: "“Who should I contact first?”",
    items: [
      "Per-person RFM computed against that customer's own cycle",
      "Churn risk scored against their own normal behaviour",
      "Price tier and discount sensitivity",
      "Opportunity map — closeness × value",
    ],
  },
  {
    group: "Keep",
    question: "“I have no time to think up campaigns.”",
    items: [
      "Morning Brief — three moves for today",
      "Campaigns arrive drafted, in three tones",
      "LINE, individually or as a group",
      "Cycle automation — due dates and expiry",
    ],
  },
  {
    group: "Reach",
    question: "“Ads only bring me one-time buyers.”",
    items: [
      "A signature extracted from full-price repeat buyers",
      "Hashed audience sync to Meta, TikTok and Google",
      "Three ad drafts and a landing page",
      "Leads scored on arrival, then handed to KEEP",
    ],
  },
  {
    group: "Proof",
    question: "“Is the software actually paying for itself?”",
    items: [
      "Holdouts whose method follows the cohort size",
      "ROI tracker — 90-day rolling average with a confidence interval",
      "Cost per returning customer",
      "A plain “not enough to conclude” while the data is unsettled",
    ],
  },
];

export default function ProductPage() {
  return (
    <>
      <PageHero
        label="What you get"
        title="The product is one screen. Everything else is the engine that gives it something to say."
        lead="KEEP and REACH are internal names. What the owner opens every morning is the Brief — and they never need to know what sits underneath it."
      />

      {/* naming system */}
      <Section tone="paper">
        <div className="shell">
          <Reveal>
            <Label>How the product is named</Label>
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
                The Brief is the product; everything else is the engine. When a customer
                stops opening it they are about to cancel — the best early warning
                signal we have.
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
                <Label tone="light">
                  The product surface
                </Label>
                <h2 className="t-h1 balance mt-9 text-frost">Morning Brief</h2>
                <p className="t-lead t-thai mt-8 text-frost/70">
                  Three moves. Ten seconds. Every morning.
                </p>
                <div className="mt-10 flex flex-col gap-6">
                  {[
                    ["Why three", "Because ten is the same as none. The system takes the top three from the opportunity map and holds the rest for the next cycle."],
                    ["Why ten seconds", "Because owners are not idle. What has to be read is who, how many, why now, and what it should return."],
                    ["Why approval", "Because trust is built by keeping a person in control. Autopilot comes later, and only for templates a human has already cleared."],
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
            <Label>Every feature</Label>
          </Reveal>
          <Reveal delay={70}>
            <h2 className="t-h2 balance mt-9 max-w-3xl text-ink">
              Every feature answers one question an owner actually asks — not an IT requirement
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
                Build order — Identity and the Morning Brief ship first. Everything else
                sits downstream of those two.
              </Quote>
              <ArrowLink href="/pricing">See which tier each feature sits in</ArrowLink>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* onboarding */}
      <Section tone="mist">
        <div className="shell">
          <Reveal>
            <Label>Day one</Label>
          </Reveal>
          <Reveal delay={70}>
            <h2 className="t-h2 balance mt-9 max-w-3xl text-ink">
              Drop the file, see something worth acting on in three minutes
            </h2>
          </Reveal>

          <div className="mt-14 grid gap-8 md:grid-cols-3">
            {[
              {
                t: "Minute 0",
                d: "Export sales history from the POS as CSV or Excel and drop it in. No column tidying, no deleting blank rows.",
              },
              {
                t: "Minute 1",
                d: "Headers are read and mapped to date, amount, product and customer identifier — you only confirm what it got wrong.",
              },
              {
                t: "Minute 3",
                d: "The base is segmented, you can see how many are about to go quiet, and the first Morning Brief is waiting.",
              },
            ].map((x, i) => (
              <Reveal key={x.t} delay={i * 80}>
                <Panel className="h-full">
                  <p className="t-label text-signal">{x.t}</p>
                  <More label="detail">{x.d}</More>
                </Panel>
              </Reveal>
            ))}
          </div>

          <Reveal delay={240}>
            <div className="mt-12">
              <Note>
                The only requirement — at least six months of purchase history, and at
              least one way to identify a customer: phone, email or member ID.
              </Note>
            </div>
          </Reveal>
        </div>
      </Section>

      <NextUp
        items={[
          { href: "/platform", label: "Platform", title: "The five layers behind that one screen" },
          { href: "/pricing", label: "Pricing", title: "Four tiers and what each includes" },
          { href: "/playbook", label: "Validation", title: "The result on real data" },
          { href: "/app", label: "Console", title: "Open the console" },
        ]}
      />

      <CTA />
    </>
  );
}
