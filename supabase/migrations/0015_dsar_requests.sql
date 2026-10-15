-- ═══════════════════════════════════════════════════════════════
-- 0015 · คำขอสิทธิของเจ้าของข้อมูล (DSAR · docs/plan.md หัวข้อ 7.4 · B6)
--
-- dsar_requests  หนึ่งแถวต่อคำขอ: ชนิด · วันรับ · วันครบกำหนด (30 วัน) · ยืนยันตัวตน · ผล
--                subject_id = รหัสคน ไม่มีชื่อหรือค่าติดต่อ — แถวต้องอยู่ต่อหลังลบคน
--                (หลักฐานว่าทำตามคำขอให้ลบแล้ว) จึงไม่ใช้ชื่อคอลัมน์ customer_id
--                ที่ deleteCustomer ไล่ลบ · ไม่ถูกล้างพร้อมข้อมูลลูกค้า (เหมือน audit_log)
--                ผู้ใช้แก้สถานะได้ แต่ลบแถวไม่ได้
--
-- ต้องตรงกับ ensureSchema() ใน lib/engine/db.ts (npm run verify:schema)
-- ═══════════════════════════════════════════════════════════════

create table if not exists dsar_requests (
  id text not null primary key,
  tenant_id text not null references tenants (id) on delete cascade,
  ref text not null,
  kind text not null,
  subject_id text,
  channel text not null,
  received_at text not null,
  due_at text not null,
  status text not null default 'open',
  owner_id text not null,
  verified_at text,
  verified_by text,
  verification_note text,
  report_at text,
  outcome_note text,
  closed_at text,
  closed_by text,
  created_by text not null,
  created_at text not null
);
create unique index if not exists ux_dsar_requests_ref on dsar_requests (tenant_id, ref);
create index if not exists ix_dsar_requests_open on dsar_requests (tenant_id, status, due_at);
alter table dsar_requests enable row level security;
create policy tenant_read on dsar_requests for select using (tenant_id in (select app.user_tenants()));
create policy tenant_insert on dsar_requests for insert with check (app.can_write(tenant_id));
create policy tenant_update on dsar_requests for update using (app.can_write(tenant_id)) with check (app.can_write(tenant_id));
grant select, insert, update on dsar_requests to authenticated;
revoke delete on dsar_requests from authenticated;
