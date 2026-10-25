import Link from "next/link";

/* ── เครื่องหมายแบรนด์ ──────────────────────────────────────────

   อยู่แยกจาก components/ui.tsx เพราะโลโก้เป็นของทั้งผลิตภัณฑ์
   ส่วน ui.tsx เป็นไลบรารีของฝั่งเว็บการตลาดโดยเฉพาะ (PageHero ·
   Quote · CTA · SignalField — 600 กว่าบรรทัดที่คอนโซลไม่ได้ใช้เลย)

   เดิมเมนูข้างของคอนโซล import Mark จาก ui.tsx ซึ่งลาก
   ทั้งโมดูลของฝั่งการตลาดเข้ามาในกราฟของคอนโซลเพื่อเอา svg ตัวเดียว
   เป็นเส้นเดียวที่ลากผิดระหว่างสองฝั่ง ตอนนี้ทั้งคู่ชี้มาที่ไฟล์นี้ */

/* ── แผน H §3.6 — ภูเขาสองลูกเหลื่อมกัน ──
   parallax = สิ่งเดียวกันที่มองจากสองมุม · สองสามเหลี่ยมทึบซ้อนกันด้วย
   evenodd ส่วนที่ทับกันจึงกลายเป็นช่องว่าง · ทึบพอที่จะไม่หายเมื่อย่อเหลือ 16px
   (ของเดิมเป็นเส้น 1.1px ที่หายไปทุกครั้งที่ย่อ) และเป็นรูปทรงเดียวกับภาพ Ridge */
export function Mark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M1.5 20 L8.5 6 L15.5 20 Z M8.5 20 L15.5 6 L22.5 20 Z"
      />
    </svg>
  );
}

export function Wordmark({
  className = "",
  href = "/",
}: {
  className?: string;
  href?: string;
}) {
  return (
    <Link
      href={href}
      className={`group inline-flex min-h-11 items-center gap-2.5 ${className}`}
      aria-label="Parallax — หน้าแรก"
    >
      <Mark className="h-6 w-6 shrink-0 transition-transform duration-500 group-hover:-translate-y-0.5" />
      <span className="text-[1.15rem] font-semibold tracking-[-0.02em]">Parallax</span>
    </Link>
  );
}

/* ── Ridge — ภาพศิลป์ของแบรนด์ (docs/brand-plan.md §3.3) ─────────────────

   ท้องฟ้าใส → พีช → สันเขาม่วง-น้ำเงิน · ชมพูบานเย็น · แถบมะกอกบาง ๆ · ส้มแดงด้านหน้า
   แล้วโรยเกรนแบบงานพิมพ์ (.grain) — สีของแบรนด์อยู่ที่นี่ที่เดียว หน้าจอทำงานเป็นขาว-ดำ

   SVG ล้วน ไม่มีไฟล์ภาพ: คมทุกขนาดจอ ไม่กินแบนด์วิดท์ และไม่ต้องแตะ img-src ของ CSP
   ท้องฟ้าโปร่งที่ขอบบน — วางบนพื้นอะไรก็กลืน (ขาวของเว็บ · เทาของคอนโซล · ธีมมืด)
   ห้ามวางตัวหนังสือยาวทับส่วนภูเขา: อ่านไม่ออก · วางได้เฉพาะบนส่วนท้องฟ้า

   id ของ gradient ตายตัว — สองภาพในหน้าเดียวกันใช้นิยามเดียวกันได้เพราะเหมือนกันทุกตัว */
export function Ridge({ className = "", grain = true }: { className?: string; grain?: boolean }) {
  return (
    <div className={`ridge ${className}`} aria-hidden>
      <svg viewBox="0 0 1440 560" preserveAspectRatio="xMidYMax slice" className="h-full w-full">
        <defs>
          <linearGradient id="rg-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fbe9e4" stopOpacity="0" />
            <stop offset="0.45" stopColor="#fbe9e4" stopOpacity="0.7" />
            <stop offset="0.7" stopColor="#f9d3dc" />
          </linearGradient>
          <linearGradient id="rg-violet" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#9a8cff" />
            <stop offset="0.5" stopColor="#6a5cff" />
            <stop offset="1" stopColor="#3b4fd8" />
          </linearGradient>
          <linearGradient id="rg-pink" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#ff3d8b" />
            <stop offset="0.45" stopColor="#e0359a" />
            <stop offset="1" stopColor="#7c4dff" stopOpacity="0.85" />
          </linearGradient>
          <linearGradient id="rg-ember" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ff4a1c" />
            <stop offset="0.55" stopColor="#e2381f" />
            <stop offset="1" stopColor="#9c2a2a" />
          </linearGradient>
          <filter id="rg-soft" x="-5%" y="-20%" width="110%" height="140%">
            <feGaussianBlur stdDeviation="9" />
          </filter>
        </defs>
        <rect width="1440" height="560" fill="url(#rg-sky)" />
        <g filter="url(#rg-soft)">
          <path fill="url(#rg-violet)" d="M0 330 C 220 300 360 205 560 212 C 760 219 880 300 1040 292 C 1200 284 1320 228 1440 236 L1440 560 L0 560 Z" />
          <path fill="url(#rg-pink)" opacity="0.92" d="M0 372 C 160 352 270 392 430 404 C 610 418 720 352 910 372 C 1090 392 1250 436 1440 414 L1440 560 L0 560 Z" />
          <path fill="none" stroke="#c9c26a" strokeWidth="26" opacity="0.5" d="M0 468 C 300 436 600 520 900 468 S 1300 448 1440 478" />
          <path fill="url(#rg-ember)" d="M0 478 C 200 458 380 506 620 510 C 860 514 1060 474 1260 484 C 1360 489 1420 502 1440 506 L1440 560 L0 560 Z" />
        </g>
      </svg>
      {grain && <div className="grain grain--ridge" />}
    </div>
  );
}
