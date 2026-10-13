import { all } from "@/lib/engine/sql";
import { openRecord } from "@/lib/engine/pii";

/* ── หลักฐานจากแถวต้นทาง สำหรับโมดูลอื่น (docs/plan.md B4 · boundaries ข้อ 4.8) ─────

   แถวดิบเปิดได้เฉพาะในโมดูล vault — ที่นี่ถอดรหัสแล้วส่งออกไปเฉพาะสิ่งที่ใช้เป็นหลักฐานของบริษัท:
   ชื่อบริษัทตามที่เขียน · ตำแหน่ง · โดเมนอีเมล (ไม่ใช่ทั้งอีเมล) · ไฟล์และบรรทัด
   ไม่มีชื่อคน อีเมล หรือเบอร์ออกจากฟังก์ชันนี้ */

export type RowFacts = {
  batchId: string; file: string; line: number; source: string | null; recordedAt: string;
  customerId: string; company: string; title: string; domain: string | null;
};

export async function rowFactsFor(tenantId: string, personIds: string[]): Promise<RowFacts[]> {
  const out: RowFacts[] = [];
  for (let i = 0; i < personIds.length; i += 400) {
    const chunk = personIds.slice(i, i + 400);
    if (!chunk.length) continue;
    const raw = await all<{ batch_id: string; line: number | string; customer_id: string; payload_enc: string; filename: string; recorded_at: string; source: string | null }>(
      `SELECT r.batch_id, r.line, r.customer_id, r.payload_enc, b.filename, r.recorded_at, s.name AS source
       FROM import_rows r JOIN import_batches b ON b.id = r.batch_id AND b.tenant_id = r.tenant_id
       LEFT JOIN sources s ON s.id = b.source_id AND s.tenant_id = b.tenant_id
       WHERE r.tenant_id = ? AND r.payload_enc IS NOT NULL AND r.customer_id IN (${chunk.map(() => "?").join(",")})
       ORDER BY b.uploaded_at, r.line`, tenantId, ...chunk);
    for (const r of raw) {
      const v = JSON.parse(openRecord(tenantId, "import_row", r.payload_enc)) as Record<string, string | undefined>;
      out.push({
        batchId: r.batch_id, file: r.filename, line: Number(r.line), source: r.source, recordedAt: r.recorded_at,
        customerId: r.customer_id, company: v.company ?? "", title: v.job_title ?? "",
        domain: v.email?.split("@")[1]?.trim().toLowerCase() || null,
      });
    }
  }
  return out;
}
