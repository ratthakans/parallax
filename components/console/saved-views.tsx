import Link from "next/link";
import { deleteViewAction, saveViewAction } from "@/app/(app)/field-actions";
import type { SavedView, ViewList } from "@/lib/engine/saved-views";
import { ActionForm } from "@/components/console/action-form";

/* ── มุมมองที่บันทึกไว้ (docs/crm-plan.md C5) ── ชิปลิงก์ + บันทึกมุมมองปัจจุบัน
   ลิงก์คือ query string ธรรมดา — หน้ารายการตีความและตรวจสิทธิ์เองเหมือนเปิดลิงก์ทั่วไป */

export function SavedViews({ list, base, views, current, canShare }: {
  list: ViewList; base: string; views: SavedView[]; current: string; canShare: boolean;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5">
      {views.map((v) => {
        const active = v.query === current;
        return (
          <span key={v.id} className={`c-pill inline-flex items-center gap-1 ${active ? "c-pill-reach font-semibold" : ""}`}>
            <Link href={`${base}?${v.query}`} aria-current={active ? "page" : undefined}>{v.shared ? "👥 " : ""}{v.name}</Link>
            {v.mine && (
              <ActionForm action={deleteViewAction} fields={{ viewId: v.id, list }} label="×" pendingLabel="…" size="sm" variant="ghost"
                buttonClassName="min-h-0 px-1 py-0 text-[0.8rem]" confirm={`กดอีกครั้ง — ลบมุมมอง "${v.name}"`} ariaLabel={`ลบมุมมอง ${v.name}`} />
            )}
          </span>
        );
      })}
      {current && (
        <details className="relative">
          <summary className="c-pill cursor-pointer list-none">+ บันทึกมุมมองนี้</summary>
          <ActionForm action={saveViewAction} fields={{ list, query: current }} label="บันทึก" pendingLabel="กำลังบันทึก…" size="sm" closeOnSuccess
            className="c-panel absolute z-10 mt-1 grid w-72 gap-2 p-3">
            <input name="name" className="c-input" placeholder="ชื่อมุมมอง" required maxLength={60} aria-label="ชื่อมุมมอง" />
            {canShare && (
              <label className="c-thai flex items-center gap-2 text-[0.8rem] text-[var(--c-text-3)]">
                <input type="checkbox" name="shared" value="1" /> แชร์ให้ทุกคนในบัญชี
              </label>
            )}
          </ActionForm>
        </details>
      )}
    </div>
  );
}
