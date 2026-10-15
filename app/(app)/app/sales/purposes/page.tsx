import Link from "next/link";
import { viewer } from "@/app/(app)/viewer";
import { adoptTemplateAction, setBasisAction } from "@/app/(app)/sales-actions";
import { listBases, RULES_VERSION } from "@/lib/engine/policy";
import { listTemplates } from "@/lib/engine/policy/templates";
import { CHANNEL_TH, LAWFUL_BASES, LAWFUL_BASIS_TH, type LawfulBasis } from "@/lib/shared/policy";
import { thaiDateTime } from "@/lib/shared/format";
import { ActionForm } from "@/components/console/action-form";
import { PageHead, Panel } from "@/components/console/ui";

export const dynamic = "force-dynamic";

/* ── วัตถุประสงค์และฐานการประมวลผล (docs/plan.md หัวข้อ 6 · ROPA เต็มใน B6) ─────
   ฐานเก็บเป็นรุ่น ไม่เขียนทับ — ผลตัดสินนโยบายทุกครั้งอ้างรุ่นที่ใช้ · เปลี่ยนฐานไม่ล้างการถอนหรือคัดค้านที่มีอยู่
   การเลือกฐานเป็นการตัดสินทางกฎหมายของผู้ควบคุมข้อมูล (DPO/นักกฎหมาย — plan O3) ระบบไม่เดาให้ */

const LABEL = "c-thai flex min-w-0 flex-col gap-1 text-[0.8rem] text-[var(--c-text-3)]";

export default async function PurposesPage() {
  const v = await viewer();
  const [bases, templates] = await Promise.all([listBases(v.tenantId), listTemplates(v.tenantId)]);
  const KIND_TH: Record<string, string> = { service: "ข้อความบริการ", marketing: "ข้อเสนอ/การตลาด", consent_request: "ขอความยินยอม" };
  return (
    <>
      <Link href="/app/sales" className="c-thai inline-block py-2 text-[0.85rem] text-[var(--c-text-3)] hover:text-[var(--c-text)]">← แคมเปญขาย</Link>
      <PageHead
        label="Campaign Workspace"
        title="วัตถุประสงค์และฐาน"
        lead="แต่ละวัตถุประสงค์ต้องมีฐานการประมวลผลที่ผู้ควบคุมข้อมูลอนุมัติ ก่อนใครในรายชื่อจะ “ใช้ได้ตามนโยบาย” · ฐานเก็บเป็นรุ่น และการเปลี่ยนฐานไม่ล้างการถอนหรือคัดค้านที่มีอยู่"
      />
      {/* ── เริ่มจากแม่แบบ (docs/solo-plan.md S4) ── */}
      <Panel className="mb-6 p-5 md:p-6">
        <h2 className="c-h2 text-[var(--c-text)]">เริ่มจากแม่แบบ</h2>
        <p className="c-thai mt-1 text-[0.82rem] text-[var(--c-text-3)]">
          แม่แบบตั้งฐาน ช่องทาง ชนิดข้อความ และอายุข้อมูลให้ — แก้เป็นรุ่นใหม่ได้ภายหลัง · แม่แบบเป็นจุดเริ่มต้น ไม่ใช่คำแนะนำทางกฎหมายสำหรับกรณีของคุณ
        </p>
        <ul className="mt-4 grid gap-0">
          {templates.map((t) => (
            <li key={t.code} className="border-t border-[var(--c-line)] py-4 first:border-t-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="c-thai text-[0.94rem] text-[var(--c-text)]">
                  {t.name}
                  {t.draft && <span className="c-pill c-pill-warn ml-2">ร่าง — รอนักกฎหมายตรวจ</span>}
                  {t.adopted && <span className="c-pill c-pill-good ml-2">ใช้อยู่ (รุ่น {t.adopted.version})</span>}
                  {t.newer && <span className="c-pill ml-2">มีรุ่นใหม่ {t.version}</span>}
                </p>
                <p className="c-thai text-[0.78rem] text-[var(--c-text-3)]">{LAWFUL_BASIS_TH[t.lawfulBasis].split(" (")[0]}</p>
              </div>
              <p className="c-thai mt-1 text-[0.82rem] text-[var(--c-text-3)]">{t.description}</p>
              <p className="c-thai mt-1 text-[0.78rem] text-[var(--c-text-4)]">
                ช่องทาง {t.channels.map((c) => CHANNEL_TH[c]).join(" · ")} · {t.messageKinds.map((k) => KIND_TH[k] ?? k).join(" · ")} · เก็บ {t.retention.note}
                {t.employerScoped ? " · ผูกกับบริษัท: ย้ายบริษัทแล้วต้องมีหลักฐานใหม่" : ""}
              </p>
              {!t.adopted && v.role === "owner" && (
                <details className="mt-2">
                  <summary className="c-btn c-btn-ghost c-btn-sm inline-flex cursor-pointer">ใช้แม่แบบนี้</summary>
                  <ActionForm action={adoptTemplateAction} fields={{ code: t.code }} label="สร้างวัตถุประสงค์" pendingLabel="กำลังสร้าง…" size="sm" className="mt-3 grid gap-3">
                    {t.lia && <p className="c-thai text-[0.78rem] text-[var(--c-text-3)]">{t.lia}</p>}
                    <label className={LABEL}>ยืนยันข้อเท็จจริง: {t.mustConfirm}
                      <input name="confirmation" className="c-input" placeholder="เขียนสั้น ๆ ว่าจริงอย่างไร เช่น ลูกค้าในไฟล์ซื้อบริการปี 2567–2568" required />
                    </label>
                  </ActionForm>
                </details>
              )}
            </li>
          ))}
        </ul>
        {v.role !== "owner" && <p className="c-thai mt-3 text-[0.78rem] text-[var(--c-text-4)]">เฉพาะเจ้าของบัญชีที่เลือกแม่แบบได้</p>}
      </Panel>

      <p className="c-thai mb-4 text-[0.78rem] text-[var(--c-text-4)]">กติกานโยบายรุ่น <span className="c-mono">{RULES_VERSION}</span> · วัตถุประสงค์ใหม่สร้างได้ตอนลงทะเบียนแหล่งข้อมูล</p>
      {bases.length ? (
        <div className="grid gap-4">
          {bases.map((b) => (
            <Panel key={b.purpose_id} className="p-5 md:p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="c-h2 text-[var(--c-text)]">{b.name}</h2>
                <p className="c-thai text-[0.82rem] text-[var(--c-text-3)]">
                  {b.lawful_basis
                    ? <>ฐาน: {LAWFUL_BASIS_TH[b.lawful_basis as LawfulBasis].split(" (")[0]} · รุ่น {b.version}{b.lia_ref ? ` · LIA ${b.lia_ref}` : ""} · อนุมัติโดย {b.approved_by} {thaiDateTime(b.effective_from)}</>
                    : <span className="text-[var(--c-warn)]">ยังไม่มีฐาน — ทุกคนในแคมเปญของวัตถุประสงค์นี้เป็น “ต้องตรวจก่อน”</span>}
                </p>
              </div>
              <details className="mt-3">
                <summary className="c-btn c-btn-ghost c-btn-sm inline-flex cursor-pointer">{b.lawful_basis ? "ตั้งฐานรุ่นใหม่" : "ตั้งฐาน"}</summary>
                <ActionForm action={setBasisAction} fields={{ purposeId: b.purpose_id }} label="บันทึกฐาน" pendingLabel="กำลังบันทึก…" size="sm" className="mt-3 grid gap-3 md:grid-cols-3">
                  <label className={LABEL}>ฐานการประมวลผล
                    <select name="lawfulBasis" className="c-select" defaultValue={b.lawful_basis ?? ""} required>
                      <option value="" disabled>เลือก</option>
                      {LAWFUL_BASES.map((x) => <option key={x} value={x}>{LAWFUL_BASIS_TH[x]}</option>)}
                    </select>
                  </label>
                  <label className={LABEL}>อ้างอิงผลประเมิน LIA (ฐานประโยชน์โดยชอบ)<input name="liaRef" defaultValue={b.lia_ref ?? ""} className="c-input" placeholder="เช่น LIA-2026-01" /></label>
                  <label className={LABEL}>ขอบเขตข้อมูล<input name="dataScope" className="c-input" placeholder="เช่น ชื่อ ตำแหน่ง อีเมลบริษัท" /></label>
                </ActionForm>
              </details>
            </Panel>
          ))}
        </div>
      ) : (
        <Panel className="p-5 md:p-6"><p className="c-thai text-[0.88rem] text-[var(--c-text-3)]">ยังไม่มีวัตถุประสงค์ — สร้างตอน<Link href="/app/vault/sources/new" className="underline">ลงทะเบียนแหล่งข้อมูล</Link></p></Panel>
      )}
    </>
  );
}
