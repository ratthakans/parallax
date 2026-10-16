/* ── เลขประจำตัวผู้เสียภาษีนิติบุคคล 13 หลัก (docs/crm-plan.md C2) ─────────────

   เลขเดียวกัน = นิติบุคคลเดียวกันแน่นอน ไม่ว่าชื่อจะเขียนกี่แบบ — จึงเป็นกุญแจบริษัทที่แข็งที่สุด
   ตรวจ checksum หลักที่ 13 (ถ่วงน้ำหนัก 13…2 · mod 11) — เลขที่พิมพ์ผิดหนึ่งหลักไม่ผ่าน จึงไม่รวมบริษัทผิดตัว
   ไม่รับเลขบัตรประชาชน: นิติบุคคลขึ้นต้นด้วย 0 เสมอ (บุคคลธรรมดาขึ้นต้น 1–8) */

export function taxIdChecksum(first12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (13 - i);
  return (11 - (sum % 11)) % 10;
}

/** เลขนิติบุคคลที่ถูกต้อง (ตัดขีด/ช่องว่าง) หรือ null */
export function normaliseTaxId(raw: string | null | undefined): string | null {
  const d = (raw ?? "").replace(/[\s\-–.]/g, "");
  if (!/^0\d{12}$/.test(d)) return null;
  return taxIdChecksum(d.slice(0, 12)) === Number(d[12]) ? d : null;
}
