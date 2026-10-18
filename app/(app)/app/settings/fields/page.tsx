import Link from "next/link";
import { viewer } from "@/app/(app)/viewer";
import { archiveFieldAction, createFieldAction } from "@/app/(app)/field-actions";
import { FIELD_ENTITIES, FIELD_ENTITY_TH, FIELD_KINDS, FIELD_KIND_TH, listFields } from "@/lib/engine/custom-fields";
import { can } from "@/lib/shared/roles";
import { ActionForm } from "@/components/console/action-form";
import { PageHead, Panel } from "@/components/console/ui";

export const metadata = { title: "ฟิลด์ของบัญชี" };
export const dynamic = "force-dynamic";

/* ── ฟิลด์ของบัญชี (docs/crm-plan.md C4) ── มิติที่บัญชีกำหนดเองบนบริษัทและดีล
   ไม่มีบนตัวคน (ตั้งใจ — ข้อมูลส่วนบุคคลต้องผ่านวัตถุประสงค์และอายุข้อมูล) · ซ่อนได้ ไม่ลบ */

const LABEL = "c-thai flex min-w-0 flex-col gap-1 text-[0.8rem] text-[var(--c-text-3)]";

export default async function FieldsPage() {
  const v = await viewer();
  const fields = await listFields(v.tenantId, undefined, true);
  const manage = can(v.role, "fields");

  return (
    <>
      <Link href="/app/settings" className="c-thai text-[0.8rem] text-[var(--c-text-3)] hover:text-[var(--c-accent)]">← ตั้งค่า</Link>
      <PageHead label="ตั้งค่า" title="ฟิลด์ของบัญชี" lead="เพิ่มมิติที่ทีมคุณใช้จริงบนบริษัทและดีล — กรอกได้ในหน้าระเบียน กรองได้ในรายการ" />
      <div className="grid gap-5 lg:grid-cols-2">
        {FIELD_ENTITIES.map((e) => {
          const list = fields.filter((f) => f.entity === e);
          return (
            <Panel key={e} className="p-5">
              <h2 className="c-h2 text-[var(--c-text)]">บน{FIELD_ENTITY_TH[e]}</h2>
              {list.length ? (
                <ul className="mt-3 divide-y divide-[var(--c-line)]">
                  {list.map((f) => (
                    <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                      <span className="c-thai min-w-0">
                        <span className={f.archived ? "text-[var(--c-text-4)] line-through" : "text-[var(--c-text)]"}>{f.label}</span>
                        <span className="c-pill ml-2">{FIELD_KIND_TH[f.kind]}</span>
                        {f.kind === "choice" && <span className="block text-[0.76rem] text-[var(--c-text-4)]">{f.options.join(" · ")}</span>}
                      </span>
                      {manage && (
                        <ActionForm action={archiveFieldAction} fields={{ fieldId: f.id, archived: f.archived ? "0" : "1" }} size="sm" variant="ghost"
                          label={f.archived ? "เปิดใช้" : "ซ่อน"} pendingLabel="…" />
                      )}
                    </li>
                  ))}
                </ul>
              ) : <p className="c-thai mt-3 text-[0.86rem] text-[var(--c-text-3)]">ยังไม่มีฟิลด์บน{FIELD_ENTITY_TH[e]}</p>}
            </Panel>
          );
        })}
      </div>
      {manage ? (
        <Panel className="mt-5 max-w-2xl p-5">
          <h2 className="c-h2 text-[var(--c-text)]">เพิ่มฟิลด์</h2>
          <ActionForm action={createFieldAction} label="เพิ่มฟิลด์" pendingLabel="กำลังบันทึก…" variant="primary" className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className={LABEL}>อยู่บน
              <select name="entity" className="c-select" defaultValue="org">
                {FIELD_ENTITIES.map((e) => <option key={e} value={e}>{FIELD_ENTITY_TH[e]}</option>)}
              </select>
            </label>
            <label className={LABEL}>ชื่อฟิลด์<input name="label" className="c-input" placeholder="เช่น ขนาดบูธ" required maxLength={60} /></label>
            <label className={LABEL}>ชนิด
              <select name="kind" className="c-select" defaultValue="text">
                {FIELD_KINDS.map((k) => <option key={k} value={k}>{FIELD_KIND_TH[k]}</option>)}
              </select>
            </label>
            <label className={`${LABEL} sm:col-span-3`}>ตัวเลือก (เฉพาะชนิดตัวเลือก · คั่นด้วยจุลภาค)
              <input name="options" className="c-input" placeholder="เช่น Platinum, Gold, Silver" />
            </label>
          </ActionForm>
        </Panel>
      ) : (
        <p className="c-thai mt-5 text-[0.84rem] text-[var(--c-text-3)]">เพิ่มหรือซ่อนฟิลด์ได้เฉพาะ Data steward หัวหน้าทีม หรือเจ้าของบัญชี</p>
      )}
    </>
  );
}
