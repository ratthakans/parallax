/* ── ค่าที่อนุญาตของโครงข้อมูล B2B (Blueprint 2.0 บท 3–5) ─────────────

   ฝั่ง Postgres บังคับด้วย check constraint ใน 0007 · ฝั่ง sqlite บังคับที่ชั้นแอปผ่านชนิดเหล่านี้
   ป้ายภาษาไทยอยู่ที่นี่ที่เดียว เพื่อให้ทุกหน้าจอเรียกสถานะเดียวกันด้วยคำเดียวกัน */

export const CLASSIFICATIONS = ["public", "internal", "confidential", "restricted_high"] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];
export const CLASSIFICATION_TH: Record<Classification, string> = {
  public: "สาธารณะ",
  internal: "ภายใน",
  confidential: "ลับ",
  restricted_high: "จำกัดสูง",
};

/** สถานะตลอดอายุข้อมูล — ทุกสถานะมีเจ้าของและวันครบกำหนด (state_owner_id · state_due_at) */
export const LIFECYCLE_STATES = [
  "received", "pending_review", "confirmed", "needs_review", "restricted", "deleted", "anonymised",
] as const;
export type LifecycleState = (typeof LIFECYCLE_STATES)[number];
export const LIFECYCLE_TH: Record<LifecycleState, string> = {
  received: "ยังไม่ตรวจ",
  pending_review: "รอตรวจ",
  confirmed: "ยืนยันแล้ว",
  needs_review: "ต้องทบทวน",
  restricted: "จำกัดการใช้",
  deleted: "ลบแล้ว",
  anonymised: "ไม่ระบุตัวบุคคลแล้ว",
};

export const IMPORT_ROW_STATUSES = ["accepted", "rejected", "pending_review", "suspended"] as const;
export type ImportRowStatus = (typeof IMPORT_ROW_STATUSES)[number];
export const IMPORT_ROW_TH: Record<ImportRowStatus, string> = {
  accepted: "สำเร็จ",
  rejected: "ถูกปฏิเสธ",
  pending_review: "รอตรวจ",
  suspended: "พักใช้",
};

export const PREFERENCE_KINDS = ["consent", "withdrawal", "objection", "restriction"] as const;
export type PreferenceKind = (typeof PREFERENCE_KINDS)[number];
export const PREFERENCE_TH: Record<PreferenceKind, string> = {
  consent: "ยินยอม",
  withdrawal: "ถอนความยินยอม",
  objection: "คัดค้าน",
  restriction: "ขอจำกัดการใช้",
};

/** สถานะการติดต่อ (Blueprint บท 5) — ผลตัดสินต่อ วัตถุประสงค์ × ช่องทาง × ข้อความ × เวลา */
export const ELIGIBILITY = ["eligible", "review_required", "suppressed", "channel_invalid"] as const;
export type Eligibility = (typeof ELIGIBILITY)[number];
export const ELIGIBILITY_TH: Record<Eligibility, string> = {
  eligible: "ใช้ได้ตามนโยบาย",
  review_required: "ต้องตรวจก่อน",
  suppressed: "ห้ามติดต่อ",
  channel_invalid: "ช่องทางใช้ไม่ได้",
};

export type RecordKind = "person" | "org";

/* ── ฟิลด์ที่ Data Vault รับได้ ──────────────────────────────────

   ชุดย่อยของ IMPORT_FIELDS ที่ใช้กับงาน B2B — ไม่มีฟิลด์ยอดซื้อของยุคค้าปลีก
   แหล่งข้อมูลแต่ละแหล่งเลือกได้เฉพาะฟิลด์ที่จำเป็น (Blueprint บท 4 ขั้น 1) และตอนนำเข้า
   คอลัมน์ที่จับคู่กับฟิลด์นอกที่เลือกไว้จะไม่ถูกเก็บ */
export const VAULT_FIELDS = [
  "customer_name", "first_name", "last_name", "company", "tax_id", "job_title",
  "email", "phone", "phone_alt", "line_id", "website",
  "province", "occurred_at", "consent", "note",
  "program", "edition", "participant_role",
] as const;
export type VaultField = (typeof VAULT_FIELDS)[number];

/** ค่าตั้งต้นตอนลงทะเบียนแหล่ง — พอสำหรับงานขาย B2B หนึ่งแคมเปญ ไม่มากกว่านั้น */
export const DEFAULT_SOURCE_FIELDS: VaultField[] = [
  "customer_name", "first_name", "last_name", "company", "job_title", "email", "phone",
];

/** ต้องมีอย่างน้อยหนึ่งช่องในแถว ไม่งั้นแถวนั้นชี้ไปหาใครไม่ได้ → ปฏิเสธ */
export const IDENTIFYING_FIELDS: VaultField[] = ["customer_name", "first_name", "last_name", "email", "phone", "phone_alt", "line_id"];

/* ── คอลัมน์ที่ไม่เก็บไม่ว่ากรณีใด ──────────────────────────────

   ข้อมูลอ่อนไหวตาม PDPA มาตรา 26 (สุขภาพ ศาสนา เชื้อชาติ ความคิดเห็นทางการเมือง ประวัติอาชญากรรม
   ชีวภาพ ความพิการ ข้อมูลสหภาพ พฤติกรรมทางเพศ) — แบบฟอร์มงานมักถามเรื่องอาหารหรือการแพ้
   ซึ่งบอกศาสนาหรือสุขภาพได้ จึงนับด้วย และเลขบัตรประชาชน/หนังสือเดินทางซึ่งงาน B2B ไม่จำเป็นต้องใช้
   คอลัมน์เหล่านี้ถูกตัดก่อนเข้ารหัสเก็บ — ค่าในนั้นไม่ลงฐานข้อมูลเลย */
const SENSITIVE_HEADER = new RegExp(
  [
    "สุขภาพ", "โรค", "แพ้", "อาหาร", "ยาที่ใช้", "กรุ๊ปเลือด", "หมู่เลือด", "ศาสนา", "เชื้อชาติ", "พรรค", "การเมือง",
    "อาชญากรรม", "ลายนิ้วมือ", "ใบหน้า", "พิการ", "สหภาพ", "เพศวิถี", "บัตรประ(ชา|จำตัว)ชน", "เลขประจำตัวประชาชน", "พาสปอร์ต", "หนังสือเดินทาง",
    "health", "medical", "allerg", "diet", "religio", "\\brace\\b", "ethnic", "politic", "criminal", "biometric",
    "fingerprint", "disab", "blood", "union", "sexual", "national.?id", "citizen.?id", "id.?card", "passport",
  ].join("|"),
  "i",
);

export function sensitiveReason(header: string): string | null {
  return SENSITIVE_HEADER.test(header)
    ? "ข้อมูลอ่อนไหว (PDPA มาตรา 26) หรือเลขประจำตัวที่งาน B2B ไม่จำเป็นต้องใช้ — ไม่เก็บ"
    : null;
}

export type SourceKind = "file" | "namecard" | "system";
export const SOURCE_KIND_TH: Record<SourceKind, string> = {
  file: "ไฟล์ Excel / CSV",
  namecard: "นามบัตร (กรอกมือ · ยังไม่มี OCR)",
  system: "ระบบอื่น (ส่งออกเป็นไฟล์)",
};

/** ป้ายฟิลด์สำหรับงาน B2B — ป้ายของตัวนำเข้ายุคค้าปลีกพูดเรื่องการซื้อ ซึ่งไม่ตรงกับไฟล์รายชื่อ */
export const VAULT_FIELD_TH: Record<VaultField, string> = {
  customer_name: "ชื่อ-นามสกุล (ชื่อเต็ม)",
  first_name: "ชื่อ",
  last_name: "นามสกุล",
  company: "บริษัท / หน่วยงาน",
  tax_id: "เลขนิติบุคคล (ผู้เสียภาษี 13 หลัก)",
  job_title: "ตำแหน่ง",
  email: "อีเมล",
  phone: "เบอร์มือถือ",
  phone_alt: "เบอร์อื่น",
  line_id: "LINE ID",
  website: "เว็บไซต์",
  province: "จังหวัด",
  occurred_at: "วันที่ของรายการ (ลงทะเบียน · ติดต่อ · สแกน)",
  consent: "ความยินยอมที่ระบุในไฟล์",
  note: "หมายเหตุ",
  program: "ชื่องาน / โครงการที่ร่วม",
  edition: "ปีหรือครั้งที่ของงาน",
  participant_role: "บทบาทในงาน (ผู้เข้าชม · ผู้ออกบูธ · สปอนเซอร์ · วิทยากร)",
};
