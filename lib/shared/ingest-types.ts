/* ── ชนิดข้อมูลของการนำเข้า ────────────────────────────────────
   ไฟล์นี้ไม่มี dependency ฝั่งเซิร์ฟเวอร์เลย จึง import จาก
   client component ได้ — lib/ai.ts และ lib/ingest.ts อ้างที่นี่
   ───────────────────────────────────────────────────────────── */

export const IMPORT_FIELDS = [
  "customer_ref",
  "customer_name",
  "occurred_at",
  "total",
  "unit_price",
  "list_price",
  "discount",
  "product_name",
  "product_category",
  "qty",
  "channel",
  "ignore",
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number];

export const FIELD_LABEL: Record<ImportField, string> = {
  customer_ref: "ตัวระบุลูกค้า (รหัสลูกค้า · เบอร์ · อีเมล)",
  customer_name: "ชื่อลูกค้า",
  occurred_at: "วันที่ซื้อ",
  total: "ยอดสุทธิของรายการนี้ (หลังลด)",
  unit_price: "ราคาต่อหน่วยที่จ่ายจริง",
  list_price: "ราคาป้ายต่อหน่วย (ก่อนลด)",
  discount: "ส่วนลดของรายการนี้",
  product_name: "ชื่อสินค้า",
  product_category: "หมวดสินค้า",
  qty: "จำนวน",
  channel: "ช่องทาง",
  ignore: "ไม่ใช้คอลัมน์นี้",
};

/** คอลัมน์ที่ขาดไม่ได้ — ไม่มีสามอย่างนี้ระบบทำงานไม่ได้ */
export const REQUIRED_FIELDS: ImportField[] = [
  "customer_ref",
  "occurred_at",
  "total",
];

/* ต้องมีคอลัมน์เงินอย่างน้อยหนึ่งอย่าง แต่ไม่จำเป็นต้องเป็นยอดสุทธิ

   ไฟล์ POS จำนวนมากให้ราคาต่อหน่วยกับจำนวนแล้วให้เราคูณเอง ไม่มีคอลัมน์
   ยอดรวมของแถวเลย ถ้าบังคับว่าต้องมี total ไฟล์เหล่านั้นจะนำเข้าไม่ได้
   ทั้งที่ข้อมูลครบ */
const MONEY_FIELDS: ImportField[] = ["total", "unit_price"];

/** คอลัมน์ที่ยังขาดจริง ๆ — ใช้ทั้งฝั่งเซิร์ฟเวอร์และหน้าจอเลือกคอลัมน์ */
export function missingRequired(has: (f: ImportField) => boolean): ImportField[] {
  const missing = REQUIRED_FIELDS.filter(
    (f) => !MONEY_FIELDS.includes(f) && !has(f),
  );
  if (!MONEY_FIELDS.some(has)) missing.push("total");
  return missing;
}

export type ColumnMapping = {
  mappings: {
    column: string;
    field: ImportField;
    confidence: number;
    why: string;
  }[];
};

export type ImportPreview = {
  totalRows: number;
  usableRows: number;
  rejected: { line: number; reason: string }[];
  customers: number;
  transactions: number;
  products: { name: string; category: string; price: number }[];
  dateRange: { from: string; to: string } | null;
  missing: ImportField[];
  discountRowShare: number;
};

export type ImportResult = {
  customers: number;
  transactions: number;
  products: number;
  rejected: number;
  roleSource: string;
};
