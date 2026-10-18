import Link from "next/link";
import { viewer } from "@/app/(app)/viewer";
import { setQuotaAction } from "@/app/(app)/field-actions";
import { forecastReport, nearbyQuarters, type ForecastRow } from "@/lib/engine/forecast";
import { quarterOf } from "@/lib/shared/deals";
import { can } from "@/lib/shared/roles";
import { ActionForm } from "@/components/console/action-form";
import { PageHead, Panel, baht } from "@/components/console/ui";

export const metadata = { title: "พยากรณ์ยอดขาย" };
export const dynamic = "force-dynamic";

/* ── พยากรณ์และเป้า (docs/crm-plan.md C6) ── ผลรวมของสิ่งที่คนขายบอก ไม่ใช่การเดาของระบบ
   ปิดได้แล้ว = เข้าขั้นปิดได้ในไตรมาส · แน่นอน/น่าจะได้/มีโอกาส = ดีลเปิดที่ปิดคาดในไตรมาส · % = (ปิดได้ + แน่นอน) ÷ เป้า */

const pct = (r: ForecastRow) => (r.quota ? `${Math.round(((r.won + r.commit) / r.quota) * 100)}%` : "—");
const sum = (rs: ForecastRow[]): ForecastRow => rs.reduce((t, r) => ({
  ...t, quota: (t.quota ?? 0) + (r.quota ?? 0) || null, won: t.won + r.won, commit: t.commit + r.commit, best_case: t.best_case + r.best_case, pipeline: t.pipeline + r.pipeline,
}), { owner: "รวม", team: null, quota: null, won: 0, commit: 0, best_case: 0, pipeline: 0 } as ForecastRow);

export default async function ForecastPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const v = await viewer();
  const quarters = nearbyQuarters();
  const sp = await searchParams;
  const period = quarters.includes(sp.period ?? "") ? sp.period! : quarterOf(new Date().toISOString());
  const r = await forecastReport(v.tenantId, { id: v.actor, clearance: v.clearance }, period);
  const manage = can(v.role, "campaign");
  const total = sum(r.rows);

  return (
    <>
      <Link href="/app/reports" className="c-thai text-[0.8rem] text-[var(--c-text-3)] hover:text-[var(--c-accent)]">← รายงาน</Link>
      <PageHead label="รายงาน" title={`พยากรณ์และเป้า ${period}`} lead="ตัวเลขจากหมวดที่คนขายตั้งในดีล (ไม่ตั้ง = ตามขั้น) · % ถึงเป้า = (ปิดได้แล้ว + แน่นอน) ÷ เป้า" />
      <nav className="mb-4 flex flex-wrap gap-1.5" aria-label="ไตรมาส">
        {quarters.map((q) => (
          <Link key={q} href={`/app/reports/forecast?period=${q}`} aria-current={q === period ? "page" : undefined}
            className={`c-pill ${q === period ? "c-pill-reach font-semibold" : ""}`}>{q}</Link>
        ))}
      </nav>
      {r.teams.length ? r.teams.map((g) => (
        <Panel key={g.team} className="mb-5 p-0">
          <h2 className="c-h2 border-b border-[var(--c-line)] px-5 py-3 text-[var(--c-text)]">{g.team}</h2>
          <div className="c-scroll px-5 pb-3" tabIndex={0} role="region" aria-label={`พยากรณ์ ${g.team}`}>
            <table className="c-table min-w-[52rem]">
              <thead><tr>
                <th>คน</th><th className="text-right">เป้า</th><th className="text-right">ปิดได้แล้ว</th><th className="text-right">แน่นอน</th>
                <th className="text-right">น่าจะได้</th><th className="text-right">มีโอกาส</th><th className="text-right">ถึงเป้า</th>
              </tr></thead>
              <tbody>
                {[...g.rows, ...(g.rows.length > 1 ? [sum(g.rows)] : [])].map((x) => (
                  <tr key={x.owner} className={x.owner === "รวม" ? "font-semibold" : ""}>
                    <td className="c-thai break-all">{x.owner}</td>
                    <td className="c-mono text-right">
                      {x.quota != null ? baht(x.quota) : "—"}
                      {manage && x.owner !== "รวม" && !x.owner.startsWith("—") && (
                        <details className="mt-1 text-left">
                          <summary className="c-thai inline-block cursor-pointer text-[0.74rem] text-[var(--c-text-4)] hover:text-[var(--c-accent)]">ตั้งเป้า</summary>
                          <ActionForm action={setQuotaAction} fields={{ owner: x.owner, period }} label="บันทึก" pendingLabel="…" size="sm" className="mt-1 flex items-end gap-1">
                            <input name="amount" inputMode="numeric" defaultValue={x.quota ?? ""} className="c-input w-28" aria-label={`เป้าของ ${x.owner}`} />
                          </ActionForm>
                        </details>
                      )}
                    </td>
                    <td className="c-mono text-right">{baht(x.won)}</td>
                    <td className="c-mono text-right">{baht(x.commit)}</td>
                    <td className="c-mono text-right text-[var(--c-text-3)]">{baht(x.best_case)}</td>
                    <td className="c-mono text-right text-[var(--c-text-3)]">{baht(x.pipeline)}</td>
                    <td className="c-mono text-right">{pct(x)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )) : <Panel className="p-5"><p className="c-thai text-[0.88rem] text-[var(--c-text-3)]">ไม่มีดีลที่ปิดคาดหรือปิดได้ในไตรมาสนี้ และยังไม่ได้ตั้งเป้า</p></Panel>}
      {r.teams.length > 1 && (
        <p className="c-thai text-[0.86rem] text-[var(--c-text-2)]">ทั้งบัญชี: ปิดได้ {baht(total.won)} · แน่นอน {baht(total.commit)} · เป้า {total.quota ? baht(total.quota) : "—"} · ถึงเป้า {pct(total)}</p>
      )}
      {manage && (
        <Panel className="mt-5 max-w-xl p-5">
          <h2 className="c-h2 text-[var(--c-text)]">ตั้งเป้าให้คนที่ยังไม่อยู่ในตาราง</h2>
          <ActionForm action={setQuotaAction} fields={{ period }} label="บันทึกเป้า" pendingLabel="…" size="sm" className="mt-3 flex flex-wrap items-end gap-2">
            <input name="owner" className="c-input max-w-xs" placeholder="อีเมลของคนขาย" required aria-label="คนขาย" />
            <input name="amount" inputMode="numeric" className="c-input w-36" placeholder="เป้า (บาท)" required aria-label="เป้า" />
          </ActionForm>
        </Panel>
      )}
    </>
  );
}
