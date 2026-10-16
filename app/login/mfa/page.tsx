import type { Metadata } from "next";
import Link from "next/link";
import { Mark } from "@/components/brand";
import { MfaCodeForm } from "@/components/console/mfa-code-form";
import { signOutAction } from "@/app/login/actions";

export const metadata: Metadata = { title: "ยืนยันตัวตนสองชั้น · PARALLAX", robots: { index: false, follow: false } };

/* ── ขั้นที่สองของการเข้าสู่ระบบ ── รหัสผ่านถูกแล้ว แต่บัญชีเปิดยืนยันสองชั้นไว้
   ระหว่างนี้คอนโซลเด้งกลับมาที่นี่ (layout) และ Server Action ปฏิเสธทุกอย่าง (viewer.ts) */
export default async function MfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="c-shell flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="flex w-fit items-center gap-2.5 text-[var(--c-text)]" aria-label="กลับหน้าเว็บ PARALLAX">
          <Mark className="h-5 w-5" />
          <span className="text-[0.95rem] font-medium tracking-[0.24em]">PARALLAX</span>
        </Link>
        <h1 className="c-h1 mt-9 text-[var(--c-text)]">ยืนยันตัวตนสองชั้น</h1>
        <p className="c-thai mt-3 text-[0.88rem] leading-relaxed text-[var(--c-text-3)]">
          เปิดแอปยืนยันตัวตน (เช่น Google Authenticator) แล้วใส่รหัส 6 หลักของ PARALLAX
        </p>
        <div className="mt-8"><MfaCodeForm next={next} /></div>
        <form action={signOutAction} className="c-thai mt-8 text-[0.82rem] text-[var(--c-text-3)]">
          ไม่มีโทรศัพท์อยู่ตอนนี้?{" "}
          <button type="submit" className="text-[var(--c-cyan)] underline underline-offset-4">ออกจากระบบ</button>{" "}
          แล้ว <Link href="/contact" className="underline underline-offset-4">แจ้งเรา</Link> ให้รีเซ็ตยืนยันสองชั้น
        </form>
      </div>
    </div>
  );
}
