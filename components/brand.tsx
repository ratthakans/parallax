import Link from "next/link";

/* ── เครื่องหมายแบรนด์ ──────────────────────────────────────────

   อยู่แยกจาก components/ui.tsx เพราะโลโก้เป็นของทั้งผลิตภัณฑ์
   ส่วน ui.tsx เป็นไลบรารีของฝั่งเว็บการตลาดโดยเฉพาะ (PageHero ·
   Quote · CTA · SignalField — 600 กว่าบรรทัดที่คอนโซลไม่ได้ใช้เลย)

   เดิม components/console/nav.tsx import Mark จาก ui.tsx ซึ่งลาก
   ทั้งโมดูลของฝั่งการตลาดเข้ามาในกราฟของคอนโซลเพื่อเอา svg ตัวเดียว
   เป็นเส้นเดียวที่ลากผิดระหว่างสองฝั่ง ตอนนี้ทั้งคู่ชี้มาที่ไฟล์นี้ */

export function Mark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden
      strokeLinecap="round"
    >
      <path d="M3 19.5 L12 4.5 L21 19.5" stroke="currentColor" strokeWidth="1.1" />
      <path d="M3 19.5 L21 19.5" stroke="currentColor" strokeWidth="1.1" opacity="0.35" />
      <circle cx="12" cy="4.5" r="1.9" fill="currentColor" />
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
      className={`group inline-flex items-center gap-2.5 ${className}`}
      aria-label="PARALLAX — home"
    >
      <Mark className="h-5 w-5 shrink-0 transition-transform duration-500 group-hover:-translate-y-0.5" />
      <span className="text-[0.95rem] font-medium tracking-[0.24em]">PARALLAX</span>
    </Link>
  );
}
