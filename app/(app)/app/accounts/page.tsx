import Link from "next/link";
import { viewer } from "@/app/(app)/viewer";
import { ACCOUNT_SORTS, ACCOUNT_VIEWS, listAccounts, type AccountSort, type AccountView } from "@/lib/engine/accounts";
import { CLASSIFICATION_TH, LIFECYCLE_TH, type LifecycleState } from "@/lib/shared/vault";
import { thaiDate } from "@/lib/shared/format";
import { PageHead, Panel, num } from "@/components/console/ui";
import { ListViews, Pager, SortTh, type ListState } from "@/components/console/list-view";

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
  { key: "quiet", label: "เงียบเกิน 30 วัน" },
  { key: "no_owner", label: "ยังไม่มีเจ้าของ" },
];

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ q?: string; view?: string; sort?: string; dir?: string; page?: string; mine?: string }> }) {
  const sp = await searchParams;
  const v = await viewer();
  /* ลิงก์เก่า ?mine=1 = มุมมอง "บัญชีของฉัน" */
  const view = (ACCOUNT_VIEWS as readonly string[]).includes(sp.view ?? "") ? (sp.view as AccountView) : sp.mine === "1" ? "mine" : "all";
  const sort = (ACCOUNT_SORTS as readonly string[]).includes(sp.sort ?? "") ? (sp.sort as AccountSort) : undefined;
  const dir = sp.dir === "asc" || sp.dir === "desc" ? sp.dir : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const state: ListState = { q: sp.q, view, sort, dir, page };
  const { rows, total } = await listAccounts(v.tenantId, {
    q: sp.q, view, sort, dir, mine: view === "mine" ? v.actor : undefined,
    limit: PAGE, offset: (page - 1) * PAGE, viewer: { id: v.actor, clearance: v.clearance },
  });
  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <>
      <PageHead label="บริษัท" title="บริษัท" />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <ListViews base={BASE} state={state} views={VIEWS} />
        <form className="flex min-w-0 flex-1 basis-64 justify-end gap-2" action={BASE}>
          {view !== "all" && <input type="hidden" name="view" value={view} />}
          <input name="q" defaultValue={sp.q ?? ""} className="c-input max-w-xs" placeholder="ค้นชื่อบริษัทหรือโดเมน" aria-label="ค้นชื่อบริษัทหรือโดเมน" />
          <button type="submit" className="c-btn c-btn-ghost">ค้นหา</button>
        </form>
      </div>

      <Panel className="p-0">
        <p className="c-thai border-b border-[var(--c-line)] px-5 py-3 text-[0.84rem] text-[var(--c-text-3)]">
          {num(total)} บริษัท{sp.q ? ` ที่ตรงกับ “${sp.q}”` : ""}
        </p>
        {rows.length ? (
          <div className="c-scroll px-5 pb-2" tabIndex={0} role="region" aria-label="ตารางบริษัท">
            <table className="c-table min-w-[52rem]">
              <thead>
                <tr>
                  <SortTh base={BASE} state={state} col="name" label="บริษัท" />
                  <SortTh base={BASE} state={state} col="people" label="ยังสังกัด" defaultDir="desc" align="right" />
                  <th className="text-right font-sans text-[0.75rem] normal-case tracking-normal">เคยสังกัด</th>
                  <SortTh base={BASE} state={state} col="owner" label="เจ้าของบัญชี" />
                  <SortTh base={BASE} state={state} col="last" label="ติดต่อล่าสุด" defaultDir="desc" />
                  <th className="font-sans text-[0.75rem] normal-case tracking-normal">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/app/accounts/${r.id}`} className="c-thai inline-block py-1 text-[var(--c-accent)] hover:underline">{r.name}</Link>
                      <span className="c-mono block text-[0.75rem] text-[var(--c-text-4)]">{r.domain ?? "ไม่ทราบโดเมน"}</span>
                    </td>
                    <td className="c-mono text-right">{num(r.current)}</td>
                    <td className="c-mono text-right text-[var(--c-text-3)]">{num(r.people - r.current)}</td>
                    <td className="c-thai text-[0.82rem]">{r.owner ?? <span className="text-[var(--c-text-4)]">ยังไม่มี</span>}</td>
                    <td className="c-thai text-[0.82rem]">{r.lastInteraction ? thaiDate(r.lastInteraction) : <span className="text-[var(--c-text-4)]">ไม่มีบันทึก</span>}</td>
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
            {sp.q || view !== "all" ? "ไม่พบบริษัทที่ตรงเงื่อนไข" : "ยังไม่มีบริษัท — นำเข้าไฟล์ที่มีคอลัมน์ชื่อบริษัท แล้วบริษัทจะปรากฏที่นี่หลังตรวจตัวตน"}
            {!sp.q && view === "all" && <> <Link href="/app/vault" className="underline">ไปที่นำเข้าข้อมูล</Link></>}
          </p>
        )}
        <div className="px-5 pb-5"><Pager base={BASE} state={state} page={page} pages={pages} /></div>
      </Panel>
    </>
  );
}
