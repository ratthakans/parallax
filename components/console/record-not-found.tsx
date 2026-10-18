import Link from "next/link";

/* ── 404 ของหน้าระเบียน (docs/qa-plan.md BUG-26) ── เดิมดีล/บริษัทตกไปที่ 404 ของแคมเปญ ("ไม่พบแคมเปญนี้") */
export function RecordNotFound({ what, href, backLabel }: { what: string; href: string; backLabel: string }) {
  return (
    <div className="mx-auto max-w-xl py-16">
      <p className="c-label-th text-[var(--c-warn)]">ไม่พบข้อมูล</p>
      <h1 className="c-h1 mt-4 text-[var(--c-text)]">ไม่พบ{what}นี้ในบัญชีที่กำลังดู</h1>
      <p className="c-thai mt-4 text-[0.9rem] leading-relaxed text-[var(--c-text-2)]">
        อาจถูกลบหรือรวมไปแล้ว (ดูถังขยะหรือประวัติการรวม) หรือเป็นของบัญชีอื่นที่ไม่ใช่บัญชีบนหน้าจอนี้ · ไม่มีข้อมูลใดถูกเปลี่ยนแปลง
      </p>
      <div className="mt-8 flex flex-wrap gap-2.5">
        <Link href={href} className="c-btn c-btn-primary">{backLabel}</Link>
        <Link href="/app/data/trash" className="c-btn c-btn-ghost">ถังขยะ</Link>
      </div>
    </div>
  );
}
