-- ═══════════════════════════════════════════════════════════════
-- 0025 · จัดการฐานข้อมูลและงานขาย รอบสอง (docs/crm-plan.md D2–D4 · E2 · E4)
--
-- เพิ่มอย่างเดียว (คอลัมน์และตารางใหม่) — รันก่อนโค้ดขึ้นได้ ไม่กระทบของเดิม
--
-- opportunities.close_reason · close_note   เหตุผลที่ได้/ไม่ได้ (E2)
-- opportunities.renewed_from                  ดีลต่อสัญญาสร้างจากดีลไหน (E4)
-- opportunities/orgs.deleted_at · deleted_by  ถังขยะ 30 วัน (D3) — แถวที่มี deleted_at ไม่ขึ้นที่ใดนอกจากถังขยะ
-- tasks.priority                              high · normal · low (E1)
-- stage_rules                                 ดีลต้องมีอะไรก่อนเข้าขั้นไหน (D4)
-- org_update_batches · org_update_changes     นำเข้าไฟล์ระดับบริษัทเพื่ออัปเดต · ย้อนได้ทั้งชุด (D2)
--
-- ต้องตรงกับ ensureSchema() ใน lib/engine/db.ts (npm run verify:schema)
-- ═══════════════════════════════════════════════════════════════

alter table opportunities add column if not exists close_reason text;
alter table opportunities add column if not exists close_note text;
alter table opportunities add column if not exists renewed_from text;
alter table opportunities add column if not exists deleted_at text;
alter table opportunities add column if not exists deleted_by text;
alter table orgs add column if not exists deleted_at text;
alter table orgs add column if not exists deleted_by text;
alter table tasks add column if not exists priority text not null default 'normal'
  check (priority in ('high', 'normal', 'low'));

create table if not exists stage_rules (
  tenant_id text not null references tenants (id) on delete cascade,
  stage text not null,
  requirement text not null,
  created_by text not null,
  created_at text not null,
  primary key (tenant_id, stage, requirement)
);
alter table stage_rules enable row level security;
create policy tenant_read on stage_rules for select using (tenant_id in (select app.user_tenants()));
create policy tenant_write on stage_rules for all using (app.can_write(tenant_id)) with check (app.can_write(tenant_id));
grant select, insert, delete on stage_rules to authenticated;

create table if not exists org_update_batches (
  id text not null primary key,
  tenant_id text not null references tenants (id) on delete cascade,
  filename text not null,
  sha256 text not null,
  rows integer not null default 0,
  changes integer not null default 0,
  applied_by text not null,
  applied_at text not null,
  undone_by text,
  undone_at text
);
create index if not exists ix_org_update_batches on org_update_batches (tenant_id, applied_at);
alter table org_update_batches enable row level security;
create policy tenant_read on org_update_batches for select using (tenant_id in (select app.user_tenants()));
create policy tenant_write on org_update_batches for all using (app.can_write(tenant_id)) with check (app.can_write(tenant_id));
grant select, insert, update on org_update_batches to authenticated;

create table if not exists org_update_changes (
  id text not null primary key,
  tenant_id text not null references tenants (id) on delete cascade,
  batch_id text not null,
  org_id text not null,
  field text not null,
  old_value text,
  new_value text
);
create index if not exists ix_org_update_changes on org_update_changes (tenant_id, batch_id);
alter table org_update_changes enable row level security;
create policy tenant_read on org_update_changes for select using (tenant_id in (select app.user_tenants()));
create policy tenant_write on org_update_changes for all using (app.can_write(tenant_id)) with check (app.can_write(tenant_id));
grant select, insert, delete on org_update_changes to authenticated;
