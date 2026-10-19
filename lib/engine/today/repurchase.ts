import { all } from "@/lib/engine/sql";
import type { Viewer } from "@/lib/engine/accounts";
import { canSee } from "@/lib/shared/accounts";
import type { Classification } from "@/lib/shared/vault";

/* ── ลูกค้าที่ถึงรอบซื้อซ้ำ (docs/crm-plan.md F4) ─────────────────────────────

   หน้าแรกของบัญชีที่มีลูกค้าบุคคล — ข้างงานและดีลที่ครบกำหนด
   รอบของแต่ละคน = ระยะเฉลี่ยระหว่างการซื้อ (สูตรเดียวกับหน้าลูกค้า) · ต้องซื้ออย่างน้อย 2 ครั้ง
   "ถึงรอบ" = เลยรอบปกติแล้ว แต่ยังไม่เกินสองเท่า (เกินกว่านั้นคือหายไปแล้ว — เป็นงานของแคมเปญดึงกลับ ไม่ใช่งานวันนี้)
   ไม่รวม: คนที่ถอน/คัดค้าน/ขอจำกัด · คนที่มีดีลเปิดอยู่แล้ว (มีคนดูแลอยู่) · คนเกินสิทธิ์ของผู้อ่าน */

export type RepurchaseItem = { id: string; name: string; lastAt: string; cycleDays: number; sinceDays: number; orders: number; spent: number };

const MIN_CYCLE_DAYS = 7;
const DAY = 864e5;

export async function repurchaseDue(tenantId: string, viewer: Viewer, now = new Date(), limit = 8): Promise<{ items: RepurchaseItem[]; more: number }> {
  const rows = await all<{ customer_id: string; name: string; classification: string | null; n: number | string; first_at: string; last_at: string; spent: number | string }>(
    `SELECT t.customer_id, c.name, c.classification, COUNT(*) AS n, MIN(t.occurred_at) AS first_at, MAX(t.occurred_at) AS last_at, SUM(t.total) AS spent
     FROM transactions t JOIN customers c ON c.id = t.customer_id AND c.tenant_id = t.tenant_id
     WHERE t.tenant_id = ?
       AND NOT EXISTS (SELECT 1 FROM opportunities p WHERE p.tenant_id = t.tenant_id AND p.org_id IS NULL AND p.customer_id = t.customer_id AND p.stage NOT IN ('won', 'lost'))
       AND COALESCE((SELECT f.kind FROM preferences f WHERE f.tenant_id = t.tenant_id AND f.customer_id = t.customer_id
         ORDER BY f.effective_at DESC, f.recorded_at DESC LIMIT 1), '') NOT IN ('withdrawal', 'objection', 'restriction')
     GROUP BY t.customer_id, c.name, c.classification
     HAVING COUNT(*) >= 2`, tenantId);
  const due: RepurchaseItem[] = [];
  for (const r of rows) {
    if (!canSee(viewer.clearance, (r.classification ?? "confidential") as Classification)) continue;
    const n = Number(r.n);
    const cycle = (Date.parse(r.last_at) - Date.parse(r.first_at)) / DAY / (n - 1);
    const since = (+now - Date.parse(r.last_at)) / DAY;
    if (!(cycle >= MIN_CYCLE_DAYS) || since < cycle || since > cycle * 2) continue;
    due.push({ id: r.customer_id, name: r.name, lastAt: r.last_at, cycleDays: Math.round(cycle), sinceDays: Math.floor(since), orders: n, spent: Number(r.spent) });
  }
  due.sort((a, b) => b.spent - a.spent || a.id.localeCompare(b.id));
  return { items: due.slice(0, limit), more: Math.max(0, due.length - limit) };
}
