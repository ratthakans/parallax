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
  Steps,
} from "@/components/ui";
import { Reveal } from "@/components/reveal";
import { BriefMock } from "@/components/brief-mock";

export const metadata: Metadata = {
  title: "Keep — who returns, and when",
  description:
    "Cohorts drawn from each customer's own cycle, offers matched to what already responded, and copy drafted ready to approve.",
};

const STEPS = [
  {
    t: "Automatic cohorts",
    d: "RFM plus a per-person cycle. No blanket “quiet for 90 days” rule — coffee and golf clubs differ by an order of magnitude.",
    extra: "Thresholds come from that customer's own behaviour, never an industry average.",
  },
  {
    t: "Opportunity map",
    d: "Two axes, closeness × value. High value and drifting away always ranks first.",
  },
  {
    t: "Offer matching",
    d: "What each cohort should get, chosen from what that cohort already responded to — not from the biggest discount available.",
    extra: "Top customers respond to status and access, not price — discounting them is margin thrown away.",
  },
  {
    t: "Draft and send",
    d: "Copy arrives drafted with a choice of tone. Approve and it sends — ten seconds to read.",
  },
  {
    t: "Into the Proof layer",
    d: "Every campaign enters measurement under a rule chosen by cohort size, and what it measures becomes the selection criterion next cycle.",
  },
];

const SEGMENTS = [
  { name: "Champions", d: "Frequent, recent, and always at full price", act: "Give status and early access, never a discount" },
  { name: "High value, drifting", d: "Strong history, now past their own cycle length", act: "Pull them back before the window shuts" },
  { name: "Anchor bought, attachment missing", d: "They bought the big item but none of what usually follows", act: "Attach from behaviour seen across the same cycle" },
  { name: "Paid for service, bought no product", d: "They paid for the service but never closed on the product", act: "The shortest path to the high-margin item" },
  { name: "Silent past twice their own cycle", d: "Not a flat 90 days — measured against that person's cycle", act: "Reactivate with what they already bought" },
  { name: "Discount-driven", d: "Buys only on promotion, high discounted share", act: "Keep them out of the REACH seed" },
];

export default function KeepPage() {
  return (
    <>
      <PageHero
        label="Platform · Keep"
        title="The base you already have is the cheapest channel, and the one everyone abandons"
        lead="Someone who has already bought costs a fraction of a stranger to sell to again. KEEP is the side that makes that base work — and the side that knows which customers actually return."
      />

      <Section tone="paper">
        <div className="shell">
          <Reveal>
            <Label>Five steps</Label>
          </Reveal>
          <Reveal delay={80}>
            <div className="mt-12">
              <Steps items={STEPS} />
            </div>
          </Reveal>
        </div>
      </Section>

      {/* segments */}
      <Section tone="mist">
        <div className="shell">
          <Reveal>
            <Label>Cohorts the system returns</Label>
          </Reveal>
          <Reveal delay={70}>
            <h2 className="t-h2 balance mt-9 max-w-3xl text-ink">
              Not cohorts named in advance — cohorts that surface from that shop’s own data
            </h2>
          </Reveal>

          <div className="mt-14 grid gap-px bg-line md:grid-cols-2 lg:grid-cols-3">
            {SEGMENTS.map((s, i) => (
              <Reveal key={s.name} delay={i * 60}>
                <div className="flex h-full flex-col gap-5 bg-paper p-8">
                  <h3 className="t-h3 text-ink">{s.name}</h3>
                  <p className="t-small t-thai text-ink-3">{s.d}</p>
                  <p className="t-small t-thai mt-auto border-t border-line pt-5 text-signal">
                    {s.act}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={220}>
            <div className="mt-12">
              <Note>
                The last cohort matters as much as the first — people who only buy on
              discount should never be the template for finding new customers,
              because you will get a flood of exactly the same behaviour back.
              </Note>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* the surface */}
      <Section tone="dark" className="overflow-hidden">
        <div className="shell">
          <div className="grid gap-16 lg:grid-cols-[0.75fr_1.25fr] lg:gap-20">
            <Reveal>
              <div>
                <Label onDark>
                  What the owner actually sees
                </Label>
                <h2 className="t-h2 balance mt-9 text-frost">
                  The whole of KEEP, compressed into three lines a day
                </h2>
                <p className="t-body t-thai pretty mt-8 text-frost/66">
                  The owner never needs to know what RFM is, never opens a report, never
                learns an interface. They need to know who to contact today, about
                what, and what it is expected to return.
                </p>
                <div className="mt-12">
                  <Quote onDark>
                    165 existing customers are about to go quiet this month
                  </Quote>
                </div>
              </div>
            </Reveal>
            <Reveal delay={140}>
              <BriefMock />
            </Reveal>
          </div>
        </div>
      </Section>

      {/* channel */}
      <Section tone="paper" size="band-sm">
        <div className="shell">
          <div className="grid gap-8 md:grid-cols-3">
            {[
              {
                t: "LINE as the primary channel",
                d: "Individually or as a group, every send bound by the per-person weekly cap and quiet hours.",
              },
              {
                t: "Cycle automation",
                d: "Service due dates, membership expiry, a course down to its last session — set once, runs continuously.",
              },
              {
                t: "Three tones to choose from",
                d: "Copy always arrives in three tones, so the owner picks the voice that sounds like their shop — not like an AI.",
              },
            ].map((x, i) => (
              <Reveal key={x.t} delay={i * 80}>
                <Panel className="h-full">
                  <h3 className="t-h3 text-ink">{x.t}</h3>
                  <p className="t-small t-thai mt-5 text-ink-3">{x.d}</p>
                </Panel>
              </Reveal>
            ))}
          </div>
        </div>
      </Section>

      <NextUp
        items={[
          { href: "/platform/reach", label: "The other side", title: "Reach" },
          { href: "/platform/proof", label: "The measuring layer", title: "Proof" },
          { href: "/playbook", label: "Real data", title: "Validation — MST Golf" },
        ]}
      />

      <CTA />
    </>
  );
}
