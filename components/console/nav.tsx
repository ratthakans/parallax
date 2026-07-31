"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Mark } from "@/components/brand";

/* คำเรียกคนในฐานต่างกันทุกบัญชี เมนูจึงรับมาเป็น prop
   ไม่ใช่เขียน "ฐานลูกค้า" ตายตัว — หน้าจอของพรรคต้องอ่านว่า ทะเบียนสมาชิก

   vocab เก็บคำไว้เป็นตัวพิมพ์เล็กเพราะที่อื่นใช้กลางประโยค ("ส่งถึง
   customer base ทั้งหมด") แต่ในเมนูมันไปยืนข้าง Morning Brief · Campaigns ·
   Play library แล้วอ่านเหมือนพิมพ์ตกหล่น จึงขึ้นต้นด้วยตัวใหญ่ตรงนี้ */
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function groupsFor(baseLabel: string, personLabel: string) {
  return [
    {
      title: "Daily",
      links: [
        { href: "/app", label: "Morning Brief", hint: "Three moves for today" },
        { href: "/app/campaigns", label: "Campaigns", hint: "Approved · measuring" },
        { href: "/app/proof", label: "Proof", hint: "The difference, and the verdict" },
      ],
    },
    {
      title: "Data and engine",
      links: [
        {
          href: "/app/customers",
          label: sentence(baseLabel),
          hint: `Per-${personLabel} figures`,
        },
        // จำนวน play ที่ใช้ได้ขึ้นกับรูปทรงวงจรของบัญชี จึงไม่ตรึงเลขไว้
        { href: "/app/plays", label: "Play library", hint: "Every move the system knows" },
        { href: "/app/import", label: "Import", hint: "Drag a CSV in" },
      ],
    },
    {
      title: "Control",
      links: [
        { href: "/app/billing", label: "Billing", hint: "Plan · credits · is it paying" },
        { href: "/app/settings", label: "Settings", hint: "Limits · AI · demo tools" },
      ],
    },
  ];
}

type TenantOption = { id: string; name: string; industry: string };

export function ConsoleNav({
  tenantId,
  tenantName,
  industry,
  credits,
  planName,
  computedAt,
  tenants,
  switchAction,
  baseLabel,
  personLabel,
}: {
  tenantId: string;
  tenantName: string;
  industry: string;
  credits: number;
  planName: string;
  computedAt: string | null;
  tenants: TenantOption[];
  switchAction: (formData: FormData) => void | Promise<void>;
  baseLabel: string;
  personLabel: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const groups = groupsFor(baseLabel, personLabel);

  const isActive = (href: string) =>
    href === "/app" ? pathname === "/app" : pathname.startsWith(href);

  return (
    <aside className="c-side">
      <div className="c-topbar">
        <div className="flex items-center justify-between gap-3 px-4 py-4 lg:px-5">
          <Link
            href="/app"
            className="flex min-h-9 min-w-0 items-center gap-2.5 text-[var(--c-text)]"
          >
            <Mark className="h-4 w-4 shrink-0 text-[var(--c-cyan)]" />
            <span className="truncate text-[0.82rem] font-medium tracking-[0.2em]">
              PARALLAX
            </span>
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="console-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            className="c-btn c-btn-ghost c-btn-sm lg:hidden"
          >
            Menu
          </button>
        </div>
        <hr className="c-hair" />
      </div>

      <div
        id="console-nav"
        data-open={open}
        className={`c-navpanel ${open ? "block" : "hidden"} lg:block`}
      >
        {/* ── ตัวสลับบัญชี ──
            ของเดโมเท่านั้น ระบบจริงต้องอ่านบัญชีจาก session ของผู้ใช้
            และตรวจสิทธิ์ ไม่ใช่ให้เลือกเองจากรายการ */}
        <div className="px-4 py-4 lg:px-5">
          <div className="flex items-baseline justify-between gap-2">
            <p className="c-label">account</p>
            <button
              type="button"
              onClick={() => setPickerOpen((x) => !x)}
              aria-expanded={pickerOpen}
              className="c-mono -mx-2 inline-flex min-h-9 items-center px-2 text-[0.68rem] text-[var(--c-cyan)]"
            >
              {pickerOpen ? "close" : "switch"}
            </button>
          </div>
          <p className="mt-2 text-[0.9rem] leading-snug text-[var(--c-text)]">
            {tenantName}
          </p>
          <p className="c-thai mt-1 text-[0.72rem] leading-snug text-[var(--c-text-4)]">
            {industry}
          </p>
          <p className="c-mono mt-2 text-[0.72rem] text-[var(--c-text-4)]">
            {planName} · {credits.toLocaleString("en-US")} credits
          </p>

          {pickerOpen && (
            <div className="mt-4 flex flex-col gap-1.5 border-t border-[var(--c-line)] pt-4">
              {tenants.map((t) => (
                <form key={t.id} action={switchAction}>
                  <input type="hidden" name="tenantId" value={t.id} />
                  <button
                    type="submit"
                    disabled={t.id === tenantId}
                    onClick={() => setPickerOpen(false)}
                    data-active={t.id === tenantId}
                    className="c-navlink w-full text-left disabled:opacity-100"
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{t.name}</span>
                      <span className="truncate text-[0.68rem] text-[var(--c-text-4)]">
                        {t.industry}
                      </span>
                    </span>
                  </button>
                </form>
              ))}
              <p className="c-thai mt-2 text-[0.68rem] leading-relaxed text-[var(--c-text-4)]">
                All four accounts are synthetic, chosen to cover the four revenue-cycle
                shapes — so you can see the engine predicting from the cycle rather
                than the industry.
              </p>
            </div>
          )}
        </div>

        <hr className="c-hair" />

        <nav className="flex flex-col gap-5 p-3 lg:p-3.5" aria-label="Console">
          {groups.map((g) => (
            <div key={g.title} className="flex flex-col gap-1">
              <p className="c-label px-3 pb-1.5 text-[0.62rem]">{g.title}</p>
              {g.links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  data-active={isActive(l.href)}
                  className="c-navlink"
                  onClick={() => setOpen(false)}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{l.label}</span>
                    <span className="truncate text-[0.7rem] text-[var(--c-text-4)]">
                      {l.hint}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <hr className="c-hair" />

        <div className="p-4 lg:p-5">
          <p className="c-label">feature table</p>
          <p className="c-mono mt-2 text-[0.72rem] leading-relaxed text-[var(--c-text-3)]">
            {computedAt
              ? `Last computed ${new Date(computedAt).toLocaleString("en-GB", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}`
              : "Not computed yet"}
          </p>
          <p className="c-thai mt-3 text-[0.72rem] text-[var(--c-text-4)]">
            Precomputed on a schedule, never live on page load
          </p>
        </div>

        <hr className="c-hair" />

        <div className="p-4 lg:p-5">
          <Link href="/" className="c-navlink px-0 text-[0.82rem]">
            ← Back to the site
          </Link>
        </div>
      </div>
    </aside>
  );
}
