import Link from "next/link";
import { viewer } from "@/app/(app)/viewer";
import { completeTaskAction } from "@/app/(app)/task-actions";
import { recordOutcomeAction } from "@/app/(app)/sales-actions";
import { OUTCOMES, TARGET_STATUS_TH } from "@/lib/shared/policy";
import { TASK_VIEWS, listTasks, type TaskView } from "@/lib/engine/tasks";
import { bangkokDay, thaiDate } from "@/lib/shared/format";
import { ActionForm } from "@/components/console/action-form";
import { PageHead, Panel, num } from "@/components/console/ui";
import { ListViews, type ListState } from "@/components/console/list-view";

export const dynamic = "force-dynamic";

/* ── งาน (docs/ux-plan.md U5) ── ทุกงานในที่เดียว
   งานของแคมเปญบันทึกผลได้ที่นี่เลย (docs/crm-plan.md C0 ข้อ 5) — ใช้ action เดียวกับหน้าแคมเปญ จึงตรวจนโยบายซ้ำเหมือนกัน */

const LABEL = "c-thai flex min-w-0 flex-col gap-1 text-[0.8rem] text-[var(--c-text-3)]";

const BASE = "/app/tasks";
const VIEWS: { key: TaskView; label: string }[] = [
  { key: "mine", label: "งานของฉัน" },
  { key: "today", label: "ครบกำหนดวันนี้" },
  { key: "overdue", label: "เลยกำหนด" },
  { key: "open", label: "ทั้งหมดที่เปิด" },
  { key: "done", label: "เสร็จแล้ว" },
];

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const sp = await searchParams;
  const v = await viewer();
  const view = (TASK_VIEWS as readonly string[]).includes(sp.view ?? "") ? (sp.view as TaskView) : "mine";
  const rows = await listTasks(v.tenantId, view, { id: v.actor, clearance: v.clearance });
  const state: ListState = { view, defaultView: "mine" };
  const today = bangkokDay();

  return (
    <>
      <PageHead label="งาน" title="งาน" />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <ListViews base={BASE} state={state} views={VIEWS} />
        <span className="c-thai text-[0.84rem] text-[var(--c-text-3)]">{num(rows.length)} งาน</span>
      </div>
      <Panel className="p-0">
        {rows.length ? (
          <ul className="divide-y divide-[var(--c-line)]">
            {rows.map((t) => {
              const late = t.status === "open" && t.due != null && t.due.slice(0, 10) < today;
              return (
                <li key={t.id} className="grid gap-2 px-5 py-3.5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                  <div className="min-w-0">
                    <p className="c-thai text-[0.92rem] text-[var(--c-text)]">{t.title}</p>
                    <p className="c-thai mt-0.5 flex flex-wrap gap-x-2 text-[0.8rem] text-[var(--c-text-3)]">
                      {t.person && (t.personId ? <Link href={`/app/customers/${t.personId}`} className="text-[var(--c-accent)] hover:underline">{t.person}</Link> : <span>{t.person}</span>)}
                      {t.org && t.orgId && <Link href={`/app/accounts/${t.orgId}`} className="hover:text-[var(--c-accent)]">{t.org}</Link>}
                      {t.campaignId && <Link href={`/app/sales/${t.campaignId}`} className="hover:text-[var(--c-accent)]">· งานแคมเปญ</Link>}
                      <span>· {t.owner ?? "ยังไม่มีผู้รับผิดชอบ"}</span>
                      {t.status === "done" && <span>· เสร็จ {thaiDate(t.doneAt)}{t.outcome ? ` — ${t.outcome}` : ""}</span>}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 md:justify-end">
                    {t.due && <span className={`c-pill ${late ? "c-pill-bad" : ""}`}>{late ? "เลยกำหนด " : "ครบ "}{thaiDate(t.due)}</span>}
                    {t.status === "open" && !t.targetId && (
                      <ActionForm action={completeTaskAction} fields={{ taskId: t.id }} label="เสร็จแล้ว" pendingLabel="กำลังบันทึก…" size="sm" />
                    )}
                  </div>
                  {t.status === "open" && t.targetId && t.campaignId && (
                    <details className="md:col-span-2">
                      <summary className="c-btn c-btn-primary c-btn-sm inline-flex cursor-pointer list-none">บันทึกผล</summary>
                      <ActionForm action={recordOutcomeAction} fields={{ campaignId: t.campaignId, targetId: t.targetId }} label="บันทึกผล"
                        pendingLabel="กำลังตรวจนโยบาย…" size="sm" className="mt-3 grid max-w-2xl gap-2 sm:grid-cols-2">
                        <label className={LABEL}>ผล
                          <select name="outcome" className="c-select" defaultValue="contacted">
                            {OUTCOMES.map((o) => <option key={o} value={o}>{TARGET_STATUS_TH[o]}</option>)}
                          </select>
                        </label>
                        <label className={LABEL}>มูลค่า (ถ้าปิดได้ · บาท)<input name="value" inputMode="numeric" className="c-input" /></label>
                        <label className={`${LABEL} sm:col-span-2`}>เกิดอะไรขึ้น<input name="note" className="c-input" required /></label>
                        <label className={LABEL}>ขั้นตอนถัดไป (ไม่บังคับ)<input name="nextStep" className="c-input" placeholder="เช่น ส่งข้อเสนอฉบับแก้" /></label>
                        <label className={LABEL}>ครบกำหนดขั้นถัดไป<input type="date" name="nextDue" className="c-input" /></label>
                      </ActionForm>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="c-thai px-5 py-5 text-[0.88rem] text-[var(--c-text-3)]">ไม่มีงานในมุมมองนี้</p>
        )}
      </Panel>
    </>
  );
}
