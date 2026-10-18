import { setCustomerModeAction } from "@/app/(app)/account-actions";
import { ActionForm } from "@/components/console/action-form";
import { Panel } from "@/components/console/ui";
import { CUSTOMER_MODES, CUSTOMER_MODE_TH, type CustomerMode } from "@/lib/shared/tenants";

/* ── ลูกค้าของบัญชีนี้ (docs/crm-plan.md F1) ── เปลี่ยนแค่หน้าจอ ไม่ลบหรือซ่อนข้อมูลที่มีอยู่ */
export function ModePanel({ mode, canEdit }: { mode: CustomerMode; canEdit: boolean }) {
  return (
    <Panel className="mb-6 p-5 md:p-6">
      <h2 className="c-h2 text-[var(--c-text)]">ลูกค้าของบัญชีนี้</h2>
      <p className="c-thai mt-1 text-[0.84rem] text-[var(--c-text-3)]">
        กำหนดว่าเมนูและฟอร์มเริ่มต้นเป็นแบบไหน — เปลี่ยนแล้วข้อมูลเดิมยังอยู่ครบ
      </p>
      {canEdit ? (
        <ActionForm action={setCustomerModeAction} label="บันทึก" pendingLabel="กำลังบันทึก…" size="sm" className="mt-4 flex flex-col gap-2">
          {CUSTOMER_MODES.map((m) => (
            <label key={m} className="c-thai flex items-start gap-2.5 text-[0.86rem]">
              <input type="radio" name="mode" value={m} defaultChecked={m === mode} className="mt-1" />
              <span><span className="font-semibold text-[var(--c-text)]">{CUSTOMER_MODE_TH[m].label}</span>
                <span className="block text-[0.78rem] text-[var(--c-text-3)]">{CUSTOMER_MODE_TH[m].lead}</span></span>
            </label>
          ))}
        </ActionForm>
      ) : (
        <p className="c-thai mt-3 text-[0.88rem] text-[var(--c-text)]">
          {CUSTOMER_MODE_TH[mode].label} <span className="text-[var(--c-text-4)]">· เปลี่ยนได้เฉพาะเจ้าของบัญชี</span>
        </p>
      )}
    </Panel>
  );
}
