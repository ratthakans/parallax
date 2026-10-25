import Link from "next/link";
import { viewer } from "@/app/(app)/viewer";
import { undoOrgUpdateAction } from "@/app/(app)/bulk-actions";
import { TARGET_TH, listOrgUpdates } from "@/lib/engine/org-update";
import { listFields } from "@/lib/engine/custom-fields";
import { can } from "@/lib/shared/roles";
import { thaiDateTime } from "@/lib/shared/format";
import { ActionForm } from "@/components/console/action-form";
import { OrgUpdater } from "@/components/console/org-updater";
import { PageHead, Panel, num } from "@/components/console/ui";

export const metadata = { title: "อัปเดตบริษัทจากไฟล์" };
export const dynamic = "force-dynamic";

/* ── อัปเดตบริษัทจากไฟล์ (docs/crm-plan.md D2) ── เช่น ไฟล์รายชื่อบริษัทพร้อมอุตสาหกรรม · เลขนิติบุคคล · ทีม · tier
   อัปเดตบริษัทที่มีอยู่เท่านั้น · ดูความต่างก่อนยืนยัน · ย้อนได้ทั้งชุด · สิทธิ์นำเข้า (Data steward · หัวหน้าทีม · เจ้าของ) */

export default async function OrgUpdatePage() {
  const v = await viewer();
  const [fields, batches] = await Promise.all([listFields(v.tenantId, "org"), listOrgUpdates(v.tenantId)]);
  const targets = [
    ...["match_name", "match_id", "tax_id", "industry", "name_en", "primary_domain", "team", "owner"].map((k) => ({ key: k, label: TARGET_TH[k] })),
    ...fields.map((f) => ({ key: `cf.${f.id}`, label: `${f.label} (ฟิลด์ของบัญชี)` })),
    { key: "ignore", label: TARGET_TH.ignore },
  ];
  const allowed = can(v.role, "import");
  return (
    <>
      <Link href="/app/data" className="c-thai text-[0.8rem] text-[var(--c-text-3)] hover:text-[var(--c-accent)]">← สุขภาพข้อมูล</Link>
      <PageHead label="ข้อมูล" title="อัปเดตบริษัทจากไฟล์"
        lead="ไฟล์ Excel/CSV หนึ่งแถวต่อบริษัท — ดูทุกช่องที่จะเปลี่ยนก่อนยืนยัน"
        more="ระบบหาบริษัทจากเลขนิติบุคคล รหัส หรือชื่อ · ช่องว่างไม่ล้างค่าเดิม" />
      <Panel className="mb-5 max-w-4xl p-5">
        {allowed ? <OrgUpdater targets={targets} /> : <p className="c-thai text-[0.88rem] text-[var(--c-text-3)]">อัปเดตจากไฟล์ได้เฉพาะ Data steward หัวหน้าทีม หรือเจ้าของบัญชี</p>}
      </Panel>
      <Panel className="max-w-4xl p-5">
        <h2 className="c-h2 text-[var(--c-text)]">ประวัติการอัปเดตจากไฟล์</h2>
        {batches.length ? (
          <ul className="mt-3 divide-y divide-[var(--c-line)]">
            {batches.map((b) => (
              <li key={b.id} className="c-thai flex flex-wrap items-center justify-between gap-2 py-2.5 text-[0.86rem]">
                <span className="min-w-0">
                  <span className="text-[var(--c-text)]">{b.filename}</span>
                  <span className="block text-[0.76rem] text-[var(--c-text-3)]">{thaiDateTime(b.at)} · {b.by} · {num(b.rows)} แถว · เปลี่ยน {num(b.changes)} ช่อง{b.undoneAt ? ` · ย้อนแล้ว ${thaiDateTime(b.undoneAt)}` : ""}</span>
                </span>
                {!b.undoneAt && allowed && (
                  <ActionForm action={undoOrgUpdateAction} fields={{ batchId: b.id }} label="ย้อนทั้งชุด" pendingLabel="…" size="sm" variant="ghost"
                    confirm="กดอีกครั้ง — คืนค่าเดิมของทุกช่องในชุดนี้ (ช่องที่มีคนแก้ต่อแล้วจะคงไว้)" />
                )}
              </li>
            ))}
          </ul>
        ) : <p className="c-thai mt-3 text-[0.86rem] text-[var(--c-text-3)]">ยังไม่เคยอัปเดตจากไฟล์</p>}
      </Panel>
    </>
  );
}
