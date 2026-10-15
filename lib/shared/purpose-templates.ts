import type { Channel, LawfulBasis, MessageKind } from "@/lib/shared/policy";

/* ── แม่แบบวัตถุประสงค์ (docs/solo-plan.md S4) ─────────────────────────

   คนที่ถือทุกบทบาทจะไม่เขียน LIA และไม่ตั้งอายุข้อมูลเอง ผลคือทุกคนเป็น "ต้องตรวจก่อน" และระบบใช้ไม่ได้
   แม่แบบให้จุดเริ่มที่ถูกทาง: ฐาน · ช่องทาง · ชนิดข้อความ · อายุข้อมูล · ขอบเขตบริษัท — แก้ทีหลังได้ทีละรุ่น

   ⚠ ข้อความทางกฎหมายทั้งหมดในไฟล์นี้เป็น "ร่าง" จนกว่านักกฎหมาย/DPO จะตรวจ (plan O3)
   แก้ข้อความ = เพิ่ม version · วัตถุประสงค์ที่ใช้อยู่ไม่เปลี่ยนตาม (ผู้ใช้เห็นว่ามีรุ่นใหม่ แล้วเลือกเอง)

   ไม่มีแม่แบบ "ใช้ได้ทุกอย่าง" — ทุกตัวจำกัดช่องทางและชนิดข้อความ */

export type PurposeTemplate = {
  code: string;
  version: number;
  name: string;
  description: string;
  lawfulBasis: LawfulBasis;
  channels: Channel[];
  messageKinds: MessageKind[];
  /** ฐานผูกกับความสัมพันธ์กับบริษัทที่เขาสังกัด — ย้ายบริษัทแล้วต้องตรวจใหม่ (หรือมีหลักฐานใหม่ที่บริษัทใหม่) */
  employerScoped: boolean;
  retention: { days: number; trigger: string; note: string };
  /** สรุปการประเมินประโยชน์โดยชอบ — อ้างใน processing_records.lia_ref */
  lia: string | null;
  /** สิ่งที่ผู้ใช้ต้องยืนยันว่าเป็นจริงก่อนเลือกแม่แบบนี้ */
  mustConfirm: string;
  draft: boolean;
};

export const PURPOSE_TEMPLATES: PurposeTemplate[] = [
  {
    code: "b2b_followup_existing", version: 1, draft: true,
    name: "ติดตามลูกค้าองค์กรเดิม",
    description: "ติดต่อผู้ติดต่อของบริษัทที่เคยซื้อหรือใช้บริการ เรื่องบริการที่เกี่ยวข้องกับที่เคยซื้อ",
    lawfulBasis: "legitimate_interest", channels: ["email", "phone", "meeting"], messageKinds: ["service", "marketing"],
    employerScoped: true,
    retention: { days: 3 * 365, trigger: "last_interaction", note: "3 ปีหลังติดต่อกันครั้งล่าสุด" },
    lia: "ร่าง LIA: มีความสัมพันธ์ทางธุรกิจอยู่แล้ว · ติดต่อในฐานะตัวแทนบริษัท เรื่องที่เกี่ยวกับสิ่งที่บริษัทเคยซื้อ · คาดหมายได้ตามสมควร · คัดค้านได้ทุกเมื่อ",
    mustConfirm: "บริษัทของผู้ติดต่อเคยซื้อหรือใช้บริการจากเราจริง",
  },
  {
    code: "b2b_event_namecard", version: 1, draft: true,
    name: "ติดต่อจากการแลกนามบัตรในงานธุรกิจ",
    description: "ติดต่อคนที่แลกนามบัตรกันในงานสัมมนา งานแสดงสินค้า หรือการประชุมธุรกิจ",
    lawfulBasis: "legitimate_interest", channels: ["email", "phone", "meeting"], messageKinds: ["service", "marketing"],
    employerScoped: true,
    retention: { days: 2 * 365, trigger: "received", note: "2 ปีหลังได้รับนามบัตร" },
    lia: "ร่าง LIA: เจ้าของนามบัตรให้ข้อมูลเองในบริบทธุรกิจ · ติดต่อเรื่องที่เกี่ยวกับงานนั้นหรือธุรกิจของเขา · คาดหมายได้ตามสมควร · คัดค้านได้ทุกเมื่อ",
    mustConfirm: "ได้รับนามบัตรโดยตรงในงานธุรกิจ (ระบุชื่องานและวันที่ในแหล่งข้อมูล)",
  },
  {
    code: "b2b_sponsor_offer", version: 1, draft: true,
    name: "เสนอสปอนเซอร์ให้ผู้ออกบูธหรือสปอนเซอร์เดิม",
    description: "เสนอแพ็กเกจสปอนเซอร์หรือพื้นที่ออกบูธให้บริษัทที่เคยร่วมงานของเรา",
    lawfulBasis: "legitimate_interest", channels: ["email", "phone", "meeting"], messageKinds: ["marketing"],
    employerScoped: true,
    retention: { days: 3 * 365, trigger: "last_participation", note: "3 ปีหลังร่วมงานครั้งล่าสุด" },
    lia: "ร่าง LIA: บริษัทเคยร่วมงานในบทบาทผู้ออกบูธหรือสปอนเซอร์ · ข้อเสนอเกี่ยวกับงานเดียวกันรอบถัดไป · คาดหมายได้ตามสมควร · คัดค้านได้ทุกเมื่อ",
    mustConfirm: "บริษัทเคยร่วมงานของเราในบทบาทผู้ออกบูธหรือสปอนเซอร์จริง",
  },
  {
    code: "b2b_marketing_consented", version: 1, draft: true,
    name: "ส่งข่าวสารและข้อเสนอให้คนที่ยินยอม",
    description: "ส่งข่าวสาร กิจกรรม และข้อเสนอการตลาดให้คนที่ให้ความยินยอมไว้",
    lawfulBasis: "consent", channels: ["email", "phone"], messageKinds: ["marketing"],
    employerScoped: false,
    retention: { days: 365, trigger: "withdrawal", note: "จนกว่าถอนความยินยอม แล้วเก็บหลักฐานต่อ 1 ปี" },
    lia: null,
    mustConfirm: "มีหลักฐานความยินยอมรายคน — แม่แบบนี้ไม่ทำให้ใครใช้ได้จนกว่าจะบันทึกความยินยอมของเขา",
  },
  {
    code: "b2b_referral", version: 1, draft: true,
    name: "ติดต่อคนที่ได้รับการแนะนำมา",
    description: "ติดต่อคนที่ลูกค้าหรือพันธมิตรแนะนำให้รู้จัก",
    lawfulBasis: "legitimate_interest", channels: ["email", "phone", "meeting"], messageKinds: ["service", "marketing"],
    employerScoped: false,
    retention: { days: 365, trigger: "referred", note: "1 ปีหลังได้รับการแนะนำ (ถ้ายังไม่ได้คุยกัน)" },
    lia: "ร่าง LIA: มีผู้แนะนำที่ระบุตัวได้ · ติดต่อครั้งแรกเพื่อแนะนำตัวและบอกว่าใครแนะนำ · คัดค้านได้ทุกเมื่อ",
    mustConfirm: "มีผู้แนะนำจริง และบันทึกไว้ว่าใครแนะนำ (ความสัมพันธ์ \"ได้รับการแนะนำโดย\")",
  },
];

export const templateOf = (code: string | null | undefined) => PURPOSE_TEMPLATES.find((t) => t.code === code) ?? null;
