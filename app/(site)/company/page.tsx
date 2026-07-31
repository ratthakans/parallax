import type { Metadata } from "next";
import { Mark } from "@/components/brand";
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
} from "@/components/ui";
import { Reveal } from "@/components/reveal";

export const metadata: Metadata = {
  title: "About",
  description:
    "The name, the brand, the team, the roadmap, and the first 90 days of metrics.",
};

const VOICE = [
  {
    side: "To investors",
    tone: "Cool, dense, numbers first",
    example: "“Cost per returning customer”",
    ban: "Marketing language",
  },
  {
    side: "To shop owners",
    tone: "Warm, concrete, denominated in baht",
    example: "“165 existing customers are about to go quiet this month”",
    ban: "Jargon — RFM, cohort, attribution",
  },
];

const TEAM = [
  {
    role: "Data / backend engineer",
    n: "2",
    d: "Ingest and identity — the hardest part of the whole system",
  },
  { role: "Full-stack", n: "1", d: "The Morning Brief and the product surface" },
  {
    role: "applied AI",
    n: "1",
    d: "Matching, generation, and evaluation",
  },
  {
    role: "Founding sales and success",
    n: "1",
    d: "10 pilots → 100 accounts",
  },
  {
    role: "Design · PDPA counsel",
    n: "As needed",
    d: "Not full time in year one",
  },
];

const ROADMAP = [
  {
    when: "0–3 months",
    items: [
      "Drag and drop",
      "Identity layer",
      "Morning Brief",
      "LINE delivery",
      "Proof, sized by cohort",
      "Ten pilots inside one cycle",
    ],
  },
  {
    when: "3–12 months",
    items: [
      "One to two native APIs",
      "Template autopilot",
      "Full Reach",
      "POS app store listing",
      "100 paying accounts",
      "Cycle signatures producing measurable results",
    ],
  },
  {
    when: "12–24 months",
    items: [
      "Close the revenue share, or open the fallback",
      "Chain tier",
      "Adapter layer ready for the second market",
    ],
  },
];

const METRICS = [
  { k: "Drop a file, see something worth acting on", v: "Within 3 minutes" },
  { k: "First campaign sent within 14 days", v: "70%" },
  { k: "Opens the Brief at least 4 days a week", v: "60% of accounts" },
  { k: "Pooled 90-day difference vs holdout", v: "Above 5%" },
  { k: "Still active in month three", v: "Above 80%" },
];

export default function CompanyPage() {
  return (
    <>
      <PageHero
        label="Company"
        title="One view gives you position. Two views give you distance."
        lead="Parallax is the apparent shift in an object's position when observed from two points — and it is precisely that shift which makes distance calculable. Our two points are the customers you have and the customers you do not."
      />

      {/* name & category */}
      <Section tone="paper">
        <div className="shell">
          <div className="grid gap-14 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20">
            <Reveal>
              <div className="lg:sticky lg:top-28">
                <Label>Name and category</Label>
                <div className="mt-9 flex items-center gap-3 text-ink">
                  <Mark className="h-7 w-7 text-signal" />
                  <span className="t-h3 font-medium tracking-[0.24em]">
                    PARALLAX
                  </span>
                </div>
                <p className="t-small t-thai mt-8 max-w-sm text-ink-3">
                  The mark is two sight lines from two positions converging on a single
                point — the only way to know distance rather than merely position.
                </p>
              </div>
            </Reveal>

            <Reveal delay={120}>
              <div className="flex flex-col gap-12">
                <div>
                  <p className="t-label text-ink-4">category — locked for two years</p>
                  <p className="t-h2 mt-6 text-ink">
                    Agentic revenue OS
                  </p>
                  <More label="detail">“Agentic” becomes a commodity word within eighteen
                months — every CRM will have it on their homepage by 2027. So we use it
                to describe the category, never as a market position
                  </More>
                </div>

                <div className="border-t border-line pt-10">
                  <p className="t-label text-signal">the position that stays ours</p>
                  <p className="t-h3 pretty mt-6 text-ink">
                    Other tools measure cost per lead. We measure cost per returning
                customer.
                  </p>
                  <p className="t-small t-thai mt-5 text-ink-3">
                    That sentence does not expire with the technology, and nobody can copy it
                without building a Proof layer first.
                  </p>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </Section>

      {/* two voices */}
      <Section tone="mist">
        <div className="shell">
          <Reveal>
            <Label>Two registers</Label>
          </Reveal>
          <Reveal delay={70}>
            <h2 className="t-h2 balance mt-9 max-w-3xl text-ink">
              Investor materials and shop-facing copy must never be written in the same voice
            </h2>
          </Reveal>

          <div className="mt-14 grid gap-8 lg:grid-cols-2">
            {VOICE.map((v, i) => (
              <Reveal key={v.side} delay={i * 100}>
                <Panel className="h-full">
                  <h3 className="t-h3 text-ink">{v.side}</h3>
                  <dl className="mt-8 flex flex-col gap-6">
                    <div>
                      <dt className="t-label text-ink-4">tone</dt>
                      <dd className="t-body t-thai mt-2.5 text-ink-2">{v.tone}</dd>
                    </div>
                    <div>
                      <dt className="t-label text-ink-4">example</dt>
                      <dd className="t-body t-thai mt-2.5 text-signal">
                        {v.example}
                      </dd>
                    </div>
                    <div>
                      <dt className="t-label text-ink-4">never use</dt>
                      <dd className="t-body t-thai mt-2.5 text-ink-3">{v.ban}</dd>
                    </div>
                  </dl>
                </Panel>
              </Reveal>
            ))}
          </div>

          <Reveal delay={220}>
            <div className="mt-12">
              <Note>Never mix them — a blended voice convinces neither audience</Note>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* team */}
      <Section tone="paper">
        <div className="shell">
          <div className="grid gap-14 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
            <Reveal>
              <div>
                <Label>Team and resources</Label>
                <h2 className="t-h2 balance mt-9 text-ink">
                  The minimum team shape for the first twelve months
                </h2>
                <More label="detail">The indispensable and scarcest skill is someone who has
              done entity resolution before — not someone who has called an LLM API
                </More>
              </div>
            </Reveal>

            <Reveal delay={120}>
              <div className="scroll-x">
                <table className="dtable min-w-[34rem]">
                  <thead>
                    <tr>
                      <th>Role</th>
                      <th>Count</th>
                      <th>Scope</th>
                    </tr>
                  </thead>
                  <tbody>
                    {TEAM.map((t) => (
                      <tr key={t.role}>
                        <td className="whitespace-nowrap text-ink">{t.role}</td>
                        <td className="t-numeral t-h3 text-signal">
                          {t.n}
                        </td>
                        <td className="text-ink-3">{t.d}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Reveal>
          </div>
        </div>
      </Section>

      {/* roadmap */}
      <Section tone="dark" className="overflow-hidden">
        <Field variant="deep" />
        <div className="shell">
          <Reveal>
            <Label tone="light">
              Roadmap
            </Label>
          </Reveal>

          <div className="mt-14 grid gap-px border border-cyan/12 bg-cyan/12 lg:grid-cols-3">
            {ROADMAP.map((r) => (
              <div key={r.when} className="bg-abyss p-8 md:p-9">
                <p className="t-numeral t-h3 text-sky">{r.when}</p>
                <ul className="mt-8 flex flex-col gap-4">
                  {r.items.map((it) => (
                    <li
                      key={it}
                      className="t-small t-thai flex gap-4 text-frost/65"
                    >
                      <span
                        className="mt-[0.8em] h-px w-3.5 shrink-0 bg-cyan/40"
                        aria-hidden
                      />
                      {it}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* metrics */}
      <Section tone="mist">
        <div className="shell">
          <div className="grid gap-14 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
            <Reveal>
              <div>
                <Label>First 90 days</Label>
                <h2 className="t-h2 balance mt-9 text-ink">
                  Five numbers that say whether we are building the right thing
                </h2>
              </div>
            </Reveal>
            <Reveal delay={120}>
              <div>
                <ul className="flex flex-col">
                  {METRICS.map((m, i) => (
                    <li
                      key={m.k}
                      className={`flex items-baseline justify-between gap-6 border-t border-line py-6 ${
                        i === METRICS.length - 1 ? "border-b border-b-line" : ""
                      }`}
                    >
                      <span className="t-body t-thai text-ink-2">{m.k}</span>
                      <span className="t-numeral shrink-0 t-h3 text-signal">
                        {m.v}
                      </span>
                    </li>
                  ))}
                </ul>
                <More label="detail">The Brief-open metric matters more than it looks — it is
              the churn warning that arrives before every other number
                </More>
              </div>
            </Reveal>
          </div>
        </div>
      </Section>

      {/* geography */}
      <Section tone="paper" id="geography">
        <div className="shell">
          <div className="grid gap-14 lg:grid-cols-2 lg:gap-20">
            <Reveal>
              <div>
                <Label>Geography</Label>
                <h2 className="t-h2 balance mt-9 text-ink">
                  Everything hard to copy about us is local
                </h2>
                <More label="detail">Thai POS, LINE and PDPA are why global platforms cannot
              compete here directly — and why our expansion axis is the LINE axis
                </More>
                <p className="t-h3 mt-10 text-signal">
                  Thailand → Taiwan → Japan
                </p>
                <p className="t-small t-thai mt-4 text-ink-3">
                  The same messaging layer, the same identity model — the hardest engineering
              moves across intact.
                </p>
              </div>
            </Reveal>

            <Reveal delay={120}>
              <Panel className="h-full">
                <p className="t-label text-ink-4">
                  The second market opens when all four are true
                </p>
                <ol className="mt-8 flex flex-col gap-5">
                  {[
                    "100 paying accounts",
                    "Net revenue retention above 100%",
                    "A provable difference",
                    "A repeatable partner channel",
                  ].map((x, i) => (
                    <li key={x} className="flex gap-5">
                      <span className="t-numeral t-h3 text-ink-4">
                        0{i + 1}
                      </span>
                      <span className="t-body t-thai text-ink-2">{x}</span>
                    </li>
                  ))}
                </ol>
                <p className="t-small t-thai mt-10 border-t border-line pt-6 text-ink-3">
                  Fewer than four means we do not open — however attractive the invitation
                </p>
              </Panel>
            </Reveal>
          </div>

          <Reveal delay={200}>
            <div className="mt-16 max-w-3xl">
              <Quote>
                Splitting the codebase into a local layer and a portable core costs 15–20%
              more now. Skip it and expansion means a rewrite.
              </Quote>
            </div>
          </Reveal>
        </div>
      </Section>

      <NextUp
        items={[
          { href: "/investors", label: "Company", title: "Investor materials" },
          { href: "/trust", label: "Governance", title: "Privacy and PDPA" },
          { href: "/contact", label: "Contact", title: "Talk to us" },
        ]}
      />

      <CTA />
    </>
  );
}
