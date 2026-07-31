import type { Metadata } from "next";
import {
  CTA,
  Card,
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

export const metadata: Metadata = {
  title: "Proof — measurement that survives the question",
  description:
    "Holdouts sized by cohort, the difference reported instead of the total, and a plain answer when it is still too early to say.",
};

const RULES = [
  {
    size: "1,000 and above",
    how: "True holdout, 10–20% withheld",
    report: "Reportable per campaign",
    ok: true,
  },
  {
    size: "300–1,000",
    how: "Holdout, but too small to conclude on any single send",
    report: "Pooled every 90 days, never per campaign",
    ok: true,
  },
  {
    size: "Under 300",
    how: "Time-shifted, or matched against a behaviourally similar cohort",
    report: "No holdout — it would return noise, not signal",
    ok: false,
  },
];

export default function ProofPage() {
  return (
    <>
      <PageHero
        label="Platform · Proof"
        title="A smaller number that answers the question nobody else can"
        lead="Competitors report total revenue from the group that got the message. That number is always prettier, and indefensible the moment someone asks what you would have earned by sending nothing. The difference is smaller — and it answers."
      />

      {/* the statistical honesty */}
      <Section tone="paper">
        <div className="shell">
          <div className="grid gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
            <Reveal>
              <div>
                <Label>The limit we state first</Label>
                <h2 className="t-h2 balance mt-9 text-ink">
                  “A holdout on every campaign” sounds rigorous. Statistically it isn’t.
                </h2>
              </div>
            </Reveal>
            <Reveal delay={120}>
              <div className="flex flex-col gap-8">
                <More label="detail">A 500-person cohort with 10% withheld leaves 50 people —
              nowhere near enough to detect a 5% difference. What comes back is noise
              wearing the shape of an answer, and reporting noise as a result is a lie
              that hasn’t noticed itself yet
                </More>
                <p className="t-body t-thai pretty text-ink-3">
                  So the method follows the cohort size, not the appetite to report. The
              system always shows a confidence interval, and says plainly when it is
              still too early.
                </p>
                <div className="border-t border-line pt-8">
                  <Quote>
                    An unsettled result reads “not enough to conclude,” never a flattering
              number.
                  </Quote>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </Section>

      {/* the rules table */}
      <Section tone="mist">
        <div className="shell">
          <Reveal>
            <Label>The rules in force</Label>
          </Reveal>
          <Reveal delay={70}>
            <h2 className="t-h2 balance mt-9 max-w-3xl text-ink">
              The method is chosen by the size of the treated group
            </h2>
          </Reveal>

          <Reveal delay={140}>
            <div className="scroll-x mt-14">
              <table className="dtable min-w-[44rem]">
                <thead>
                  <tr>
                    <th>Treated group size</th>
                    <th>Method</th>
                    <th>What can be reported</th>
                  </tr>
                </thead>
                <tbody>
                  {RULES.map((r) => (
                    <tr key={r.size}>
                      <td className="font-medium whitespace-nowrap text-ink">
                        {r.size}
                      </td>
                      <td className="text-ink-2">{r.how}</td>
                      <td className={r.ok ? "text-signal" : "text-ink-3"}>
                        {r.report}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Reveal>

          <Reveal delay={200}>
            <div className="mt-12">
              <Note>
                The 281-person champion cohort in the MST Golf sample falls in the band
              that must be pooled over 90 days rather than measured per campaign —
              and we surface that limit in the product, not in a footnote.
              </Note>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* ROI tracker */}
      <Section tone="dark" className="overflow-hidden">
        <Field variant="deep" />
        <div className="shell">
          <div className="grid gap-14 lg:grid-cols-[1fr_1fr] lg:gap-20">
            <Reveal>
              <div>
                <Label tone="light">
                  ROI Tracker
                </Label>
                <h2 className="t-h2 balance mt-9 text-frost">
                  And the edge that cuts back
                </h2>
                <More label="detail">Report the difference honestly month by month and the
              month it comes back negative is a cancel button we built for the
              customer ourselves, evidence included
                </More>
                <More label="detail">So it shows as a 90-day rolling average with a confidence
              interval rather than a monthly figure — because what we sell is the
              cumulative effect, not any one month, and because it is the truer number
                </More>
              </div>
            </Reveal>

            <Reveal delay={140}>
              <div className="card-dark p-8">
                <div className="flex items-baseline justify-between gap-4">
                  <p className="t-label text-frost/52">90-day rolling difference</p>
                  <p className="t-label text-cyan/60">holdout 15%</p>
                </div>
                <p className="t-numeral-xl mt-6 text-sky">+7.4%</p>
                <p className="t-small mt-3 text-frost/58">
                  95% confidence interval · ±2.1 pts
                </p>

                <div className="mt-9 border-t border-cyan/12 pt-7">
                  <dl className="flex flex-col gap-5">
                    {[
                      ["Revenue from the sent group", "฿2,418,000"],
                      ["Expected from the holdout", "฿2,251,300"],
                      ["Countable difference", "฿166,700"],
                      ["Cost per returning customer", "฿148"],
                    ].map(([k, v], i) => (
                      <div key={k} className="flex justify-between gap-4">
                        <dt className="t-small t-thai text-frost/62">{k}</dt>
                        <dd
                          className={`t-numeral t-h3 ${
                            i === 3 ? "text-cyan" : "text-frost/80"
                          }`}
                        >
                          {v}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>

                <p className="t-small t-thai mt-8 border-t border-cyan/12 pt-6 text-frost/48">
                  An illustration of the display, not a measured result from a live customer
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </Section>

      {/* what makes it different */}
      <Section tone="paper">
        <div className="shell">
          <Reveal>
            <Label>What separates this from the market</Label>
          </Reveal>

          <div className="mt-14 grid gap-8 lg:grid-cols-2">
            <Reveal delay={60}>
              <Card className="h-full border-t-2 border-t-ink-4">
                <p className="t-label text-ink-4">what most tools report</p>
                <h3 className="t-h3 mt-4 text-ink">
                  Total revenue from the group that got the message
                </h3>
                <p className="t-body t-thai pretty mt-5 text-ink-3">
                  A big number that looks good on a slide, and quietly includes everyone who
                was going to buy anyway. Asked what you would have earned by sending
                nothing, it has no answer.
                </p>
              </Card>
            </Reveal>
            <Reveal delay={130}>
              <Card className="h-full border-t-2 border-t-signal">
                <p className="t-label text-signal">what parallax reports</p>
                <h3 className="t-h3 mt-4 text-ink">
                  The difference against a group that got nothing
                </h3>
                <p className="t-body t-thai pretty mt-5 text-ink-3">
                  Far smaller, and the only number that holds up under questioning — the
                only one a budget decision can actually rest on.
                </p>
              </Card>
            </Reveal>
          </div>

          <Reveal delay={200}>
            <div className="mt-16 max-w-3xl">
              <Quote>
                The Proof layer is what makes churn hard — not through a contract, but
              because cancelling means explaining the number you gave up.
              </Quote>
            </div>
          </Reveal>
        </div>
      </Section>

      <NextUp
        items={[
          { href: "/platform/keep", label: "Platform", title: "Keep" },
          { href: "/platform/reach", label: "Platform", title: "Reach" },
          {
            href: "/investors",
            label: "Investors",
            title: "Per-account economics",
          },
        ]}
      />

      <CTA />
    </>
  );
}
