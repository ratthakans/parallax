-- ═══════════════════════════════════════════════════════════════
-- 0007 · โครงข้อมูล B2B (AXIS Blueprint 2.0 บท 3 · docs/plan.md หัวข้อ 4)
--
-- องค์กรและสังกัด · ความสัมพันธ์ที่มีหลักฐาน · ปฏิสัมพันธ์ · การร่วมงาน · โอกาสและงาน ·
-- แหล่งข้อมูลและผลการนำเข้ารายแถว · วัตถุประสงค์และฐานการประมวลผล · ความยินยอม/คัดค้าน
-- พร้อมหลักฐาน · ประวัติรุ่น · การรวมตัวตน · บันทึกตรวจสอบ · กฎอายุข้อมูล
--
-- ตารางที่เป็นหลักฐาน (preferences · evidence · record_versions · audit_log) ผู้ใช้เพิ่มได้
-- แต่แก้หรือลบไม่ได้ — การลบตามคำขอสิทธิทำจากฝั่งระบบพร้อมบันทึก
--
-- สร้างจากสเปกเดียวกับ ensureSchema() ใน lib/engine/db.ts — npm run verify:schema ตรวจให้
-- ═══════════════════════════════════════════════════════════════

-- องค์กร — นิติบุคคลหนึ่งแถว · บริษัทในเครือเชื่อมด้วย parent_id ไม่รวมเป็นแถวเดียว
create table if not exists orgs (
  id text not null primary key,
  tenant_id text not null references tenants (id) on delete cascade,
  name text not null,
  name_en text,
  name_norm text not null,
  tax_id text,
  branch_code text,
  legal_entity integer not null default 1,
  parent_id text,
  primary_domain text,
  industry text,
  classification text not null default 'confidential',
  data_owner_id text,
  source_id text,
  lifecycle_state text not null default 'received',
  state_owner_id text,
  state_due_at text,
  restriction_status text not null default 'none',
  retention_rule_id text,
  recorded_at text,
  last_verified_at text,
  created_at text not null
);
create index if not exists ix_orgs_name on orgs (tenant_id, name_norm);
create index if not exists ix_orgs_tax on orgs (tenant_id, tax_id);
alter table orgs enable row level security;
create policy tenant_read on orgs for select using (tenant_id in (select app.user_tenants()));
create policy tenant_write on orgs for all using (app.can_write(tenant_id)) with check (app.can_write(tenant_id));
grant select, insert, update, delete on orgs to authenticated;

-- โดเมนอีเมลขององค์กร — ใช้เป็นสัญญาณให้ตรวจ ไม่ใช่เหตุผลรวมคน
create table if not exists org_domains (
  tenant_id text not null references tenants (id) on delete cascade,
  org_id text not null,
  domain text not null,
  primary key (tenant_id, domain)
);
create index if not exists ix_org_domains_org on org_domains (tenant_id, org_id);
alter table org_domains enable row level security;
create policy tenant_read on org_domains for select using (tenant_id in (select app.user_tenants()));
create policy tenant_write on org_domains for all using (app.can_write(tenant_id)) with check (app.can_write(tenant_id));
grant select, insert, update, delete on org_domains to authenticated;

-- คนสังกัดองค์กรช่วงไหน · valid_from/valid_to = เวลาที่เป็นจริง · recorded_at = เวลาที่ระบบรับรู้
create table if not exists affiliations (
  id text not null primary key,
  tenant_id text not null references tenants (id) on delete cascade,
  customer_id text not null,
  org_id text not null,
  title text,
  department text,
  valid_from text,
  valid_to text,
  source_id text,
  confirmed_by text,
  recorded_at text not null
);
create index if not exists ix_aff_person on affiliations (tenant_id, customer_id);
create index if not exists ix_aff_org on affiliations (tenant_id, org_id);
alter table affiliations enable row level security;
create policy tenant_read on affiliations for select using (tenant_id in (select app.user_tenants()));
create policy tenant_write on affiliations for all using (app.can_write(tenant_id)) with check (app.can_write(tenant_id));
grant select, insert, update, delete on affiliations to authenticated;

-- ความสัมพันธ์ที่มีหลักฐาน: คน↔คน · คน↔องค์กร · องค์กร↔องค์กร
create table if not exists relationship_assertions (
  id text not null primary key,
  tenant_id text not null references tenants (id) on delete cascade,
  from_kind text not null,
  from_id text not null,
  to_kind text not null,
  to_id text not null,
  type text not null,
  context text,
  evidence_id text,
  confirmed_by text,
  confirmed_at text,
  valid_from text,
  valid_to text,
  source_id text,
  lifecycle_state text not null default 'pending_review',
  recorded_at text not null
);
create index if not exists ix_rel_from on relationship_assertions (tenant_id, from_kind, from_id);
create index if not exists ix_rel_to on relationship_assertions (tenant_id, to_kind, to_id);
alter table relationship_assertions enable row level security;
create policy tenant_read on relationship_assertions for select using (tenant_id in (select app.user_tenants()));
create policy tenant_write on relationship_assertions for all using (app.can_write(tenant_id)) with check (app.can_write(tenant_id));
grant select, insert, update, delete on relationship_assertions to authenticated;

-- ปฏิสัมพันธ์: ประชุม · โทร · อีเมลนอกระบบ · กิจกรรม · โน้ต พร้อมผลและผู้รับผิดชอบ
create table if not exists interactions (
  id text not null primary key,
  tenant_id text not null references tenants (id) on delete cascade,
  kind text not null,
  occurred_at text not null,
  org_id text,
  customer_id text,
  opportunity_id text,
  summary text,
  outcome text,
  owner_id text,
  source_id text,
  classification text not null default 'confidential',
  recorded_at text not null
);
create index if not exists ix_inter_org on interactions (tenant_id, org_id, occurred_at);
create index if not exists ix_inter_person on interactions (tenant_id, customer_id);
alter table interactions enable row level security;
create policy tenant_read on interactions for select using (tenant_id in (select app.user_tenants()));
create policy tenant_write on interactions for all using (app.can_write(tenant_id)) with check (app.can_write(tenant_id));
grant select, insert, update, delete on interactions to authenticated;

-- การร่วมงาน/กิจกรรมในบทบาทหนึ่ง เช่น ผู้ออกบูธงานปี 2024
create table if not exists participations (
  id text not null primary key,
  tenant_id text not null references tenants (id) on delete cascade,
  customer_id text not null,
  org_id text,
  program text not null,
  edition text,
  role text not null,
  occurred_at text,
  source_id text,
  recorded_at text not null
);
create index if not exists ix_part_person on participations (tenant_id, customer_id);
create index if not exists ix_part_program on participations (tenant_id, program, edition);
alter table participations enable row level security;
create policy tenant_read on participations for select using (tenant_id in (select app.user_tenants()));
create policy tenant_write on participations for all using (app.can_write(tenant_id)) with check (app.can_write(tenant_id));
grant select, insert, update, delete on participations to authenticated;

-- โอกาสแบบง่าย: ข้อเสนอ · บริษัท · ขั้น · เจ้าของ
create table if not exists opportunities (
  id text not null primary key,
  tenant_id text not null references tenants (id) on delete cascade,
  org_id text not null,
  name text not null,
  offer text,
  stage text not null default 'open',
  owner_id text,
  value double precision,
  expected_close text,
  created_at text not null,
  updated_at text not null
);
create index if not exists ix_opp_org on opportunities (tenant_id, org_id);
alter table opportunities enable row level security;
create policy tenant_read on opportunities for select using (tenant_id in (select app.user_tenants()));
create policy tenant_write on opportunities for all using (app.can_write(tenant_id)) with check (app.can_write(tenant_id));
grant select, insert, update, delete on opportunities to authenticated;

-- ผู้เกี่ยวข้องของโอกาส
create table if not exists opportunity_people (
  tenant_id text not null references tenants (id) on delete cascade,
  opportunity_id text not null,
  customer_id text not null,
  role text,
  primary key (opportunity_id, customer_id)
);
create index if not exists ix_opp_people_person on opportunity_people (tenant_id, customer_id);
alter table opportunity_people enable row level security;
create policy tenant_read on opportunity_people for select using (tenant_id in (select app.user_tenants()));
create policy tenant_write on opportunity_people for all using (app.can_write(tenant_id)) with check (app.can_write(tenant_id));
grant select, insert, update, delete on opportunity_people to authenticated;

-- งานถัดไปที่มีเจ้าของและกำหนด
create table if not exists tasks (
  id text not null primary key,
  tenant_id text not null references tenants (id) on delete cascade,
  title text not null,
  status text not null default 'open',
  due_at text,
  owner_id text,
  org_id text,
  customer_id text,
  opportunity_id text,
  outcome text,
  created_by text not null,
  created_at text not null,
  done_at text
);
create index if not exists ix_tasks_owner on tasks (tenant_id, owner_id, status);
create index if not exists ix_tasks_org on tasks (tenant_id, org_id);
alter table tasks enable row level security;
create policy tenant_read on tasks for select using (tenant_id in (select app.user_tenants()));
create policy tenant_write on tasks for all using (app.can_write(tenant_id)) with check (app.can_write(tenant_id));
grant select, insert, update, delete on tasks to authenticated;

-- แหล่งข้อมูลที่ลงทะเบียน: วัตถุประสงค์ · เจ้าของงาน · ขอบเขตสิทธิ · ฟิลด์ที่เลือก — ไม่มีแหล่ง = อัปโหลดไม่ได้
create table if not exists sources (
  id text not null primary key,
  tenant_id text not null references tenants (id) on delete cascade,
  name text not null,
  kind text not null,
  purpose_id text,
  owner_id text not null,
  scope_note text,
  fields text not null default '[]',
  acquisition_note text,
  status text not null default 'active',
  registered_by text not null,
  registered_at text not null
);
alter table sources enable row level security;
create policy tenant_read on sources for select using (tenant_id in (select app.user_tenants()));
create policy tenant_write on sources for all using (app.can_write(tenant_id)) with check (app.can_write(tenant_id));
grant select, insert, update, delete on sources to authenticated;

-- ไฟล์หนึ่งไฟล์ที่นำเข้า — เริ่มที่สถานะกัก (quarantined) จนผ่านการสแกน
create table if not exists import_batches (
  id text not null primary key,
  tenant_id text not null references tenants (id) on delete cascade,
  source_id text not null,
  filename text not null,
  sha256 text not null,
  bytes integer not null,
  rows_total integer not null default 0,
  status text not null default 'quarantined',
  uploaded_by text not null,
  uploaded_at text not null,
  finished_at text
);
create unique index if not exists ux_batches_sha on import_batches (tenant_id, sha256);
alter table import_batches enable row level security;
create policy tenant_read on import_batches for select using (tenant_id in (select app.user_tenants()));
create policy tenant_write on import_batches for all using (app.can_write(tenant_id)) with check (app.can_write(tenant_id));
grant select, insert, update, delete on import_batches to authenticated;

-- ผลรายแถว: accepted · rejected · pending_review · suspended · ค่าดั้งเดิมเข้ารหัสใน payload_enc
create table if not exists import_rows (
  tenant_id text not null references tenants (id) on delete cascade,
  batch_id text not null,
  line integer not null,
  status text not null default 'pending_review',
  reason text,
  source_ref text,
  customer_id text,
  payload_enc text,
  recorded_at text not null,
  primary key (batch_id, line)
);
create index if not exists ix_rows_person on import_rows (tenant_id, customer_id);
alter table import_rows enable row level security;
create policy tenant_read on import_rows for select using (tenant_id in (select app.user_tenants()));
create policy tenant_write on import_rows for all using (app.can_write(tenant_id)) with check (app.can_write(tenant_id));
grant select, insert, update, delete on import_rows to authenticated;

-- วัตถุประสงค์การประมวลผลของบัญชี
create table if not exists purposes (
  id text not null primary key,
  tenant_id text not null references tenants (id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  created_at text not null
);
create unique index if not exists ux_purposes_code on purposes (tenant_id, code);
alter table purposes enable row level security;
create policy tenant_read on purposes for select using (tenant_id in (select app.user_tenants()));
create policy tenant_write on purposes for all using (app.can_write(tenant_id)) with check (app.can_write(tenant_id));
grant select, insert, update, delete on purposes to authenticated;

-- ฐานการประมวลผลต่อวัตถุประสงค์ (เชื่อมทะเบียน ROPA) · เก็บเป็นรุ่น
create table if not exists processing_records (
  id text not null primary key,
  tenant_id text not null references tenants (id) on delete cascade,
  purpose_id text not null,
  lawful_basis text not null,
  data_scope text,
  approved_by text,
  version integer not null default 1,
  effective_from text not null,
  effective_to text,
  lia_ref text,
  recorded_at text not null
);
create index if not exists ix_proc_purpose on processing_records (tenant_id, purpose_id);
alter table processing_records enable row level security;
create policy tenant_read on processing_records for select using (tenant_id in (select app.user_tenants()));
create policy tenant_write on processing_records for all using (app.can_write(tenant_id)) with check (app.can_write(tenant_id));
grant select, insert, update, delete on processing_records to authenticated;

-- ความยินยอม · ถอน · คัดค้าน · ข้อจำกัด ต่อวัตถุประสงค์และช่องทาง — เพิ่มอย่างเดียว
create table if not exists preferences (
  id text not null primary key,
  tenant_id text not null references tenants (id) on delete cascade,
  customer_id text not null,
  purpose_id text,
  channel text not null default 'any',
  kind text not null,
  effective_at text not null,
  evidence_id text,
  recorded_by text not null,
  recorded_at text not null
);
create index if not exists ix_pref_person on preferences (tenant_id, customer_id);
alter table preferences enable row level security;
create policy tenant_read on preferences for select using (tenant_id in (select app.user_tenants()));
create policy tenant_append on preferences for insert with check (app.can_write(tenant_id));
grant select, insert on preferences to authenticated;
revoke update, delete on preferences from authenticated;

-- หลักฐานแนบ: แถวในไฟล์ · ฟอร์ม · เอกสาร · คำยืนยัน — เพิ่มอย่างเดียว
create table if not exists evidence (
  id text not null primary key,
  tenant_id text not null references tenants (id) on delete cascade,
  kind text not null,
  ref text,
  note text,
  captured_by text not null,
  captured_at text not null
);
alter table evidence enable row level security;
create policy tenant_read on evidence for select using (tenant_id in (select app.user_tenants()));
create policy tenant_append on evidence for insert with check (app.can_write(tenant_id));
grant select, insert on evidence to authenticated;
revoke update, delete on evidence from authenticated;

-- ประวัติทุกการเปลี่ยนค่า (เวลาที่ระบบรับรู้) — ค่า PII เก็บแบบปิดบาง · เพิ่มอย่างเดียว
create table if not exists record_versions (
  id bigint generated always as identity primary key,
  tenant_id text not null references tenants (id) on delete cascade,
  record_kind text not null,
  record_id text not null,
  field text not null,
  old_value text,
  new_value text,
  reason text not null,
  changed_by text not null,
  valid_from text,
  recorded_at text not null
);
create index if not exists ix_versions_record on record_versions (tenant_id, record_kind, record_id, recorded_at);
alter table record_versions enable row level security;
create policy tenant_read on record_versions for select using (tenant_id in (select app.user_tenants()));
create policy tenant_append on record_versions for insert with check (app.can_write(tenant_id));
grant select, insert on record_versions to authenticated;
revoke update, delete on record_versions from authenticated;

-- การรวมตัวตน — ย้อนได้ · impact เก็บสิ่งที่ย้ายตอนรวม
create table if not exists merge_log (
  id text not null primary key,
  tenant_id text not null references tenants (id) on delete cascade,
  survivor_id text not null,
  merged_id text not null,
  rule text,
  confidence double precision,
  decided_by text not null,
  decided_at text not null,
  impact text not null default '{}',
  undone_at text,
  undone_by text
);
create index if not exists ix_merge_survivor on merge_log (tenant_id, survivor_id);
alter table merge_log enable row level security;
create policy tenant_read on merge_log for select using (tenant_id in (select app.user_tenants()));
create policy tenant_write on merge_log for all using (app.can_write(tenant_id)) with check (app.can_write(tenant_id));
grant select, insert, update, delete on merge_log to authenticated;

-- บันทึกตรวจสอบ — hash ต่อเนื่องตรวจความครบได้ · ไม่มีค่า PII เต็ม · เพิ่มอย่างเดียว
create table if not exists audit_log (
  id bigint generated always as identity primary key,
  tenant_id text not null references tenants (id) on delete cascade,
  at text not null,
  actor text not null,
  action text not null,
  target_kind text,
  target_id text,
  detail text,
  prev_hash text,
  hash text not null
);
create index if not exists ix_audit_tenant on audit_log (tenant_id, at);
alter table audit_log enable row level security;
create policy tenant_read on audit_log for select using (tenant_id in (select app.user_tenants()));
create policy tenant_append on audit_log for insert with check (tenant_id in (select app.user_tenants()));
grant select, insert on audit_log to authenticated;
revoke update, delete on audit_log from authenticated;

-- กฎอายุข้อมูลต่อประเภท — ไม่มีค่า 'เก็บตลอดไป' เป็นค่าตั้งต้น
create table if not exists retention_rules (
  id text not null primary key,
  tenant_id text not null references tenants (id) on delete cascade,
  data_kind text not null,
  trigger_event text not null,
  period_days integer not null,
  review_owner_id text,
  legal_hold integer not null default 0,
  note text,
  created_at text not null
);
alter table retention_rules enable row level security;
create policy tenant_read on retention_rules for select using (tenant_id in (select app.user_tenants()));
create policy tenant_write on retention_rules for all using (app.can_write(tenant_id)) with check (app.can_write(tenant_id));
grant select, insert, update, delete on retention_rules to authenticated;

alter table customers add column if not exists classification text not null default 'confidential';
alter table customers add column if not exists data_owner_id text;
alter table customers add column if not exists source_id text;
alter table customers add column if not exists lifecycle_state text not null default 'received';
alter table customers add column if not exists state_owner_id text;
alter table customers add column if not exists state_due_at text;
alter table customers add column if not exists restriction_status text not null default 'none';
alter table customers add column if not exists retention_rule_id text;
alter table customers add column if not exists recorded_at text;
alter table customers add column if not exists last_verified_at text;
alter table contact_points add column if not exists verify_status text not null default 'unverified';
alter table contact_points add column if not exists valid_from text;
alter table contact_points add column if not exists valid_to text;
alter table contact_points add column if not exists last_verified_at text;
alter table tenant_users add column if not exists is_staff integer not null default 0;

-- ── ค่าที่อนุญาต (ฝั่ง sqlite ตรวจที่ชั้นแอปผ่าน lib/shared/vault.ts) ──
alter table orgs add constraint orgs_classification check (classification in ('public','internal','confidential','restricted_high'));
alter table orgs add constraint orgs_lifecycle check (lifecycle_state in ('received','pending_review','confirmed','needs_review','restricted','deleted','anonymised'));
alter table customers add constraint customers_classification check (classification in ('public','internal','confidential','restricted_high'));
alter table customers add constraint customers_lifecycle check (lifecycle_state in ('received','pending_review','confirmed','needs_review','restricted','deleted','anonymised'));
alter table import_rows add constraint import_rows_status check (status in ('accepted','rejected','pending_review','suspended'));
alter table preferences add constraint preferences_kind check (kind in ('consent','withdrawal','objection','restriction'));
alter table retention_rules add constraint retention_positive check (period_days > 0);
