import { get, run } from "@/lib/engine/sql";
import Link from "next/link";
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
import { reachBlockedReason, reachTrialState } from "@/lib/engine/billing";
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
  const tenant = await getTenant(tenantId);
  const { candidates, weeklyCap } = await runMatch(tenantId);
  const planBlock = await reachBlockedReason(tenantId);
  const trial = await reachTrialState(tenantId);
  const three = topThree(candidates);
  const features = await loadFeatures(tenantId);
  const roi = await roiSummary(tenantId);

  // บันทึกการเปิดบรีฟ — สัญญาณเตือนการยกเลิกที่มาก่อนตัวเลขอื่น (E7)
  const today = new Date().toISOString().slice(0, 10);
  await run("INSERT INTO brief_opens (tenant_id, opened_on) VALUES (?,?) ON CONFLICT DO NOTHING", tenantId, today);
  const opens = (await get<{ n: number }>("SELECT COUNT(*) AS n FROM brief_opens WHERE tenant_id = ? AND opened_on >= ?", tenantId,
      new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10)))!;

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
        title="สามอย่างที่ควรทำวันนี้"
        lead="ไม่มีอะไรต้องตั้งค่า ไม่ต้องเขียนกฎ อ่านสามอย่างข้างล่าง, approve or don't — done."
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
      {/* ── แผนทดลองที่ยังมีสิทธิ์เหลือ ──
          เป็นโควตา ไม่ใช่กำแพง — บอกว่ามีอะไรให้ใช้ ไม่ใช่บอกว่าอะไรถูกห้าม */}
      {!planBlock && trial && trial.campaignsLeft > 0 && (
        <Panel flat className="mb-6 border-l-2 border-[var(--c-accent)] p-5">
          <p className="c-label text-[var(--c-accent)]">แผนนี้ได้อะไรบ้าง</p>
          <p className="c-thai mt-2.5 max-w-2xl text-[0.84rem] leading-relaxed text-[var(--c-text-2)]">
            ส่งจริงได้ {trial.campaignsLeft} แคมเปญ สูงสุด{" "}
            {trial.audienceCap.toLocaleString("en-US")} คน พร้อมกลุ่มที่กันไว้จริง
            อนุมัติสักอันข้างล่างแล้วคุณจะได้วัดฐานของตัวเอง ไม่ใช่ค่าประมาณของมัน
          </p>
        </Panel>
      )}

      {planBlock && (
        <Panel flat className="mb-6 border-l-2 border-[var(--c-warn)] p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="c-label text-[var(--c-warn)]">แผนนี้ยังส่งไม่ได้</p>
              <p className="c-thai mt-2.5 max-w-2xl text-[0.84rem] leading-relaxed text-[var(--c-text-2)]">
                {planBlock} สามอย่างข้างล่างยังคำนวณครบ จะได้เห็นว่ามีมูลค่ารออยู่เท่าไรก่อนตัดสินใจ
              </p>
            </div>
            <Link href="/app/billing" className="c-btn c-btn-primary c-btn-sm">
              ดูแผนและค่าใช้จ่าย
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
              มูลค่าที่คาดไว้วันนี้ {baht(totalValue)}
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
          วันนี้ยังไม่มีอะไรคุ้มค่าส่ง — อาจเพราะเพิ่งส่งไป หรือกลุ่มเล็กเกินกว่าจะวัดผลได้
          ระบบจะไม่เสนอสิ่งที่พิสูจน์ไม่ได้ พรุ่งนี้มาดูใหม่
        </Empty>
      )}

      {/* ── ตัวเลขสถานะฐาน ── */}
      <Panel flat className="mt-8 p-5 md:p-6">
        <p className="c-label">{v.base} today</p>
        <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-7 md:grid-cols-4">
          <Metric
            label="กำลังจะเงียบ"
            value={num(slipping)}
            sub={`${v.people} past 1.5× their own normal cycle`}
            tone="bad"
          />
          <Metric
            label="ทักไม่ถึง"
            value={num(unreachable)}
            sub="ไม่มี LINE หรือยังไม่ได้ให้ความยินยอม"
            tone="muted"
          />
          <Metric
            label="รายได้ส่วนเพิ่ม 90 วันล่าสุด"
            value={roi.avgLiftPct != null ? pct(roi.avgLiftPct) : "Not enough yet"}
            sub={
              roi.ciLow != null
                ? `95% CI ${roi.ciLow.toFixed(1)} to ${roi.ciHigh!.toFixed(1)}`
                : `${roi.measured} of ${roi.campaigns} campaigns measured`
            }
            tone={roi.avgLiftPct != null && roi.avgLiftPct > 0 ? "good" : "muted"}
          />
          <Metric
            label="เปิดบรีฟ 28 วันล่าสุด"
            value={`${opens.n}/28`}
            sub="ถ้าเลิกเปิด แปลว่าเรากำลังจะเสียบัญชีนี้"
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
            label="คำนวณข้อมูลลูกค้าใหม่"
            pendingLabel="กำลังคำนวณ…"
            size="sm"
          />
          <ActionForm
            action={measureAllAction}
            fields={{ tenantId }}
            label="วัดผลที่ถึงกำหนด"
            pendingLabel="กำลังวัด…"
            size="sm"
          />
        </div>
      </Panel>

      {/* ── เบรก ── */}
      <Panel flat className="mt-5 p-5 md:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="c-label">เพดานที่บังคับอยู่</p>
          {/* เดิมสูง 17px — เล็กเกินกว่าจะกดถูกด้วยนิ้วหัวแม่มือ
              ให้พื้นที่กดเท่าปุ่ม แม้หน้าตายังเป็นลิงก์ */}
          <Link
            href="/app/settings"
            className="c-mono -mx-2 inline-flex min-h-11 items-center px-2 text-[0.72rem] text-[var(--c-cyan)]"
          >
            แก้ที่หน้าตั้งค่า →
          </Link>
        </div>
        <div className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            size="sm"
            label="ข้อความต่อคนต่อสัปดาห์"
            value={`Max ${weeklyCap}`}
            sub="นับรวมทุกแคมเปญ"
          />
          <Metric
            size="sm"
            label="Quiet hours"
            value={`${tenant?.quiet_hours_start ?? 21}:00–${tenant?.quiet_hours_end ?? 9}:00`}
            sub="กดส่งในช่วงนี้จะไม่มีอะไรออกไป"
          />
          <Metric
            size="sm"
            label="เพดานส่วนลด"
            value={`${tenant?.max_discount_pct ?? 0}%`}
            sub="ทับเพดานของทุก play"
          />
          <Metric
            size="sm"
            label="กันไว้วันนี้"
            value={`${num(blocked)} play`}
            sub="ดูเหตุผลได้ที่คลัง play"
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
