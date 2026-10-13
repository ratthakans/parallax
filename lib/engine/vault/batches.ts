import { all, get } from "@/lib/engine/sql";
import { IMPORT_ROW_STATUSES, type ImportRowStatus } from "@/lib/shared/vault";

/* ── รายงานผลการนำเข้ารายชุด (Blueprint บท 4 ขั้น 5) ──────────────────

   "แยกรายการสำเร็จ ถูกปฏิเสธ รอตรวจ และถูกพักใช้ พร้อมรายงานตรวจยอด"
   ตรวจยอด = จำนวนแถวที่ไฟล์บอก ต้องเท่ากับผลรวมทุกสถานะที่บันทึกจริง — ถ้าไม่เท่า แปลว่ามีแถวหาย
   รายงานไม่แสดงค่าในแถว (ชื่อ อีเมล เบอร์) — แสดงบรรทัด สถานะ และเหตุผลเท่านั้น */

export type BatchSummary = {
  id: string; sourceId: string; sourceName: string | null; filename: string; bytes: number;
  rowsTotal: number; status: string; uploadedBy: string; uploadedAt: string;
};

export type BatchReport = BatchSummary & {
  counts: Record<ImportRowStatus, number>;
  recorded: number;
  balanced: boolean;
  reasons: { status: ImportRowStatus; reason: string; n: number; lines: number[] }[];
};

type Row = {
  id: string; source_id: string; source_name: string | null; filename: string; bytes: number | string;
  rows_total: number | string; status: string; uploaded_by: string; uploaded_at: string;
};
const toSummary = (r: Row): BatchSummary => ({
  id: r.id, sourceId: r.source_id, sourceName: r.source_name, filename: r.filename, bytes: Number(r.bytes),
  rowsTotal: Number(r.rows_total), status: r.status, uploadedBy: r.uploaded_by, uploadedAt: r.uploaded_at,
});
const BATCH_SQL = `SELECT b.id, b.source_id, s.name AS source_name, b.filename, b.bytes, b.rows_total, b.status,
    b.uploaded_by, b.uploaded_at
  FROM import_batches b LEFT JOIN sources s ON s.id = b.source_id AND s.tenant_id = b.tenant_id
  WHERE b.tenant_id = ?`;

export async function listBatches(tenantId: string, sourceId?: string): Promise<BatchSummary[]> {
  const rows = sourceId
    ? await all<Row>(`${BATCH_SQL} AND b.source_id = ? ORDER BY b.uploaded_at DESC`, tenantId, sourceId)
    : await all<Row>(`${BATCH_SQL} ORDER BY b.uploaded_at DESC LIMIT 50`, tenantId);
  return rows.map(toSummary);
}

export async function getBatchReport(tenantId: string, batchId: string): Promise<BatchReport | null> {
  const b = await get<Row>(`${BATCH_SQL} AND b.id = ?`, tenantId, batchId);
  if (!b) return null;
  const byStatus = await all<{ status: ImportRowStatus; n: number | string }>(
    "SELECT status, COUNT(*) AS n FROM import_rows WHERE tenant_id = ? AND batch_id = ? GROUP BY status",
    tenantId, batchId,
  );
  const counts = Object.fromEntries(IMPORT_ROW_STATUSES.map((s) => [s, 0])) as Record<ImportRowStatus, number>;
  for (const r of byStatus) counts[r.status] = Number(r.n);
  const recorded = Object.values(counts).reduce((a, n) => a + n, 0);

  const reasonRows = await all<{ status: ImportRowStatus; reason: string; line: number | string }>(
    `SELECT status, reason, line FROM import_rows
     WHERE tenant_id = ? AND batch_id = ? AND reason IS NOT NULL ORDER BY line`,
    tenantId, batchId,
  );
  const grouped = new Map<string, { status: ImportRowStatus; reason: string; n: number; lines: number[] }>();
  for (const r of reasonRows) {
    const k = `${r.status}|${r.reason}`;
    const g = grouped.get(k) ?? { status: r.status, reason: r.reason, n: 0, lines: [] };
    g.n++;
    if (g.lines.length < 12) g.lines.push(Number(r.line));
    grouped.set(k, g);
  }
  const summary = toSummary(b);
  return {
    ...summary, counts, recorded, balanced: recorded === summary.rowsTotal,
    reasons: [...grouped.values()].sort((x, y) => y.n - x.n),
  };
}
