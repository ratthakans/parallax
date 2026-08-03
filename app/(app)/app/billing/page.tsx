import Link from "next/link";
import { getActiveTenantId } from "@/lib/shared/active-tenant";
import { profileFor } from "@/lib/shared/tenants";
import {
  recentCampaignCosts,
  planForBaseSize,
  usageFor,
} from "@/lib/engine/billing";
import {
  CAP_ROWS,
  CREDIT_PACKS,
  MESSAGE_COST_BAHT,
  PLANS,
  PLAN_ORDER,
  annualBaht,
  annualDiscountPct,
  capLabel,
  perMessage,
} from "@/lib/shared/plans";
import { roiSummary } from "@/lib/engine/proof";
import { playById } from "@/lib/shared/plays";
import { Empty, Metric, PageHead, Panel, baht, num } from "@/components/console/ui";
import { buyCreditsAction, changePlanAction } from "../../actions";
import { ActionForm } from "@/components/console/action-form";

export const dynamic = "force-dynamic";

const date = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/* แถบวัดที่ต้องอ่านออกว่า "ใกล้เต็มหรือยัง" ไม่ใช่แค่ดูสวย
   จึงเปลี่ยนสีที่ 80% — จุดที่ยังมีเวลาทำอะไรได้ ไม่ใช่ที่ 100% */
function Bar({ pct }: { pct: number }) {
  const p = Math.min(100, Math.max(0, pct));
  const colour =
    p >= 100
      ? "var(--c-bad)"
      : p >= 80
        ? "var(--c-warn)"
        : "var(--c-accent)";
  return (
    <div className="c-meter mt-3" role="img" aria-label={`${Math.round(p)}% used`}>
      <span style={{ width: `${p}%`, background: colour }} />
    </div>
  );
}

export default async function BillingPage() {
  const tenantId = await getActiveTenantId();
  const profile = profileFor(tenantId);
  const v = profile.vocab;
  const u = await usageFor(tenantId);
  const plan = u.plan;
  const costs = await recentCampaignCosts(tenantId);
  const roi = await roiSummary(tenantId);

  const suggested = planForBaseSize(u.identified);
  const packRate = u.messagesThisPeriod > 0 ? u.creditSpendThisPeriod : 0;

  /* คำถามเดียวที่ตอบยากที่สุดในหน้านี้: คุ้มไหม
     ตัวเลขซ้ายคือค่าใช้จ่ายที่จ่ายจริง ตัวเลขขวาคือยอดเพิ่มที่ "วัดได้"
     ไม่ใช่ที่ประมาณ — ถ้ายังวัดไม่ได้ต้องเขียนว่ายังวัดไม่ได้ */
  const measuredLift = roi.liftBaht;
  const yearlyFee = (plan.monthlyBaht ?? 0) * 12;

  return (
    <>
      <PageHead
        label="ค่าใช้จ่าย"
        title={`${plan.name} — what you paid, and what came back`}
        lead={`The subscription is priced on identifiable ${v.people}. Messaging is prepaid credits, never hidden inside the fee.`}
      />

      {u.overCap && (
        <div className="c-panel-flat mb-6 border-l-2 border-[var(--c-bad)] p-5">
          <p className="c-label text-[var(--c-bad)]">over the plan cap</p>
          <p className="c-thai mt-2 max-w-3xl text-[0.87rem] leading-relaxed text-[var(--c-text-2)]">
            The base holds {num(u.identified)} identifiable {v.people}, past the{" "}
            {num(plan.contactCap ?? 0)} cap on {plan.name} — the next import will be
            refused until you upgrade.
          </p>
        </div>
      )}

      {/* ── รอบบิลนี้ ── */}
      <Panel className="mb-6 p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="c-h2 text-[var(--c-text)]">This billing period</h2>
            <p className="c-mono mt-1.5 text-[0.78rem] text-[var(--c-text-3)]">
              {date(u.period.start.toISOString())} –{" "}
              {date(new Date(u.period.end.getTime() - 1).toISOString())} · {" "}
              {u.period.daysLeft} days left
            </p>
          </div>
          <span className="c-pill c-pill-keep">Cuts on day {u.billingDay}</span>
        </div>

        <div className="mt-6 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label="ค่าบริการรายเดือน"
            value={plan.monthlyBaht == null ? "Let's talk" : baht(plan.monthlyBaht)}
            sub={`${plan.name} · per month`}
          />
          <Metric
            label="เครดิตที่ซื้อรอบนี้"
            value={baht(u.creditSpendThisPeriod)}
            sub={
              u.purchasesThisPeriod.length
                ? `${u.purchasesThisPeriod.length} purchase(s)`
                : "Nothing bought yet"
            }
            tone={packRate > 0 ? "plain" : "muted"}
          />
          <Metric
            label="รวมรอบนี้"
            value={baht(u.invoiceThisPeriod)}
            tone="accent"
            sub="ค่าบริการ + เครดิต"
          />
          <Metric
            label="ค่าส่งที่เกิดขึ้นจริง"
            value={baht(u.messageCostThisPeriod)}
            sub={`${num(u.messagesThisPeriod)} messages × ฿${MESSAGE_COST_BAHT}`}
            tone="muted"
          />
        </div>
      </Panel>

      {/* ── สองเพดานที่คิดเงิน ── */}
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Panel className="p-5 md:p-6">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="c-h2 text-[var(--c-text)]">Identifiable {v.people}</h2>
            <span className="c-mono text-[0.8rem] text-[var(--c-text-3)]">
              {num(u.identified)}
              {u.contactCap != null && ` / ${num(u.contactCap)}`}
            </span>
          </div>
          <Bar pct={u.contactPct ?? 0} />
          <p className="c-thai mt-4 text-[0.8rem] leading-relaxed text-[var(--c-text-3)]">
            {u.contactCap == null
              ? `${plan.name} has no numeric cap — agreed by contract`
              : u.contactPct != null && u.contactPct >= 80
                ? `${Math.round(u.contactPct)}% of the cap used — room for ${num(u.contactCap - u.identified)} more`
                : `Room for ${num(Math.max(0, u.contactCap - u.identified))} more before the cap`}
          </p>
          <p className="c-thai mt-2 text-[0.76rem] text-[var(--c-text-4)]">
            นับคนที่มีตัวระบุอย่างน้อยหนึ่งอย่าง เพื่อให้จับคู่หรือติดต่อได้
            ไม่ใช่นับจำนวนแถวในไฟล์ที่นำเข้า
          </p>
        </Panel>

        <Panel className="p-5 md:p-6">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="c-h2 text-[var(--c-text)]">Message credits</h2>
            <span className="c-mono text-[0.8rem] text-[var(--c-text-3)]">
              {num(u.creditsLeft)} left
            </span>
          </div>
          <Bar
            pct={
              u.creditsLeft + u.messagesThisPeriod > 0
                ? (u.messagesThisPeriod / (u.creditsLeft + u.messagesThisPeriod)) * 100
                : 0
            }
          />
          <p className="c-thai mt-4 text-[0.8rem] leading-relaxed text-[var(--c-text-3)]">
            {num(u.messagesThisPeriod)} messages sent this period
            {u.creditRunwayDays != null &&
              ` — at this rate the balance lasts about ${num(u.creditRunwayDays)} more days`}
          </p>
          <p className="c-thai mt-2 text-[0.76rem] text-[var(--c-text-4)]">
            เครดิตหมดเมื่อไรการส่งหยุดทันที ไม่มีการเรียกเก็บย้อนหลัง ไม่มียอดติดลบ —
            แคมเปญที่ค้างจะรายงานตรง ๆ ว่าเหลือกี่คนที่ยังรออยู่
          </p>

          <div className="mt-6 grid gap-2.5 border-t border-[var(--c-line)] pt-5 sm:grid-cols-3">
            {CREDIT_PACKS.map((pk) => (
              <ActionForm
                key={pk.messages}
                action={buyCreditsAction}
                fields={{ tenantId, messages: pk.messages }}
                buttonClassName="w-full flex-col !py-2.5"
                pendingLabel="กำลังเพิ่ม…"
                label={
                  <>
                    <span className="c-mono text-[0.82rem]">+{num(pk.messages)}</span>
                    <span className="text-[0.72rem] text-[var(--c-text-4)]">
                      {baht(pk.baht)} · ฿{perMessage(pk).toFixed(2)}/msg
                    </span>
                  </>
                }
              />
            ))}
          </div>
        </Panel>
      </div>

      {/* ── คุ้มไหม ── */}
      <Panel className="mb-6 p-5 md:p-6">
        <h2 className="c-h2 text-[var(--c-text)]">Is it paying?</h2>
        <p className="c-thai mt-1.5 max-w-3xl text-[0.83rem] text-[var(--c-text-3)]">
          Actual spend against the lift <em>measured</em> from a control group — not
          a projection from response rates.
        </p>
        <div className="mt-6 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label="ค่าบริการต่อปี"
            value={yearlyFee > 0 ? baht(yearlyFee) : "Let's talk"}
            sub={
              annualBaht(plan) != null
                ? `Annual ${baht(annualBaht(plan)!)} — saves ${annualDiscountPct}%`
                : undefined
            }
          />
          <Metric
            label="ค่าส่งสะสมทั้งหมด"
            value={baht(u.messagesAllTime * MESSAGE_COST_BAHT)}
            sub={`${num(u.messagesAllTime)} messages since the account opened`}
            tone="muted"
          />
          <Metric
            label="ส่วนต่างที่วัดได้"
            value={measuredLift > 0 ? baht(measuredLift) : "Not measurable yet"}
            sub={
              roi.campaigns > 0
                ? `From ${roi.campaigns} matured campaigns`
                : "No campaign has matured yet"
            }
            tone={measuredLift > 0 ? "good" : "muted"}
          />
          {/* หน้า Proof แสดง "ต้นทุนต่อบาทที่เพิ่มขึ้น" ซึ่งออกมาเป็น ฿0.0062
              เลขที่เล็กกว่าหนึ่งสตางค์อ่านไม่ออกว่าดีหรือแย่ หน้านี้เป็น
              หน้าเรื่องเงินเข้าเงินออก จึงกลับด้านให้เป็นสิ่งที่ตอบคำถามตรง ๆ */}
          <Metric
            label="ได้กลับมาต่อทุก ฿1 ที่จ่าย"
            value={
              roi.costPerIncrementalBaht != null && roi.costPerIncrementalBaht > 0
                ? baht(1 / roi.costPerIncrementalBaht)
                : "—"
            }
            sub={
              roi.costPerIncrementalBaht != null
                ? "The denominator includes discount actually given, not just delivery"
                : "Needs a conclusive result first"
            }
            tone={roi.costPerIncrementalBaht != null ? "accent" : "muted"}
          />
        </div>
        <p className="c-thai mt-6 max-w-3xl text-[0.78rem] leading-relaxed text-[var(--c-text-4)]">
          “Measured lift” averages every matured campaign, not only the significant
          ones — averaging only the winners is systematically inflated. Detail at{" "}
          <Link href="/app/proof" className="text-[var(--c-cyan)] underline">
            Proof
          </Link>
        </p>
        {/* ตัวเลขนี้สูงเกินจริงในบัญชีตัวอย่าง และต้องเขียนไว้ตรงนี้
            ไม่ใช่ปล่อยให้เข้าใจว่าเป็นผลจากร้านจริง — ชุดข้อมูลสังเคราะห์
            ถูกใส่ผลของแคมเปญไว้ที่ +28% ซึ่งสูงกว่าที่คาดจากร้านจริง
            และแคมเปญที่ไม่ให้ส่วนลดจะมีตัวหารเป็นค่าส่งข้อความล้วน ๆ */}
        <p className="c-thai mt-4 max-w-3xl border-l-2 border-[var(--c-warn)] pl-4 text-[0.78rem] leading-relaxed text-[var(--c-text-3)]">
          บัญชีนี้ใช้ชุดข้อมูลจำลอง ตัวเลขผลตอบแทนจึงสูงกว่าที่ร้านจริงควรคาดหวังมาก
            โดยเฉพาะแคมเปญที่ไม่มีส่วนลด
        </p>
      </Panel>

      {/* ── ค่าส่งรายแคมเปญ ── */}
      <Panel className="mb-6 p-5 md:p-6">
        <h2 className="c-h2 text-[var(--c-text)]">Delivery cost by campaign</h2>
        <p className="c-thai mt-1.5 max-w-3xl text-[0.83rem] text-[var(--c-text-3)]">
          เรียงล่าสุดก่อน — แถวที่ทำเครื่องหมายไว้นับเข้ารอบบิลนี้ ประวัติของบัญชีตัวอย่างยาวกว่าหนึ่งปี
            ส่วนใหญ่จึงอยู่นอกรอบ
        </p>
        {costs.length === 0 ? (
          <div className="mt-5">
            <Empty>Nothing has been sent yet</Empty>
          </div>
        ) : (
          <div className="c-scroll mt-5">
            <table className="c-table min-w-[34rem]">
              <thead>
                <tr>
                  <th>Play</th>
                  <th>Sent</th>
                  <th className="text-right">Recipients</th>
                  <th className="text-right">Cost</th>
                  <th className="text-right">This period</th>
                </tr>
              </thead>
              <tbody>
                {costs.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link
                        href={`/app/campaigns/${c.id}`}
                        className="text-[var(--c-text)] hover:text-[var(--c-cyan)]"
                      >
                        {playById(c.play_id)?.name ?? c.play_id}
                      </Link>
                    </td>
                    <td className="c-mono whitespace-nowrap text-[0.76rem]">
                      {date(c.last_sent_at)}
                    </td>
                    <td className="c-num text-right">{num(Number(c.sent))}</td>
                    <td className="c-num text-right">{baht(Number(c.cost))}</td>
                    <td className="text-right text-[var(--c-cyan)]">
                      {c.inPeriod ? "•" : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2} className="c-label">
                    Total this period
                  </td>
                  <td className="c-num text-right text-[var(--c-text)]">
                    {num(u.messagesThisPeriod)}
                  </td>
                  <td className="c-num text-right text-[var(--c-text)]">
                    {baht(u.messageCostThisPeriod)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Panel>

      {/* ── เปลี่ยนแผน ── */}
      <Panel className="p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="c-h2 text-[var(--c-text)]">All plans</h2>
            <p className="c-thai mt-1.5 max-w-2xl text-[0.83rem] text-[var(--c-text-3)]">
              This account is on {plan.name}
              {suggested !== plan.id &&
                ` — a base of ${num(u.identified)} qualifies for at least ${PLANS[suggested].name}`}
            </p>
          </div>
          <Link href="/pricing" className="c-btn c-btn-ghost c-btn-sm">
            See full pricing
          </Link>
        </div>

        <div className="c-scroll mt-6">
          <table className="c-table min-w-[42rem]">
            <thead>
              <tr>
                <th className="w-[15rem]" />
                {PLAN_ORDER.map((id) => (
                  <th
                    key={id}
                    className={
                      id === plan.id ? "text-[var(--c-cyan)]" : undefined
                    }
                  >
                    {PLANS[id].name}
                    {id === plan.id && " ·"}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="c-label">monthly subscription</td>
                {PLAN_ORDER.map((id) => (
                  <td key={id} className="c-num text-[var(--c-text)]">
                    {PLANS[id].monthlyBaht == null
                      ? "Let's talk"
                      : baht(PLANS[id].monthlyBaht!)}
                    {PLANS[id].priceSuffix ? ` ${PLANS[id].priceSuffix}` : ""}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="c-label">identifiable {v.people}</td>
                {PLAN_ORDER.map((id) => (
                  <td key={id} className="c-num">
                    {PLANS[id].contactCap == null
                      ? "Let's talk"
                      : num(PLANS[id].contactCap!)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="c-label">welcome credits (one time)</td>
                {PLAN_ORDER.map((id) => (
                  <td key={id} className="c-num">
                    {PLANS[id].welcomeCredits > 0
                      ? num(PLANS[id].welcomeCredits)
                      : "—"}
                  </td>
                ))}
              </tr>
              {CAP_ROWS.map((r) => (
                <tr key={r.key}>
                  <td className="c-thai text-[0.8rem] text-[var(--c-text-3)]">
                    {r.label}
                  </td>
                  {PLAN_ORDER.map((id) => {
                    const c = PLANS[id].caps[r.key];
                    return (
                      <td
                        key={id}
                        className={
                          c.kind === "no"
                            ? "text-[var(--c-text-4)]"
                            : c.kind === "roadmap"
                              ? "text-[var(--c-warn)]"
                              : "text-[var(--c-text-2)]"
                        }
                      >
                        {capLabel(c)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex flex-wrap gap-2.5 border-t border-[var(--c-line)] pt-5">
          {PLAN_ORDER.filter((id) => id !== plan.id).map((id) => (
            <ActionForm
              key={id}
              action={changePlanAction}
              fields={{ tenantId, plan: id }}
              label={`Move to ${PLANS[id].name}`}
              pendingLabel="กำลังเปลี่ยน…"
              size="sm"
            />
          ))}
        </div>
        <p className="c-thai mt-4 max-w-3xl text-[0.76rem] leading-relaxed text-[var(--c-text-4)]">
          การสลับแผนเป็นเครื่องมือเดโม — เขียนลงฐานข้อมูลตรง ๆ เพื่อให้เห็นว่าเพดานกัดตรงไหนจริง
            ลองเปลี่ยนเป็น Pilot แล้วกลับไปหน้าบรีฟ
        </p>
      </Panel>
    </>
  );
}
