import { get } from "@/lib/engine/sql";

/* ── ใครใช้ AI ได้ ──────────────────────────────────────────────

   เจ้าของ 2026-10-13: "ปิด AI บัญชีใหม่ จนกว่าจะเคลียร์ตัง" — docs/plan.md หัวข้อ 9.2 ข้อ 8

   สถานะการชำระอยู่ในตาราง tenant_billing ไม่ใช่คอลัมน์ของ tenants เพราะเจ้าของร้าน
   แก้แถว tenants ของตัวเองได้ (เพดานส่งข้อความ ฯลฯ) — ถ้าสถานะอยู่ที่นั่น เขาจะกด
   "ชำระแล้ว" ให้ตัวเองได้ ตาราง tenant_billing มีแต่นโยบายอ่านสำหรับผู้ใช้
   เขียนได้จากฝั่งระบบเท่านั้น (supabase/migrations/0006_ai_gateway.sql)

   ไม่มีแถว = ไม่อนุญาต (fail closed ตาม Blueprint บท 5) บัญชีเดโมสังเคราะห์มีแถว
   state 'demo' และ is_customer = 0 จึงเปิดได้ เพราะไม่มีข้อมูลของใครจริง */

/** trial = ทดลองใช้ 14 วันของบัญชีสมัครเอง (S9 · 0019) — AI ปิดตลอดช่วงทดลอง */
export type BillingState = "demo" | "trial" | "trial_audit" | "awaiting_payment" | "paid" | "suspended";

export type AiPolicy = { allowed: true } | { allowed: false; reason: string };

/** สวิตช์ปิด AI ทั้งระบบ — งาน CRM หลักทำต่อได้ด้วยสูตรสำเร็จ (Blueprint บท 9) */
export function aiKilled(): boolean {
  return process.env.AI_DISABLED === "1";
}

export async function aiPolicy(tenantId: string): Promise<AiPolicy> {
  if (aiKilled()) return { allowed: false, reason: "ปิด AI ทั้งระบบอยู่ — ใช้สูตรสำเร็จแทน" };
  const row = await get<{ state: BillingState; is_customer: number | boolean }>(
    "SELECT state, is_customer FROM tenant_billing WHERE tenant_id = ?",
    tenantId,
  );
  if (!row) return { allowed: false, reason: "บัญชีนี้ยังไม่มีสถานะการชำระ — AI ปิดอยู่" };
  if (row.state === "paid") return { allowed: true };
  if (!Number(row.is_customer) && row.state === "demo") return { allowed: true };
  if (row.state === "trial") return { allowed: false, reason: "ช่วงทดลองใช้ AI ปิดอยู่ — เปิดได้หลังชำระเงิน ตอนนี้ใช้สูตรสำเร็จแทน" };
  return { allowed: false, reason: "AI เปิดได้หลังบัญชีชำระเงินแล้ว — ตอนนี้ใช้สูตรสำเร็จแทน" };
}
