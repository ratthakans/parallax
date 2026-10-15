/* ── Account Workspace: ค่าที่อนุญาตและป้ายภาษาไทย (docs/plan.md B4) ─────────

   ความสัมพันธ์ต้องมีหลักฐานและผู้ยืนยัน (Blueprint บท 3) — ชนิดจึงเป็นรายการปิด ไม่ใช่ข้อความอิสระ
   เพื่อให้กรองและนับได้ และไม่กลายเป็นช่องเดาความสัมพันธ์ */

import type { Classification } from "@/lib/shared/vault";

export const RELATIONSHIP_TYPES = [
  "decision_maker", "influencer", "champion", "reports_to", "works_with", "introduced_by", "former_colleague",
  "partner_of", "supplier_of", "customer_of", "sponsor_of",
  "knows", "has_worked_with",
] as const;
/* ── คนในทีมรู้จักคนในฐาน (docs/solo-plan.md S2) ──
   ปลายต้นทางเป็นสมาชิกทีม (member · รหัสเดียวกับเจ้าของบัญชีและผู้รับผิดชอบงาน) ไม่ใช่คนในฐาน
   บันทึกได้เฉพาะสมาชิกเองว่า "ฉันรู้จัก" พร้อมบริบท (พบที่ไหน เมื่อไร) — ไม่มีใครยืนยันแทนกันได้ และระบบไม่สร้างเอง */
export const MEMBER_RELATIONSHIP_TYPES = ["knows", "has_worked_with"] as const;
export type MemberRelationshipType = (typeof MEMBER_RELATIONSHIP_TYPES)[number];
/** ความสัมพันธ์คน↔คนที่ใช้เป็นทอดที่สองของเส้นทางได้ (ไม่มีทิศ — ใครรู้จักใคร ไม่ใช่ใครรายงานใคร) */
export const BRIDGE_TYPES = ["works_with", "former_colleague", "reports_to", "introduced_by"] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];
export const RELATIONSHIP_TH: Record<RelationshipType, string> = {
  decision_maker: "ผู้ตัดสินใจของ",
  influencer: "ผู้มีอิทธิพลต่อการตัดสินใจของ",
  champion: "ผู้ผลักดันภายใน",
  reports_to: "รายงานต่อ",
  works_with: "ทำงานร่วมกับ",
  introduced_by: "ได้รับการแนะนำโดย",
  former_colleague: "เคยทำงานด้วยกันกับ",
  partner_of: "พันธมิตรของ",
  supplier_of: "ผู้ขาย/ผู้ให้บริการของ",
  customer_of: "ลูกค้าของ",
  sponsor_of: "สปอนเซอร์ของ",
  knows: "รู้จัก",
  has_worked_with: "เคยร่วมงานกับ",
};
/** ชนิดที่ใช้ได้ต่อคู่ปลายทาง — คน→องค์กร · คน→คน · องค์กร→องค์กร */
export type RelationshipEnd = "person" | "org" | "member";
export const RELATIONSHIP_ENDS: Record<RelationshipType, [RelationshipEnd, RelationshipEnd]> = {
  decision_maker: ["person", "org"],
  influencer: ["person", "org"],
  champion: ["person", "org"],
  reports_to: ["person", "person"],
  works_with: ["person", "person"],
  introduced_by: ["person", "person"],
  former_colleague: ["person", "person"],
  partner_of: ["org", "org"],
  supplier_of: ["org", "org"],
  customer_of: ["org", "org"],
  sponsor_of: ["org", "org"],
  knows: ["member", "person"],
  has_worked_with: ["member", "person"],
};

export const INTERACTION_KINDS = ["meeting", "call", "email", "event", "note"] as const;
export type InteractionKind = (typeof INTERACTION_KINDS)[number];
export const INTERACTION_TH: Record<InteractionKind, string> = {
  meeting: "ประชุม",
  call: "โทร",
  email: "อีเมล (นอกระบบ)",
  event: "พบที่งาน/กิจกรรม",
  note: "โน้ต",
};

/* ── ระดับความลับ ── ผู้อ่านเห็นได้ถึงระดับสิทธิ์ของตัวเอง · "จำกัดสูง" เห็นเฉพาะเจ้าของรายการ และไม่ส่งให้ AI เลย */
export const CLEARANCE_RANK: Record<Classification, number> = { public: 0, internal: 1, confidential: 2, restricted_high: 3 };
export const canSee = (clearance: Classification, item: Classification) => CLEARANCE_RANK[item] <= CLEARANCE_RANK[clearance];

/** ฟิลด์ของบริษัทที่แก้ได้จากแฟ้ม — ทุกการแก้เขียนประวัติรุ่น (record_versions) */
export const ORG_EDITABLE = ["name_en", "industry", "tax_id", "branch_code", "primary_domain"] as const;
export type OrgEditable = (typeof ORG_EDITABLE)[number];
export const ORG_FIELD_TH: Record<OrgEditable | "name" | "parent_id" | "classification" | "account_owner_id", string> = {
  name: "ชื่อบริษัท",
  name_en: "ชื่อภาษาอังกฤษ",
  industry: "อุตสาหกรรม",
  tax_id: "เลขประจำตัวผู้เสียภาษี",
  branch_code: "รหัสสาขา",
  primary_domain: "โดเมนหลัก",
  parent_id: "บริษัทแม่",
  classification: "ระดับความลับ",
  account_owner_id: "เจ้าของบัญชี",
};
