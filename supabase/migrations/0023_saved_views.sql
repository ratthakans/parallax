-- ═══════════════════════════════════════════════════════════════
-- 0023 · มุมมองรายการที่บันทึกไว้ (docs/crm-plan.md C5)
--
-- saved_views  ชื่อ + query string ของรายการ (ตัวกรอง · เรียง · มุมมอง) — ไม่มีข้อมูลลูกค้าในแถว
--              list: accounts · deals · pivot · shared = 1 ทุกคนในบัญชีเห็น (ตั้งได้เฉพาะสิทธิ์ fields ที่ชั้นแอป)
--              มุมมองส่วนตัว: เห็นเฉพาะเจ้าของ (owner_id = อีเมลผู้ใช้ เหมือน owner_id อื่นของคอนโซล)
--
-- ต้องตรงกับ ensureSchema() ใน lib/engine/db.ts (npm run verify:schema)
-- ═══════════════════════════════════════════════════════════════

create table if not exists saved_views (
  id text not null primary key,
  tenant_id text not null references tenants (id) on delete cascade,
  list text not null check (list in ('accounts', 'deals', 'pivot')),
  name text not null,
  query text not null,
  shared integer not null default 0 check (shared in (0, 1)),
  owner_id text not null,
  created_at text not null
);
create index if not exists ix_saved_views_list on saved_views (tenant_id, list);
alter table saved_views enable row level security;
create policy tenant_read on saved_views for select using (tenant_id in (select app.user_tenants()));
create policy tenant_write on saved_views for all using (app.can_write(tenant_id)) with check (app.can_write(tenant_id));
grant select, insert, delete on saved_views to authenticated;
