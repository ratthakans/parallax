import type { Metadata } from "next";
import Link from "next/link";
import {
  CTA,
  Panel,
  Label,
  More,
  NextUp,
  Note,
  PageHero,
  Quote,
  Section,
} from "@/components/ui";
import { Numeral, Reveal, Stagger } from "@/components/reveal";
import {
  CAP_ROWS,
  CREDIT_PACKS,
  MESSAGE_COST_BAHT,
  PLANS,
  PLAN_ORDER,
  annualBaht,
  annualDiscountPct,
  breakEvenBaht,
  capLabel,
  perMessage,
  type Plan,
} from "@/lib/shared/plans";

/* ทุกตัวเลขในหน้านี้มาจาก lib/plans.ts ซึ่งเป็นไฟล์เดียวกับที่ชั้น
   dispatch และหน้า /app/billing บังคับใช้ — ตารางราคาที่พิมพ์มือคือ
   ตารางราคาที่จะไม่ตรงกับสิ่งที่ระบบทำจริงภายในสัปดาห์แรก */

export const metadata: Metadata = {
  title: "Pricing",
  description:
    `Pilot ฿0 · Growth ฿${PLANS.growth.monthlyBaht?.toLocaleString("en-US")} · ` +
    `Multi ฿${PLANS.multi.monthlyBaht?.toLocaleString("en-US")} · ` +
    `Chain ฿${PLANS.chain.monthlyBaht?.toLocaleString("en-US")} and up — ` +
    "Priced on identities you can actually reach. Messages are prepaid credits, never hidden in the subscription.",
};

const th = (n: number) => n.toLocaleString("en-US");

const priceOf = (p: Plan) =>
  p.monthlyBaht == null ? "Let's talk" : th(p.monthlyBaht);

const FAQ: { q: string; a: string }[] = [
  {
    q: "Why isn't messaging included in the subscription?",
    a:
      `Sending costs about ฿${MESSAGE_COST_BAHT} a message. Fold that into the fee and ` +
      "your heaviest senders become your biggest losses — then everyone pays more. " +
      "Separate credits are what stop light users subsidising heavy ones.",
  },
  {
    q: "What happens if credits run out mid-campaign?",
    a:
      "It sends what the balance covers, then tells you exactly how many are still waiting. " +
      "No retroactive billing. Top up, press send again — nobody gets a duplicate.",
  },
  {
    q: "Do credits expire?",
    a: "Never. They sit in the account until spent, and no billing cycle resets them.",
  },
  {
    q: "How do you count an “identifiable customer”?",
    a:
      "Anyone carrying at least one identifier, so they can actually be reached — " +
      "not rows in a file. Cash walk-ins who left nothing behind are neither counted nor billed.",
  },
  {
    q: "What if the base outgrows the plan cap?",
    a:
      "The import is refused with the exact overage stated up front — not accepted " +
      "halfway through and followed by an invoice.",
  },
  {
    q: "What happens to the data if we cancel?",
    a:
      "The data is yours. Ask for the file back or ask us to erase all of it, any time. " +
      "Monthly plans carry no minimum term.",
  },
];

const NOT_READY = [
  {
    t: "Ingest API",
    d: "Drag-and-drop CSV only today. Works with almost every POS — but still by hand.",
  },
  {
    t: "Autopilot send",
    d: "Every campaign still needs a human approval — right for year one, not something to charge for.",
  },
  {
    t: "Live LINE delivery",
    d: "Logging and credit deduction are complete; the Messaging API connects when pilots begin.",
  },
];

export default function PricingPage() {
  return (
    <>
      <PageHero
        label="Pricing"
        title="Priced on identities you can reach. Not on seats."
        lead="The value we create scales with the size of the base, not with how many people log in. And there is no such thing as unlimited in a layer where we pay for the compute."
      />

      {/* free tier logic */}
      <Section tone="paper" size="band-sm">
        <div className="shell">
          <Reveal>
            <div className="grid gap-10 border-b border-line pb-12 lg:grid-cols-[1fr_1.4fr] lg:gap-20">
              <div>
                <Label>The Pilot logic</Label>
              </div>
              <div>
                <p className="t-h3 pretty text-ink">
                  Pilot is read-only. See where the revenue leaks, see how many are
                  about to go quiet — but you cannot fire.
                </p>
                
              </div>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* tier cards */}
      <Section tone="paper" size="band-sm">
        <div className="shell">
          <div className="grid gap-px bg-line md:grid-cols-2 xl:grid-cols-4">
            {PLAN_ORDER.map((id, i) => {
              const t = PLANS[id];
              const annual = annualBaht(t);
              return (
                <Reveal key={t.id} delay={i * 90} dir="scale">
                  <div
                    className={`flex h-full flex-col justify-between gap-10 p-8 ${
                      t.featured
                        ? "bg-white ring-1 ring-signal/40 ring-inset"
                        : "bg-paper"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <h2 className="t-h3 text-ink">{t.name}</h2>
                        {t.featured && (
                          <span className="t-label rounded-full bg-signal px-3 py-1.5 text-white">
                            start here
                          </span>
                        )}
                      </div>
                      <p className="mt-7 flex items-baseline gap-2">
                        <span className="t-numeral-lg text-ink">
                          <Numeral value={priceOf(t)} />
                        </span>
                        {t.monthlyBaht != null && t.monthlyBaht > 0 && (
                          <span className="t-small text-ink-4">
                            ฿ / month{t.priceSuffix ? ` ${t.priceSuffix}` : ""}
                          </span>
                        )}
                      </p>
                      {annual != null && annual > 0 && (
                        <p className="t-small mt-2.5 text-ink-4">
                          Annual ฿{th(annual)} — save {annualDiscountPct}%
                        </p>
                      )}

                      <dl className="mt-7 flex flex-col gap-2.5 border-t border-line pt-6">
                        <div className="flex items-baseline justify-between gap-3">
                          <dt className="t-small text-ink-4">
                            Identifiable customers
                          </dt>
                          <dd className="t-small text-ink">
                            {t.contactCap == null ? "Let's talk" : `Up to ${th(t.contactCap)}`}
                          </dd>
                        </div>
                        <div className="flex items-baseline justify-between gap-3">
                          <dt className="t-small text-ink-4">Welcome credits</dt>
                          <dd className="t-small text-ink">
                            {t.welcomeCredits > 0 ? th(t.welcomeCredits) : "—"}
                          </dd>
                        </div>
                        <div className="flex items-baseline justify-between gap-3">
                          <dt className="t-small text-ink-4">Can send for real</dt>
                          <dd className="t-small text-ink">
                            {t.caps.reach.kind === "yes" ? "✓" : "—"}
                          </dd>
                        </div>
                      </dl>

                      <p className="t-small t-thai mt-6 text-ink-3">{t.who}</p>
                    </div>
                    <Link
                      href="/contact"
                      className={`btn w-full ${
                        t.featured ? "btn-primary" : "btn-ghost"
                      }`}
                    >
                      {t.id === "free" ? "Start free" : "Talk to us"}
                    </Link>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </Section>

      {/* ── ค่าข้อความ ── */}
      <Section tone="mist">
        <div className="shell">
          <Reveal>
            <Label>Messaging — priced apart from the subscription</Label>
          </Reveal>

          <Reveal delay={70}>
            <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:gap-20">
              <p className="t-h3 pretty text-ink">
                Prepaid credits. It stops when they run out. No bill arrives later.
              </p>
              <div>
                <p className="t-body t-thai pretty text-ink-3">
                  The subscription buys software. Messaging tracks real usage. Merge
                  the two and the price you see stops being the price you pay.
                </p>
                <More label="what the margin covers">
                  Delivery costs about ฿{MESSAGE_COST_BAHT} a message. The margin is the
                  software riding along with each send — choosing the cohort, writing
                  the copy, holding back the control group, and measuring the result.
                </More>
              </div>
            </div>
          </Reveal>

          <Stagger
            step={100}
            start={140}
            dir="scale"
            className="mt-14 grid gap-px bg-line md:grid-cols-3"
          >
            {CREDIT_PACKS.map((pk) => (
              <div key={pk.messages} className="bg-mist p-8">
                  <p className="t-numeral-md text-ink">
                    <Numeral value={th(pk.messages)} />
                  </p>
                  <p className="t-small mt-1 text-ink-4">messages</p>
                  <p className="t-body mt-6 text-ink">฿{th(pk.baht)}</p>
                  <p className="t-small mt-1.5 text-ink-4">
                    ฿{perMessage(pk).toFixed(2)} per message
                  </p>
              </div>
            ))}
          </Stagger>

          <Reveal delay={210}>
            <div className="mt-12">
              <Note>
                Credits never expire and no billing cycle resets them · Reach media spend
                goes straight to the ad platform, never through us
              </Note>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* comparison */}
      <Section tone="paper">
        <div className="shell">
          <Reveal>
            <Label>What each tier includes</Label>
          </Reveal>

          <Reveal delay={80}>
            <div className="scroll-x mt-12">
              <table className="dtable min-w-[48rem]">
                <thead>
                  <tr>
                    <th className="w-[17rem]" />
                    {PLAN_ORDER.map((id) => (
                      <th
                        key={id}
                        className={PLANS[id].featured ? "text-signal" : undefined}
                      >
                        {PLANS[id].name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="t-small whitespace-nowrap text-ink-3">
                      Monthly subscription
                    </td>
                    {PLAN_ORDER.map((id) => (
                      <td
                        key={id}
                        className={
                          PLANS[id].featured
                            ? "font-medium text-signal"
                            : "text-ink"
                        }
                      >
                        {priceOf(PLANS[id])}
                        {PLANS[id].priceSuffix ? ` ${PLANS[id].priceSuffix}` : ""}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="t-small whitespace-nowrap text-ink-3">
                      Identifiable customers
                    </td>
                    {PLAN_ORDER.map((id) => (
                      <td
                        key={id}
                        className={
                          PLANS[id].featured
                            ? "font-medium text-signal"
                            : "text-ink"
                        }
                      >
                        {PLANS[id].contactCap == null
                          ? "Let's talk"
                          : `Up to ${th(PLANS[id].contactCap!)}`}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="t-small whitespace-nowrap text-ink-3">
                      Welcome credits (one time)
                    </td>
                    {PLAN_ORDER.map((id) => (
                      <td
                        key={id}
                        className={
                          PLANS[id].featured
                            ? "font-medium text-signal"
                            : PLANS[id].welcomeCredits === 0
                              ? "text-ink-4"
                              : "text-ink"
                        }
                      >
                        {PLANS[id].welcomeCredits > 0
                          ? th(PLANS[id].welcomeCredits)
                          : "—"}
                      </td>
                    ))}
                  </tr>
                  {CAP_ROWS.map((r) => (
                    <tr key={r.key}>
                      <td className="t-small t-thai whitespace-nowrap text-ink-3">
                        {r.label}
                      </td>
                      {PLAN_ORDER.map((id) => {
                        const c = PLANS[id].caps[r.key];
                        return (
                          <td
                            key={id}
                            className={
                              c.kind === "no"
                                ? "text-ink-4"
                                : c.kind === "roadmap"
                                  ? "text-ink-4 italic"
                                  : PLANS[id].featured
                                    ? "font-medium text-signal"
                                    : "text-ink"
                            }
                          >
                            {capLabel(c)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr>
                    <td className="t-small whitespace-nowrap text-ink-3">
                      Seats
                    </td>
                    {PLAN_ORDER.map((id) => (
                      <td key={id} className="text-ink">
                        Unlimited
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </Reveal>

          <Reveal delay={160}>
            <div className="mt-12">
              <Note>
                Anything marked “in build” does not exist today — we do not charge for it,
                and it is not a reason to move up a tier
              </Note>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* ── จุดคุ้มทุน ── */}
      <Section tone="dark">
        <div className="shell">
          <Reveal>
            {/* แถบนี้เป็น surface-dark — ป้ายต้องใช้โทนสำหรับพื้นเข้ม
                เดิมเขียน tone="dark" เพราะอ่านว่า "แถบนี้เข้ม" แต่ tone
                หมายถึงสีตัวอักษร ป้ายจึงเป็น ink-4 บนพื้น abyss = 3.84:1 */}
            <Label onDark>
              What it takes to break even
            </Label>
          </Reveal>
          <Reveal delay={70}>
            <p className="t-h3 pretty mt-10 max-w-3xl text-frost">
              The question isn’t “is it expensive.” It’s “how much incremental
              revenue clears a year of subscription.”
            </p>
            <p className="t-small t-thai mt-5 text-frost/50">
              Incremental revenue per year to break even, at a 40% gross margin
            </p>
          </Reveal>

          <Reveal delay={140}>
            <div className="mt-14 grid gap-8 md:grid-cols-3">
              {PLAN_ORDER.filter((id) => breakEvenBaht(PLANS[id]) != null).map(
                (id) => {
                  const p = PLANS[id];
                  const be = breakEvenBaht(p)!;
                  return (
                    <div key={id} className="border-t border-frost/20 pt-7">
                      <p className="t-label text-frost/50">{p.name}</p>
                      <p className="t-numeral-md mt-4 text-cyan">
                        <Numeral value={`฿${th(be)}`} />
                      </p>
                      <p className="t-small t-thai mt-4 text-frost/60">
                        about ฿{th(Math.round(be / 12))} a month
                      </p>
                    </div>
                  );
                },
              )}
            </div>
          </Reveal>

          <Reveal delay={210}>
            <p className="t-small t-thai pretty mt-14 max-w-3xl text-frost/50">
              A bar we have to clear, not a promise that we will. The console measures
              the real thing against a control group — if it doesn’t pay, you’ll see
              that it doesn’t pay.
            </p>
          </Reveal>
        </div>
      </Section>

      {/* honesty on billing */}
      <Section tone="paper">
        <div className="shell">
          <Reveal>
            <Label>Things we deliberately don’t do</Label>
          </Reveal>
          <div className="mt-14 grid gap-8 md:grid-cols-3">
            {[
              {
                t: "No such thing as unlimited",
                d: "In a layer where we pay for the compute, your heaviest users become your biggest losses — and then everyone pays more.",
              },
              {
                t: "No messaging hidden in the fee",
                d: "Split out as visible credits, never averaged into the price so light users subsidise heavy ones.",
              },
              {
                t: "No per-seat billing",
                d: "How many people log in has nothing to do with the value delivered. Same base, same price.",
              },
            ].map((x, i) => (
              <Reveal key={x.t} delay={i * 80}>
                <Panel className="h-full">
                  <span className="marker-num">0{i + 1}</span>
                  <h3 className="t-h3 mt-4 text-ink">{x.t}</h3>
                  <p className="t-small t-thai mt-5 text-ink-3">{x.d}</p>
                </Panel>
              </Reveal>
            ))}
          </div>

          <Reveal delay={240}>
            <div className="mt-16 max-w-3xl">
              <Quote>
                The line to watch is messaging. Without separate credits, your heaviest
                customer becomes your most expensive one.
              </Quote>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* ── ยังไม่พร้อม ── */}
      <Section tone="mist">
        <div className="shell">
          <Reveal>
            <Label>Not ready yet — and not billed for</Label>
          </Reveal>
          <Reveal delay={70}>
            <p className="t-body t-thai pretty mt-10 max-w-3xl text-ink-3">
              A price sheet that sells what doesn’t exist is a debt repaid on day one.
            </p>
          </Reveal>
          <Stagger step={90} className="mt-14 grid gap-8 md:grid-cols-3">
            {NOT_READY.map((x) => (
              <div key={x.t} className="border-t border-line pt-7">
                <p className="t-label text-ink-4">in build</p>
                <h3 className="t-h3 mt-4 text-ink">{x.t}</h3>
                <p className="t-small t-thai mt-5 text-ink-3">{x.d}</p>
              </div>
            ))}
          </Stagger>
        </div>
      </Section>

      {/* ── คำถามที่ถามจริง ── */}
      <Section tone="paper">
        <div className="shell">
          <Reveal>
            <Label>Questions people actually ask</Label>
          </Reveal>
          <Stagger step={60} className="mt-12 grid gap-px bg-line lg:grid-cols-2">
            {FAQ.map((f) => (
              <div key={f.q} className="h-full bg-paper p-8">
                <h3 className="t-body t-thai text-ink">{f.q}</h3>
                <More label="answer">{f.a}</More>
              </div>
            ))}
          </Stagger>
        </div>
      </Section>

      <NextUp
        items={[
          { href: "/product#features", label: "Product", title: "Every feature" },
          { href: "/contact", label: "Start", title: "Talk about a pilot" },
          { href: "/investors", label: "Investors", title: "The economics behind the price" },
        ]}
      />

      <CTA />
    </>
  );
}
