import Link from "next/link";
import { db } from "@/lib/engine/db";
import { runMatch, topThree, getTenant } from "@/lib/engine/match";
import { roiSummary } from "@/lib/engine/proof";
import { summariseBrief } from "@/lib/engine/ai";
import { vocabFor } from "@/lib/engine/dispatch";
import { getActiveTenantId } from "@/lib/shared/active-tenant";
import { profileFor } from "@/lib/shared/tenants";
import { CYCLE_LABEL } from "@/lib/shared/types";
import { loadFeatures } from "@/lib/engine/derive";
import { CandidateCard } from "@/components/console/candidate-card";
import { ActionForm } from "@/components/console/action-form";
import { reachBlockedReason } from "@/lib/engine/billing";
import {
  AiBadge,
  Empty,
  Metric,
  PageHead,
  Panel,
  baht,
  num,
  pct,
} from "@/components/console/ui";
import { deriveAction, measureAllAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function BriefPage() {
  const tenantId = await getActiveTenantId();
  const profile = profileFor(tenantId);
  const v = profile.vocab;
  const tenant = getTenant(tenantId);
  const { candidates, weeklyCap } = runMatch(tenantId);
  const planBlock = reachBlockedReason(tenantId);
  const three = topThree(candidates);
  const features = loadFeatures(tenantId);
  const roi = roiSummary(tenantId);

  // บันทึกการเปิดบรีฟ — สัญญาณเตือนการยกเลิกที่มาก่อนตัวเลขอื่น (E7)
  const today = new Date().toISOString().slice(0, 10);
  db()
    .prepare(
      "INSERT INTO brief_opens (tenant_id, opened_on) VALUES (?,?) ON CONFLICT DO NOTHING",
    )
    .run(tenantId, today);
  const opens = db()
    .prepare(
      "SELECT COUNT(*) AS n FROM brief_opens WHERE tenant_id = ? AND opened_on >= ?",
    )
    .get(
      tenantId,
      new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10),
    ) as { n: number };

  const slipping = features.filter((f) => f.churn_risk >= 1.5).length;
  const unreachable = features.filter(
    (f) => f.reachable_by === "paid_only" || f.reachable_by === "none",
  ).length;
  const blocked = candidates.filter((c) => c.blocked).length;
  const totalValue = three.reduce((s, c) => s + c.expected_value, 0);

  const summary = await summariseBrief({
    businessName: tenant?.name ?? "the shop",
    slipping,
    unreachable,
    items: three.map((c) => ({
      name: c.play.name,
      size: c.audience.length,
      value: c.expected_value,
      why: c.play.logic,
    })),
    vocab: vocabFor(tenantId),
  });

  const dateLabel = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <>
      <PageHead
        label={`morning brief · ${dateLabel}`}
        title="Three moves for today"
        lead="Nothing to configure, no rules to write. Read the three below, approve or don't — done."
      />

      {/* ── ข้อจำกัดของบัญชีนี้ มาก่อนทุกอย่าง ──
          ถ้ามีข้อกฎหมายกำกับ ต้องเห็นก่อนกดอนุมัติ ไม่ใช่ซ่อนในหน้าตั้งค่า */}
      {profile.compliance && (
        <Panel flat className="mb-6 border-l-2 border-[var(--c-warn)] p-5">
          <p className="c-label text-[var(--c-warn)]">constraints on this account</p>
          <p className="c-thai mt-2.5 max-w-3xl text-[0.84rem] leading-relaxed text-[var(--c-text-2)]">
            {profile.compliance}
          </p>
        </Panel>
      )}

      {/* ── แผนที่ยังส่งไม่ได้ ต้องบอกก่อนอ่านสามใบ ──
          ไม่ใช่ปล่อยให้อ่านจบแล้วกดปุ่มแล้วเจอ error ตอนนั้น */}
      {planBlock && (
        <Panel flat className="mb-6 border-l-2 border-[var(--c-warn)] p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="c-label text-[var(--c-warn)]">this plan cannot send yet</p>
              <p className="c-thai mt-2.5 max-w-2xl text-[0.84rem] leading-relaxed text-[var(--c-text-2)]">
                {planBlock} The three below are still fully calculated, so you can see
                how much is waiting before you decide.
              </p>
            </div>
            <Link href="/app/billing" className="c-btn c-btn-primary c-btn-sm">
              See plans and billing
            </Link>
          </div>
        </Panel>
      )}

      {/* ── สรุปด้วยภาษาคน มาก่อนตัวเลขทุกตัว ── */}
      <Panel className="mb-6 p-5 md:p-6">
        <p className="c-thai max-w-3xl text-[1.02rem] leading-relaxed text-[var(--c-text)]">
          {summary.value}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <AiBadge source={summary.source} note={summary.note} />
          {three.length > 0 && (
            <span className="c-mono text-[0.72rem] text-[var(--c-text-4)]">
              Expected value today {baht(totalValue)}
            </span>
          )}
        </div>
      </Panel>

      {/* ── สามใบ ── */}
      {three.length ? (
        <div className="flex flex-col gap-5">
          {three.map((c, i) => (
            <CandidateCard
              key={c.play.id}
              candidate={c}
              tenantId={tenantId}
              rank={i + 1}
            />
          ))}
        </div>
      ) : (
        <Empty>
          Nothing worth sending today — either something went out recently, or the
          cohorts are too small to measure. The system will not propose what it
          cannot prove. Check back tomorrow.
        </Empty>
      )}

      {/* ── ตัวเลขสถานะฐาน ── */}
      <Panel flat className="mt-8 p-5 md:p-6">
        <p className="c-label">{v.base} today</p>
        <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-7 md:grid-cols-4">
          <Metric
            label="About to go quiet"
            value={num(slipping)}
            sub={`${v.people} past 1.5× their own normal cycle`}
            tone="bad"
          />
          <Metric
            label="Unreachable"
            value={num(unreachable)}
            sub="No LINE, or no consent on file"
            tone="muted"
          />
          <Metric
            label="90-day rolling difference"
            value={roi.avgLiftPct != null ? pct(roi.avgLiftPct) : "Not enough yet"}
            sub={
              roi.ciLow != null
                ? `95% CI ${roi.ciLow.toFixed(1)} to ${roi.ciHigh!.toFixed(1)}`
                : `${roi.measured} of ${roi.campaigns} campaigns measured`
            }
            tone={roi.avgLiftPct != null && roi.avgLiftPct > 0 ? "good" : "muted"}
          />
          <Metric
            label="Brief opens, last 28 days"
            value={`${opens.n}/28`}
            sub="Stop opening it and we are about to lose this account"
            tone="accent"
          />
        </div>
      </Panel>

      {/* ── งานระบบ ──
          ย้ายมาท้ายหน้า ไม่ใช่วางคู่กับหัวเรื่อง: ปุ่มพวกนี้เป็นงานดูแลระบบ
          ที่เจ้าของร้านไม่ต้องกดเป็นประจำ (ระบบคำนวณและวัดผลเองเป็นรอบ)
          วางไว้บนสุดทำให้แข่งความสนใจกับสิ่งเดียวที่หน้านี้ต้องการให้ทำ */}
      <Panel flat className="mt-8 p-5 md:p-6">
        <p className="c-label">maintenance</p>
        <p className="c-thai mt-2 max-w-3xl text-[0.8rem] text-[var(--c-text-3)]">
          You should not normally need these. The system recomputes and measures on
            a schedule — these are for when you want the result now.
        </p>
        <div className="mt-4 flex flex-wrap items-start gap-2.5">
          <ActionForm
            action={deriveAction}
            fields={{ tenantId }}
            label="Recompute features"
            pendingLabel="Recomputing…"
            size="sm"
          />
          <ActionForm
            action={measureAllAction}
            fields={{ tenantId }}
            label="Measure what is due"
            pendingLabel="Measuring…"
            size="sm"
          />
        </div>
      </Panel>

      {/* ── เบรก ── */}
      <Panel flat className="mt-5 p-5 md:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="c-label">limits in force</p>
          {/* เดิมสูง 17px — เล็กเกินกว่าจะกดถูกด้วยนิ้วหัวแม่มือ
              ให้พื้นที่กดเท่าปุ่ม แม้หน้าตายังเป็นลิงก์ */}
          <Link
            href="/app/settings"
            className="c-mono -mx-2 inline-flex min-h-11 items-center px-2 text-[0.72rem] text-[var(--c-cyan)]"
          >
            Change in settings →
          </Link>
        </div>
        <div className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            size="sm"
            label="Messages per person per week"
            value={`Max ${weeklyCap}`}
            sub="Counted across every campaign"
          />
          <Metric
            size="sm"
            label="Quiet hours"
            value={`${tenant?.quiet_hours_start ?? 21}:00–${tenant?.quiet_hours_end ?? 9}:00`}
            sub="Press send inside this window and nothing goes out"
          />
          <Metric
            size="sm"
            label="Discount ceiling"
            value={`${tenant?.max_discount_pct ?? 0}%`}
            sub="Overrides every play's own ceiling"
          />
          <Metric
            size="sm"
            label="Held back today"
            value={`${num(blocked)} play`}
            sub="Reasons listed in the play library"
          />
        </div>
        <p className="c-thai mt-5 text-[0.78rem] text-[var(--c-text-4)]">
          Synthetic dataset for {profile.name} — {profile.industry} · base of{" "}
          {num(features.length)} {v.person} · cycle shape{" "}
          {CYCLE_LABEL[profile.cycleShape]}. Deterministic generation, so the
          numbers repeat exactly. Reset and time-travel tools live in settings.
        </p>
      </Panel>
    </>
  );
}
