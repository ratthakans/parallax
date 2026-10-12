/* ── ชื่อช่องทางติดต่อที่หน้าจอใช้ ─────────────────────────────

   รายการชนิดตัวจริงอยู่ที่ lib/engine/pii.ts (CONTACT_KINDS) ซึ่งหน้าจอ
   import ไม่ได้ เพราะไฟล์นั้นถือกุญแจเข้ารหัส — ที่นี่จึงมีแค่ชื่อที่อ่านได้
   และลำดับที่ใช้แสดงในฟอร์ม ส่วน lib/engine/customers.ts ตรวจซ้ำอีกชั้น
   ว่าชนิดที่ฟอร์มส่งมามีอยู่จริงก่อนเขียนอะไรลงฐาน */
export const CONTACT_KIND_LABEL: Record<string, string> = {
  phone: "เบอร์โทร",
  email: "อีเมล",
  line: "LINE",
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  website: "เว็บไซต์",
  address: "ที่อยู่",
  member_no: "รหัสสมาชิก",
};

export const CONTACT_KIND_ORDER = Object.keys(CONTACT_KIND_LABEL);

/** ช่องทางที่ใช้บอกว่า "คนนี้คือใคร" ตอนนำเข้าไฟล์ครั้งถัดไป — ลำดับเดียวกับ identityOf */
export const IDENTITY_KINDS = ["member_no", "phone", "email", "line"] as const;
