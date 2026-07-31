import Link from "next/link";
import { Mark } from "@/components/brand";

const COLS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Platform",
    links: [
      { href: "/platform", label: "The five layers" },
      { href: "/platform/keep", label: "Keep" },
      { href: "/platform/reach", label: "Reach" },
      { href: "/platform/proof", label: "Proof" },
      { href: "/platform/learning", label: "Shared intelligence" },
    ],
  },
  {
    title: "Product",
    links: [
      { href: "/product", label: "Morning Brief" },
      { href: "/product#features", label: "All features" },
      { href: "/pricing", label: "Pricing" },
      { href: "/app", label: "Console" },
    ],
  },
  {
    title: "Customers",
    links: [
      { href: "/customers", label: "Cycles we take" },
      { href: "/playbook", label: "Playbook — MST Golf" },
      { href: "/problem", label: "The problem" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/company", label: "About" },
      { href: "/investors", label: "Investors" },
      { href: "/trust", label: "Privacy" },
      { href: "/contact", label: "Contact" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="surface-dark relative overflow-hidden">
      <div className="shell pt-20 pb-10 md:pt-24">
        <div className="grid gap-14 lg:grid-cols-[1.3fr_2fr]">
          <div>
            <div className="flex items-center gap-2.5 text-frost">
              <Mark className="h-5 w-5" />
              <span className="text-[0.95rem] font-medium tracking-[0.24em]">
                PARALLAX
              </span>
            </div>
            <p className="t-lead t-thai pretty mt-8 max-w-sm text-frost/58">
              One view gives you position.
              <br />
              Two views give you distance.
            </p>
            <p className="t-label mt-10 text-frost/58">
              Agentic revenue OS
            </p>
          </div>

          <div className="grid grid-cols-2 gap-x-8 gap-y-12 md:grid-cols-4">
            {COLS.map((col) => (
              <div key={col.title}>
                <p className="t-label text-frost/48">{col.title}</p>
                <ul className="mt-6 flex flex-col gap-3.5">
                  {col.links.map((l) => (
                    <li key={l.href + l.label}>
                      <Link
                        href={l.href}
                        className="text-[0.875rem] text-frost/65 transition-colors duration-300 hover:text-frost"
                      >
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <hr className="hair-dark mt-20" />

        <div className="flex flex-col justify-between gap-5 pt-8 md:flex-row md:items-center">
          <p className="t-small text-frost/48">
            © {new Date().getFullYear()} PARALLAX  · Bangkok, Thailand
          </p>
          <div className="flex flex-wrap gap-x-7 gap-y-2">
            <Link
              href="/trust"
              className="t-small text-frost/48 transition-colors hover:text-frost/70"
            >
              Privacy policy
            </Link>
            <Link
              href="/trust#terms"
              className="t-small text-frost/48 transition-colors hover:text-frost/70"
            >
              Terms of use
            </Link>
            <a
              href="mailto:hello@parallax.co.th"
              className="t-small text-frost/48 transition-colors hover:text-frost/70"
            >
              hello@parallax.co.th
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
