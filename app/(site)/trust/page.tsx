import type { Metadata } from "next";
import {
  CTA,
  Card,
  Label,
  NextUp,
  Note,
  PageHero,
  Quote,
  Section,
} from "@/components/ui";
import { Reveal } from "@/components/reveal";

export const metadata: Metadata = {
  title: "Privacy and governance",
  description:
    "PDPA, a consent ledger, masking before processing, sending limits, and the line autopilot never crosses.",
};

const PRINCIPLES = [
  {
    t: "The shop's data belongs to the shop",
    d: "Names, numbers and purchase history stay inside that account. Never across accounts, never sold.",
  },
  {
    t: "Masked before processing",
    d: "Identifiers are separated before any calculation. The statistics run on masked data.",
  },
  {
    t: "Consent binds to the identity",
    d: "Withdraw consent and that identity drops out of every cohort and every audience the next cycle.",
  },
  {
    t: "Auditable after the fact",
    d: "Every send records who approved it, what went out, to whom, when, and under which consent.",
  },
  {
    t: "Hashed before export",
    d: "Custom audiences always use hashed identifiers, and only consented rows.",
  },
  {
    t: "Opt out of cycle-level learning",
    d: "Participation is a default you can switch off, not a condition of service. Switch it off and every feature still works.",
  },
];

const LIMITS = [
  { k: "Maximum messages per person per week", v: "Configurable, with a system ceiling above it" },
  { k: "Quiet hours", v: "Configurable, defaulting to nights and holidays" },
  { k: "Ceiling on system-proposed discounts", v: "Configurable; anything above it needs a human" },
  { k: "Autopilot on new copy", v: "Always off until a human has cleared the template" },
  {
    k: "Autopilot on regulated categories",
    v: "Permanently off — supplements, cosmetics, medical services",
  },
];

export default function TrustPage() {
  return (
    <>
      <PageHero
        label="Privacy and governance"
        title="A system that messages real people has to draw its lines first, not afterwards"
        lead="The first question an owner asks is not how clever the system is. It is whether sending this is legal. So we answer that before talking about features."
      />

      <Section tone="paper">
        <div className="shell">
          <Reveal>
            <Label>Enforced at the system level</Label>
          </Reveal>
          <Reveal delay={70}>
            <h2 className="t-h2 balance mt-9 max-w-3xl text-ink">
              All six are constraints in code, not sentences in a policy
            </h2>
          </Reveal>

          <div className="mt-16 grid gap-px bg-line md:grid-cols-2 xl:grid-cols-3">
            {PRINCIPLES.map((p, i) => (
              <Reveal key={p.t} delay={i * 50}>
                <div className="flex h-full flex-col gap-5 bg-paper p-8">
                  <span className="marker-num">0{i + 1}</span>
                  <h3 className="t-h3 text-ink">{p.t}</h3>
                  <p className="t-small t-thai text-ink-3">{p.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </Section>

      {/* limits */}
      <Section tone="mist">
        <div className="shell">
          <div className="grid gap-14 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
            <Reveal>
              <div>
                <Label>Limits that are always set</Label>
                <h2 className="t-h2 balance mt-9 text-ink">
                  A system that can send without limit is a system that gets the shop muted
                </h2>
                <p className="t-body t-thai pretty mt-8 max-w-md text-ink-3">
                  Over-messaging destroys the very asset we are helping build, so the caps
              exist at every tier — including the most expensive one.
                </p>
              </div>
            </Reveal>
            <Reveal delay={120}>
              <ul className="flex flex-col">
                {LIMITS.map((l, i) => (
                  <li
                    key={l.k}
                    className={`flex flex-col gap-2 border-t border-line py-6 md:flex-row md:items-baseline md:justify-between md:gap-10 ${
                      i === LIMITS.length - 1 ? "border-b border-b-line" : ""
                    }`}
                  >
                    <span className="t-body t-thai text-ink">{l.k}</span>
                    <span className="t-small t-thai shrink-0 text-ink-3 md:max-w-[18rem] md:text-right">
                      {l.v}
                    </span>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </div>
      </Section>

      {/* pdpa */}
      <Section tone="paper">
        <div className="shell">
          <div className="grid gap-14 lg:grid-cols-2 lg:gap-20">
            <Reveal>
              <div>
                <Label>PDPA</Label>
                <h2 className="t-h2 balance mt-9 text-ink">
                  The shop is the controller. We are the processor.
                </h2>
                <p className="t-body t-thai pretty mt-8 text-ink-3">
                  That relationship defines everything. The shop owns the base, sets the
                purpose, and is who the customer consented to. We process on the
                shop's instruction, under a data processing agreement.
                </p>
              </div>
            </Reveal>
            <Reveal delay={120}>
              <div className="flex flex-col gap-6">
                {[
                  {
                    t: "Consent templates",
                    d: "For point of sale, forms and LINE OA, separating contact purposes from marketing.",
                  },
                  {
                    t: "Data subject rights",
                    d: "Access, correction, withdrawal and erasure — every request has a path through the system, not a spreadsheet edited by hand.",
                  },
                  {
                    t: "Data processing agreement",
                    d: "Offered at every tier including the free one, not reserved for enterprise.",
                  },
                  {
                    t: "Data residency",
                    d: "Customer data is processed and stored in region, with a record of which sub-processors touched what.",
                  },
                ].map((x) => (
                  <Card key={x.t}>
                    <h3 className="t-h3 text-ink">{x.t}</h3>
                    <p className="t-small t-thai mt-4 text-ink-3">{x.d}</p>
                  </Card>
                ))}
              </div>
            </Reveal>
          </div>

          <Reveal delay={200}>
            <div className="mt-16 max-w-3xl">
              <Quote>
                A system that sends on someone's behalf has to make the wrong send harder
              than the right one — not merely warn about it in a document.
              </Quote>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* terms */}
      <Section tone="mist" id="terms" size="band-sm">
        <div className="shell">
          <Reveal>
            <div className="grid gap-10 lg:grid-cols-[1fr_2fr] lg:gap-20">
              <div>
                <Label>Legal documents</Label>
              </div>
              <div className="flex flex-col gap-8">
                <p className="t-body t-thai pretty text-ink-2">
                  The full privacy policy, terms of use and data processing agreement are in
              legal review, and publish alongside the opening of the pilot programme.
                </p>
                <Note>
                  In the meantime we are glad to send all three drafts ahead of time to
              anyone considering the pilot — contact{" "}
                  <a
                    href="mailto:privacy@parallax.co.th"
                    className="ulink text-signal"
                  >
                    privacy@parallax.co.th
                  </a>
                </Note>
              </div>
            </div>
          </Reveal>
        </div>
      </Section>

      <NextUp
        items={[
          {
            href: "/platform/learning",
            label: "Platform",
            title: "What crosses accounts, and what never does",
          },
          { href: "/platform", label: "Platform", title: "Identity and consent" },
          { href: "/contact", label: "Contact", title: "Request the drafts" },
        ]}
      />

      <CTA />
    </>
  );
}
