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
} from "@/components/ui";
import { Reveal } from "@/components/reveal";

export const metadata: Metadata = {
  title: "Cycles we take",
  description:
    "Replenish · Recall · Expiry · Considered — we filter on the shape of the revenue cycle, never the industry label.",
};

const SHAPES = [
  {
    name: "Replenish",
    signal: "The gap between purchases, per person",
    engine:
      "The system learns each customer's own cycle and flags them when they drift past it — not past the shop average.",
    industries: [
      "Restaurants",
      "Cafés",
      "Retail",
      "D2C skincare and supplements",
      "Pet food",
    ],
    example:
      "Someone who buys coffee every three days and disappears for nine is a signal. Someone on a thirty-day rhythm is not.",
  },
  {
    name: "Recall",
    signal: "The date the last service says they should return",
    engine:
      "The cycle is set by the last service performed, so the system knows in advance who should be contacted in which week.",
    industries: [
      "Aesthetic clinics",
      "Dental",
      "Auto service",
      "Veterinary",
      "Spas and salons",
    ],
    example:
      "A six-week treatment cycle should be contacted in week five, not week nine when they have already gone elsewhere.",
  },
  {
    name: "Expiry",
    signal: "The end date of a membership or course",
    engine:
      "An expiry date is the day an entire block of value disappears at once. The ranking follows value at risk, not the calendar.",
    industries: [
      "Gyms",
      "Golf courses and driving ranges",
      "Tutoring schools",
      "Insurance",
      "subscription",
    ],
    example:
      "A member with one session left needs contact before one whose membership expires in two months but who still attends regularly.",
  },
  {
    name: "Considered",
    signal: "Interest signals ahead of a large purchase",
    engine:
      "The system collects the traces of interest that precede a big purchase, then ranks which lead is closest to deciding.",
    industries: [
      "Golf equipment",
      "Automotive",
      "Furniture",
      "Property",
      "Travel and hotels",
    ],
    example:
      "Someone who paid for a fitting and has not bought is the hottest lead in the base, and the shortest path to a high-margin sale.",
  },
];

const CRITERIA = [
  {
    t: "At least six months of purchase history",
    d: "Anything shorter is not enough for the system to learn each customer's cycle.",
  },
  {
    t: "At least one way to identify a customer",
    d: "Phone, email or member ID. If none exist yet, we provide point-of-sale capture so you can start accumulating.",
  },
  {
    t: "At least one person who can approve a campaign",
    d: "Approval is the default mode. With nobody to approve, nothing sends.",
  },
];

export default function CustomersPage() {
  return (
    <>
      <PageHero
        label="Customers"
        title="We filter on the shape of the revenue cycle, not the industry label"
        lead="A single location works. Not being a shop at all works. The engine predicts from the cycle, not from the sign above the door. These four have exactly one thing in common — their customers have a moment that deserves contact."
      />

      <Section tone="paper">
        <div className="shell">
          <Reveal>
            <Label>Four shapes</Label>
          </Reveal>

          <div className="mt-14 flex flex-col">
            {SHAPES.map((s, i) => (
              <Reveal key={s.name} delay={i * 60}>
                <article
                  className={`grid gap-8 border-t border-line py-12 lg:grid-cols-[14rem_1fr_1fr] lg:gap-12 ${
                    i === SHAPES.length - 1 ? "border-b border-b-line" : ""
                  }`}
                >
                  <div>
                    <span className="marker-num">0{i + 1}</span>
                    <h2 className="t-h2 mt-3 text-ink">{s.name}</h2>
                    <p className="t-small t-thai mt-4 text-signal">{s.signal}</p>
                  </div>

                  <div>
                    <p className="t-body t-thai pretty text-ink-2">{s.engine}</p>
                    <p className="t-small t-thai mt-6 border-l border-line pl-5 text-ink-3">
                      {s.example}
                    </p>
                  </div>

                  <div>
                    <p className="t-label text-ink-4">industries in this shape</p>
                    <ul className="mt-5 flex flex-wrap gap-2">
                      {s.industries.map((ind) => (
                        <li
                          key={ind}
                          className="t-small rounded-full border border-line px-3.5 py-1.5 text-ink-2"
                        >
                          {ind}
                        </li>
                      ))}
                    </ul>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </Section>

      {/* criteria */}
      <Section tone="mist">
        <div className="shell">
          <div className="grid gap-14 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20">
            <Reveal>
              <div>
                <Label>Pilot qualification</Label>
                <h2 className="t-h2 balance mt-9 text-ink">
                  Three criteria, none of them about size
                </h2>
                <More label="why">We do not ask how many locations you have, what you turn
              over, or which POS you run — none of those predict whether the engine
              will work
                </More>
              </div>
            </Reveal>

            <Reveal delay={120}>
              <div className="grid gap-6">
                {CRITERIA.map((c, i) => (
                  <Panel key={c.t}>
                    <div className="flex gap-6">
                      <span className="t-numeral t-h3 text-ink-4">
                        0{i + 1}
                      </span>
                      <div>
                        <h3 className="t-h3 text-ink">{c.t}</h3>
                        <p className="t-small t-thai mt-3 text-ink-3">{c.d}</p>
                      </div>
                    </div>
                  </Panel>
                ))}
              </div>
            </Reveal>
          </div>
        </div>
      </Section>

      {/* one cycle at a time */}
      <Section tone="dark" className="overflow-hidden">
        <Field variant="deep" />
        <div className="shell">
          <div className="grid gap-14 lg:grid-cols-2 lg:gap-20">
            <Reveal>
              <div>
                <Label tone="light">
                  How we enter the market
                </Label>
                <h2 className="t-h2 balance mt-9 text-frost">
                  Deep in one cycle at a time, never broad across industries
                </h2>
              </div>
            </Reveal>
            <Reveal delay={120}>
              <div className="flex flex-col gap-8">
                <p className="t-lead t-thai pretty text-frost/70">
                  Forty accounts in one cycle are worth more than forty spread across four
                </p>
                <More label="why">Because cross-account learning happens inside a single
              cycle. Spread thin and no cycle accumulates enough for a signature to
              work, so every shop gets the same beginner-grade result
                </More>
                <div className="border-t border-cyan/12 pt-8">
                  <Quote tone="light">
                    We turn down deals outside the cycle we are working, even ones that would
              pay — because they make the result worse for the customers we have.
                  </Quote>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </Section>

      <Section tone="paper" size="band-sm">
        <div className="shell">
          <Reveal>
            <Note>
              A business with no way to tie an identity to a receipt is not ready for
              PARALLAX as it stands today — and we say so in the first conversation
              rather than selling and disappointing later.
            </Note>
          </Reveal>
        </div>
      </Section>

      <NextUp
        items={[
          { href: "/playbook", label: "Real data", title: "Validation — MST Golf" },
          {
            href: "/platform/learning",
            label: "Why one cycle at a time",
            title: "Shared intelligence",
          },
          { href: "/pricing", label: "Pricing", title: "The tier that fits your base" },
        ]}
      />

      <CTA />
    </>
  );
}
