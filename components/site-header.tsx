"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { NAV } from "./nav";
import { Wordmark } from "@/components/brand";

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [mobile, setMobile] = useState(false);
  const pathname = usePathname();
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setMobile(false);
    setOpen(null);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = mobile ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobile]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(null);
        setMobile(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const hover = (title: string | null) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    if (title === null) {
      closeTimer.current = setTimeout(() => setOpen(null), 140);
    } else {
      setOpen(title);
    }
  };

  const solid = scrolled || open !== null;

  /* ── header บน hero เข้ม ──
     หน้าแรกมี hero พื้นเข้ม ถ้า header ยังใช้สีหมึกเข้มตอนยังไม่เลื่อน
     โลโก้กับเมนูจะจมหายไปในพื้นหลัง (เข้มบนเข้ม) ตรวจจากเส้นทาง
     ไม่ใช่จากการวัดสีพื้นหลังจริง เพราะการวัดต้องรอ layout
     แล้วจะเห็นโลโก้กะพริบสลับสีตอนโหลด */
  const overDark = pathname === "/" && !solid;
  const ink = overDark ? "text-frost" : "text-ink";
  const ink2 = overDark
    ? "text-frost/72 hover:text-frost"
    : "text-ink-2 hover:text-ink";

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-500 ${
          solid
            ? "border-b border-line bg-paper/88 backdrop-blur-xl"
            : "border-b border-transparent bg-transparent"
        }`}
        onMouseLeave={() => hover(null)}
      >
        <div className="shell flex h-16 items-center justify-between gap-8 md:h-[4.5rem]">
          <Wordmark className={ink} />

          {/* desktop nav */}
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
            {NAV.map((item) =>
              item.children ? (
                <div key={item.title} onMouseEnter={() => hover(item.title)}>
                  <button
                    type="button"
                    aria-expanded={open === item.title}
                    onClick={() =>
                      setOpen(open === item.title ? null : item.title)
                    }
                    className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[0.875rem] transition-colors duration-300 ${ink2}`}
                  >
                    {item.title}
                    <svg
                      viewBox="0 0 10 6"
                      className={`h-[5px] w-[9px] transition-transform duration-300 ${
                        open === item.title ? "rotate-180" : ""
                      }`}
                      fill="none"
                      aria-hidden
                    >
                      <path
                        d="M1 1l4 4 4-4"
                        stroke="currentColor"
                        strokeWidth="1.3"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </div>
              ) : (
                <Link
                  key={item.href}
                  href={item.href!}
                  className={`rounded-full px-3.5 py-2 text-[0.875rem] transition-colors duration-300 ${
                    pathname === item.href
                      ? overDark
                        ? "text-cyan"
                        : "text-signal"
                      : ink2
                  }`}
                >
                  {item.title}
                </Link>
              ),
            )}
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/app"
              className={`hidden h-9 items-center rounded-full border px-4 text-[0.82rem] font-medium transition-colors duration-300 sm:inline-flex ${
                overDark
                  ? "border-frost/30 text-frost hover:border-frost/70"
                  : "border-line text-ink hover:border-ink-3"
              }`}
            >
              Console
            </Link>
            <Link
              href="/contact"
              className={`hidden h-9 items-center rounded-full px-4 text-[0.82rem] font-medium transition-colors duration-300 md:inline-flex ${
                "bg-signal text-white hover:bg-signal-2"
              }`}
            >
              Start a pilot
            </Link>

            {/* mobile toggle */}
            <button
              type="button"
              onClick={() => setMobile((v) => !v)}
              aria-label={mobile ? "Close menu" : "Open menu"}
              aria-expanded={mobile}
              className={`-mr-2 flex h-10 w-10 items-center justify-center lg:hidden ${ink}`}
            >
              <span className="relative block h-3 w-5">
                <span
                  className={`absolute left-0 block h-px w-5 bg-current transition-transform duration-400 ${
                    mobile ? "top-1.5 rotate-45" : "top-0"
                  }`}
                />
                <span
                  className={`absolute left-0 block h-px w-5 bg-current transition-transform duration-400 ${
                    mobile ? "top-1.5 -rotate-45" : "top-3"
                  }`}
                />
              </span>
            </button>
          </div>
        </div>

        {/* desktop dropdown */}
        {NAV.filter((i) => i.children).map((item) => (
          <div
            key={item.title}
            onMouseEnter={() => hover(item.title)}
            className={`absolute inset-x-0 top-full hidden overflow-hidden border-b border-line bg-paper/95 backdrop-blur-xl transition-[max-height,opacity] duration-400 lg:block ${
              open === item.title
                ? "max-h-96 opacity-100"
                : "pointer-events-none max-h-0 opacity-0"
            }`}
          >
            <div className="shell py-8">
              {/* สามคอลัมน์ ไม่ใช่ห้า — กลุ่มในเมนูมีลูก 6 · 3 · 3
                  จึงลงเป็น 2 แถว · 1 แถว · 1 แถว พอดีทุกกลุ่ม
                  กริดห้าคอลัมน์ทำให้กลุ่มที่มีหกใบเหลือเศษใบเดียวห้อยอยู่ */}
              <div className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-3">
                {item.children!.map((c) => (
                  <Link
                    key={c.href}
                    href={c.href}
                    className="group bg-paper p-5 transition-colors duration-300 hover:bg-white"
                  >
                    <span className="block text-[0.95rem] font-medium text-ink transition-colors group-hover:text-signal">
                      {c.title}
                    </span>
                    <span className="t-small mt-2 block text-ink-3">{c.desc}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        ))}
      </header>

      {/* mobile drawer */}
      <div
        className={`fixed inset-0 z-40 bg-paper transition-[opacity,visibility] duration-400 lg:hidden ${
          mobile ? "visible opacity-100" : "invisible opacity-0"
        }`}
      >
        <div className="h-16 md:h-[4.5rem]" />
        <nav
          className="shell h-[calc(100dvh-4rem)] overflow-y-auto pt-6 pb-16"
          aria-label="Mobile menu"
        >
          {NAV.map((item) => (
            <div key={item.title} className="border-b border-line py-6">
              {item.href ? (
                <Link href={item.href} className="t-h3 block text-ink">
                  {item.title}
                </Link>
              ) : (
                <>
                  <p className="t-label text-ink-4">{item.title}</p>
                  <div className="mt-5 flex flex-col gap-4">
                    {item.children!.map((c) => (
                      <Link
                        key={c.href}
                        href={c.href}
                        className="flex flex-col"
                      >
                        <span className="text-[1.05rem] text-ink">{c.title}</span>
                        <span className="t-small text-ink-3">{c.desc}</span>
                      </Link>
                    ))}
                  </div>
                </>
              )}
            </div>
          ))}
          <div className="mt-8 flex flex-col gap-3">
            <Link href="/contact" className="btn btn-primary w-full">
              Start a pilot
            </Link>
            <Link href="/app" className="btn btn-ghost w-full">
              Console
            </Link>
          </div>
        </nav>
      </div>
    </>
  );
}
