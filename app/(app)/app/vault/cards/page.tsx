import Link from "next/link";
import { viewer } from "@/app/(app)/viewer";
import { adoptTemplateAction } from "@/app/(app)/sales-actions";
import { CARD_TEMPLATE, cardPurpose } from "@/lib/engine/vault/cards";
import { listTemplates } from "@/lib/engine/policy/templates";
import { importBlockedReason } from "@/lib/engine/signup/gate";
import { bangkokDay } from "@/lib/shared/format";
import { can, deniedTh } from "@/lib/shared/roles";
import { ActionForm } from "@/components/console/action-form";
import { PageHead, Panel } from "@/components/console/ui";
import { CardCapture } from "@/components/console/card-capture";

export const metadata = { title: "นามบัตร" };
export const dynamic = "force-dynamic";

/* ── เพิ่มนามบัตร: ถ่าย · อัปโหลดหลายใบ · พิมพ์เอง (docs/brand-plan.md §5) ─────────────

   ต้องมีวัตถุประสงค์จากแม่แบบ "ติดต่อจากการแลกนามบัตรในงานธุรกิจ" ก่อน — ไม่มีวัตถุประสงค์ = เพิ่มไม่ได้
   เดิมหน้านี้เป็นทางตัน: บอกให้ไปหน้าวัตถุประสงค์แล้วจบ (แผน H S1) · ตอนนี้คนที่มีสิทธิ์ policy
   เปิดใช้ได้ในที่ ด้วย action และคำยืนยันข้อเท็จจริงชุดเดียวกับหน้าวัตถุประสงค์ — ด่านเท่าเดิม แค่ไม่ต้องเดินไปไกล */

const LABEL = "c-thai flex min-w-0 flex-col gap-1 text-[0.8rem] text-[var(--c-text-3)]";

export default async function CardsPage() {
  const v = await viewer();
  const [purpose, blocked] = await Promise.all([cardPurpose(v.tenantId), importBlockedReason(v.tenantId)]);
  const template = purpose ? null : (await listTemplates(v.tenantId)).find((t) => t.code === CARD_TEMPLATE);

  return (
    <>
      <PageHead label="ข้อมูล" title="เพิ่มนามบัตร"
        lead="ถ่ายหรืออัปโหลดรูปนามบัตร ตรวจช่องที่อ่านได้ แล้วบันทึกทีเดียวทั้งชุด"
        more="ระบบอ่านรูปในเครื่องของคุณ รูปไม่ถูกอัปโหลดหรือเก็บไว้ · นามบัตรที่ตรงกับคนเดิมจะไม่สร้างคนซ้ำ ที่ไม่แน่ใจจะไปรอตรวจที่หน้าตรวจข้อมูลซ้ำ"
        actions={<Link href="/app/vault" className="c-btn c-btn-ghost">นำเข้าจากไฟล์แทน</Link>} />
      <Panel className="max-w-5xl p-5 md:p-6">
        {blocked ? (
          <p className="c-thai max-w-2xl text-[0.88rem] text-[var(--c-text-3)]">{blocked}</p>
        ) : !can(v.role, "import") ? (
          <p className="c-thai max-w-2xl text-[0.88rem] text-[var(--c-text-3)]">{deniedTh("import")}</p>
        ) : purpose ? (
          <>
            <p className="c-thai mb-4 text-[0.8rem] text-[var(--c-text-4)]">ใช้ข้อมูลเพื่อ: {purpose.name}</p>
            <CardCapture today={bangkokDay()} />
          </>
        ) : can(v.role, "policy") && template ? (
          <div className="max-w-2xl">
            <h2 className="c-h2 text-[var(--c-text)]">เปิดใช้การเก็บนามบัตรก่อน</h2>
            <p className="c-thai mt-1 text-[0.86rem] text-[var(--c-text-3)]">
              ระบบต้องรู้ว่าใช้ข้อมูลนามบัตรเพื่ออะไร — ใช้แม่แบบ “{template.name}” · {template.description}
            </p>
            <ActionForm action={adoptTemplateAction} fields={{ code: template.code }} label="เปิดใช้" pendingLabel="กำลังเปิดใช้…" variant="primary" className="mt-4 grid gap-3">
              {template.lia && <p className="c-thai text-[0.78rem] text-[var(--c-text-3)]">{template.lia}</p>}
              <label className={LABEL}>ยืนยันข้อเท็จจริง: {template.mustConfirm}
                <input name="confirmation" className="c-input" placeholder="เขียนสั้น ๆ ว่าจริงอย่างไร เช่น ได้นามบัตรจากงานแสดงสินค้าที่ทีมไปออกบูธ" required />
              </label>
            </ActionForm>
            <p className="c-thai mt-3 text-[0.76rem] text-[var(--c-text-4)]">แม่แบบเป็นจุดเริ่มต้น ไม่ใช่คำแนะนำทางกฎหมายสำหรับกรณีของคุณ · แก้ได้ภายหลังที่ <Link href="/app/sales/purposes" className="underline">หน้าวัตถุประสงค์</Link></p>
          </div>
        ) : (
          <p className="c-thai max-w-2xl text-[0.88rem] text-[var(--c-text-3)]">
            ยังเพิ่มนามบัตรไม่ได้ — ขอให้เจ้าของบัญชีหรือผู้ดูแลข้อมูลส่วนบุคคลเปิดใช้การเก็บนามบัตรที่หน้านี้ก่อน (ใช้เวลาไม่ถึงนาที)
          </p>
        )}
      </Panel>
    </>
  );
}
