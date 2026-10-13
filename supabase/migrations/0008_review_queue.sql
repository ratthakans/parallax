-- ═══════════════════════════════════════════════════════════════
-- 0008 · คิวตรวจตัวตน (docs/plan.md B3 · AXIS Blueprint 2.0 บท 3–4)
--
-- review_items         คู่คน/กลุ่มองค์กรที่ระบบไม่แน่ใจ — คนตัดสิน ระบบไม่รวมเองจากสัญญาณอ่อน
-- resolution_overrides สิ่งที่คนตัดสินแล้ว ชนะกฎเสมอ
-- sample_checks        ผลสุ่มตรวจการรวม — ความแม่นจริงวัดจากที่คนตรวจ ไม่ใช่จากความมั่นใจของระบบ
--
-- สร้างจาก scripts/gen-schema-0008.py — ต้องตรงกับ ensureSchema() (npm run verify:schema)
-- ═══════════════════════════════════════════════════════════════

-- คิวให้คนตรวจ: คู่คนที่อาจเป็นคนเดียวกัน · กลุ่มชื่อองค์กรที่อาจเป็นนิติบุคคลเดียว — ระบบไม่รวมเองจากสัญญาณอ่อน
create table if not exists review_items (
  id text not null primary key,
  tenant_id text not null references tenants (id) on delete cascade,
  kind text not null,
  subject_ids text not null,
  signals text not null default '[]',
  confidence double precision not null default 0,
  status text not null default 'open',
  assigned_to text,
  due_at text,
  created_at text not null,
  decided_by text,
  decided_at text,
  decision_note text
);
create index if not exists ix_review_open on review_items (tenant_id, status, kind);
create unique index if not exists ux_review_subject on review_items (tenant_id, kind, subject_ids);
alter table review_items enable row level security;
create policy tenant_read on review_items for select using (tenant_id in (select app.user_tenants()));
create policy tenant_write on review_items for all using (app.can_write(tenant_id)) with check (app.can_write(tenant_id));
grant select, insert, update, delete on review_items to authenticated;

-- สิ่งที่คนตัดสินแล้ว — ชนะกฎเสมอ และการตรวจตัวตนรอบถัดไปไม่เสนอซ้ำ
create table if not exists resolution_overrides (
  id text not null primary key,
  tenant_id text not null references tenants (id) on delete cascade,
  kind text not null,
  verdict text not null,
  a_id text not null,
  b_id text not null,
  decided_by text not null,
  decided_at text not null,
  note text
);
create unique index if not exists ux_override_pair on resolution_overrides (tenant_id, kind, a_id, b_id);
alter table resolution_overrides enable row level security;
create policy tenant_read on resolution_overrides for select using (tenant_id in (select app.user_tenants()));
create policy tenant_write on resolution_overrides for all using (app.can_write(tenant_id)) with check (app.can_write(tenant_id));
grant select, insert, update, delete on resolution_overrides to authenticated;

-- ผลสุ่มตรวจการรวมโดย data steward — ใช้วัดความแม่นจริง ไม่ใช่ความมั่นใจของระบบ
create table if not exists sample_checks (
  id text not null primary key,
  tenant_id text not null references tenants (id) on delete cascade,
  customer_id text not null,
  verdict text not null,
  checked_by text not null,
  checked_at text not null,
  note text
);
create index if not exists ix_sample_tenant on sample_checks (tenant_id, checked_at);
alter table sample_checks enable row level security;
create policy tenant_read on sample_checks for select using (tenant_id in (select app.user_tenants()));
create policy tenant_write on sample_checks for all using (app.can_write(tenant_id)) with check (app.can_write(tenant_id));
grant select, insert, update, delete on sample_checks to authenticated;

