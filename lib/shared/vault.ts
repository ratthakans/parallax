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
  received: "รับเข้า",
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
