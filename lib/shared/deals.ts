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
