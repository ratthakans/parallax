import Link from "next/link";
import { notFound } from "next/navigation";
import { viewer } from "@/app/(app)/viewer";
import {
  addDealItemAction, closeDealAction, createRenewalAction, logDealActivityAction, setForecastAction, moveDealAction, removeDealItemAction, removeDealPersonAction, setDealPersonAction, syncDealValueAction, updateDealAction,
} from "@/app/(app)/deal-actions";
import { listFields, valuesFor } from "@/lib/engine/custom-fields";
import { listItems, packageNames } from "@/lib/engine/deal-items";
import { CustomFieldsPanel } from "@/components/console/custom-fields";
import { trashDealAction } from "@/app/(app)/bulk-actions";
import { stageBlockers } from "@/lib/engine/stage-rules";
import { NewTaskForm, TaskList } from "@/components/console/tasks";
import { listTasks } from "@/lib/engine/tasks";
import { teamMembers } from "@/lib/engine/team";
import { dealCandidates, getDeal } from "@/lib/engine/deals";
import { CLOSE_REASON_TH, reasonsFor } from "@/lib/shared/deals";
import { DEAL_ROLES, DEAL_ROLE_TH, DEAL_STAGE_TH, FORECAST_CATEGORIES, FORECAST_TH, OPEN_STAGES, dealRoleTh, effectiveForecast, isDealStage, stageTh } from "@/lib/shared/deals";
import { get } from "@/lib/engine/sql";
import { INTERACTION_KINDS, INTERACTION_TH, type InteractionKind } from "@/lib/shared/accounts";
import { bangkokDay } from "@/lib/shared/format";
import { thaiDate, thaiDateTime } from "@/lib/shared/format";
import { ActionForm } from "@/components/console/action-form";
import { Panel, baht } from "@/components/console/ui";
import { RecordHeader, RecordTabs, pickTab } from "@/components/console/record";

export const metadata = { title: "ดีล" };
export const dynamic = "force-dynamic";

/* ── หน้าดีล (docs/ux-plan.md U4) ── หัวสรุป + Path (กดขั้นเพื่อย้าย) + แท็บ ภาพรวม/ประวัติ */

const FIELD_TH: Record<string, string> = { stage: "ขั้น", value: "มูลค่า", expected_close: "ปิดคาด", name: "ชื่อ", person: "คนในดีล", forecast: "หมวดพยากรณ์" };
const LABEL = "c-thai flex min-w-0 flex-col gap-1 text-[0.8rem] text-[var(--c-text-3)]";

function Edit({ dealId, field, label, value, type = "text" }: { dealId: string; field: string; label: string; value: string; type?: string }) {
  return (
    <details className="mt-1">
      <summary className="inline-block cursor-pointer text-[0.76rem] text-[var(--c-text-4)] hover:text-[var(--c-accent)]">แก้{label}</summary>
      <ActionForm action={updateDealAction} fields={{ dealId, field }} label="บันทึก" pendingLabel="กำลังบันทึก…" size="sm" className="mt-1 flex flex-wrap items-end gap-2">
        <input name="value_raw" type={type} defaultValue={value} className="c-input max-w-[14rem]" aria-label={label} />
      </ActionForm>
    </details>
  );
}

export default async function DealPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const v = await viewer();
  const d = await getDeal(v.tenantId, id, { id: v.actor, clearance: v.clearance });
  if (!d) notFound();
  if (d === "masked") {
    return <Panel className="p-5"><p className="c-thai text-[0.9rem] text-[var(--c-text-2)]">ดีลนี้อยู่ในบริษัทที่ระดับความลับสูงกว่าสิทธิ์ของคุณ</p></Panel>;
  }
  const tab = pickTab(["overview", "history"] as const, (await searchParams).tab);
  const [candidates, cFields, cValues, items, pkgNames] = await Promise.all([
    dealCandidates(v.tenantId, d.id, { id: v.actor, clearance: v.clearance }),
    listFields(v.tenantId, "deal"), valuesFor(v.tenantId, "deal", [d.id]), listItems(v.tenantId, d.id), packageNames(v.tenantId),
  ]);
  const [dealTasks, team] = await Promise.all([
    listTasks(v.tenantId, "open", { id: v.actor, clearance: v.clearance }, new Date(), { dealId: d.id }), teamMembers(v.tenantId, v.actor),
  ]);
  const itemsTotal = items.reduce((t, i) => t + (i.total ?? 0), 0);
  const fcSet = (await get<{ forecast_category: string | null }>("SELECT forecast_category FROM opportunities WHERE tenant_id = ? AND id = ?", v.tenantId, d.id))?.forecast_category ?? null;
  const fc = effectiveForecast(d.stage, fcSet);
  const nameOf = new Map(candidates.map((c) => [c.id, c.name]));
  /* ประวัติ field = person เก็บเป็น "<id>:<บทบาท>" — แสดงเป็นชื่อและบทบาท */
  const personVal = (raw: string | null) => {
    if (!raw) return "—";
    const [pid, role] = raw.split(":");
    return `${nameOf.get(pid) ?? "บุคคล"}${role ? ` (${dealRoleTh(role)})` : ""}`;
  };
  const closed = d.stage === "won" || d.stage === "lost";
  const [renewalOf, renewedFrom] = await Promise.all([
    get<{ id: string; name: string }>("SELECT id, name FROM opportunities WHERE tenant_id = ? AND renewed_from = ?", v.tenantId, d.id),
    get<{ id: string; name: string }>("SELECT p.id, p.name FROM opportunities o JOIN opportunities p ON p.id = o.renewed_from AND p.tenant_id = o.tenant_id WHERE o.tenant_id = ? AND o.id = ?", v.tenantId, d.id),
  ]);
  const links = { renewal: renewalOf ?? null, from: renewedFrom ?? null };
  /* สิ่งที่ยังขาดก่อนเข้าขั้นถัดไป (D4) — บอกก่อนกด ไม่ใช่หลังกดแล้วโดนปฏิเสธ */
  const nextStage = !closed && isDealStage(d.stage) ? OPEN_STAGES[OPEN_STAGES.indexOf(d.stage) + 1] ?? "won" : null;
  const nextMissing = nextStage ? await stageBlockers(v.tenantId, d.id, d.stage, nextStage) : [];
  const closeInfo = closed ? await get<{ close_reason: string | null; close_note: string | null }>(
    "SELECT close_reason, close_note FROM opportunities WHERE tenant_id = ? AND id = ?", v.tenantId, d.id) : undefined;
  const pathStages = [...OPEN_STAGES, closed ? (d.stage as "won" | "lost") : "won"];
  const at = isDealStage(d.stage) ? pathStages.indexOf(d.stage) : -1;
  /* วันปิดจริง = ครั้งล่าสุดที่ย้ายเข้าขั้นปัจจุบัน (ประวัติเรียงใหม่ก่อน) — ไม่ต้องเก็บคอลัมน์ซ้ำ */
  /* อยู่ขั้นนี้มากี่วัน (C3) — จากการย้ายเข้าขั้นปัจจุบันครั้งล่าสุด */
  const enteredAt = d.history.find((h) => h.field === "stage" && h.newValue === d.stage)?.at ?? d.createdAt;
  const daysHere = Math.max(0, Math.floor((Date.now() - Date.parse(enteredAt)) / 864e5));
  const closedAt = closed ? d.history.find((h) => h.field === "stage" && h.newValue === d.stage)?.at ?? d.updatedAt : null;

  return (
    <>
      <RecordHeader
        back={{ href: "/app/deals", label: "ดีลทั้งหมด" }}
        kind="ดีล"
        title={d.name}
        badges={<>
          <span className={`c-pill ${d.stage === "won" ? "c-pill-good" : d.stage === "lost" ? "c-pill-bad" : "c-pill-reach"}`}>{stageTh(d.stage)}</span>
          {!closed && <span className={`c-pill ${daysHere > 30 ? "c-pill-warn" : ""}`}>อยู่ขั้นนี้ {daysHere} วัน</span>}
        </>}
        highlights={[
          { label: "บริษัท", value: <Link href={`/app/accounts/${d.orgId}`} className="text-[var(--c-accent)] hover:underline">{d.org}</Link> },
          { label: "มูลค่า", value: d.value != null ? baht(d.value) : "ไม่ระบุ" },
          closedAt
            ? { label: d.stage === "won" ? "ปิดได้เมื่อ" : "ปิดเมื่อ", value: thaiDate(closedAt) }
            : { label: "ปิดคาด", value: d.expectedClose ? thaiDate(d.expectedClose) : "ไม่ระบุ" },
          { label: "เจ้าของ", value: d.owner ?? "—" },
          { label: "แคมเปญ", value: d.campaignId ? <Link href={`/app/sales/${d.campaignId}`} className="text-[var(--c-accent)] hover:underline">{d.campaign}</Link> : "—" },
          { label: "อัปเดต", value: thaiDate(d.updatedAt) },
        ]}
      />

      {/* ── Path: ขั้นของดีล กดเพื่อย้าย · ปิดดีล (ได้/ไม่ได้) ต้องเลือกเหตุผล (E2) ── */}
      <Panel className="mb-5 p-3">
        <ol className="flex flex-wrap gap-1" aria-label="ขั้นของดีล">
          {pathStages.filter((s) => s !== "won" && s !== "lost").map((s, i) => {
            const state = closed || i < at ? "done" : i === at ? "current" : "todo";
            return (
              <li key={s} className="min-w-[7rem] flex-1">
                {state === "current" ? (
                  <span aria-current="step" className="c-btn c-btn-sm c-btn-primary w-full">{DEAL_STAGE_TH[s]}</span>
                ) : (
                  <ActionForm action={moveDealAction} fields={{ dealId: d.id, stage: s }} size="sm"
                    label={<>{state === "done" ? "✓ " : ""}{DEAL_STAGE_TH[s]}</>} pendingLabel="กำลังย้าย…"
                    confirm={closed ? "กดอีกครั้ง — เปิดดีลนี้ใหม่" : undefined}
                    variant="ghost" full buttonClassName={state === "done" ? "text-[var(--c-good)]" : ""} />
                )}
              </li>
            );
          })}
          {closed ? (
            <li className="min-w-[7rem] flex-1">
              <span aria-current="step" className={`c-btn c-btn-sm w-full ${d.stage === "lost" ? "c-btn-danger" : "c-btn-primary"}`}>{DEAL_STAGE_TH[d.stage as "won" | "lost"]}</span>
            </li>
          ) : (["won", "lost"] as const).map((st) => (
            <li key={st} className="min-w-[7rem] flex-1">
              <details className="relative">
                <summary className={`c-btn c-btn-sm w-full cursor-pointer list-none ${st === "won" ? "c-btn-ghost text-[var(--c-good)]" : "c-btn-ghost"}`}>{DEAL_STAGE_TH[st]}</summary>
                <ActionForm action={closeDealAction} fields={{ dealId: d.id, stage: st }} size="sm" variant={st === "won" ? "primary" : "ghost"}
                  label={st === "won" ? "ยืนยันปิดได้" : "ยืนยันปิดว่าไม่ได้"} pendingLabel="กำลังบันทึก…"
                  className="c-panel absolute right-0 z-10 mt-1 grid w-72 gap-2 p-3">
                  <label className={LABEL}>{st === "won" ? "ได้เพราะ" : "ไม่ได้เพราะ"}
                    <select name="reason" className="c-select" required defaultValue="">
                      <option value="" disabled>เลือกเหตุผล</option>
                      {reasonsFor(st).map((r) => <option key={r} value={r}>{CLOSE_REASON_TH[r]}</option>)}
                    </select>
                  </label>
                  <label className={LABEL}>หมายเหตุ (ไม่บังคับ)<input name="note" className="c-input" maxLength={500} /></label>
                  {st === "won" && (
                    <label className="c-thai flex items-start gap-2 text-[0.8rem] text-[var(--c-text-2)]">
                      <input type="checkbox" name="renew" value="1" defaultChecked className="mt-0.5" />
                      <span>สร้างดีลต่อสัญญารอบถัดไป (ชื่อเลื่อนปี · ปิดคาด +1 ปี · แพ็กเกจและคนในดีลเดิม)</span>
                    </label>
                  )}
                </ActionForm>
              </details>
            </li>
          ))}
        </ol>
        {nextStage && nextMissing.length > 0 && (
          <p className="c-thai mt-2 px-1 text-[0.8rem] text-[var(--c-warn)]">ก่อนเข้าขั้น “{DEAL_STAGE_TH[nextStage]}” ดีลต้อง: {nextMissing.join(" · ")}</p>
        )}
        {(links.from || links.renewal || d.stage === "won") && (
          <p className="c-thai mt-2 flex flex-wrap items-center gap-2 px-1 text-[0.82rem] text-[var(--c-text-3)]">
            {links.from && <>ต่อสัญญาจาก <Link href={`/app/deals/${links.from.id}`} className="text-[var(--c-accent)] hover:underline">{links.from.name}</Link></>}
            {links.renewal
              ? <>ดีลต่อสัญญา: <Link href={`/app/deals/${links.renewal.id}`} className="text-[var(--c-accent)] hover:underline">{links.renewal.name}</Link></>
              : d.stage === "won" && <ActionForm action={createRenewalAction} fields={{ dealId: d.id }} label="สร้างดีลต่อสัญญารอบถัดไป" pendingLabel="กำลังสร้าง…" size="sm" variant="ghost" />}
          </p>
        )}
        {closed && closeInfo?.close_reason && (
          <p className="c-thai mt-2 px-1 text-[0.82rem] text-[var(--c-text-3)]">
            {d.stage === "won" ? "ได้เพราะ" : "ไม่ได้เพราะ"} {CLOSE_REASON_TH[closeInfo.close_reason] ?? closeInfo.close_reason}{closeInfo.close_note ? ` — ${closeInfo.close_note}` : ""}
          </p>
        )}
      </Panel>

      <RecordTabs base={`/app/deals/${d.id}`} active={tab} tabs={[{ key: "overview", label: "ภาพรวม" }, { key: "history", label: "ประวัติ", count: d.history.length }]} />

      {tab === "overview" ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <Panel className="p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="c-h2 text-[var(--c-text)]">รายละเอียด</h2>
              <ActionForm action={trashDealAction} fields={{ dealId: d.id }} label="ลบดีล" pendingLabel="…" size="sm" variant="ghost"
                confirm="กดอีกครั้ง — ย้ายดีลไปถังขยะ (กู้คืนได้ 30 วัน)" />
            </div>
            <dl className="c-thai mt-3 grid gap-3 text-[0.9rem]">
              <div><dt className="text-[0.75rem] text-[var(--c-text-4)]">ชื่อ</dt><dd>{d.name}</dd><Edit dealId={d.id} field="name" label="ชื่อ" value={d.name} /></div>
              <div><dt className="text-[0.75rem] text-[var(--c-text-4)]">มูลค่า</dt><dd>{d.value != null ? baht(d.value) : "ไม่ระบุ"}</dd><Edit dealId={d.id} field="value" label="มูลค่า" value={d.value != null ? String(d.value) : ""} /></div>
              <div><dt className="text-[0.75rem] text-[var(--c-text-4)]">ปิดคาด</dt><dd>{d.expectedClose ? thaiDate(d.expectedClose) : "ไม่ระบุ"}</dd><Edit dealId={d.id} field="expected_close" label="วันปิดคาด" value={d.expectedClose ?? ""} type="date" /></div>
              <div><dt className="text-[0.75rem] text-[var(--c-text-4)]">สร้างเมื่อ</dt><dd>{thaiDate(d.createdAt)}</dd></div>
              {fc && (
                <div>
                  <dt className="text-[0.75rem] text-[var(--c-text-4)]">หมวดพยากรณ์</dt>
                  <dd>{FORECAST_TH[fc]}{fcSet ? "" : <span className="text-[var(--c-text-4)]"> (ตามขั้น)</span>}</dd>
                  <ActionForm action={setForecastAction} fields={{ dealId: d.id }} label="บันทึก" pendingLabel="กำลังบันทึก…" size="sm" className="mt-1 flex flex-wrap items-end gap-2">
                    <select name="category" defaultValue={fcSet ?? ""} className="c-select max-w-[12rem]" aria-label="หมวดพยากรณ์">
                      <option value="">ตามขั้น</option>
                      {FORECAST_CATEGORIES.map((c) => <option key={c} value={c}>{FORECAST_TH[c]}</option>)}
                    </select>
                  </ActionForm>
                </div>
              )}
            </dl>
          </Panel>
          <Panel className="p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="c-h2 text-[var(--c-text)]">แพ็กเกจ</h2>
              {items.length > 0 && <span className="c-mono text-[0.86rem]">รวม {baht(itemsTotal)}</span>}
            </div>
            {items.length ? (
              <ul className="mt-3 divide-y divide-[var(--c-line)]">
                {items.map((it) => (
                  <li key={it.id} className="c-thai flex flex-wrap items-center justify-between gap-2 py-2 text-[0.88rem]">
                    <span>{it.package} <span className="text-[var(--c-text-3)]">× {it.qty.toLocaleString("th-TH")}{it.unitPrice != null ? ` · ${baht(it.unitPrice)}` : ""}</span></span>
                    <span className="flex items-center gap-2">
                      <span className="c-mono">{it.total != null ? baht(it.total) : "—"}</span>
                      <ActionForm action={removeDealItemAction} fields={{ dealId: d.id, itemId: it.id }} label="เอาออก" pendingLabel="…" size="sm" variant="ghost" />
                    </span>
                  </li>
                ))}
              </ul>
            ) : <p className="c-thai mt-3 text-[0.86rem] text-[var(--c-text-3)]">ยังไม่ได้ใส่แพ็กเกจ — ใส่แล้วรายงานจะบอกได้ว่าแพ็กเกจไหนขายดี</p>}
            <datalist id="pkg-list">{pkgNames.map((n) => <option key={n} value={n} />)}</datalist>
            <ActionForm action={addDealItemAction} fields={{ dealId: d.id }} label="เพิ่มแพ็กเกจ" pendingLabel="กำลังบันทึก…" size="sm" className="mt-3 grid gap-2 sm:grid-cols-3">
              <label className={LABEL}>แพ็กเกจ<input name="package" list="pkg-list" className="c-input" required autoComplete="off" placeholder="เช่น Gold" /></label>
              <label className={LABEL}>จำนวน<input name="qty" inputMode="decimal" defaultValue="1" className="c-input" /></label>
              <label className={LABEL}>ราคาต่อหน่วย (บาท)<input name="unitPrice" inputMode="decimal" className="c-input" /></label>
            </ActionForm>
            {items.length > 0 && itemsTotal !== (d.value ?? 0) && (
              <ActionForm action={syncDealValueAction} fields={{ dealId: d.id }} label={`ใช้ยอดรวม ${baht(itemsTotal)} เป็นมูลค่าดีล`} pendingLabel="กำลังบันทึก…" size="sm" variant="ghost" className="mt-2" />
            )}
            <div className="mt-6 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="c-h2 text-[var(--c-text)]">ฟิลด์ของบัญชี</h2>
              <Link href="/app/settings/fields" className="c-thai text-[0.8rem] text-[var(--c-accent)] hover:underline">จัดการฟิลด์</Link>
            </div>
            <div className="mt-3"><CustomFieldsPanel entity="deal" recordId={d.id} fields={cFields} values={cValues.get(d.id)} /></div>
          </Panel>
          <Panel className="p-5">
            <h2 className="c-h2 text-[var(--c-text)]">คนในดีล</h2>
            {d.people.length ? (
              <ul className="mt-3 divide-y divide-[var(--c-line)]">
                {d.people.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="min-w-0">
                      <Link href={`/app/customers/${p.id}`} className="c-thai text-[var(--c-accent)] hover:underline">{p.name}</Link>
                      {p.role && <span className="c-pill ml-2">{dealRoleTh(p.role)}</span>}
                    </span>
                    <ActionForm action={removeDealPersonAction} fields={{ dealId: d.id, personId: p.id }} label="เอาออก" pendingLabel="…" size="sm" variant="ghost"
                      confirm={`กดอีกครั้ง — เอา ${p.name} ออกจากดีล`} />
                  </li>
                ))}
              </ul>
            ) : <p className="c-thai mt-3 text-[0.88rem] text-[var(--c-text-3)]">ยังไม่ได้ระบุคน — ใครตัดสินใจ ใครอนุมัติงบ ใส่ไว้ที่นี่</p>}
            {candidates.length > 0 ? (
              <ActionForm action={setDealPersonAction} fields={{ dealId: d.id }} label="เพิ่ม / เปลี่ยนบทบาท" pendingLabel="กำลังบันทึก…" size="sm"
                className="mt-3 grid gap-2 sm:grid-cols-2">
                <label className={LABEL}>คน
                  <select name="personId" className="c-select" required defaultValue="">
                    <option value="" disabled>เลือกคนในบริษัทนี้</option>
                    {candidates.map((c) => <option key={c.id} value={c.id}>{c.name}{c.title ? ` · ${c.title}` : ""}{c.current ? "" : " (ออกแล้ว)"}</option>)}
                  </select>
                </label>
                <label className={LABEL}>บทบาท
                  <select name="role" className="c-select" defaultValue="decision_maker">
                    {DEAL_ROLES.map((r) => <option key={r} value={r}>{DEAL_ROLE_TH[r]}</option>)}
                  </select>
                </label>
              </ActionForm>
            ) : (
              <p className="c-thai mt-3 text-[0.8rem] text-[var(--c-text-4)]">บริษัทนี้ยังไม่มีคนในระบบ — <Link href={`/app/customers/new?org=${d.orgId}`} className="underline">เพิ่มผู้ติดต่อ</Link></p>
            )}
          </Panel>
          <Panel className="p-5 lg:col-span-2">
            <h2 className="c-h2 text-[var(--c-text)]">งานของดีล <span className="text-[var(--c-text-4)]">({dealTasks.length})</span></h2>
            <div className="mt-3"><TaskList tasks={dealTasks} link={{ dealId: d.id, orgId: d.orgId }} /></div>
            <details className="mt-3">
              <summary className="c-btn c-btn-ghost c-btn-sm inline-flex cursor-pointer list-none">+ งาน</summary>
              <div className="mt-3 max-w-2xl"><NewTaskForm link={{ dealId: d.id, orgId: d.orgId }} team={team} people={candidates.filter((c) => c.current)} /></div>
            </details>
          </Panel>
          <Panel className="p-5 lg:col-span-2">
            <h2 className="c-h2 text-[var(--c-text)]">กิจกรรมของดีล</h2>
            <details className="mt-3" open={!d.interactions.length}>
              <summary className="c-btn c-btn-primary c-btn-sm inline-flex cursor-pointer list-none">บันทึกกิจกรรม</summary>
              <ActionForm action={logDealActivityAction} fields={{ dealId: d.id }} label="บันทึก" pendingLabel="กำลังบันทึก…" size="sm"
                className="mt-3 grid max-w-3xl gap-2 sm:grid-cols-3">
                <label className={LABEL}>ชนิด
                  <select name="kind" className="c-select" defaultValue="meeting">
                    {INTERACTION_KINDS.map((k) => <option key={k} value={k}>{INTERACTION_TH[k]}</option>)}
                  </select>
                </label>
                <label className={LABEL}>วันที่<input type="date" name="occurredAt" defaultValue={bangkokDay()} className="c-input" required /></label>
                <label className={LABEL}>กับใคร
                  <select name="personId" className="c-select" defaultValue="">
                    <option value="">ไม่ระบุคน</option>
                    {candidates.filter((c) => c.current).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
                <label className={`${LABEL} sm:col-span-3`}>คุยอะไร<textarea name="summary" rows={2} className="c-input" required /></label>
                <label className={`${LABEL} sm:col-span-3`}>ผล<input name="outcome" className="c-input" /></label>
                <label className={`${LABEL} sm:col-span-2`}>งานถัดไป (ไม่บังคับ — สร้างเป็นงานให้)<input name="nextTitle" className="c-input" placeholder="เช่น ส่งใบเสนอราคาฉบับแก้" /></label>
                <label className={LABEL}>ครบกำหนด<input type="date" name="nextDue" className="c-input" /></label>
              </ActionForm>
            </details>
            {d.interactions.length ? (
              <ul className="mt-3 divide-y divide-[var(--c-line)]">
                {d.interactions.map((i) => (
                  <li key={i.id} className="c-thai py-2 text-[0.86rem]">
                    <span className="text-[var(--c-text-3)]">{thaiDate(i.at)}</span> · {INTERACTION_TH[i.kind as InteractionKind] ?? i.kind}{i.owner ? <span className="text-[var(--c-text-4)]"> · {i.owner}</span> : null}
                    {i.summary ? <span className="block text-[var(--c-text-2)]">{i.summary}</span> : <span className="block text-[var(--c-text-4)]">บันทึกระดับสูง</span>}
                  </li>
                ))}
              </ul>
            ) : <p className="c-thai mt-3 text-[0.88rem] text-[var(--c-text-3)]">ยังไม่มีกิจกรรมของดีลนี้ — บันทึกที่นี่แล้วจะขึ้นที่หน้าบริษัทและหน้าผู้ติดต่อด้วย</p>}
          </Panel>
        </div>
      ) : (
        <Panel className="p-5">
          <ol className="divide-y divide-[var(--c-line)]">
            {d.history.map((h, i) => (
              <li key={i} className="c-thai grid grid-cols-[9rem_minmax(0,1fr)] gap-3 py-2.5 text-[0.86rem]">
                <span className="text-[var(--c-text-3)]">{thaiDateTime(h.at)}</span>
                <span>
                  {FIELD_TH[h.field] ?? h.field}: {h.field === "stage" ? `${h.oldValue ? stageTh(h.oldValue) : "—"} → ${h.newValue ? stageTh(h.newValue) : "—"}`
                    : h.field === "person" ? `${personVal(h.oldValue)} → ${personVal(h.newValue)}`
                    : h.field === "forecast" ? `${h.oldValue ? FORECAST_TH[h.oldValue as keyof typeof FORECAST_TH] ?? h.oldValue : "ตามขั้น"} → ${h.newValue ? FORECAST_TH[h.newValue as keyof typeof FORECAST_TH] ?? h.newValue : "ตามขั้น"}`
                    : `${h.oldValue ?? "—"} → ${h.newValue ?? "—"}`}
                  <span className="text-[var(--c-text-4)]"> · {h.by} · {h.reason}</span>
                </span>
              </li>
            ))}
            {!d.history.length && <li className="c-thai py-2 text-[var(--c-text-3)]">ยังไม่มีประวัติ</li>}
          </ol>
        </Panel>
      )}
    </>
  );
}
