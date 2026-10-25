import Link from "next/link";
import { createOrgAction } from "@/app/(app)/account-actions";
import { ActionForm } from "@/components/console/action-form";
import { PageHead, Panel } from "@/components/console/ui";

export const metadata = { title: "สร้างบริษัท" };
export const dynamic = "force-dynamic";

/* ── สร้างบริษัท (docs/qa-plan.md BUG-21) ── ชื่ออย่างเดียวก็พอ · ระบบเตือนถ้าอาจมีอยู่แล้ว */

const LABEL = "c-thai flex min-w-0 flex-col gap-1 text-[0.8rem] text-[var(--c-text-3)]";

export default function NewOrgPage() {
  return (
    <>
      <Link href="/app/accounts" className="c-thai text-[0.8rem] text-[var(--c-text-3)] hover:text-[var(--c-accent)]">← บริษัททั้งหมด</Link>
      <PageHead label="บริษัท" title="สร้างบริษัท" lead="ใส่ชื่ออย่างเดียวก็พอ" more="ไฟล์ที่นำเข้าทีหลังซึ่งเขียนชื่อบริษัทแบบเดียวกันจะเติมข้อมูลให้แฟ้มนี้" />
      <Panel className="max-w-2xl p-5 md:p-6">
        <ActionForm action={createOrgAction} label="สร้างบริษัท" pendingLabel="กำลังบันทึก…" variant="primary" className="grid gap-4 sm:grid-cols-2">
          <label className={`${LABEL} sm:col-span-2`}>ชื่อบริษัท *<input name="name" className="c-input" required maxLength={200} placeholder="เช่น บริษัท ตัวอย่าง จำกัด" autoFocus /></label>
          <label className={LABEL}>อุตสาหกรรม<input name="industry" className="c-input" maxLength={120} /></label>
          <label className={LABEL}>เว็บไซต์ / โดเมน<input name="domain" className="c-input" placeholder="example.co.th" /></label>
          <label className={LABEL}>เลขนิติบุคคล (13 หลัก)<input name="taxId" inputMode="numeric" className="c-input" /></label>
          <label className="c-thai flex items-center gap-2 self-end text-[0.82rem] text-[var(--c-text-2)]"><input type="checkbox" name="mine" value="1" defaultChecked /> ฉันเป็นเจ้าของบัญชีนี้</label>
          <label className="c-thai flex items-start gap-2 text-[0.8rem] text-[var(--c-text-3)] sm:col-span-2">
            <input type="checkbox" name="confirmDup" value="1" className="mt-0.5" /> ตรวจแล้ว ไม่ใช่รายเดิม (ใช้เมื่อระบบเตือนว่าบริษัทนี้อาจมีอยู่แล้ว)
          </label>
        </ActionForm>
      </Panel>
    </>
  );
}
