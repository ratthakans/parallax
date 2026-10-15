-- ═══════════════════════════════════════════════════════════════
-- 0014 · ทะเบียนการลบ (docs/plan.md หัวข้อ 7.5 · B6)
--
-- deletion_registry  HMAC ของอีเมล/เบอร์ของคนที่ถูกลบ พร้อมเหตุผล เวลา ผู้ลบ — ไม่มีชื่อ
--                    ใช้กันการนำเข้าซ้ำ และใช้ซ้ำหลังกู้คืน backup (lib/engine/vault/erasure.ts)
--                    เพิ่มอย่างเดียว: ผู้ใช้ลบหรือแก้แถวไม่ได้ — ลบแถวทะเบียน = คนที่ถูกลบกลับมาได้
--
-- ต้องตรงกับ ensureSchema() ใน lib/engine/db.ts (npm run verify:schema)
-- ═══════════════════════════════════════════════════════════════

create table if not exists deletion_registry (
  id text not null primary key,
  tenant_id text not null references tenants (id) on delete cascade,
  keys text not null,
  reason text not null,
  request_ref text,
  deleted_by text not null,
  deleted_at text not null
);
create index if not exists ix_deletion_registry_tenant on deletion_registry (tenant_id, deleted_at);
alter table deletion_registry enable row level security;
create policy tenant_read on deletion_registry for select using (tenant_id in (select app.user_tenants()));
create policy tenant_append on deletion_registry for insert with check (app.can_write(tenant_id));
grant select, insert on deletion_registry to authenticated;
revoke update, delete on deletion_registry from authenticated;
