import { run } from "@/lib/engine/sql";

/* ── บันทึกทุกการเรียก AI ───────────────────────────────────────

   Blueprint บท 9: บันทึกผู้ให้บริการ รุ่นโมเดล และหลักฐานที่ใช้ · บท 14: จับต้นทุน AI ต่อบัญชี
   เก็บชนิดงานกับจำนวนโทเค็น ไม่เก็บ prompt หรือคำตอบ — log ต้องไม่มีข้อมูลส่วนบุคคลเกินจำเป็น
   ผู้ใช้เพิ่มแถวได้ แต่แก้หรือลบไม่ได้ (ไม่มีนโยบาย update/delete บน Postgres) */

export type AiOutcome = "ai" | "refused" | "error" | "invalid" | "policy_blocked";

export async function recordAiCall(entry: {
  tenantId: string;
  kind: string;
  model: string;
  servedModel?: string | null;
  outcome: AiOutcome;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
}): Promise<void> {
  try {
    await run(
      `INSERT INTO ai_ledger (tenant_id, at, provider, kind, model, served_model, outcome,
         input_tokens, output_tokens, cache_read_tokens)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      entry.tenantId,
      new Date().toISOString(),
      "anthropic",
      entry.kind,
      entry.model,
      entry.servedModel ?? null,
      entry.outcome,
      entry.inputTokens ?? 0,
      entry.outputTokens ?? 0,
      entry.cacheReadTokens ?? 0,
    );
  } catch (err) {
    /* บันทึกพังต้องไม่ทำให้งานของผู้ใช้พัง — แต่ต้องเห็นใน log ของเซิร์ฟเวอร์ */
    console.error("[ai-ledger]", entry.kind, err);
  }
}
