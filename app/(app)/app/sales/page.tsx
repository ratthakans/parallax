import Link from "next/link";
import { viewer } from "@/app/(app)/viewer";
import { listCampaigns } from "@/lib/engine/campaigns";
import { CHANNEL_TH } from "@/lib/shared/policy";
import { thaiDate } from "@/lib/shared/format";
import { PageHead, Panel, num } from "@/components/console/ui";

export const metadata = { title: "แคมเปญ" };
export const dynamic = "force-dynamic";

/* ── Campaign Workspace · แคมเปญขาย (docs/plan.md B5) ─────────────
   แคมเปญเริ่มจากวัตถุประสงค์ (ที่มีฐานการประมวลผล) ไม่ใช่จากรายชื่อ — รายชื่อสร้างจากเกณฑ์ที่อ่านได้
   และทุกคนในรายชื่อผ่านบริการนโยบายก่อนจะมอบหมายได้
   ฟอร์มสร้างอยู่ที่ /app/sales/new (แผน H S6) — หน้านี้เหลือรายการอย่างเดียว */

const TH = "font-sans normal-case tracking-normal text-[0.75rem]";
const STATUS_TH: Record<string, string> = { draft: "ร่าง", active: "กำลังทำ", closed: "ปิดแล้ว" };

export default async function SalesPage() {
  const v = await viewer();
  const campaigns = await listCampaigns(v.tenantId);

  return (
    <>
      <PageHead
        label="แคมเปญ"
        title="แคมเปญขาย"
        lead="หนึ่งแคมเปญ = หนึ่งข้อเสนอ ส่งให้คนที่ติดต่อได้"
        more="หนึ่งข้อเสนอ หนึ่งวัตถุประสงค์ หนึ่งช่องทาง · รายชื่อมาจากเกณฑ์ที่อ่านได้ และทุกคนผ่านการตรวจนโยบายพร้อมเหตุผลก่อนมอบหมาย"
        actions={<>
          <Link href="/app/sales/weekly" className="c-btn c-btn-ghost">ทบทวนรายสัปดาห์</Link>
          <Link href="/app/sales/new" className="c-btn c-btn-primary">+ แคมเปญ</Link>
        </>}
      />

      <Panel className="p-5 md:p-6">
        <h2 className="c-h2 text-[var(--c-text)]">แคมเปญ</h2>
        {campaigns.length ? (
          <div className="c-scroll mt-4" tabIndex={0} role="region" aria-label="ตารางแคมเปญ">
            <table className="c-table min-w-[46rem]">
              <thead>
                <tr>
                  <th className={TH}>แคมเปญ</th>
                  <th className={TH}>วัตถุประสงค์</th>
                  <th className={`${TH} text-right`}>เป้าหมาย</th>
                  <th className={`${TH} text-right`}>ใช้ได้ตามนโยบาย</th>
                  <th className={`${TH} text-right`}>ปิดได้</th>
                  <th className={TH}>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/app/sales/${c.id}`} className="c-thai inline-block py-1.5 text-[var(--c-text)] hover:text-[var(--c-accent)]">{c.name}</Link>
                      <span className="c-thai mt-0.5 block text-[0.75rem] text-[var(--c-text-4)]">{CHANNEL_TH[c.channel]} · สร้าง {thaiDate(c.created_at)}</span>
                    </td>
                    <td className="c-thai text-[0.84rem]">{c.purpose ?? "—"}</td>
                    <td className="c-mono text-right">{num(Number(c.targets))}</td>
                    <td className="c-mono text-right">{num(Number(c.eligible))}</td>
                    <td className="c-mono text-right">{num(Number(c.won))}</td>
                    <td className="c-thai text-[0.82rem]">{STATUS_TH[c.status] ?? c.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="c-thai mt-4 text-[0.88rem] text-[var(--c-text-3)]">ยังไม่มีแคมเปญ — <Link href="/app/sales/new" className="underline">สร้างแคมเปญแรก</Link></p>
        )}
      </Panel>

    </>
  );
}
