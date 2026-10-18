/* ── หน้า "วันนี้": หมวดและลำดับ (docs/solo-plan.md S1) ─────────────────

   ลำดับเป็นหมวดตายตัว ไม่ใช่คะแนนความสำคัญ — อธิบายได้เสมอว่าทำไมรายการนี้อยู่บนสุด
   ภายในหมวดเรียงตามเวลา (เก่าสุด/ใกล้สุดก่อน) · รันซ้ำบนข้อมูลเดียวกันต้องได้ลำดับเดิม
   หมวด "ข้อมูลครบอายุ" มาจากเครื่องคิดอายุข้อมูล (lib/engine/retention · B6)
   หมวด "คำขอสิทธิ" มาจากทะเบียนคำขอ (lib/engine/dsar · B6) — มีกำหนดตามกฎหมาย จึงอยู่รองจาก "ต้องหยุด" */

export const QUEUE_SECTIONS = ["stop", "requests", "due", "overdue", "moved", "review", "expiring", "quiet"] as const;
export type QueueSection = (typeof QUEUE_SECTIONS)[number];

export const QUEUE_SECTION_TH: Record<QueueSection, { title: string; hint: string }> = {
  stop: { title: "ต้องหยุด", hint: "ถอนความยินยอม คัดค้าน หรือขอจำกัดใน 7 วันที่ผ่านมา — งานที่เกี่ยวข้องถูกยกเลิกแล้ว" },
  requests: { title: "คำขอสิทธิที่เปิดอยู่", hint: "ต้องตอบภายใน 30 วันนับจากวันที่ได้รับ — ใกล้ครบกำหนดก่อน · เลื่อนไม่ได้" },
  due: { title: "ครบกำหนดวันนี้–พรุ่งนี้", hint: "งานติดต่อของคุณและงานที่ยังไม่มีผู้รับผิดชอบ" },
  overdue: { title: "เลยกำหนด", hint: "เก่าสุดก่อน" },
  moved: { title: "คนที่รู้จักย้ายบริษัท", hint: "คนที่ทีมรู้จัก เคยอยู่ในโอกาสขาย หรือเคยนัดประชุม มีสังกัดใหม่ — ย้ายล่าสุดก่อน" },
  review: { title: "รอตรวจที่กระทบงาน", hint: "คู่ที่อาจเป็นคนเดียวกัน ที่มีคนอยู่ในแคมเปญหรือมีงานเปิด" },
  expiring: { title: "ข้อมูลครบอายุ", hint: "ครบหรือจะครบอายุใน 14 วันตามกฎของวัตถุประสงค์ — ลบ หรือมีเหตุให้เก็บต่อ (เช่น คุยกันใหม่)" },
  quiet: { title: "บัญชีที่เงียบ", hint: "มีโอกาสขายเปิดอยู่ แต่ไม่มีปฏิสัมพันธ์นานเกินกำหนด" },
};

/** รายการต่อหมวดที่แสดง — เกินนี้แสดงเป็นจำนวนพร้อมลิงก์ไปหน้าเต็ม */
export const QUEUE_SECTION_CAP: Record<QueueSection, number> = { stop: 10, requests: 10, due: 10, overdue: 10, moved: 5, review: 5, expiring: 5, quiet: 5 };

/** การย้ายที่เก่ากว่านี้ (นับจากวันเริ่มสังกัดใหม่) ไม่ขึ้นคิว — ยังดูได้ในแฟ้มบริษัท */
export const MOVED_WINDOW_DAYS = 365;

/** ไม่มีปฏิสัมพันธ์กี่วันจึงนับว่าเงียบ */
export const QUIET_DAYS = 30;

/** เลื่อนหมวดเดิมได้กี่ครั้งก่อนต้องตัดสินใจ (ทำ · ยกเลิก) — กันคิวที่เลื่อนไปเรื่อย ๆ จนไม่มีใครเห็น */
export const MAX_SNOOZES = 3;

/** ชนิดของสิ่งที่รายการชี้ไป — ใช้เป็นกุญแจของการเลื่อน/รับทราบ */
export type QueueItemKind = "preference" | "task" | "review" | "org" | "affiliation" | "customer" | "dsar";

export type QueueItem = {
  section: QueueSection;
  kind: QueueItemKind;
  id: string;
  title: string;
  /** เหตุผลที่อยู่ในคิว เป็นข้อความที่ตรวจกับข้อมูลได้ */
  detail: string[];
  href: string | null;
  /** เวลาที่ใช้เรียงในหมวด */
  at: string;
  /** สถานะนโยบาย ณ ตอนแสดง สำหรับรายการที่เป็นการติดต่อ — null = ไม่เกี่ยวกับการติดต่อ */
  eligibility: { status: string; reasons: string[] } | null;
  snoozable: boolean;
  /** รับทราบแล้วหายจากคิว (หมวดต้องหยุด ซึ่งเลื่อนไม่ได้ · และสัญญาณคนย้ายบริษัท) */
  ackable: boolean;
  /** เลื่อนมาแล้วกี่ครั้ง */
  snoozes: number;
  /** งาน: ปิดหรือบันทึกผลได้จากหน้าแรกเลย (docs/qa-plan.md BUG-05) — งานแคมเปญบันทึกผลผ่านการตรวจนโยบาย */
  task?: { campaignId: string | null; targetId: string | null };
};

export type TodayQueue = {
  sections: { section: QueueSection; items: QueueItem[]; more: number }[];
  /** รอตรวจทั้งหมดที่ไม่กระทบงาน — แสดงแค่จำนวน ไม่ซ่อนและไม่บังคับ */
  reviewsNotBlocking: number;
  generatedAt: string;
};
