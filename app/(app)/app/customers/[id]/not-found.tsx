import Link from "next/link";

/* 404 ของหน้าลูกค้า — not-found.tsx ของคอนโซลเขียนไว้สำหรับแคมเปญ ซึ่งจะบอก
   ว่า "ไม่พบแคมเปญนี้" กับคนที่เพิ่งลบลูกค้าแล้วกดย้อนกลับ หรือเปิดลิงก์เก่า */
export default function CustomerNotFound() {
  return (
    <div className="mx-auto max-w-xl py-16">
      <p className="c-label-th text-[var(--c-warn)]">ไม่พบข้อมูล</p>
      <h1 className="c-h1 mt-4 text-[var(--c-text)]">ไม่พบคนนี้ในบัญชีที่กำลังดู</h1>
      <p className="c-thai mt-4 text-[0.9rem] leading-relaxed text-[var(--c-text-2)]">
        อาจถูกลบหรือรวมกับคนอื่นไปแล้ว หรือเป็นของบัญชีอื่นที่ไม่ใช่บัญชีบนหน้าจอนี้
      </p>
      <div className="mt-8 flex flex-wrap gap-2.5">
        <Link href="/app/customers" className="c-btn c-btn-primary">
          รายชื่อทั้งหมด
        </Link>
      </div>
    </div>
  );
}
