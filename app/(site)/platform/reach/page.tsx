import type { Metadata } from "next";
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
  Steps,
} from "@/components/ui";
import { Reveal } from "@/components/reveal";
import { AudienceFunnel } from "@/components/specimen";

export const metadata: Metadata = {
  title: "Reach — your best customers train the next audience",
  description:
    "No guessing at who might convert. Start from who already returns at full price, then teach the ad platform who to look for.",
};

const STEPS = [
  {
    t: "Pick the seed",
    d: "Take the cohort that genuinely returns and pays full price — not the one with the highest lifetime total.",
    extra: "Those are usually different people. A high total built on discounts is not a good customer.",
  },
  {
    t: "Extract the signature",
    d: "What the seed cohort shares — first SKU, price band, channel, timing.",
  },
  {
    t: "Expand to the lookalikes",
    d: "Sync to Meta, TikTok and Google — hashed before it leaves, consented rows only — and let the platform find the lookalikes.",
    extra: "We never accumulate data on non-customers. We tell the ad platform who to look for.",
  },
  {
    t: "Build the ads and the landing page",
    d: "Three ad drafts and a landing page built around the SKU that cohort actually responds to. Test on a capped budget, then push the winner.",
  },
  {
    t: "Capture and hand off",
    d: "Leads are scored against the signature on arrival. The closest matches get contacted first, then everything flows into KEEP.",
    extra: "This is where the loop closes — the leads REACH finds become the data KEEP works and the numbers PROOF measures.",
  },
];

export default function ReachPage() {
  return (
    <>
      <PageHero
        label="Platform · Reach"
        title="Don’t start by guessing who might convert. Start from who already does."
        lead="Most lead tools start from an audience hypothesis. REACH starts from the people who actually came back at full price in this shop, and extracts what they look like."
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

          {/* ทุกขั้นคือการลบออก ไม่ใช่การเพิ่มเข้า — เห็นเป็นภาพชัดกว่าอ่าน */}
          <Reveal delay={150}>
            <div className="mt-14 max-w-2xl">
              <AudienceFunnel />
            </div>
          </Reveal>
        </div>
      </Section>

      {/* seed vs top spender */}
      <Section tone="mist">
        <div className="shell">
          <Reveal>
            <Label>The mistake everyone makes</Label>
          </Reveal>
          <Reveal delay={70}>
            <h2 className="t-h2 balance mt-9 max-w-3xl text-ink">
              Pick the wrong seed and every baht spent afterwards is wrong with it
            </h2>
          </Reveal>

          <div className="mt-14 grid gap-8 lg:grid-cols-2">
            <Reveal delay={60}>
              <Panel className="h-full border-t-2 border-t-ink-4">
                <p className="t-label text-ink-4">what most people pick</p>
                <h3 className="t-h3 mt-4 text-ink">Highest lifetime spend</h3>
                <p className="t-body t-thai pretty mt-5 text-ink-3">
                  The total is high because they bought heavily on discount. The lookalikes
                you get back are discount-waiters too. Cost per lead may look fine;
                cost per returning customer gets worse.
                </p>
              </Panel>
            </Reveal>
            <Reveal delay={130}>
              <Panel className="h-full border-t-2 border-t-signal">
                <p className="t-label text-signal">what reach picks</p>
                <h3 className="t-h3 mt-4 text-ink">
                  Customers who return at full price
                </h3>
                <p className="t-body t-thai pretty mt-5 text-ink-3">
                  Their totals may not be the highest, but they are what keeps the shop
                alive. Expand from them and you get people likely to return the same
                way — which is the number we measure.
                </p>
              </Panel>
            </Reveal>
          </div>

          <Reveal delay={200}>
            <div className="mt-14 max-w-3xl">
              <Quote>
                Ads that only bring one-time buyers aren’t bad ads. They are the platform
              doing exactly what it was told to look for.
              </Quote>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* data posture */}
      <Section tone="dark" className="overflow-hidden">
        <Field variant="deep" />
        <div className="shell">
          <div className="grid gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
            <Reveal>
              <div>
                <Label tone="light">
                  Where we stand on data
                </Label>
                <h2 className="t-h2 balance mt-9 text-frost">
                  We don’t accumulate data on non-customers
                </h2>
                <More label="detail">Ad platforms close off buyer data a little more every
              year. Hoarding data on people who are not yet customers runs against
              that current and carries legal risk. Instead we send a hashed signature
              and let the platform do what it is good at
                </More>
                <div className="mt-10">
                  <ArrowLink href="/trust" tone="light">
                    Consent and PDPA
                  </ArrowLink>
                </div>
              </div>
            </Reveal>

            <Reveal delay={120}>
              <div className="grid gap-px border border-cyan/12 bg-cyan/12">
                {[
                  {
                    t: "Hashed before it leaves",
                    d: "Identifiers are always hashed on the way out. The receiving platform can match without ever seeing raw data.",
                  },
                  {
                    t: "Consented rows only",
                    d: "The consent ledger binds to the identity, not the file. Withdraw consent and that person drops out of every audience next cycle.",
                  },
                  {
                    t: "The leads belong to the shop",
                    d: "Not to PARALLAX, and never reused across accounts.",
                  },
                ].map((x) => (
                  <div key={x.t} className="bg-abyss p-7">
                    <h3 className="t-h3 text-frost">{x.t}</h3>
                    <p className="t-small t-thai mt-4 text-frost/66">{x.d}</p>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </div>
      </Section>

      <Section tone="paper" size="band-sm">
        <div className="shell">
          <Reveal>
            <Note>
              REACH is available from Growth up. Media spend is billed by the ad platform
              directly — never through us, never hidden in the subscription.
            </Note>
          </Reveal>
        </div>
      </Section>

      <NextUp
        items={[
          { href: "/pricing", label: "Pricing", title: "What it costs to reach like this" },
          { href: "/platform/keep", label: "The other side", title: "Keep" },
          {
            href: "/platform/learning",
            label: "Why it sharpens over time",
            title: "Shared intelligence",
          },
          { href: "/platform/proof", label: "The measuring layer", title: "Proof" },
        ]}
      />

      <CTA />
    </>
  );
}
