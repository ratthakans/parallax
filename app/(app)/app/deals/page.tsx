import Link from "next/link";
import { viewer } from "@/app/(app)/viewer";
import { DEAL_SORTS, DEAL_VIEWS, listDeals, type DealSort, type DealView } from "@/lib/engine/deals";
import { DEAL_STAGES, OPEN_STAGES, stageTh } from "@/lib/shared/deals";
import { thaiDate } from "@/lib/shared/format";
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

export default async function DealsPage({ searchParams }: { searchParams: Promise<{ view?: string; sort?: string; dir?: string; q?: string; mode?: string }> }) {
  const sp = await searchParams;
  const v = await viewer();
  const view = (DEAL_VIEWS as readonly string[]).includes(sp.view ?? "") ? (sp.view as DealView) : "open";
  const sort = (DEAL_SORTS as readonly string[]).includes(sp.sort ?? "") ? (sp.sort as DealSort) : undefined;
  const dir = sp.dir === "asc" || sp.dir === "desc" ? sp.dir : undefined;
  const mode = sp.mode === "list" ? "list" : "board";
  const deals = await listDeals(v.tenantId, { view, sort, dir, q: sp.q }, { id: v.actor, clearance: v.clearance });
  const state: ListState = { q: sp.q, view, sort, dir, defaultView: "open", mode: sp.mode === "list" || sp.mode === "board" ? sp.mode : undefined };
  const total = deals.reduce((t, d) => t + (d.value ?? 0), 0);
  const stages = view === "won" || view === "lost" ? [view] : view === "all" ? [...DEAL_STAGES] : OPEN_STAGES;
  const modeHref = (m: string) => listHref(BASE, state, { mode: m });

  return (
    <>
      <PageHead label="ดีล" title="ดีล" actions={<Link href="/app/deals/new" className="c-btn c-btn-primary">+ ดีล</Link>} />

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
          <div className="c-scroll px-5 py-2" tabIndex={0} role="region" aria-label="ตารางดีล">
            <table className="c-table min-w-[52rem]">
              <thead>
                <tr>
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
