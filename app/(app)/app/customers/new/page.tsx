import Link from "next/link";
import { activeTenantId } from "@/app/(app)/tenant";
import { profileFor } from "@/lib/shared/tenants";
import { CONTACT_KIND_LABEL } from "@/lib/shared/contact-kinds";
import { FIELD_LABEL } from "@/lib/shared/ingest-types";
import { Panel } from "@/components/console/ui";
import { ActionForm } from "@/components/console/action-form";
import { createCustomerAction } from "../../../customers-actions";

export const dynamic = "force-dynamic";

/* ── เพิ่มลูกค้าทีละคน ───────────────────────────────────────────

   ช่องที่ขึ้นก่อนคือช่องที่ใช้บอกว่าเป็นใคร (เบอร์ อีเมล LINE รหัสสมาชิก)
   เพราะต้องมีอย่างน้อยหนึ่งช่อง — ระบบใช้ค่านี้รู้ว่าแถวในไฟล์ที่นำเข้าทีหลัง
   คือคนเดียวกัน ช่องที่เหลือพับไว้ คนที่แค่จดเบอร์ลูกค้าหน้าร้านกรอกสองช่องจบ */

const LABEL = "c-thai flex min-w-0 flex-col gap-1 text-[0.82rem] text-[var(--c-text-3)]";

const MAIN: { kind: string; type: string; placeholder: string }[] = [
  { kind: "phone", type: "tel", placeholder: "081 234 5678" },
  { kind: "email", type: "email", placeholder: "name@example.com" },
  { kind: "line", type: "text", placeholder: "LINE ID" },
  { kind: "member_no", type: "text", placeholder: "รหัสในระบบของร้าน" },
];

const MORE_CONTACTS = ["facebook", "instagram", "tiktok", "website", "address"];

const PROFILE: { name: keyof typeof FIELD_LABEL; type?: string }[] = [
  { name: "first_name" }, { name: "last_name" }, { name: "nickname" },
  { name: "birthday", type: "date" }, { name: "company" }, { name: "job_title" },
  { name: "subdistrict" }, { name: "district" }, { name: "province" }, { name: "postcode" },
];

export default async function NewCustomerPage() {
  const tenantId = await activeTenantId();
  const v = profileFor(tenantId).vocab.th;

  return (
    <>
      <Link href="/app/customers" className="c-thai text-[0.85rem] text-[var(--c-text-3)] hover:text-[var(--c-text)]">
        ← {v.people}ทั้งหมด
      </Link>
      <header className="mt-4 mb-6">
        <h1 className="c-h1 text-[var(--c-text)]">เพิ่ม{v.person}</h1>
        <p className="c-thai mt-2 max-w-2xl text-[0.9rem] text-[var(--c-text-3)]">
          ใส่ชื่อกับช่องทางติดต่ออย่างน้อยหนึ่งช่องก็พอ ที่เหลือเติมทีหลังได้ในหน้าของเขา
        </p>
      </header>

      <Panel className="max-w-3xl p-5 md:p-6">
        <ActionForm
          action={createCustomerAction}
          fields={{ tenantId }}
          label={`เพิ่ม${v.person}`}
          pendingLabel="กำลังบันทึก…"
          variant="primary"
          className="flex flex-col gap-5"
        >
          <label className={LABEL}>
            ชื่อ
            <input name="name" className="c-input" placeholder="ชื่อ-นามสกุล หรือชื่อที่ร้านเรียก" autoFocus />
          </label>

          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="c-thai mb-2 text-[0.86rem] text-[var(--c-text-2)]">
              ช่องทางติดต่อ — อย่างน้อยหนึ่งช่อง
            </legend>
            {MAIN.map((f) => (
              <label key={f.kind} className={LABEL}>
                {CONTACT_KIND_LABEL[f.kind]}
                <input
                  name={`contact_${f.kind}`}
                  type={f.type}
                  placeholder={f.placeholder}
                  className="c-input"
                  autoComplete="off"
                />
              </label>
            ))}
          </fieldset>

          <label className="c-thai flex items-start gap-2.5 text-[0.86rem] text-[var(--c-text-2)]">
            <input type="checkbox" name="consent" value="1" className="mt-1" />
            <span>
              ลูกค้าให้ความยินยอมรับข่าวสารจากร้านแล้ว
              <span className="block text-[0.78rem] text-[var(--c-text-4)]">
                ไม่ติ๊ก = ระบบจะไม่ส่งข้อความหาคนนี้ จนกว่าจะบันทึกความยินยอม
              </span>
            </span>
          </label>

          <details>
            <summary className="c-thai cursor-pointer text-[0.86rem] text-[var(--c-accent)]">
              ข้อมูลเพิ่มเติม (ไม่บังคับ)
            </summary>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {MORE_CONTACTS.map((k) => (
                <label key={k} className={LABEL}>
                  {CONTACT_KIND_LABEL[k]}
                  <input name={`contact_${k}`} className="c-input" autoComplete="off" />
                </label>
              ))}
              {PROFILE.map((f) => (
                <label key={f.name} className={LABEL}>
                  {FIELD_LABEL[f.name]}
                  <input name={f.name} type={f.type ?? "text"} className="c-input" />
                </label>
              ))}
              <label className={LABEL}>
                {FIELD_LABEL.gender}
                <select name="gender" className="c-select" defaultValue="">
                  <option value="">ไม่ระบุ</option>
                  <option value="female">หญิง</option>
                  <option value="male">ชาย</option>
                  <option value="other">อื่น ๆ</option>
                </select>
              </label>
              <label className={`${LABEL} sm:col-span-2`}>
                {FIELD_LABEL.note}
                <textarea name="note" rows={3} className="c-input" />
              </label>
            </div>
          </details>
        </ActionForm>
      </Panel>
    </>
  );
}
