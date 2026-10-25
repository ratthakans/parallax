import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { currentUser } from "@/lib/shared/session";
import { membershipEnforced } from "@/lib/engine/access";
import { signupInfo } from "@/lib/engine/signup/gate";
import { activeTenantId } from "@/app/(app)/tenant";
import { signOutAction } from "@/app/login/actions";
import { thaiDate } from "@/lib/shared/format";

export const metadata: Metadata = { title: "อัปเกรด", robots: { index: false, follow: false } };

/* ── อัปเกรดจากช่วงทดลอง (docs/solo-plan.md S9 ข้อ 4–5) ──
   ยังไม่มีระบบรับชำระเงิน (ยังไม่เลือกผู้ให้บริการ) — การชำระนัดกับทีมโดยตรง แล้วทีมเปลี่ยน
   tenant_billing.state เป็น 'paid' จากฝั่งระบบ (ผู้ใช้เขียนตารางนั้นไม่ได้ · 0006) จากนั้น AI เปิดได้
   หมดช่วงทดลอง = คอนโซลพามาที่นี่ (layout) และทุก action ถูกปฏิเสธ (viewer.ts) · ข้อมูลยังอยู่ ไม่ถูกลบเอง */
export default async function UpgradePage() {
  /* render ตอนขอเสมอ — ขึ้นกับผู้ใช้ ฐานข้อมูล และ nonce ของ CSP (ไม่งั้น build จะ prerender เป็นหน้านิ่งของโหมดเดโม) */
  await connection();
  if (!membershipEnforced()) redirect("/app");
  const user = await currentUser();
  if (!user) redirect("/login?next=/app");
  if (user.mfa === "pending") redirect("/login/mfa?next=/upgrade");
  const tenantId = await activeTenantId();
  const info = await signupInfo(tenantId, user.mfa);
  if (!info.selfSignup) redirect("/app/billing");

  return (
    <div className="max-w-lg">
      <h1 className="c-h1 text-[var(--c-text)]">{info.billingState === "paid" ? "บัญชีนี้ชำระแล้ว" : info.expired ? "ช่วงทดลองใช้หมดแล้ว" : "อัปเกรดบัญชี"}</h1>
      <div className="c-thai mt-4 flex flex-col gap-3 text-[0.88rem] leading-relaxed text-[var(--c-text-3)]">
        {info.billingState !== "paid" && (
          <p>
            {info.expired
              ? "คอนโซลถูกพักไว้จนกว่าจะชำระเงิน — ข้อมูลในบัญชียังอยู่ครบ ไม่มีอะไรถูกลบ"
              : `ทดลองใช้เหลือ ${info.daysLeft} วัน`}
            {info.trialEndsAt ? ` · ช่วงทดลองสิ้นสุด ${thaiDate(info.trialEndsAt)}` : ""}
          </p>
        )}
        <p>ระหว่างทดลอง AI ปิดอยู่ (ตรงกติกา &quot;AI เปิดได้หลังชำระเงิน&quot;) — งานหลักของ CRM ใช้สูตรสำเร็จแทน</p>
        <p>
          <strong className="text-[var(--c-text-2)]">ตอนนี้ยังชำระเงินผ่านระบบไม่ได้</strong> — ราคาโหมดคนเดียว (รายเดือน/รายปี)
          และการชำระเงินนัดกับทีมโดยตรง เมื่อชำระแล้วทีมจะเปิดบัญชีให้ใช้ต่อพร้อม AI
        </p>
        <p>หมายเหตุ: บัญชีสมัครเองยังรับข้อมูลจริงไม่ได้จนกว่าการทดสอบเจาะระบบจะผ่าน แม้ชำระเงินแล้ว</p>
      </div>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/contact" className="c-btn c-btn-primary">ติดต่อทีมเพื่อชำระเงิน</Link>
        {!info.expired && <Link href="/app/today" className="c-btn c-btn-ghost">กลับไปที่คอนโซล</Link>}
      </div>
      <form action={signOutAction} className="c-thai mt-10 text-[0.8rem] text-[var(--c-text-4)]">
        <button type="submit" className="underline underline-offset-4">ออกจากระบบ</button>
      </form>
    </div>
  );
}
