import { activeTenantId, retailOnly } from "@/app/(app)/tenant";
import { all } from "@/lib/engine/sql";
import { effectiveGuards, getTenantPlays, runMatch } from "@/lib/engine/match";

import { profileFor } from "@/lib/shared/tenants";
import { ALL_PLAYS, playCrossTh, playLogicTh } from "@/lib/shared/plays";
import { CYCLE_LABEL } from "@/lib/shared/types";
import {
  EnginePill,
  MEASUREMENT_LABEL,
  Metric,
  PageHead,
  Panel,
  baht,
  num,
} from "@/components/console/ui";
import { togglePlayAction, updateGuardsAction } from "../../actions";
import { ActionForm } from "@/components/console/action-form";

export const dynamic = "force-dynamic";

export default async function PlaysPage() {
  const tenantId = await retailOnly();
  const v = profileFor(tenantId).vocab;
  const [{ candidates }, cfgs, perfRows] = await Promise.all([
    runMatch(tenantId),
    getTenantPlays(tenantId),
    all<{
      play_id: string;
      trials: number;
      successes: number;
      a: number;
      b: number;
    }>(`SELECT play_id, trials, successes, posterior_alpha AS a, posterior_beta AS b
         FROM play_performance`),
  ]);
  const perf = new Map(perfRows.map((r) => [r.play_id, r]));

  /* เรียงตามลำดับในคลัง ไม่ใช่ตามคะแนนของรอบนี้ — เดิมกดปิดแล้วการ์ดย้ายไปท้ายรายการ
     ข้อความยืนยันหายไปพร้อมการ์ด และการ์ดถัดไปเลื่อนขึ้นมาอยู่ใต้เมาส์พอดี */
  const order = new Map(ALL_PLAYS.map((p, i) => [p.id, i]));
  const byLibrary = [...candidates].sort((a, b) => (order.get(a.play.id) ?? 0) - (order.get(b.play.id) ?? 0));
  const keep = byLibrary.filter((c) => c.play.engine === "keep");
  const reach = byLibrary.filter((c) => c.play.engine === "reach");
  const enabledCount = candidates.filter(
    (c) => cfgs.get(c.play.id)?.enabled !== false,
  ).length;
  const readyCount = candidates.filter((c) => !c.blocked).length;

  return (
    <>
      <PageHead
        label="คลังวิธี"
        title={`${ALL_PLAYS.length} วิธีที่ระบบรู้จัก และทำไมบางวิธีไม่ถูกเสนอวันนี้`}
        lead="บรีฟเช้าหยิบเฉพาะสามวิธีที่คุ้มที่สุดซึ่งผ่านทุกเพดาน ที่เหลืออยู่ในหน้านี้พร้อมเหตุผลว่าทำไมยังไม่ถูกเสนอ — ปิดวิธีที่ไม่ต้องการ หรือตั้งเพดานส่วนลดรายวิธีได้"
      />

      <Panel flat className="mb-8 grid grid-cols-2 gap-x-6 gap-y-7 p-5 md:grid-cols-4 md:p-6">
        <Metric label="วิธีในคลัง" value={num(candidates.length)} sub={`KEEP ${keep.length} · REACH ${reach.length}`} />
        <Metric label="เปิดใช้อยู่" value={num(enabledCount)} tone="accent" />
        <Metric label="พร้อมเสนอรอบนี้" value={num(readyCount)} tone="good" />
        <Metric
          label="ยังไม่ถูกเสนอ"
          value={num(candidates.length - readyCount)}
          sub="เพิ่งส่งไป · กลุ่มเล็กเกินไป · ไม่มีใครเข้าเกณฑ์ · ปิดไว้"
          tone="muted"
        />
      </Panel>

      <PlayGroup
        heading={`KEEP — ดูแล${v.th.people}ที่มีอยู่`}
        note="ฝั่งนี้ส่งข้อความหาคนโดยตรง และทุกวิธีส่งเฉพาะคนที่ยินยอมรับข่าวสาร"
        items={keep}
        cfgs={cfgs}
        perf={perf}
        tenantId={tenantId}
      />

      <PlayGroup
        heading={`REACH — หา${v.th.people}ใหม่`}
        note="ฝั่งนี้สร้างกลุ่มเป้าหมายให้โฆษณา ไม่ได้ส่งข้อความ · วิธีตัดลูกค้าเดิมและตัดคนที่ไม่ใช่ออก ช่วยประหยัดค่าโฆษณา"
        items={reach}
        cfgs={cfgs}
        perf={perf}
        tenantId={tenantId}
      />
    </>
  );
}

type PerfRow = { trials: number; successes: number; a: number; b: number };

function PlayGroup({
  heading,
  note,
  items,
  cfgs,
  perf,
  tenantId,
}: {
  heading: string;
  note: string;
  items: Awaited<ReturnType<typeof runMatch>>["candidates"];
  cfgs: Awaited<ReturnType<typeof getTenantPlays>>;
  perf: Map<string, PerfRow>;
  tenantId: string;
}) {
  return (
    <section className="mb-10">
      <div className="mb-4">
        <h2 className="c-h2 text-[var(--c-text)]">{heading}</h2>
        <p className="c-thai mt-1.5 max-w-3xl text-[0.82rem] text-[var(--c-text-3)]">
          {note}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {items.map((c) => {
          const cfg = cfgs.get(c.play.id);
          const enabled = cfg?.enabled !== false;
          const g = effectiveGuards(c.play, cfg);
          const p = perf.get(c.play.id);
          const rate = p ? p.a / (p.a + p.b) : c.play.priors.response_rate;

          return (
            <Panel key={c.play.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <EnginePill engine={c.play.engine} />
                    <span className="c-pill">{c.play.id}</span>
                    {!enabled && <span className="c-pill c-pill-bad">ปิดอยู่</span>}
                    {enabled && c.blocked && (
                      <span className="c-pill c-pill-warn">ยังไม่เสนอ</span>
                    )}
                    {enabled && !c.blocked && (
                      <span className="c-pill c-pill-good">พร้อม</span>
                    )}
                  </div>
                  <h3 className="c-h2 mt-3 text-[var(--c-text)]">{c.play.nameTh}</h3>
                  <p className="c-thai mt-1 text-[0.82rem] text-[var(--c-text-3)]">
                    {playLogicTh(c.play)}
                  </p>
                  <p className="c-thai mt-1 text-[0.78rem] text-[var(--c-text-4)]">
                    ใช้ได้กับ — {playCrossTh(c.play)}
                  </p>
                  <p className="c-mono mt-2.5 text-[0.75rem] text-[var(--c-text-4)]">
                    {c.play.cycle_shape.map((s) => CYCLE_LABEL[s]).join(" · ")}
                  </p>
                </div>

                <div className="grid shrink-0 grid-cols-3 gap-6 text-right">
                  <div>
                    <p className="c-label">คนเข้าเกณฑ์รอบนี้</p>
                    <p className="c-num mt-2 text-[1.25rem] text-[var(--c-text)]">
                      {num(c.audience.length)}
                    </p>
                  </div>
                  <div>
                    <p className="c-label">อัตราตอบกลับ</p>
                    <p className="c-num mt-2 text-[1.25rem] text-[var(--c-cyan)]">
                      {(rate * 100).toFixed(1)}%
                    </p>
                  </div>
                  <div>
                    <p className="c-label">คะแนน</p>
                    <p className="c-num mt-2 text-[1.25rem] text-[var(--c-text-2)]">
                      {c.score}
                    </p>
                  </div>
                </div>
              </div>

              {c.blocked && (
                <p className="c-thai mt-4 text-[0.8rem] text-[var(--c-warn)]">
                  {c.blockedTh ?? c.blocked}
                </p>
              )}

              <details className="mt-5 border-t border-[var(--c-line)] pt-4">
                <summary className="c-label cursor-pointer select-none text-[var(--c-text-2)]">
                  เพดาน · ค่าตั้งต้น · วิธีวัด
                </summary>

                <div className="mt-4 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
                  <ActionForm
                    action={updateGuardsAction}
                    fields={{ tenantId, playId: c.play.id }}
                    label="บันทึกเพดาน"
                    pendingLabel="Saving…"
                    variant="primary"
                    size="sm"
                    className="flex flex-col items-start gap-3"
                  >
                    <p className="c-label">เพดานเฉพาะร้านนี้</p>
                    <div className="grid grid-cols-3 gap-3">
                      <label className="flex flex-col gap-1.5">
                        <span className="c-mono text-[0.75rem] text-[var(--c-text-4)]">
                          กลุ่มขั้นต่ำ (คน)
                        </span>
                        <input
                          className="c-input"
                          name="minAudience"
                          type="number"
                          min={1}
                          defaultValue={g.min_audience}
                        />
                      </label>
                      <label className="flex flex-col gap-1.5">
                        <span className="c-mono text-[0.75rem] text-[var(--c-text-4)]">
                          เว้นระยะ (วัน)
                        </span>
                        <input
                          className="c-input"
                          name="cooldownDays"
                          type="number"
                          min={0}
                          defaultValue={g.cooldown_days}
                        />
                      </label>
                      <label className="flex flex-col gap-1.5">
                        <span className="c-mono text-[0.75rem] text-[var(--c-text-4)]">
                          ส่วนลดสูงสุด (%)
                        </span>
                        <input
                          className="c-input"
                          name="maxDiscountPct"
                          type="number"
                          min={0}
                          max={100}
                          defaultValue={g.max_discount_pct}
                        />
                      </label>
                    </div>
                  </ActionForm>

                  <div className="flex flex-col gap-4">
                    <div>
                      <p className="c-label">ค่าตั้งต้นที่เรียนรู้จากร้านอื่น</p>
                      <p className="c-thai mt-2 text-[0.8rem] text-[var(--c-text-2)]">
                        {p
                          ? `ใช้มาแล้ว ${num(p.trials)} ครั้งในธุรกิจรอบเดียวกัน ตอบกลับ ${num(p.successes)} คน — ร้านนี้จึงเริ่มที่ ${(rate * 100).toFixed(1)}% ตั้งแต่แคมเปญแรก`
                          : "ยังไม่มีข้อมูลจากร้านอื่น — ใช้ค่าตั้งต้นของวิธีนี้"}
                      </p>
                      <p className="c-thai mt-2 text-[0.75rem] text-[var(--c-text-4)]">
                        ข้ามบัญชีเฉพาะสถิติรวม ไม่มีแถวลูกค้าออกจากบัญชีเลย
                      </p>
                    </div>
                    <div>
                      <p className="c-label">วิธีวัดผลรอบนี้</p>
                      <p className="c-thai mt-2 text-[0.8rem] text-[var(--c-text-2)]">
                        {MEASUREMENT_LABEL[c.measurement]} · กันกลุ่มควบคุม {c.holdout_pct}%
                      </p>
                    </div>
                    <div>
                      <p className="c-label">ต้นทุนโดยประมาณ</p>
                      <p className="c-thai mt-2 text-[0.8rem] text-[var(--c-text-2)]">
                        {baht(c.estimated_cost)} · มูลค่าที่คาด {baht(c.expected_value)}
                      </p>
                    </div>
                    <ActionForm
                      action={togglePlayAction}
                      fields={{
                        tenantId,
                        playId: c.play.id,
                        enabled: enabled ? "0" : "1",
                      }}
                      label={enabled ? "ปิดวิธีนี้" : "เปิดวิธีนี้"}
                      pendingLabel="Saving…"
                      size="sm"
                    />
                  </div>
                </div>

                <div className="mt-5">
                  <p className="c-label">นิยามของวิธี (สำหรับทีมเทคนิค)</p>
                  <pre className="c-code mt-2.5">{toYaml(c.play)}</pre>
                </div>
              </details>
            </Panel>
          );
        })}
      </div>
    </section>
  );
}

/** แสดงนิยาม play เป็น YAML เพื่อย้ำว่ามันคือข้อมูล ไม่ใช่โค้ด */
function toYaml(
  p: Awaited<ReturnType<typeof runMatch>>["candidates"][number]["play"],
) {
  const lines: string[] = [];
  lines.push(`id: ${p.id}`);
  lines.push(`engine: ${p.engine}`);
  lines.push(`cycle_shape: [${p.cycle_shape.join(", ")}]`);
  lines.push("selector:");
  for (const [k, v] of Object.entries(p.selector)) {
    lines.push(`  ${k}: ${JSON.stringify(v)}`);
  }
  lines.push("guards:");
  for (const [k, v] of Object.entries(p.guards)) lines.push(`  ${k}: ${v}`);
  lines.push(
    `offer:      { type: ${p.offer.type}${p.offer.fallback ? `, fallback: ${p.offer.fallback}` : ""} }`,
  );
  lines.push(
    `copy_brief: { angle: "${p.copy_brief.angle}", avoid: [${p.copy_brief.avoid.join(", ")}] }`,
  );
  lines.push(`channel:    ${p.channel}`);
  lines.push(`measurement: ${p.measurement}`);
  lines.push(`priors:     { response_rate: ${p.priors.response_rate} }`);
  return lines.join("\n");
}
