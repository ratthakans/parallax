import Link from "next/link";
import { viewer } from "@/app/(app)/viewer";
import { createTeamAction, teamMemberAction } from "@/app/(app)/field-actions";
import { listTeams } from "@/lib/engine/forecast";
import { teamMembers } from "@/lib/engine/team";
import { can } from "@/lib/shared/roles";
import { ActionForm } from "@/components/console/action-form";
import { PageHead, Panel, num } from "@/components/console/ui";

export const metadata = { title: "ทีมและเขตการขาย" };
export const dynamic = "force-dynamic";

/* ── ทีมและเขตการขาย (docs/crm-plan.md C6) ── ใครอยู่ทีมไหน · บริษัทไหนเป็นของทีมไหน (ตั้งที่แฟ้มบริษัท)
   ทีม = มิติของรายงานพยากรณ์และตัวกรอง ไม่ใช่ด่านสิทธิ์ */

export default async function TeamsPage() {
  const v = await viewer();
  const [teams, people] = await Promise.all([listTeams(v.tenantId), teamMembers(v.tenantId, v.actor)]);
  const manage = can(v.role, "campaign");
  return (
    <>
      <Link href="/app/settings" className="c-thai text-[0.8rem] text-[var(--c-text-3)] hover:text-[var(--c-accent)]">← ตั้งค่า</Link>
      <PageHead label="ตั้งค่า" title="ทีมและเขตการขาย" lead="ใช้แยกรายงานพยากรณ์และกรองบริษัทตามทีม" more="ไม่จำกัดว่าใครเห็นอะไร — สิทธิ์ยังเป็นตามบทบาท" />
      <datalist id="people-list">{people.map((p) => <option key={p} value={p} />)}</datalist>
      <div className="grid gap-5 lg:grid-cols-2">
        {teams.map((t) => (
          <Panel key={t.id} className="p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="c-h2 text-[var(--c-text)]">{t.name}</h2>
              <Link href={`/app/accounts?team=${t.id}`} className="c-thai text-[0.8rem] text-[var(--c-accent)] hover:underline">{num(t.orgs)} บริษัท →</Link>
            </div>
            {t.members.length ? (
              <ul className="mt-3 divide-y divide-[var(--c-line)]">
                {t.members.map((m) => (
                  <li key={m} className="c-thai flex items-center justify-between gap-2 py-2 text-[0.88rem]">
                    <span className="break-all">{m}</span>
                    {manage && <ActionForm action={teamMemberAction} fields={{ teamId: t.id, member: m, add: "0" }} label="เอาออก" pendingLabel="…" size="sm" variant="ghost" />}
                  </li>
                ))}
              </ul>
            ) : <p className="c-thai mt-3 text-[0.86rem] text-[var(--c-text-3)]">ยังไม่มีคนในทีม</p>}
            {manage && (
              <ActionForm action={teamMemberAction} fields={{ teamId: t.id, add: "1" }} label="เพิ่มเข้าทีม" pendingLabel="…" size="sm" className="mt-3 flex flex-wrap items-end gap-2">
                <input name="member" list="people-list" className="c-input max-w-xs" placeholder="อีเมลของคนในทีม" required autoComplete="off" aria-label="คนในทีม" />
              </ActionForm>
            )}
          </Panel>
        ))}
        {!teams.length && <Panel className="p-5"><p className="c-thai text-[0.88rem] text-[var(--c-text-3)]">ยังไม่มีทีม</p></Panel>}
      </div>
      {manage ? (
        <Panel className="mt-5 max-w-xl p-5">
          <h2 className="c-h2 text-[var(--c-text)]">สร้างทีม</h2>
          <ActionForm action={createTeamAction} label="สร้างทีม" pendingLabel="กำลังบันทึก…" variant="primary" className="mt-3 flex flex-wrap items-end gap-2">
            <input name="name" className="c-input max-w-xs" placeholder="เช่น ทีมภาคตะวันออก" required maxLength={60} aria-label="ชื่อทีม" />
          </ActionForm>
        </Panel>
      ) : <p className="c-thai mt-5 text-[0.84rem] text-[var(--c-text-3)]">สร้างและจัดทีมได้เฉพาะหัวหน้าทีมหรือเจ้าของบัญชี</p>}
    </>
  );
}
