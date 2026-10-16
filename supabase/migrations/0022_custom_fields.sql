-- ═══════════════════════════════════════════════════════════════
-- 0022 · ฟิลด์กำหนดเอง · แพ็กเกจในดีล (docs/crm-plan.md C4)
--
-- custom_fields  นิยามฟิลด์ต่อบัญชี บนบริษัท (org) หรือดีล (deal) — ไม่มีบนตัวคน (ตั้งใจ:
--                ช่องอิสระบนคนคือทางให้ข้อมูลส่วนบุคคลที่ไม่ผ่านวัตถุประสงค์/อายุข้อมูลไหลเข้า)
--                kind: text · number · choice (options = JSON array) · date · ซ่อนได้ (archived_at) ไม่ลบ
-- custom_values  ค่าแบบเพิ่มอย่างเดียว: ทุกการแก้ = แถวใหม่ ค่าปัจจุบัน = แถวล่าสุด → มีประวัติในตัว
--                รวมบริษัทแล้วย้ายตามได้ (ไม่มี unique ที่ชน) · ลบได้เฉพาะตอนล้างบัญชี/ลบบริษัท
-- deal_items     แพ็กเกจในดีล (ชื่อ · จำนวน · ราคาต่อหน่วย) → แพ็กเกจไหนขายดี
--
-- ต้องตรงกับ ensureSchema() ใน lib/engine/db.ts (npm run verify:schema)
-- ═══════════════════════════════════════════════════════════════

create table if not exists custom_fields (
  id text not null primary key,
  tenant_id text not null references tenants (id) on delete cascade,
  entity text not null check (entity in ('org', 'deal')),
  label text not null,
  kind text not null check (kind in ('text', 'number', 'choice', 'date')),
  options text,
  position integer not null default 0,
  archived_at text,
  created_by text not null,
  created_at text not null
);
create index if not exists ix_custom_fields_tenant on custom_fields (tenant_id, entity);
alter table custom_fields enable row level security;
create policy tenant_read on custom_fields for select using (tenant_id in (select app.user_tenants()));
create policy tenant_write on custom_fields for all using (app.can_write(tenant_id)) with check (app.can_write(tenant_id));
grant select, insert, update on custom_fields to authenticated;

create table if not exists custom_values (
  id text not null primary key,
  tenant_id text not null references tenants (id) on delete cascade,
  field_id text not null,
  entity text not null check (entity in ('org', 'deal')),
  record_id text not null,
  value text,
  recorded_by text not null,
  recorded_at text not null
);
create index if not exists ix_custom_values_record on custom_values (tenant_id, entity, record_id, field_id, recorded_at);
alter table custom_values enable row level security;
create policy tenant_read on custom_values for select using (tenant_id in (select app.user_tenants()));
create policy tenant_write on custom_values for all using (app.can_write(tenant_id)) with check (app.can_write(tenant_id));
grant select, insert, update, delete on custom_values to authenticated;

create table if not exists deal_items (
  id text not null primary key,
  tenant_id text not null references tenants (id) on delete cascade,
  opportunity_id text not null,
  package text not null,
  qty double precision not null default 1,
  unit_price double precision,
  created_by text not null,
  created_at text not null
);
create index if not exists ix_deal_items_deal on deal_items (tenant_id, opportunity_id);
alter table deal_items enable row level security;
create policy tenant_read on deal_items for select using (tenant_id in (select app.user_tenants()));
create policy tenant_write on deal_items for all using (app.can_write(tenant_id)) with check (app.can_write(tenant_id));
grant select, insert, update, delete on deal_items to authenticated;
