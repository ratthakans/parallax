import { loadFeatures } from "@/lib/engine/derive";
import { getActiveTenantId } from "@/lib/shared/active-tenant";
import { profileFor } from "@/lib/shared/tenants";
import type { DiscountAffinity, ReachableBy } from "@/lib/shared/types";
import { Metric, PageHead, Panel, baht, num, pct } from "@/components/console/ui";
import { deriveAction } from "../../actions";
import { ActionForm } from "@/components/console/action-form";

export const dynamic = "force-dynamic";

const REACHABLE_LABEL: Record<ReachableBy, string> = {
  line: "Reachable on LINE",
  email: "Reachable by email",
  paid_only: "Consented, no direct channel",
  none: "No consent — cannot send or export",
};

const AFFINITY_LABEL: Record<DiscountAffinity, string> = {
  full_price: "Full price",
  mixed: "Mixed",
  discount_seeker: "Waits for discounts",
};

export default async function CustomersPage() {
  const tenantId = await getActiveTenantId();
  const v = profileFor(tenantId).vocab;
  const features = await loadFeatures(tenantId);

  const ever = features.filter((f) => f.frequency_total > 0);
  const repeat = features.filter((f) => f.frequency_total >= 2);
  const recent30 = features.filter((f) => f.frequency_total > 0 && f.recency_days <= 30);
  const silent90 = features.filter((f) => f.frequency_total > 0 && f.recency_days > 90);
  const estimated = features.filter((f) => f.cycle_is_estimated && f.frequency_total > 0);

  const revenue = features.reduce((s, f) => s + f.monetary_ltv, 0);
  const sortedByLtv = [...features].sort((a, b) => b.monetary_ltv - a.monetary_ltv);
  const top2 = sortedByLtv.slice(0, Math.round(features.length * 0.02));
  const top2Share = revenue
    ? (top2.reduce((s, f) => s + f.monetary_ltv, 0) / revenue) * 100
    : 0;

  const reachMix = features.reduce<Record<string, number>>((acc, f) => {
    acc[f.reachable_by] = (acc[f.reachable_by] ?? 0) + 1;
    return acc;
  }, {});
  const affinityMix = ever.reduce<Record<string, number>>((acc, f) => {
    acc[f.discount_affinity] = (acc[f.discount_affinity] ?? 0) + 1;
    return acc;
  }, {});

  // เรียงตามความเสี่ยงหลุด × มูลค่า — คนที่ควรทักก่อน
  const priority = [...ever]
    .filter((f) => f.churn_risk >= 1.2)
    .sort(
      (a, b) =>
        b.churn_risk * b.monetary_ltv - a.churn_risk * a.monetary_ltv,
    )
    .slice(0, 25);

  return (
    <>
      <PageHead
        label={v.base}
        title="Who is going quiet, and who can still be reached"
        lead={`No blanket “quiet for 90 days means churned” rule — ${v.cycleExample}. Each ${v.person} has their own cycle, and that is what we compare against.`}
        actions={
          <ActionForm
            action={deriveAction}
            fields={{ tenantId }}
            label="Recompute"
            pendingLabel="Recomputing…"
          />
        }
      />

      <Panel flat className="mb-6 grid grid-cols-2 gap-x-6 gap-y-7 p-5 md:grid-cols-4 md:p-6">
        <Metric label={v.base} value={num(features.length)} />
        <Metric label="Ever transacted" value={num(ever.length)} />
        <Metric label="Repeat" value={num(repeat.length)} tone="accent" />
        <Metric
          label={`Revenue from the top 2% ${v.topGroup}`}
          value={pct(top2Share, 0)}
          sub={`${num(top2.length)} people`}
          tone="good"
        />
      </Panel>

      <Panel flat className="mb-6 grid grid-cols-2 gap-x-6 gap-y-7 p-5 md:grid-cols-4 md:p-6">
        <Metric label="Active in 30 days" value={num(recent30.length)} />
        <Metric label="Silent past 90 days" value={num(silent90.length)} tone="bad" />
        <Metric
          label="Estimated cycle"
          value={num(estimated.length)}
          sub="Single transaction, so it falls back to the cohort median"
          tone="muted"
        />
        <Metric label="Total base value" value={baht(revenue)} />
      </Panel>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Panel className="p-5 md:p-6">
          <h2 className="c-h2 text-[var(--c-text)]">Reachable channels</h2>
          <p className="c-thai mt-1.5 text-[0.8rem] text-[var(--c-text-3)]">
            สวิตช์ที่โยนคนจาก KEEP ไป REACH — "ยินยอมแล้ว แต่ไม่มีช่องทางตรง" คือจุดที่ KEEP ยอมแพ้
            แล้ว REACH รับต่อได้อย่างถูกกฎหมาย
          </p>
          <div className="mt-5 flex flex-col gap-3">
            {(["line", "email", "paid_only", "none"] as ReachableBy[]).map((k) => {
              const n = reachMix[k] ?? 0;
              return (
                <div key={k}>
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="c-thai text-[0.83rem] text-[var(--c-text-2)]">
                      {REACHABLE_LABEL[k]}
                    </span>
                    <span className="c-mono text-[0.83rem] text-[var(--c-text-3)]">
                      {num(n)}
                    </span>
                  </div>
                  <div className="c-meter mt-1.5">
                    <span
                      style={{
                        width: `${(n / Math.max(1, features.length)) * 100}%`,
                        background:
                          k === "line"
                            ? "var(--c-cyan)"
                            : k === "email"
                              ? "var(--c-accent)"
                              : k === "paid_only"
                                ? "var(--c-warn)"
                                : "var(--c-bad)",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel className="p-5 md:p-6">
          <h2 className="c-h2 text-[var(--c-text)]">Discount sensitivity</h2>
          <p className="c-thai mt-1.5 text-[0.8rem] text-[var(--c-text-3)]">
            คำนวณจากราคาป้ายเทียบราคาขาย โดยไม่ต้องถามต้นทุนจากร้านสักตัวเดียว
          </p>
          <div className="mt-5 flex flex-col gap-3">
            {(["full_price", "mixed", "discount_seeker"] as DiscountAffinity[]).map((k) => {
              const n = affinityMix[k] ?? 0;
              return (
                <div key={k}>
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="c-thai text-[0.83rem] text-[var(--c-text-2)]">
                      {AFFINITY_LABEL[k]}
                    </span>
                    <span className="c-mono text-[0.83rem] text-[var(--c-text-3)]">
                      {num(n)}
                    </span>
                  </div>
                  <div className="c-meter mt-1.5">
                    <span
                      style={{
                        width: `${(n / Math.max(1, ever.length)) * 100}%`,
                        background:
                          k === "full_price"
                            ? "var(--c-good)"
                            : k === "mixed"
                              ? "var(--c-accent)"
                              : "var(--c-warn)",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="c-thai mt-5 text-[0.78rem] text-[var(--c-text-4)]">
            กลุ่มที่ซื้อเต็มราคาคือต้นแบบของ REACH ไม่ใช่กลุ่มที่จ่ายมากที่สุด
          </p>
          <p className="c-thai mt-2 text-[0.78rem] text-[var(--c-warn)]">
            คนที่ไม่ได้ให้ความยินยอมจะไม่ถูกส่งออกไปแพลตฟอร์มโฆษณาเลย รวมถึงรายชื่อที่ใช้ตัดออกด้วย
            เขาจึงอาจยังเห็นโฆษณาของร้านอยู่ ซึ่งเป็นราคาที่ถูกต้องตามกฎหมายที่ต้องจ่าย
          </p>
        </Panel>
      </div>

      <Panel className="p-5 md:p-6">
        <h2 className="c-h2 text-[var(--c-text)]">Top 25 to contact first</h2>
        <p className="c-thai mt-1.5 text-[0.8rem] text-[var(--c-text-3)]">
          จัดอันดับด้วยความเสี่ยงที่จะหายไป × มูลค่า ไม่ใช่ด้วยยอดใช้จ่าย
        </p>
        <div className="c-scroll mt-5">
          <table className="c-table min-w-[62rem]">
            <thead>
              <tr>
                <th>{v.person}</th>
                <th>Days since</th>
                <th>Own cycle</th>
                <th>Churn risk</th>
                <th>Lifetime value</th>
                <th>Price tier</th>
                <th>Discount</th>
                <th>Reachable</th>
                <th>Next expected</th>
              </tr>
            </thead>
            <tbody>
              {priority.map((f) => (
                <tr key={f.customer_id}>
                  <td>
                    <span className="text-[var(--c-text)]">{f.name}</span>
                    <span className="c-mono mt-0.5 block text-[0.66rem] text-[var(--c-text-4)]">
                      {f.customer_id}
                    </span>
                  </td>
                  <td className="c-mono">{f.recency_days}d</td>
                  <td className="c-mono">
                    {f.personal_cycle_days}d
                    {f.cycle_is_estimated && (
                      <span className="ml-1.5 text-[var(--c-warn)]">≈</span>
                    )}
                  </td>
                  <td className="c-mono">
                    <span
                      className={
                        f.churn_risk >= 2.5
                          ? "text-[var(--c-bad)]"
                          : f.churn_risk >= 1.5
                            ? "text-[var(--c-warn)]"
                            : "text-[var(--c-text-2)]"
                      }
                    >
                      {f.churn_risk.toFixed(2)}×
                    </span>
                  </td>
                  <td className="c-mono">{baht(f.monetary_ltv)}</td>
                  <td className="c-mono">{f.price_tier || "—"}</td>
                  <td className="text-[0.78rem]">
                    {AFFINITY_LABEL[f.discount_affinity]}
                  </td>
                  <td className="text-[0.78rem]">{REACHABLE_LABEL[f.reachable_by]}</td>
                  <td className="c-mono text-[0.76rem]">{f.predicted_next_date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="c-thai mt-4 text-[0.78rem] text-[var(--c-text-4)]">
          ≈ marks someone with a single transaction, so their own cycle cannot be
        computed. The cohort median is used instead and flagged as an estimate.
        </p>
      </Panel>
    </>
  );
}
