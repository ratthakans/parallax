/* ── domain types ─────────────────────────────────────────────
   รูปทรงวงจรรายได้สี่แบบตาม blueprint §5 — play ผูกกับรูปทรง
   ไม่ผูกกับอุตสาหกรรม เพราะ engine ทำนายจากวงจร
   ───────────────────────────────────────────────────────────── */

export type CycleShape =
  | "replenishment" // เติมของ
  | "recall" // ถึงรอบ
  | "expiry" // หมดอายุ
  | "considered"; // ตัดสินใจนาน

export const CYCLE_LABEL: Record<CycleShape, string> = {
  replenishment: "Replenish",
  recall: "Recall",
  expiry: "Expiry",
  considered: "Considered",
};

/* คอนโซลพูดไทย เว็บการตลาดพูดอังกฤษ — ชื่อรูปทรงวงจรจึงต้องมีทั้งคู่
   เหมือน Play ที่มี name กับ nameTh */
export const CYCLE_LABEL_TH: Record<CycleShape, string> = {
  replenishment: "ซื้อซ้ำตามรอบ",
  recall: "ถึงกำหนดกลับมา",
  expiry: "มีวันหมดอายุ",
  considered: "ใช้เวลาตัดสินใจ",
};

export type Engine = "keep" | "reach";

export type GroupRole = "anchor" | "attachment" | "consumable";

export type ReachableBy = "line" | "email" | "paid_only" | "none";

export type DiscountAffinity = "full_price" | "mixed" | "discount_seeker";

/* ── selector — data, not code ───────────────────────────────
   ทุก predicate ต้องประเมินได้แบบ deterministic บน customer_features
   ห้ามมี LLM ในขั้นนี้ (Play Engine §5 · §8)
   ───────────────────────────────────────────────────────────── */

export type Selector = {
  /** เปอร์เซ็นไทล์มูลค่าขั้นต่ำ 0–100 */
  monetary_percentile_min?: number;
  /** เดไซล์ LTV ขั้นต่ำ 1–10 */
  ltv_decile_min?: number;
  /** churn_risk = recency ÷ personal_cycle */
  churn_risk_min?: number;
  churn_risk_max?: number;
  /** เงียบเกินกี่เท่าของวงจรตัวเอง */
  cycle_multiple_min?: number;
  /** ซื้อของกลุ่มนี้แล้ว */
  bought_group?: GroupRole;
  /** ยังไม่ซื้อของกลุ่มนี้ */
  not_bought_group?: GroupRole;
  /** ช่วงวันนับจากการซื้อ anchor ล่าสุด */
  days_since_anchor?: [number, number];
  /** ใช้บริการแล้ว (events type=booking) แต่ยังไม่ซื้อสินค้า */
  used_service_no_product?: boolean;
  /** สมัครแล้วไม่ซื้อภายในกี่วัน */
  signed_up_days?: [number, number];
  no_purchase_ever?: boolean;
  /** มาเยี่ยมกี่ครั้งขึ้นไปโดยไม่ซื้อตามสัดส่วน */
  visit_to_purchase_ratio_min?: number;
  /** ขาดอีกเท่าไรถึงเลื่อนระดับ (บาท) */
  tier_gap_max?: number;
  /** วันที่คาดว่าจะซื้อครั้งถัดไป อยู่ในอีกกี่วัน */
  predicted_next_within_days?: number;
  /** สมาชิกหรือคอร์สหมดอายุในอีกกี่วัน */
  expiry_within_days?: number;
  /** ถึงรอบบริการในอีกกี่วัน */
  recall_within_days?: number;
  /** วันเกิดหรือวันครบรอบในอีกกี่วัน */
  lifecycle_within_days?: number;
  /** มีความชอบหมวดที่มีของเข้าใหม่ */
  affinity_new_arrival?: boolean;
  /** ตรงกับหมวดของค้างสต็อก */
  dead_stock_match?: boolean;
  /** ยังไม่เคยแนะนำใคร */
  never_referred?: boolean;
  discount_affinity?: DiscountAffinity[];
  price_tier_min?: number;
  frequency_90d_min?: number;
  /** ซื้อมาแล้วอย่างน้อยสองครั้ง */
  repeat_buyer?: boolean;
  /** ซื้อครั้งเดียวแล้วหาย */
  one_and_done?: boolean;
  /** เริ่มต้นความสัมพันธ์จากสินค้ากลุ่ม anchor */
  anchor_starter?: boolean;
  /** ยังไม่เคยซื้อในหมวดข้างเคียง */
  no_adjacent_category?: boolean;
  /** กรอกฟอร์มแล้วไม่ซื้อ ภายในช่วงวันนี้ */
  lapsed_lead_days?: [number, number];
  reachable_by?: ReachableBy[];
  /** ต้องมีความยินยอมด้านการตลาด — ฝั่ง Keep บังคับเสมอ */
  consent_marketing?: boolean;
};

export type Guards = {
  min_audience: number;
  cooldown_days: number;
  max_discount_pct: number;
};

export type Play = {
  id: string;
  engine: Engine;
  /** ชื่อที่เจ้าของธุรกิจอ่าน — ไม่ใช่ชื่อทางเทคนิค */
  name: string;
  /** ชื่อภาษาไทย — คอนโซลใช้ตัวนี้ หน้าขายใช้ name */
  nameTh: string;
  logic: string;
  crossIndustry: string;
  cycle_shape: CycleShape[];
  selector: Selector;
  guards: Guards;
  offer: { type: string; fallback?: string };
  /* angle เป็นบรีฟที่ส่งให้โมเดล · angleTh คือประโยคที่ลูกค้าอ่านจริง
     ถ้ามีแค่ angle ข้อความที่ออกไปทาง LINE จะเป็นภาษาอังกฤษทั้งฉบับ */
  copy_brief: { angle: string; angleTh: string; avoid: string[] };
  channel: string;
  measurement: "auto";
  priors: { response_rate: number };
  /** มูลค่าเฉลี่ยต่อการตอบสนองหนึ่งครั้ง ใช้ในสูตรจัดอันดับ */
  expected_order_value: number;
};

/* ── computed feature row ─────────────────────────────────────
   คำนวณล่วงหน้า ห้ามคำนวณสดตอนเปิดหน้า (Play Engine §5)
   ───────────────────────────────────────────────────────────── */

export type CustomerFeature = {
  customer_id: string;
  name: string;
  recency_days: number;
  frequency_90d: number;
  frequency_total: number;
  monetary_ltv: number;
  avg_order_value: number;
  personal_cycle_days: number;
  /** true เมื่อซื้อครั้งเดียว จึง fallback เป็นมัธยฐานของวงจรนั้น */
  cycle_is_estimated: boolean;
  cycle_variance: number;
  churn_risk: number;
  price_tier: number;
  discount_affinity: DiscountAffinity;
  discount_share: number;
  predicted_next_date: string;
  reachable_by: ReachableBy;
  monetary_percentile: number;
  ltv_decile: number;
  bought_groups: GroupRole[];
  last_anchor_days: number | null;
  used_service: boolean;
  visits: number;
  signup_days: number;
  expiry_in_days: number | null;
  recall_in_days: number | null;
  lifecycle_in_days: number | null;
  affinity_categories: string[];
  never_referred: boolean;
  lapsed_lead_days: number | null;
  consent_marketing: boolean;
  tier_gap: number;
};

export type Verdict = "positive" | "no_effect" | "insufficient_data";

export type MeasurementMode =
  | "per_campaign_holdout"
  | "pooled_90d_holdout"
  | "time_shifted";

export type Candidate = {
  play: Play;
  audience: string[];
  /* ── คนที่ถูกกรองออกและเหตุผล — ต้องอธิบายได้ทุกครั้ง (D7) ──

     สองภาษาโดยตั้งใจ ไม่ใช่ความซ้ำซ้อน:

       reason    คีย์ที่เครื่องอ่าน — ชุดตรวจ verify กับ verify2 ยืนยัน
                 พฤติกรรมของเบรกด้วยการหาข้อความนี้ และ prompt ที่ส่งให้
                 โมเดลก็ใช้ตัวนี้ ถ้าแปลทิ้งไป ทั้งสองอย่างพังพร้อมกัน
       reasonTh  ประโยคที่คนอ่าน — คอนโซลแสดงตัวนี้เท่านั้น

     เหมือน Play ที่มีทั้ง name และ nameTh ด้วยเหตุผลเดียวกัน */
  filtered: { reason: string; reasonTh: string; count: number }[];
  score: number;
  expected_response_rate: number;
  expected_order_value: number;
  estimated_cost: number;
  expected_value: number;
  measurement: MeasurementMode;
  holdout_pct: number;
  blocked?: string;
};
