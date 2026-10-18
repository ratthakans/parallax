import { activeTenantId } from "@/app/(app)/tenant";
import { all, withIdentity } from "@/lib/engine/sql";
import { aiCacheStats, aiConfigured } from "@/lib/engine/ai";
import { getTenant } from "@/lib/engine/match";
import { demoState } from "@/lib/engine/demo";

import { profileFor } from "@/lib/shared/tenants";
import { ALL_PLAYS } from "@/lib/shared/plays";
import { runMatch } from "@/lib/engine/match";
import { CYCLE_LABEL_TH } from "@/lib/shared/types";
import { Metric, PageHead, Panel, num } from "@/components/console/ui";
import {
  clearAiCacheAction,
  reseedAction,
  wipeCustomerDataAction,
  travelAction,
  updateLimitsAction,
} from "../../actions";
import { ActionForm } from "@/components/console/action-form";
import { MfaSetup } from "@/components/console/mfa-setup";
import { removeMfaAction } from "../../mfa-actions";
import { currentUser } from "@/lib/shared/session";
import { supabaseServer } from "@/lib/shared/supabase";
import { membershipEnforced } from "@/lib/engine/access";
import { thaiDate } from "@/lib/shared/format";
import { demoToolsEnabled } from "@/lib/shared/demo-tools";
import { digestPrefs } from "@/lib/engine/digest";
import { saveDigestPrefsAction } from "../../digest-actions";
import { DIGEST_WEEKDAYS, WEEKDAY_TH } from "@/lib/shared/digest";

export const metadata = { title: "ตั้งค่าและความปลอดภัย" };
export const dynamic = "force-dynamic";

const AI_JOB_LABEL: Record<string, string> = {
  map_columns: "จับคู่คอลัมน์ตอนนำเข้า",
  product_roles: "ทำความเข้าใจบทบาทของสินค้า",
  campaign_copy: "เขียนข้อความสามโทน",
  brief_summary: "สรุปบรีฟเช้า",
  explain_play: "อธิบายเหตุผลของงานที่แนะนำ",
};

const AI_JOBS = [
  { kind: "map_columns", why: "POS แต่ละรายตั้งชื่อหัวตารางไม่เหมือนกัน กฎตายตัวจึงครอบคลุมไม่ได้" },
  { kind: "product_roles", why: "ต้องรู้ว่าสินค้าใดเป็นสินค้าหลัก และสินค้าใดมักถูกซื้อถัดไป" },
  { kind: "campaign_copy", why: "เรียกหนึ่งครั้งต่อแคมเปญ ไม่ได้เรียกรายคน เพื่อควบคุมต้นทุน" },
  { kind: "brief_summary", why: "เจ้าของธุรกิจไม่ควรต้องรู้ว่า RFM แปลว่าอะไร" },
  { kind: "explain_play", why: "ระบบต้องตอบได้ทุกครั้งว่าทำไมจึงเลือกลูกค้ากลุ่มนี้" },
];

const AI_NEVER = [
  "เลือกว่าลูกค้าคนใดอยู่ในกลุ่ม",
  "ให้คะแนนและจัดลำดับงาน",
  "คำนวณผลต่างและช่วงความเชื่อมั่น",
  "ตัดสินใจว่าจะส่งหรือไม่",
  "บังคับช่วงพักและเพดานความถี่",
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
        lead="ทุกเพดานถูกบังคับที่ชั้นส่งจริง ไม่ได้อยู่แค่บนหน้าจอ เมื่อแก้แล้วจะมีผลตั้งแต่รอบคำนวณถัดไป"
      />

      <MfaPanel />

      <DigestPanel tenantId={tenantId} />

      {/* ── โปรไฟล์บัญชี ── */}
      <Panel className="mb-6 p-5 md:p-6">
        <h2 className="c-h2 text-[var(--c-text)]">ข้อมูลบัญชีนี้</h2>
        <div className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
          <Metric size="sm" label="บัญชี" value={profile.name} />
          <Metric size="sm" label="ประเภทธุรกิจ" value={profile.industry} />
          <Metric
            size="sm"
            label="รูปทรงวงจรรายได้"
            value={CYCLE_LABEL_TH[profile.cycleShape]}
            sub={`ใช้ได้ ${playCount} จากทั้งหมด ${ALL_PLAYS.length} วิธี`}
          />
          <Metric
            size="sm"
            label={`ขนาด${v.th.base}`}
            value={num(profile.scale.people)}
            sub={`${v.th.people}ทั้งหมดในชุดข้อมูล`}
          />
        </div>
        <p className="c-thai mt-6 max-w-3xl text-[0.8rem] text-[var(--c-text-3)]">
          ที่มาของชุดข้อมูล: {profile.source}
        </p>
        <p className="c-thai mt-2 max-w-3xl text-[0.78rem] text-[var(--c-text-4)]">
          play ถูกกรองด้วยรูปทรงวงจรของบัญชี ไม่ใช่รันให้ทุกคนเหมือนกัน — บริษัทแท็กซี่จึงไม่มีวัน
            ได้ข้อเสนอ "ระบายของค้างสต๊อก" และ
        </p>
        {profile.compliance && (
          <div className="mt-6 border-l-2 border-[var(--c-warn)] pl-4">
            <p className="c-label-th text-[var(--c-warn)]">ข้อจำกัดของบัญชีนี้</p>
            <p className="c-thai mt-2 max-w-3xl text-[0.83rem] leading-relaxed text-[var(--c-text-2)]">
              {profile.compliance}
            </p>
          </div>
        )}
      </Panel>

      {/* ── เพดาน ── */}
      <Panel className="mb-6 p-5 md:p-6">
        <h2 className="c-h2 text-[var(--c-text)]">เพดานที่บังคับอยู่</h2>
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
              <span className="c-label-th">ข้อความสูงสุดต่อคนต่อสัปดาห์</span>
              <input
                className="c-input"
                name="weeklyCap"
                type="number"
                min={1}
                max={14}
                defaultValue={tenant?.max_messages_per_week ?? 2}
              />
              <span className="c-thai text-[0.75rem] text-[var(--c-text-4)]">
                นับรวมทุกแคมเปญ ทั้ง KEEP และ REACH
              </span>
            </label>
            <label className="flex flex-col gap-2">
              <span className="c-label-th">เริ่มช่วงเวลาห้ามส่ง</span>
              <input
                className="c-input"
                name="quietStart"
                type="number"
                min={0}
                max={23}
                defaultValue={tenant?.quiet_hours_start ?? 21}
              />
              <span className="c-thai text-[0.75rem] text-[var(--c-text-4)]">
                กดส่งในช่วงนี้จะไม่มีอะไรออกไป
              </span>
            </label>
            <label className="flex flex-col gap-2">
              <span className="c-label-th">จบช่วงเวลาห้ามส่ง</span>
              <input
                className="c-input"
                name="quietEnd"
                type="number"
                min={0}
                max={23}
                defaultValue={tenant?.quiet_hours_end ?? 9}
              />
              <span className="c-thai text-[0.75rem] text-[var(--c-text-4)]">
                เวลาปัจจุบัน {new Date().getHours()}:00 น.
              </span>
            </label>
            <label className="flex flex-col gap-2">
              <span className="c-label-th">เพดานส่วนลดของร้าน (%)</span>
              <input
                className="c-input"
                name="maxDiscount"
                type="number"
                min={0}
                max={100}
                defaultValue={tenant?.max_discount_pct ?? 20}
              />
              <span className="c-thai text-[0.75rem] text-[var(--c-text-4)]">
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
            <h2 className="c-h2 text-[var(--c-text)]">AI ใช้ตรงไหน</h2>
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
            <p className="c-label-th text-[var(--c-good)]">งานที่ใช้ AI</p>
            <ul className="mt-4 flex flex-col gap-3.5">
              {AI_JOBS.map((j) => {
                const hit = cache.find((c) => c.kind === j.kind);
                return (
                  <li key={j.kind}>
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="c-thai text-[0.85rem] text-[var(--c-text)]">
                        {AI_JOB_LABEL[j.kind]}
                      </span>
                      <span className="c-mono shrink-0 text-[0.75rem] text-[var(--c-text-4)]">
                        {hit ? `แคชแล้ว ${num(hit.n)}` : "ยังไม่เคยเรียก"}
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
            <p className="c-label-th text-[var(--c-bad)]">งานที่ห้าม AI ตัดสิน</p>
            <ul className="mt-4 flex flex-col gap-2.5">
              {AI_NEVER.map((x) => (
                <li key={x} className="c-thai text-[0.85rem] text-[var(--c-text-2)]">
                  {x}
                </li>
              ))}
            </ul>
            <p className="c-thai mt-5 text-[0.76rem] text-[var(--c-text-4)]">
              ผลจาก AI ถูกแคชตามข้อมูลเข้า การเรียกซ้ำจึงไม่มีค่าใช้จ่ายเพิ่ม
              ขณะนี้มีแคช {num(cachedTotal)} รายการ
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
        <h2 className="c-h2 text-[var(--c-text)]">เครื่องมือเดโม</h2>
        <p className="c-thai mt-1.5 max-w-2xl text-[0.83rem] text-[var(--c-text-3)]">
          แคมเปญที่เพิ่งอนุมัติเมื่อสิบวินาทีที่แล้วยังไม่ถึง T+7 ทุกอย่างจึงขึ้นว่า "ยังไม่พอสรุป" —
            ถูกต้องตามสถิติ แต่ใช้แสดงความสามารถของชั้น Proof ไม่ได้
        </p>

        {/* บอกเหตุผลตรงที่ปุ่มอยู่ ไม่ใช่ปล่อยให้กดแล้วงงว่าทำไมไม่ทำงาน */}
        {!demoTools && (
          <p className="c-msg c-msg-err mt-5">
            เครื่องมือนี้ปิดอยู่บนระบบสาธารณะ เพื่อไม่ให้ผู้เข้าชมลบหรือเลื่อนเวลา
            ชุดข้อมูลที่คนถัดไปกำลังดูอยู่ ตั้งค่า{" "}
            <span className="c-mono">PARALLAX_DEMO_TOOLS=1</span> เพื่อเปิดใช้งาน
          </p>
        )}

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {[7, 30, 90].map((d) => (
            <ActionForm
              key={d}
              action={travelAction}
              fields={{ tenantId, days: d }}
              label={`เลื่อนเวลาไปข้างหน้า ${d} วัน`}
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
                ? `${Math.floor((Date.now() - Date.parse(demo.oldestCampaignAt)) / 86400000)} วัน`
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
                    ? "ได้ผล"
                    : v === "no_effect"
                      ? "ไม่ต่าง"
                      : "ข้อมูลยังไม่พอ"
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
              ลบแคมเปญและผลลัพธ์ของบัญชีนี้ แล้วสร้างชุดข้อมูลใหม่โดยไม่แตะบัญชีอื่น
              {v.th.base}และประวัติการจ่ายถูกสร้างด้วยสูตรเดิม ตัวเลขจึงซ้ำได้ทุกครั้ง
              ส่วนผลวัดอาจขยับเล็กน้อยเพราะรหัสแคมเปญและการแบ่งกลุ่มถูกสร้างใหม่
            </p>
          }
        />
      </Panel>

      {/* ── บันทึกการใช้งาน ── */}
      <Panel className="p-5 md:p-6">
        <h2 className="c-h2 text-[var(--c-text)]">บันทึกการใช้งาน</h2>
        <p className="c-thai mt-1.5 text-[0.83rem] text-[var(--c-text-3)]">
          ใครทำอะไรเมื่อไร — ทุกการอนุมัติและการส่งถูกบันทึกไว้
        </p>
        <div className="c-scroll mt-5">
          <table className="c-table min-w-[38rem]">
            <thead>
              <tr>
                <th>เวลา</th>
                <th>ผู้ใช้งาน</th>
                <th>การกระทำ</th>
                <th>รายละเอียด</th>
              </tr>
            </thead>
            <tbody>
              {log.map((l, i) => (
                <tr key={`${l.at}-${i}`}>
                  <td className="c-mono whitespace-nowrap text-[0.75rem]">
                    {new Date(l.at).toLocaleString("th-TH", {
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
          ทุกการอนุมัติและการส่งผูกกับบัญชีผู้ใช้ที่เข้าสู่ระบบ เพื่อให้ตรวจสอบย้อนหลังได้
        </p>
      </Panel>

      {/* ── ล้างข้อมูลลูกค้าทั้งบัญชี ──
          ย้ายมาจากช่องติ๊กในหน้านำเข้า ซึ่งติ๊กครั้งเดียวเคยลบลูกค้าทั้งบัญชี
          ที่นี่ต้องพิมพ์ชื่อร้านให้ตรงแล้วกดสองครั้ง — การกระทำที่ย้อนกลับไม่ได้
          ต้องทำยากกว่าการกดพลาด */}
      <Panel className="mt-6 border-l-2 border-[var(--c-bad)] p-5 md:p-6">
        <p className="c-label-th text-[var(--c-bad)]">ล้างข้อมูลลูกค้าทั้งบัญชี</p>
        <p className="c-thai mt-2.5 max-w-2xl text-[0.84rem] leading-relaxed text-[var(--c-text-2)]">
          ลบลูกค้า ช่องทางติดต่อ ประวัติการซื้อ สินค้า และแคมเปญทั้งหมดของ{" "}
          {tenant?.name ?? profile.name} เพื่อนำเข้าใหม่ตั้งแต่ต้น ย้อนกลับไม่ได้ —
          บันทึกการใช้งานและประวัติการชำระเงินยังอยู่
        </p>
        <ActionForm
          action={wipeCustomerDataAction}
          fields={{ tenantId }}
          label="ล้างข้อมูลลูกค้า"
          pendingLabel="กำลังล้าง…"
          variant="danger"
          size="sm"
          confirm={`ยืนยัน — ลบทั้งหมดของ ${tenant?.name ?? profile.name}`}
          className="mt-4 flex flex-wrap items-center gap-2.5"
        >
          <input
            name="confirmName"
            required
            autoComplete="off"
            aria-label="พิมพ์ชื่อร้านเพื่อยืนยัน"
            placeholder={`พิมพ์ "${tenant?.name ?? profile.name}" เพื่อยืนยัน`}
            className="c-input max-w-xs"
          />
        </ActionForm>
      </Panel>
    </>
  );
}

/* ── สรุปรายสัปดาห์ถึงตัวเอง (S8) ── ของผู้ใช้คนนี้ในบัญชีนี้ · อีเมลมีแค่จำนวน ไม่มีชื่อหรือข้อมูลติดต่อของคนในฐาน */
async function DigestPanel({ tenantId }: { tenantId: string }) {
  const user = membershipEnforced() ? await currentUser() : null;
  /* ผูกตัวตนตรงนี้เอง — คอมโพเนนต์ลูกไม่ได้รับประกันว่าอยู่ใน async context เดียวกับ activeTenantId() */
  const prefs = user ? await withIdentity(user.userId, () => digestPrefs(tenantId, user.userId)) : null;
  return (
    <Panel className="mb-6 p-5 md:p-6">
      <h2 className="c-h2 text-[var(--c-text)]">สรุปรายสัปดาห์ถึงตัวเอง</h2>
      <p className="c-thai mt-1 max-w-2xl text-[0.82rem] text-[var(--c-text-3)]">
        อีเมลสั้น ๆ เวลา 08:00 ของวันที่เลือก ถึงอีเมลที่คุณใช้เข้าสู่ระบบ: จำนวนงานต่อหมวดของหน้า &quot;วันนี้&quot; · โอกาสที่ขยับ/ค้าง ·
        คนที่รู้จักย้ายบริษัท · ข้อมูลใกล้หมดอายุ · คำขอสิทธิที่เปิดอยู่ — มีแค่จำนวนและลิงก์ ไม่มีชื่อหรือข้อมูลติดต่อของคนในฐาน
      </p>
      {!user || !prefs ? (
        <p className="c-thai mt-3 text-[0.84rem] text-[var(--c-text-4)]">โหมดเดโมไม่มีการเข้าสู่ระบบ — ใช้ได้เมื่อเชื่อม Supabase</p>
      ) : (
        <ActionForm
          action={saveDigestPrefsAction}
          label="บันทึก"
          pendingLabel="กำลังบันทึก…"
          size="sm"
          className="mt-4 flex flex-wrap items-center gap-3"
          note={
            <p className="c-thai text-[0.76rem] text-[var(--c-text-4)]">
              {prefs.lastSentAt ? `ส่งล่าสุด ${thaiDate(prefs.lastSentAt)}` : "ยังไม่เคยส่ง"} · ส่งผ่านผู้ให้บริการอีเมล (Resend) ซึ่งเห็นอีเมลของคุณและจำนวนในสรุปเท่านั้น
            </p>
          }
        >
          <label className="c-thai flex items-center gap-2 text-[0.86rem] text-[var(--c-text-2)]">
            <input type="checkbox" name="enabled" value="1" defaultChecked={prefs.enabled} className="h-5 w-5" /> ส่งสรุปถึง {user.email}
          </label>
          <select name="weekday" defaultValue={String(prefs.weekday)} className="c-select" aria-label="วันที่ส่ง">
            {DIGEST_WEEKDAYS.map((d) => (
              <option key={d} value={d}>ทุก{WEEKDAY_TH[d]}</option>
            ))}
          </select>
        </ActionForm>
      )}
    </Panel>
  );
}

/* ── ยืนยันตัวตนสองชั้น (B6) ── ของผู้ใช้คนนี้ ไม่ใช่ของบัญชี · ต้องเปิดก่อนส่งออก ทำคำขอสิทธิ หรือลบคน (lib/shared/roles.ts MFA_REQUIRED) */
async function MfaPanel() {
  const user = membershipEnforced() ? await currentUser() : null;
  const factors = user ? ((await (await supabaseServer()).auth.mfa.listFactors()).data?.totp ?? []) : [];
  return (
    <Panel className="mb-6 p-5 md:p-6">
      <h2 className="c-h2 text-[var(--c-text)]">ยืนยันตัวตนสองชั้น</h2>
      <p className="c-thai mt-1 text-[0.82rem] text-[var(--c-text-3)]">
        รหัส 6 หลักจากแอปในโทรศัพท์ นอกจากรหัสผ่าน — ต้องเปิดก่อนส่งออกรายชื่อ ทำคำขอสิทธิ หรือลบคน เพื่อให้รหัสผ่านที่รั่วอย่างเดียวดึงข้อมูลออกไม่ได้
      </p>
      {!user ? (
        <p className="c-thai mt-3 text-[0.84rem] text-[var(--c-text-4)]">โหมดเดโมไม่มีการเข้าสู่ระบบ — ใช้ได้เมื่อเชื่อม Supabase</p>
      ) : factors.length ? (
        <ul className="mt-3 flex flex-col divide-y divide-[var(--c-line)]">
          {factors.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
              <span className="c-thai text-[0.86rem] text-[var(--c-text-2)]">
                <span className="c-pill c-pill-good mr-2">เปิดอยู่</span>{f.friendly_name ?? "แอปยืนยันตัวตน"} · เพิ่มเมื่อ {thaiDate(f.created_at)}
                {user.mfa !== "verified" && " · รอบนี้ยังไม่ได้ใส่รหัส"}
              </span>
              <ActionForm action={removeMfaAction} fields={{ factorId: f.id }} label="ปิด" size="sm" variant="danger"
                confirm="กดอีกครั้งเพื่อปิดยืนยันสองชั้น" pendingLabel="กำลังปิด…" />
            </li>
          ))}
        </ul>
      ) : (
        <MfaSetup />
      )}
    </Panel>
  );
}
