import Link from "next/link";
import { completeTaskAction, createTaskAction, updateTaskAction } from "@/app/(app)/task-actions";
import type { TaskRow } from "@/lib/engine/tasks";
import { bangkokDay, thaiDate } from "@/lib/shared/format";
import { ActionForm } from "@/components/console/action-form";

/* ── งานบนหน้าระเบียน (docs/crm-plan.md E1) ── สร้างงานผูกกับระเบียน · รายการงานเปิด · ปิด/เลื่อนได้ในที่เดียว */

const LABEL = "c-thai flex min-w-0 flex-col gap-1 text-[0.78rem] text-[var(--c-text-3)]";
const inDays = (n: number) => bangkokDay(new Date(Date.now() + n * 864e5));

export function NewTaskForm({ link, team, people, compact }: {
  link: { orgId?: string; dealId?: string; personId?: string };
  team: string[]; people?: { id: string; name: string }[]; compact?: boolean;
}) {
  const fields = Object.fromEntries(Object.entries(link).filter(([, v]) => v)) as Record<string, string>;
  return (
    <ActionForm action={createTaskAction} fields={fields} label="สร้างงาน" pendingLabel="กำลังบันทึก…" size="sm"
      className={`grid gap-2 ${compact ? "" : "sm:grid-cols-2"}`}>
      <label className={`${LABEL} ${compact ? "" : "sm:col-span-2"}`}>ต้องทำอะไร<input name="title" className="c-input" required maxLength={200} placeholder="เช่น ส่งใบเสนอราคา Gold" /></label>
      <label className={LABEL}>ครบกำหนด<input type="date" name="due" defaultValue={inDays(3)} className="c-input" /></label>
      <label className={LABEL}>ให้ใคร<input name="owner" list="task-team" defaultValue={team[0] ?? ""} className="c-input" autoComplete="off" /></label>
      {people && people.length > 0 && !link.personId && (
        <label className={`${LABEL} ${compact ? "" : "sm:col-span-2"}`}>กับใคร (ไม่บังคับ)
          <select name="personId" className="c-select" defaultValue="">
            <option value="">ไม่ระบุ</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      )}
      <datalist id="task-team">{team.map((m) => <option key={m} value={m} />)}</datalist>
    </ActionForm>
  );
}

export function TaskList({ tasks, link, showRecord }: { tasks: TaskRow[]; link: { orgId?: string; dealId?: string; personId?: string }; showRecord?: boolean }) {
  const today = bangkokDay();
  const fields = Object.fromEntries(Object.entries(link).filter(([, v]) => v)) as Record<string, string>;
  if (!tasks.length) return <p className="c-thai text-[0.86rem] text-[var(--c-text-3)]">ไม่มีงานเปิด</p>;
  return (
    <ul className="divide-y divide-[var(--c-line)]">
      {tasks.map((t) => {
        const late = t.due != null && t.due.slice(0, 10) < today;
        return (
          <li key={t.id} className="c-thai py-2.5 text-[0.88rem]">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <span className="min-w-0">
                <span className="text-[var(--c-text)]">{t.title}</span>
                <span className="block text-[0.76rem] text-[var(--c-text-3)]">
                  {t.owner ?? "ไม่มีผู้รับ"}{t.person && !link.personId ? ` · ${t.person}` : ""}
                  {showRecord && t.deal && t.dealId ? <> · <Link href={`/app/deals/${t.dealId}`} className="hover:text-[var(--c-accent)]">{t.deal}</Link></> : null}
                </span>
              </span>
              {t.due && <span className={`c-pill ${late ? "c-pill-bad" : ""}`}>{late ? "เลย " : "ครบ "}{thaiDate(t.due)}</span>}
            </div>
            {t.targetId ? (
              <Link href={`/app/sales/${t.campaignId}`} className="mt-1 inline-block text-[0.78rem] text-[var(--c-accent)] hover:underline">งานแคมเปญ — บันทึกผลที่หน้างานหรือแคมเปญ</Link>
            ) : (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <ActionForm action={completeTaskAction} fields={{ ...fields, taskId: t.id }} label="เสร็จแล้ว" pendingLabel="…" size="sm" />
                <details>
                  <summary className="inline-block cursor-pointer text-[0.76rem] text-[var(--c-text-4)] hover:text-[var(--c-accent)]">เลื่อน / เปลี่ยนผู้รับ</summary>
                  <ActionForm action={updateTaskAction} fields={{ ...fields, taskId: t.id }} label="บันทึก" pendingLabel="…" size="sm" className="mt-1 flex flex-wrap items-end gap-2">
                    <input type="date" name="due" defaultValue={t.due?.slice(0, 10) ?? ""} className="c-input w-40" aria-label="วันครบกำหนดใหม่" />
                    <input name="owner" list="task-team" defaultValue={t.owner ?? ""} className="c-input w-48" aria-label="ผู้รับงาน" />
                  </ActionForm>
                </details>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
