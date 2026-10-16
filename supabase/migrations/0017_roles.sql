-- ═══════════════════════════════════════════════════════════════
-- 0017 · บทบาทหกแบบ (docs/plan.md B6 · lib/shared/roles.ts)
--
-- owner · privacy (ผู้ดูแลข้อมูลส่วนบุคคล) · steward · lead (หัวหน้าทีม) · bd · viewer
-- ผู้ใช้เดิมที่เป็น operator → lead (ทำได้เท่าที่ operator เคยทำ ไม่มีใครเสียสิทธิ์)
-- ชั้นฐานข้อมูลยังแยกแค่ "เขียนได้ / อ่านอย่างเดียว" (app.can_write) — การแยกละเอียดอยู่ที่ Server Action
-- นโยบายที่เป็นของ owner (แก้บัญชี · จัดการสมาชิก · ล้างบัญชี) ไม่เปลี่ยน
-- ═══════════════════════════════════════════════════════════════

update tenant_users set role = 'lead' where role = 'operator';
alter table tenant_users alter column role set default 'bd';
alter table tenant_users drop constraint if exists tenant_users_role_check;
alter table tenant_users add constraint tenant_users_role_check
  check (role in ('owner', 'privacy', 'steward', 'lead', 'bd', 'viewer'));

create or replace function app.can_write(t text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from tenant_users
     where user_id = (select auth.uid())
       and tenant_id = t
       and role in ('owner', 'privacy', 'steward', 'lead', 'bd')
  )
$$;
