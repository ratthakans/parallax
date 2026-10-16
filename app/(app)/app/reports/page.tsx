import Link from "next/link";
import { viewer } from "@/app/(app)/viewer";
import { reports } from "@/lib/engine/reports";
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

export default async function ReportsPage() {
  const v = await viewer();
  const r = await reports(v.tenantId, { id: v.actor, clearance: v.clearance });
  const maxDeal = Math.max(1, ...r.pipeline.map((p) => p.value || p.count));
  const maxWeek = Math.max(1, ...r.activity.map((w) => w.meeting + w.call + w.email + w.other));
  const top = Math.max(1, r.funnel[0].count);

  return (
    <>
      <PageHead label="รายงาน" title="รายงาน" actions={<Link href="/app/sales/weekly" className="c-btn c-btn-ghost">ทบทวนรายสัปดาห์แบบละเอียด</Link>} />
      <div className="grid gap-5 lg:grid-cols-2">
        {/* ── 1 · ไปป์ไลน์ ── */}
        <Panel className="p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="c-h2 text-[var(--c-text)]">ไปป์ไลน์ตามขั้น</h2>
            <Link href="/app/deals" className="c-thai text-[0.8rem] text-[var(--c-accent)] hover:underline">ดูดีล →</Link>
          </div>
          <ul className="mt-4 grid gap-3">
            {r.pipeline.map((p) => (
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
          <p className="c-thai mt-4 text-[0.82rem] text-[var(--c-text-3)]">ปิดได้ไตรมาสนี้ {num(r.wonThisQuarter.count)} ดีล · {baht(r.wonThisQuarter.value)}</p>
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
