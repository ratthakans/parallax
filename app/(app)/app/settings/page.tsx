import { activeTenantId } from "@/app/(app)/tenant";
import { all } from "@/lib/engine/sql";
import { aiCacheStats, aiConfigured } from "@/lib/engine/ai";
import { getTenant } from "@/lib/engine/match";
import { demoState } from "@/lib/engine/demo";

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
  const tenantId = await activeTenantId();
  const profile = profileFor(tenantId);
  const v = profile.vocab;
  const ai = aiConfigured();

  // ห้าคำถามที่ไม่ขึ้นต่อกัน — ถามพร้อมกัน ไม่ใช่ต่อแถว
  const [match, cache, demo, log] = await Promise.all([
    runMatch(tenantId),
    aiCacheStats(),
    demoState(tenantId),
    all<{
      actor: string;
      action: string;
      detail: string | null;
      at: string;
    }>("SELECT actor, action, detail, at FROM activity_log WHERE tenant_id = ? ORDER BY id DESC LIMIT 15", tenantId),
  ]);
  const tenant = match.tenant;
  const playCount = match.candidates.length;

  const cachedTotal = cache.reduce((s, c) => s + c.n, 0);

  return (
    <>
      <PageHead
        label="ตั้งค่า"
        title="เพดาน · AI · เครื่องมือเดโม"
        lead="Every limit here is enforced in the dispatch layer, not on screen — change one and it applies from the next match run."
      />

      {/* ── โปรไฟล์บัญชี ── */}
      <Panel className="mb-6 p-5 md:p-6">
        <h2 className="c-h2 text-[var(--c-text)]">What this account is</h2>
        <div className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
          <Metric size="sm" label="บัญชี" value={profile.name} />
          <Metric size="sm" label="ประเภทธุรกิจ" value={profile.industry} />
          <Metric
            size="sm"
            label="รูปทรงวงจรรายได้"
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
          play ถูกกรองด้วยรูปทรงวงจรของบัญชี ไม่ใช่รันให้ทุกคนเหมือนกัน — บริษัทแท็กซี่จึงไม่มีวัน
            ได้ข้อเสนอ "ระบายของค้างสต๊อก" และ
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
          ระบบที่ส่งได้ไม่จำกัดคือระบบที่ทำให้ร้านถูกปิดเสียง
        </p>
        <ActionForm
          action={updateLimitsAction}
          fields={{ tenantId }}
          label="บันทึกเพดาน"
          pendingLabel="กำลังบันทึก…"
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
                นับรวมทุกแคมเปญ ทั้ง KEEP และ REACH
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
                กดส่งในช่วงนี้จะไม่มีอะไรออกไป
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
                ทับเพดานของ play เสมอ
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
              การเลือกกลุ่ม จัดอันดับ และคำนวณส่วนต่าง เป็นเลขคณิตล้วน ห้าม LLM เข้าใกล้ —
            เพราะต้องอธิบายได้ ทำซ้ำได้ผลเดิม และไม่มีค่าใช้จ่ายในการรัน
            </p>
          </div>
          <span className={`c-pill ${ai ? "c-pill-good" : "c-pill-warn"}`}>
            {ai ? "เชื่อมต่อ AI แล้ว" : "ยังไม่ได้เชื่อมต่อ AI"}
          </span>
        </div>

        {/* ── หน้านี้เป็นที่เดียวที่ควรเห็นชื่อตัวแปร ──
            เพราะเป็นหน้าที่คนดูแลระบบมาหาวิธีเปิดใช้งาน ส่วนหน้าบรีฟ
            ที่เจ้าของร้านอ่านทุกเช้า ไม่ต้องรู้ว่ามันชื่ออะไร */}
        {!ai && (
          <p className="c-thai mt-5 border-l-2 border-[var(--c-warn)] pl-4 text-[0.84rem] text-[var(--c-text-2)]">
            งานทั้งห้าอย่างข้างล่างกำลังใช้สูตรสำเร็จแทน ทุกอย่างยังทำงานครบและไม่มีค่าใช้จ่าย
            แต่ข้อความจะเป็นแบบตายตัว และการจับคู่คอลัมน์ตอนนำเข้าจะเดาจากชื่อหัวตารางอย่างเดียว —
            ตั้งค่า <span className="c-mono">ANTHROPIC_API_KEY</span> แล้วรีสตาร์ทเพื่อเปิดใช้งาน
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
              label="ล้างแคช AI"
              pendingLabel="กำลังล้าง…"
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
          แคมเปญที่เพิ่งอนุมัติเมื่อสิบวินาทีที่แล้วยังไม่ถึง T+7 ทุกอย่างจึงขึ้นว่า "ยังไม่พอสรุป" —
            ถูกต้องตามสถิติ แต่ใช้แสดงความสามารถของชั้น Proof ไม่ได้
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
              pendingLabel="กำลังเลื่อนเวลาและวัดใหม่…"
              disabled={!demoTools}
              full
            />
          ))}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-6 md:grid-cols-4">
          <Metric
            size="sm"
            label="แคมเปญที่เก่าที่สุด"
            value={
              demo.oldestCampaignAt
                ? `${Math.floor((Date.now() - Date.parse(demo.oldestCampaignAt)) / 86400000)}d`
                : "—"
            }
            sub="ต้องมีอายุ 90 วันขึ้นไป T+90 ถึงจะสรุปได้"
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
          label="สร้างชุดข้อมูลใหม่"
          confirm="กดอีกครั้งเพื่อลบและสร้างใหม่"
          pendingLabel="กำลังสร้างใหม่…"
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
          ใครทำอะไรเมื่อไร — ทุกการอนุมัติและการส่งถูกบันทึกไว้
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
          คอนโซลนี้ยังไม่มีระบบเข้าสู่ระบบ ทุกการกระทำจึงถูกบันทึกเป็น owner —
          ต้องเพิ่มการยืนยันตัวตนก่อนใช้งานจริง
        </p>
      </Panel>
    </>
  );
}
