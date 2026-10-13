import Link from "next/link";
import { viewer } from "@/app/(app)/viewer";
import { createCampaignAction } from "@/app/(app)/sales-actions";
import { listCampaigns } from "@/lib/engine/campaigns";
import { listBases } from "@/lib/engine/policy";
import { CHANNELS, CHANNEL_TH, LAWFUL_BASIS_TH, MESSAGE_KINDS, MESSAGE_KIND_TH, type LawfulBasis } from "@/lib/shared/policy";
import { thaiDate } from "@/lib/shared/format";
import { ActionForm } from "@/components/console/action-form";
import { PageHead, Panel, num } from "@/components/console/ui";
import { CriteriaFields } from "./criteria-fields";

export const dynamic = "force-dynamic";

/* ── Campaign Workspace · แคมเปญขาย (docs/plan.md B5) ─────────────
   แคมเปญเริ่มจากวัตถุประสงค์ (ที่มีฐานการประมวลผล) ไม่ใช่จากรายชื่อ — รายชื่อสร้างจากเกณฑ์ที่อ่านได้
   และทุกคนในรายชื่อผ่านบริการนโยบายก่อนจะมอบหมายได้ */

const TH = "font-sans normal-case tracking-normal text-[0.75rem]";
const LABEL = "c-thai flex min-w-0 flex-col gap-1 text-[0.8rem] text-[var(--c-text-3)]";
const STATUS_TH: Record<string, string> = { draft: "ร่าง", active: "กำลังทำ", closed: "ปิดแล้ว" };

export default async function SalesPage() {
  const v = await viewer();
  const [campaigns, bases] = await Promise.all([listCampaigns(v.tenantId), listBases(v.tenantId)]);
  const withBasis = bases.filter((b) => b.lawful_basis);

  return (
    <>
      <PageHead
        label="Campaign Workspace"
        title="แคมเปญขาย"
        lead="หนึ่งแคมเปญ = หนึ่งข้อเสนอ หนึ่งวัตถุประสงค์ หนึ่งช่องทาง · รายชื่อมาจากเกณฑ์ที่อ่านได้ และทุกคนผ่านการตรวจนโยบายพร้อมเหตุผลก่อนมอบหมาย"
        actions={<>
          <Link href="/app/sales/weekly" className="c-btn c-btn-ghost">ทบทวนรายสัปดาห์</Link>
          <Link href="/app/sales/purposes" className="c-btn c-btn-ghost">วัตถุประสงค์และฐาน</Link>
        </>}
      />

      <Panel className="mb-6 p-5 md:p-6">
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
          <p className="c-thai mt-4 text-[0.88rem] text-[var(--c-text-3)]">ยังไม่มีแคมเปญ</p>
        )}
      </Panel>

      <Panel className="p-5 md:p-6">
        <h2 className="c-h2 text-[var(--c-text)]">สร้างแคมเปญ</h2>
        {!withBasis.length && (
          <p className="c-thai mt-3 text-[0.86rem] text-[var(--c-warn)]">
            ยังไม่มีวัตถุประสงค์ที่มีฐานการประมวลผล — สร้างแคมเปญได้ แต่ทุกคนจะเป็น “ต้องตรวจก่อน” จนกว่าจะ
            <Link href="/app/sales/purposes" className="underline"> ตั้งฐานของวัตถุประสงค์</Link>
          </p>
        )}
        <ActionForm action={createCampaignAction} label="สร้างแคมเปญ" pendingLabel="กำลังสร้าง…" variant="primary" className="mt-4 grid gap-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className={LABEL}>ชื่อแคมเปญ<input name="name" className="c-input" placeholder="เช่น ขายสปอนเซอร์ Sunline Energy Week 2027 (สมมุติ)" required /></label>
            <label className={LABEL}>ข้อเสนอ<input name="offer" className="c-input" placeholder="เช่น แพ็กเกจ Gold · บูธ 18 ตร.ม." /></label>
            <label className={LABEL}>วัตถุประสงค์ (ฐานการประมวลผล)
              <select name="purposeId" className="c-select" required defaultValue="">
                <option value="" disabled>เลือก</option>
                {bases.map((b) => (
                  <option key={b.purpose_id} value={b.purpose_id}>
                    {b.name} — {b.lawful_basis ? LAWFUL_BASIS_TH[b.lawful_basis as LawfulBasis].split(" (")[0] : "ยังไม่มีฐาน"}
                  </option>
                ))}
              </select>
            </label>
            <label className={LABEL}>ส่งรายชื่อให้บุคคลอื่นด้วยไหม (เช่น ให้สปอนเซอร์)
              <select name="disclosurePurposeId" className="c-select" defaultValue="">
                <option value="">ไม่ส่ง — ทีมเราติดต่อเอง</option>
                {bases.map((b) => <option key={b.purpose_id} value={b.purpose_id}>ส่ง — ต้องมีความยินยอม “{b.name}”</option>)}
              </select>
            </label>
            <label className={LABEL}>ช่องทาง
              <select name="channel" className="c-select" defaultValue="email">
                {CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_TH[c]}</option>)}
              </select>
            </label>
            <label className={LABEL}>ชนิดข้อความ
              <select name="messageKind" className="c-select" defaultValue="marketing">
                {MESSAGE_KINDS.map((m) => <option key={m} value={m}>{MESSAGE_KIND_TH[m]}</option>)}
              </select>
            </label>
            <label className={LABEL}>เริ่ม<input type="date" name="startsAt" className="c-input" /></label>
            <label className={LABEL}>สิ้นสุด<input type="date" name="endsAt" className="c-input" /></label>
          </div>
          <fieldset className="grid gap-3">
            <legend className="c-thai mb-2 text-[0.86rem] text-[var(--c-text-2)]">เกณฑ์เป้าหมาย (เว้นว่าง = ทุกคนที่ยังสังกัดบริษัท)</legend>
            <CriteriaFields />
          </fieldset>
        </ActionForm>
      </Panel>
    </>
  );
}
