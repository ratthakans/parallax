import type { Metadata } from "next";
import { LoginForm } from "@/components/console/login-form";
import { Mark, Ridge } from "@/components/brand";
import Link from "next/link";
import { signupEnabled } from "@/lib/shared/signup";

export const metadata: Metadata = {
  title: "เข้าสู่ระบบ",
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
  const signup = signupEnabled();

  return (
    <div className="c-shell relative isolate flex min-h-dvh items-center justify-center overflow-hidden p-6 pb-40">
      {/* แผน H: ภาพ Ridge ที่ขอบล่าง — ประตูเข้าใช้แบรนด์เดียวกับหน้าเว็บ */}
      <Ridge className="top-auto h-[11rem] md:h-[14rem]" />
      <div className="relative z-[1] w-full max-w-sm">
        {/* โลโก้พากลับหน้าเว็บ — คนที่กดปุ่ม "เข้าสู่ระบบ" มาโดยยังไม่มีบัญชี
            เดิมไม่มีทางกลับนอกจากปุ่มย้อนกลับของเบราว์เซอร์ */}
        <Link href="/" className="flex w-fit items-center gap-2.5 text-[var(--c-text)]" aria-label="กลับหน้าเว็บ Parallax">
          <Mark className="h-5 w-5" />
          <span className="text-[0.95rem] font-semibold tracking-[-0.02em]">
            Parallax
          </span>
        </Link>

        <h1 className="c-h1 mt-9 text-[var(--c-text)]">เข้าสู่ระบบ</h1>
        <p className="c-thai mt-3 text-[0.88rem] leading-relaxed text-[var(--c-text-3)]">
          {signup ? "เข้าสู่ระบบด้วยบัญชีที่ได้รับเชิญหรือบัญชีที่สมัครทดลองใช้" : "คอนโซลนี้เปิดเฉพาะบัญชีที่ได้รับเชิญ"}
        </p>

        <div className="mt-8">
          <LoginForm next={next} />
        </div>

        {/* สองทางออกที่เคยเป็นทางตัน: ยังไม่มีบัญชี กับ ลืมรหัสผ่าน
            ทั้งคู่ไปที่ฟอร์มติดต่อ ซึ่งตอนนี้เก็บทุกข้อความลงฐานแล้ว (contact_leads) */}
        <div className="c-thai mt-8 flex flex-col gap-2.5 text-[0.82rem] leading-relaxed text-[var(--c-text-3)]">
          {signup ? (
            <p>
              ยังไม่มีบัญชี?{" "}
              <Link href="/signup" className="text-[var(--c-cyan)] underline underline-offset-4">
                สมัครทดลองใช้ 14 วัน
              </Link>{" "}
              (ข้อมูลสมมุติเท่านั้น)
            </p>
          ) : (
            <p>
              ยังไม่มีบัญชี? ระบบนี้เปิดให้ใช้ผ่านคำเชิญ —{" "}
              <Link href="/contact" className="text-[var(--c-cyan)] underline underline-offset-4">
                ขอทดลองใช้
              </Link>
            </p>
          )}
          <p>
            ลืมรหัสผ่าน?{" "}
            <Link href="/contact" className="text-[var(--c-cyan)] underline underline-offset-4">
              แจ้งเรา
            </Link>{" "}
            พร้อมอีเมลที่ใช้เข้าระบบ แล้วเราจะตั้งรหัสใหม่ให้
          </p>
          <p>
            <Link href="/" className="underline underline-offset-4">← กลับหน้าเว็บ</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
