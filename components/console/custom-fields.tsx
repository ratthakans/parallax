import Link from "next/link";
import { setFieldValueAction } from "@/app/(app)/field-actions";
import { displayValue, type CustomField, type FieldEntity } from "@/lib/engine/custom-fields";
import { ActionForm } from "@/components/console/action-form";

/* ── ฟิลด์กำหนดเองบนหน้าระเบียน (docs/crm-plan.md C4) ── ค่า + แก้ทีละช่อง (แบบเดียวกับช่องอื่นของแฟ้ม) */

export function CustomFieldsPanel({ entity, recordId, fields, values }: {
  entity: FieldEntity; recordId: string; fields: CustomField[]; values: Map<string, string> | undefined;
}) {
  if (!fields.length) {
    return (
      <p className="c-thai text-[0.84rem] text-[var(--c-text-3)]">
        ยังไม่มีฟิลด์ของบัญชี — เพิ่มมิติของคุณเอง (เช่น ขนาดบูธ · tier สปอนเซอร์) ได้ที่ <Link href="/app/settings/fields" className="underline">ตั้งค่า › ฟิลด์ของบัญชี</Link>
      </p>
    );
  }
  return (
    <dl className="c-thai grid gap-3 text-[0.9rem] sm:grid-cols-2">
      {fields.map((f) => {
        const v = values?.get(f.id);
        return (
          <div key={f.id} className="min-w-0">
            <dt className="text-[0.75rem] text-[var(--c-text-4)]">{f.label}</dt>
            <dd className="break-words">{displayValue(f, v)}</dd>
            <details className="mt-1">
              <summary className="inline-block cursor-pointer text-[0.76rem] text-[var(--c-text-4)] hover:text-[var(--c-accent)]">แก้</summary>
              <ActionForm action={setFieldValueAction} fields={{ entity, recordId, fieldId: f.id }} label="บันทึก" pendingLabel="กำลังบันทึก…" size="sm"
                className="mt-1 flex flex-wrap items-end gap-2">
                {f.kind === "choice" ? (
                  <select name="value" defaultValue={v ?? ""} className="c-select max-w-[14rem]" aria-label={f.label}>
                    <option value="">— ไม่ระบุ —</option>
                    {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input name="value" type={f.kind === "date" ? "date" : "text"} inputMode={f.kind === "number" ? "decimal" : undefined}
                    defaultValue={v ?? ""} className="c-input max-w-[14rem]" aria-label={f.label} />
                )}
              </ActionForm>
            </details>
          </div>
        );
      })}
    </dl>
  );
}
