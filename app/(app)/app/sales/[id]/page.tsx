import Link from "next/link";
import { notFound } from "next/navigation";
import { viewer } from "@/app/(app)/viewer";
import { activeMode } from "@/app/(app)/tenant";
import {
  assignTargetAction, bulkAssignAction, buildTargetsAction, draftMessageAction, markDraftSentAction, recordOutcomeAction, recordPreferenceAction, updateCriteriaAction,
} from "@/app/(app)/sales-actions";
import { getCampaign, type TargetView } from "@/lib/engine/campaigns";
import { teamMembers } from "@/lib/engine/team";
import { draftableTargets } from "@/lib/engine/campaigns/draft";
import { listBases } from "@/lib/engine/policy";
import {
  CHANNELS, CHANNEL_TH, MESSAGE_KIND_TH, OUTCOMES, TARGET_STATUS_TH, type TargetStatus,
} from "@/lib/shared/policy";
import { ELIGIBILITY_TH, PREFERENCE_KINDS, PREFERENCE_TH, type Eligibility } from "@/lib/shared/vault";
import { thaiDate, thaiDateTime } from "@/lib/shared/format";
import { ActionForm } from "@/components/console/action-form";
import { EligibilityPill } from "@/components/console/eligibility";
import { DraftPanel } from "@/components/console/draft-panel";
import { Panel, num } from "@/components/console/ui";
import { RecordHeader, RecordTabs, pickTab } from "@/components/console/record";
import { CriteriaFields } from "../criteria-fields";
import { PreferenceForm } from "@/components/console/preference-form";

export const metadata = { title: "แคมเปญ" };
export const dynamic = "force-dynamic";

/* ── แคมเปญหนึ่งแคมเปญ (docs/plan.md B5 · หัวข้อ 3.5 ข้อ 4) ─────────────
   เกณฑ์ → รายชื่อพร้อมเหตุผล → ผลนโยบายพร้อมรุ่น → มอบหมาย (ตรวจซ้ำ) → บันทึกผล (ตรวจซ้ำ)
   คนที่ไม่ผ่านนโยบายยังอยู่ในรายชื่อพร้อมเหตุผล — ให้เห็นว่าทำไม ไม่ใช่หายไปเฉย ๆ */

const LABEL = "c-thai flex min-w-0 flex-col gap-1 text-[0.8rem] text-[var(--c-text-3)]";
const FILTERS: (Eligibility | "all")[] = ["all", "eligible", "review_required", "suppressed", "channel_invalid"];
const FINAL: TargetStatus[] = ["won", "lost", "not_interested", "cancelled"];
const inDays = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

function Target({ t, campaignId, me, purposes, draftable }: { t: TargetView; campaignId: string; me: string; purposes: { id: string; name: string }[]; draftable: boolean }) {
  const open = !FINAL.includes(t.status);
  return (
    <li className="border-t border-[var(--c-line)] py-4 first:border-t-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          {/* เลือกได้เฉพาะคนที่ยังไม่จบและนโยบายผ่าน — ผูกกับฟอร์ม "มอบหมายที่เลือก" ด้านบนรายชื่อ */}
          {open && t.eligibility === "eligible"
            ? <input type="checkbox" form="bulk" name="targetIds" value={t.id} aria-label={`เลือก ${t.name}`} className="mt-1 h-5 w-5 shrink-0" />
            : <span className="w-5 shrink-0" aria-hidden />}
        <div className="min-w-0">
          <p className="c-thai text-[0.94rem] text-[var(--c-text)]">
            <Link href={`/app/customers/${t.customerId}`} className="hover:text-[var(--c-accent)]">{t.name}</Link>
            {t.org && <> · {t.orgId ? <Link href={`/app/accounts/${t.orgId}`} className="text-[var(--c-text-2)] hover:text-[var(--c-accent)]">{t.org}</Link> : t.org}</>}
          </p>
          <ul className="c-thai mt-1 grid gap-0.5 text-[0.8rem] text-[var(--c-text-3)]">
            {t.reasons.map((r, i) => <li key={i}>· {r}</li>)}
          </ul>
        </div>
        </div>
        <div className="c-thai text-right text-[0.8rem] text-[var(--c-text-3)]">
          <EligibilityPill status={t.eligibility} />
          <p className="mt-1">{TARGET_STATUS_TH[t.status]}{t.assignedTo ? ` · ${t.assignedTo}` : ""}{t.due ? ` · ครบ ${thaiDate(t.due)}` : ""}</p>
        </div>
      </div>
      {/* S7: ปุ่มร่างมีเฉพาะเมื่อ decide() ให้ Eligible ณ ตอนแสดงนี้ (ไม่ใช่ผลที่เก็บไว้) · ตรวจซ้ำอีกครั้งตอนกด */}
      {draftable && (
        <div className="c-thai mt-2 text-[0.8rem] text-[var(--c-text-3)]">
          <DraftPanel draftAction={draftMessageAction} sentAction={markDraftSentAction} campaignId={campaignId} targetId={t.id} />
        </div>
      )}
      <details className="c-thai mt-2 text-[0.78rem] text-[var(--c-text-3)]">
        <summary className={open && t.eligibility === "eligible"
          ? "c-btn c-btn-ghost c-btn-sm inline-flex cursor-pointer list-none"
          : "inline-block cursor-pointer py-1 text-[var(--c-text-4)] hover:text-[var(--c-text-2)]"}>
          {open && t.status !== "open" ? "บันทึกผล · มอบหมายใหม่" : open && t.eligibility === "eligible" ? "มอบหมาย" : "เหตุผลของนโยบาย"}
        </summary>
        <div className="mt-2 grid gap-3 border-l border-[var(--c-line)] pl-3">
          <div>
            <p>{t.eligibilityReasons.join(" · ") || "—"}</p>
            <p className="mt-0.5 text-[var(--c-text-4)]">รุ่นนโยบาย <span className="c-mono">{t.policyVersion}</span> · ตรวจล่าสุด {thaiDateTime(t.checkedAt)}</p>
            {t.outcome && <p className="mt-1 text-[var(--c-text-2)]">ผลล่าสุด: {t.outcome}</p>}
          </div>
          {open && t.eligibility === "eligible" && (
            <ActionForm action={assignTargetAction} fields={{ campaignId, targetId: t.id }} label={t.assignedTo ? "มอบหมายใหม่" : "มอบหมาย"} pendingLabel="กำลังตรวจนโยบาย…" size="sm" className="grid gap-2 sm:grid-cols-2">
              <label className={LABEL}>ผู้รับผิดชอบ<input name="assignee" list="team-list" defaultValue={t.assignedTo ?? me} className="c-input" autoComplete="off" required /></label>
              <label className={LABEL}>ครบกำหนด<input type="date" name="dueOn" defaultValue={inDays(7)} className="c-input" required /></label>
            </ActionForm>
          )}
          {open && t.status !== "open" && (
            <ActionForm action={recordOutcomeAction} fields={{ campaignId, targetId: t.id }} label="บันทึกผล" pendingLabel="กำลังตรวจนโยบาย…" size="sm" className="grid gap-2 sm:grid-cols-2">
              <label className={LABEL}>ผล
                <select name="outcome" className="c-select" defaultValue="contacted">
                  {OUTCOMES.map((o) => <option key={o} value={o}>{TARGET_STATUS_TH[o]}</option>)}
                </select>
              </label>
              <label className={LABEL}>มูลค่า (ถ้ามี · บาท)<input name="value" inputMode="numeric" className="c-input" /></label>
              <label className={`${LABEL} sm:col-span-2`}>เกิดอะไรขึ้น<input name="note" className="c-input" required /></label>
              <label className={LABEL}>ขั้นตอนถัดไป (ไม่บังคับ)<input name="nextStep" className="c-input" placeholder="เช่น ส่งข้อเสนอฉบับแก้" /></label>
              <label className={LABEL}>ครบกำหนดขั้นถัดไป<input type="date" name="nextDue" className="c-input" /></label>
            </ActionForm>
          )}
          <PreferenceForm customerId={t.customerId} back={`/app/sales/${campaignId}`} purposes={purposes} />
        </div>
      </details>
    </li>
  );
}

export default async function CampaignPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ show?: string; tab?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const v = await viewer();
  const [c, bases, team] = await Promise.all([getCampaign(v.tenantId, id), listBases(v.tenantId), teamMembers(v.tenantId, v.actor)]);
  if (!c) notFound();
  const show = (FILTERS as string[]).includes(sp.show ?? "") ? (sp.show as Eligibility | "all") : "all";
  const count = (e: Eligibility) => c.targets.filter((t) => t.eligibility === e).length;
  const shown = show === "all" ? c.targets : c.targets.filter((t) => t.eligibility === show);
  const purposes = bases.map((b) => ({ id: b.purpose_id, name: b.name }));
  const basis = bases.find((b) => b.purpose_id === c.purposeId);
  const draftable = await draftableTargets(v.tenantId, c.id, shown);
  const tab = pickTab(["members", "criteria"] as const, sp.tab);

  return (
    <>
      <datalist id="team-list">{team.map((m) => <option key={m} value={m} />)}</datalist>
      <RecordHeader
        back={{ href: "/app/sales", label: "แคมเปญทั้งหมด" }}
        kind="แคมเปญ"
        title={c.name}
        badges={<>
          <span className="c-pill">{CHANNEL_TH[c.channel]}</span>
          <span className="c-pill">{MESSAGE_KIND_TH[c.messageKind].split(" (")[0]}</span>
          {basis?.lawful_basis ? <span className="c-pill c-pill-good">มีฐานรุ่น {basis.version}</span> : <span className="c-pill c-pill-warn">ยังไม่มีฐานการประมวลผล</span>}
          {c.disclosure && <span className="c-pill c-pill-warn">ส่งรายชื่อให้บุคคลอื่น</span>}
        </>}
        highlights={[
          { label: "วัตถุประสงค์", value: c.purpose },
          { label: "เป้าหมาย", value: num(c.targets.length) },
          { label: ELIGIBILITY_TH.eligible, value: num(count("eligible")) },
          { label: ELIGIBILITY_TH.review_required, value: num(count("review_required")) },
          { label: ELIGIBILITY_TH.suppressed, value: num(count("suppressed")) },
          { label: "ปิดได้", value: num(c.targets.filter((t) => t.status === "won").length) },
        ]}
        actions={<ActionForm action={buildTargetsAction} fields={{ campaignId: c.id }} label={c.targets.length ? "สร้างรายชื่อใหม่ตามเกณฑ์" : "สร้างรายชื่อ"} pendingLabel="กำลังคัดและตรวจนโยบาย…" variant="primary" size="sm" />}
      />
      {c.offer && <p className="c-thai -mt-2 mb-4 text-[0.86rem] text-[var(--c-text-3)]">ข้อเสนอ: {c.offer}{c.endsAt ? ` · ถึง ${thaiDate(c.endsAt)}` : ""}</p>}
      <RecordTabs base={`/app/sales/${c.id}`} active={tab} tabs={[{ key: "members", label: "สมาชิก", count: c.targets.length }, { key: "criteria", label: "เกณฑ์" }]} />

      {tab === "members" ? (
        <>
      <Panel className="p-5 md:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="c-h2 text-[var(--c-text)]">รายชื่อเป้าหมาย</h2>
          <nav className="c-thai flex flex-wrap gap-2 text-[0.8rem]" aria-label="กรองตามสถานะนโยบาย">
            {FILTERS.map((f) => (
              <Link key={f} href={`/app/sales/${c.id}${f === "all" ? "" : `?show=${f}`}`} scroll={false} aria-current={show === f ? "page" : undefined}
                className={`c-btn c-btn-sm ${show === f ? "c-btn-primary" : "c-btn-ghost"}`}>
                {f === "all" ? "ทั้งหมด" : ELIGIBILITY_TH[f]} {num(f === "all" ? c.targets.length : count(f))}
              </Link>
            ))}
          </nav>
        </div>
        {shown.some((t) => !FINAL.includes(t.status) && t.eligibility === "eligible") && (
          <ActionForm id="bulk" action={bulkAssignAction} fields={{ campaignId: c.id }} label="มอบหมายที่เลือก" pendingLabel="กำลังตรวจนโยบายทีละคน…" size="sm"
            className="mt-4 flex flex-wrap items-end gap-2 rounded-[var(--c-radius)] border border-[var(--c-line)] bg-[var(--c-panel-2)] p-3">
            <span className="c-thai self-center text-[0.8rem] text-[var(--c-text-3)]">ติ๊กคนที่ “ใช้ได้ตามนโยบาย” แล้วมอบหมายทีเดียว ·</span>
            <label className={LABEL}>ให้<input name="assignee" list="team-list" defaultValue={v.actor} className="c-input min-h-9 py-1" autoComplete="off" /></label>
            <label className={LABEL}>ครบกำหนด<input type="date" name="dueOn" defaultValue={inDays(7)} className="c-input min-h-9 py-1" required /></label>
          </ActionForm>
        )}
        {shown.length ? (
          <ul className="mt-4 grid">
            {shown.map((t) => <Target key={t.id} t={t} campaignId={c.id} me={v.actor} purposes={purposes} draftable={draftable.has(t.id)} />)}
          </ul>
        ) : (
          <p className="c-thai mt-4 text-[0.88rem] text-[var(--c-text-3)]">
            {c.targets.length ? "ไม่มีเป้าหมายในสถานะนี้" : "ยังไม่มีรายชื่อ — กด “สร้างรายชื่อ” เพื่อคัดตามเกณฑ์และตรวจนโยบาย"}
          </p>
        )}
      </Panel>
        </>
      ) : (
        <>
      <Panel className="mb-6 p-5 md:p-6">
        <h2 className="c-h2 text-[var(--c-text)]">เกณฑ์เป้าหมาย</h2>
        <ul className="c-thai mt-3 grid gap-1 text-[0.88rem] text-[var(--c-text-2)]">{c.criteriaText.map((t) => <li key={t}>· {t}</li>)}</ul>
        <details className="mt-4">
          <summary className="c-btn c-btn-ghost inline-flex cursor-pointer">แก้เกณฑ์</summary>
          <ActionForm action={updateCriteriaAction} fields={{ campaignId: c.id }} label="บันทึกเกณฑ์" pendingLabel="กำลังบันทึก…" className="mt-4 grid gap-3">
            <CriteriaFields c={c.criteria} mode={await activeMode()} />
          </ActionForm>
        </details>
        <p className="c-thai mt-3 text-[0.76rem] text-[var(--c-text-4)]">ไม่เกิน 100 บริษัทต่อแคมเปญ (ขอบเขต pilot) · เป้าหมายที่มอบหมายแล้วไม่ถูกลบเมื่อเกณฑ์เปลี่ยน</p>
      </Panel>

        </>
      )}
    </>
  );
}
