import { all } from "@/lib/engine/sql";
import { aiCacheStats, aiConfigured } from "@/lib/engine/ai";
import { getTenant } from "@/lib/engine/match";
import { demoState } from "@/lib/engine/demo";
import { getActiveTenantId } from "@/lib/shared/active-tenant";
import { profileFor } from "@/lib/shared/tenants";
import { ALL_PLAYS } from "@/lib/shared/plays";
import { runMatch } from "@/lib/engine/match";
import { CYCLE_LABEL } from "@/lib/shared/types";
import { Metric, PageHead, Panel, num } from "@/components/console/ui";
import {
  clearAiCacheAction,
  reseedAction,
  travelAction,
  updateLimitsAction,
} from "../../actions";
import { ActionForm } from "@/components/console/action-form";
import { demoToolsEnabled } from "@/lib/shared/demo-tools";

export const dynamic = "force-dynamic";

const AI_JOB_LABEL: Record<string, string> = {
  map_columns: "Column mapping on import",
  product_roles: "Inferring product roles",
  campaign_copy: "Writing copy in three tones",
  brief_summary: "Summarising the Morning Brief",
  explain_play: "Explaining why a play was suggested",
};

const AI_JOBS = [
  { kind: "map_columns", why: "No two POS vendors name their headers the same way — fixed rules cannot cover it" },
  { kind: "product_roles", why: "We need to know which item is the anchor and which follows it" },
  { kind: "campaign_copy", why: "Called once per campaign, never per person — this is what sets the margin" },
  { kind: "brief_summary", why: "An owner should never need to know what RFM means" },
  { kind: "explain_play", why: "We must be able to answer why this person, every time" },
];

const AI_NEVER = [
  "Choosing who is in a cohort",
  "Scoring and ranking plays",
  "Computing the difference and its confidence interval",
  "Deciding whether to send",
  "Enforcing cooldowns and frequency caps",
];

export default async function SettingsPage() {
  const demoTools = demoToolsEnabled();
  const tenantId = await getActiveTenantId();
  const profile = profileFor(tenantId);
  const v = profile.vocab;
  const tenant = await getTenant(tenantId);
  const ai = aiConfigured();
  const cache = await aiCacheStats();
  const demo = await demoState(tenantId);
  const playCount = (await runMatch(tenantId)).candidates.length;

  const log = await all<{
    actor: string;
    action: string;
    detail: string | null;
    at: string;
  }>("SELECT actor, action, detail, at FROM activity_log WHERE tenant_id = ? ORDER BY id DESC LIMIT 15", tenantId);

  const cachedTotal = cache.reduce((s, c) => s + c.n, 0);

  return (
    <>
      <PageHead
        label="Settings"
        title="Limits · AI · demo tools"
        lead="Every limit here is enforced in the dispatch layer, not on screen — change one and it applies from the next match run."
      />

      {/* ── โปรไฟล์บัญชี ── */}
      <Panel className="mb-6 p-5 md:p-6">
        <h2 className="c-h2 text-[var(--c-text)]">What this account is</h2>
        <div className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
          <Metric size="sm" label="Account" value={profile.name} />
          <Metric size="sm" label="Industry" value={profile.industry} />
          <Metric
            size="sm"
            label="Revenue cycle shape"
            value={CYCLE_LABEL[profile.cycleShape]}
            sub={`${playCount} of ${ALL_PLAYS.length} plays apply`}
          />
          <Metric
            size="sm"
            label={`${v.base} size`}
            value={num(profile.scale.people)}
            sub={`All ${v.people} in the dataset`}
          />
        </div>
        <p className="c-thai mt-6 max-w-3xl text-[0.8rem] text-[var(--c-text-3)]">
          Dataset source: {profile.source}
        </p>
        <p className="c-thai mt-2 max-w-3xl text-[0.78rem] text-[var(--c-text-4)]">
          Plays are filtered by the account's cycle shape rather than run for
          everyone — which is why a taxi company never gets a “clear dead stock”
          offer, and a political party never gets a cross-sell.
        </p>
        {profile.compliance && (
          <div className="mt-6 border-l-2 border-[var(--c-warn)] pl-4">
            <p className="c-label text-[var(--c-warn)]">constraints on this account</p>
            <p className="c-thai mt-2 max-w-3xl text-[0.83rem] leading-relaxed text-[var(--c-text-2)]">
              {profile.compliance}
            </p>
          </div>
        )}
      </Panel>

      {/* ── เพดาน ── */}
      <Panel className="mb-6 p-5 md:p-6">
        <h2 className="c-h2 text-[var(--c-text)]">Limits in force</h2>
        <p className="c-thai mt-1.5 text-[0.83rem] text-[var(--c-text-3)]">
          A system that can send without limit is a system that gets the shop muted
        </p>
        <ActionForm
          action={updateLimitsAction}
          fields={{ tenantId }}
          label="Save limits"
          pendingLabel="Saving…"
          variant="primary"
          className="mt-6 flex flex-col items-start gap-6"
        >
          <div className="grid w-full gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex flex-col gap-2">
              <span className="c-label">max messages per person per week</span>
              <input
                className="c-input"
                name="weeklyCap"
                type="number"
                min={1}
                max={14}
                defaultValue={tenant?.max_messages_per_week ?? 2}
              />
              <span className="c-thai text-[0.74rem] text-[var(--c-text-4)]">
                Checked across every campaign, KEEP and REACH alike
              </span>
            </label>
            <label className="flex flex-col gap-2">
              <span className="c-label">quiet hours start</span>
              <input
                className="c-input"
                name="quietStart"
                type="number"
                min={0}
                max={23}
                defaultValue={tenant?.quiet_hours_start ?? 21}
              />
              <span className="c-thai text-[0.74rem] text-[var(--c-text-4)]">
                Press send inside this window and nothing goes out
              </span>
            </label>
            <label className="flex flex-col gap-2">
              <span className="c-label">quiet hours end</span>
              <input
                className="c-input"
                name="quietEnd"
                type="number"
                min={0}
                max={23}
                defaultValue={tenant?.quiet_hours_end ?? 9}
              />
              <span className="c-thai text-[0.74rem] text-[var(--c-text-4)]">
                It is currently {new Date().getHours()}:00
              </span>
            </label>
            <label className="flex flex-col gap-2">
              <span className="c-label">shop discount ceiling (%)</span>
              <input
                className="c-input"
                name="maxDiscount"
                type="number"
                min={0}
                max={100}
                defaultValue={tenant?.max_discount_pct ?? 20}
              />
              <span className="c-thai text-[0.74rem] text-[var(--c-text-4)]">
                Always overrides a play's own ceiling
              </span>
            </label>
          </div>
        </ActionForm>
      </Panel>

      {/* ── AI ── */}
      <Panel className="mb-6 p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="c-h2 text-[var(--c-text)]">Where AI sits</h2>
            <p className="c-thai mt-1.5 max-w-2xl text-[0.83rem] text-[var(--c-text-3)]">
              Selection, ranking and computing the difference are pure arithmetic. No LLM
              is allowed near them — they must be explainable, repeatable, and free to
              run.
            </p>
          </div>
          <span className={`c-pill ${ai ? "c-pill-good" : "c-pill-warn"}`}>
            {ai ? "AI connected" : "AI not connected"}
          </span>
        </div>

        {!ai && (
          <p className="c-thai mt-5 border-l-2 border-[var(--c-warn)] pl-4 text-[0.84rem] text-[var(--c-text-2)]">
            <span className="c-mono">ANTHROPIC_API_KEY</span> is not set, so the five
            jobs below fall back to deterministic templates. Everything still works and
            costs nothing, but the copy is templated and column mapping guesses from
            header names alone.
          </p>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div>
            <p className="c-label text-[var(--c-good)]">where ai is used</p>
            <ul className="mt-4 flex flex-col gap-3.5">
              {AI_JOBS.map((j) => {
                const hit = cache.find((c) => c.kind === j.kind);
                return (
                  <li key={j.kind}>
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="c-thai text-[0.85rem] text-[var(--c-text)]">
                        {AI_JOB_LABEL[j.kind]}
                      </span>
                      <span className="c-mono shrink-0 text-[0.72rem] text-[var(--c-text-4)]">
                        {hit ? `${num(hit.n)} cached` : "Never called"}
                      </span>
                    </div>
                    <p className="c-thai mt-1 text-[0.76rem] text-[var(--c-text-4)]">
                      {j.why}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>
          <div>
            <p className="c-label text-[var(--c-bad)]">where ai is forbidden</p>
            <ul className="mt-4 flex flex-col gap-2.5">
              {AI_NEVER.map((x) => (
                <li key={x} className="c-thai text-[0.85rem] text-[var(--c-text-2)]">
                  {x}
                </li>
              ))}
            </ul>
            <p className="c-thai mt-5 text-[0.76rem] text-[var(--c-text-4)]">
              Every AI result is cached against a hash of its input, so repeats cost
              nothing. {num(cachedTotal)} entries cached right now.
            </p>
            <ActionForm
              action={clearAiCacheAction}
              fields={{ tenantId }}
              label="Clear AI cache"
              pendingLabel="Clearing…"
              size="sm"
              className="mt-4"
            />
          </div>
        </div>
      </Panel>

      {/* ── เครื่องมือเดโม ── */}
      <Panel className="mb-6 p-5 md:p-6">
        <h2 className="c-h2 text-[var(--c-text)]">Demo tools</h2>
        <p className="c-thai mt-1.5 max-w-2xl text-[0.83rem] text-[var(--c-text-3)]">
          A campaign approved ten seconds ago has not reached T+7, so everything reads
          “not enough yet” — statistically correct, and useless for showing what the
          Proof layer does. Time travel shifts approval dates backwards and re-measures.
          Everything else is real — the holdout, the arm split, the formulas. No result
          is edited.
        </p>

        {/* บอกเหตุผลตรงที่ปุ่มอยู่ ไม่ใช่ปล่อยให้กดแล้วงงว่าทำไมไม่ทำงาน */}
        {!demoTools && (
          <p className="c-msg c-msg-err mt-5">
            Turned off on the public console — otherwise any visitor could wipe or
            time-shift the dataset the next person is looking at. Set{" "}
            <span className="c-mono">PARALLAX_DEMO_TOOLS=1</span> to enable them.
          </p>
        )}

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {[7, 30, 90].map((d) => (
            <ActionForm
              key={d}
              action={travelAction}
              fields={{ tenantId, days: d }}
              label={`Travel forward ${d} days`}
              pendingLabel="Shifting and re-measuring…"
              disabled={!demoTools}
              full
            />
          ))}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-6 md:grid-cols-4">
          <Metric
            size="sm"
            label="Oldest campaign"
            value={
              demo.oldestCampaignAt
                ? `${Math.floor((Date.now() - Date.parse(demo.oldestCampaignAt)) / 86400000)}d`
                : "—"
            }
            sub="Needs 90+ days before T+90 concludes"
          />
          {(["positive", "no_effect", "insufficient_data"] as const).map((v) => {
            const hit = demo.verdicts.find((x) => x.verdict === v);
            return (
              <Metric
                key={v}
                size="sm"
                label={
                  v === "positive"
                    ? "Worked"
                    : v === "no_effect"
                      ? "No different"
                      : "Not enough yet"
                }
                value={num(hit?.n ?? 0)}
                tone={v === "positive" ? "good" : v === "no_effect" ? "bad" : "muted"}
              />
            );
          })}
        </div>

        {/* ปุ่มเดียวในหน้านี้ที่ลบของ — ต้องหน้าตาต่างและต้องกดสองครั้ง */}
        <ActionForm
          action={reseedAction}
          fields={{ tenantId }}
          label="Rebuild the dataset"
          confirm="Press again to delete and rebuild"
          pendingLabel="Rebuilding…"
          variant="danger"
          size="sm"
          disabled={!demoTools}
          className="mt-7 border-t border-[var(--c-line)] pt-5"
          note={
            <p className="c-thai max-w-2xl text-[0.76rem] text-[var(--c-text-4)]">
              Deletes this account&apos;s campaigns and results, then regenerates the
              dataset (other accounts untouched). The {v.base} and payment history are
              generated deterministically, so the figures repeat exactly. Measured
              results shift slightly, because campaign ids are random and the
              treated/held split is computed from them.
            </p>
          }
        />
      </Panel>

      {/* ── บันทึกการใช้งาน ── */}
      <Panel className="p-5 md:p-6">
        <h2 className="c-h2 text-[var(--c-text)]">Activity log</h2>
        <p className="c-thai mt-1.5 text-[0.83rem] text-[var(--c-text-3)]">
          Who did what, and when — every approval and send is recorded
        </p>
        <div className="c-scroll mt-5">
          <table className="c-table min-w-[38rem]">
            <thead>
              <tr>
                <th>Time</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {log.map((l, i) => (
                <tr key={`${l.at}-${i}`}>
                  <td className="c-mono whitespace-nowrap text-[0.74rem]">
                    {new Date(l.at).toLocaleString("en-GB", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </td>
                  <td className="c-mono text-[0.76rem]">{l.actor}</td>
                  <td className="c-mono text-[0.76rem] text-[var(--c-text)]">
                    {l.action}
                  </td>
                  <td className="c-thai text-[0.78rem]">{l.detail ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="c-thai mt-5 text-[0.78rem] text-[var(--c-warn)]">
          This console has no login yet, so every actor is recorded as owner —
          authorisation has to be added before real use.
        </p>
      </Panel>
    </>
  );
}
