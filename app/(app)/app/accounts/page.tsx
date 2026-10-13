import Link from "next/link";
import { viewer } from "@/app/(app)/viewer";
import { listAccounts } from "@/lib/engine/accounts";
import { CLASSIFICATION_TH, LIFECYCLE_TH, type LifecycleState } from "@/lib/shared/vault";
import { thaiDate } from "@/lib/shared/format";
import { PageHead, Panel, num } from "@/components/console/ui";

export const dynamic = "force-dynamic";

/* ── Account Workspace · รายชื่อบริษัท (docs/plan.md B4) ─────────────
   เรียงตามจำนวนคนที่ยังสังกัด — บริษัทที่มีคนให้คุยด้วยจริงขึ้นก่อน ไม่มีคะแนนหรือการจัดอันดับจากการเดา */

const PAGE = 50;
const TH = "font-sans normal-case tracking-normal text-[0.75rem]";

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ q?: string; mine?: string; page?: string }> }) {
  const sp = await searchParams;
  const v = await viewer();
  const page = Math.max(1, Number(sp.page) || 1);
  const mine = sp.mine === "1";
  const { rows, total } = await listAccounts(v.tenantId, { q: sp.q, mine: mine ? v.actor : undefined, limit: PAGE, offset: (page - 1) * PAGE });
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const qs = (p: number) => `/app/accounts?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(mine ? { mine: "1" } : {}), page: String(p) })}`;

  return (
    <>
      <PageHead
        label="Account Workspace"
        title="บัญชีบริษัท"
        lead="แฟ้มของแต่ละบริษัท: คนที่สังกัดตามช่วงเวลา ความสัมพันธ์ที่มีผู้ยืนยัน ประวัติการติดต่อ และสรุปก่อนพบลูกค้าที่ทุกประโยคชี้หลักฐาน — สิ่งที่ไม่มีหลักฐานแสดงว่าไม่ทราบ"
      />

      <form className="mb-5 flex flex-wrap items-end gap-3" action="/app/accounts">
        <label className="c-thai flex min-w-0 flex-1 basis-72 flex-col gap-1 text-[0.82rem] text-[var(--c-text-3)]">
          ค้นชื่อบริษัทหรือโดเมน
          <input name="q" defaultValue={sp.q ?? ""} className="c-input" placeholder="เช่น สยามกริด หรือ siamgrid" />
        </label>
        <label className="c-thai flex items-center gap-2 py-2.5 text-[0.86rem] text-[var(--c-text-2)]">
          <input type="checkbox" name="mine" value="1" defaultChecked={mine} className="h-6 w-6" /> เฉพาะบัญชีของฉัน
        </label>
        <button type="submit" className="c-btn c-btn-ghost">ค้นหา</button>
      </form>

      <Panel className="p-5 md:p-6">
        <p className="c-thai text-[0.84rem] text-[var(--c-text-3)]">
          {num(total)} บริษัท{sp.q ? ` ที่ตรงกับ “${sp.q}”` : ""}{mine ? " ที่คุณเป็นเจ้าของ" : ""}
        </p>
        {rows.length ? (
          <div className="c-scroll mt-4" tabIndex={0} role="region" aria-label="ตารางบัญชีบริษัท">
            <table className="c-table min-w-[52rem]">
              <thead>
                <tr>
                  <th className={TH}>บริษัท</th>
                  <th className={`${TH} text-right`}>ยังสังกัด</th>
                  <th className={`${TH} text-right`}>เคยสังกัด</th>
                  <th className={TH}>เจ้าของบัญชี</th>
                  <th className={TH}>ติดต่อล่าสุด</th>
                  <th className={TH}>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/app/accounts/${r.id}`} className="c-thai inline-block py-1.5 text-[var(--c-text)] hover:text-[var(--c-accent)]">{r.name}</Link>
                      <span className="c-mono mt-0.5 block text-[0.75rem] text-[var(--c-text-4)]">{r.domain ?? "ไม่ทราบโดเมน"}</span>
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
          <p className="c-thai mt-4 max-w-2xl text-[0.88rem] text-[var(--c-text-3)]">
            {sp.q || mine ? "ไม่พบบริษัทที่ตรงเงื่อนไข" : "ยังไม่มีบริษัท — นำเข้าไฟล์ที่มีคอลัมน์ชื่อบริษัทใน Data Vault แล้วบริษัทจะปรากฏที่นี่หลังตรวจตัวตน"}
            {!sp.q && !mine && <> <Link href="/app/vault" className="underline">ไปที่แหล่งข้อมูล</Link></>}
          </p>
        )}
        {pages > 1 && (
          <nav className="c-thai mt-4 flex items-center gap-4 text-[0.86rem]" aria-label="หน้าของรายชื่อ">
            {page > 1 && <Link className="c-btn c-btn-ghost" href={qs(page - 1)}>ก่อนหน้า</Link>}
            <span className="text-[var(--c-text-3)]">หน้า {num(page)} / {num(pages)}</span>
            {page < pages && <Link className="c-btn c-btn-ghost" href={qs(page + 1)}>ถัดไป</Link>}
          </nav>
        )}
      </Panel>
    </>
  );
}
