import type { Metadata } from "next";
import { Label, PageHero, Section, Note, Card } from "@/components/ui";
import { Reveal } from "@/components/reveal";
import { ContactForm } from "@/components/contact-form";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Start a pilot, discuss a POS partnership, or request the investor materials.",
};

const CHANNELS = [
  {
    t: "Pilot programme",
    d: "Send six months of sales history and we return the first set of next-best actions before you commit to anything.",
    mail: "hello@parallax.co.th",
  },
  {
    t: "POS and agency partners",
    d: "Native API, app store placement, or managing several shops at once.",
    mail: "partners@parallax.co.th",
  },
  {
    t: "Investors",
    d: "The full materials — assumptions, the fallback plan, and what remains unproven.",
    mail: "investors@parallax.co.th",
  },
  {
    t: "Privacy and PDPA",
    d: "Request the draft data processing agreement, or exercise a data subject right.",
    mail: "privacy@parallax.co.th",
  },
];

export default function ContactPage() {
  return (
    <>
      <PageHero
        label="Contact"
        title="Tell us what your revenue cycle looks like and we will tell you plainly whether it fits"
        lead="If it doesn’t fit yet, you’ll hear that in the first conversation rather than after the sale."
      />

      <Section tone="paper">
        <div className="shell">
          <div className="grid gap-16 lg:grid-cols-[1.15fr_0.85fr] lg:gap-20">
            <Reveal>
              <div>
                <Label>The form</Label>
                <div className="mt-12">
                  <ContactForm />
                </div>
              </div>
            </Reveal>

            <Reveal delay={120}>
              <div className="flex flex-col gap-6">
                <Label>Or email us directly</Label>
                {CHANNELS.map((c) => (
                  <Card key={c.t}>
                    <h2 className="t-h3 text-ink">{c.t}</h2>
                    <p className="t-small t-thai mt-4 text-ink-3">{c.d}</p>
                    <a
                      href={`mailto:${c.mail}`}
                      className="ulink mt-5 inline-block t-small font-medium text-signal"
                    >
                      {c.mail}
                    </a>
                  </Card>
                ))}
                <Note>
                  PARALLAX · Bangkok, Thailand ·
                  We reply within two business days
                </Note>
              </div>
            </Reveal>
          </div>
        </div>
      </Section>
    </>
  );
}
