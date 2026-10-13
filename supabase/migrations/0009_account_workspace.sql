-- ═══════════════════════════════════════════════════════════════
-- 0009 · Account Workspace (docs/plan.md B4 · AXIS Blueprint 2.0 บท 2, 9)
--
-- account_briefs        สรุปแฟ้มบริษัทจากหลักฐาน แยกตามระดับสิทธิ์ของผู้อ่าน — ทุกประโยคชี้หลักฐาน
-- orgs.account_owner_id เจ้าของบัญชีฝั่งขาย (ต่างจาก data_owner_id ซึ่งเป็นเจ้าของข้อมูล)
-- affiliations.last_seen_at วันล่าสุดที่ไฟล์เห็นคนนี้ที่บริษัทนี้ — ใช้ปิดช่วงสังกัดเมื่อไฟล์ใหม่เห็นที่ทำงานใหม่
--
-- สร้างจาก scripts/gen-schema-0009.py — ต้องตรงกับ ensureSchema() (npm run verify:schema)
-- ═══════════════════════════════════════════════════════════════

-- สรุปแฟ้มบริษัท — ผูกกับระดับสิทธิ์และ hash ของหลักฐาน · ทุกประโยคมีรหัสหลักฐาน · ลบตามเมื่อหลักฐานถูกลบ
create table if not exists account_briefs (
  id text not null primary key,
  tenant_id text not null references tenants (id) on delete cascade,
  org_id text not null,
  clearance text not null,
  evidence_hash text not null,
  source text not null,
  model text,
  sentences text not null default '[]',
  unknowns text not null default '[]',
  evidence text not null default '[]',
  dropped integer not null default 0,
  created_by text not null,
  created_at text not null
);
create unique index if not exists ux_brief_scope on account_briefs (tenant_id, org_id, clearance);
alter table account_briefs enable row level security;
create policy tenant_read on account_briefs for select using (tenant_id in (select app.user_tenants()));
create policy tenant_write on account_briefs for all using (app.can_write(tenant_id)) with check (app.can_write(tenant_id));
grant select, insert, update, delete on account_briefs to authenticated;

alter table orgs add column if not exists account_owner_id text;
alter table affiliations add column if not exists last_seen_at text;
