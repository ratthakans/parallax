/* ── ดีล (โอกาสขาย) · ขั้นและป้าย (docs/ux-plan.md U4) ─────────────────────
   ขั้นเดิมในข้อมูล: open · proposal · won · lost (แคมเปญสร้างดีลตอนส่งข้อเสนอ) — เพิ่ม qualified · negotiation ระหว่างกลาง
   ไม่มีคะแนนความน่าจะเป็น: ขั้นบอกว่าคุยถึงไหน ไม่ใช่การเดาว่าจะได้ */

export const DEAL_STAGES = ["open", "qualified", "proposal", "negotiation", "won", "lost"] as const;
export type DealStage = (typeof DEAL_STAGES)[number];
export const OPEN_STAGES: DealStage[] = ["open", "qualified", "proposal", "negotiation"];
export const DEAL_STAGE_TH: Record<DealStage, string> = {
  open: "เริ่มคุย",
  qualified: "ยืนยันความต้องการ",
  proposal: "เสนอราคา",
  negotiation: "ต่อรอง",
  won: "ปิดได้",
  lost: "ไม่ได้",
};
export const isDealStage = (s: string): s is DealStage => (DEAL_STAGES as readonly string[]).includes(s);
export const stageTh = (s: string) => (isDealStage(s) ? DEAL_STAGE_TH[s] : s);

/* ── บทบาทของคนในดีล (docs/crm-plan.md C1) ── ขาย B2B คือขายให้ "คณะ" — ใครตัดสิน ใครอนุมัติงบ ใครค้าน
   "contact" = ค่าเดิมที่แคมเปญเขียน (ข้อความ "ผู้ติดต่อ") · ค่าที่ไม่รู้จักแสดงตามที่เก็บ */
export const DEAL_ROLES = ["decision_maker", "budget_approver", "champion", "influencer", "user", "blocker", "contact"] as const;
export type DealRole = (typeof DEAL_ROLES)[number];
export const DEAL_ROLE_TH: Record<DealRole, string> = {
  decision_maker: "ผู้ตัดสินใจ",
  budget_approver: "ผู้อนุมัติงบ",
  champion: "ผู้ผลักดันฝั่งลูกค้า",
  influencer: "ผู้มีอิทธิพล",
  user: "ผู้ใช้งาน",
  blocker: "ผู้คัดค้าน",
  contact: "ผู้ติดต่อ",
};
export const isDealRole = (r: string): r is DealRole => (DEAL_ROLES as readonly string[]).includes(r);
export const dealRoleTh = (r: string | null) => (r == null ? "" : isDealRole(r) ? DEAL_ROLE_TH[r] : r);

/* ── หมวดพยากรณ์ (docs/crm-plan.md C6) ── คนขายบอกเองว่าดีลไหน "แน่นอน" — ไม่ตั้ง = ตามขั้น (ไม่มีการเดาของระบบ) */
export const FORECAST_CATEGORIES = ["commit", "best_case", "pipeline", "omitted"] as const;
export type ForecastCategory = (typeof FORECAST_CATEGORIES)[number];
export const FORECAST_TH: Record<ForecastCategory, string> = { commit: "แน่นอน", best_case: "น่าจะได้", pipeline: "มีโอกาส", omitted: "ไม่นับ" };
export const isForecast = (s: string): s is ForecastCategory => (FORECAST_CATEGORIES as readonly string[]).includes(s);
/** หมวดที่ใช้จริง: ตั้งเอง > ตามขั้น (ต่อรอง/เสนอราคา = น่าจะได้ · ก่อนหน้านั้น = มีโอกาส · ปิดแล้ว = ไม่อยู่ในพยากรณ์) */
export function effectiveForecast(stage: string, set: string | null): ForecastCategory | null {
  if (stage === "won" || stage === "lost") return null;
  if (set && isForecast(set)) return set;
  return stage === "proposal" || stage === "negotiation" ? "best_case" : "pipeline";
}

/** ไตรมาส 'YYYY-Qn' ของวันที่ (เวลาไทย) และช่วงวันของมัน */
export const quarterOf = (iso: string) => {
  const d = new Date(Date.parse(iso) + 7 * 3600_000);
  return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
};
export const quarterRange = (period: string): { from: string; to: string } => {
  const [y, q] = [Number(period.slice(0, 4)), Number(period.slice(6))];
  const m = (q - 1) * 3;
  const pad = (n: number) => String(n).padStart(2, "0");
  const end = new Date(Date.UTC(y, m + 3, 0));
  return { from: `${y}-${pad(m + 1)}-01`, to: `${y}-${pad(m + 3)}-${pad(end.getUTCDate())}` };
};
