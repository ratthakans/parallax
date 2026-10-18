import Link from "next/link";
import { viewer } from "@/app/(app)/viewer";
import { pivot, pivotDims, type Measure } from "@/lib/engine/pivot";
import { cleanQuery, listViews } from "@/lib/engine/saved-views";
import { DEAL_VIEWS, type DealView } from "@/lib/engine/deals";
import { can } from "@/lib/shared/roles";
import { PageHead, Panel, baht, num } from "@/components/console/ui";
import { SavedViews } from "@/components/console/saved-views";

export const metadata = { title: "รายงานเลือกมิติ" };
export const dynamic = "force-dynamic";

/* ── รายงานเลือกมิติเอง (docs/crm-plan.md C5) ── แถว × คอลัมน์ × จำนวนหรือมูลค่า · ทุกอย่างอยู่ใน URL บันทึกเป็นมุมมองได้ */

const LABEL = "c-thai flex min-w-0 flex-col gap-1 text-[0.78rem] text-[var(--c-text-3)]";
const VIEW_TH: Record<DealView, string> = { open: "ดีลที่เปิดอยู่", mine: "ดีลของฉัน (เปิดอยู่)", all: "ทุกดีล", won: "ปิดได้", lost: "ไม่ได้" };

export default async function PivotPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const v = await viewer();
  const who = { id: v.actor, clearance: v.clearance };
  const [dims, saved] = await Promise.all([pivotDims(v.tenantId), listViews(v.tenantId, "pivot", v.actor)]);
  const has = (k?: string) => Boolean(k && dims.some((d) => d.key === k));
  const rows = has(sp.rows) ? sp.rows! : "stage";
  const cols = has(sp.cols) && sp.cols !== rows ? sp.cols : undefined;
  const measure: Measure = sp.measure === "count" ? "count" : "value";
  const view = (DEAL_VIEWS as readonly string[]).includes(sp.stage ?? "") ? (sp.stage as DealView) : "all";
  const p = await pivot(v.tenantId, who, { rows, cols, measure, view });
  const fmt = (n: number) => (measure === "count" ? num(n) : baht(n));
  const label = (k?: string) => dims.find((d) => d.key === k)?.label ?? "";
  const current = cleanQuery(new URLSearchParams(Object.entries({ rows, cols: cols ?? "", measure, stage: view }).filter((e) => e[1])).toString());

  return (
    <>
      <Link href="/app/reports" className="c-thai text-[0.8rem] text-[var(--c-text-3)] hover:text-[var(--c-accent)]">← รายงาน</Link>
      <PageHead label="รายงาน" title="รายงานเลือกมิติเอง" lead="เลือกว่าจะดูดีลแยกตามอะไร — ทุกตัวเลขมาจากดีลที่คุณเห็นได้เท่านั้น" />
      <SavedViews list="pivot" base="/app/reports/pivot" views={saved} current={current} canShare={can(v.role, "fields")} />
      <form action="/app/reports/pivot" className="c-panel mb-5 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className={LABEL}>แถว
          <select name="rows" defaultValue={rows} className="c-select">{dims.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}</select>
        </label>
        <label className={LABEL}>คอลัมน์ (ไม่บังคับ)
          <select name="cols" defaultValue={cols ?? ""} className="c-select">
            <option value="">ไม่แยก</option>{dims.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
          </select>
        </label>
        <label className={LABEL}>ตัวเลข
          <select name="measure" defaultValue={measure} className="c-select"><option value="value">มูลค่ารวม (บาท)</option><option value="count">จำนวนดีล</option></select>
        </label>
        <label className={LABEL}>ดีล
          <select name="stage" defaultValue={view} className="c-select">{DEAL_VIEWS.map((x) => <option key={x} value={x}>{VIEW_TH[x]}</option>)}</select>
        </label>
        <div className="sm:col-span-2 lg:col-span-4"><button type="submit" className="c-btn c-btn-primary c-btn-sm">ดูรายงาน</button></div>
      </form>

      <Panel className="p-0">
        <p className="c-thai border-b border-[var(--c-line)] px-5 py-3 text-[0.84rem] text-[var(--c-text-3)]">
          {VIEW_TH[view]} {num(p.deals)} ดีล · {measure === "count" ? "จำนวนดีล" : "มูลค่ารวม"} แยกตาม{label(rows)}{cols ? ` × ${label(cols)}` : ""}
          {(rows === "package" || cols === "package") && " · ดีลที่มีหลายแพ็กเกจนับในทุกแพ็กเกจ"}
        </p>
        {p.rows.length ? (
          <div className="c-scroll px-5 pb-3" tabIndex={0} role="region" aria-label="ตารางรายงาน">
            <table className="c-table" style={{ minWidth: `${Math.min(80, 14 + p.cols.length * 9)}rem` }}>
              <thead>
                <tr>
                  <th className="font-sans text-[0.75rem] normal-case tracking-normal">{label(rows)}</th>
                  {cols && p.cols.map((c) => <th key={c} className="text-right font-sans text-[0.75rem] normal-case tracking-normal">{c}</th>)}
                  <th className="text-right font-sans text-[0.75rem] normal-case tracking-normal">รวม</th>
                </tr>
              </thead>
              <tbody>
                {p.rows.map((r) => (
                  <tr key={r}>
                    <td className="c-thai">{r}</td>
                    {cols && p.cols.map((c) => <td key={c} className="c-mono text-right">{p.cells.get(`${r}\u0000${c}`) ? fmt(p.cells.get(`${r}\u0000${c}`)!) : "—"}</td>)}
                    <td className="c-mono text-right font-semibold">{fmt(p.rowTotals.get(r) ?? 0)}</td>
                  </tr>
                ))}
                <tr>
                  <td className="c-thai font-semibold">รวม</td>
                  {cols && p.cols.map((c) => <td key={c} className="c-mono text-right font-semibold">{fmt(p.colTotals.get(c) ?? 0)}</td>)}
                  <td className="c-mono text-right font-semibold">{fmt(p.total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : <p className="c-thai px-5 py-5 text-[0.88rem] text-[var(--c-text-3)]">ไม่มีดีลในมุมมองนี้</p>}
      </Panel>
    </>
  );
}
