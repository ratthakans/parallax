"use client";

import Link from "next/link";
import { thaiDateTime } from "@/lib/shared/format";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Mark } from "@/components/brand";

/* คำเรียกคนในฐานต่างกันทุกบัญชี เมนูจึงรับมาเป็น prop
   ไม่ใช่เขียน "ฐานลูกค้า" ตายตัว — หน้าจอของพรรคต้องอ่านว่า ทะเบียนสมาชิก

   vocab เก็บคำไว้เป็นตัวพิมพ์เล็กเพราะที่อื่นใช้กลางประโยค ("ส่งถึง
   customer base ทั้งหมด") แต่ในเมนูมันไปยืนข้าง Morning Brief · Campaigns ·
   Play library แล้วอ่านเหมือนพิมพ์ตกหล่น จึงขึ้นต้นด้วยตัวใหญ่ตรงนี้ */
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/* หัวข้อกลุ่มกับคำใบ้ต้องเป็นไทยเหมือนชื่อเมนูที่อยู่ใต้มัน
   ของเดิม "Data and engine" ยืนคร่อม "คลัง play" กับ "นำเข้าข้อมูล"
   และ hint ของเมนูแรกเป็น `Per-${personLabel} figures` ซึ่งประกอบจาก
   คำเอกพจน์อังกฤษ ทั้งที่เมนูข้าง ๆ พูดไทยหมด */
function groupsFor(baseLabelTh: string, personLabelTh: string) {
  /* เมนูตามแผน B2B (docs/plan.md · AXIS Blueprint 2.0): สามพื้นที่ + หน้าผู้ดูแล
     มีแค่ส่วนที่สร้างแล้ว — Account Workspace และ Campaign Workspace เข้าเมนูเมื่อหน้าพร้อม
     หน้าค้าปลีกเดิม (บรีฟเช้า แคมเปญ ผลที่วัดได้ คลัง play ค่าใช้จ่าย ภาพรวมผู้บริหาร) ออกจากเมนูแล้ว */
  return [
    {
      title: "Data Vault",
      links: [
        { href: "/app", label: "ภาพรวม", hint: "ตัวเลขที่นับได้จริงของฐาน" },
        {
          href: "/app/customers",
          label: baseLabelTh,
          hint: `ราย${personLabelTh} · ช่องทาง · ที่มา`,
        },
        { href: "/app/vault", label: "แหล่งข้อมูลและนำเข้า", hint: "ลงทะเบียนแหล่ง · Excel หรือ CSV" },
        { href: "/app/vault/review", label: "คิวตรวจตัวตน", hint: "คู่ที่อาจเป็นคนเดียวกัน · ย้อนการรวม" },
      ],
    },
    {
      title: "ควบคุม",
      links: [
        { href: "/app/settings", label: "ตั้งค่า", hint: "AI · เครื่องมือเดโม" },
        { href: "/app/admin", label: "ผู้ดูแลระบบ", hint: "บัญชี · ผู้ใช้ · คำขอทดลองใช้" },
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
  userEmail,
  signOutAction,
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
  userEmail?: string;
  signOutAction?: () => void | Promise<void>;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const groups = groupsFor(baseLabel, personLabel);

  /* ลิงก์ที่ตรงยาวที่สุดชนะ — /app/vault/review ไม่ทำให้ /app/vault ติดสถานะด้วย */
  const hrefs = groups.flatMap((g) => g.links.map((l) => l.href));
  const matches = (href: string) => (href === "/app" ? pathname === "/app" : pathname === href || pathname.startsWith(`${href}/`));
  const isActive = (href: string) => matches(href) && !hrefs.some((h) => h.length > href.length && h.startsWith(href) && matches(h));

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
            aria-label={open ? "ปิดเมนู" : "เปิดเมนู"}
            className="c-btn c-btn-ghost c-btn-sm lg:hidden"
          >
            เมนู
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
            <p className="c-label-th">บัญชีที่กำลังดู</p>
            <button
              type="button"
              onClick={() => setPickerOpen((x) => !x)}
              aria-expanded={pickerOpen}
              className="c-mono -mx-2 inline-flex min-h-9 items-center px-2 text-[0.75rem] text-[var(--c-cyan)]"
            >
              {pickerOpen ? "ปิด" : "สลับ"}
            </button>
          </div>
          <p className="mt-2 text-[0.9rem] leading-snug text-[var(--c-text)]">
            {tenantName}
          </p>
          <p className="c-thai mt-1 text-[0.75rem] leading-snug text-[var(--c-text-4)]">
            {industry}
          </p>
          <p className="c-mono mt-2 text-[0.75rem] text-[var(--c-text-4)]">
            {planName} · เครดิตข้อความ {credits.toLocaleString("th-TH")}
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
                      <span className={`truncate text-[0.75rem] ${t.id === tenantId ? "text-[var(--c-text-3)]" : "text-[var(--c-text-4)]"}`}>
                        {t.industry}
                      </span>
                    </span>
                  </button>
                </form>
              ))}
              <p className="c-thai mt-2 text-[0.75rem] leading-relaxed text-[var(--c-text-4)]">
                ทุกบัญชีเป็นข้อมูลสังเคราะห์ที่ครอบคลุมวงจรรายได้หลายรูปแบบ
                เพื่อแสดงว่าระบบคาดการณ์จากวงจรรายได้ ไม่ได้ดูแค่อุตสาหกรรม
              </p>
            </div>
          )}
        </div>

        <hr className="c-hair" />

        <nav className="flex flex-col gap-5 p-3 lg:p-3.5" aria-label="เมนูระบบจัดการ">
          {groups.map((g) => (
            <div key={g.title} className="flex flex-col gap-1">
              <p className="c-label px-3 pb-1.5 text-[0.75rem]">{g.title}</p>
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
                    {/* พื้นของลิงก์ที่เลือกอยู่สว่างกว่า — text-4 บนพื้นนั้นได้ 4.4:1 ไม่ถึง 4.5 */}
                    <span className={`truncate text-[0.75rem] ${isActive(l.href) ? "text-[var(--c-text-3)]" : "text-[var(--c-text-4)]"}`}>
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
          <p className="c-label-th">ตารางข้อมูลลูกค้า</p>
          <p className="c-mono mt-2 text-[0.75rem] leading-relaxed text-[var(--c-text-3)]">
            {computedAt
              ? thaiDateTime(computedAt)
              : "—"}
          </p>
          <p className="c-thai mt-3 text-[0.75rem] text-[var(--c-text-4)]">
            {computedAt ? "คำนวณล่าสุด" : "ยังไม่ได้คำนวณ"} — ระบบคำนวณไว้ล่วงหน้าเป็นรอบ
            ไม่ได้คำนวณสดตอนเปิดหน้า
          </p>
        </div>

        <hr className="c-hair" />

        {/* ── ใครล็อกอินอยู่ ──
            เดิมคอนโซลไม่บอกเลยว่ากำลังทำงานในนามใคร ซึ่งใช้ได้ตอนที่ทุกคน
            คือ "owner" แต่พอมีผู้ใช้จริงหลายคน การไม่รู้ว่าตัวเองเป็นใคร
            คือจุดเริ่มของการกดผิดบัญชี */}
        {userEmail && (
          <>
            <div className="p-4 lg:p-5">
              <p className="c-label-th">เข้าสู่ระบบในนาม</p>
              <p className="c-mono mt-2 text-[0.75rem] break-all text-[var(--c-text-2)]">
                {userEmail}
              </p>
              {signOutAction && (
                <form action={signOutAction} className="mt-3">
                  <button type="submit" className="c-btn c-btn-ghost c-btn-sm">
                    ออกจากระบบ
                  </button>
                </form>
              )}
            </div>
            <hr className="c-hair" />
          </>
        )}

        <div className="p-4 lg:p-5">
          <Link href="/" className="c-navlink px-0 text-[0.82rem]">
            ← กลับไปหน้าเว็บ
          </Link>
        </div>
      </div>
    </aside>
  );
}
