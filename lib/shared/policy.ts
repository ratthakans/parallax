/* ── ค่าของบริการนโยบาย (docs/plan.md หัวข้อ 6 · Blueprint 2.0 บท 5) ─────────
   ป้ายภาษาไทยอยู่ที่นี่ที่เดียว ทั้งหน้าจอและชุดตรวจใช้คำเดียวกัน */

export const LAWFUL_BASES = ["consent", "legitimate_interest", "contract", "legal_obligation"] as const;
export type LawfulBasis = (typeof LAWFUL_BASES)[number];
export const LAWFUL_BASIS_TH: Record<LawfulBasis, string> = {
  consent: "ความยินยอม",
  legitimate_interest: "ประโยชน์โดยชอบด้วยกฎหมาย (ต้องมีผลประเมิน LIA)",
  contract: "สัญญา (เช่น ผู้ซื้อบัตร · ผู้ออกบูธที่ทำสัญญา)",
  legal_obligation: "หน้าที่ตามกฎหมาย",
};

export const CHANNELS = ["email", "phone", "meeting"] as const;
export type Channel = (typeof CHANNELS)[number];
export const CHANNEL_TH: Record<Channel, string> = { email: "อีเมล", phone: "โทรศัพท์", meeting: "พบตัว / นัดประชุม" };

/** ชนิดข้อความ — ฐานสัญญาครอบคลุมข้อความบริการ ไม่ครอบคลุมข้อเสนอ · ขอความยินยอมใหม่ไม่ทำแบบเหมารวม */
export const MESSAGE_KINDS = ["service", "marketing", "consent_request"] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];
export const MESSAGE_KIND_TH: Record<MessageKind, string> = {
  service: "ข้อความบริการ (เกี่ยวกับสิ่งที่เขาซื้อ/ลงทะเบียนแล้ว)",
  marketing: "ข้อเสนอ / การตลาด (เช่น ขายสปอนเซอร์)",
  consent_request: "ขอความยินยอม",
};

export const ELIGIBILITY_ORDER = ["eligible", "review_required", "channel_invalid", "suppressed"] as const;

export const TARGET_STATUSES = ["open", "assigned", "contacted", "meeting", "proposal", "won", "lost", "not_interested", "cancelled"] as const;
export type TargetStatus = (typeof TARGET_STATUSES)[number];
export const TARGET_STATUS_TH: Record<TargetStatus, string> = {
  open: "ยังไม่มอบหมาย",
  assigned: "มอบหมายแล้ว",
  contacted: "ติดต่อแล้ว",
  meeting: "นัดประชุมแล้ว",
  proposal: "ส่งข้อเสนอแล้ว",
  won: "ปิดการขายได้",
  lost: "ไม่ได้",
  not_interested: "ไม่สนใจ",
  cancelled: "ยกเลิก (นโยบายไม่อนุญาตแล้ว)",
};
/** ผลที่บันทึกได้หลังติดต่อ — ลำดับคือทางเดินปกติของการขาย */
export const OUTCOMES: TargetStatus[] = ["contacted", "meeting", "proposal", "won", "lost", "not_interested"];

/* ── เกณฑ์เป้าหมายแบบอ่านได้ ── ทุกเงื่อนไขเป็นสิ่งที่ตรวจกับหลักฐานในฐานได้ ไม่มีคะแนน */
export type Criteria = {
  /** ตำแหน่งปัจจุบันมีคำใดคำหนึ่ง (เช่น การตลาด · marketing · ผู้จัดการ) */
  titleKeywords?: string[];
  /** เคยร่วมงานนี้ (ชื่องานมีคำนี้) */
  program?: string;
  /** ในบทบาทใดบทบาทหนึ่ง (เช่น ผู้ออกบูธ · สปอนเซอร์) */
  roles?: string[];
  /** ตั้งแต่ปี/ครั้งนี้ขึ้นไป */
  sinceEdition?: string;
  /** อุตสาหกรรมของบริษัท (ต้องมีค่าที่คนบันทึก — ไม่ทราบ = ไม่เข้าเกณฑ์) */
  industry?: string;
  /** ไม่รวมบริษัทที่มีโอกาสขายเปิดอยู่แล้ว */
  excludeOpenOpportunities?: boolean;
  /** คนต่อบริษัทไม่เกิน (ค่าตั้งต้น 2) */
  maxPerOrg?: number;
  /** มีคนในทีมรู้จัก (ยืนยันแล้ว) — "direct" = รู้จักตัวเขาเอง · "any" = ภายในสองทอด (ผ่านคนกลางหรือเพื่อนร่วมบริษัท) */
  warmPath?: "direct" | "any";
  /** บริษัทมีปฏิสัมพันธ์ภายใน N วัน */
  interactedWithinDays?: number;
  /** บริษัทไม่มีปฏิสัมพันธ์มาแล้วอย่างน้อย N วัน (รวมที่ไม่เคยมี) — ใช้หาบัญชีที่เงียบ */
  quietForDays?: number;
  /* ── ลูกค้าบุคคล (docs/crm-plan.md F5) ── ใช้เมื่อ audience = "person" · เกณฑ์ฝั่งบริษัทข้างบนไม่ใช้ */
  /** กลุ่มเป้าหมาย: "org" = คนที่สังกัดบริษัท (ค่าตั้งต้น) · "person" = ลูกค้าบุคคล (ไม่มีสังกัดบริษัทปัจจุบัน) */
  audience?: "org" | "person";
  /** ซื้อล่าสุดภายใน N วัน */
  boughtWithinDays?: number;
  /** ซื้อครั้งล่าสุดนานกว่า N วันแล้ว (ต้องเคยซื้อ) — ใช้ดึงลูกค้าที่หายไปกลับมา */
  lapsedForDays?: number;
  /** ยอดซื้อรวมอย่างน้อย (บาท) */
  minSpent?: number;
  /** ซื้ออย่างน้อย N ครั้ง */
  minOrders?: number;
  /** เคยซื้อสินค้าที่หมวดหรือชื่อมีคำนี้ */
  boughtCategory?: string;
};

export const isPersonAudience = (c: Criteria) => c.audience === "person";

export function describeCriteria(c: Criteria): string[] {
  if (isPersonAudience(c)) {
    const out = ["ลูกค้าบุคคล (ไม่มีสังกัดบริษัทปัจจุบัน)"];
    if (c.boughtWithinDays) out.push(`ซื้อล่าสุดภายใน ${c.boughtWithinDays} วัน`);
    if (c.lapsedForDays) out.push(`ไม่ได้ซื้อมาแล้วอย่างน้อย ${c.lapsedForDays} วัน (ต้องเคยซื้อ)`);
    if (c.minOrders) out.push(`ซื้ออย่างน้อย ${c.minOrders} ครั้ง`);
    if (c.minSpent) out.push(`ยอดซื้อรวมอย่างน้อย ${c.minSpent.toLocaleString("en-US")} บาท`);
    if (c.boughtCategory) out.push(`เคยซื้อสินค้าที่หมวดหรือชื่อมี “${c.boughtCategory}”`);
    if (c.excludeOpenOpportunities) out.push("ไม่รวมลูกค้าที่มีดีลเปิดอยู่แล้ว");
    return out;
  }
  const out = ["ยังสังกัดบริษัทอยู่ (ไม่มีวันที่ออก)"];
  if (c.titleKeywords?.length) out.push(`ตำแหน่งมีคำว่า ${c.titleKeywords.map((k) => `“${k}”`).join(" หรือ ")}`);
  if (c.program) out.push(`เคยร่วมงานที่ชื่อมี “${c.program}”${c.roles?.length ? ` ในบทบาท ${c.roles.join(" / ")}` : ""}${c.sinceEdition ? ` ตั้งแต่ ${c.sinceEdition}` : ""}`);
  else if (c.roles?.length) out.push(`เคยร่วมงานในบทบาท ${c.roles.join(" / ")}`);
  if (c.industry) out.push(`อุตสาหกรรมของบริษัทคือ “${c.industry}” (บริษัทที่ไม่ทราบอุตสาหกรรมไม่เข้าเกณฑ์)`);
  if (c.excludeOpenOpportunities) out.push("ไม่รวมบริษัทที่มีโอกาสขายเปิดอยู่แล้ว");
  if (c.warmPath === "direct") out.push("มีคนในทีมรู้จักตัวเขาโดยตรง (ยืนยันแล้ว)");
  else if (c.warmPath === "any") out.push("มีคนในทีมเข้าถึงได้ภายในสองทอด (รู้จักเอง หรือผ่านคนกลางที่ยืนยันแล้ว)");
  if (c.interactedWithinDays) out.push(`บริษัทมีปฏิสัมพันธ์ภายใน ${c.interactedWithinDays} วัน`);
  if (c.quietForDays) out.push(`บริษัทไม่มีปฏิสัมพันธ์มาแล้วอย่างน้อย ${c.quietForDays} วัน (รวมที่ไม่เคยมี)`);
  out.push(`ไม่เกิน ${c.maxPerOrg ?? 2} คนต่อบริษัท`);
  return out;
}

/* ── ร่างข้อความหลังผ่านนโยบาย (docs/solo-plan.md S7) ── ร่างไม่ถูกเก็บ · ไม่ส่งจากระบบ */
export type OutreachDraftView = {
  subject: string;
  body: string;
  channel: Channel;
  messageKind: MessageKind;
  generatedBy: "ai" | "fallback";
  note?: string;
  /** ชื่อผู้แนะนำ — มีเฉพาะเมื่อมีความสัมพันธ์ "ได้รับการแนะนำโดย" ที่ยืนยันแล้ว */
  introducedBy: string | null;
  optOut: boolean;
  /** หลักฐานที่ใช้ร่าง (ที่ผู้ใช้เห็นได้อยู่แล้ว) */
  evidence: { id: string; text: string }[];
  policyVersion: string;
};
/** ผลของปุ่ม "ร่างข้อความ" — ActionState ที่มีร่างแนบมา */
export type DraftState = { ok?: string; error?: string; draft?: OutreachDraftView } | null;
