import Link from "next/link";
import { Mark, Ridge } from "@/components/brand";

/* ── ส่วนท้ายเว็บ (docs/brand-plan.md §2) ──
   ตัวหนังสือดำ-เทาบนท้องฟ้าใส · เมนูเป็นคอลัมน์ · เส้นคั่นบางเส้นเดียว
   แล้วจบด้วยภาพ Ridge — สีของแบรนด์อยู่ในภาพ ไม่ได้อยู่บนตัวหนังสือ */

const COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "ผลิตภัณฑ์",
    links: [
      { href: "/platform", label: "วิธีทำงาน" },
      { href: "/demo", label: "ดูเดโม" },
      { href: "/pricing", label: "ราคา" },
      { href: "/playbook", label: "กรณีศึกษา" },
    ],
  },
  {
    title: "บริษัท",
    links: [
      { href: "/company", label: "เกี่ยวกับเรา" },
      { href: "/investors", label: "นักลงทุน" },
      { href: "/contact", label: "ติดต่อเรา" },
    ],
  },
  {
    title: "ความน่าเชื่อถือ",
    links: [
      { href: "/trust", label: "ความปลอดภัย" },
      { href: "/trust", label: "นโยบายความเป็นส่วนตัว" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="relative isolate overflow-hidden bg-paper">
      <Ridge className="top-auto h-[22rem] md:h-[28rem]" />
      <div className="shell relative z-[1] pt-14 pb-[15rem] md:pt-16 md:pb-[19rem]">
        <div className="flex flex-col gap-12 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Link href="/" className="inline-flex min-h-11 items-center gap-2.5 text-ink" aria-label="Parallax — หน้าแรก">
              <Mark className="h-7 w-7" />
              <span className="text-[1.3rem] font-semibold tracking-[-0.02em]">Parallax</span>
            </Link>
            <p className="t-body mt-4 max-w-xs text-ink-3">
              เปลี่ยนข้อมูลลูกค้า ให้เป็นงานที่ช่วยเพิ่มยอดขายได้จริง
            </p>
            <a href="mailto:hello@parallax.co.th" className="mt-6 inline-flex min-h-11 items-center rounded-lg border border-line-2 bg-paper/70 px-4 text-[0.875rem] text-ink-2 transition-colors hover:border-ink-4">
              hello@parallax.co.th
            </a>
          </div>

          <nav aria-label="เมนูส่วนท้าย" className="grid grid-cols-2 gap-x-12 gap-y-8 sm:grid-cols-3">
            {COLUMNS.map((c) => (
              <div key={c.title}>
                <p className="text-[0.95rem] font-medium text-ink">{c.title}</p>
                <ul className="mt-3">
                  {c.links.map((l) => (
                    <li key={l.label}>
                      <Link href={l.href} className="flex min-h-10 items-center text-[0.9rem] text-ink-3 transition-colors hover:text-ink">
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-12 flex flex-col justify-between gap-2 border-t border-line-2 pt-6 md:flex-row md:items-center">
          <p className="t-small text-ink-3">© {new Date().getFullYear()} Parallax · กรุงเทพฯ ประเทศไทย</p>
          <Link href="/trust" className="t-small inline-flex min-h-11 items-center text-ink-3 underline-offset-4 hover:text-ink hover:underline">
            ความปลอดภัยและความเป็นส่วนตัว
          </Link>
        </div>
      </div>
    </footer>
  );
}
