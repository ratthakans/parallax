-- ═══════════════════════════════════════════════════════════════
-- 0010 · Campaign Workspace + บริการนโยบาย (docs/plan.md B5 · AXIS Blueprint 2.0 บท 5)
--
-- sales_campaigns   แคมเปญขาย B2B — วัตถุประสงค์ ช่องทาง ชนิดข้อความ และเกณฑ์เป้าหมายแบบอ่านได้
-- campaign_targets  รายชื่อเป้าหมาย พร้อมเหตุผลที่ถูกเลือก ผลตัดสินนโยบาย และรุ่นนโยบาย
-- work_log          กิจกรรมที่มีผล (ไม่นับทีม PARALLAX) — เพิ่มอย่างเดียว
-- tasks/opportunities.campaign_id  งานและโอกาสผูกกับแคมเปญ
--
-- สร้างจาก scripts/gen-schema-0010.py — ต้องตรงกับ ensureSchema() (npm run verify:schema)
-- ═══════════════════════════════════════════════════════════════

-- แคมเปญขาย B2B (เช่น ขายสปอนเซอร์) — วัตถุประสงค์ · ช่องทาง · ชนิดข้อความ · เกณฑ์เป้าหมายแบบอ่านได้
create table if not exists sales_campaigns (
  id text not null primary key,
  tenant_id text not null references tenants (id) on delete cascade,
  name text not null,
  offer text,
  purpose_id text not null,
  channel text not null default 'email',
  message_kind text not null default 'marketing',
  disclosure_purpose_id text,
  criteria text not null default '{}',
  status text not null default 'draft',
  owner_id text,
  starts_at text,
  ends_at text,
  created_by text not null,
  created_at text not null,
  updated_at text not null
);
create index if not exists ix_sales_campaigns_tenant on sales_campaigns (tenant_id, status);
alter table sales_campaigns enable row level security;
create policy tenant_read on sales_campaigns for select using (tenant_id in (select app.user_tenants()));
create policy tenant_write on sales_campaigns for all using (app.can_write(tenant_id)) with check (app.can_write(tenant_id));
grant select, insert, update, delete on sales_campaigns to authenticated;

-- รายชื่อเป้าหมายของแคมเปญ — เหตุผลที่ถูกเลือก · ผลตัดสินนโยบายพร้อมรุ่น · ผู้รับผิดชอบ · ผล
create table if not exists campaign_targets (
  id text not null primary key,
  tenant_id text not null references tenants (id) on delete cascade,
  campaign_id text not null,
  org_id text,
  customer_id text not null,
  reasons text not null default '[]',
  eligibility text not null default 'review_required',
  eligibility_reasons text not null default '[]',
  policy_version text not null,
  checked_at text not null,
  assigned_to text,
  status text not null default 'open',
  outcome text,
  created_at text not null,
  updated_at text not null
);
create unique index if not exists ux_target_person on campaign_targets (tenant_id, campaign_id, customer_id);
create index if not exists ix_target_person on campaign_targets (tenant_id, customer_id);
create index if not exists ix_target_assignee on campaign_targets (tenant_id, assigned_to, status);
alter table campaign_targets enable row level security;
create policy tenant_read on campaign_targets for select using (tenant_id in (select app.user_tenants()));
create policy tenant_write on campaign_targets for all using (app.can_write(tenant_id)) with check (app.can_write(tenant_id));
grant select, insert, update, delete on campaign_targets to authenticated;

-- กิจกรรมที่มีผล (มอบหมาย · บันทึกผล · ทบทวน) — วัดการใช้งานจริง แยกจาก login · ธง is_staff ไม่นับ · เพิ่มอย่างเดียว
create table if not exists work_log (
  id bigint generated always as identity primary key,
  tenant_id text not null references tenants (id) on delete cascade,
  actor text not null,
  is_staff integer not null default 0,
  kind text not null,
  campaign_id text,
  target_id text,
  at text not null
);
create index if not exists ix_work_log_tenant on work_log (tenant_id, at);
alter table work_log enable row level security;
create policy tenant_read on work_log for select using (tenant_id in (select app.user_tenants()));
create policy tenant_append on work_log for insert with check (app.can_write(tenant_id));
grant select, insert on work_log to authenticated;
revoke update, delete on work_log from authenticated;

alter table tasks add column if not exists campaign_id text;
alter table tasks add column if not exists target_id text;
alter table opportunities add column if not exists campaign_id text;
