-- ═══════════════════════════════════════════════════════════════
-- 0024 · หมวดพยากรณ์ · เป้ายอดขาย · ทีม (docs/crm-plan.md C6)
--
-- opportunities.forecast_category  commit · best_case · pipeline · omitted — null = ตามขั้น (ไม่ต้องตั้งทุกดีล)
-- quotas        เป้ายอดขายต่อคนต่อไตรมาส (period = 'YYYY-Qn') — ตั้งได้เฉพาะหัวหน้าทีม/เจ้าของ (ชั้นแอป: สิทธิ์ campaign)
-- teams · team_members · orgs.team_id
--               ทีม/เขตการขาย = มิติสำหรับรายงานและตัวกรอง ไม่ใช่ด่านสิทธิ์ (สิทธิ์ยังเป็นบทบาท + ระดับความลับ)
--
-- ต้องตรงกับ ensureSchema() ใน lib/engine/db.ts (npm run verify:schema)
-- ═══════════════════════════════════════════════════════════════

alter table opportunities add column if not exists forecast_category text
  check (forecast_category is null or forecast_category in ('commit', 'best_case', 'pipeline', 'omitted'));
alter table orgs add column if not exists team_id text;

create table if not exists quotas (
  tenant_id text not null references tenants (id) on delete cascade,
  owner_id text not null,
  period text not null check (period ~ '^\d{4}-Q[1-4]$'),
  amount double precision not null check (amount >= 0),
  set_by text not null,
  set_at text not null,
  primary key (tenant_id, owner_id, period)
);
alter table quotas enable row level security;
create policy tenant_read on quotas for select using (tenant_id in (select app.user_tenants()));
create policy tenant_write on quotas for all using (app.can_write(tenant_id)) with check (app.can_write(tenant_id));
grant select, insert, update, delete on quotas to authenticated;

create table if not exists teams (
  id text not null primary key,
  tenant_id text not null references tenants (id) on delete cascade,
  name text not null,
  created_at text not null
);
create index if not exists ix_teams_tenant on teams (tenant_id);
alter table teams enable row level security;
create policy tenant_read on teams for select using (tenant_id in (select app.user_tenants()));
create policy tenant_write on teams for all using (app.can_write(tenant_id)) with check (app.can_write(tenant_id));
grant select, insert, update, delete on teams to authenticated;

create table if not exists team_members (
  tenant_id text not null references tenants (id) on delete cascade,
  team_id text not null,
  member_id text not null,
  primary key (team_id, member_id)
);
create index if not exists ix_team_members_tenant on team_members (tenant_id, member_id);
alter table team_members enable row level security;
create policy tenant_read on team_members for select using (tenant_id in (select app.user_tenants()));
create policy tenant_write on team_members for all using (app.can_write(tenant_id)) with check (app.can_write(tenant_id));
grant select, insert, update, delete on team_members to authenticated;
