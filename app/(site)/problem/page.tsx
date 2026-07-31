import type { Metadata } from "next";
import {
  ArrowLink,
  CTA,
  Label,
  NextUp,
  Note,
  PageHero,
  Quote,
  Section,
} from "@/components/ui";
import { Reveal } from "@/components/reveal";

export const metadata: Metadata = {
  title: "The problem",
  description:
    "7,024 Thai businesses closed in the first half of 2026, a 12.49% rise. The ones still standing lose to quiet revenue leaks, data that expires faster than they think, and fixed costs they cannot carry.",
};

const LOSSES = [
  {
    n: "01",
    t: "The quiet leak",
    d: "Paying for new customers every month while the existing base sits untouched — someone who already bought costs a fraction to sell to again.",
    tell: "Nobody in the shop can say how many existing customers are about to go quiet this month",
  },
  {
    n: "02",
    t: "Data expires faster than you think",
    d: "Someone who bought yesterday and someone who bought four months ago are different people. In the POS they are identical rows.",
    tell: "A sales report says what you sold. It never says who is not coming back",
  },
  {
    n: "03",
    t: "Fixed costs that no longer carry",
    d: "฿35,000–60,000 a month for a creative or an agency, then five to seven days for a campaign — too slow for behaviour that shifts weekly.",
    tell: "By the time the campaign ships, the moment to reach out has passed",
  },
];

const FORCES = [
  {
    t: "The cost migration",
    d: "Businesses have not stopped marketing. They moved from fixed payroll in the tens of thousands to variable software in the low thousands.",
    why: "Arrive now and you replace an existing budget line instead of creating one",
  },
  {
    t: "The metric migration",
    d: "From traffic to cash flow",
    why: "Nobody pays for footfall alone any more",
  },
  {
    t: "The local martech gap",
    d: "Global platforms cannot connect to Thai POS. The Thai systems that exist stop at the reporting screen.",
    why: "Nobody is standing in the middle",
  },
  {
    t: "Rising data walls",
    d: "Platforms close off buyer data a little more each year, while AI costs have fallen far enough that writing copy is effectively free.",
    why: "Value moves from producing content to owning the direct relationship",
  },
];

export default function ProblemPage() {
  return (
    <>
      <PageHero
        label="The problem"
        title="The businesses still standing lose to these three things, not to their product"
        lead="7,024 Thai businesses closed in the first half of 2026, up 12.49%. Over the same period 44,773 registered, up 2.13% — deaths accelerating six times faster than births."
        meta={[
          { k: "Closed", v: "7,024" },
          { k: "Growth", v: "12.49%" },
          { k: "Registered", v: "44,773" },
          { k: "Growth", v: "2.13%" },
        ]}
      />

      {/* three losses */}
      <Section tone="paper">
        <div className="shell">
          <Reveal>
            <Label>Three ways they lose</Label>
          </Reveal>

          <div className="mt-14 flex flex-col">
            {LOSSES.map((l, i) => (
              <Reveal key={l.n} delay={i * 90}>
                <article className="grid gap-6 border-t border-line py-12 lg:grid-cols-[auto_1fr_1fr] lg:gap-14">
                  <span className="marker-num lg:pt-2">{l.n}</span>
                  <h2 className="t-h2 balance text-ink">{l.t}</h2>
                  <div>
                    <p className="t-body t-thai pretty text-ink-2">{l.d}</p>
                    <p className="t-small t-thai mt-6 border-l border-signal/35 pl-5 text-ink-3">
                      The tell — {l.tell}
                    </p>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </Section>

      {/* the numbers, again with weight */}
      <Section tone="dark" className="overflow-hidden">
        <div className="shell">
          <Reveal>
            <Label onDark>
              The confirmed numbers
            </Label>
          </Reveal>
          <Reveal delay={80}>
            <h2 className="t-h2 balance mt-9 max-w-3xl text-frost">
              Not a slowdown — a shift that makes the customer base the most valuable asset in the shop
            </h2>
          </Reveal>
          <Reveal delay={140}>
            <div className="mt-14 grid gap-10 border-t border-cyan/15 pt-12 lg:grid-cols-2 lg:gap-20">
              <p className="t-lead t-thai pretty text-frost/70">
                With acquisition getting more expensive every quarter, the base that has
                already bought is the one asset whose price does not track the ad
                market — and almost every shop treats it as sales history.
              </p>
              <div className="flex flex-col gap-8">
                <Quote onDark>
                  A sales report tells you what yesterday earned. No report tells you who
                will not return tomorrow.
                </Quote>
                <Note onDark>
                  Source — Department of Business Development, first half of 2026
                </Note>
              </div>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* forces */}
      <Section tone="paper">
        <div className="shell">
          <Reveal>
            <Label>Forces reshaping the market</Label>
          </Reveal>
          <Reveal delay={70}>
            <h2 className="t-h2 balance mt-9 max-w-3xl text-ink">
              Four forces that open the window for a tool like this, now
            </h2>
          </Reveal>

          <div className="mt-16 grid gap-px bg-line md:grid-cols-2">
            {FORCES.map((f, i) => (
              <Reveal key={f.t} delay={i * 70}>
                <div className="flex h-full flex-col gap-6 bg-paper p-8 md:p-10">
                  <h3 className="t-h3 text-ink">{f.t}</h3>
                  <p className="t-body t-thai pretty text-ink-3">{f.d}</p>
                  <p className="t-small t-thai mt-auto border-t border-line pt-6 text-signal">
                    {f.why}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </Section>

      {/* positioning */}
      <Section tone="mist">
        <div className="shell">
          <div className="grid gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
            <Reveal>
              <div>
                <Label>Category and position</Label>
                <h2 className="t-h2 balance mt-9 text-ink">
                  Nobody is standing in the middle
                </h2>
                <p className="t-body t-thai pretty mt-8 max-w-md text-ink-3">
                  The revenue path has three stages. The first two already have very strong
                owners, and nobody wants to fight them. The third carries the highest
                margin, because you never pay media to reach someone who already bought.
                </p>
                <div className="mt-10">
                  <ArrowLink href="/platform">See the architecture that stands there</ArrowLink>
                </div>
              </div>
            </Reveal>

            <Reveal delay={120}>
              <div className="scroll-x">
                <table className="dtable min-w-[30rem]">
                  <thead>
                    <tr>
                      <th>Stage</th>
                      <th>Current owner</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="text-ink">Find</td>
                      <td className="text-ink-3">Meta · TikTok · Google</td>
                      <td />
                    </tr>
                    <tr>
                      <td className="text-ink">First purchase</td>
                      <td className="text-ink-3">POS · marketplaces</td>
                      <td />
                    </tr>
                    <tr>
                      <td className="font-medium text-signal">Repeat</td>
                      <td className="text-signal">Nobody</td>
                      <td className="text-right">
                        <span className="t-label rounded-full bg-signal px-3 py-1.5 text-white">
                          PARALLAX
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="mt-12">
                <Quote>
                  Everyone measures cost per lead.
                  We measure cost per returning customer.
                </Quote>
              </div>
            </Reveal>
          </div>
        </div>
      </Section>

      <NextUp
        items={[
          {
            href: "/platform",
            label: "Platform",
            title: "The five layers",
          },
          {
            href: "/customers",
            label: "Customers",
            title: "The four revenue cycles we take",
          },
          {
            href: "/playbook",
            label: "Playbook",
            title: "Validated on real data",
          },
        ]}
      />

      <CTA />
    </>
  );
}
