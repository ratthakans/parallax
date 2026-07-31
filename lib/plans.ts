/* ── แผนราคาและต้นทุนข้อความ ───────────────────────────────────
   ไฟล์นี้เป็นข้อมูลล้วน ห้าม import ฐานข้อมูล — เพราะทั้งหน้า /pricing
   บนเว็บหลักและหน้า /app/billing ในคอนโซลอ่านจากที่นี่ที่เดียว

   เหตุผลที่ต้องเป็นแหล่งเดียว: ก่อนหน้านี้ตารางราคาบนเว็บเป็นข้อความ
   ที่พิมพ์มือ ไม่มีอะไรผูกกับสิ่งที่โค้ดบังคับใช้จริง ผลคือหน้าเว็บ
   ประกาศเพดาน "ถึง 500 คน" และ "ข้อความรวมในแพ็ก 2,000" ในขณะที่
   ไม่มีบรรทัดใดในระบบอ่านค่าพวกนั้นเลย เพดานที่ไม่บังคับใช้ไม่ใช่เพดาน
   และราคาที่หน้าเว็บอย่างเดียวรู้ คือราคาที่จะเพี้ยนภายในหนึ่งสัปดาห์
   ───────────────────────────────────────────────────────────── */

/** ต้นทุนจริงต่อข้อความ LINE — ที่เดียวในระบบ */
export const MESSAGE_COST_BAHT = 0.75;

/** ประมาณการค่าสื่อต่อคนใน audience (Reach) */
export const MEDIA_COST_PER_PERSON = 1.4;

export type PlanId = "free" | "growth" | "multi" | "chain";

/** สถานะของความสามารถหนึ่งอย่างในแผนหนึ่ง */
export type Cap =
  | { kind: "yes" }
  | { kind: "no" }
  | { kind: "read" }
  /** มีในแผนนี้ตามสัญญา แต่ยังไม่ได้ทำ — ต้องเขียนว่า "กำลังพัฒนา" ทุกที่ */
  | { kind: "roadmap" }
  | { kind: "text"; value: string };

export type Plan = {
  id: PlanId;
  name: string;
  /** null = ราคาตกลงกันเป็นรายกรณี */
  monthlyBaht: number | null;
  /** ข้อความต่อท้ายราคา เช่น "ขึ้นไป" */
  priceSuffix?: string;
  /** เพดานจำนวนคนที่ระบุตัวตนได้ — null = ตกลงกันตามสัญญา */
  contactCap: number | null;
  /** เครดิตแรกเข้า แจกครั้งเดียวตอนเปิดบัญชี ไม่ใช่ทุกเดือน */
  welcomeCredits: number;
  who: string;
  featured?: boolean;
  caps: {
    /** นำเข้าด้วยการลากไฟล์วาง */
    dragDrop: Cap;
    /** Keep — เห็นว่าเงินรั่วตรงไหน */
    keep: Cap;
    /** Reach — อนุมัติและส่งจริง */
    reach: Cap;
    /** Proof — holdout และช่วงความเชื่อมั่น */
    proof: Cap;
    /** API นำเข้าข้อมูล */
    api: Cap;
    /** ส่งอัตโนมัติโดยไม่ต้องกดอนุมัติ */
    autopilot: Cap;
    /** การช่วยตั้งต้นและแม็ปข้อมูล */
    onboarding: Cap;
  };
};

const YES: Cap = { kind: "yes" };
const NO: Cap = { kind: "no" };
const ROADMAP: Cap = { kind: "roadmap" };

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Pilot",
    monthlyBaht: 0,
    contactCap: 500,
    welcomeCredits: 0,
    who: "One file. One brief. One proof design.",
    caps: {
      dragDrop: YES,
      keep: { kind: "read" },
      reach: NO,
      proof: NO,
      api: NO,
      autopilot: NO,
      onboarding: { kind: "text", value: "Docs" },
    },
  },
  growth: {
    id: "growth",
    name: "Growth",
    monthlyBaht: 1900,
    contactCap: 5000,
    welcomeCredits: 1000,
    who: "Daily brief, KEEP actions, outcome tracking.",
    featured: true,
    caps: {
      dragDrop: YES,
      keep: YES,
      reach: YES,
      proof: YES,
      api: NO,
      autopilot: NO,
      onboarding: { kind: "text", value: "Email" },
    },
  },
  multi: {
    id: "multi",
    name: "Multi",
    monthlyBaht: 5900,
    contactCap: 25000,
    welcomeCredits: 3000,
    who: "REACH, multi-location, and advanced proof.",
    caps: {
      dragDrop: YES,
      keep: YES,
      reach: YES,
      proof: YES,
      api: ROADMAP,
      autopilot: ROADMAP,
      onboarding: { kind: "text", value: "Named contact" },
    },
  },
  chain: {
    id: "chain",
    name: "Chain",
    monthlyBaht: 15000,
    priceSuffix: "and up",
    contactCap: null,
    welcomeCredits: 10000,
    who: "Chains past 25k identities, with bespoke integration.",
    caps: {
      dragDrop: YES,
      keep: YES,
      reach: YES,
      proof: YES,
      api: ROADMAP,
      autopilot: ROADMAP,
      onboarding: { kind: "text", value: "Named contact" },
    },
  },
};

export const PLAN_ORDER: PlanId[] = ["free", "growth", "multi", "chain"];

export function isPlanId(v: string): v is PlanId {
  return v === "free" || v === "growth" || v === "multi" || v === "chain";
}

export function planById(v: string): Plan {
  return isPlanId(v) ? PLANS[v] : PLANS.growth;
}

/* ── เครดิตข้อความ ─────────────────────────────────────────────
   ค่าสมาชิกไม่รวมค่าข้อความ และนี่ไม่ใช่การกีดกัน — เป็นสิ่งเดียว
   ที่ทำให้คำว่า "ไม่ซ่อนค่าข้อความในค่าสมาชิก" เป็นความจริง

   เดิมตารางราคาเขียนว่า Growth "ข้อความรวมในแพ็ก 2,000" ซึ่งขัดกับ
   หลักที่ประกาศไว้ในหน้าเดียวกันสองย่อหน้าถัดไป และขัดกับต้นทุนจริง:
   ข้อความ 2,000 ข้อความมีต้นทุน 1,500 บาท จากค่าสมาชิก 1,900 บาท
   เหลือ 400 บาทเป็นค่าซอฟต์แวร์ ร้านที่ส่งหนักที่สุดจะเป็นร้านที่
   ทำให้ขาดทุนมากที่สุด — ซึ่งเป็นสิ่งที่หน้าราคาบอกว่าจะไม่ทำ

   โครงสร้างที่ระบบบังคับใช้จริงคือเครดิตจ่ายล่วงหน้าและหยุดเมื่อหมด
   (ดู sendCampaign) ไม่ใช่การเรียกเก็บส่วนเกินย้อนหลัง — เพราะระบบ
   เรียกเก็บเงินย้อนหลังยังไม่มี ราคาจึงต้องอธิบายกลไกที่มีอยู่จริง
   ───────────────────────────────────────────────────────────── */

export type CreditPack = {
  messages: number;
  baht: number;
};

export const CREDIT_PACKS: CreditPack[] = [
  { messages: 1000, baht: 1500 },
  { messages: 5000, baht: 6500 },
  { messages: 20000, baht: 22000 },
];

export const perMessage = (p: CreditPack) => p.baht / p.messages;

/** ราคาต่อข้อความของแพ็กที่ถูกที่สุดที่ยอดนี้เข้าเกณฑ์ */
export function rateForMessages(n: number): number {
  let rate = perMessage(CREDIT_PACKS[0]);
  for (const p of CREDIT_PACKS) if (n >= p.messages) rate = perMessage(p);
  return rate;
}

/** ราคาที่ต้องจ่ายสำหรับเครดิต n ข้อความ */
export function priceForMessages(n: number): number {
  return Math.round(n * rateForMessages(n));
}

/* ── รายปี ────────────────────────────────────────────────────
   จ่ายสิบเดือน ใช้สิบสองเดือน — ส่วนลดไม่ใช่ของแถม แต่คือค่าจ้าง
   ที่ลูกค้าให้เรากลับมาสำหรับความแน่นอนของกระแสเงินสด */
export const ANNUAL_MONTHS_PAID = 10;
export const ANNUAL_MONTHS_GIVEN = 12;
export const annualDiscountPct = Math.round(
  (1 - ANNUAL_MONTHS_PAID / ANNUAL_MONTHS_GIVEN) * 100,
);

export function annualBaht(plan: Plan): number | null {
  return plan.monthlyBaht == null ? null : plan.monthlyBaht * ANNUAL_MONTHS_PAID;
}

/* ── จุดคุ้มทุน ────────────────────────────────────────────────
   ตัวเลขที่ลูกค้าถามจริงไม่ใช่ "แพงไหม" แต่คือ "ต้องได้ยอดเพิ่ม
   เท่าไรจึงเสมอตัว" — คำนวณจากค่าสมาชิกหนึ่งปีบวกเครดิตแรกเข้า
   หารด้วยมาร์จิ้นขั้นต้นของร้าน */
export function breakEvenBaht(plan: Plan, grossMarginPct = 40): number | null {
  if (plan.monthlyBaht == null || plan.monthlyBaht === 0) return null;
  return Math.round((plan.monthlyBaht * 12) / (grossMarginPct / 100));
}

/* ── คำเรียกความสามารถบนหน้าจอ ─────────────────────────────── */

export function capLabel(c: Cap): string {
  switch (c.kind) {
    case "yes":
      return "✓";
    case "no":
      return "—";
    case "read":
      return "Read only";
    case "roadmap":
      return "In build";
    case "text":
      return c.value;
  }
}

export const capIsOn = (c: Cap) => c.kind === "yes";

/** แถวเปรียบเทียบ — เรียงตามลำดับที่คนตัดสินใจอ่าน ไม่ใช่ตามโครงสร้างข้อมูล */
export const CAP_ROWS: { key: keyof Plan["caps"]; label: string; note?: string }[] = [
  { key: "keep", label: "Keep — who returns, and when" },
  { key: "reach", label: "Reach — approve and send for real" },
  { key: "proof", label: "Proof — holdout and confidence interval" },
  { key: "dragDrop", label: "Drag-and-drop import" },
  { key: "onboarding", label: "Setup and column mapping help" },
  { key: "api", label: "Ingest API" },
  { key: "autopilot", label: "Autopilot send" },
];
