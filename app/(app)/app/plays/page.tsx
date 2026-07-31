import { db } from "@/lib/engine/db";
import { effectiveGuards, getTenantPlays, runMatch } from "@/lib/engine/match";
import { getActiveTenantId } from "@/lib/shared/active-tenant";
import { profileFor } from "@/lib/shared/tenants";
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
  const tenantId = await getActiveTenantId();
  const v = profileFor(tenantId).vocab;
  const { candidates } = runMatch(tenantId);
  const cfgs = getTenantPlays(tenantId);

  const perf = new Map(
    (
      db()
        .prepare(
          `SELECT play_id, trials, successes, posterior_alpha AS a, posterior_beta AS b
           FROM play_performance`,
        )
        .all() as {
        play_id: string;
        trials: number;
        successes: number;
        a: number;
        b: number;
      }[]
    ).map((r) => [r.play_id, r]),
  );

  const keep = candidates.filter((c) => c.play.engine === "keep");
  const reach = candidates.filter((c) => c.play.engine === "reach");
  const enabledCount = candidates.filter(
    (c) => cfgs.get(c.play.id)?.enabled !== false,
  ).length;
  const readyCount = candidates.filter((c) => !c.blocked).length;

  return (
    <>
      <PageHead
        label="Play library"
        title="23 moves the system knows, and why some are not offered today"
        lead="The Morning Brief takes only the three most valuable that clear every limit. The rest are here, each with the reason it was held back — disable the ones you do not want, or set a per-play discount ceiling."
      />

      <Panel flat className="mb-8 grid grid-cols-2 gap-x-6 gap-y-7 p-5 md:grid-cols-4 md:p-6">
        <Metric label="Plays in library" value={num(candidates.length)} sub="15 KEEP + 8 REACH" />
        <Metric label="Enabled" value={num(enabledCount)} tone="accent" />
        <Metric label="Ready this round" value={num(readyCount)} tone="good" />
        <Metric
          label="Held back"
          value={num(candidates.length - readyCount)}
          sub="Cooldown · cohort too small · nobody qualifies"
          tone="muted"
        />
      </Panel>

      <PlayGroup
        heading={`KEEP — act on existing ${v.people}`}
        note="This side produces messages, and every play enforces marketing consent"
        items={keep}
        cfgs={cfgs}
        perf={perf}
        tenantId={tenantId}
      />

      <PlayGroup
        heading={`REACH — find new ${v.people}`}
        note="This side produces audiences, not messages · suppress_existing and suppress_bad_fit save money rather than spend it"
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
  items: ReturnType<typeof runMatch>["candidates"];
  cfgs: ReturnType<typeof getTenantPlays>;
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
                    {!enabled && <span className="c-pill c-pill-bad">Disabled</span>}
                    {enabled && c.blocked && (
                      <span className="c-pill c-pill-warn">Held</span>
                    )}
                    {enabled && !c.blocked && (
                      <span className="c-pill c-pill-good">Ready</span>
                    )}
                  </div>
                  <h3 className="c-h2 mt-3 text-[var(--c-text)]">{c.play.name}</h3>
                  <p className="c-thai mt-1 text-[0.82rem] text-[var(--c-text-3)]">
                    {c.play.logic}
                  </p>
                  <p className="c-thai mt-1 text-[0.78rem] text-[var(--c-text-4)]">
                    Across industries — {c.play.crossIndustry}
                  </p>
                  <p className="c-mono mt-2.5 text-[0.7rem] text-[var(--c-text-4)]">
                    {c.play.cycle_shape.map((s) => CYCLE_LABEL[s]).join(" · ")}
                  </p>
                </div>

                <div className="grid shrink-0 grid-cols-3 gap-6 text-right">
                  <div>
                    <p className="c-label">cohort this round</p>
                    <p className="c-num mt-2 text-[1.25rem] text-[var(--c-text)]">
                      {num(c.audience.length)}
                    </p>
                  </div>
                  <div>
                    <p className="c-label">response rate</p>
                    <p className="c-num mt-2 text-[1.25rem] text-[var(--c-cyan)]">
                      {(rate * 100).toFixed(1)}%
                    </p>
                  </div>
                  <div>
                    <p className="c-label">score</p>
                    <p className="c-num mt-2 text-[1.25rem] text-[var(--c-text-2)]">
                      {c.score}
                    </p>
                  </div>
                </div>
              </div>

              {c.blocked && (
                <p className="c-thai mt-4 text-[0.8rem] text-[var(--c-warn)]">
                  {c.blocked}
                </p>
              )}

              <details className="mt-5 border-t border-[var(--c-line)] pt-4">
                <summary className="c-label cursor-pointer select-none text-[var(--c-text-2)]">
                  Guards · prior · measurement
                </summary>

                <div className="mt-4 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
                  <ActionForm
                    action={updateGuardsAction}
                    fields={{ tenantId, playId: c.play.id }}
                    label="Save guards"
                    pendingLabel="Saving…"
                    variant="primary"
                    size="sm"
                    className="flex flex-col items-start gap-3"
                  >
                    <p className="c-label">shop guard overrides</p>
                    <div className="grid grid-cols-3 gap-3">
                      <label className="flex flex-col gap-1.5">
                        <span className="c-mono text-[0.68rem] text-[var(--c-text-4)]">
                          min_audience
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
                        <span className="c-mono text-[0.68rem] text-[var(--c-text-4)]">
                          cooldown_days
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
                        <span className="c-mono text-[0.68rem] text-[var(--c-text-4)]">
                          max_discount_pct
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
                      <p className="c-label">prior inherited across accounts</p>
                      <p className="c-thai mt-2 text-[0.8rem] text-[var(--c-text-2)]">
                        {p
                          ? `${num(p.trials)} runs in the same cycle, ${num(p.successes)} responses — so this shop starts at ${(rate * 100).toFixed(1)}% from its first campaign`
                          : "No posterior yet — using the play's default"}
                      </p>
                      <p className="c-thai mt-2 text-[0.74rem] text-[var(--c-text-4)]">
                        Only aggregate statistics cross — no customer row ever leaves the account
                      </p>
                    </div>
                    <div>
                      <p className="c-label">measurement rule this round</p>
                      <p className="c-thai mt-2 text-[0.8rem] text-[var(--c-text-2)]">
                        {MEASUREMENT_LABEL[c.measurement]} · holdout {c.holdout_pct}%
                      </p>
                    </div>
                    <div>
                      <p className="c-label">estimated cost</p>
                      <p className="c-thai mt-2 text-[0.8rem] text-[var(--c-text-2)]">
                        {baht(c.estimated_cost)} · expected value {baht(c.expected_value)}
                      </p>
                    </div>
                    <ActionForm
                      action={togglePlayAction}
                      fields={{
                        tenantId,
                        playId: c.play.id,
                        enabled: enabled ? "0" : "1",
                      }}
                      label={enabled ? "Disable this play" : "Enable this play"}
                      pendingLabel="Saving…"
                      size="sm"
                    />
                  </div>
                </div>

                <div className="mt-5">
                  <p className="c-label">play definition</p>
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
function toYaml(p: ReturnType<typeof runMatch>["candidates"][number]["play"]) {
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
