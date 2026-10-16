import Link from "next/link";
import { viewer } from "@/app/(app)/viewer";
import { reports } from "@/lib/engine/reports";
import { pipelineAsOf, velocity } from "@/lib/engine/velocity";
import { bangkokDay, thaiDate } from "@/lib/shared/format";
import { DEAL_STAGE_TH } from "@/lib/shared/deals";
import { PageHead, Panel, baht, num } from "@/components/console/ui";

export const dynamic = "force-dynamic";

/* ── รายงาน (docs/ux-plan.md U6) ── 4 กราฟตายตัว เปิดแล้วอ่านได้เลย · ทบทวนรายสัปดาห์แบบละเอียดอยู่ที่ลิงก์ด้านบน
   กราฟเป็น CSS ล้วน (ไม่มีไลบรารี) · ทุกกราฟมีตัวเลขกำกับเป็นข้อความ อ่านด้วยโปรแกรมอ่านหน้าจอได้ */

const ACT = [
  { key: "meeting", label: "ประชุม", color: "var(--c-accent)" },
  { key: "call", label: "โทร", color: "var(--c-good)" },
  { key: "email", label: "อีเมล", color: "var(--c-warn)" },
  { key: "other", label: "อื่น ๆ", color: "var(--c-text-4)" },
] as const;

const shortDate = (d: string) => new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "numeric" });

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ asof?: string }> }) {
  const v = await viewer();
  const who = { id: v.actor, clearance: v.clearance };
  const asofRaw = (await searchParams).asof ?? "";
  const asof = /^\d{4}-\d{2}-\d{2}$/.test(asofRaw) && asofRaw < bangkokDay() ? asofRaw : null;
  const [r, vel, past] = await Promise.all([reports(v.tenantId, who), velocity(v.tenantId, who), asof ? pipelineAsOf(v.tenantId, who, asof) : null]);
  const shown = past ?? r.pipeline;
  const maxDeal = Math.max(1, ...shown.map((p) => p.value || p.count));
  const maxWeek = Math.max(1, ...r.activity.map((w) => w.meeting + w.call + w.email + w.other));
  const top = Math.max(1, r.funnel[0].count);

  return (
    <>
      <PageHead label="รายงาน" title="รายงาน" actions={<Link href="/app/sales/weekly" className="c-btn c-btn-ghost">ทบทวนรายสัปดาห์แบบละเอียด</Link>} />
      <div className="grid gap-5 lg:grid-cols-2">
        {/* ── 1 · ไปป์ไลน์ ── */}
        <Panel className="p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="c-h2 text-[var(--c-text)]">ไปป์ไลน์ตามขั้น{asof ? ` ณ ${thaiDate(asof)}` : ""}</h2>
            <Link href="/app/deals" className="c-thai text-[0.8rem] text-[var(--c-accent)] hover:underline">ดูดีล →</Link>
          </div>
          {/* ณ วันที่ (C3) — ฟอร์ม GET ธรรมดา ลิงก์แชร์ได้ */}
          <form className="c-thai mt-2 flex flex-wrap items-end gap-2 text-[0.8rem] text-[var(--c-text-3)]" action="/app/reports">
            <label className="flex flex-col gap-1">ดูย้อนหลัง ณ วันที่
              <input type="date" name="asof" defaultValue={asof ?? ""} max={bangkokDay()} className="c-input min-h-9 py-1" />
            </label>
            <button type="submit" className="c-btn c-btn-ghost c-btn-sm">ดู</button>
            {asof && <Link href="/app/reports" className="c-btn c-btn-ghost c-btn-sm">วันนี้</Link>}
          </form>
          <ul className="mt-4 grid gap-3">
            {shown.map((p) => (
              <li key={p.stage}>
                <div className="c-thai flex justify-between text-[0.84rem]">
                  <span>{DEAL_STAGE_TH[p.stage]} <span className="text-[var(--c-text-4)]">({num(p.count)})</span></span>
                  <span className="c-mono">{baht(p.value)}</span>
                </div>
                <div className="mt-1 h-3 rounded bg-[var(--c-line)]" aria-hidden>
                  <div className="h-3 rounded bg-[var(--c-accent)]" style={{ width: `${Math.round(((p.value || p.count) / maxDeal) * 100)}%` }} />
                </div>
              </li>
            ))}
          </ul>
          <p className="c-thai mt-4 text-[0.82rem] text-[var(--c-text-3)]">
            {asof ? `ขั้นและมูลค่าตามที่บันทึกไว้ ณ สิ้นวัน ${thaiDate(asof)} — จากประวัติของดีล` : `ปิดได้ไตรมาสนี้ ${num(r.wonThisQuarter.count)} ดีล · ${baht(r.wonThisQuarter.value)}`}
          </p>
        </Panel>

        {/* ── ความเร็วของไปป์ไลน์ (docs/crm-plan.md C3) ── */}
        <Panel className="p-5 lg:col-span-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="c-h2 text-[var(--c-text)]">ความเร็วของไปป์ไลน์</h2>
            <p className="c-thai text-[0.82rem] text-[var(--c-text-3)]">
              อัตราปิดได้ {vel.winRate == null ? "—" : `${Math.round(vel.winRate * 100)}%`} ({num(vel.won)} ได้ · {num(vel.lost)} ไม่ได้)
              · รอบขายเฉลี่ย {vel.avgCycleDays == null ? "—" : `${vel.avgCycleDays} วัน`}
            </p>
          </div>
          <div className="c-scroll mt-3" tabIndex={0} role="region" aria-label="ความเร็วแต่ละขั้น">
            <table className="c-table min-w-[36rem]">
              <thead><tr><th>ขั้น</th><th className="text-right">ดีลที่ถึงขั้นนี้</th><th className="text-right">ผ่านไปขั้นถัดไป</th><th className="text-right">อยู่ขั้นนี้เฉลี่ย</th><th className="text-right">ค้างเกิน 30 วัน</th></tr></thead>
              <tbody>
                {vel.stages.map((s) => (
                  <tr key={s.stage}>
                    <td className="c-thai">{DEAL_STAGE_TH[s.stage]}</td>
                    <td className="c-mono text-right">{num(s.reached)}</td>
                    <td className="c-mono text-right">{s.reached ? `${num(s.advanced)} (${Math.round((s.advanced / s.reached) * 100)}%)` : "—"}</td>
                    <td className="c-mono text-right">{s.avgDays == null ? "—" : `${s.avgDays} วัน`}</td>
                    <td className={`c-mono text-right ${s.stuck ? "text-[var(--c-warn)]" : ""}`}>{num(s.stuck)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="c-thai mt-2 text-[0.76rem] text-[var(--c-text-4)]">นับจากประวัติการย้ายขั้นจริงของทุกดีลที่คุณเห็น · ข้ามขั้น = นับว่าผ่านขั้นนั้น · ไม่มีการคาดการณ์</p>
        </Panel>

        {/* ── 2 · กิจกรรมต่อสัปดาห์ ── */}
        <Panel className="p-5">
          <h2 className="c-h2 text-[var(--c-text)]">กิจกรรมต่อสัปดาห์</h2>
          <p className="c-thai mt-1 flex flex-wrap gap-3 text-[0.76rem] text-[var(--c-text-3)]">
            {ACT.map((a) => <span key={a.key} className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: a.color }} />{a.label}</span>)}
          </p>
          <div className="mt-3 flex h-40 items-end gap-1.5" role="img" aria-label={`กิจกรรม 12 สัปดาห์ล่าสุด: ${r.activity.map((w) => `${shortDate(w.week)} ${w.meeting + w.call + w.email + w.other}`).join(", ")}`}>
            {r.activity.map((w) => {
              const total = w.meeting + w.call + w.email + w.other;
              return (
                <div key={w.week} className="flex h-full flex-1 flex-col justify-end" title={`สัปดาห์ ${shortDate(w.week)}: ${total}`}>
                  <div className="flex flex-col-reverse overflow-hidden rounded-t" style={{ height: `${(total / maxWeek) * 100}%` }}>
                    {ACT.map((a) => w[a.key] > 0 && <div key={a.key} style={{ height: `${(w[a.key] / Math.max(1, total)) * 100}%`, background: a.color }} />)}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-1 flex gap-1.5 text-[0.65rem] text-[var(--c-text-4)]" aria-hidden>
            {r.activity.map((w, i) => <span key={w.week} className="flex-1 text-center">{i % 3 === 0 ? shortDate(w.week) : ""}</span>)}
          </div>
        </Panel>

        {/* ── 3 · กรวยแคมเปญ ── */}
        <Panel className="p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="c-h2 text-[var(--c-text)]">กรวยแคมเปญ (ทุกแคมเปญ)</h2>
            <Link href="/app/sales" className="c-thai text-[0.8rem] text-[var(--c-accent)] hover:underline">ดูแคมเปญ →</Link>
          </div>
          <ul className="mt-4 grid gap-2">
            {r.funnel.map((s, i) => (
              <li key={s.label} className="grid grid-cols-[8.5rem_minmax(0,1fr)_3rem] items-center gap-2">
                <span className="c-thai text-[0.84rem]">{s.label}</span>
                <div className="h-5 rounded bg-[var(--c-line)]" aria-hidden>
                  <div className="h-5 rounded" style={{ width: `${Math.round((s.count / top) * 100)}%`, background: i === r.funnel.length - 1 ? "var(--c-good)" : "var(--c-accent)", opacity: 1 - i * 0.1 }} />
                </div>
                <span className="c-mono text-right text-[0.84rem]">{num(s.count)}</span>
              </li>
            ))}
          </ul>
        </Panel>

        {/* ── 4 · คุณภาพข้อมูล ── */}
        <Panel className="p-5">
          <h2 className="c-h2 text-[var(--c-text)]">คุณภาพข้อมูล</h2>
          <ul className="mt-4 grid gap-3">
            {r.quality.map((q) => (
              <li key={q.label}>
                <div className="c-thai flex justify-between text-[0.84rem]">
                  <span>{q.label}</span>
                  <span className="c-mono">{num(q.count)}{q.of ? ` / ${num(q.of)}` : ""}</span>
                </div>
                {q.of > 0 && (
                  <div className="mt-1 h-2.5 rounded bg-[var(--c-line)]" aria-hidden>
                    <div className="h-2.5 rounded" style={{ width: `${Math.round((q.count / q.of) * 100)}%`, background: q.good ? "var(--c-good)" : "var(--c-warn)" }} />
                  </div>
                )}
              </li>
            ))}
          </ul>
          <p className="c-thai mt-4 text-[0.78rem] text-[var(--c-text-4)]">
            <Link href="/app/vault/review" className="underline">ตรวจข้อมูลซ้ำ</Link> · <Link href="/app/sales/purposes" className="underline">ตั้งกฎอายุข้อมูล</Link>
          </p>
        </Panel>
      </div>
    </>
  );
}
