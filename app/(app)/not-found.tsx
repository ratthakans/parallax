import Link from "next/link";

/* ── 404 ของคอนโซล ──────────────────────────────────────────────

   notFound() ถูกเรียกจาก /app/campaigns/[id] เมื่อ id ไม่มีอยู่จริงหรือ
   เป็นของบัญชีอื่น ซึ่งเกิดได้ทุกวัน: บุ๊กมาร์กเก่า · ลิงก์ที่ส่งต่อกัน ·
   สลับบัญชีแล้วกดปุ่มย้อนกลับ

   ก่อนหน้านี้ไม่มีไฟล์นี้ คำขอจึงตกไปที่ app/not-found.tsx ซึ่งเป็น 404
   ของเว็บการตลาด — พื้นขาว ฟอนต์ใหญ่ ปุ่ม "Back to home" กับ "See the
   platform" คนที่กำลังทำงานอยู่ในคอนโซลจะถูกเด้งออกไปหน้าขายของ
   โดยไม่มีทางกลับเข้าคอนโซลเลยสักปุ่ม

   ทางออกที่ให้ต้องเป็นทางที่เขากำลังจะไป ไม่ใช่ทางที่เราอยากให้ไป */
export default function ConsoleNotFound() {
  return (
    <div className="mx-auto max-w-xl py-16">
      <p className="c-label text-[var(--c-warn)]">not found</p>
      <h1 className="c-h1 mt-4 text-[var(--c-text)]">
        That campaign is not in this account
      </h1>
      <p className="c-thai mt-4 text-[0.9rem] leading-relaxed text-[var(--c-text-2)]">
        Either it never existed, or it belongs to a different account than the one
        this screen is open on. Nothing was changed.
      </p>

      <div className="mt-8 flex flex-wrap gap-2.5">
        <Link href="/app/campaigns" className="c-btn c-btn-primary">
          All campaigns
        </Link>
        <Link href="/app" className="c-btn c-btn-ghost">
          Morning brief
        </Link>
      </div>
    </div>
  );
}
