-- ═══════════════════════════════════════════════════════════════
-- 0012 · หน้า "วันนี้" (docs/solo-plan.md S1)
--
-- queue_marks  การเลื่อน (snooze) และรับทราบ (ack) รายการในคิวของผู้ใช้แต่ละคน
--              ไม่มีข้อความอิสระและไม่มีข้อมูลส่วนบุคคล — มีแค่ชนิดกับรหัสของรายการที่ชี้ไป
--
-- ต้องตรงกับ ensureSchema() ใน lib/engine/db.ts (npm run verify:schema)
-- ═══════════════════════════════════════════════════════════════

create table if not exists queue_marks (
  tenant_id text not null references tenants (id) on delete cascade,
  user_id text not null,
  item_kind text not null,
  item_id text not null,
  mark text not null,
  until text,
  count integer not null default 0,
  updated_at text not null,
  primary key (tenant_id, user_id, item_kind, item_id)
);
alter table queue_marks enable row level security;
create policy tenant_read on queue_marks for select using (tenant_id in (select app.user_tenants()));
create policy tenant_write on queue_marks for all using (app.can_write(tenant_id)) with check (app.can_write(tenant_id));
grant select, insert, update, delete on queue_marks to authenticated;
