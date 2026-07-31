import Link from "next/link";
import { db } from "@/lib/engine/db";
import { playById } from "@/lib/shared/plays";
import { roiSummary } from "@/lib/engine/proof";
import { getActiveTenantId } from "@/lib/shared/active-tenant";
import { profileFor } from "@/lib/shared/tenants";
import type { Verdict } from "@/lib/shared/types";
import {
  Empty,
  Metric,
  PageHead,
  Panel,
  VerdictPill,
  baht,
  num,
  pct,
} from "@/components/console/ui";
import { ciLabel } from "@/lib/shared/format";
import { measureAllAction } from "../../actions";
import { ActionForm } from "@/components/console/action-form";
import { demoToolsEnabled } from "@/lib/shared/demo-tools";

export const dynamic = "force-dynamic";

export default async function ProofPage() {
  const demoTools = demoToolsEnabled();
  const tenantId = await getActiveTenantId();
  const profile = profileFor(tenantId);
  const v = profile.vocab;
  const roi = roiSummary(tenantId);

  const rows = db()
    .prepare(
      `SELECT c.id, c.play_id, c.treated_size, c.holdout_size, c.approved_at,
              a.horizon_days, a.rph_treated, a.rph_holdout, a.lift_abs, a.lift_pct,
              a.ci_low, a.ci_high, a.verdict, a.matured
       FROM attributions a
       JOIN campaigns c ON c.id = a.campaign_id
       WHERE c.tenant_id = ? AND c.dry_run = 0
       ORDER BY c.approved_at DESC, a.horizon_days`,
    )
    .all(tenantId) as {
    id: string;
    play_id: string;
    treated_size: number;
    holdout_size: number;
    approved_at: string;
    horizon_days: number;
    rph_treated: number;
    rph_holdout: number;
    lift_abs: number;
    lift_pct: number;
    ci_low: number;
    ci_high: number;
    verdict: Verdict;
    matured: number;
  }[];

  const total = Object.values(roi.verdictMix).reduce((a, b) => a + b, 0);

  return (
    <>
      <PageHead
        label="Proof"
        title="Did what we sent actually work?"
        lead="Every campaign holds a group back and compares the two. The difference is what the message caused — not revenue that would have arrived anyway. And when it did not work, this page says so."
        actions={
          <ActionForm
            action={measureAllAction}
            fields={{ tenantId }}
            label="Measure what is due"
            pendingLabel="Measuring…"
          />
        }
      />

      {/* ── หน้านี้คือหน้าที่คนจะแคปไปแชร์ ──

          ตัวเลขบนนี้เป็นบาทกับเปอร์เซ็นต์ที่อ่านเหมือนผลจริงของธุรกิจจริง
          แถบบอกว่าเป็นเดโมอยู่บนสุดของคอลัมน์ก็จริง แต่ภาพที่ครอปเฉพาะ
          ตัวเลขจะไม่มีมันติดไปด้วย — คำกำกับต้องอยู่ติดกับตัวเลขเอง

          ขึ้นเฉพาะบนคอนโซลสาธารณะ ตอนพัฒนาไม่ต้องมี */}
      {!demoTools && (
        <Panel flat className="mb-6 border-l-2 border-[var(--c-warn)] p-5">
          <p className="c-label text-[var(--c-warn)]">synthetic dataset</p>
          <p className="c-thai mt-2.5 max-w-3xl text-[0.84rem] leading-relaxed text-[var(--c-text-2)]">
            Every figure below is computed for real by the engine — the holdout,
            the difference, the confidence interval — but from a generated dataset,
            not a live customer. No business has been measured with this yet, and we
            will not claim a lift until one has.
          </p>
        </Panel>
      )}

      {profile.measurementCaveat && (
        <Panel flat className="mb-6 p-5">
          <p className="c-label text-[var(--c-warn)]">how to read this account</p>
          <p className="c-thai mt-2.5 max-w-3xl text-[0.84rem] leading-relaxed text-[var(--c-text-2)]">
            {profile.measurementCaveat}
          </p>
        </Panel>
      )}

      <Panel className="mb-6 p-5 md:p-6">
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-4">
          <Metric
            label={`Cost per returning ${v.person}`}
            value={
              roi.costPerRepeatCustomer != null
                ? baht(roi.costPerRepeatCustomer)
                : "Not enough yet"
            }
            sub="Total spend ÷ people who came back because of a message"
            tone={roi.costPerRepeatCustomer != null ? "accent" : "muted"}
            size="lg"
          />
          <Metric
            label="90-day rolling difference"
            value={roi.liftBaht > 0 ? baht(roi.liftBaht) : "—"}
            sub="Across every measured campaign"
            tone={roi.liftBaht > 0 ? "good" : "muted"}
          />
          <Metric
            label="Spend"
            value={baht(roi.spendBaht)}
            sub="Messaging actually sent, plus discount given"
          />
          <Metric
            label="Cost per incremental baht"
            value={
              roi.costPerIncrementalBaht != null
                ? `฿${roi.costPerIncrementalBaht}`
                : "Not enough yet"
            }
            sub={
              roi.costPerIncrementalBaht != null
                ? `฿1 spent returns about ${baht(1 / roi.costPerIncrementalBaht)}`
                : "What one incremental baht costs"
            }
            tone={roi.costPerIncrementalBaht != null ? "plain" : "muted"}
          />
        </div>

        <hr className="c-hair my-6" />

        <div className="grid gap-6 md:grid-cols-[1fr_1.4fr]">
          <div>
            <p className="c-label">average difference, with confidence interval</p>
            <p className="c-thai mt-1.5 text-[0.74rem] text-[var(--c-text-4)]">
              Averaged across every measured campaign, including the inconclusive ones —
            average only the significant ones and the figure is always inflated.
            </p>
            {roi.avgLiftPct != null ? (
              <>
                <p className="c-num mt-3 text-[2.2rem] text-[var(--c-good)]">
                  {roi.avgLiftPct > 0 ? "+" : ""}
                  {pct(roi.avgLiftPct)}
                </p>
                <p className="c-mono mt-2 text-[0.78rem] text-[var(--c-text-3)]">
                  95% CI · {roi.ciLow!.toFixed(1)}% to{" "}
                  {roi.ciHigh!.toFixed(1)}%
                </p>
              </>
            ) : (
              <p className="c-thai mt-3 text-[0.85rem] text-[var(--c-warn)]">
                Not enough yet — needs a campaign at 90 days with a large enough holdout
              </p>
            )}
            {Object.keys(roi.horizonMix).length > 0 && (
              <p className="c-thai mt-3 text-[0.76rem] text-[var(--c-text-4)]">
                From{" "}
                {Object.entries(roi.horizonMix)
                  .map(([h, n]) => `${num(n)} at T+${h}`)
                  .join(" · ")}{" "}
                — each campaign is read at the most mature horizon it can support, so a
              usable T+30 result is not discarded just for being short of 90 days.
              </p>
            )}
          </div>

          <div>
            <p className="c-label">verdict mix</p>
            {total ? (
              <div className="mt-4 flex flex-col gap-3">
                {(
                  [
                    ["positive", "Worked", "var(--c-good)"],
                    ["no_effect", "No different", "var(--c-bad)"],
                    ["insufficient_data", "Not enough yet", "var(--c-warn)"],
                  ] as const
                ).map(([k, label, color]) => {
                  const n = roi.verdictMix[k];
                  return (
                    <div key={k}>
                      <div className="flex items-baseline justify-between gap-4">
                        <span className="c-thai text-[0.82rem] text-[var(--c-text-2)]">
                          {label}
                        </span>
                        <span className="c-mono text-[0.82rem] text-[var(--c-text-3)]">
                          {num(n)}
                        </span>
                      </div>
                      <div className="c-meter mt-1.5">
                        <span
                          style={{
                            width: `${(n / total) * 100}%`,
                            background: color,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="c-thai mt-3 text-[0.85rem] text-[var(--c-text-3)]">
                No measured campaigns yet
              </p>
            )}
          </div>
        </div>
      </Panel>

      {rows.length === 0 ? (
        <Empty>
          No results yet — approve a campaign from the Morning Brief, then measure what is due
        </Empty>
      ) : (
        <Panel className="p-5 md:p-6">
          <h2 className="c-h2 text-[var(--c-text)]">Every measured campaign</h2>
          <p className="c-thai mt-2 max-w-3xl text-[0.82rem] text-[var(--c-text-3)]">
            Per-head figures are “return rate × median basket of those who bought,”
          not raw revenue per head. The verdict is decided on the return rate, because
          raw revenue is too volatile to conclude on at cohorts of a few thousand.
          </p>
          <p className="c-thai mt-1.5 max-w-3xl text-[0.82rem] text-[var(--c-warn)]">
            Cohorts of 300–1,000 use the pooled 90-day mode — those rows show the same
            figures because they are concluded from a combined control group, not from
            that campaign alone.
          </p>
          <div className="c-scroll mt-5">
            <table className="c-table min-w-[62rem]">
              <thead>
                <tr>
                  <th>play</th>
                  <th>Horizon</th>
                  <th>Treated / held</th>
                  <th>Per head · treated</th>
                  <th>Per head · held</th>
                  <th>Difference</th>
                  <th>95% CI</th>
                  <th>Verdict</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.id}-${r.horizon_days}`}>
                    <td>
                      <span className="text-[var(--c-text)]">
                        {playById(r.play_id)?.name ?? r.play_id}
                      </span>
                    </td>
                    <td className="c-mono">T+{r.horizon_days}</td>
                    <td className="c-mono whitespace-nowrap">
                      {num(r.treated_size)} / {num(r.holdout_size)}
                    </td>
                    <td className="c-mono">{baht(r.rph_treated)}</td>
                    <td className="c-mono">{baht(r.rph_holdout)}</td>
                    {/* แสดงค่าประเมินเมื่อ "วัดได้แล้ว" แม้ยังสรุปไม่ได้
                        เพราะค่านั้นเข้าไปอยู่ในค่าเฉลี่ยด้านบนจริง ถ้าซ่อนไว้
                        ผู้ใช้จะกระทบยอดกับตัวเลขเรือธงไม่ได้

                        ที่ต้องซ่อนคือแถวที่ยังไม่ถึงกำหนดวัด ซึ่งไม่มีค่าประเมิน
                        อยู่เลย ตัวเลขในนั้นเป็นเพียงค่าจำลอง ไม่ใช่ผลจากข้อมูล */}
                    {r.matured !== 1 ? (
                      <>
                        <td className="c-mono text-[var(--c-text-4)]">—</td>
                        <td className="c-mono text-[var(--c-text-4)]">—</td>
                      </>
                    ) : (
                      <>
                        <td className="c-mono whitespace-nowrap">
                          <span
                            className={
                              r.lift_abs > 0
                                ? "text-[var(--c-good)]"
                                : "text-[var(--c-bad)]"
                            }
                          >
                            {r.lift_abs > 0 ? "+" : ""}
                            {pct(r.lift_pct)}
                          </span>
                        </td>
                        <td className="c-mono whitespace-nowrap text-[var(--c-text-3)]">
                          {ciLabel(r.ci_low, r.ci_high)}
                        </td>
                      </>
                    )}
                    <td>
                      <VerdictPill verdict={r.verdict} />
                    </td>
                    <td>
                      <Link
                        href={`/app/campaigns/${r.id}`}
                        className="c-btn c-btn-ghost c-btn-sm"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </>
  );
}
