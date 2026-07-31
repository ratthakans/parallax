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
  title: "Investors",
  description:
    "A three-phase GTM, two market-size scenarios, per-account economics, the business model canvas, and the risk the whole company rests on.",
};

const PHASES = [
  {
    n: "phase one",
    t: "Drag and drop",
    d: "Live on day one without anyone's permission, and without depending on a single API.",
    kpi: "First 100 paying accounts with no API",
  },
  {
    n: "phase two",
    t: "Pressure from below",
    d: "Once shops see the lift, they call their POS vendor themselves. We never have to ask.",
    kpi: "Inbound requests reaching the POS vendors",
  },
  {
    n: "phase three",
    t: "The formal deal",
    d: "Walk in with an existing customer base and offer 10–20% revenue share for a native API and app store placement.",
    kpi: "At least one signed vendor",
  },
];

const FALLBACKS = [
  {
    t: "Move up to cycles that pay more",
    d: "Clinics, golf, gyms and schools carry ฿5,900–15,000 ARPA, because a single customer of theirs is worth tens of thousands.",
    effect: "CAC ceiling rises into six figures and direct sales pays immediately",
  },
  {
    t: "The consultant and agency channel",
    d: "People already managing dozens of shops — one deal brings many accounts.",
    effect: "Blended CAC per account falls with portfolio size",
  },
  {
    t: "Move up to chains",
    d: "20–100 locations, six-figure annual contract value.",
    effect: "A direct sales team is justified at this level",
  },
];

const SCENARIOS = [
  {
    label: "",
    base: "Base case",
    cons: "Conservative case",
  },
];

const SCEN_ROWS = [
  ["Growth / Multi / Chain mix", "70 / 25 / 5", "80 / 18 / 2"],
  ["Blended monthly ARPA", "~฿3,555", "~฿2,882"],
  ["Annualised", "~฿42,700", "~฿34,600"],
  ["SAM (300,000 businesses)", "~฿12.8bn", "~฿10.4bn"],
  ["24-month SOM at 1.5%", "~฿192m", "~฿156m"],
];

const UNIT = [
  { k: "Revenue per account", v: "~฿2,900/mo", note: "On the conservative case" },
  { k: "Variable cost", v: "≤ 30%", note: "Compute, unbilled messaging, support" },
  { k: "Gross margin", v: "≥ 70%", note: "Contingent on group-level generation" },
  { k: "CAC ceiling", v: "~฿24,000", note: "At a 12-month payback" },
  { k: "Net revenue retention", v: "> 100%", note: "Through tier movement as the base grows" },
];

const BMC = [
  {
    t: "Key partners",
    d: "Thai POS vendors — 10–20% revenue share for a native API and app store placement · LINE OA and messaging providers · Meta and TikTok Ads for audience sync · marketplaces as an inbound data source · cloud and LLM providers",
  },
  {
    t: "Key activities",
    d: "Build the three-axis engine · make the file reader accurate against every POS · accumulate and train cycle-level signatures · build integrations one vendor at a time · maintain PDPA compliance",
  },
  {
    t: "Key resources",
    d: "An identity graph accumulated from real use · cycle-level signatures trained across the cohort — assets that grow with the customer count and cannot be bought · completed POS connectors · the data engineering team",
  },
  {
    t: "Value proposition",
    d: "Replace a five-figure marketing team with four-figure software · see the same customer across every channel · campaigns arrive drafted, approve and send · find leads shaped like customers who actually return · prove the difference · start on day one without waiting for an API · arrive later and get a smarter system",
  },
  {
    t: "Customer relationships",
    d: "Self-serve signup · the Morning Brief becoming a habit · the ROI tracker making cancellation something you have to explain",
  },
  {
    t: "Channels",
    d: "POS app stores as the primary mid-term channel · direct sales into high-ARPA cycles · the consultant and agency network · online advertising as a secondary channel",
  },
  {
    t: "Customer segments",
    d: "Replenish · Recall · Expiry · Considered — one cycle at a time until cross-account learning starts working, before opening the next",
  },
  {
    t: "Cost structure",
    d: "R&D and engineering as the largest line for two years · AI compute controlled by group-level generation · messaging pushed out as credits · acquisition cost · POS revenue share once phase three lands",
  },
  {
    t: "Revenue streams",
    d: "Monthly subscription on identifiable customers · messaging credits · integration fees for chains · partner share in later phases",
  },
];

const RISKS = [
  {
    r: "Phase three never lands",
    lvl: "Critical",
    m: "Three fallbacks — high-ARPA cycles, the consultant channel, and chains",
    top: true,
  },
  {
    r: "Customers with no identity on the receipt",
    lvl: "Critical",
    m: "Qualify only shops that can identify a customer · ship point-of-sale capture first",
    top: true,
  },
  {
    r: "Not enough data to learn from",
    lvl: "High",
    m: "One cycle at a time to critical mass, never spread thin",
  },
  {
    r: "PDPA",
    lvl: "High",
    m: "Masked before processing · consent templates · an auditable ledger",
  },
  {
    r: "Liability from the messages",
    lvl: "High",
    m: "Autopilot only on approved templates",
  },
  {
    r: "Compute cost eating the margin",
    lvl: "High",
    m: "Generate at the group level, never per person",
  },
  {
    r: "A POS vendor builds it themselves",
    lvl: "High",
    m: "Be the partner before becoming the competitor",
  },
  {
    r: "A platform changes its terms",
    lvl: "Medium",
    m: "Phase one depends on nobody's API",
  },
];

const UNSOURCED = [
  "CAC rising 300%",
  "80% of profit sitting in the existing base",
  "A 24–48 hour data freshness window",
  "SEA martech TAM",
  "300,000 Thai businesses running a POS",
];

export default function InvestorsPage() {
  return (
    <>
      <PageHero
        label="Investors"
        title="The numbers to look at first, and the risk the whole company rests on"
        lead="Blended ARPA of roughly ฿2,900 a month, a 70% gross margin target and a 12-month payback put the CAC ceiling at about ฿24,000 per account."
        meta={[
          { k: "ARPA / month", v: "~฿2,900" },
          { k: "Gross margin", v: "≥ 70%" },
          { k: "CAC ceiling", v: "~฿24,000" },
          { k: "24-month SOM", v: "~฿156m" },
        ]}
      />

      {/* the central bet */}
      <Section tone="paper">
        <div className="shell">
          <div className="grid gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
            <Reveal>
              <div>
                <Label n="01">The central assumption</Label>
                <h2 className="t-h2 balance mt-9 text-ink">
                  Phase three is not one row in a risk table
                </h2>
              </div>
            </Reveal>
            <Reveal delay={120}>
              <div className="flex flex-col gap-8">
                <p className="t-body t-thai pretty text-ink-2">
                  Through online advertising into Thai SMEs, a ฿24,000 CAC ceiling is close
                to impossible. Through a POS app store it is a fraction of that.
                </p>
                <p className="t-body t-thai pretty text-ink-3">
                  So partner distribution is not an accelerant — it is a precondition of the
                entire model. Which is why the fallback is written down in advance,
                not produced when someone asks in a meeting.
                </p>
                <div className="border-t border-line pt-8">
                  <Quote>
                    It is the assumption the whole company rests on
                  </Quote>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </Section>

      {/* GTM phases */}
      <Section tone="mist">
        <div className="shell">
          <Reveal>
            <Label n="02">Three-phase GTM</Label>
          </Reveal>
          <div className="mt-14 grid gap-px bg-line lg:grid-cols-3">
            {PHASES.map((p) => (
              <Reveal key={p.n} delay={0}>
                <div className="flex h-full flex-col gap-6 bg-paper p-8 md:p-9">
                  <span className="marker-num">{p.n}</span>
                  <h3 className="t-h3 text-ink">{p.t}</h3>
                  <p className="t-small t-thai text-ink-3">{p.d}</p>
                  <p className="t-small t-thai mt-auto border-t border-line pt-6 text-signal">
                    KPI — {p.kpi}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </Section>

      {/* fallback */}
      <Section tone="dark" className="overflow-hidden">
        <Field variant="deep" />
        <div className="shell">
          <Reveal>
            <Label n="03" tone="light">
              If no POS vendor ever signs
            </Label>
          </Reveal>
          <Reveal delay={70}>
            <h2 className="t-h2 balance mt-9 max-w-3xl text-frost">
              The fallback needs an answer before the investor meeting, because it will be asked
            </h2>
          </Reveal>

          <div className="mt-16 grid gap-px border border-cyan/12 bg-cyan/12 lg:grid-cols-3">
            {FALLBACKS.map((f, i) => (
              <div key={f.t} className="flex flex-col gap-6 bg-abyss p-8">
                <span className="marker-num text-frost/48">0{i + 1}</span>
                <h3 className="t-h3 text-frost">{f.t}</h3>
                <p className="t-small t-thai text-frost/66">{f.d}</p>
                <p className="t-small t-thai mt-auto border-t border-cyan/12 pt-6 text-cyan">
                  {f.effect}
                </p>
              </div>
            ))}
          </div>

          <Reveal delay={160}>
            <div className="mt-12">
              <Note tone="light">
                All three trade far fewer accounts for several times the ARPA.
                The SOM looks different — fewer accounts, not necessarily a smaller number.
              </Note>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* market size */}
      <Section tone="paper">
        <div className="shell">
          <Reveal>
            <Label n="04">Market size · two scenarios</Label>
          </Reveal>
          <Reveal delay={70}>
            <h2 className="t-h2 balance mt-9 max-w-3xl text-ink">
              SAM depends entirely on the tier mix, which has to be stated openly rather
              than buried inside an average.
            </h2>
          </Reveal>

          <Reveal delay={140}>
            <div className="scroll-x mt-14">
              <table className="dtable min-w-[42rem]">
                <thead>
                  <tr>
                    <th className="w-[18rem]" />
                    <th>{SCENARIOS[0].base}</th>
                    <th className="text-signal">{SCENARIOS[0].cons}</th>
                  </tr>
                </thead>
                <tbody>
                  {SCEN_ROWS.map(([k, a, b]) => (
                    <tr key={k}>
                      <td className="t-small t-thai text-ink-3">{k}</td>
                      <td className="text-ink-2">{a}</td>
                      <td className="font-medium text-signal">{b}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Reveal>

          <Reveal delay={200}>
            <div className="mt-12 grid gap-8 lg:grid-cols-2">
              <Card>
                <p className="t-label text-signal">how to use these</p>
                <p className="t-body t-thai pretty mt-5 text-ink-2">
                  Lead with the conservative case and hold the base case for when someone
                asks where the upside is. That buys back more credibility than a
                slightly larger number ever does.
                </p>
              </Card>
              <Card className="border-t-2 border-t-ink-4">
                <p className="t-label text-ink-4">true in both scenarios</p>
                <p className="t-body t-thai pretty mt-5 text-ink-2">
                  About 190 net new paying accounts a month, every month for 24 months —
                achievable only if phase three closes, or by switching to the fallback,
                which trades account count for higher ARPA.
                </p>
              </Card>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* unit economics */}
      <Section tone="mist">
        <div className="shell">
          <div className="grid gap-14 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
            <Reveal>
              <div>
                <Label n="05">Per-account economics</Label>
                <h2 className="t-h2 balance mt-9 text-ink">
                  A frame to be filled with real numbers from the pilots
                </h2>
                <p className="t-body t-thai pretty mt-8 max-w-md text-ink-3">
                  These are targets, not measured results. We keep those two apart in every
              document we produce.
                </p>
              </div>
            </Reveal>

            <Reveal delay={120}>
              <div className="scroll-x">
                <table className="dtable min-w-[34rem]">
                  <thead>
                    <tr>
                      <th>Line</th>
                      <th>Target</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {UNIT.map((u) => (
                      <tr key={u.k}>
                        <td className="whitespace-nowrap text-ink">{u.k}</td>
                        <td className="t-numeral t-h3 whitespace-nowrap text-signal">
                          {u.v}
                        </td>
                        <td className="text-ink-3">{u.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Reveal>
          </div>
        </div>
      </Section>

      {/* BMC */}
      <Section tone="paper">
        <div className="shell">
          <Reveal>
            <Label n="06">Business Model Canvas</Label>
          </Reveal>
          <div className="mt-14 grid gap-px bg-line md:grid-cols-2 xl:grid-cols-3">
            {BMC.map((b) => (
              <div key={b.t} className="flex flex-col gap-5 bg-paper p-8">
                <h3 className="t-h3 text-ink">{b.t}</h3>
                <More label="detail">{b.d}</More>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* risks */}
      <Section tone="dark" className="overflow-hidden">
        <div className="shell">
          <Reveal>
            <Label n="07" tone="light">
              Risks and mitigations
            </Label>
          </Reveal>

          <Reveal delay={80}>
            <div className="scroll-x mt-14">
              <table className="dtable dtable--dark min-w-[46rem]">
                <thead>
                  <tr>
                    <th>Risk</th>
                    <th>Level</th>
                    <th>Mitigation</th>
                  </tr>
                </thead>
                <tbody>
                  {RISKS.map((r) => (
                    <tr key={r.r}>
                      <td
                        className={`whitespace-nowrap ${
                          r.top ? "font-medium text-frost" : "text-frost/80"
                        }`}
                      >
                        {r.r}
                      </td>
                      <td
                        className={`whitespace-nowrap ${
                          r.top ? "text-sky" : "text-frost/58"
                        }`}
                      >
                        {r.lvl}
                      </td>
                      <td className="text-frost/66">{r.m}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* moat */}
      <Section tone="mist">
        <div className="shell">
          <Reveal>
            <Label n="08">The moat</Label>
          </Reveal>
          <Reveal delay={70}>
            <h2 className="t-h2 balance mt-9 max-w-3xl text-ink">
              Two assets that grow with the customer count and cannot be bought
            </h2>
          </Reveal>

          <div className="mt-16 grid grid-cols-2 gap-x-8 gap-y-12 border-t border-line pt-12 md:grid-cols-4">
            <Stat value="1" label="Identity graph built from real use" sub="Sharper the longer it runs" />
            <Stat value="2" label="Cycle-level signatures trained across the cohort" sub="Requires critical mass first" />
            <Stat value="200" label="The 200th account beats the 10th" sub="From day one" />
            <Stat value="0" label="Shortcuts money can buy" sub="For a later entrant" />
          </div>
        </div>
      </Section>

      {/* appendix */}
      <Section tone="paper" size="band-sm">
        <div className="shell">
          <Reveal>
            <div className="grid gap-10 border-t border-line pt-12 lg:grid-cols-[1fr_2fr] lg:gap-20">
              <div>
                <Label n="09">Appendix</Label>
                <p className="t-small t-thai mt-6 max-w-xs text-ink-3">
                  Figures that need a source or removal before any stage — we keep this list
              in the open, not in a private file.
                </p>
              </div>
              <div className="grid gap-10 md:grid-cols-2">
                <div>
                  <p className="t-label text-ink-4">unsourced</p>
                  <ul className="mt-6 flex flex-col gap-3">
                    {UNSOURCED.map((u) => (
                      <li
                        key={u}
                        className="t-small t-thai flex gap-4 text-ink-3"
                      >
                        <span
                          className="mt-[0.8em] h-px w-3.5 shrink-0 bg-line"
                          aria-hidden
                        />
                        {u}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="t-label text-signal">confirmed</p>
                  <p className="t-small t-thai mt-6 text-ink-2">
                    Closure and new registration statistics, first half of 2026 —
                Department of Business Development.
                  </p>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </Section>

      <NextUp
        items={[
          { href: "/platform/learning", label: "The moat", title: "Shared intelligence" },
          { href: "/company", label: "Company", title: "Team and roadmap" },
          { href: "/contact", label: "Contact", title: "Request more detail" },
        ]}
      />

      <CTA
        title="Request the full materials and the latest numbers"
        body="We are glad to walk through the assumptions, the fallback, and what remains unproven — one at a time."
      />
    </>
  );
}
