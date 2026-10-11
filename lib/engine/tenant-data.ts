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
  ]) {
    await q.run(`DELETE FROM ${t} WHERE tenant_id = ?`, tenantId);
  }
}
