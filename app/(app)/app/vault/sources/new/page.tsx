import Link from "next/link";
import { activeTenantId } from "@/app/(app)/tenant";
import { listPurposes } from "@/lib/engine/vault/sources";
import { DEFAULT_SOURCE_FIELDS, SOURCE_KIND_TH, VAULT_FIELDS, VAULT_FIELD_TH, type SourceKind } from "@/lib/shared/vault";
import { Panel } from "@/components/console/ui";
import { ActionForm } from "@/components/console/action-form";
import { registerSourceAction } from "../../../../vault-actions";

export const dynamic = "force-dynamic";

/* ── ลงทะเบียนแหล่งข้อมูล (Blueprint บท 4 ขั้น 1) ─────────────────────

   สี่คำถามที่ต้องตอบก่อนอัปโหลด: ข้อมูลนี้คืออะไร · ใช้เพื่ออะไร · ได้มาอย่างไร (และเจ้าของข้อมูลถูกแจ้งไหม)
   · ต้องใช้ฟิลด์ไหนบ้าง — ฟิลด์ที่ไม่ได้เลือกจะไม่ถูกเก็บแม้มีอยู่ในไฟล์ */

const LABEL = "c-thai flex min-w-0 flex-col gap-1 text-[0.82rem] text-[var(--c-text-3)]";
const KINDS: SourceKind[] = ["file", "system", "namecard"];

export default async function NewSourcePage() {
  const tenantId = await activeTenantId();
  const purposes = await listPurposes(tenantId);

  return (
    <>
      <Link href="/app/vault" className="c-thai inline-block py-2 text-[0.85rem] text-[var(--c-text-3)] hover:text-[var(--c-text)]">
        ← แหล่งข้อมูลทั้งหมด
      </Link>
      <header className="mt-4 mb-6">
        <h1 className="c-h1 text-[var(--c-text)]">ลงทะเบียนแหล่งข้อมูล</h1>
        <p className="c-thai mt-2 max-w-2xl text-[0.9rem] text-[var(--c-text-3)]">
          การนำเข้าข้อมูลคือการประมวลผลข้อมูลส่วนบุคคล — บอกที่มาและวัตถุประสงค์ก่อน แล้วเลือกเฉพาะฟิลด์ที่งานนี้ต้องใช้จริง
        </p>
      </header>

      <Panel className="max-w-3xl p-5 md:p-6">
        <ActionForm
          action={registerSourceAction}
          label="ลงทะเบียนแล้วไปหน้าอัปโหลด"
          pendingLabel="กำลังบันทึก…"
          variant="primary"
          className="flex flex-col gap-5"
        >
          <label className={LABEL}>
            ชื่อแหล่งข้อมูล
            <input name="name" className="c-input" placeholder="เช่น รายชื่อผู้ลงทะเบียนงาน 2016–2025" autoFocus required />
          </label>

          <label className={LABEL}>
            ชนิด
            <select name="kind" className="c-select" defaultValue="file">
              {KINDS.map((k) => (
                <option key={k} value={k} disabled={k === "namecard"}>{SOURCE_KIND_TH[k]}</option>
              ))}
            </select>
          </label>

          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="c-thai mb-2 text-[0.86rem] text-[var(--c-text-2)]">วัตถุประสงค์ของการใช้ข้อมูลชุดนี้</legend>
            <label className={LABEL}>
              เลือกที่มีอยู่
              <select name="purposeId" className="c-select" defaultValue="">
                <option value="">— ยังไม่มี / สร้างใหม่ —</option>
                {purposes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className={LABEL}>
              หรือสร้างใหม่
              <input name="newPurpose" className="c-input" placeholder="เช่น ขายสปอนเซอร์งานปีหน้า" />
            </label>
          </fieldset>

          <label className={LABEL}>
            ได้ข้อมูลมาอย่างไร และเจ้าของข้อมูลถูกแจ้งอย่างไร
            <textarea
              name="acquisitionNote"
              rows={3}
              className="c-input"
              required
              placeholder="เช่น แบบฟอร์มลงทะเบียนเข้างานบนเว็บ มีประกาศความเป็นส่วนตัวในฟอร์ม · เก็บระหว่างปี 2016–2025"
            />
            <span className="text-[0.75rem] text-[var(--c-text-4)]">
              ใช้ยืนยันอำนาจในการนำเข้า — ข้อมูลที่ได้มาโดยไม่มีสิทธิไม่กลายเป็นข้อมูลที่ใช้ได้เพราะถูกนำเข้า
            </span>
          </label>

          <label className={LABEL}>
            ขอบเขตสิทธิ์ (ไม่บังคับ)
            <input name="scopeNote" className="c-input" placeholder="เช่น ใช้ได้เฉพาะทีมขายสปอนเซอร์ · ไม่แบ่งให้สปอนเซอร์" />
          </label>

          <fieldset>
            <legend className="c-thai mb-2 text-[0.86rem] text-[var(--c-text-2)]">ฟิลด์ที่จำเป็น — เลือกเท่าที่งานนี้ต้องใช้</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {VAULT_FIELDS.map((f) => (
                <label key={f} className="c-thai flex min-h-11 items-center gap-2.5 text-[0.86rem] text-[var(--c-text-2)]">
                  <input type="checkbox" name="fields" value={f} defaultChecked={DEFAULT_SOURCE_FIELDS.includes(f)} className="h-6 w-6 shrink-0" />
                  {VAULT_FIELD_TH[f]}
                </label>
              ))}
            </div>
            <p className="c-thai mt-3 text-[0.78rem] text-[var(--c-text-4)]">
              คอลัมน์ข้อมูลอ่อนไหว (สุขภาพ ศาสนา อาหาร การแพ้ ฯลฯ) และเลขบัตรประชาชนไม่ถูกเก็บไม่ว่าเลือกอะไร
            </p>
          </fieldset>
        </ActionForm>
      </Panel>
    </>
  );
}
