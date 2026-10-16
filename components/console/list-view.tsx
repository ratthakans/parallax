import Link from "next/link";

/* ── หน้ารายการแบบ Salesforce (docs/ux-plan.md U3 · 5.1) ─────────────────────

   ทุกอย่างอยู่ใน URL (?view= &sort= &dir= &q= &page=) — แชร์ลิงก์มุมมองให้ทีมได้ ย้อนกลับได้ ไม่ต้องใช้ JS
   ListViews   มุมมองสำเร็จรูป (ทั้งหมด · ของฉัน · …) เป็นชิปด้านบน
   SortTh      หัวคอลัมน์กดเรียง · กดซ้ำสลับทิศ · มีลูกศรบอกทิศ
   Pager       ก่อนหน้า/ถัดไป */

export type ListState = { q?: string; view?: string; sort?: string; dir?: string; page?: number };

export function listHref(base: string, state: ListState, patch: ListState): string {
  const next = { ...state, ...patch };
  const qs = new URLSearchParams();
  if (next.q) qs.set("q", next.q);
  if (next.view && next.view !== "all") qs.set("view", next.view);
  if (next.sort) qs.set("sort", next.sort);
  if (next.dir) qs.set("dir", next.dir);
  if (next.page && next.page > 1) qs.set("page", String(next.page));
  const s = qs.toString();
  return s ? `${base}?${s}` : base;
}

export function ListViews({ base, state, views }: { base: string; state: ListState; views: { key: string; label: string }[] }) {
  const active = state.view ?? "all";
  return (
    <nav className="flex flex-wrap gap-1.5" aria-label="มุมมองของรายการ">
      {views.map((v) => (
        <Link
          key={v.key}
          href={listHref(base, state, { view: v.key, page: 1 })}
          aria-current={v.key === active ? "page" : undefined}
          className={`c-pill ${v.key === active ? "c-pill-reach font-semibold" : ""}`}
        >
          {v.label}
        </Link>
      ))}
    </nav>
  );
}

export function SortTh({ base, state, col, label, defaultDir = "asc", align = "left" }: {
  base: string; state: ListState; col: string; label: string; defaultDir?: "asc" | "desc"; align?: "left" | "right";
}) {
  const on = state.sort === col;
  const dir = on ? (state.dir ?? defaultDir) : undefined;
  const next = on ? (dir === "asc" ? "desc" : "asc") : defaultDir;
  return (
    <th className={`font-sans text-[0.75rem] normal-case tracking-normal ${align === "right" ? "text-right" : ""}`} aria-sort={on ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <Link href={listHref(base, state, { sort: col, dir: next, page: 1 })} className="inline-flex items-center gap-1 hover:text-[var(--c-accent)]">
        {label}<span aria-hidden className={on ? "text-[var(--c-accent)]" : "text-[var(--c-line-2)]"}>{on ? (dir === "asc" ? "▲" : "▼") : "↕"}</span>
      </Link>
    </th>
  );
}

export function Pager({ base, state, page, pages }: { base: string; state: ListState; page: number; pages: number }) {
  if (pages <= 1) return null;
  return (
    <nav className="c-thai mt-4 flex items-center gap-4 text-[0.86rem]" aria-label="หน้าของรายการ">
      {page > 1 && <Link className="c-btn c-btn-ghost c-btn-sm" href={listHref(base, state, { page: page - 1 })}>ก่อนหน้า</Link>}
      <span className="text-[var(--c-text-3)]">หน้า {page.toLocaleString("th-TH")} / {pages.toLocaleString("th-TH")}</span>
      {page < pages && <Link className="c-btn c-btn-ghost c-btn-sm" href={listHref(base, state, { page: page + 1 })}>ถัดไป</Link>}
    </nav>
  );
}
