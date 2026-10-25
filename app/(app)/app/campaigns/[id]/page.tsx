import { activeTenantId, retailOnly } from "@/app/(app)/tenant";
import { all, get } from "@/lib/engine/sql";
import Link from "next/link";
import { notFound } from "next/navigation";
import { notConnectedTh, playById } from "@/lib/shared/plays";
import { loadAttributions } from "@/lib/engine/proof";
import { armFor, DELIVERY_CONNECTED, renderForCustomer } from "@/lib/engine/dispatch";

import { profileFor } from "@/lib/shared/tenants";
import type { Verdict } from "@/lib/shared/types";
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
import { ciLabel, thaiDate, thaiDateTime } from "@/lib/shared/format";
import { measureAction, sendAction } from "../../../actions";
import { ActionForm } from "@/components/console/action-form";

export const metadata = { title: "แคมเปญ" };
export const dynamic = "force-dynamic";

/* หัวตารางภาษาไทยไม่ใช้ mono ตัวพิมพ์ใหญ่ของ .c-table th (ดู console.css) */
const TH = "font-sans normal-case tracking-normal text-[0.75rem]";

export default async function CampaignDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tenantId = await retailOnly();
  const v = profileFor(tenantId).vocab;

  const camp = await get<{
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
      }>(
    "SELECT * FROM campaigns WHERE id = ? AND tenant_id = ?",
    id,
    tenantId,
  );
  if (!camp) notFound();

  const play = playById(camp.play_id);
  const nc = notConnectedTh(play?.engine ?? "keep");
  const copy = JSON.parse(camp.copy_snapshot) as {
    tone: string;
    body: string;
    all: { tone: string; body: string }[];
  };
  const offer = JSON.parse(camp.offer_snapshot) as Record<string, unknown>;
  const attributions = await loadAttributions(camp.id);

  const sentRow = (await get<{ n: number | string }>(
    "SELECT COUNT(*) AS n FROM messages WHERE campaign_id = ?",
    camp.id,
  ))!;
  const sentCount = Number(sentRow.n);

  // ตัวอย่าง audience ที่แช่แข็งไว้ พร้อมข้อความที่แทนค่าแล้ว
  const sample = await all<{
    id: string;
    arm: "treated" | "holdout";
    name: string;
    last_product: string | null;
  }>(`SELECT ca.customer_id AS id, ca.arm, c.name,
              (SELECT p.name FROM line_items li
                 JOIN transactions t ON t.id = li.txn_id
                 JOIN products p ON p.id = li.product_id
                WHERE t.customer_id = ca.customer_id
                ORDER BY t.occurred_at DESC LIMIT 1) AS last_product
       FROM campaign_audience ca
       JOIN customers c ON c.id = ca.customer_id
       WHERE ca.campaign_id = ?
       ORDER BY ca.arm, ca.customer_id
       LIMIT 12`, camp.id);

  const ageDays = Math.floor(
    (Date.now() - Date.parse(camp.approved_at)) / 86400000,
  );

  /* ── สถานะการส่ง และ "จะรู้ผลเมื่อไร" ──
     ผู้ใช้ที่เพิ่งกดอนุมัติมาถึงหน้านี้ ต้องเห็นทันทีว่าเหลืออะไรให้ทำ
     และถ้าทำครบแล้วจะได้คำตอบเมื่อไหร่ ไม่ใช่ต้องเดาเอง */
  const fullySent = sentCount >= camp.treated_size;
  const remaining = Math.max(0, camp.treated_size - sentCount);
  const dueDate = (h: number) =>
    thaiDate(new Date(Date.parse(camp.approved_at) + h * 86400000).toISOString());
  const verdict90 = attributions.find((a) => a.horizon_days === 90)?.verdict as
    | Verdict
    | undefined;

  return (
    <>
      <PageHead
        label="แคมเปญ"
        title={play?.nameTh ?? play?.name ?? camp.play_id}
        lead={
          camp.dry_run
            ? "ซ้อมส่ง — ล็อกรายชื่อจริง แต่ไม่มีอะไรถูกส่ง และไม่นับเข้าเพดานความถี่"
            : `อนุมัติโดย ${camp.approved_by} เมื่อ ${thaiDateTime(camp.approved_at)} · ${ageDays} วันก่อน`
        }
        actions={
          <Link href="/app/campaigns" className="c-btn c-btn-ghost">
            ← แคมเปญทั้งหมด
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
            {fullySent
              ? DELIVERY_CONNECTED
                ? "ส่งแล้ว — รอผล"
                : "จำลองการส่งแล้ว — ยังไม่มีข้อความออกไปจริง"
              : "เหลืออีกขั้นเดียว"}
          </p>
          <p className="c-thai mt-2 max-w-3xl text-[0.88rem] leading-relaxed text-[var(--c-text-2)]">
            {fullySent ? (
              <>
                {num(sentCount)} {DELIVERY_CONNECTED ? "sent" : `บันทึกไว้ (ยังไม่ได้เชื่อม ${nc.channel})`} ·{" "}
                กันไว้ {num(camp.holdout_size)} คน
                {camp.holdout_size > 0 ? (
                  <>
                    {" "}— อ่านผลแรกได้ราว {dueDate(30)} สรุปครบ{" "}
                    {dueDate(90)}
                  </>
                ) : (
                  <> — แคมเปญนี้ไม่มีกลุ่มควบคุม ผลจึงบอกได้แค่แนวโน้ม</>
                )}
              </>
            ) : DELIVERY_CONNECTED ? (
              <>
                ล็อกรายชื่อแล้ว ยังไม่มีใครได้รับ กด "ส่ง" ด้านล่างเพื่อจบขั้นตอน — กดซ้ำก็ไม่ส่งซ้ำ
              </>
            ) : (
              <>
                ล็อกรายชื่อแล้ว ยังไม่ได้เชื่อม {nc.channel} ปุ่มด้านล่างจึงแค่บันทึกว่าใครอยู่ในกลุ่มที่ได้รับ
                เพื่อเริ่มนับผล — {nc.nothingSent} และไม่ตัดเครดิต
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
                  ? DELIVERY_CONNECTED
                    ? `ส่งครบแล้ว · ${num(sentCount)}`
                    : `จำลองครบแล้ว · ${num(sentCount)}`
                  : DELIVERY_CONNECTED
                    ? `Send — ${num(remaining)} recipients`
                    : `จำลองการส่ง — ${num(remaining)} คน`
              }
              pendingLabel={DELIVERY_CONNECTED ? `กำลังส่งถึง ${num(remaining)} คน…` : `กำลังบันทึก ${num(remaining)} คน…`}
              variant={fullySent ? "ghost" : "primary"}
              disabled={fullySent}
            />
            <ActionForm
              action={measureAction}
              fields={{ tenantId, campaignId: camp.id }}
              label="วัดผลตอนนี้"
              pendingLabel="Measuring…"
            />
          </div>
        </Panel>
      )}

      <Panel flat className="mb-6 grid grid-cols-2 gap-x-6 gap-y-7 p-5 md:grid-cols-4 md:p-6">
        <Metric label="รายชื่อที่ล็อกไว้" value={num(camp.audience_size)} />
        <Metric label="กลุ่มที่ได้รับ" value={num(camp.treated_size)} tone="accent" />
        <Metric
          label="กลุ่มควบคุม (ไม่ส่ง)"
          value={num(camp.holdout_size)}
          sub={`${camp.holdout_pct}% ของรายชื่อ`}
          tone="muted"
        />
        <Metric
          label={DELIVERY_CONNECTED ? "ส่งแล้ว" : "จำลองการส่ง"}
          value={num(sentCount)}
          sub={DELIVERY_CONNECTED ? "กดส่งซ้ำไม่เพิ่ม" : "ยังไม่ได้ส่งจริง · ไม่ตัดเครดิต"}
        />
      </Panel>

      <div className="mb-6">
        <Meter treated={camp.treated_size} holdout={camp.holdout_size} />
        <p className="c-thai mt-2.5 text-[0.78rem] text-[var(--c-text-3)]">
          {MEASUREMENT_LABEL[camp.measurement]} — สองแถบนี้คือสองกลุ่มที่ทำให้วัดส่วนต่างได้
          ถ้ามีแค่กลุ่มเดียว จะเห็นยอดขาย แต่ไม่รู้ว่ามาจากข้อความหรือมาเองอยู่แล้ว
        </p>
      </div>

      {/* PROOF */}
      <Panel className="mb-6 p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="c-h2 text-[var(--c-text)]">ผลที่วัดได้</h2>
          {verdict90 && <VerdictPill verdict={verdict90} />}
        </div>

        {attributions.length === 0 ? (
          <p className="c-thai mt-4 text-[0.85rem] text-[var(--c-text-3)]">
            ยังไม่ได้วัด — กด "วัดผลตอนนี้" เพื่อคำนวณที่ 7 / 30 / 90 วัน
          </p>
        ) : (
          <div className="c-scroll mt-5">
            <table className="c-table min-w-[46rem]">
              <thead>
                <tr>
                  <th className={TH}>หลังส่ง</th>
                  <th className={TH}>ต่อคน · กลุ่มที่ได้รับ</th>
                  <th className={TH}>ต่อคน · กลุ่มควบคุม</th>
                  <th className={TH}>ส่วนต่าง</th>
                  <th className={TH}>ช่วงที่น่าจะเป็น (95%)</th>
                  <th className={TH}>ข้อสรุป</th>
                </tr>
              </thead>
              <tbody>
                {attributions.map((a) => (
                  <tr key={a.horizon_days}>
                    <td className="c-thai text-[var(--c-text)]">{a.horizon_days} วัน</td>
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
            ? "กลุ่มขนาดนี้สรุปได้ที่ 90 วันแบบรวมกลุ่มควบคุมเท่านั้น — ที่ 7 และ 30 วันจึงขึ้นว่ายังไม่พอสรุปตามกติกา ไม่ใช่เพราะระบบพัง"
            : "ถ้าช่วงที่น่าจะเป็นคร่อมศูนย์ ถือว่ายังสรุปไม่ได้ และแสดงตามนั้น ไม่ปัดให้ดูดีขึ้น"}
        </p>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* snapshot ของข้อความ */}
        <Panel className="p-5 md:p-6">
          <h2 className="c-h2 text-[var(--c-text)]">ข้อความที่ใช้</h2>
          <p className="c-thai mt-1.5 text-[0.8rem] text-[var(--c-text-3)]">
            บันทึกไว้ตอนอนุมัติ — แก้วิธีทีหลังไม่กระทบแคมเปญที่ส่งไปแล้ว
          </p>
          <p className="c-label mt-5">น้ำเสียงที่เลือก — {copy.tone}</p>
          <pre className="c-code mt-2.5">{copy.body}</pre>
          <p className="c-label mt-5">ข้อเสนอ</p>
          <pre className="c-code mt-2.5">
            {Object.entries(offer)
              .map(([k, v]) => `${k}: ${String(v)}`)
              .join("\n")}
          </pre>
        </Panel>

        {/* audience ที่แช่แข็ง */}
        <Panel className="p-5 md:p-6">
          <h2 className="c-h2 text-[var(--c-text)]">รายชื่อที่ล็อกไว้</h2>
          <p className="c-thai mt-1.5 text-[0.8rem] text-[var(--c-text-3)]">
            ใครอยู่กลุ่มไหนคำนวณจากรหัสลูกค้ากับรหัสแคมเปญ — คำนวณใหม่กี่ครั้งก็ได้ผลเดิม ตรวจย้อนได้
          </p>
          <div className="c-scroll mt-5">
            <table className="c-table min-w-[26rem]">
              <thead>
                <tr>
                  <th className={TH}>{v.person}</th>
                  <th className={TH}>กลุ่ม</th>
                  <th className={TH}>ตรวจซ้ำ</th>
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
                        <span className="c-mono mt-0.5 block text-[0.75rem] text-[var(--c-text-4)]">
                          {s.id}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`c-pill ${s.arm === "treated" ? "c-pill-reach" : "c-pill-warn"}`}
                        >
                          {s.arm === "treated" ? "ได้รับ" : "กันไว้"}
                        </span>
                      </td>
                      <td className="c-mono text-[0.75rem]">
                        {ok ? (
                          <span className="text-[var(--c-good)]">ตรงกัน</span>
                        ) : (
                          <span className="text-[var(--c-bad)]">ไม่ตรง</span>
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
              <p className="c-label mt-6">ตัวอย่างหลังแทนค่ารายคน</p>
              <pre className="c-code mt-2.5">
                {renderForCustomer(copy.body, {
                  name: sample[0].name,
                  last_product: sample[0].last_product ?? "สินค้าที่เคยซื้อ",
                })}
              </pre>
            </>
          )}
        </Panel>
      </div>
    </>
  );
}
