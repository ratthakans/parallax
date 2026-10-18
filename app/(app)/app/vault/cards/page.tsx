import Link from "next/link";
import { activeTenantId } from "@/app/(app)/tenant";
import { cardPurpose } from "@/lib/engine/vault/cards";
import { bangkokDay } from "@/lib/shared/format";
import { Panel } from "@/components/console/ui";
import { CardCapture } from "@/components/console/card-capture";

export const metadata = { title: "นามบัตร" };
export const dynamic = "force-dynamic";

/* ── กรอกนามบัตร (docs/solo-plan.md S6 · 6a) ─────────────────────────

   ยังไม่มีการอ่านรูปนามบัตร (OCR) — ผู้ให้บริการเป็นการตัดสินของเจ้าของ · กรอกมือทีละชุด
   ต้องมีวัตถุประสงค์จากแม่แบบ "ติดต่อจากการแลกนามบัตรในงานธุรกิจ" ก่อน — ไม่มีวัตถุประสงค์ = เพิ่มไม่ได้ */

export default async function CardsPage() {
  const tenantId = await activeTenantId();
  const purpose = await cardPurpose(tenantId);

  return (
    <>
      <Link href="/app/vault" className="c-thai inline-block py-2 text-[0.85rem] text-[var(--c-text-3)] hover:text-[var(--c-text)]">
        ← แหล่งข้อมูลทั้งหมด
      </Link>
      <header className="mt-4 mb-6">
        <h1 className="c-h1 text-[var(--c-text)]">กรอกนามบัตร</h1>
        <p className="c-thai mt-2 max-w-2xl text-[0.9rem] text-[var(--c-text-3)]">
          บอกชื่องานและวันที่ครั้งเดียวต่อชุด แล้วกรอกทีละใบ — นามบัตรที่ตรงกับคนเดิมจะไม่สร้างคนซ้ำ ที่ไม่แน่ใจจะไปคิวตรวจ
        </p>
      </header>
      <Panel className="max-w-5xl p-5 md:p-6">
        {purpose ? (
          <>
            <p className="c-thai mb-4 text-[0.8rem] text-[var(--c-text-4)]">วัตถุประสงค์: {purpose.name} · ยังไม่รองรับการถ่ายรูปนามบัตร</p>
            <CardCapture today={bangkokDay()} />
          </>
        ) : (
          <p className="c-thai max-w-2xl text-[0.88rem] text-[var(--c-text-3)]">
            ยังเพิ่มนามบัตรไม่ได้ — ต้องมีวัตถุประสงค์ของการใช้ข้อมูลนามบัตรก่อน ให้เจ้าของบัญชีหรือผู้ดูแลข้อมูลส่วนบุคคลเลือกแม่แบบ
            “ติดต่อจากการแลกนามบัตรในงานธุรกิจ” ที่ <Link href="/app/sales/purposes" className="underline">หน้าวัตถุประสงค์</Link>
          </p>
        )}
      </Panel>
    </>
  );
}
