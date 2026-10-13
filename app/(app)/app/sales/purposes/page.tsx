import Link from "next/link";
import { viewer } from "@/app/(app)/viewer";
import { setBasisAction } from "@/app/(app)/sales-actions";
import { listBases, RULES_VERSION } from "@/lib/engine/policy";
import { LAWFUL_BASES, LAWFUL_BASIS_TH, type LawfulBasis } from "@/lib/shared/policy";
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
  const bases = await listBases(v.tenantId);
  return (
    <>
      <Link href="/app/sales" className="c-thai inline-block py-2 text-[0.85rem] text-[var(--c-text-3)] hover:text-[var(--c-text)]">← แคมเปญขาย</Link>
      <PageHead
        label="Campaign Workspace"
        title="วัตถุประสงค์และฐาน"
        lead="แต่ละวัตถุประสงค์ต้องมีฐานการประมวลผลที่ผู้ควบคุมข้อมูลอนุมัติ ก่อนใครในรายชื่อจะ “ใช้ได้ตามนโยบาย” · ฐานเก็บเป็นรุ่น และการเปลี่ยนฐานไม่ล้างการถอนหรือคัดค้านที่มีอยู่"
      />
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
