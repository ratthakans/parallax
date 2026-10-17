"use client";

/* ── ติ๊กทั้งหมดในหน้านี้ (docs/crm-plan.md E3) ── ช่องเลือกของแถวผูกกับฟอร์มด้วย form="…" (อยู่นอกฟอร์มได้) */
export function SelectAll({ form, label = "เลือกทั้งหมดในหน้านี้" }: { form: string; label?: string }) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      className="h-4 w-4"
      onChange={(e) => {
        document.querySelectorAll<HTMLInputElement>(`input[type=checkbox][form="${form}"][name="ids"]`).forEach((c) => { c.checked = e.currentTarget.checked; });
      }}
    />
  );
}
