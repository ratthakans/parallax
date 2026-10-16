-- ═══════════════════════════════════════════════════════════════
-- 0016 · ส่งออกแบบขออนุมัติ (docs/plan.md B6 · docs/solo-plan.md หัวข้อ 6.1)
--
-- export_requests  ขอ → อนุมัติ → ดาวน์โหลดได้ครั้งเดียว ภายในเวลาที่กำหนด
--                  เจ้าของอีกคนอนุมัติ = ดาวน์โหลดได้ทันที · บัญชีที่มีเจ้าของคนเดียว
--                  อนุมัติตัวเองได้ แต่ต้องรอ 1 ชั่วโมง (ยกเลิกได้ระหว่างรอ)
--                  scope = ตัวกรองของหน้ารายชื่อ (อาจมีคำค้น) · ไม่มีค่าใดในไฟล์
--                  ผู้ใช้แก้สถานะได้ แต่ลบแถวไม่ได้
--
-- ต้องตรงกับ ensureSchema() ใน lib/engine/db.ts (npm run verify:schema)
-- ═══════════════════════════════════════════════════════════════

create table if not exists export_requests (
  id text not null primary key,
  tenant_id text not null references tenants (id) on delete cascade,
  scope text not null,
  reason text not null,
  status text not null default 'pending',
  requested_by text not null,
  requested_at text not null,
  approved_by text,
  approved_at text,
  ready_at text,
  expires_at text,
  downloaded_at text,
  row_count integer,
  cancelled_by text,
  cancelled_at text
);
create index if not exists ix_export_requests_tenant on export_requests (tenant_id, requested_at);
alter table export_requests enable row level security;
create policy tenant_read on export_requests for select using (tenant_id in (select app.user_tenants()));
create policy tenant_insert on export_requests for insert with check (app.can_write(tenant_id));
create policy tenant_update on export_requests for update using (app.can_write(tenant_id)) with check (app.can_write(tenant_id));
grant select, insert, update on export_requests to authenticated;
revoke delete on export_requests from authenticated;
