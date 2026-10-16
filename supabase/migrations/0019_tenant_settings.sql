-- ═══════════════════════════════════════════════════════════════
-- 0019 · ค่าตั้งของบัญชี + สมัครเอง (docs/solo-plan.md S9)
--
-- tenant_settings  หนึ่งแถวต่อบัญชี: โหมด (solo/team) · วันนับ "บัญชีเงียบ" · วันส่งสรุปรายสัปดาห์
--                  · ที่มาของบัญชี (invite = ทีมสร้างให้ · self = สมัครเอง) · ความคืบหน้าขั้นตั้งต้น
--                  ไม่มีแถว = ค่าตั้งต้น (team · invite) — บัญชีเดิมทั้งหมดได้แถวจากไฟล์นี้
-- tenant_billing   เพิ่มสถานะ 'trial' + trial_ends_at (14 วัน) · ผู้ใช้ยังเขียนตารางนี้ไม่ได้เหมือนเดิม (0006)
--
-- ── ทำไม signup_source แก้ไม่ได้ ──
-- บัญชีสมัครเองถูกห้ามนำเข้าไฟล์จริงจนกว่า pentest จะผ่าน (lib/engine/signup/gate.ts) ด่านนั้นอ่าน
-- signup_source ถ้าเจ้าของแก้เป็น 'invite' ได้ (ผ่าน PostgREST ด้วย token ของตัวเอง) ด่านจะหายทันที
-- จึงถอนสิทธิ์ UPDATE ทั้งตาราง แล้วให้คืนเฉพาะคอลัมน์ที่เจ้าของตั้งเองได้ · signup_source เขียนได้ตอนสร้างเท่านั้น
-- (ใน app.create_signup_tenant ข้างล่าง) · ความคืบหน้าขั้นตั้งต้นเจ้าของแก้ได้ก็จริง แต่ไม่มีด่านความปลอดภัยใด
-- พึ่งมัน: ยืนยันสองชั้นอ่านจาก session (aal2) · AI อ่าน tenant_billing · การนำเข้าอ่าน signup_source
--
-- ── ทำไมสร้างบัญชีผ่านฟังก์ชัน security definer ไม่ใช่ asSystem ──
-- ผู้ใช้ใหม่ยังไม่เป็นสมาชิกของบัญชีใด RLS ของ tenants/tenant_users/tenant_billing จึงไม่ให้เขาสร้างอะไรเลย
-- (ถูกต้องแล้ว) ทางเลือกคือ (ก) ให้เซิร์ฟเวอร์ข้าม RLS ด้วย asSystem หรือ (ข) ฟังก์ชันแคบ ๆ ตัวเดียวที่ฐานข้อมูล
-- ตรวจเองว่า "ทำให้ตัวเองเท่านั้น (auth.uid()) · ครั้งเดียว · ยังไม่มีบัญชีอื่น" แล้วสร้างสี่แถวในธุรกรรมเดียว
-- เลือก (ข) เพราะเงื่อนไขอยู่ที่ฐานข้อมูล ไม่ใช่ความจำของโค้ดฝั่งแอป — บั๊กในแอปสร้างบัญชีให้คนอื่น
-- หรือสร้างซ้ำไม่ได้ · ธง SIGNUP_ENABLED ตรวจที่แอป (ฐานข้อมูลอ่าน env ไม่ได้) · schema app ไม่เปิดผ่าน
-- PostgREST จึงเรียกได้ผ่านเซิร์ฟเวอร์ของเราเท่านั้น
--
-- ต้องตรงกับ ensureSchema() ใน lib/engine/db.ts (npm run verify:schema)
-- ═══════════════════════════════════════════════════════════════

create table if not exists tenant_settings (
  tenant_id text not null primary key references tenants (id) on delete cascade,
  mode text not null default 'team' check (mode in ('solo', 'team')),
  today_quiet_days integer not null default 30 check (today_quiet_days between 7 and 365),
  weekly_digest_day integer check (weekly_digest_day between 0 and 6),
  signup_source text not null default 'invite' check (signup_source in ('invite', 'self')),
  dpa_version text,
  dpa_accepted_at text,
  dpa_accepted_by text,
  mfa_confirmed_at text,
  templates_chosen_at text,
  demo_loaded_at text,
  onboarded_at text,
  created_at text not null,
  updated_at text not null
);
alter table tenant_settings enable row level security;
create policy tenant_read on tenant_settings for select using (tenant_id in (select app.user_tenants()));
create policy owner_update on tenant_settings for update using (app.is_owner_of(tenant_id)) with check (app.is_owner_of(tenant_id));
revoke insert, update, delete on tenant_settings from authenticated, anon;
grant select on tenant_settings to authenticated;
grant update (mode, today_quiet_days, weekly_digest_day, dpa_version, dpa_accepted_at, dpa_accepted_by,
  mfa_confirmed_at, templates_chosen_at, demo_loaded_at, onboarded_at, updated_at) on tenant_settings to authenticated;

-- บัญชีที่มีอยู่แล้วทั้งหมดเป็นบัญชีที่ทีมสร้างให้ (โหมดทีม) และถือว่าตั้งค่าเสร็จแล้ว
insert into tenant_settings (tenant_id, mode, signup_source, onboarded_at, created_at, updated_at)
select id, 'team', 'invite', created_at, created_at, created_at from tenants
on conflict (tenant_id) do nothing;

-- ── ทดลองใช้ 14 วัน · AI ปิดระหว่างทดลอง (lib/engine/ai/policy.ts อนุญาตเฉพาะ paid และ demo ที่ไม่ใช่ลูกค้า) ──
alter table tenant_billing add column if not exists trial_ends_at text;
alter table tenant_billing drop constraint if exists tenant_billing_state_check;
alter table tenant_billing add constraint tenant_billing_state_check
  check (state in ('demo', 'trial', 'trial_audit', 'awaiting_payment', 'paid', 'suspended'));

create or replace function app.create_signup_tenant(p_id text, p_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_at text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_ends text := to_char((now() + interval '14 days') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_name text := btrim(coalesce(p_name, ''));
begin
  if v_uid is null then
    raise exception 'create_signup_tenant: ต้องเข้าสู่ระบบก่อน';
  end if;
  if p_id is null or p_id !~ '^s-[0-9a-f]{12}$' then
    raise exception 'create_signup_tenant: รหัสบัญชีไม่ถูกรูปแบบ';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 80 then
    raise exception 'create_signup_tenant: ชื่อบัญชีต้องยาว 2–80 ตัวอักษร';
  end if;
  -- คำขอซ้อนกันของผู้ใช้คนเดียว (กดสองครั้ง) ต้องได้บัญชีเดียว — ล็อกตามผู้ใช้จนจบธุรกรรม
  perform pg_advisory_xact_lock(hashtext('signup:' || v_uid::text));
  if exists (select 1 from tenant_users where user_id = v_uid) then
    raise exception 'create_signup_tenant: ผู้ใช้นี้มีบัญชีอยู่แล้ว';
  end if;
  insert into tenants (id, name, cycle_shape, tier, created_at, message_credits)
    values (p_id, v_name, 'considered', 'growth', v_at, 0);
  insert into tenant_users (user_id, tenant_id, role) values (v_uid, p_id, 'owner');
  insert into tenant_billing (tenant_id, state, is_customer, trial_ends_at, updated_at, updated_by)
    values (p_id, 'trial', 1, v_ends, v_at, 'signup');
  insert into tenant_settings (tenant_id, mode, signup_source, created_at, updated_at)
    values (p_id, 'solo', 'self', v_at, v_at);
  return p_id;
end
$$;
revoke all on function app.create_signup_tenant(text, text) from public, anon;
grant execute on function app.create_signup_tenant(text, text) to authenticated;
