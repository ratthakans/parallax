import Link from "next/link";
import type { ReactNode } from "react";

/* ── หน้าระเบียนแบบ Salesforce (docs/ux-plan.md U2 · 5.2) ─────────────────

   RecordHeader  ชื่อ + หัวสรุป 4–6 ช่อง + ปุ่มหลัก — จอแรกตอบได้ว่า "นี่ใคร สำคัญยังไง ทำอะไรต่อ"
   RecordTabs    แท็บเป็นลิงก์ (?tab=) — เรนเดอร์แค่แท็บที่เปิด หน้าจึงสั้นและเบา ไม่ต้องใช้ JS
   ทั้งสองเป็น server component ใช้ได้ทุกชนิดข้อมูล (บริษัท · ผู้ติดต่อ · ดีล) */

export type Highlight = { label: string; value: ReactNode };

export function RecordHeader({ kind, title, badges, highlights, actions, back }: {
  kind: string;
  title: ReactNode;
  badges?: ReactNode;
  highlights: Highlight[];
  actions?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <header className="c-panel mb-5 p-4 md:p-5">
      {back && (
        <Link href={back.href} className="c-thai text-[0.8rem] text-[var(--c-text-3)] hover:text-[var(--c-accent)]">← {back.label}</Link>
      )}
      <div className="mt-1 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="c-label-th">{kind}</p>
          <h1 className="mt-1 break-words text-[1.35rem] font-semibold leading-snug text-[var(--c-text)]">{title}</h1>
          {badges && <div className="mt-2 flex flex-wrap items-center gap-1.5">{badges}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-[var(--c-line)] pt-4 sm:grid-cols-3 lg:grid-cols-6">
        {highlights.map((h) => (
          <div key={h.label} className="min-w-0">
            <dt className="c-thai text-[0.72rem] text-[var(--c-text-4)]">{h.label}</dt>
            <dd className="c-thai mt-0.5 truncate text-[0.9rem] text-[var(--c-text)]">{h.value}</dd>
          </div>
        ))}
      </dl>
    </header>
  );
}

export function RecordTabs({ base, tabs, active }: { base: string; tabs: { key: string; label: string; count?: number }[]; active: string }) {
  return (
    <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-[var(--c-line)]" aria-label="ส่วนของระเบียน">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.key === tabs[0].key ? base : `${base}?tab=${t.key}`}
          scroll={false}
          className="c-tab"
          data-active={t.key === active}
          aria-current={t.key === active ? "page" : undefined}
        >
          {t.label}{t.count != null && <span className="ml-1 text-[var(--c-text-4)]">({t.count})</span>}
        </Link>
      ))}
    </nav>
  );
}

/** แท็บที่ขอ ถ้าไม่รู้จัก = แท็บแรก */
export const pickTab = <K extends string>(keys: readonly K[], wanted: string | undefined): K =>
  (keys as readonly string[]).includes(wanted ?? "") ? (wanted as K) : keys[0];
