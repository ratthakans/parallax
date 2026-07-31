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
import { LineReveal, Reveal } from "@/components/reveal";
import { EngineLoop } from "@/components/engine-loop";
import { LayerStack, type LayerRow } from "@/components/layer-stack";

export const metadata: Metadata = {
  title: "The five layers",
  description:
    "Ingest → Identity → Understanding → Act → Proof. Five layers that carry a raw POS export to a difference you can defend.",
};

const LAYERS: LayerRow[] = [
  {
    n: "layer 1",
    name: "Ingest",
    tag: "day one",
    weight: "engine",
    one: "Drag a file · mail it in · connect an API",
    body: "Almost every POS exports CSV. That is an API already open that nobody can close. The system reads the headers, infers the meaning, and cleans the rows itself.",
    kicker: "A direct API is an upgrade, never a precondition.",
  },
  {
    n: "layer 2",
    name: "Identity",
    tag: "hard to copy",
    weight: "moat",
    one: "Every source collapsed to one person, plus a consent ledger",
    body: "A POS receipt, a marketplace order, a LINE follower, a form submission — the same people, and no system knows it. We resolve them on phone, email, member ID and purchase pattern.",
    kicker: "The hardest layer to build and to copy — the graph sharpens with use, and cannot be bought.",
  },
  {
    n: "layer 3",
    name: "Understanding",
    tag: "the engine",
    weight: "engine",
    one: "Behaviour × price tier × expiry",
    body: "Three axes whose intersection is a campaign — how often they buy against their own cycle, whether they pay full price or wait for a discount, and what is about to expire.",
    kicker: "It forks in two — KEEP works the base, REACH finds the next one.",
  },
  {
    n: "layer 4",
    name: "Act",
    tag: "what you touch",
    weight: "surface",
    one: "Draft → approve → send → log",
    body: "Copy arrives drafted with a choice of tone, sends over LINE individually or as a group, and every send is logged so the next layer can measure it.",
    kicker: "The default mode is human approval, not autopilot.",
  },
  {
    n: "layer 5",
    name: "Proof",
    tag: "why they stay",
    weight: "moat",
    one: "Holdout · the difference · cost per outcome",
    body: "Measure what you would have earned by sending nothing, then report only the difference. The method follows the cohort size.",
    kicker: "The layer that makes churn hard, because it answers what competitors cannot.",
  },
];

export default function PlatformPage() {
  return (
    <>
      <PageHero
        label="Platform"
        title="Five layers, from a raw POS file to a difference you can defend"
        lead="Every layer earns its place, and none can be skipped. Identity and the Morning Brief come first, because everything else sits downstream of those two."
      />

      {/* the stack */}
      <Section tone="paper">
        <div className="shell">
          <Reveal>
            <Label>Architecture</Label>
          </Reveal>

          {/* ── ส่วนนี้เคยข้ามจาก h1 ไป h3 ──
              LayerStack ตั้งชื่อชั้นเป็น h3 แต่ section ไม่มี h2 ของตัวเอง
              โครงหัวเรื่องจึงขาดขั้นกลาง — โปรแกรมอ่านหน้าจอไล่ระดับไม่ได้
              และประโยคนี้ควรมีอยู่แล้วเพื่อบอกว่ากำลังจะดูอะไร */}
          <Reveal delay={40}>
            <h2 className="t-h2 balance mt-9 max-w-3xl text-ink">
              One file enters at the top and leaves as something you can defend
            </h2>
          </Reveal>

          {/* ── เดิมเป็นห้าแถวสูงเท่ากันเป๊ะ พร้อมบานพับที่ปิดอยู่ทั้งห้า ──
              หัวเรื่องพูดว่า "ชั้น" แต่หน้าจอแสดง "รายการ" — และประโยค
              ที่ตอบข้อกังวลของคนซื้อถูกซ่อนไว้ข้างในทุกอัน */}
          <Reveal delay={60}>
            <div className="mt-14">
              <LayerStack layers={LAYERS} />
            </div>
          </Reveal>

          <Reveal delay={120}>
            <div className="mt-12">
              <Note>
                Build order — Identity and the Morning Brief ship first. Everything
                else is downstream.
              </Note>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* layer 3 detail — three axes */}
      <Section tone="mist">
        <div className="shell">
          <Reveal>
            <Label>Understanding · three axes</Label>
          </Reveal>
          <Reveal delay={70}>
            <h2 className="t-h2 balance mt-9 max-w-3xl text-ink">
              <LineReveal text="Where the three axes intersect is a campaign" />
            </h2>
          </Reveal>

          <div className="mt-16 grid gap-8 lg:grid-cols-3">
            <Reveal delay={60}>
              <Panel className="h-full">
                <span className="marker-num">axis 1</span>
                <h3 className="t-h3 mt-4 text-ink">Behaviour</h3>
                <p className="t-body t-thai pretty mt-5 text-ink-3">
                  How often they buy, how far past their own normal cycle they have
                drifted, when they buy, and which offers move them.
                </p>
              </Panel>
            </Reveal>

            <Reveal delay={130}>
              <Panel className="h-full">
                <span className="marker-num">axis 2</span>
                <h3 className="t-h3 mt-4 text-ink">
                  Price tier and discount sensitivity
                </h3>
                <p className="t-body t-thai pretty mt-5 text-ink-3">
                  A POS export carries no cost of goods, so gross margin is out of reach.
                What is in reach is the price tier this customer buys at — full price,
                or waiting for the discount.
                </p>
              </Panel>
            </Reveal>

            <Reveal delay={200}>
              <Panel className="h-full">
                <span className="marker-num">axis 3</span>
                <h3 className="t-h3 mt-4 text-ink">Expiry</h3>
                <p className="t-body t-thai pretty mt-5 text-ink-3">
                  Stock nearing its date, dead inventory, memberships close to renewal,
                a course down to its last session.
                </p>
              </Panel>
            </Reveal>
          </div>

          <Reveal delay={240}>
            <div className="mt-14 max-w-3xl">
              <Quote>
                Someone who always pays full price is worth more than someone with a
                higher total who only buys on discount — and we can tell without
                ever asking for your cost data.
              </Quote>
              <p className="t-small t-thai mt-8 text-ink-3">
                Upload your cost of goods and true margin calculation unlocks as an
                optional feature — never a condition of getting started.
              </p>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* the two sides */}
      <Section tone="dark" className="overflow-hidden">
        <Field variant="deep" />
        <div className="shell">
          <Reveal>
            <Label onDark>
              Two sides, and the layer that measures them
            </Label>
          </Reveal>
          <Reveal delay={70}>
            <h2 className="t-h2 balance mt-9 max-w-3xl text-frost">
              Layer three forks in two, and layer five decides which side is telling the truth
            </h2>
          </Reveal>
          <Reveal delay={140}>
            <div className="mt-16">
              <EngineLoop />
            </div>
          </Reveal>
        </div>
      </Section>

      {/* governance */}
      <Section tone="paper">
        <div className="shell">
          <div className="grid gap-14 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20">
            <Reveal>
              <div className="lg:sticky lg:top-28">
                <Label>Act and governance</Label>
                <h2 className="t-h2 balance mt-9 text-ink">
                  Three modes, and the line we don’t cross
                </h2>
                <p className="t-body t-thai pretty mt-8 max-w-md text-ink-3">
                  Autopilot never opens for copy a human hasn’t read, and never for
              regulated product categories.
                </p>
                <div className="mt-10">
                  <ArrowLink href="/trust">Read the full governance policy</ArrowLink>
                </div>
              </div>
            </Reveal>

            <Reveal delay={120}>
              <div>
                <div className="scroll-x">
                  <table className="dtable min-w-[34rem]">
                    <thead>
                      <tr>
                        <th>Mode</th>
                        <th>Who presses</th>
                        <th>Used for</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="text-ink">Suggest</td>
                        <td className="text-ink-3">A person reads and decides</td>
                        <td className="text-ink-3">Onboarding, building trust</td>
                      </tr>
                      <tr>
                        <td className="font-medium text-signal">Approve</td>
                        <td className="text-ink-3">A person confirms the drafted copy</td>
                        <td className="text-signal">The default in real use</td>
                      </tr>
                      <tr>
                        <td className="text-ink">autopilot</td>
                        <td className="text-ink-3">The system sends</td>
                        <td className="text-ink-3">
                          Approved templates only
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="mt-10 border-t border-line pt-8">
                  <p className="t-label text-ink-4">limits that are always set</p>
                  <ul className="mt-6 flex flex-col gap-4">
                    {[
                      "Maximum messages per person per week",
                      "Quiet hours",
                      "A ceiling on the discount the system may offer",
                    ].map((x) => (
                      <li
                        key={x}
                        className="t-body t-thai flex gap-4 text-ink-2"
                      >
                        <span
                          className="mt-[0.75em] h-px w-4 shrink-0 bg-signal"
                          aria-hidden
                        />
                        {x}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </Section>

      {/* margin decision */}
      <Section tone="mist">
        <div className="shell">
          <div className="grid gap-14 lg:grid-cols-2 lg:gap-20">
            <Reveal>
              <div>
                <Label>The technical call that sets the margin</Label>
                <h2 className="t-h2 balance mt-9 text-ink">
                  Generate at the group level. Select at the individual level.
                </h2>
              </div>
            </Reveal>
            <Reveal delay={120}>
              <div className="flex flex-col gap-8">
                <p className="t-body t-thai pretty text-ink-2">
                  One LLM call per customer is money on fire — 25,000 customers sent
                twice a month is fifty thousand calls, for a single account.
                </p>
                <p className="t-body t-thai pretty text-ink-3">
                  So we generate one set of copy per cohort and substitute per person —
                near-identical outcome per customer, an order of magnitude less cost.
                </p>
                <p className="t-body t-thai pretty text-ink-3">
                  Choosing who receives which message stays a fully individual decision —
                that part is arithmetic, not an LLM, and it costs almost nothing.
                </p>
                <div className="border-t border-line pt-8">
                  <Quote>
                    This is the decision that makes the margin 70% or 40%. It has to be made
                before the first line of code, not when the bill arrives.
                  </Quote>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </Section>

      {/* portability */}
      <Section tone="paper" size="band-sm">
        <div className="shell">
          <Reveal>
            <div className="grid gap-10 border-t border-line pt-12 lg:grid-cols-[1fr_2fr] lg:gap-20">
              <div>
                <Label>Separated for expansion</Label>
              </div>
              <div className="grid gap-8 md:grid-cols-2">
                <div>
                  <p className="t-label text-signal">swappable local layer</p>
                  <p className="t-body t-thai mt-4 text-ink-2">
                    POS · messaging channel · regulation · language · currency
                  </p>
                </div>
                <div>
                  <p className="t-label text-ink-4">portable core</p>
                  <p className="t-body t-thai mt-4 text-ink-2">
                    Identity · matching · campaign generation · proof
                  </p>
                </div>
                <p className="t-small t-thai text-ink-3 md:col-span-2">
                  It costs 15–20% more now. Skip it and expansion means a rewrite —
              the axis is LINE: Thailand → Taiwan → Japan.
                  <Link href="/company#geography" className="ulink ml-2 text-signal">
                    See the geographic plan
                  </Link>
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </Section>

      <NextUp
        items={[
          { href: "/pricing", label: "Pricing", title: "What each layer costs to run" },
          { href: "/platform/keep", label: "Layer 3 · left", title: "Keep" },
          { href: "/platform/reach", label: "Layer 3 · right", title: "Reach" },
          { href: "/platform/proof", label: "Layer 5", title: "Proof" },
        ]}
      />

      <CTA />
    </>
  );
}
