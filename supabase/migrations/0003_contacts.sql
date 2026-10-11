-- ═══════════════════════════════════════════════════════════════
-- 0003 · ข้อมูลติดต่อจริงของลูกค้า
--
-- ตัดสินใจ 2026-10-11: เก็บข้อมูลติดต่อให้มากที่สุดเท่าที่ทำได้
-- ค่าจริงเก็บแบบเข้ารหัสในแอป (AES-256-GCM · lib/engine/pii.ts)
-- ฐานข้อมูลไม่เคยเห็นค่าที่อ่านได้ และไม่มีกุญแจ
--
-- ⚠ คอลัมน์ต้องตรงกับ ensureSchema() ใน lib/engine/db.ts ทุกตัว
--    npm run verify:schema ตรวจให้ — CI บังคับบน main
-- ═══════════════════════════════════════════════════════════════

create table if not exists contact_points (
  id            text primary key,
  tenant_id     text not null references tenants (id) on delete cascade,
  customer_id   text not null references customers (id) on delete cascade,
  kind          text not null,
  label         text,
  value_enc     text not null,
  value_hmac    text not null,
  value_masked  text not null,
  is_primary    integer not null default 0,
  source        text not null,
  created_at    text not null,
  unique (customer_id, kind, value_hmac)
);
create index if not exists ix_cp_tenant on contact_points (tenant_id);
create index if not exists ix_cp_match  on contact_points (tenant_id, kind, value_hmac);

-- ไม่มีฟิลด์ข้อมูลอ่อนไหวตาม PDPA มาตรา 26 และไม่มีเลขบัตรประชาชน โดยตั้งใจ
create table if not exists contact_profiles (
  customer_id  text primary key references customers (id) on delete cascade,
  tenant_id    text not null references tenants (id) on delete cascade,
  first_name   text,
  last_name    text,
  nickname     text,
  gender       text,
  birthday     text,
  company      text,
  job_title    text,
  subdistrict  text,
  district     text,
  province     text,
  postcode     text,
  note         text,
  updated_at   text not null
);
create index if not exists ix_cprof_tenant on contact_profiles (tenant_id);

-- นโยบายเดียวกับตารางอื่นใน 0002 — อ่านได้ถ้าเป็นสมาชิก เขียนได้ถ้ามีสิทธิ์เขียน
do $$
declare t text;
begin
  foreach t in array array['contact_points', 'contact_profiles'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_read on %I', t);
    execute format('drop policy if exists tenant_write on %I', t);
    execute format($f$
      create policy tenant_read on %I
        for select using (tenant_id in (select app.user_tenants()))
    $f$, t);
    execute format($f$
      create policy tenant_write on %I
        for all
        using (app.can_write(tenant_id))
        with check (app.can_write(tenant_id))
    $f$, t);
  end loop;
end $$;

-- Supabase ให้สิทธิ์ตารางใหม่ใน public แก่ authenticated ผ่าน default privileges
-- อยู่แล้ว (0002 จึงไม่มี grant) — เขียนไว้ชัดเผื่อวันที่ค่าตั้งต้นนั้นถูกเปลี่ยน
-- เพราะ RLS ไม่มีโอกาสทำงานเลยถ้าบทบาทไม่มีสิทธิ์แตะตารางตั้งแต่แรก
grant select, insert, update, delete on contact_points, contact_profiles to authenticated;
