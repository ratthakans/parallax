"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Mark } from "@/components/brand";

/* ── แถบบนของคอนโซล (docs/ux-plan.md U1 · แบบ Salesforce) ─────────────────

   แทนเมนูซ้าย 4 กลุ่ม 13 รายการเดิม:
     แถวบน  โลโก้ · ค้นหารวม · + ใหม่ · ⚙ ตั้งค่า · บัญชี/ผู้ใช้
     แถวล่าง แท็บตามชนิดข้อมูลที่คนขายใช้ทุกวัน — หน้าแรก · บริษัท · ผู้ติดต่อ · แคมเปญ · รายงาน
   งานกำกับข้อมูล (นำเข้า · ตรวจข้อมูลซ้ำ · วัตถุประสงค์ · คำขอสิทธิ · ส่งออก) อยู่หลัง ⚙ —
   หน้าเหล่านั้นตรวจสิทธิ์เองอยู่แล้ว เมนูเป็นแค่ทางเข้า ไม่ใช่ด่าน */

type TenantOption = { id: string; name: string; industry: string };

const Gear = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const Person = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
  </svg>
);

const TABS = [
  { href: "/app/today", label: "หน้าแรก" },
  { href: "/app/accounts", label: "บริษัท" },
  { href: "/app/customers", label: "ผู้ติดต่อ" },
  { href: "/app/deals", label: "ดีล" },
  { href: "/app/tasks", label: "งาน" },
  { href: "/app/sales", label: "แคมเปญ" },
  { href: "/app/reports", label: "รายงาน" },
];

/* หน้าตั้งค่าที่อยู่ใต้เส้นทางของแท็บ — ต้องไม่ทำให้แท็บนั้นติดสถานะ */
const SETUP_PATHS = ["/app/sales/purposes"];

const NEW_ITEMS = [
  { href: "/app/customers/new", label: "ผู้ติดต่อ" },
  { href: "/app/deals/new", label: "ดีล" },
  { href: "/app/tasks#new", label: "งาน" },
  { href: "/app/sales#new", label: "แคมเปญ" },
  { href: "/app/vault/cards", label: "นามบัตร" },
  { href: "/app/requests", label: "คำขอสิทธิ" },
];

const SETUP_GROUPS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "ข้อมูล",
    links: [
      { href: "/app", label: "ภาพรวมข้อมูล" },
      { href: "/app/data", label: "สุขภาพข้อมูล" },
      { href: "/app/data/update", label: "อัปเดตบริษัทจากไฟล์" },
      { href: "/app/data/trash", label: "ถังขยะ" },
      { href: "/app/vault", label: "นำเข้าข้อมูล" },
      { href: "/app/vault/review", label: "ตรวจข้อมูลซ้ำ" },
      { href: "/app/vault/cards", label: "นามบัตร" },
    ],
  },
  {
    title: "ความเป็นส่วนตัว",
    links: [
      { href: "/app/sales/purposes", label: "วัตถุประสงค์และอายุข้อมูล" },
      { href: "/app/requests", label: "คำขอสิทธิ" },
      { href: "/app/exports", label: "ส่งออกข้อมูล" },
    ],
  },
  {
    title: "ระบบ",
    links: [
      { href: "/app/settings", label: "ตั้งค่าและความปลอดภัย" },
      { href: "/app/settings/fields", label: "ฟิลด์ของบัญชี" },
      { href: "/app/settings/teams", label: "ทีมและเขตการขาย" },
      { href: "/app/admin", label: "ผู้ดูแลระบบ" },
    ],
  },
];

/* เมนูลอย: เปิดด้วยปุ่ม · ปิดเมื่อคลิกข้างนอก กด Esc หรือเปลี่ยนหน้า */
function Menu({ label, button, children, wide }: { label: string; button: ReactNode; children: (close: () => void) => ReactNode; wide?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div className="c-menu" ref={ref}>
      <button type="button" aria-label={label} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((v) => !v)} className="c-btn c-btn-ghost c-btn-sm">
        {button}
      </button>
      {open && <div className={`c-menu__panel ${wide ? "min-w-[17rem]" : ""}`} role="menu">{children(() => setOpen(false))}</div>}
    </div>
  );
}

export function AppBar({
  tenantId, tenantName, industry, tenants, switchAction, userEmail, signOutAction, theme, setThemeAction,
}: {
  tenantId: string;
  tenantName: string;
  industry: string;
  tenants: TenantOption[];
  switchAction: (formData: FormData) => void | Promise<void>;
  userEmail?: string;
  signOutAction?: () => void | Promise<void>;
  theme: "light" | "dark";
  setThemeAction: (formData: FormData) => void | Promise<void>;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [q, setQ] = useState("");

  /* แท็บที่ตรงยาวที่สุดชนะ — /app/sales/weekly ไม่ทำให้ "แคมเปญ" ติดด้วย · หน้าตั้งค่าไม่ทำให้แท็บไหนติด */
  const matches = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const inSetup = SETUP_PATHS.some(matches);
  const isActive = (href: string) => !inSetup && matches(href) && !TABS.some((t) => t.href.length > href.length && t.href.startsWith(href) && matches(t.href));

  return (
    <header className="c-appbar">
      <div className="c-appbar__row">
        <Link href="/app/today" className="flex shrink-0 items-center gap-2 text-[var(--c-text)]" aria-label="PARALLAX หน้าแรก">
          <Mark className="h-4 w-4 text-[var(--c-accent)]" />
          <span className="hidden text-[0.8rem] font-semibold tracking-[0.18em] sm:inline">PARALLAX</span>
        </Link>

        <form
          role="search"
          className="c-search"
          onSubmit={(e) => { e.preventDefault(); const v = q.trim(); if (v) router.push(`/app/search?q=${encodeURIComponent(v)}`); }}
        >
          <input
            type="search"
            name="q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหาบริษัท ผู้ติดต่อ แคมเปญ…"
            aria-label="ค้นหาทั้งระบบ"
            autoComplete="off"
            maxLength={120}
          />
        </form>

        <Menu label="สร้างใหม่" button={<span>+<span className="hidden sm:inline"> ใหม่</span></span>}>
          {(close) => (
            <>
              <p className="c-menu__label">สร้างใหม่</p>
              {NEW_ITEMS.map((i) => (
                <Link key={i.href} href={i.href} className="c-navlink" role="menuitem" onClick={close}>{i.label}</Link>
              ))}
            </>
          )}
        </Menu>

        <Menu label="ตั้งค่า" button={<Gear />} wide>
          {(close) => (
            <>
              {SETUP_GROUPS.map((g) => (
                <div key={g.title}>
                  <p className="c-menu__label">{g.title}</p>
                  {g.links.map((l) => (
                    <Link key={l.href} href={l.href} className="c-navlink" role="menuitem" data-active={pathname === l.href} onClick={close}>{l.label}</Link>
                  ))}
                </div>
              ))}
            </>
          )}
        </Menu>

        <Menu label="บัญชีและผู้ใช้" button={<><Person /><span className="hidden max-w-[9rem] truncate md:inline">{tenantName}</span></>} wide>
          {(close) => (
            <>
              <p className="c-menu__label">บัญชีที่กำลังดู</p>
              <p className="px-3 text-[0.88rem] text-[var(--c-text)]">{tenantName}</p>
              <p className="px-3 pb-2 text-[0.75rem] text-[var(--c-text-4)]">{industry}</p>
              {tenants.length > 1 && (
                <>
                  <p className="c-menu__label">สลับบัญชี</p>
                  {tenants.filter((t) => t.id !== tenantId).map((t) => (
                    <form key={t.id} action={switchAction} onSubmit={close}>
                      <input type="hidden" name="tenantId" value={t.id} />
                      <button type="submit" className="c-navlink w-full text-left" role="menuitem">
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate">{t.name}</span>
                          <span className="truncate text-[0.72rem] text-[var(--c-text-4)]">{t.industry}</span>
                        </span>
                      </button>
                    </form>
                  ))}
                </>
              )}
              <hr className="c-hair my-1.5" />
              <form action={setThemeAction}>
                <input type="hidden" name="theme" value={theme === "dark" ? "light" : "dark"} />
                <button type="submit" className="c-navlink w-full text-left" role="menuitem">
                  {theme === "dark" ? "ใช้ธีมสว่าง" : "ใช้ธีมมืด"}
                </button>
              </form>
              {userEmail && (
                <>
                  <p className="c-menu__label">เข้าสู่ระบบในนาม</p>
                  <p className="c-mono break-all px-3 pb-1 text-[0.75rem] text-[var(--c-text-2)]">{userEmail}</p>
                  {signOutAction && (
                    <form action={signOutAction}>
                      <button type="submit" className="c-navlink w-full text-left" role="menuitem">ออกจากระบบ</button>
                    </form>
                  )}
                </>
              )}
              <Link href="/" className="c-navlink" role="menuitem" onClick={close}>← กลับไปหน้าเว็บ</Link>
            </>
          )}
        </Menu>
      </div>

      <nav className="c-tabs" aria-label="เมนูหลัก">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} className="c-tab" data-active={isActive(t.href)} aria-current={isActive(t.href) ? "page" : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
