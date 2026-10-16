-- ═══════════════════════════════════════════════════════════════
-- 0018 · ยืนยันการรวมตัวตนเป็นชุด (docs/solo-plan.md S5 · หัวข้อ 5)
--
-- review_batches        หนึ่งแถวต่อชุดที่ยืนยัน/ที่ AI เสนอ: กติกาที่ใช้จัดกลุ่ม · AI ช่วยไหม · ขนาด · สถานะ
--                       merge_group_id = ค่า merge_log.rule ของทุกการรวมในชุด — ย้อนทั้งชุดได้ในกดเดียว
--                       ไม่มีรหัสคน ชื่อ หรือค่าติดต่อ (คู่ในชุดอยู่ที่ review_items.batch_id
--                       ซึ่งถูกลบตามคนเมื่อลบตามคำขอสิทธิ — lib/engine/tenant-data.ts)
-- review_items.batch_id   คู่นี้อยู่ในชุดไหน (ยืนยันแล้ว · ถูกเอาออกจากชุด · AI เสนอ) — คู่ที่มีค่านี้ไม่ถูกเสนอเป็นชุดซ้ำ
-- review_items.ai_verdict คำตอบของ AI ต่อคู่นี้ {v: same|different|unsure, f: ฟิลด์ที่อ้าง, r: เหตุผลสั้น}
-- sample_checks.batch_id/due_at  สุ่มตรวจหลังรวมเป็นชุด (ชุด ≥ 20 คู่ สุ่ม 3 คู่ ตรวจได้เมื่อครบ 7 วัน)
--                       แถวที่รอตรวจมี verdict = 'pending' — ไม่ถูกนับในความแม่น (sampleStats นับเฉพาะผลจริง)
--
-- ต้องตรงกับ ensureSchema() ใน lib/engine/db.ts (npm run verify:schema)
-- ═══════════════════════════════════════════════════════════════

create table if not exists review_batches (
  id text not null primary key,
  tenant_id text not null references tenants (id) on delete cascade,
  rule text not null,
  ai_assisted integer not null default 0,
  size integer not null default 0,
  status text not null default 'proposed',
  decided_by text,
  decided_at text,
  merge_group_id text,
  undone_by text,
  undone_at text,
  created_at text not null
);
create index if not exists ix_review_batches_tenant on review_batches (tenant_id, status, created_at);
alter table review_batches enable row level security;
create policy tenant_read on review_batches for select using (tenant_id in (select app.user_tenants()));
create policy tenant_insert on review_batches for insert with check (app.can_write(tenant_id));
create policy tenant_update on review_batches for update using (app.can_write(tenant_id)) with check (app.can_write(tenant_id));
-- ลบได้เฉพาะตอนล้างข้อมูลทั้งบัญชี (B2B_DATA_TABLES) — แอปไม่ลบชุดเอง ชุดที่ย้อนแล้วเก็บไว้เป็นประวัติ
create policy tenant_delete on review_batches for delete using (app.can_write(tenant_id));
grant select, insert, update, delete on review_batches to authenticated;

alter table review_items add column if not exists batch_id text;
alter table review_items add column if not exists ai_verdict text;
create index if not exists ix_review_batch on review_items (tenant_id, batch_id);

alter table sample_checks add column if not exists batch_id text;
alter table sample_checks add column if not exists due_at text;
