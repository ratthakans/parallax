import Link from "next/link";
import { activeTenantId } from "@/app/(app)/tenant";
import { profileFor } from "@/lib/shared/tenants";
import { CONTACT_KIND_LABEL } from "@/lib/shared/contact-kinds";
import { FIELD_LABEL } from "@/lib/shared/ingest-types";
import { Panel } from "@/components/console/ui";
import { ActionForm } from "@/components/console/action-form";
import { createCustomerAction } from "../../../customers-actions";
import { OrgPicker } from "@/components/console/org-picker";
import { isB2BTenant } from "@/lib/shared/tenants";
import { viewer } from "@/app/(app)/viewer";
import { listAccounts } from "@/lib/engine/accounts";

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

export default async function NewCustomerPage({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  const tenantId = await activeTenantId();
  if (isB2BTenant(tenantId)) return <NewContactB2B org={(await searchParams).org} />;
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

/* ── ผู้ติดต่อ B2B (docs/crm-plan.md C0 ข้อ 3) ──
   คนขายกรอก: ชื่อ · บริษัท · ตำแหน่ง · อีเมล · เบอร์ — บริษัทกลายเป็นสังกัดจริง (affiliateManual)
   ไม่มีช่องยินยอมรับข่าวสาร: บัญชี B2B ตัดสินว่าติดต่อได้ไหมจากวัตถุประสงค์และฐานการประมวลผล (บริการนโยบาย) */
async function NewContactB2B({ org }: { org?: string }) {
  const v = await viewer();
  const { rows } = await listAccounts(v.tenantId, { sort: "name", limit: 1000, viewer: { id: v.actor, clearance: v.clearance } });
  const pre = rows.find((r) => r.id === org);
  return (
    <>
      <Link href={pre ? `/app/accounts/${pre.id}` : "/app/customers"} className="c-thai text-[0.85rem] text-[var(--c-text-3)] hover:text-[var(--c-text)]">
        ← {pre ? pre.name : "ผู้ติดต่อทั้งหมด"}
      </Link>
      <header className="mt-4 mb-6">
        <h1 className="c-h1 text-[var(--c-text)]">เพิ่มผู้ติดต่อ</h1>
        <p className="c-thai mt-2 max-w-2xl text-[0.9rem] text-[var(--c-text-3)]">
          ชื่อ บริษัท และอีเมลหรือเบอร์อย่างน้อยหนึ่งช่อง — บริษัทที่ยังไม่มีในระบบจะถูกสร้างให้
        </p>
      </header>
      <Panel className="max-w-3xl p-5 md:p-6">
        <ActionForm
          action={createCustomerAction}
          fields={{ tenantId: v.tenantId, ...(pre ? { prefillOrgId: pre.id, prefillOrgName: pre.name } : {}) }}
          label="เพิ่มผู้ติดต่อ"
          pendingLabel="กำลังบันทึก…"
          variant="primary"
          className="grid gap-4 sm:grid-cols-2"
        >
          <label className={`${LABEL} sm:col-span-2`}>ชื่อ-นามสกุล *
            <input name="name" className="c-input" required autoFocus />
          </label>
          <label className={LABEL}>บริษัท
            <OrgPicker id="contact-org" name="company" names={rows.map((r) => r.name)} defaultValue={pre?.name} placeholder="พิมพ์ชื่อบริษัท — ไม่มีในรายการ = สร้างใหม่" />
          </label>
          <label className={LABEL}>ตำแหน่ง
            <input name="job_title" className="c-input" placeholder="เช่น ผู้จัดการฝ่ายการตลาด" />
          </label>
          <label className={LABEL}>{CONTACT_KIND_LABEL.email}
            <input name="contact_email" type="email" className="c-input" placeholder="name@company.co.th" autoComplete="off" />
          </label>
          <label className={LABEL}>{CONTACT_KIND_LABEL.phone}
            <input name="contact_phone" type="tel" className="c-input" placeholder="081 234 5678" autoComplete="off" />
          </label>
          <label className="c-thai flex items-start gap-2 text-[0.8rem] text-[var(--c-text-3)] sm:col-span-2">
            <input type="checkbox" name="confirmDup" value="1" className="mt-0.5" />
            <span>ตรวจแล้ว ไม่ใช่รายเดิม (ใช้เมื่อระบบเตือนว่าคนหรือบริษัทนี้อาจมีอยู่แล้ว)</span>
          </label>
          <details className="sm:col-span-2">
            <summary className="c-thai cursor-pointer text-[0.86rem] text-[var(--c-accent)]">ข้อมูลเพิ่มเติม (ไม่บังคับ)</summary>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className={LABEL}>{CONTACT_KIND_LABEL.line}<input name="contact_line" className="c-input" autoComplete="off" /></label>
              <label className={LABEL}>{CONTACT_KIND_LABEL.website}<input name="contact_website" className="c-input" autoComplete="off" /></label>
              <label className={LABEL}>{FIELD_LABEL.first_name}<input name="first_name" className="c-input" /></label>
              <label className={LABEL}>{FIELD_LABEL.last_name}<input name="last_name" className="c-input" /></label>
              <label className={`${LABEL} sm:col-span-2`}>{FIELD_LABEL.note}<textarea name="note" rows={3} className="c-input" /></label>
            </div>
          </details>
        </ActionForm>
      </Panel>
    </>
  );
}
