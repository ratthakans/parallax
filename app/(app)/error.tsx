"use client";

import { useEffect } from "react";
import Link from "next/link";

/* ── ที่รองรับข้อผิดพลาดที่ไม่ควรเกิด ────────────────────────────

   เดิมทั้งโปรเจกต์ไม่มี error boundary เลยแม้แต่ไฟล์เดียว อะไรที่พังใน
   คอนโซลจึงเด้งไปหน้า error กลาง ๆ ของ Next ที่ไม่มีแม้แต่ทางกลับ

   หน้านี้ไม่ได้มีไว้แสดงข้อความจากเซิร์ฟเวอร์ — Next ตัดข้อความนั้นทิ้ง
   ใน production เหลือแต่ digest ความล้มเหลวที่ผู้ใช้ต้องอ่านเข้าใจ
   (ช่วงห้ามส่ง · เครดิตหมด · เกินเพดาน) จึงถูกย้ายไปเป็นค่าที่ action
   return แทน ดู lib/action-state.ts

   ที่เหลืออยู่ตรงนี้คือของที่พังจริง สิ่งที่หน้านี้ต้องทำมีสองอย่าง:
   บอกว่าไม่มีอะไรถูกเปลี่ยน และให้ทางออกที่กดได้ */

export default function ConsoleError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="console min-h-dvh">
      <div className="mx-auto max-w-2xl px-6 py-24">
        <p className="c-label text-[var(--c-bad)]">something broke</p>
        <h1 className="c-h1 mt-4 text-[var(--c-text)]">
          This screen could not be built
        </h1>
        <p className="c-thai mt-4 text-[0.92rem] text-[var(--c-text-2)]">
          Nothing was sent and nothing was changed — the failure happened while
          drawing the page, before any action ran. Try again; if it keeps
          happening, the reference below is what identifies it in the server log.
        </p>

        {error.digest && (
          <p className="c-mono mt-5 text-[0.74rem] text-[var(--c-text-4)]">
            reference {error.digest}
          </p>
        )}

        <div className="mt-8 flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={() => unstable_retry()}
            className="c-btn c-btn-primary"
          >
            Try again
          </button>
          <Link href="/app" className="c-btn c-btn-ghost">
            Back to the morning brief
          </Link>
        </div>
      </div>
    </div>
  );
}
