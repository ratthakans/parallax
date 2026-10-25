import Link from "next/link";
import { viewer } from "@/app/(app)/viewer";
import { ACCOUNT_SORTS, ACCOUNT_VIEWS, accountFilterOptions, listAccounts, type AccountFilters, type AccountSort, type AccountView } from "@/lib/engine/accounts";
import { displayValue, listFields, valuesFor } from "@/lib/engine/custom-fields";
import { cleanQuery, listViews } from "@/lib/engine/saved-views";
import { can } from "@/lib/shared/roles";
import { SavedViews } from "@/components/console/saved-views";
import { listTeams } from "@/lib/engine/forecast";
import { bulkOrgsAction } from "@/app/(app)/bulk-actions";
import { teamMembers } from "@/lib/engine/team";
import { ActionForm } from "@/components/console/action-form";
import { SelectAll, SelectedCount } from "@/components/console/select-all";
import { CLASSIFICATION_TH, LIFECYCLE_TH, type LifecycleState } from "@/lib/shared/vault";
import { thaiDate } from "@/lib/shared/format";
import { Blank, PageHead, Panel, num } from "@/components/console/ui";
import { ListViews, Pager, SortTh, type ListState } from "@/components/console/list-view";

export const metadata = { title: "บริษัท" };
export const dynamic = "force-dynamic";

/* ── รายการบริษัท (docs/plan.md B4 · docs/ux-plan.md U3) ─────────────
   มุมมองสำเร็จรูป + เรียงคอลัมน์ได้ · ค่าเริ่มต้นเรียงตามจำนวนคนที่ยังสังกัด — บริษัทที่มีคนให้คุยด้วยจริงขึ้นก่อน
   ไม่มีคะแนนหรือการจัดอันดับจากการเดา */

const PAGE = 50;
const BASE = "/app/accounts";
const VIEWS: { key: AccountView; label: string }[] = [
  { key: "all", label: "ทั้งหมด" },
  { key: "mine", label: "บัญชีของฉัน" },
  { key: "open_deals", label: "มีดีลเปิด" },
  { key: "quiet", label: "ดูแลอยู่แต่เงียบ 30 วัน" },
  { key: "no_owner", label: "ยังไม่มีเจ้าของ" },
];

const LABEL = "c-thai flex min-w-0 flex-col gap-1 text-[0.78rem] text-[var(--c-text-3)]";

export default async function AccountsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const v = await viewer();
  /* ── ตัวกรองที่เลือกเอง (docs/crm-plan.md C5) ── อุตสาหกรรม · เจ้าของ · กลุ่ม · เลขนิติบุคคล · ฟิลด์ของบัญชี (cf.<id>) */
  const [fields, opts, saved, teams] = await Promise.all([
    listFields(v.tenantId, "org"), accountFilterOptions(v.tenantId), listViews(v.tenantId, "accounts", v.actor), listTeams(v.tenantId),
  ]);
  const filters: AccountFilters = {
    industry: sp.industry || undefined, owner: sp.owner || undefined, team: sp.team || undefined,
    group: sp.group === "in" || sp.group === "none" ? sp.group : undefined,
    taxId: sp.tax === "has" || sp.tax === "missing" ? sp.tax : undefined,
    custom: fields.filter((f) => sp[`cf.${f.id}`]).map((f) => ({ fieldId: f.id, value: sp[`cf.${f.id}`]! })),
  };
  const extra: Record<string, string> = Object.fromEntries(Object.entries({
    industry: filters.industry, owner: filters.owner, team: filters.team, group: filters.group, tax: filters.taxId,
    ...Object.fromEntries((filters.custom ?? []).map((c) => [`cf.${c.fieldId}`, c.value])),
  }).filter((e): e is [string, string] => Boolean(e[1])));
  const nFilters = Object.keys(extra).length;
  const shownFields = fields.filter((f) => f.kind === "choice").slice(0, 3);
  /* ลิงก์เก่า ?mine=1 = มุมมอง "บัญชีของฉัน" */
  const view = (ACCOUNT_VIEWS as readonly string[]).includes(sp.view ?? "") ? (sp.view as AccountView) : sp.mine === "1" ? "mine" : "all";
  const sort = (ACCOUNT_SORTS as readonly string[]).includes(sp.sort ?? "") ? (sp.sort as AccountSort) : undefined;
  const dir = sp.dir === "asc" || sp.dir === "desc" ? sp.dir : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const state: ListState = { q: sp.q, view, sort, dir, page, extra };
  const { rows, total } = await listAccounts(v.tenantId, {
    q: sp.q, view, sort, dir, mine: view === "mine" ? v.actor : undefined, filters,
    limit: PAGE, offset: (page - 1) * PAGE, viewer: { id: v.actor, clearance: v.clearance },
  });
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const people = await teamMembers(v.tenantId, v.actor);
  const cvals = shownFields.length ? await valuesFor(v.tenantId, "org", rows.map((r) => r.id)) : new Map();
  const current = cleanQuery(new URLSearchParams(Object.entries({ view: view !== "all" ? view : "", sort: sort ?? "", dir: dir ?? "", ...extra }).filter((e) => e[1])).toString());
  return (
    <>
      <PageHead label="บริษัท" title="บริษัท" actions={<Link href="/app/accounts/new" className="c-btn c-btn-primary">+ บริษัท</Link>} />
      <SavedViews list="accounts" base={BASE} views={saved} current={current} canShare={can(v.role, "fields")} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <ListViews base={BASE} state={state} views={VIEWS} />
        <form className="flex min-w-0 flex-1 basis-64 justify-end gap-2" action={BASE}>
          {view !== "all" && <input type="hidden" name="view" value={view} />}
          {Object.entries(extra).map(([k, x]) => <input key={k} type="hidden" name={k} value={x} />)}
          <input name="q" defaultValue={sp.q ?? ""} className="c-input max-w-xs" placeholder="ค้นชื่อบริษัทหรือโดเมน" aria-label="ค้นชื่อบริษัทหรือโดเมน" />
          <button type="submit" className="c-btn c-btn-ghost">ค้นหา</button>
        </form>
      </div>

      <details className="mb-4" open={nFilters > 0}>
        <summary className="c-thai cursor-pointer text-[0.86rem] text-[var(--c-accent)]">ตัวกรอง{nFilters ? ` (${nFilters})` : ""}</summary>
        <form action={BASE} className="c-panel mt-2 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          {view !== "all" && <input type="hidden" name="view" value={view} />}
          {sp.q && <input type="hidden" name="q" value={sp.q} />}
          <label className={LABEL}>อุตสาหกรรม
            <select name="industry" defaultValue={filters.industry ?? ""} className="c-select">
              <option value="">ทั้งหมด</option>{opts.industries.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </label>
          <label className={LABEL}>เจ้าของบัญชี
            <select name="owner" defaultValue={filters.owner ?? ""} className="c-select">
              <option value="">ทั้งหมด</option><option value="-">ยังไม่มีเจ้าของ</option>{opts.owners.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </label>
          {teams.length > 0 && (
            <label className={LABEL}>ทีมที่ดูแล
              <select name="team" defaultValue={filters.team ?? ""} className="c-select">
                <option value="">ทั้งหมด</option><option value="-">ยังไม่ระบุทีม</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
          )}
          <label className={LABEL}>บริษัทในเครือ
            <select name="group" defaultValue={filters.group ?? ""} className="c-select">
              <option value="">ทั้งหมด</option><option value="in">อยู่ในกลุ่ม</option><option value="none">ไม่อยู่ในกลุ่ม</option>
            </select>
          </label>
          <label className={LABEL}>เลขนิติบุคคล
            <select name="tax" defaultValue={filters.taxId ?? ""} className="c-select">
              <option value="">ทั้งหมด</option><option value="has">มีแล้ว</option><option value="missing">ยังไม่มี</option>
            </select>
          </label>
          {fields.map((f) => (
            <label key={f.id} className={LABEL}>{f.label}
              {f.kind === "choice" ? (
                <select name={`cf.${f.id}`} defaultValue={sp[`cf.${f.id}`] ?? ""} className="c-select">
                  <option value="">ทั้งหมด</option>{f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : <input name={`cf.${f.id}`} defaultValue={sp[`cf.${f.id}`] ?? ""} className="c-input" placeholder="ค่าตรงทุกตัวอักษร" />}
            </label>
          ))}
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
            <button type="submit" className="c-btn c-btn-primary c-btn-sm">ใช้ตัวกรอง</button>
            {nFilters > 0 && <Link href={view !== "all" ? `${BASE}?view=${view}` : BASE} className="c-btn c-btn-ghost c-btn-sm">ล้างตัวกรอง</Link>}
          </div>
        </form>
      </details>

      <Panel className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--c-line)] px-5 py-3">
          <p className="c-thai text-[0.84rem] text-[var(--c-text-3)]">{num(total)} บริษัท{sp.q ? ` ที่ตรงกับ “${sp.q}”` : ""}</p>
          {/* ── ทำทีละหลายรายการ (E3) ── ติ๊กแถว แล้วเลือกว่าจะเปลี่ยนอะไร */}
          {rows.length > 0 && (
            <details className="relative">
              <summary className="c-btn c-btn-ghost c-btn-sm inline-flex cursor-pointer list-none">เปลี่ยนรายการที่ติ๊ก…</summary>
              <ActionForm id="bulk-orgs" action={bulkOrgsAction} label="เปลี่ยน" pendingLabel="กำลังเปลี่ยน…" size="sm" closeOnSuccess
                className="c-panel absolute right-0 z-10 mt-1 grid w-80 gap-2 p-3">
                <label className={LABEL}>เปลี่ยนอะไร
                  <select name="op" className="c-select" defaultValue="owner">
                    <option value="owner">เจ้าของบัญชี</option>
                    {teams.length > 0 && <option value="team">ทีมที่ดูแล</option>}
                    {fields.map((f) => <option key={f.id} value={`cf.${f.id}`}>{f.label}</option>)}
                  </select>
                </label>
                <SelectedCount form="bulk-orgs" />
                <label className={LABEL}>เจ้าของใหม่<input name="owner" list="bulk-people" className="c-input" autoComplete="off" /></label>
                <label className="c-thai flex items-center gap-2 text-[0.78rem] text-[var(--c-text-3)]"><input type="checkbox" name="confirmRelease" value="1" /> ปล่อยบัญชีที่ติ๊กทั้งหมด (ไม่ใส่เจ้าของใหม่)</label>
                {teams.length > 0 && (
                  <label className={LABEL}>ทีม
                    <select name="teamId" className="c-select" defaultValue=""><option value="">ไม่ระบุ</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
                  </label>
                )}
                {fields.length > 0 && <label className={LABEL}>ค่าใหม่ของฟิลด์ (ว่าง = ล้างค่า)<input name="value" className="c-input" /></label>}
                <datalist id="bulk-people">{people.map((p) => <option key={p} value={p} />)}</datalist>
              </ActionForm>
            </details>
          )}
        </div>
        {rows.length ? (
          <div className="c-scroll px-5 pb-2" tabIndex={0} role="region" aria-label="ตารางบริษัท">
            <table className="c-table min-w-[52rem]">
              <thead>
                <tr>
                  <th className="w-8"><SelectAll form="bulk-orgs" /></th>
                  <SortTh base={BASE} state={state} col="name" label="บริษัท" />
                  <SortTh base={BASE} state={state} col="people" label="ยังสังกัด" defaultDir="desc" align="right" />
                  <th className="text-right font-sans text-[0.75rem] normal-case tracking-normal">เคยสังกัด</th>
                  <SortTh base={BASE} state={state} col="owner" label="เจ้าของบัญชี" />
                  <SortTh base={BASE} state={state} col="last" label="ติดต่อล่าสุด" defaultDir="desc" />
                  {shownFields.map((f) => <th key={f.id} className="font-sans text-[0.75rem] normal-case tracking-normal">{f.label}</th>)}
                  <th className="font-sans text-[0.75rem] normal-case tracking-normal">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td><input type="checkbox" form="bulk-orgs" name="ids" value={r.id} aria-label={`เลือก ${r.name}`} className="h-4 w-4" /></td>
                    <td>
                      <Link href={`/app/accounts/${r.id}`} className="c-thai inline-block py-1 text-[var(--c-accent)] hover:underline">{r.name}</Link>
                      {r.domain && <span className="c-mono block text-[0.75rem] text-[var(--c-text-4)]">{r.domain}</span>}
                    </td>
                    <td className="c-mono text-right">{num(r.current)}</td>
                    <td className="c-mono text-right text-[var(--c-text-3)]">{num(r.people - r.current)}</td>
                    <td className="c-thai text-[0.82rem]">{r.owner ?? <Blank label="ยังไม่มีเจ้าของบัญชี" />}</td>
                    <td className="c-thai text-[0.82rem]">{r.lastInteraction ? thaiDate(r.lastInteraction) : <Blank label="ยังไม่มีบันทึกการติดต่อ" />}</td>
                    {shownFields.map((f) => <td key={f.id} className="c-thai text-[0.82rem]">{displayValue(f, cvals.get(r.id)?.get(f.id))}</td>)}
                    <td className="c-thai text-[0.8rem]">
                      {LIFECYCLE_TH[r.lifecycle as LifecycleState] ?? r.lifecycle}
                      {r.classification === "restricted_high" && <span className="c-pill c-pill-warn ml-2">{CLASSIFICATION_TH.restricted_high}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="c-thai max-w-2xl px-5 py-5 text-[0.88rem] text-[var(--c-text-3)]">
            {sp.q || view !== "all" || nFilters ? "ไม่พบบริษัทที่ตรงเงื่อนไข" : "ยังไม่มีบริษัท — นำเข้าไฟล์ที่มีคอลัมน์ชื่อบริษัท แล้วบริษัทจะปรากฏที่นี่หลังตรวจตัวตน"}
            {!sp.q && view === "all" && <> <Link href="/app/vault" className="underline">ไปที่นำเข้าข้อมูล</Link></>}
          </p>
        )}
        <div className="px-5 pb-5"><Pager base={BASE} state={state} page={page} pages={pages} /></div>
      </Panel>
    </>
  );
}
