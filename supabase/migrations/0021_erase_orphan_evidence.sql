-- ═══════════════════════════════════════════════════════════════
-- 0021 · ลบคนตามคำขอสิทธิ = ลบหลักฐานที่ผูกกับปฏิสัมพันธ์และความสัมพันธ์ของเขาด้วย
--
-- evidence ของโน้ตหลังพบลูกค้า (ref 'interaction:<id>' · S6) และของความสัมพันธ์ (ref 'relationship:<id>')
-- ถูกทิ้งค้างหลังลบคน เพราะ erase_person_history (0011) ลบแค่หลักฐานของ preferences
-- deletePersonData ลบปฏิสัมพันธ์และความสัมพันธ์ไปก่อนแล้ว — ที่นี่ลบหลักฐานที่ไม่มีเจ้าของเหลือ (เฉพาะบัญชีนั้น)
-- evidence ถอนสิทธิ์ DELETE จากผู้ใช้ (0007) จึงต้องลบในฟังก์ชันนี้ · เงื่อนไขเดิมทั้งหมดคงไว้
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
  delete from evidence e
   where e.tenant_id = t and e.ref like 'interaction:%'
     and not exists (select 1 from interactions i where i.tenant_id = t and i.id = substr(e.ref, 13));
  delete from evidence e
   where e.tenant_id = t and e.ref like 'relationship:%'
     and not exists (select 1 from relationship_assertions r where r.tenant_id = t and r.id = substr(e.ref, 14));
end
$$;
