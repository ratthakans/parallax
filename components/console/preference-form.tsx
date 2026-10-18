import { recordPreferenceAction } from "@/app/(app)/sales-actions";
import { CHANNELS, CHANNEL_TH } from "@/lib/shared/policy";
import { PREFERENCE_KINDS, PREFERENCE_TH } from "@/lib/shared/vault";
import { ActionForm } from "@/components/console/action-form";

/* ── บันทึกความต้องการของเจ้าของข้อมูล (ยินยอม · ถอน · คัดค้าน · ขอจำกัด) ──
   ใช้ทั้งหน้าแคมเปญและหน้าผู้ติดต่อ — คนที่โทรมาขอหยุดต้องบันทึกได้แม้ไม่อยู่ในแคมเปญใด (docs/qa-plan.md BUG-18)
   บันทึกแบบเพิ่มอย่างเดียวพร้อมหลักฐาน · ระบบยกเลิกเป้าหมายแคมเปญและงานที่ค้างตามนโยบายให้เอง */

const LABEL = "c-thai flex min-w-0 flex-col gap-1 text-[0.78rem] text-[var(--c-text-3)]";

export function PreferenceForm({ customerId, back, purposes }: { customerId: string; back: string; purposes: { id: string; name: string }[] }) {
  return (
    <ActionForm action={recordPreferenceAction} fields={{ customerId, back }} label="บันทึกความต้องการของเจ้าของข้อมูล" pendingLabel="กำลังบันทึก…" size="sm"
      className="grid gap-2 sm:grid-cols-3">
      <label className={LABEL}>ชนิด
        <select name="kind" className="c-select" defaultValue="objection">
          {PREFERENCE_KINDS.map((k) => <option key={k} value={k}>{PREFERENCE_TH[k]}</option>)}
        </select>
      </label>
      <label className={LABEL}>วัตถุประสงค์
        <select name="purposeId" className="c-select" defaultValue="">
          <option value="">ทุกวัตถุประสงค์ (คัดค้าน/ถอน/จำกัด)</option>
          {purposes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <label className={LABEL}>ช่องทาง
        <select name="channel" className="c-select" defaultValue="any">
          <option value="any">ทุกช่องทาง</option>
          {CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_TH[c]}</option>)}
        </select>
      </label>
      <label className={`${LABEL} sm:col-span-3`}>หลักฐาน — รับแจ้งทางไหน เมื่อไร<input name="evidence" className="c-input" placeholder="เช่น โทรมาแจ้งว่าไม่ต้องการรับข้อเสนอ 3 พ.ย." required /></label>
    </ActionForm>
  );
}
