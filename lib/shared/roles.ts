/* ── บทบาทในบัญชี (docs/plan.md B6 · หัวข้อ 3.3 และ 8) ─────────────────────

   หกบทบาท · ตารางสิทธิ์อยู่ที่นี่ที่เดียว — Server Action ตรวจผ่าน denied() ใน app/(app)/viewer.ts
   ชั้นฐานข้อมูล (RLS app.can_write) แยกแค่ "เขียนได้ / อ่านอย่างเดียว" · การแยกละเอียดกว่านั้นอยู่ที่ตารางนี้
   คนเดียวถือบทบาทเจ้าของ = ทำได้ทุกอย่าง (โหมดคนเดียว) — การควบคุมสองคนแทนด้วยช่วงรอ (เช่น ส่งออก)
   ผู้ใช้เดิมที่เป็น operator ย้ายเป็นหัวหน้าทีม (0017) ซึ่งทำได้เท่าที่ operator เคยทำ */

export const ROLES = ["owner", "privacy", "steward", "lead", "bd", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_TH: Record<Role, { name: string; does: string }> = {
  owner: { name: "เจ้าของบัญชี", does: "ทุกอย่าง รวมการตั้งค่าบัญชีและล้างข้อมูล" },
  privacy: { name: "ผู้ดูแลข้อมูลส่วนบุคคล", does: "ฐานการประมวลผล · อายุข้อมูล · คำขอสิทธิ · ลบคน · อนุมัติการส่งออก" },
  steward: { name: "Data steward", does: "ลงทะเบียนแหล่ง · นำเข้า · ตรวจและรวมตัวตน" },
  lead: { name: "หัวหน้าทีม", does: "นำเข้าและตรวจตัวตน · สร้างแคมเปญ · มอบหมายงาน · ขอส่งออก" },
  bd: { name: "BD", does: "แฟ้มบริษัท · บันทึกปฏิสัมพันธ์และผลงานที่ได้รับมอบหมาย" },
  viewer: { name: "อ่านอย่างเดียว", does: "ดูได้ แก้ไม่ได้" },
};

/** การกระทำที่แยกสิทธิ์ */
export const CAPABILITIES = ["write", "import", "review", "campaign", "policy", "privacy", "export_request", "export_approve", "account_admin"] as const;
export type Capability = (typeof CAPABILITIES)[number];

const MATRIX: Record<Capability, readonly Role[]> = {
  /** บันทึกงานประจำ: ปฏิสัมพันธ์ · งาน · แฟ้มบริษัท · ความยินยอม · เลื่อนคิว · เปิดคำขอสิทธิ */
  write: ["owner", "privacy", "steward", "lead", "bd"],
  /** ลงทะเบียนแหล่ง · นำเข้าไฟล์ */
  import: ["owner", "steward", "lead"],
  /** ตัดสินคิวตรวจตัวตน · รวม/แยกคืน · สุ่มตรวจ */
  review: ["owner", "steward", "lead"],
  /** สร้างแคมเปญ · เกณฑ์ · สร้างรายชื่อ · มอบหมาย */
  campaign: ["owner", "lead"],
  /** ฐานการประมวลผล · แม่แบบวัตถุประสงค์ · กฎอายุข้อมูล */
  policy: ["owner", "privacy"],
  /** ปิดคำขอสิทธิ · รายงานข้อมูลของผู้ขอ · ลบคน */
  privacy: ["owner", "privacy"],
  export_request: ["owner", "privacy", "lead"],
  export_approve: ["owner", "privacy"],
  /** ล้างข้อมูลทั้งบัญชี · แผนและการชำระเงิน */
  account_admin: ["owner"],
};

export const can = (role: Role, cap: Capability): boolean => MATRIX[cap].includes(role);

/** การกระทำที่ต้องยืนยันตัวตนสองชั้นในรอบล็อกอินนี้ — ข้อมูลออกจากระบบ (ส่งออก · รายงานคำขอสิทธิ) หรือหายถาวร (ลบคน · ล้างบัญชี)
    รหัสผ่านที่รั่วอย่างเดียวต้องทำสิ่งเหล่านี้ไม่ได้ · งานประจำ (บันทึก · นำเข้า · แคมเปญ) ไม่บังคับ */
export const MFA_REQUIRED: readonly Capability[] = ["privacy", "export_request", "export_approve", "account_admin"];
export const MFA_NEEDED_TH = "การกระทำนี้ต้องยืนยันตัวตนสองชั้น — เปิดใช้ที่หน้าตั้งค่า แล้วเข้าสู่ระบบใหม่พร้อมรหัสจากแอป";

export type MfaLevel = "verified" | "pending" | "none";

/** ด่านเดียวของทุก Server Action: บทบาททำได้ไหม · ล็อกอินครบไหม · การกระทำเสี่ยงยืนยันสองชั้นแล้วไหม — null = ผ่าน */
export function gate(role: Role, mfa: MfaLevel, cap: Capability): string | null {
  if (!can(role, cap)) return deniedTh(cap);
  /* มีแอปยืนยันแต่ยังไม่ได้ใส่รหัส = ยังล็อกอินไม่ครบ ทำอะไรไม่ได้ */
  if (mfa === "pending") return "ใส่รหัสจากแอปยืนยันตัวตนก่อน — เข้าสู่ระบบใหม่";
  if (MFA_REQUIRED.includes(cap) && mfa !== "verified") return MFA_NEEDED_TH;
  return null;
}
export const rolesWith = (cap: Capability): readonly Role[] => MATRIX[cap];

const DENIED_TH: Record<Capability, string> = {
  write: "บทบาทของคุณอ่านได้อย่างเดียว",
  import: "นำเข้าและลงทะเบียนแหล่งได้เฉพาะ Data steward หัวหน้าทีม หรือเจ้าของบัญชี",
  review: "ตรวจและรวมตัวตนได้เฉพาะ Data steward หัวหน้าทีม หรือเจ้าของบัญชี",
  campaign: "สร้างแคมเปญและมอบหมายงานได้เฉพาะหัวหน้าทีมหรือเจ้าของบัญชี",
  policy: "ตั้งฐานการประมวลผลและอายุข้อมูลได้เฉพาะผู้ดูแลข้อมูลส่วนบุคคลหรือเจ้าของบัญชี",
  privacy: "คำขอสิทธิและการลบคนเป็นของผู้ดูแลข้อมูลส่วนบุคคลหรือเจ้าของบัญชี",
  export_request: "ขอส่งออกได้เฉพาะหัวหน้าทีม ผู้ดูแลข้อมูลส่วนบุคคล หรือเจ้าของบัญชี",
  export_approve: "อนุมัติการส่งออกได้เฉพาะผู้ดูแลข้อมูลส่วนบุคคลหรือเจ้าของบัญชี",
  account_admin: "เฉพาะเจ้าของบัญชีเท่านั้น",
};
export const deniedTh = (cap: Capability) => DENIED_TH[cap];

/** ค่าใน tenant_users.role → บทบาท · operator (ก่อน 0017) = หัวหน้าทีม · ไม่รู้จัก = อ่านอย่างเดียว (สิทธิ์น้อยสุด) */
export function roleFrom(raw: string | null | undefined): Role {
  if (raw === "operator") return "lead";
  return (ROLES as readonly string[]).includes(raw ?? "") ? (raw as Role) : "viewer";
}
