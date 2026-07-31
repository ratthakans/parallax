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
  Stat,
} from "@/components/ui";
import { Reveal } from "@/components/reveal";

export const metadata: Metadata = {
  title: "Playbook — MST Golf",
  description:
    "Single-location golf retail, a base of 1,240 members, and 967 next-best actions returned — 78% of the base.",
};

const DEMO_URL = "https://mst-golf-crm.vercel.app/playbook";

const FUNNEL = [
  { k: "Members", v: "1,240", pct: 100 },
  { k: "Bought once", v: "999", pct: 81 },
  { k: "Bought again", v: "707", pct: 57 },
];

const PLANS = [
  {
    seg: "Champions",
    n: "281",
    plan: "VIP fitting night — first look at new stock",
    why: "Always full price. They respond to status, not discounts",
  },
  {
    seg: "Gold, drifting",
    n: "119",
    plan: "Pull back before the window shuts",
    why: "High value, and now past their own cycle length",
  },
  {
    seg: "Bought the driver, not the balls",
    n: "98",
    plan: "Attach from what usually follows",
    why: "A pattern that repeats across golf retail",
  },
  {
    seg: "Fitted, hasn’t bought",
    n: "65",
    plan: "Paid service → highest-margin product",
    why: "The hottest lead in the base, and the shortest path to margin",
  },
  {
    seg: "Silent past six months",
    n: "165",
    plan: "Reactivate with what they already bought",
    why: "Value about to leave the base permanently",
  },
];

export default function PlaybookPage() {
  return (
    <>
      <PageHero
        label="Playbook · MST Golf"
        title="Wrong ICP by every textbook, and the engine still worked"
        lead="Single-location golf retail. Not a restaurant, not a chain. Filter by industry and this shop is cut immediately. Filter by the shape of the cycle and it is the ideal customer."
        meta={[
          { k: "Member base", v: "1,240" },
          { k: "Active in 30 days", v: "248" },
          { k: "Silent past 90 days", v: "585" },
          { k: "Given an action", v: "967" },
        ]}
      />

      {/* funnel */}
      <Section tone="paper">
        <div className="shell">
          <div className="grid gap-14 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20">
            <Reveal>
              <div>
                <Label>The member funnel</Label>
                <h2 className="t-h2 balance mt-9 text-ink">
                  57% of the base has already bought again — the question is who is about to stop
                </h2>
                <More label="detail">A sales report only says what you sold. What nobody can
              answer is how many of those 707 repeat buyers are still on rhythm today
                </More>
              </div>
            </Reveal>

            <Reveal delay={120}>
              <div>
                <div className="flex flex-col gap-7">
                  {FUNNEL.map((f) => (
                    <div key={f.k}>
                      <div className="flex items-baseline justify-between gap-4">
                        <span className="t-body t-thai text-ink-2">{f.k}</span>
                        <span className="t-numeral t-h2 text-ink">
                          {f.v}
                        </span>
                      </div>
                      <div
                        className="mt-3 h-px w-full bg-line"
                        aria-hidden
                      >
                        <div
                          className="h-px bg-signal"
                          style={{ width: `${f.pct}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-12 grid grid-cols-2 gap-8 border-t border-line pt-10">
                  <Stat value="41%" label="Revenue from the top 2% of members" />
                  <Stat value="78%" label="Share of the base given an action" sub="967 of 1,240" />
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </Section>

      {/* plans */}
      <Section tone="mist">
        <div className="shell">
          <Reveal>
            <Label>The actions returned</Label>
          </Reveal>
          <Reveal delay={70}>
            <h2 className="t-h2 balance mt-9 max-w-3xl text-ink">
              Five cohorts, five reasons, and not one of them named in advance
            </h2>
          </Reveal>

          <Reveal delay={140}>
            <div className="scroll-x mt-14">
              <table className="dtable min-w-[52rem]">
                <thead>
                  <tr>
                    <th>Cohort</th>
                    <th>People</th>
                    <th>Action</th>
                    <th>Why this cohort gets this action</th>
                  </tr>
                </thead>
                <tbody>
                  {PLANS.map((p) => (
                    <tr key={p.seg}>
                      <td className="font-medium whitespace-nowrap text-ink">
                        {p.seg}
                      </td>
                      <td className="t-numeral t-h3 text-signal">
                        {p.n}
                      </td>
                      <td className="text-ink-2">{p.plan}</td>
                      <td className="text-ink-3">{p.why}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Reveal>

          <Reveal delay={200}>
            <div className="mt-14 grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
              <Card>
                <p className="t-label text-ink-4">how one cohort is valued</p>
                <p className="t-h2 t-numeral mt-6 text-signal">
                  281 × ฿2,800 = ฿786,800
                </p>
                <p className="t-small t-thai mt-6 text-ink-3">
                  The champion cohort multiplied by its own average basket, for one campaign
                cycle. That is the size of the opportunity, not a guaranteed result.
                </p>
              </Card>
              <Card className="border-t-2 border-t-signal">
                <p className="t-label text-signal">the limit of this example</p>
                <More label="detail">At 281 people this cohort falls below the 300–1,000
              band, so it must be pooled over 90 days rather than measured per
              campaign. The system will not show a per-send difference at this size
                </More>
              </Card>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* live demo */}
      <Section tone="dark" className="overflow-hidden">
        <Field variant="deep" />
        <div className="shell">
          <Reveal>
            <div className="max-w-3xl">
              <Label tone="light">
                A prototype running on real data
              </Label>
              <h2 className="t-h2 balance mt-9 text-frost">
                Open the real thing, not a screenshot
              </h2>
              <More label="detail">The prototype runs on a sample dataset that passed
              through the real ingest and identity layers. Every number is computed
              from that data, not typed in
              </More>
              <div className="mt-11 flex flex-wrap gap-3">
                <a
                  href={DEMO_URL}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="btn btn-frost"
                >
                  Open the prototype
                  <svg
                    viewBox="0 0 16 16"
                    className="h-3.5 w-3.5"
                    fill="none"
                    aria-hidden
                  >
                    <path
                      d="M5.5 10.5L10.5 5.5M10.5 5.5H6M10.5 5.5V10"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </a>
              </div>
              <p className="t-small mt-8 text-frost/48">{DEMO_URL}</p>
            </div>
          </Reveal>

          <Reveal delay={160}>
            <div className="mt-16 border-t border-cyan/15 pt-10">
              <Note tone="light">
                The demo runs on a sample dataset. The numbers show the mechanism, not a
              measured result from live use — measured results come from the pilots,
              and always ship with a confidence interval.
              </Note>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* the lesson */}
      <Section tone="paper">
        <div className="shell">
          <Reveal>
            <Label>What this example proves</Label>
          </Reveal>
          <div className="mt-14 grid gap-8 md:grid-cols-3">
            {[
              {
                t: "Size is not the requirement",
                d: "A base of 1,240 is enough to segment and return real actions. You do not have to wait for tens of thousands.",
              },
              {
                t: "Industry is not the requirement",
                d: "Golf retail is not the ICP any playbook would recommend, yet its cycle shape matches everything the engine needs.",
              },
              {
                t: "The work that disappeared was segmentation",
                d: "967 people sorted into five cohorts with reasons attached, and nobody did it by hand once.",
              },
            ].map((x, i) => (
              <Reveal key={x.t} delay={i * 80}>
                <Card className="h-full">
                  <span className="marker-num">0{i + 1}</span>
                  <h3 className="t-h3 mt-4 text-ink">{x.t}</h3>
                  <p className="t-small t-thai mt-5 text-ink-3">{x.d}</p>
                </Card>
              </Reveal>
            ))}
          </div>

          <Reveal delay={240}>
            <div className="mt-16 max-w-3xl">
              <Quote>
                Wrong ICP by every textbook, and the engine still worked — which is the
              evidence that our filter should be the shape of the cycle, not the sign
              above the door.
              </Quote>
            </div>
          </Reveal>
        </div>
      </Section>

      <NextUp
        items={[
          { href: "/customers", label: "Customers", title: "Cycles we take" },
          { href: "/platform/keep", label: "Platform", title: "How Keep works" },
          { href: "/contact", label: "Start", title: "Get this for your shop" },
        ]}
      />

      <CTA
        title="Want to see this for your own shop?"
        body="Send us six months of sales history and we return the first set of next-best actions before you commit."
      />
    </>
  );
}
