import type { Metadata } from "next";
import Link from "next/link";
import "../(app)/console.css";
import { Mark, Ridge } from "@/components/brand";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/* ── ประตูก่อนเข้าคอนโซล: สมัคร · ตั้งค่าบัญชี · อัปเกรด (docs/solo-plan.md S9) ──

   อยู่นอกกลุ่ม (app) ด้วยเหตุผลเดียวกับหน้าเข้าสู่ระบบ — layout ของคอนโซลมีแถบข้างที่สมมติว่ามีบัญชีแล้ว
   และ layout นั้นเป็นตัว redirect มาที่นี่ (ยังตั้งค่าไม่ครบ · หมดช่วงทดลอง) ถ้าหน้าพวกนี้อยู่ข้างในจะวนตัวเอง
   ใช้สไตล์และ CSP ของคอนโซล (proxy.ts) ไม่ใช่ของเว็บการตลาด */
export default function GateLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="console">
      <div className="c-shell relative isolate flex min-h-dvh justify-center overflow-hidden p-6 pb-40">
        <Ridge className="top-auto h-[11rem] md:h-[14rem]" />
        <div className="relative z-[1] w-full max-w-2xl py-6">
          <Link href="/" className="flex w-fit items-center gap-2.5 text-[var(--c-text)]" aria-label="กลับหน้าเว็บ Parallax">
            <Mark className="h-5 w-5" />
            <span className="text-[0.95rem] font-semibold tracking-[-0.02em]">Parallax</span>
          </Link>
          <div className="mt-9">{children}</div>
        </div>
      </div>
    </div>
  );
}
