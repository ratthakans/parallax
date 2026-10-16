/* ── ช่องเลือกบริษัทแบบพิมพ์ค้นหา (docs/crm-plan.md C0 ข้อ 4) ─────────────
   แทน dropdown หลายร้อยรายการ: พิมพ์บางส่วนของชื่อแล้วเลือกจากรายการ (datalist ของเบราว์เซอร์ · ไม่ต้องใช้ JS)
   ส่งชื่อไปเซิร์ฟเวอร์ — ฝั่งเซิร์ฟเวอร์หาบริษัทจากชื่อ (orgByName) ไม่เชื่อ id จากหน้าจอ */

export function OrgPicker({ id, name, names, defaultValue, required, placeholder }: {
  id: string; name: string; names: string[]; defaultValue?: string; required?: boolean; placeholder?: string;
}) {
  return (
    <>
      <input
        name={name}
        list={`${id}-list`}
        defaultValue={defaultValue}
        required={required}
        autoComplete="off"
        maxLength={200}
        placeholder={placeholder ?? "พิมพ์ชื่อบริษัทแล้วเลือกจากรายการ"}
        className="c-input"
      />
      <datalist id={`${id}-list`}>
        {[...new Set(names)].map((n) => <option key={n} value={n} />)}
      </datalist>
    </>
  );
}
