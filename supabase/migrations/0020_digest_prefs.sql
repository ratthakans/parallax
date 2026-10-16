-- ═══════════════════════════════════════════════════════════════
-- 0020 · สรุปรายสัปดาห์ถึงตัวเอง (docs/solo-plan.md S8)
--
-- digest_prefs  หนึ่งแถวต่อ (บัญชี, ผู้ใช้): เปิด/ปิด · วันในสัปดาห์ (1 = จันทร์ … 7 = อาทิตย์ · เวลาไทย)
--               last_sent_day = วันที่ (เวลาไทย) ที่จองส่งแล้ว — กันส่งซ้ำในวันเดียวกัน
--               ไม่มีแถว = ไม่ส่ง (ผู้ใช้เปิดเอง) · ไม่มีข้อมูลคนในฐาน · ไม่เก็บอีเมล (อ่านจาก auth.users ตอนส่ง)
--               ผู้ใช้อ่าน/ตั้งได้เฉพาะแถวของตัวเองในบัญชีที่เป็นสมาชิก · งาน cron อ่านข้ามบัญชีด้วยคอนเนกชันของระบบ
--
-- ต้องตรงกับ ensureSchema() ใน lib/engine/db.ts (npm run verify:schema)
-- ═══════════════════════════════════════════════════════════════

create table if not exists digest_prefs (
  tenant_id text not null references tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  enabled integer not null default 0 check (enabled in (0, 1)),
  weekday integer not null default 1 check (weekday between 1 and 7),
  last_sent_day text,
  last_sent_at text,
  updated_at text not null,
  primary key (tenant_id, user_id)
);
create index if not exists ix_digest_prefs_due on digest_prefs (weekday, enabled);
alter table digest_prefs enable row level security;
create policy own_read on digest_prefs for select
  using (user_id = (select auth.uid()) and tenant_id in (select app.user_tenants()));
create policy own_insert on digest_prefs for insert
  with check (user_id = (select auth.uid()) and tenant_id in (select app.user_tenants()));
create policy own_update on digest_prefs for update
  using (user_id = (select auth.uid()) and tenant_id in (select app.user_tenants()))
  with check (user_id = (select auth.uid()) and tenant_id in (select app.user_tenants()));
grant select, insert, update on digest_prefs to authenticated;
revoke delete on digest_prefs from authenticated;
