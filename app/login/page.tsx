import type { Metadata } from "next";
import { LoginForm } from "@/components/console/login-form";
import { Mark } from "@/components/brand";

export const metadata: Metadata = {
  title: "เข้าสู่ระบบ · PARALLAX",
  /* หน้าเข้าสู่ระบบไม่ควรอยู่ในผลค้นหา */
  robots: { index: false, follow: false },
};

/* ── หน้าเข้าสู่ระบบ ────────────────────────────────────────────

   อยู่นอกกลุ่ม (app) โดยตั้งใจ เพราะ layout ของคอนโซลมีแถบข้าง เมนู
   และตัวสลับบัญชี ซึ่งทั้งหมดสมมติว่ารู้แล้วว่าใครล็อกอินอยู่ —
   หน้านี้คือหน้าที่ยังไม่รู้

   ใช้สีและตัวอักษรของคอนโซล ไม่ใช่ของเว็บการตลาด เพราะนี่คือประตู
   เข้าเครื่องมือทำงาน ไม่ใช่หน้าขาย
   ───────────────────────────────────────────────────────────── */

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <div className="c-shell flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 text-[var(--c-text)]">
          <Mark className="h-5 w-5" />
          <span className="text-[0.95rem] font-medium tracking-[0.24em]">
            PARALLAX
          </span>
        </div>

        <h1 className="c-h1 mt-9 text-[var(--c-text)]">เข้าสู่ระบบ</h1>
        <p className="c-thai mt-3 text-[0.88rem] leading-relaxed text-[var(--c-text-3)]">
          คอนโซลนี้เปิดเฉพาะบัญชีที่ได้รับเชิญ
        </p>

        <div className="mt-8">
          <LoginForm next={next} />
        </div>

        <p className="c-thai mt-8 text-[0.76rem] leading-relaxed text-[var(--c-text-4)]">
          ยังไม่มีบัญชี? ติดต่อคนที่ดูแลบัญชีของร้านคุณเพื่อขอคำเชิญ —
          ระบบนี้ยังไม่เปิดให้สมัครเอง
        </p>
      </div>
    </div>
  );
}
