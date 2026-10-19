-- ═══════════════════════════════════════════════════════════════
-- 0027 · ดีลกับบุคคล (docs/crm-plan.md F3)
--
-- opportunities.org_id      NULL ได้ — ดีลของลูกค้าบุคคลไม่มีบริษัท
-- opportunities.customer_id ลูกค้าบุคคลของดีล · ต้องมีบริษัทหรือคนอย่างน้อยหนึ่งฝั่ง (opportunities_party)
--                           ดีลเดิมทุกแถวมีบริษัท จึงผ่านเงื่อนไขทันที
-- app.erase_person_history  ลบคนตามคำขอสิทธิ → ประวัติขั้นของดีลที่ถูกลบไปพร้อมคนนั้น (record_versions เพิ่มอย่างเดียว
--                           ผู้ใช้ลบเองไม่ได้ · 0007) ลบในฟังก์ชันนี้ · ดีลที่อยู่ในถังขยะยังเก็บประวัติไว้ · เงื่อนไขเดิมทั้งหมดคงไว้
--
-- รันก่อนโค้ดขึ้นได้: โค้ดเดิมใส่ org_id ทุกครั้งและไม่อ่าน customer_id
-- ต้องตรงกับ ensureSchema() ใน lib/engine/db.ts (npm run verify:schema)
-- ═══════════════════════════════════════════════════════════════

alter table opportunities alter column org_id drop not null;
alter table opportunities add column if not exists customer_id text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'opportunities_party') then
    alter table opportunities add constraint opportunities_party check (org_id is not null or customer_id is not null);
  end if;
end
$$;
create index if not exists ix_opp_customer on opportunities (tenant_id, customer_id) where customer_id is not null;

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
  delete from evidence e
   where e.tenant_id = t and e.ref like 'interaction:%'
     and not exists (select 1 from interactions i where i.tenant_id = t and i.id = substr(e.ref, 13));
  delete from evidence e
   where e.tenant_id = t and e.ref like 'relationship:%'
     and not exists (select 1 from relationship_assertions r where r.tenant_id = t and r.id = substr(e.ref, 14));
  -- 0027: ประวัติของดีลที่ไม่มีแล้ว (ลบพร้อมคน) — ยกเว้นดีลในถังขยะที่ยังกู้คืนได้
  delete from record_versions rv
   where rv.tenant_id = t and rv.record_kind = 'opportunity'
     and not exists (select 1 from opportunities o where o.tenant_id = t and o.id = rv.record_id)
     and not exists (select 1 from trash x where x.tenant_id = t and x.kind = 'deal' and x.record_id = rv.record_id);
end
$$;
