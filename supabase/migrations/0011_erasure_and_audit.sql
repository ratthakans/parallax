-- ═══════════════════════════════════════════════════════════════
-- 0011 · การลบตามคำขอสิทธิบนตารางเพิ่มอย่างเดียว + สาย audit ไม่แตก
--
-- ปัญหาที่แก้:
--   1. preferences · evidence · record_versions ถอนสิทธิ์ DELETE จาก authenticated (0007)
--      deleteCustomer และการล้างบัญชีจึงพังทั้งธุรกรรมบน Postgres — sqlite ไม่มี grant จึงไม่เห็น
--      0007 ตั้งใจไว้ว่า "การลบตามคำขอสิทธิทำจากฝั่งระบบ" — ฟังก์ชันด้านล่างคือฝั่งระบบนั้น
--   2. appendAudit สองตัวพร้อมกันอ่าน hash ล่าสุดตัวเดียวกัน → สายแตกเป็นสองกิ่ง
--      ตัวโค้ดล็อกด้วย pg_advisory_xact_lock แล้ว ดัชนีนี้คือด่านสุดท้ายถ้ามีทางเขียนอื่นหลุดมา
--
-- ── ทำไมฟังก์ชันลบได้เฉพาะคนที่ไม่มีแถว customers แล้ว ──
-- ถ้าลบ preferences ของคนที่ยังอยู่ได้ ผู้ใช้จะลบ "คัดค้าน" ทิ้งแล้วติดต่อต่อได้
-- ฟังก์ชันจึงยอมลบประวัติเฉพาะของคนที่ถูกลบออกจากทะเบียนในธุรกรรมเดียวกันแล้วเท่านั้น
-- ═══════════════════════════════════════════════════════════════

create or replace function app.erase_person_history(t text, ids text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select auth.uid()) is not null and not app.can_write(t) then
    raise exception 'erase_person_history: ไม่มีสิทธิ์เขียนบัญชีนี้';
  end if;
  if exists (select 1 from customers where tenant_id = t and id = any(ids)) then
    raise exception 'erase_person_history: ต้องลบคนออกจากทะเบียนก่อน';
  end if;
  delete from evidence e
   using preferences p
   where p.tenant_id = t and p.customer_id = any(ids)
     and e.tenant_id = t and e.id = p.evidence_id;
  delete from preferences where tenant_id = t and customer_id = any(ids);
  delete from record_versions where tenant_id = t and record_kind = 'person' and record_id = any(ids);
end
$$;

create or replace function app.erase_tenant_history(t text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select auth.uid()) is not null and not app.is_owner_of(t) then
    raise exception 'erase_tenant_history: เฉพาะเจ้าของบัญชี';
  end if;
  if exists (select 1 from customers where tenant_id = t) then
    raise exception 'erase_tenant_history: ต้องลบข้อมูลลูกค้าก่อน';
  end if;
  delete from preferences where tenant_id = t;
  delete from evidence where tenant_id = t;
  delete from record_versions where tenant_id = t;
end
$$;

-- นโยบาย RLS อ้าง app.* ได้โดยไม่ต้องมีสิทธิ์ใช้ schema (ชื่อถูกผูกตอนสร้างนโยบาย) แต่การเรียกตรงต้องมี
-- schema app ไม่ถูกเปิดผ่าน PostgREST (เปิดเฉพาะ public) และฟังก์ชันเดิมในนี้บอกได้แค่บัญชีของผู้เรียกเอง
grant usage on schema app to authenticated;
revoke all on function app.erase_person_history(text, text[]) from public, anon;
revoke all on function app.erase_tenant_history(text) from public, anon;
grant execute on function app.erase_person_history(text, text[]) to authenticated;
grant execute on function app.erase_tenant_history(text) to authenticated;

create unique index if not exists ux_audit_chain on audit_log (tenant_id, prev_hash);
