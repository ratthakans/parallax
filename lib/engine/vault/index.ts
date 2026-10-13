import { all, get } from "@/lib/engine/sql";

/* ── Data Vault · ตัวเลขภาพรวมที่นับได้จริง ─────────────────────

   Blueprint 2.0 บท 4: รายงานคุณภาพต้อง "แยกตัวเลขจริงออกจากประมาณการ"
   หน้านี้จึงนับจากตารางตรง ๆ เท่านั้น — ไม่มีคะแนนรวม ไม่มีการเดา
   ส่วนที่ยังไม่เก็บ (เช่น ซ้ำที่รอตรวจ · ข้อมูลเก่า) ยังไม่แสดง จนกว่าตาราง
   ของระยะ B จะมี ดีกว่าแสดงเลขที่คิดขึ้นมาให้หน้าดูครบ */

export type VaultOverview = {
  people: number;
  withContact: number;
  byKind: Record<string, number>;
  consentGranted: number;
  imports: number;
  lastImportAt: string | null;
  /** Data Vault (B2): แหล่งที่ลงทะเบียน · แถวต้นทางที่รับเข้า · รอตรวจ · ถูกปฏิเสธ */
  sources: number;
  sourceRows: number;
  pendingReview: number;
  rejected: number;
};

type N = { n: number | string | null };
const num = (r?: N | null) => Number(r?.n ?? 0);

export async function vaultOverview(tenantId: string): Promise<VaultOverview> {
  const [people, withContact, kinds, consent, imp, sources, rowStatus] = await Promise.all([
    get<N>("SELECT COUNT(*) AS n FROM customers WHERE tenant_id = ?", tenantId),
    get<N>("SELECT COUNT(DISTINCT customer_id) AS n FROM contact_points WHERE tenant_id = ?", tenantId),
    all<{ kind: string; n: number | string }>(
      `SELECT kind, COUNT(DISTINCT customer_id) AS n FROM contact_points
       WHERE tenant_id = ? GROUP BY kind`,
      tenantId,
    ),
    get<N>(
      `SELECT COUNT(*) AS n FROM consents WHERE tenant_id = ? AND purpose = 'marketing'
       AND granted_at IS NOT NULL AND revoked_at IS NULL`,
      tenantId,
    ),
    get<N & { at: string | null }>(
      "SELECT COUNT(*) AS n, MAX(at) AS at FROM activity_log WHERE tenant_id = ? AND action IN ('import_csv', 'import_batch')",
      tenantId,
    ),
    get<N>("SELECT COUNT(*) AS n FROM sources WHERE tenant_id = ?", tenantId),
    all<{ status: string; n: number | string }>(
      "SELECT status, COUNT(*) AS n FROM import_rows WHERE tenant_id = ? GROUP BY status",
      tenantId,
    ),
  ]);
  const statusN = (s: string) => Number(rowStatus.find((r) => r.status === s)?.n ?? 0);
  return {
    people: num(people),
    withContact: num(withContact),
    byKind: Object.fromEntries(kinds.map((k) => [k.kind, Number(k.n)])),
    consentGranted: num(consent),
    imports: num(imp),
    lastImportAt: imp?.at ?? null,
    sources: num(sources),
    sourceRows: rowStatus.reduce((a, r) => a + Number(r.n), 0),
    pendingReview: statusN("pending_review"),
    rejected: statusN("rejected"),
  };
}
