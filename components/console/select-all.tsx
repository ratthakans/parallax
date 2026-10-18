"use client";

import { useEffect, useState } from "react";

/* ── ติ๊กทั้งหมดในหน้านี้ (docs/crm-plan.md E3) ── ช่องเลือกของแถวผูกกับฟอร์มด้วย form="…" (อยู่นอกฟอร์มได้) */
export function SelectAll({ form, label = "เลือกทั้งหมดในหน้านี้" }: { form: string; label?: string }) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      className="h-4 w-4"
      onChange={(e) => {
        document.querySelectorAll<HTMLInputElement>(`input[type=checkbox][form="${form}"][name="ids"]`).forEach((c) => { c.checked = e.currentTarget.checked; });
        document.dispatchEvent(new Event("bulk-selection"));
      }}
    />
  );
}

/** จำนวนแถวที่ติ๊กอยู่ — ให้เห็นก่อนกดว่ากำลังจะเปลี่ยนกี่รายการ (docs/qa-plan.md BUG-09) */
export function SelectedCount({ form }: { form: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const count = () => setN(document.querySelectorAll(`input[type=checkbox][form="${form}"][name="ids"]:checked`).length);
    const onChange = (e: Event) => { const t = e.target as HTMLInputElement; if (t?.getAttribute?.("form") === form) count(); };
    document.addEventListener("change", onChange);
    document.addEventListener("bulk-selection", count);
    count();
    return () => { document.removeEventListener("change", onChange); document.removeEventListener("bulk-selection", count); };
  }, [form]);
  return <span className="c-thai text-[0.8rem] text-[var(--c-text-3)]" aria-live="polite">{n ? `ติ๊กไว้ ${n} รายการ` : "ยังไม่ได้ติ๊ก"}</span>;
}
