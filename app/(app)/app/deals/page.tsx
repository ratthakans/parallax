import Link from "next/link";
import { viewer } from "@/app/(app)/viewer";
import { DEAL_SORTS, DEAL_VIEWS, listDeals, type DealFilters, type DealSort, type DealView } from "@/lib/engine/deals";
import { DEAL_STAGES, OPEN_STAGES, stageTh } from "@/lib/shared/deals";
import { thaiDate } from "@/lib/shared/format";
import { listFields } from "@/lib/engine/custom-fields";
import { packageNames } from "@/lib/engine/deal-items";
import { teamMembers } from "@/lib/engine/team";
import { cleanQuery, listViews } from "@/lib/engine/saved-views";
import { can } from "@/lib/shared/roles";
import { SavedViews } from "@/components/console/saved-views";
import { bulkDealsAction } from "@/app/(app)/bulk-actions";
import { ActionForm } from "@/components/console/action-form";
import { SelectAll } from "@/components/console/select-all";
import { FORECAST_CATEGORIES, FORECAST_TH, DEAL_STAGE_TH } from "@/lib/shared/deals";
import { PageHead, Panel, baht, num } from "@/components/console/ui";
import { ListViews, SortTh, listHref, type ListState } from "@/components/console/list-view";
import { DealBoard } from "@/components/console/deal-board";

export const dynamic = "force-dynamic";

/* ── ดีล (docs/ux-plan.md U4) ── ไปป์ไลน์ลากวาง (ค่าเริ่มต้น) หรือรายการ · มุมมองสำเร็จรูปเหมือนหน้ารายการอื่น */

const BASE = "/app/deals";
const VIEWS: { key: DealView; label: string }[] = [
  { key: "open", label: "เปิดอยู่" },
  { key: "mine", label: "ดีลของฉัน" },
  { key: "all", label: "ทั้งหมด" },
  { key: "won", label: "ปิดได้" },
  { key: "lost", label: "ไม่ได้" },
];

const LABEL = "c-thai flex min-w-0 flex-col gap-1 text-[0.78rem] text-[var(--c-text-3)]";

export default async function DealsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const v = await viewer();
  /* ── ตัวกรองที่เลือกเอง (docs/crm-plan.md C5) ── เจ้าของ · มูลค่าขั้นต่ำ · ช่วงปิดคาด · แพ็กเกจ · ฟิลด์ของดีล (df.<id>) */
  const [fields, pkgs, team, saved] = await Promise.all([
    listFields(v.tenantId, "deal"), packageNames(v.tenantId), teamMembers(v.tenantId, v.actor), listViews(v.tenantId, "deals", v.actor),
  ]);
  const day = (x?: string) => (x && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : undefined);
  const minValue = sp.minValue && Number.isFinite(Number(sp.minValue)) ? Number(sp.minValue) : undefined;
  const filters: DealFilters = {
    owner: sp.owner || undefined, minValue, closeFrom: day(sp.closeFrom), closeTo: day(sp.closeTo), package: sp.package || undefined,
    custom: fields.filter((f) => sp[`df.${f.id}`]).map((f) => ({ fieldId: f.id, value: sp[`df.${f.id}`]! })),
  };
  const extra: Record<string, string> = Object.fromEntries(Object.entries({
    owner: filters.owner, minValue: minValue != null ? String(minValue) : undefined, closeFrom: filters.closeFrom, closeTo: filters.closeTo, package: filters.package,
    ...Object.fromEntries((filters.custom ?? []).map((c) => [`df.${c.fieldId}`, c.value])),
  }).filter((e): e is [string, string] => Boolean(e[1])));
  const nFilters = Object.keys(extra).length;
  const view = (DEAL_VIEWS as readonly string[]).includes(sp.view ?? "") ? (sp.view as DealView) : "open";
  const sort = (DEAL_SORTS as readonly string[]).includes(sp.sort ?? "") ? (sp.sort as DealSort) : undefined;
  const dir = sp.dir === "asc" || sp.dir === "desc" ? sp.dir : undefined;
  const mode = sp.mode === "list" ? "list" : "board";
  const deals = await listDeals(v.tenantId, { view, sort, dir, q: sp.q, filters }, { id: v.actor, clearance: v.clearance });
  const state: ListState = { q: sp.q, view, sort, dir, defaultView: "open", mode: sp.mode === "list" || sp.mode === "board" ? sp.mode : undefined, extra };
  const current = cleanQuery(new URLSearchParams(Object.entries({ view: view !== "open" ? view : "", sort: sort ?? "", dir: dir ?? "", mode: state.mode ?? "", ...extra }).filter((e) => e[1])).toString());
  const total = deals.reduce((t, d) => t + (d.value ?? 0), 0);
  const stages = view === "won" || view === "lost" ? [view] : view === "all" ? [...DEAL_STAGES] : OPEN_STAGES;
  const modeHref = (m: string) => listHref(BASE, state, { mode: m });

  return (
    <>
      <PageHead label="ดีล" title="ดีล" actions={<Link href="/app/deals/new" className="c-btn c-btn-primary">+ ดีล</Link>} />
      <SavedViews list="deals" base={BASE} views={saved} current={current} canShare={can(v.role, "fields")} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <ListViews base={BASE} state={state} views={VIEWS} />
        <div className="flex items-center gap-2">
          <span className="c-thai text-[0.84rem] text-[var(--c-text-3)]">{num(deals.length)} ดีล · {baht(total)}</span>
          <nav className="flex overflow-hidden rounded-[var(--c-btn-radius)] border border-[var(--c-line-2)]" aria-label="รูปแบบการแสดง">
            <Link href={modeHref("board")} aria-current={mode === "board" ? "page" : undefined} className={`px-3 py-1.5 text-[0.82rem] ${mode === "board" ? "bg-[var(--c-active)] font-semibold" : ""}`}>ไปป์ไลน์</Link>
            <Link href={modeHref("list")} aria-current={mode === "list" ? "page" : undefined} className={`px-3 py-1.5 text-[0.82rem] ${mode === "list" ? "bg-[var(--c-active)] font-semibold" : ""}`}>รายการ</Link>
          </nav>
        </div>
      </div>

      <datalist id="deal-pkgs">{pkgs.map((n) => <option key={n} value={n} />)}</datalist>
      <details className="mb-4" open={nFilters > 0}>
        <summary className="c-thai cursor-pointer text-[0.86rem] text-[var(--c-accent)]">ตัวกรอง{nFilters ? ` (${nFilters})` : ""}</summary>
        <form action={BASE} className="c-panel mt-2 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          {view !== "open" && <input type="hidden" name="view" value={view} />}
          {state.mode && <input type="hidden" name="mode" value={state.mode} />}
          <label className={LABEL}>เจ้าของ
            <select name="owner" defaultValue={filters.owner ?? ""} className="c-select">
              <option value="">ทั้งหมด</option>{team.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </label>
          <label className={LABEL}>มูลค่าตั้งแต่ (บาท)<input name="minValue" inputMode="numeric" defaultValue={sp.minValue ?? ""} className="c-input" /></label>
          <label className={LABEL}>ปิดคาดตั้งแต่<input type="date" name="closeFrom" defaultValue={filters.closeFrom ?? ""} className="c-input" /></label>
          <label className={LABEL}>ปิดคาดถึง<input type="date" name="closeTo" defaultValue={filters.closeTo ?? ""} className="c-input" /></label>
          <label className={LABEL}>มีแพ็กเกจ<input name="package" list="deal-pkgs" defaultValue={filters.package ?? ""} className="c-input" autoComplete="off" /></label>
          {fields.map((f) => (
            <label key={f.id} className={LABEL}>{f.label}
              {f.kind === "choice" ? (
                <select name={`df.${f.id}`} defaultValue={sp[`df.${f.id}`] ?? ""} className="c-select">
                  <option value="">ทั้งหมด</option>{f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : <input name={`df.${f.id}`} defaultValue={sp[`df.${f.id}`] ?? ""} className="c-input" placeholder="ค่าตรงทุกตัวอักษร" />}
            </label>
          ))}
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
            <button type="submit" className="c-btn c-btn-primary c-btn-sm">ใช้ตัวกรอง</button>
            {nFilters > 0 && <Link href={listHref(BASE, { ...state, extra: {} }, {})} className="c-btn c-btn-ghost c-btn-sm">ล้างตัวกรอง</Link>}
          </div>
        </form>
      </details>

      {deals.length === 0 ? (
        <Panel className="p-5">
          <p className="c-thai text-[0.9rem] text-[var(--c-text-3)]">
            ยังไม่มีดีลในมุมมองนี้ — สร้างจากปุ่ม “+ ดีล” หรือจากหน้าบริษัท · ดีลเกิดเองเมื่อบันทึกว่า “ส่งข้อเสนอแล้ว” ในแคมเปญ
          </p>
        </Panel>
      ) : mode === "board" ? (
        <>
          {/* ไม่ได้เลือกรูปแบบเอง + จอแคบ = รายการการ์ด (บอร์ดหลายคอลัมน์บนมือถือเห็นทีละคอลัมน์ · docs/crm-plan.md C0 ข้อ 9) */}
          {!state.mode && (
            <ul className="grid gap-2 md:hidden">
              {deals.map((d) => (
                <li key={d.id} className="c-panel p-3">
                  <Link href={`/app/deals/${d.id}`} className="c-thai block text-[0.92rem] font-medium text-[var(--c-accent)]">{d.name}</Link>
                  <p className="c-thai mt-0.5 truncate text-[0.8rem] text-[var(--c-text-3)]">{d.org}</p>
                  <p className="mt-1.5 flex items-center justify-between gap-2">
                    <span className={`c-pill ${d.stage === "won" ? "c-pill-good" : d.stage === "lost" ? "" : "c-pill-reach"}`}>{stageTh(d.stage)}</span>
                    <span className="c-mono text-[0.82rem]">{d.value != null ? baht(d.value) : "—"}</span>
                  </p>
                </li>
              ))}
            </ul>
          )}
          <div className={state.mode ? "" : "hidden md:block"}>
            <DealBoard key={deals.map((d) => `${d.id}:${d.stage}`).join("|")} stages={stages} deals={deals.map((d) => ({ id: d.id, name: d.name, org: d.org, stage: d.stage, value: d.value, expectedClose: d.expectedClose, owner: d.owner }))} />
          </div>
        </>
      ) : (
        <Panel className="p-0">
          {/* ── ทำทีละหลายรายการ (E3) ── ปิดดีลหลายรายการไม่ได้ (ต้องมีเหตุผลต่อดีล) */}
          <div className="flex justify-end border-b border-[var(--c-line)] px-5 py-2">
            <details className="relative">
              <summary className="c-btn c-btn-ghost c-btn-sm inline-flex cursor-pointer list-none">เปลี่ยนรายการที่ติ๊ก…</summary>
              <ActionForm id="bulk-deals" action={bulkDealsAction} label="เปลี่ยน" pendingLabel="กำลังเปลี่ยน…" size="sm"
                className="c-panel absolute right-0 z-10 mt-1 grid w-80 gap-2 p-3">
                <label className={LABEL}>เปลี่ยนอะไร
                  <select name="op" className="c-select" defaultValue="owner">
                    <option value="owner">เจ้าของดีล</option><option value="stage">ขั้น (ที่ยังเปิด)</option><option value="forecast">หมวดพยากรณ์</option>
                    {fields.map((f) => <option key={f.id} value={`df.${f.id}`}>{f.label}</option>)}
                  </select>
                </label>
                <label className={LABEL}>เจ้าของใหม่<input name="owner" list="bulk-team" className="c-input" autoComplete="off" /></label>
                <label className={LABEL}>ขั้นใหม่
                  <select name="stage" className="c-select" defaultValue="qualified">{OPEN_STAGES.map((x) => <option key={x} value={x}>{DEAL_STAGE_TH[x]}</option>)}</select>
                </label>
                <label className={LABEL}>หมวดพยากรณ์
                  <select name="category" className="c-select" defaultValue=""><option value="">ตามขั้น</option>{FORECAST_CATEGORIES.map((c) => <option key={c} value={c}>{FORECAST_TH[c]}</option>)}</select>
                </label>
                {fields.length > 0 && <label className={LABEL}>ค่าใหม่ของฟิลด์ (ว่าง = ล้างค่า)<input name="value" className="c-input" /></label>}
                <datalist id="bulk-team">{team.map((m) => <option key={m} value={m} />)}</datalist>
              </ActionForm>
            </details>
          </div>
          <div className="c-scroll px-5 py-2" tabIndex={0} role="region" aria-label="ตารางดีล">
            <table className="c-table min-w-[52rem]">
              <thead>
                <tr>
                  <th className="w-8"><SelectAll form="bulk-deals" /></th>
                  <SortTh base={BASE} state={state} col="name" label="ดีล" />
                  <SortTh base={BASE} state={state} col="org" label="บริษัท" />
                  <th className="font-sans text-[0.75rem] normal-case tracking-normal">ขั้น</th>
                  <SortTh base={BASE} state={state} col="value" label="มูลค่า" defaultDir="desc" align="right" />
                  <SortTh base={BASE} state={state} col="close" label="ปิดคาด" />
                  <th className="font-sans text-[0.75rem] normal-case tracking-normal">เจ้าของ</th>
                  <SortTh base={BASE} state={state} col="updated" label="อัปเดต" defaultDir="desc" />
                </tr>
              </thead>
              <tbody>
                {deals.map((d) => (
                  <tr key={d.id}>
                    <td><input type="checkbox" form="bulk-deals" name="ids" value={d.id} aria-label={`เลือก ${d.name}`} className="h-4 w-4" /></td>
                    <td><Link href={`/app/deals/${d.id}`} className="c-thai text-[var(--c-accent)] hover:underline">{d.name}</Link></td>
                    <td className="c-thai text-[0.84rem]"><Link href={`/app/accounts/${d.orgId}`} className="hover:text-[var(--c-accent)]">{d.org}</Link></td>
                    <td><span className={`c-pill ${d.stage === "won" ? "c-pill-good" : d.stage === "lost" ? "" : "c-pill-reach"}`}>{stageTh(d.stage)}</span></td>
                    <td className="c-mono text-right">{d.value != null ? baht(d.value) : "—"}</td>
                    <td className="c-thai text-[0.82rem]">{d.expectedClose ? thaiDate(d.expectedClose) : "—"}</td>
                    <td className="c-thai text-[0.82rem]">{d.owner ?? "—"}</td>
                    <td className="c-thai text-[0.82rem] text-[var(--c-text-3)]">{thaiDate(d.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </>
  );
}
