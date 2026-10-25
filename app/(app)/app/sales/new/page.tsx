import Link from "next/link";
import { viewer } from "@/app/(app)/viewer";
import { activeMode } from "@/app/(app)/tenant";
import { hasB2B } from "@/lib/shared/tenants";
import { createCampaignAction } from "@/app/(app)/sales-actions";
import { listBases } from "@/lib/engine/policy";
import { CHANNELS, CHANNEL_TH, LAWFUL_BASIS_TH, MESSAGE_KINDS, MESSAGE_KIND_TH, type LawfulBasis } from "@/lib/shared/policy";
import { ActionForm } from "@/components/console/action-form";
import { PageHead, Panel } from "@/components/console/ui";
import { CriteriaFields } from "../criteria-fields";

export const metadata = { title: "สร้างแคมเปญ" };
export const dynamic = "force-dynamic";

/* ── สร้างแคมเปญ (แผน H S6) ──
   เดิมฟอร์มนี้ต่อท้ายตารางแคมเปญในหน้าเดียวกัน — หน้ารายการยาวเกินและปุ่ม "+ ใหม่" ต้องเลื่อนหา
   สร้างเสร็จ action พาไปหน้าแคมเปญ (สร้างรายชื่อต่อที่นั่น) */

const LABEL = "c-thai flex min-w-0 flex-col gap-1 text-[0.8rem] text-[var(--c-text-3)]";

export default async function NewCampaignPage() {
  const v = await viewer();
  const bases = await listBases(v.tenantId);
  const withBasis = bases.filter((b) => b.lawful_basis);
  const mode = await activeMode();

  return (
    <>
      <PageHead label="แคมเปญ" title="สร้างแคมเปญ" lead="ตั้งข้อเสนอและเกณฑ์ — สร้างแล้วระบบหารายชื่อที่ติดต่อได้ให้"
        actions={<Link href="/app/sales" className="c-btn c-btn-ghost">← แคมเปญทั้งหมด</Link>} />
      <Panel className="max-w-4xl p-5 md:p-6">
        {!withBasis.length && (
          <p className="c-thai mb-4 text-[0.86rem] text-[var(--c-warn)]">
            ยังไม่มีวัตถุประสงค์ที่มีฐานการประมวลผล — สร้างแคมเปญได้ แต่ทุกคนจะเป็น “ต้องตรวจก่อน” จนกว่าจะ
            <Link href="/app/sales/purposes" className="underline"> ตั้งฐานของวัตถุประสงค์</Link>
          </p>
        )}
        <ActionForm action={createCampaignAction} label="สร้างแคมเปญ" pendingLabel="กำลังสร้าง…" variant="primary" className="grid gap-5">
          <div className="grid gap-3 md:grid-cols-2">
            <label className={LABEL}>ชื่อแคมเปญ<input name="name" className="c-input" placeholder="เช่น ขายสปอนเซอร์ Sunline Energy Week 2027 (สมมุติ)" required /></label>
            <label className={LABEL}>ข้อเสนอ<input name="offer" className="c-input" placeholder="เช่น แพ็กเกจ Gold · บูธ 18 ตร.ม." /></label>
            <label className={LABEL}>ใช้ข้อมูลเพื่อ (วัตถุประสงค์)
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
            <legend className="c-thai mb-2 text-[0.86rem] text-[var(--c-text-2)]">เกณฑ์เป้าหมาย (เว้นว่าง = {hasB2B(mode) ? "ทุกคนในกลุ่มที่เลือก" : "ลูกค้าบุคคลทุกคน"})</legend>
            <CriteriaFields mode={mode} />
          </fieldset>
        </ActionForm>
      </Panel>
    </>
  );
}
