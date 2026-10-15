/* ── คำขอสิทธิของเจ้าของข้อมูล (DSAR · docs/plan.md หัวข้อ 7.4 · B6) ─────────────

   ชนิดตาม PDPA: เข้าถึง · โอน · แก้ไข · คัดค้าน · ถอนความยินยอม · ลบ · จำกัดการใช้
   กรอบเวลา: คำขอเข้าถึงต้องตอบภายใน 30 วันนับจากวันที่ได้รับ (มาตรา 30) — ระบบใช้ 30 วันกับทุกชนิด
   ชนิดอื่นกฎหมายให้ "โดยไม่ชักช้า" ซึ่งไม่ควรนานกว่าคำขอเข้าถึง */

export const DSAR_KINDS = ["access", "portability", "rectify", "object", "withdraw", "erase", "restrict"] as const;
export type DsarKind = (typeof DSAR_KINDS)[number];

export const DSAR_KIND_TH: Record<DsarKind, string> = {
  access: "ขอเข้าถึง/ขอสำเนา",
  portability: "ขอโอนย้ายข้อมูล",
  rectify: "ขอแก้ไขให้ถูกต้อง",
  object: "คัดค้านการประมวลผล",
  withdraw: "ถอนความยินยอม",
  erase: "ขอให้ลบ",
  restrict: "ขอให้จำกัดการใช้",
};

/** สิ่งที่ต้องทำก่อนปิดคำขอว่า "ทำแล้ว" — แสดงบนหน้าคำขอ */
export const DSAR_KIND_DONE_TH: Record<DsarKind, string> = {
  access: "สร้างรายงานข้อมูลของผู้ขอ ตรวจข้อมูลของคนอื่นในรายงาน แล้วส่งให้ผู้ขอ",
  portability: "สร้างรายงาน (JSON อ่านด้วยเครื่องได้) ตรวจข้อมูลของคนอื่น แล้วส่งให้ผู้ขอหรือผู้ควบคุมรายใหม่",
  rectify: "แก้ข้อมูลที่หน้าคน แล้วบันทึกว่าแก้อะไร",
  object: "ปิดคำขอ = บันทึกคำคัดค้าน (งานติดต่อที่ค้างถูกยกเลิกทันที)",
  withdraw: "ปิดคำขอ = บันทึกการถอนความยินยอม (งานติดต่อที่ค้างถูกยกเลิกทันที)",
  erase: "ปิดคำขอ = ลบคนนี้ทั้งหมด และจำอีเมล/เบอร์แบบเข้ารหัสทางเดียวในทะเบียนการลบ",
  restrict: "ปิดคำขอ = บันทึกการขอจำกัด (ระบบไม่ใช้ติดต่อจนกว่าจะยกเลิก)",
};

export const DSAR_CHANNELS = ["email", "phone", "letter", "in_person", "web", "other"] as const;
export type DsarChannel = (typeof DSAR_CHANNELS)[number];
export const DSAR_CHANNEL_TH: Record<DsarChannel, string> = {
  email: "อีเมล", phone: "โทรศัพท์", letter: "จดหมาย", in_person: "แจ้งด้วยตนเอง", web: "แบบฟอร์มเว็บ", other: "ช่องทางอื่น",
};

export type DsarStatus = "open" | "done" | "rejected";
export const DSAR_STATUS_TH: Record<DsarStatus, string> = { open: "เปิดอยู่", done: "ดำเนินการแล้ว", rejected: "ปฏิเสธ" };

/** วันนับจากวันที่ได้รับคำขอถึงวันครบกำหนด */
export const DSAR_DUE_DAYS = 30;
/** เหลือกี่วันจึงขึ้นเป็น "ใกล้ครบกำหนด" */
export const DSAR_WARN_DAYS = 7;

export type DsarRequest = {
  id: string;
  ref: string;
  kind: DsarKind;
  subjectId: string | null;
  /** ชื่อปัจจุบันของผู้ขอ — null เมื่อไม่พบในระบบ หรือถูกลบแล้ว */
  subjectName: string | null;
  subjectGone: boolean;
  channel: DsarChannel;
  receivedAt: string;
  dueAt: string;
  /** วันที่เหลือถึงวันครบกำหนด (ติดลบ = เลยกำหนด) นับตามวันที่กรุงเทพ */
  daysLeft: number;
  status: DsarStatus;
  ownerId: string;
  verifiedAt: string | null;
  verifiedBy: string | null;
  verificationNote: string | null;
  reportAt: string | null;
  outcomeNote: string | null;
  closedAt: string | null;
  closedBy: string | null;
  createdBy: string;
  createdAt: string;
};
