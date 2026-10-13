import Link from "next/link";
import { viewer } from "@/app/(app)/viewer";
import { weeklyReview } from "@/lib/engine/campaigns";
import { TARGET_STATUS_TH, TARGET_STATUSES } from "@/lib/shared/policy";
import { baht, thaiDate } from "@/lib/shared/format";
import { PageHead, Panel, num } from "@/components/console/ui";

export const dynamic = "force-dynamic";

/* ── ทบทวนรายสัปดาห์ (docs/plan.md หัวข้อ 3.3) ─────────────────────
   หัวหน้าทีมดูทุกสัปดาห์: บัญชีเป้าหมายอยู่ขั้นไหน · งานเลยกำหนด · โอกาสที่ขยับ · ใครทำงานที่มีผล
   กิจกรรมนับจากการมอบหมายและการบันทึกผล ไม่ใช่การ login · การกระทำของทีม PARALLAX ไม่นับ */

const TH = "font-sans normal-case tracking-normal text-[0.75rem]";
const STAGE_TH: Record<string, string> = { proposal: "ส่งข้อเสนอแล้ว", won: "ปิดได้", lost: "ไม่ได้", open: "เปิด" };

export default async function WeeklyPage() {
  const v = await viewer();
  const r = await weeklyReview(v.tenantId);
  const shownStatuses = TARGET_STATUSES.filter((s) => r.campaigns.some((c) => c.counts[s]));

  return (
    <>
      <Link href="/app/sales" className="c-thai inline-block py-2 text-[0.85rem] text-[var(--c-text-3)] hover:text-[var(--c-text)]">← แคมเปญขาย</Link>
      <PageHead label="Campaign Workspace" title="ทบทวนรายสัปดาห์" lead={`ตั้งแต่ ${thaiDate(r.since)} — นับจากงานที่มอบหมายและผลที่บันทึก ไม่นับการเข้าระบบ และไม่นับทีม PARALLAX`} />

      <Panel className="mb-6 p-5 md:p-6">
        <h2 className="c-h2 text-[var(--c-text)]">แคมเปญที่ยังเปิด</h2>
        {r.campaigns.length ? (
          <div className="c-scroll mt-4" tabIndex={0} role="region" aria-label="ตารางสถานะเป้าหมายต่อแคมเปญ">
            <table className="c-table min-w-[40rem]">
              <thead>
                <tr>
                  <th className={TH}>แคมเปญ</th>
                  {shownStatuses.map((s) => <th key={s} className={`${TH} text-right`}>{TARGET_STATUS_TH[s]}</th>)}
                </tr>
              </thead>
              <tbody>
                {r.campaigns.map((c) => (
                  <tr key={c.id}>
                    <td><Link href={`/app/sales/${c.id}`} className="c-thai inline-block py-1.5 text-[var(--c-text)] hover:text-[var(--c-accent)]">{c.name}</Link></td>
                    {shownStatuses.map((s) => <td key={s} className="c-mono text-right">{num(c.counts[s] ?? 0)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="c-thai mt-4 text-[0.88rem] text-[var(--c-text-3)]">ยังไม่มีแคมเปญที่มีรายชื่อ</p>}
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel className="p-5 md:p-6">
          <h2 className="c-h2 text-[var(--c-text)]">งานเลยกำหนด</h2>
          {r.overdue.length ? (
            <ul className="c-thai mt-3 grid gap-2 text-[0.86rem] text-[var(--c-text-2)]">
              {r.overdue.map((t) => (
                <li key={t.id}>
                  <span className="text-[var(--c-bad)]">{thaiDate(t.due_at)}</span> · {t.title}
                  {t.org && <> · {t.org_id ? <Link href={`/app/accounts/${t.org_id}`} className="underline">{t.org}</Link> : t.org}</>}
                  <span className="text-[var(--c-text-4)]"> · {t.owner_id ?? "ไม่มีผู้รับผิดชอบ"}</span>
                </li>
              ))}
            </ul>
          ) : <p className="c-thai mt-3 text-[0.86rem] text-[var(--c-text-3)]">ไม่มีงานเลยกำหนด</p>}
        </Panel>

        <Panel className="p-5 md:p-6">
          <h2 className="c-h2 text-[var(--c-text)]">โอกาสที่ขยับในสัปดาห์นี้</h2>
          {r.opportunities.length ? (
            <ul className="c-thai mt-3 grid gap-2 text-[0.86rem] text-[var(--c-text-2)]">
              {r.opportunities.map((o) => (
                <li key={o.id}>
                  <Link href={`/app/accounts/${o.org_id}`} className="text-[var(--c-text)] hover:text-[var(--c-accent)]">{o.org}</Link> · {o.name} · {STAGE_TH[o.stage] ?? o.stage}
                  {o.value ? <span className="c-mono"> · {baht(Number(o.value))}</span> : null}
                  <span className="text-[var(--c-text-4)]"> · {thaiDate(o.updated_at)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="c-thai mt-3 text-[0.86rem] text-[var(--c-text-3)]">ยังไม่มีโอกาสที่ขยับ</p>}
        </Panel>
      </div>

      <Panel className="mt-6 p-5 md:p-6">
        <h2 className="c-h2 text-[var(--c-text)]">กิจกรรมที่มีผลของทีม</h2>
        {r.activity.length ? (
          <table className="c-table mt-4 max-w-xl">
            <thead><tr><th className={TH}>ผู้ใช้</th><th className={`${TH} text-right`}>มอบหมาย</th><th className={`${TH} text-right`}>บันทึกผล</th></tr></thead>
            <tbody>
              {r.activity.map((a) => (
                <tr key={a.actor}><td className="c-thai text-[0.84rem]">{a.actor}</td><td className="c-mono text-right">{num(a.assign)}</td><td className="c-mono text-right">{num(a.outcomes)}</td></tr>
              ))}
            </tbody>
          </table>
        ) : <p className="c-thai mt-3 text-[0.86rem] text-[var(--c-text-3)]">ยังไม่มีกิจกรรมในสัปดาห์นี้</p>}
        {r.staffActions > 0 && <p className="c-thai mt-3 text-[0.76rem] text-[var(--c-text-4)]">ไม่นับ {num(r.staffActions)} กิจกรรมของทีม PARALLAX</p>}
      </Panel>
    </>
  );
}
