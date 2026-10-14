"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Field, Label } from "@/components/ui";

export default function SiteError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="relative flex min-h-[80svh] items-center overflow-hidden pt-32 pb-24">
      <Field variant="aurora" />
      <div className="shell">
        <Label>เกิดข้อผิดพลาด</Label>
        <h1 className="t-h1 balance mt-8 max-w-2xl text-ink">
          โหลดหน้านี้ไม่สำเร็จ
        </h1>
        <p className="t-lead t-thai mt-8 max-w-lg text-ink-2">
          มีบางอย่างผิดพลาดในระบบ ไม่ได้เกิดจากคุณ ลองอีกครั้งได้ทันที
          และหน้าอื่นของเว็บไซต์ยังใช้งานได้ตามปกติ
        </p>
        {error.digest && (
          <p className="t-mono mt-6 text-[0.74rem] text-ink-4">
            รหัสอ้างอิง {error.digest}
          </p>
        )}
        <div className="mt-11 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => retry()}
            className="btn btn-primary"
          >
            ลองอีกครั้ง
          </button>
          <Link href="/" className="btn btn-ghost">
            กลับหน้าแรก
          </Link>
        </div>
      </div>
    </div>
  );
}
