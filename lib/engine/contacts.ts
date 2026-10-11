import { all, get } from "@/lib/engine/sql";
import { logActivity } from "@/lib/engine/db";
import {
  CONTACT_KINDS,
  decryptContact,
  matchKey,
  normaliseContact,
  type ContactKind,
} from "@/lib/engine/pii";

/* ── อ่านข้อมูลติดต่อ ────────────────────────────────────────────

   สองระดับโดยตั้งใจ:

     listContactPoints   ค่าที่ปิดบางส่วน (081-xxx-5678) — ใช้แสดงบนหน้าจอ
                         ทุกที่ ไม่ถอดรหัสอะไรเลย
     revealContactPoint  ค่าเต็ม — ถอดรหัสทีละค่า และบันทึกทุกครั้งว่าใคร
                         เปิดดูอะไรของใคร

   การเปิดดูเบอร์ของลูกค้าหนึ่งแสนคนต้องเป็นการกระทำที่มีร่องรอย ไม่ใช่
   ผลข้างเคียงของการเปิดหน้ารายชื่อ — หน้ารายชื่อจึงไม่มีทางได้ค่าเต็มไป
   ───────────────────────────────────────────────────────────── */

export type ContactPoint = {
  id: string;
  kind: ContactKind;
  label: string | null;
  masked: string;
  isPrimary: boolean;
  source: string;
};

export async function listContactPoints(
  tenantId: string,
  customerId: string,
): Promise<ContactPoint[]> {
  const rows = await all<{
    id: string; kind: ContactKind; label: string | null; value_masked: string;
    is_primary: number; source: string;
  }>(
    `SELECT id, kind, label, value_masked, is_primary, source
     FROM contact_points WHERE tenant_id = ? AND customer_id = ?
     ORDER BY kind, is_primary DESC, created_at`,
    tenantId,
    customerId,
  );
  return rows.map((r) => ({
    id: r.id, kind: r.kind, label: r.label, masked: r.value_masked,
    isPrimary: r.is_primary === 1, source: r.source,
  }));
}

export async function revealContactPoint(
  tenantId: string,
  pointId: string,
  actor: string,
): Promise<string | null> {
  const row = await get<{ customer_id: string; kind: ContactKind; value_enc: string }>(
    "SELECT customer_id, kind, value_enc FROM contact_points WHERE tenant_id = ? AND id = ?",
    tenantId,
    pointId,
  );
  if (!row) return null;
  const value = decryptContact(tenantId, row.kind, row.value_enc);
  // บันทึกชนิดและลูกค้า ไม่บันทึกค่า — log ที่มีเบอร์อยู่ข้างในคือการรั่วอีกทางหนึ่ง
  await logActivity(tenantId, actor, "reveal_contact", `${row.kind} · ${row.customer_id}`);
  return value;
}

/* ── หาลูกค้าจากเบอร์ อีเมล หรือ LINE ──
   ใช้ index (tenant_id, kind, value_hmac) — ไม่ต้องถอดรหัสใครเลย
   และพิมพ์ "081-234-5678" หรือ "+66812345678" ก็เจอคนเดียวกัน */
export async function findCustomersByContact(
  tenantId: string,
  kind: ContactKind,
  raw: string,
): Promise<string[]> {
  if (!CONTACT_KINDS.includes(kind)) return [];
  const value = normaliseContact(kind, raw);
  if (!value) return [];
  const rows = await all<{ customer_id: string }>(
    `SELECT DISTINCT customer_id FROM contact_points
     WHERE tenant_id = ? AND kind = ? AND value_hmac = ?`,
    tenantId,
    kind,
    matchKey(tenantId, kind, value),
  );
  return rows.map((r) => r.customer_id);
}
