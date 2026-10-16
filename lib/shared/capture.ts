import type { InteractionKind } from "@/lib/shared/accounts";

/* ── จดก่อน จัดทีหลัง (docs/solo-plan.md S6) ─────────────────────────

   ชนิดและตัวช่วยบริสุทธิ์ที่ทั้งหน้าจอและเครื่องยนต์ใช้ร่วมกัน
   โน้ตหลังพบลูกค้า: แยกเป็นร่าง → ผู้ใช้แก้/ยืนยัน → จึงบันทึก (ร่างไม่ถูกเขียนลงฐาน)
   นามบัตร: กรอกมือทีละชุด (ชื่องาน + วันที่ถามครั้งเดียวต่อชุด) → Data Vault แหล่ง `namecard` */

/** ร่างที่แยกจากโน้ต — ยังไม่มีอะไรถูกบันทึก ผู้ใช้แก้ได้ทุกช่องก่อนกดยืนยัน */
export type NoteDraft = {
  /** ai = โมเดลแยกให้ · fallback = AI ปิด/ล้ม → โน้ตดิบ (ชนิด "โน้ต" · วันนี้ · ข้อความเดิม) */
  source: "ai" | "fallback";
  note?: string;
  kind: InteractionKind;
  occurredAt: string;
  /** คนในแฟ้มบริษัทนี้เท่านั้น — รหัสที่โมเดลแต่งขึ้นถูกทิ้งก่อนถึงหน้าจอ */
  participants: { personId: string; name: string }[];
  /** ชื่อที่โน้ตพูดถึงแต่ไม่มีในแฟ้ม — ระบบไม่สร้างคนให้ ผู้ใช้ตัดสินเอง */
  unknownPeople: string[];
  summary: string;
  outcome: string;
  task: { title: string; dueAt: string };
  interests: string[];
  /** จำนวนค่าที่โมเดลเสนอแต่ถูกทิ้งเพราะไม่ผ่านการตรวจ (รหัสคนที่ไม่มี · ชนิดที่ไม่รู้จัก · วันที่ผิด) */
  dropped: number;
};

export const NOTE_MAX = 4000;
export const CARD_BATCH_MAX = 50;

/* ── ปิดช่องทางติดต่อในข้อความก่อนส่งออกนอกระบบ ──
   โน้ตที่ผู้ใช้วางมาจากอีเมลมักมีลายเซ็น (อีเมล · เบอร์) — สิ่งที่โมเดลต้องใช้คือเนื้อหา ไม่ใช่ช่องทาง
   เลข 13 หลัก (บัตรประชาชน/ผู้เสียภาษี) ก็ปิดด้วย · ใช้ทั้งก่อนส่งและกับผลที่โมเดลตอบกลับ */
const EMAIL_RE = /[^\s@<>()[\]{},;:"']+@[^\s@<>()[\]{},;:"']+\.[^\s@<>()[\]{},;:"']+/g;
const ID13_RE = /(?<!\d)\d(?:[\s-]?\d){12}(?!\d)/g;
const PHONE_RE = /(?<![\w])(?:\+?66[\s-]?|0)\d(?:[\s.-]?\d){7,9}(?![\w])/g;
const LINE_RE = /(?:line\s*(?:id)?|ไลน์|ไอดีไลน์)\s*[:：]?\s*@?[A-Za-z0-9._-]{3,}/gi;

export function redactContacts(text: string): string {
  return text
    .replace(EMAIL_RE, "[อีเมล]")
    .replace(LINE_RE, "[LINE]")
    .replace(ID13_RE, "[เลขประจำตัว]")
    .replace(PHONE_RE, "[เบอร์]");
}

export const hasContact = (text: string) => redactContacts(text) !== text;

/** วันที่รูปแบบ YYYY-MM-DD ที่มีอยู่จริง */
export function isDay(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s;
}
