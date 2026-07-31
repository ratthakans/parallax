import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { playById } from "@/lib/plays";
import { loadAttributions } from "@/lib/proof";
import { armFor, renderForCustomer } from "@/lib/dispatch";
import { getActiveTenantId } from "@/lib/active-tenant";
import { profileFor } from "@/lib/tenants";
import type { Verdict } from "@/lib/types";
import {
  MEASUREMENT_LABEL,
  Meter,
  Metric,
  PageHead,
  Panel,
  VerdictPill,
  baht,
  num,
  pct,
} from "@/components/console/ui";
import { ciLabel } from "@/lib/format";
import { measureAction, sendAction } from "../../../actions";
import { ActionForm } from "@/components/console/action-form";

export const dynamic = "force-dynamic";

export default async function CampaignDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tenantId = await getActiveTenantId();
  const v = profileFor(tenantId).vocab;
  const d = db();

  const camp = d.prepare("SELECT * FROM campaigns WHERE id = ? AND tenant_id = ?").get(
    id,
    tenantId,
  ) as
    | {
        id: string;
        play_id: string;
        status: string;
        approved_by: string;
        approved_at: string;
        copy_snapshot: string;
        offer_snapshot: string;
        holdout_pct: number;
        measurement: string;
        audience_size: number;
        treated_size: number;
        holdout_size: number;
        dry_run: number;
        est_cost: number;
      }
    | undefined;
  if (!camp) notFound();

  const play = playById(camp.play_id);
  const copy = JSON.parse(camp.copy_snapshot) as {
    tone: string;
    body: string;
    all: { tone: string; body: string }[];
  };
  const offer = JSON.parse(camp.offer_snapshot) as Record<string, unknown>;
  const attributions = loadAttributions(camp.id);

  const sentRow = d
    .prepare("SELECT COUNT(*) AS n FROM messages WHERE campaign_id = ?")
    .get(camp.id) as { n: number };

  // ตัวอย่าง audience ที่แช่แข็งไว้ พร้อมข้อความที่แทนค่าแล้ว
  const sample = d
    .prepare(
      `SELECT ca.customer_id AS id, ca.arm, c.name,
              (SELECT p.name FROM line_items li
                 JOIN transactions t ON t.id = li.txn_id
                 JOIN products p ON p.id = li.product_id
                WHERE t.customer_id = ca.customer_id
                ORDER BY t.occurred_at DESC LIMIT 1) AS last_product
       FROM campaign_audience ca
       JOIN customers c ON c.id = ca.customer_id
       WHERE ca.campaign_id = ?
       ORDER BY ca.arm, ca.customer_id
       LIMIT 12`,
    )
    .all(camp.id) as {
    id: string;
    arm: "treated" | "holdout";
    name: string;
    last_product: string | null;
  }[];

  const ageDays = Math.floor(
    (Date.now() - Date.parse(camp.approved_at)) / 86400000,
  );

  /* ── สถานะการส่ง และ "จะรู้ผลเมื่อไร" ──
     ผู้ใช้ที่เพิ่งกดอนุมัติมาถึงหน้านี้ ต้องเห็นทันทีว่าเหลืออะไรให้ทำ
     และถ้าทำครบแล้วจะได้คำตอบเมื่อไหร่ ไม่ใช่ต้องเดาเอง */
  const fullySent = sentRow.n >= camp.treated_size;
  const remaining = Math.max(0, camp.treated_size - sentRow.n);
  const dueDate = (h: number) =>
    new Date(Date.parse(camp.approved_at) + h * 86400000).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "2-digit",
    });
  const verdict90 = attributions.find((a) => a.horizon_days === 90)?.verdict as
    | Verdict
    | undefined;

  return (
    <>
      <PageHead
        label={`campaign · ${camp.play_id}`}
        title={play?.name ?? camp.play_id}
        lead={
          camp.dry_run
            ? "Dry run — the cohort really is frozen, but nothing sends and it does not count against frequency caps"
            : `Approved by ${camp.approved_by} on ${new Date(camp.approved_at).toLocaleString("en-US")} · ${ageDays} days ago`
        }
        actions={
          <Link href="/app/campaigns" className="c-btn c-btn-ghost">
            ← All campaigns
          </Link>
        }
      />

      {/* ── ขั้นถัดไป — ตอบว่า "ตอนนี้ต้องทำอะไร" แล้ววางปุ่มไว้ตรงนั้นเลย ──

          เดิมปุ่ม Send อยู่บนหัวเรื่อง ห่างจากประโยคที่อธิบายว่ามันทำอะไร
          และไม่มีที่ว่างพอจะรายงานผล — การส่งที่ติดช่วงห้ามส่งจึงเงียบสนิท
          ย้ายลงมาอยู่กับคำอธิบาย ผลของการกดจะโผล่ใต้ปุ่มที่กด */}
      {!camp.dry_run && (
        <Panel
          flat
          className={`mb-6 border-l-2 p-5 ${
            fullySent ? "border-[var(--c-good)]" : "border-[var(--c-accent)]"
          }`}
        >
          <p
            className={`c-label ${
              fullySent ? "text-[var(--c-good)]" : "text-[var(--c-accent)]"
            }`}
          >
            {fullySent ? "Sent — waiting on results" : "One step left"}
          </p>
          <p className="c-thai mt-2 max-w-3xl text-[0.88rem] leading-relaxed text-[var(--c-text-2)]">
            {fullySent ? (
              <>
                {num(sentRow.n)} sent · {num(camp.holdout_size)} held back
                {camp.holdout_size > 0 ? (
                  <>
                    {" "}— first readable around {dueDate(30)}, fully concluded{" "}
                    {dueDate(90)}
                  </>
                ) : (
                  <> — no control group here, so the result indicates direction only</>
                )}
              </>
            ) : (
              <>
                The list is frozen and nobody has received anything yet. Press “Send”
                below to finish — pressing twice does not send twice.
              </>
            )}
          </p>

          <div className="mt-5 flex flex-wrap items-start gap-2.5">
            {/* บอกจำนวนบนปุ่มเสมอ — ปุ่มที่เขียนแค่ "ส่งข้อความ"
                ไม่ได้บอกว่ากำลังจะส่งหาคนกี่คน ซึ่งเป็นข้อมูลเดียว
                ที่สำคัญที่สุดก่อนกดสิ่งที่ย้อนกลับไม่ได้ */}
            {/* ส่งครบแล้วก็ยังเป็นฟอร์มเดิม แค่ปิดปุ่ม — ถ้าสลับไปเป็น
                <span> ฟอร์มจะหลุดจากต้นไม้พร้อมกับรายงานผลที่เพิ่งเขียน
                ("ส่งไป 60 · เหลือเครดิต 2,490") ในจังหวะเดียวกับที่กดสำเร็จ */}
            <ActionForm
              action={sendAction}
              fields={{ tenantId, campaignId: camp.id }}
              label={
                fullySent
                  ? `All sent · ${num(sentRow.n)}`
                  : `Send — ${num(remaining)} recipients`
              }
              pendingLabel={`Sending to ${num(remaining)}…`}
              variant={fullySent ? "ghost" : "primary"}
              disabled={fullySent}
            />
            <ActionForm
              action={measureAction}
              fields={{ tenantId, campaignId: camp.id }}
              label="Measure now"
              pendingLabel="Measuring…"
            />
          </div>
        </Panel>
      )}

      <Panel flat className="mb-6 grid grid-cols-2 gap-x-6 gap-y-7 p-5 md:grid-cols-4 md:p-6">
        <Metric label="Frozen cohort" value={num(camp.audience_size)} />
        <Metric label="Treated" value={num(camp.treated_size)} tone="accent" />
        <Metric
          label="Held back"
          value={num(camp.holdout_size)}
          sub={`${camp.holdout_pct}% of the cohort`}
          tone="muted"
        />
        <Metric
          label="Messages sent"
          value={num(sentRow.n)}
          sub="Pressing send again adds none"
        />
      </Panel>

      <div className="mb-6">
        <Meter treated={camp.treated_size} holdout={camp.holdout_size} />
        <p className="c-thai mt-2.5 text-[0.78rem] text-[var(--c-text-3)]">
          {MEASUREMENT_LABEL[camp.measurement]} — these two bars are the two views that
          make distance calculable. With one view you see revenue but not where it came
          from.
        </p>
      </div>

      {/* PROOF */}
      <Panel className="mb-6 p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="c-h2 text-[var(--c-text)]">Measured results</h2>
          {verdict90 && <VerdictPill verdict={verdict90} />}
        </div>

        {attributions.length === 0 ? (
          <p className="c-thai mt-4 text-[0.85rem] text-[var(--c-text-3)]">
            Not measured yet — press measure to compute T+7 / T+30 / T+90
          </p>
        ) : (
          <div className="c-scroll mt-5">
            <table className="c-table min-w-[46rem]">
              <thead>
                <tr>
                  <th>Horizon</th>
                  <th>Per head · treated</th>
                  <th>Per head · held</th>
                  <th>Difference</th>
                  <th>95% CI</th>
                  <th>Verdict</th>
                </tr>
              </thead>
              <tbody>
                {attributions.map((a) => (
                  <tr key={a.horizon_days}>
                    <td className="c-mono text-[var(--c-text)]">T+{a.horizon_days}</td>
                    <td className="c-mono">{baht(a.rph_treated)}</td>
                    <td className="c-mono">{baht(a.rph_holdout)}</td>
                    <td className="c-mono">
                      <span
                        className={
                          a.lift_abs > 0
                            ? "text-[var(--c-good)]"
                            : "text-[var(--c-bad)]"
                        }
                      >
                        {a.lift_abs > 0 ? "+" : ""}
                        {baht(a.lift_abs)} · {pct(a.lift_pct)}
                      </span>
                    </td>
                    <td className="c-mono whitespace-nowrap text-[var(--c-text-3)]">
                      {ciLabel(a.ci_low, a.ci_high)}
                    </td>
                    <td>
                      <VerdictPill verdict={a.verdict} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="c-thai mt-4 text-[0.78rem] text-[var(--c-text-4)]">
          {camp.measurement === "pooled_90d_holdout"
            ? "At this size only the pooled T+90 concludes — T+7 and T+30 read as inconclusive by rule, not because anything is broken"
            : "A confidence interval spanning zero counts as inconclusive, and is shown as such rather than dressed up"}
        </p>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* snapshot ของข้อความ */}
        <Panel className="p-5 md:p-6">
          <h2 className="c-h2 text-[var(--c-text)]">Copy snapshot</h2>
          <p className="c-thai mt-1.5 text-[0.8rem] text-[var(--c-text-3)]">
            Captured at approval — editing the play later does not touch campaigns already sent
          </p>
          <p className="c-label mt-5">chosen tone — {copy.tone}</p>
          <pre className="c-code mt-2.5">{copy.body}</pre>
          <p className="c-label mt-5">offer</p>
          <pre className="c-code mt-2.5">
            {Object.entries(offer)
              .map(([k, v]) => `${k}: ${String(v)}`)
              .join("\n")}
          </pre>
        </Panel>

        {/* audience ที่แช่แข็ง */}
        <Panel className="p-5 md:p-6">
          <h2 className="c-h2 text-[var(--c-text)]">The frozen cohort</h2>
          <p className="c-thai mt-1.5 text-[0.8rem] text-[var(--c-text-3)]">
            The arm comes from hash(customer_id + campaign_id) — recomputing always gives the same answer
          </p>
          <div className="c-scroll mt-5">
            <table className="c-table min-w-[26rem]">
              <thead>
                <tr>
                  <th>{v.person}</th>
                  <th>arm</th>
                  <th>Recheck</th>
                </tr>
              </thead>
              <tbody>
                {sample.map((s) => {
                  const recomputed = armFor(s.id, camp.id, camp.holdout_pct);
                  const ok = recomputed === s.arm;
                  return (
                    <tr key={s.id}>
                      <td>
                        <span className="text-[var(--c-text)]">{s.name}</span>
                        <span className="c-mono mt-0.5 block text-[0.66rem] text-[var(--c-text-4)]">
                          {s.id}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`c-pill ${s.arm === "treated" ? "c-pill-reach" : "c-pill-warn"}`}
                        >
                          {s.arm === "treated" ? "Treated" : "Held"}
                        </span>
                      </td>
                      <td className="c-mono text-[0.72rem]">
                        {ok ? (
                          <span className="text-[var(--c-good)]">Match</span>
                        ) : (
                          <span className="text-[var(--c-bad)]">Mismatch</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {sample[0] && (
            <>
              <p className="c-label mt-6">preview after per-person substitution</p>
              <pre className="c-code mt-2.5">
                {renderForCustomer(copy.body, {
                  name: sample[0].name,
                  last_product: sample[0].last_product ?? "a previous purchase",
                })}
              </pre>
            </>
          )}
        </Panel>
      </div>
    </>
  );
}
