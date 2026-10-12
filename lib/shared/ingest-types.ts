/* ── ชนิดข้อมูลของการนำเข้า ────────────────────────────────────
   ไฟล์นี้ไม่มี dependency ฝั่งเซิร์ฟเวอร์เลย จึง import จาก
   client component ได้ — lib/ai.ts และ lib/ingest.ts อ้างที่นี่
   ───────────────────────────────────────────────────────────── */

/* ลำดับในอาร์เรย์นี้คือลำดับในเมนูเลือกคอลัมน์ของหน้านำเข้า
   จึงเรียงตามที่คนนึกถึง: ใคร → ติดต่อทางไหน → อยู่ที่ไหน → ซื้ออะไร */
export const IMPORT_FIELDS = [
  "customer_ref",
  "customer_name",
  // ── ข้อมูลของคน ──
  "first_name",
  "last_name",
  "nickname",
  "gender",
  "birthday",
  "company",
  "job_title",
  // ── ช่องทางติดต่อ — เก็บแบบเข้ารหัส ──
  "phone",
  "phone_alt",
  "email",
  "line_id",
  "facebook",
  "instagram",
  "tiktok",
  "website",
  // ── ที่อยู่ ──
  "address",
  "subdistrict",
  "district",
  "province",
  "postcode",
  "note",
  // ── การซื้อ — ไม่บังคับ ไฟล์รายชื่ออย่างเดียวก็นำเข้าได้ ──
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

/* ── กลุ่มในเมนูเลือกคอลัมน์ ──
   33 ตัวเลือกเรียงยาวรายการเดียวคือการให้คนไล่หาเอง จัดกลุ่มตามคำถาม
   ที่คนถามตัวเองตอนดูหัวคอลัมน์: เป็นข้อมูลของคน · ติดต่อทางไหน · อยู่ที่ไหน · ซื้ออะไร
   ทุก field ต้องอยู่ในกลุ่มเดียวพอดี — verify:contacts ตรวจให้ */
export const IMPORT_FIELD_GROUPS: { label: string; fields: ImportField[] }[] = [
  {
    label: "ข้อมูลของคน",
    fields: ["customer_ref", "customer_name", "first_name", "last_name", "nickname",
      "gender", "birthday", "company", "job_title", "note"],
  },
  {
    label: "ช่องทางติดต่อ",
    fields: ["phone", "phone_alt", "email", "line_id", "facebook", "instagram", "tiktok", "website"],
  },
  { label: "ที่อยู่", fields: ["address", "subdistrict", "district", "province", "postcode"] },
  {
    label: "การซื้อ",
    fields: ["occurred_at", "total", "unit_price", "list_price", "discount",
      "product_name", "product_category", "qty", "channel"],
  },
];

export const FIELD_LABEL: Record<ImportField, string> = {
  customer_ref: "รหัสลูกค้า (หรือใช้เบอร์ · อีเมล · LINE แทนได้)",
  customer_name: "ชื่อลูกค้า (ชื่อเต็ม)",
  first_name: "ชื่อจริง",
  last_name: "นามสกุล",
  nickname: "ชื่อเล่น",
  gender: "เพศ",
  birthday: "วันเกิด",
  company: "บริษัท / หน่วยงาน",
  job_title: "ตำแหน่ง",
  phone: "เบอร์มือถือ",
  phone_alt: "เบอร์โทรอื่น (บ้าน · ที่ทำงาน)",
  email: "อีเมล",
  line_id: "LINE ID",
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  website: "เว็บไซต์",
  address: "ที่อยู่",
  subdistrict: "ตำบล / แขวง",
  district: "อำเภอ / เขต",
  province: "จังหวัด",
  postcode: "รหัสไปรษณีย์",
  note: "หมายเหตุ",
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

/* ── อะไรบังคับ ──

   เดิมบังคับ customer_ref + occurred_at + total ทุกไฟล์ แปลว่านำเข้ารายชื่อ
   ลูกค้าที่ยังไม่เคยซื้อไม่ได้เลย — ไฟล์ที่ทีมขายมีบ่อยที่สุด (รายชื่อจากงาน
   อีเวนต์ · ฟอร์มลงทะเบียน · นามบัตร) ถูกปฏิเสธทั้งไฟล์

   ตอนนี้บังคับแค่ "รู้ว่าเป็นใคร" — รหัส เบอร์ อีเมล หรือ LINE อย่างใดอย่างหนึ่ง
   ส่วนวันที่กับยอดเงินบังคับเฉพาะเมื่อไฟล์มีข้อมูลการซื้อ */
export const IDENTITY_FIELDS: ImportField[] = [
  "customer_ref",
  "phone",
  "email",
  "line_id",
  "phone_alt",
];

/** มีคอลัมน์การซื้ออย่างใดอย่างหนึ่ง = ไฟล์นี้เป็นไฟล์ยอดขาย */
const PURCHASE_FIELDS: ImportField[] = [
  "occurred_at", "total", "unit_price", "list_price", "discount",
  "product_name", "product_category", "qty",
];

/** คอลัมน์ที่ขาดไม่ได้เมื่อไฟล์มีข้อมูลการซื้อ */
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

/** ไฟล์นี้มีข้อมูลการซื้อหรือเปล่า — ไม่มี = นำเข้าเป็นรายชื่ออย่างเดียว */
export function hasPurchases(has: (f: ImportField) => boolean): boolean {
  return PURCHASE_FIELDS.some(has);
}

/** คอลัมน์ที่ยังขาดจริง ๆ — ใช้ทั้งฝั่งเซิร์ฟเวอร์และหน้าจอเลือกคอลัมน์ */
export function missingRequired(has: (f: ImportField) => boolean): ImportField[] {
  const missing: ImportField[] = [];
  if (!IDENTITY_FIELDS.some(has)) missing.push("customer_ref");
  if (hasPurchases(has)) {
    if (!has("occurred_at")) missing.push("occurred_at");
    if (!MONEY_FIELDS.some(has)) missing.push("total");
  }
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
  /** ช่องทางติดต่อที่อ่านได้ทั้งไฟล์ — เบอร์ อีเมล LINE โซเชียล ที่อยู่ */
  contactPoints: number;
};

export type ImportResult = {
  customers: number;
  transactions: number;
  contactPoints: number;
  products: number;
  rejected: number;
  roleSource: string;
};

/* ── คอลัมน์สรุปในไฟล์ที่ระบบส่งออกเอง ──
   ไฟล์ส่งออกมี "ยอดซื้อรวม" "จำนวนครั้งที่ซื้อ" ซึ่งตัวจับคู่คอลัมน์อ่านเป็นยอดของ
   รายการซื้อหนึ่งครั้งได้ทันที — แก้ไฟล์ใน Excel แล้วนำเข้ากลับ ยอดขายทั้งปีจะถูก
   บันทึกซ้ำเป็นการซื้อใหม่หนึ่งครั้ง คอลัมน์ที่ขึ้นต้นด้วยป้ายนี้จึงไม่ถูกอ่านเลย */
export const SUMMARY_COLUMN_PREFIX = "[สรุป]";
export const isSummaryColumn = (header: string) => header.trim().startsWith(SUMMARY_COLUMN_PREFIX);
