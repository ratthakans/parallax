import Link from "next/link";
import { Mark } from "@/components/brand";

const LINKS = [
  { href: "/demo", label: "ดูเดโม" },
  { href: "/platform", label: "วิธีทำงาน" },
  { href: "/pricing", label: "ราคา" },
  { href: "/playbook", label: "กรณีศึกษา" },
  { href: "/trust", label: "ความปลอดภัย" },
  { href: "/contact", label: "ติดต่อเรา" },
];

export function SiteFooter() {
  return (
    <footer className="surface-dark">
      <div className="shell py-12 md:py-14">
        <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2.5 text-frost">
              <Mark className="h-5 w-5" />
              <span className="text-[0.95rem] font-medium tracking-[0.24em]">PARALLAX</span>
            </div>
            <p className="t-body mt-5 max-w-sm text-frost/62">
              เปลี่ยนข้อมูลลูกค้า ให้เป็นงานที่ช่วยเพิ่มยอดขายได้จริง
            </p>
          </div>

          <nav aria-label="เมนูส่วนท้าย" className="grid grid-cols-2 gap-x-10 gap-y-1 sm:grid-cols-3">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="flex min-h-11 items-center text-[0.875rem] text-frost/65 transition-colors hover:text-frost"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="mt-10 flex flex-col justify-between gap-4 border-t border-frost/12 pt-7 md:flex-row md:items-center">
          <p className="t-small text-frost/48">
            © {new Date().getFullYear()} PARALLAX · กรุงเทพฯ ประเทศไทย
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Link href="/trust" className="t-small inline-flex min-h-11 items-center text-frost/48 hover:text-frost/75">
              นโยบายความเป็นส่วนตัว
            </Link>
            <a href="mailto:hello@parallax.co.th" className="t-small inline-flex min-h-11 items-center text-frost/48 hover:text-frost/75">
              hello@parallax.co.th
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
