"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Wordmark } from "@/components/brand";
import { NAV } from "./nav";

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [mobile, setMobile] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setMobile(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = mobile ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobile]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobile(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const overDark = pathname === "/" && !scrolled && !mobile;
  const ink = overDark ? "text-frost" : "text-ink";
  const secondary = overDark
    ? "text-frost/72 hover:text-frost"
    : "text-ink-2 hover:text-ink";

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-50 border-b transition-[background-color,border-color,backdrop-filter] duration-300 ${
          scrolled || mobile
            ? "border-line bg-paper/92 backdrop-blur-xl"
            : "border-transparent bg-transparent"
        }`}
      >
        <div className="shell flex h-16 items-center justify-between gap-8 md:h-[4.5rem]">
          <Wordmark className={ink} />

          <nav className="hidden items-center gap-1 lg:flex" aria-label="เมนูหลัก">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={pathname === item.href ? "page" : undefined}
                className={`flex min-h-11 items-center rounded-full px-4 text-[0.875rem] transition-colors ${
                  pathname === item.href
                    ? overDark
                      ? "text-cyan"
                      : "text-signal"
                    : secondary
                }`}
              >
                {item.title}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2.5">
            <Link
              href="/app"
              className={`hidden min-h-11 items-center px-3 text-[0.84rem] font-medium sm:inline-flex ${secondary}`}
            >
              เข้าสู่ระบบ
            </Link>
            <Link
              href="/contact"
              className="hidden min-h-11 items-center rounded-full bg-signal px-5 text-[0.84rem] font-medium text-white transition-colors hover:bg-signal-2 md:inline-flex"
            >
              ทดลองกับข้อมูลจริง
            </Link>
            <button
              type="button"
              onClick={() => setMobile((value) => !value)}
              aria-label={mobile ? "ปิดเมนู" : "เปิดเมนู"}
              aria-expanded={mobile}
              className={`-mr-2 flex h-11 w-11 items-center justify-center lg:hidden ${ink}`}
            >
              <span className="relative block h-3 w-5" aria-hidden>
                <span
                  className={`absolute left-0 block h-px w-5 bg-current transition-transform duration-300 ${
                    mobile ? "top-1.5 rotate-45" : "top-0"
                  }`}
                />
                <span
                  className={`absolute left-0 block h-px w-5 bg-current transition-transform duration-300 ${
                    mobile ? "top-1.5 -rotate-45" : "top-3"
                  }`}
                />
              </span>
            </button>
          </div>
        </div>
      </header>

      <div
        className={`fixed inset-0 z-40 bg-paper transition-[opacity,visibility] duration-300 lg:hidden ${
          mobile ? "visible opacity-100" : "invisible opacity-0"
        }`}
      >
        <div className="h-16 md:h-[4.5rem]" />
        <nav className="shell flex h-[calc(100dvh-4rem)] flex-col pt-8 pb-10" aria-label="เมนูมือถือ">
          <div className="flex flex-col">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={pathname === item.href ? "page" : undefined}
                className="flex min-h-14 items-center justify-between border-b border-line text-[1.05rem] text-ink"
              >
                {item.title}
                <span aria-hidden className="text-ink-4">→</span>
              </Link>
            ))}
          </div>
          <div className="mt-auto grid gap-3 pt-8">
            <Link href="/contact" className="btn btn-primary w-full">
              ทดลองกับข้อมูลจริง
            </Link>
            <Link href="/app" className="btn btn-ghost w-full">
              เข้าสู่ระบบ
            </Link>
          </div>
        </nav>
      </div>
    </>
  );
}
