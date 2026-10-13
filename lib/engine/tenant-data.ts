import type { Sql } from "@/lib/engine/sql";

/* ── ล้างข้อมูลลูกค้าของบัญชีเดียว ──────────────────────────────

   เดิมมีโค้ดลบสองชุด ชุดหนึ่งใน commitImport (ตอนติ๊ก "แทนที่ข้อมูลเดิม")
   อีกชุดใน wipeTenant ของ seed.ts ทุกครั้งที่เพิ่มตาราง ต้องจำแก้ทั้งสองที่
   และสองชุดนั้นลบไม่เท่ากันอยู่แล้วโดยไม่มีใครตั้งใจ

   ตอนนี้มีที่เดียว และขอบเขตชัด: ลบ "ข้อมูลลูกค้า" ทั้งหมด แต่ไม่ลบ
     activity_log      ประวัติว่าใครทำอะไร — การล้างบัญชีเองก็ต้องถูกบันทึกไว้
     credit_purchases  ประวัติการจ่ายเงิน
     tenant_plays      การตั้งค่าของร้าน

   ลำดับคือลูกก่อนแม่ เพราะ Postgres บังคับ foreign key ทันที
   ตารางที่ไม่มี tenant_id เข้าถึงผ่าน campaigns หรือ customers ของบัญชีนี้เท่านั้น */
export async function wipeCustomerData(q: Sql, tenantId: string): Promise<void> {
  for (const t of ["campaign_audience", "messages", "attributions"]) {
    await q.run(
      `DELETE FROM ${t} WHERE campaign_id IN (SELECT id FROM campaigns WHERE tenant_id = ?)`,
      tenantId,
    );
  }
  await q.run(
    `DELETE FROM line_items WHERE txn_id IN (
       SELECT tx.id FROM transactions tx
       JOIN customers c ON c.id = tx.customer_id
       WHERE c.tenant_id = ?)`,
    tenantId,
  );
  for (const t of ["events", "consents", "memberships", "transactions"]) {
    await q.run(
      `DELETE FROM ${t} WHERE customer_id IN (SELECT id FROM customers WHERE tenant_id = ?)`,
      tenantId,
    );
  }
  for (const t of [
    "campaigns", "customer_features", "contact_points", "contact_profiles",
    "customers", "products",
    // โครงข้อมูล B2B (0007) — ข้อมูลของคนและองค์กร ไม่ใช่การตั้งค่าของบัญชี
    ...B2B_DATA_TABLES,
  ]) {
    await q.run(`DELETE FROM ${t} WHERE tenant_id = ?`, tenantId);
  }
}

/* ── ตารางข้อมูล B2B ที่ล้างพร้อมข้อมูลลูกค้า ──
   ไม่รวม: sources · purposes · processing_records · retention_rules (การตั้งค่าและนโยบายของบัญชี)
   และ audit_log (บันทึกตรวจสอบต้องอยู่ต่อ — การล้างบัญชีเองก็ถูกบันทึกไว้) */
export const B2B_DATA_TABLES = [
  "import_rows", "import_batches", "affiliations", "relationship_assertions", "interactions",
  "participations", "opportunity_people", "tasks", "opportunities", "org_domains", "orgs",
  "preferences", "evidence", "record_versions", "merge_log",
  "review_items", "resolution_overrides", "sample_checks",
] as const;

/* ── ทุกที่ที่ข้อมูลของคนหนึ่งคนอยู่ ─────────────────────────────

   เดิม deleteCustomer มีรายชื่อตารางเขียนไว้ในตัว และชุดตรวจก็มีรายชื่อของตัวเอง
   สองรายการที่ต้องจำแก้คู่กัน คือรายการที่จะหลุดสักวัน — ตอนนี้มีที่เดียว
   และชุดตรวจ verify:customers ไล่หาทุกตารางที่มีคอลัมน์ customer_id เองด้วย
   ตารางที่เพิ่มใหม่แล้วลืมใส่ที่นี่จะทำให้ชุดตรวจไม่ผ่าน */
export const PERSON_LINKED: { table: string; column: string; where?: string }[] = [
  { table: "transactions", column: "customer_id" },
  { table: "events", column: "customer_id" },
  { table: "consents", column: "customer_id" },
  { table: "memberships", column: "customer_id" },
  { table: "contact_points", column: "customer_id" },
  { table: "contact_profiles", column: "customer_id" },
  { table: "customer_features", column: "customer_id" },
  { table: "campaign_audience", column: "customer_id" },
  { table: "messages", column: "customer_id" },
  { table: "affiliations", column: "customer_id" },
  { table: "participations", column: "customer_id" },
  { table: "interactions", column: "customer_id" },
  { table: "opportunity_people", column: "customer_id" },
  { table: "tasks", column: "customer_id" },
  { table: "preferences", column: "customer_id" },
  { table: "import_rows", column: "customer_id" },
  { table: "relationship_assertions", column: "from_id", where: "from_kind = 'person'" },
  { table: "relationship_assertions", column: "to_id", where: "to_kind = 'person'" },
  { table: "record_versions", column: "record_id", where: "record_kind = 'person'" },
  { table: "merge_log", column: "survivor_id" },
  { table: "merge_log", column: "merged_id" },
  { table: "sample_checks", column: "customer_id" },
  { table: "resolution_overrides", column: "a_id", where: "kind = 'person'" },
  { table: "resolution_overrides", column: "b_id", where: "kind = 'person'" },
];

/** ลบข้อมูลของคนหนึ่งคนจากทุกตารางที่ผูกอยู่ (ยกเว้นตัวแถว customers ซึ่งผู้เรียกลบเอง) */
export async function deletePersonData(q: Sql, tenantId: string, customerId: string): Promise<void> {
  /* คนที่เคยถูกรวมเข้ามา: preferences ของเขายังอยู่ใต้รหัสเดิม (ตารางเพิ่มอย่างเดียว ไม่ถูกย้าย) — ลบตามไปด้วย */
  const ids = [customerId];
  for (let i = 0; i < ids.length; i++) {
    for (const r of await q.all<{ merged_id: string }>(
      "SELECT merged_id FROM merge_log WHERE tenant_id = ? AND survivor_id = ? AND undone_at IS NULL", tenantId, ids[i],
    )) if (!ids.includes(r.merged_id)) ids.push(r.merged_id);
  }
  for (const id of ids.slice(1)) await deleteOneId(q, tenantId, id);
  await deleteOneId(q, tenantId, customerId);
}

async function deleteOneId(q: Sql, tenantId: string, customerId: string): Promise<void> {
  await q.run(
    "DELETE FROM line_items WHERE tenant_id = ? AND txn_id IN (SELECT id FROM transactions WHERE tenant_id = ? AND customer_id = ?)",
    tenantId, tenantId, customerId,
  );
  for (const l of PERSON_LINKED) {
    await q.run(
      `DELETE FROM ${l.table} WHERE tenant_id = ? AND ${l.column} = ?${l.where ? ` AND ${l.where}` : ""}`,
      tenantId, customerId,
    );
  }
  /* คิวตรวจเก็บรหัสคนเป็น JSON array — ลบรายการที่มีคนนี้อยู่ด้วย */
  await q.run(
    "DELETE FROM review_items WHERE tenant_id = ? AND kind = 'person_pair' AND subject_ids LIKE ?",
    tenantId, `%"${customerId}"%`,
  );
}
