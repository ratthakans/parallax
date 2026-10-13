import Link from "next/link";
import { Field, Label } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="relative flex min-h-[80svh] items-center overflow-hidden pt-32 pb-24">
      <Field variant="aurora" />
      <div className="shell">
        <Label>404</Label>
        <h1 className="t-h1 balance mt-8 max-w-2xl text-ink">
          ไม่พบหน้าที่มองหาจากมุมนี้
        </h1>
        <p className="t-lead t-thai mt-8 max-w-lg text-ink-2">
          ลิงก์อาจถูกย้าย หรือหน้านี้ยังไม่มีอยู่
        </p>
        <div className="mt-11 flex flex-wrap gap-3">
          <Link href="/" className="btn btn-primary">
            กลับหน้าแรก
          </Link>
          <Link href="/platform" className="btn btn-ghost">
            ดูแพลตฟอร์ม
          </Link>
        </div>
      </div>
    </div>
  );
}
