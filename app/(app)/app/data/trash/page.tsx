import Link from "next/link";
import { viewer } from "@/app/(app)/viewer";
import { restoreTrashAction } from "@/app/(app)/bulk-actions";
import { TRASH_DAYS, listTrash } from "@/lib/engine/trash";
import { thaiDateTime } from "@/lib/shared/format";
import { ActionForm } from "@/components/console/action-form";
import { PageHead, Panel } from "@/components/console/ui";

export const dynamic = "force-dynamic";

/* ── ถังขยะ (docs/crm-plan.md D3) ── ดีลและแฟ้มบริษัทว่างที่ถูกลบ · กู้คืนได้ภายใน 30 วัน · คนไม่อยู่ที่นี่ (ลบคน = ตามคำขอสิทธิ) */

const KIND_TH = { deal: "ดีล", org: "บริษัท" } as const;

export default async function TrashPage() {
  const v = await viewer();
  const items = await listTrash(v.tenantId);
  return (
    <>
      <Link href="/app/data" className="c-thai text-[0.8rem] text-[var(--c-text-3)] hover:text-[var(--c-accent)]">← สุขภาพข้อมูล</Link>
      <PageHead label="ข้อมูล" title="ถังขยะ" lead={`ดีลและแฟ้มบริษัทว่างที่ถูกลบ กู้คืนได้ภายใน ${TRASH_DAYS} วัน — หลังจากนั้นลบถาวร · ประวัติการเปลี่ยนแปลงยังอยู่เสมอ`} />
      <Panel className="max-w-4xl p-5">
        {items.length ? (
          <ul className="divide-y divide-[var(--c-line)]">
            {items.map((t) => (
              <li key={t.id} className="c-thai flex flex-wrap items-center justify-between gap-2 py-2.5 text-[0.88rem]">
                <span className="min-w-0">
                  <span className="c-pill mr-2">{KIND_TH[t.kind]}</span>{t.name}
                  <span className="block text-[0.76rem] text-[var(--c-text-3)]">ลบโดย {t.by} · {thaiDateTime(t.at)} · เหลือ {t.daysLeft} วัน</span>
                </span>
                <ActionForm action={restoreTrashAction} fields={{ trashId: t.id }} label="กู้คืน" pendingLabel="…" size="sm" />
              </li>
            ))}
          </ul>
        ) : <p className="c-thai text-[0.88rem] text-[var(--c-text-3)]">ถังขยะว่าง</p>}
      </Panel>
    </>
  );
}
