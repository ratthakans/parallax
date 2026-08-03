-- ═══════════════════════════════════════════════════════════════
-- PARALLAX — Row Level Security
--
-- เหตุผลที่ย้ายมา Supabase อยู่ในไฟล์นี้ ไม่ใช่ในไฟล์สคีมา
--
-- การแยกบัญชีเคยขึ้นกับความจำของคนเขียน query — ต้องเติม
-- AND tenant_id = ? เองทุกครั้ง ใน .prepare() ทั้ง 113 จุด
-- และมันหลุดไปแล้วสองครั้ง:
--
--   commitImport            DELETE FROM <table> ไม่มี WHERE เลย
--                           กด "แทนที่ข้อมูล" แล้วลบของทุกบัญชี
--   sendCampaign            SELECT * FROM campaigns WHERE id = ?
--   measureCampaign         ยิง POST พร้อม id ของบัญชีอื่นแล้วสั่งส่ง
--                           ข้อความและตัดเครดิตของบัญชีนั้นได้
--
-- ทั้งสองครั้งมองไม่เห็นจากหน้าจอ เพราะทุกฟอร์มส่งค่าที่ถูกอยู่แล้ว
--
-- ต่อจากนี้ ลืมเติมเงื่อนไข = ได้ศูนย์แถว ไม่ใช่ได้ข้อมูลของคนอื่น
-- ═══════════════════════════════════════════════════════════════

-- ── ⚠ ข้อบังคับข้อเดียวที่ทำให้ไฟล์นี้มีความหมาย ──────────────
--
-- service_role ข้าม RLS ทั้งหมดตามการออกแบบของ Postgres
-- (ตาราง owner ไม่โดน RLS เว้นแต่สั่ง FORCE)
--
-- ถ้าฝั่งเซิร์ฟเวอร์ต่อฐานด้วย service key เพื่อความสะดวก นโยบายทุกข้อ
-- ข้างล่างนี้จะไม่ทำงานเลยแม้แต่ข้อเดียว และเรากลับไปอยู่ที่เดิม
-- คือหวังว่าคนเขียนจะจำเติม WHERE
--
-- คำขอที่มาจากผู้ใช้ต้องต่อด้วย token ของผู้ใช้เสมอ
-- service key ใช้ได้เฉพาะงานเบื้องหลังที่ไม่มีผู้ใช้อยู่ตรงนั้น —
-- รอบคำนวณ feature · รอบวัดผล · การนำเข้าข้อมูลตั้งต้น
-- ─────────────────────────────────────────────────────────────

create schema if not exists app;

/* บัญชีที่ผู้ใช้คนนี้แตะได้ อ่านครั้งเดียวต่อ query ไม่ใช่ต่อแถว

   security definer เพราะตัว tenant_users เองก็เปิด RLS อยู่ —
   ถ้าไม่ประกาศ ฟังก์ชันจะอ่านตารางนั้นไม่ได้และทุกนโยบายจะคืนเท็จ */
create or replace function app.user_tenants()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from tenant_users where user_id = (select auth.uid())
$$;

create or replace function app.has_tenant(t text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from tenant_users
     where user_id = (select auth.uid()) and tenant_id = t
  )
$$;

/* เขียนได้เฉพาะ owner กับ operator — viewer อ่านอย่างเดียว
   ใช้กับตารางที่หน้าจอเขียนได้จริง ส่วนข้อมูลดิบของลูกค้าเข้าทาง
   การนำเข้าซึ่งวิ่งด้วย service role อยู่แล้ว */
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
       and role in ('owner', 'operator')
  )
$$;

-- ═══════════════════════════════════════════════════════════════
-- เปิด RLS ทุกตาราง แล้วค่อยเปิดช่องทีละอย่าง
--
-- ตารางที่เปิด RLS แต่ไม่มีนโยบาย = ปฏิเสธทุกอย่าง ซึ่งเป็นค่าตั้งต้น
-- ที่ถูกต้อง ลืมเขียนนโยบายแล้วหน้าจอว่าง ดีกว่าลืมแล้วข้อมูลรั่ว
-- ═══════════════════════════════════════════════════════════════

do $$
declare
  t text;
  tenant_scoped text[] := array[
    'customers', 'identities', 'products', 'transactions', 'line_items',
    'memberships', 'consents', 'events', 'customer_features',
    'tenant_plays', 'campaigns', 'campaign_audience', 'messages',
    'attributions', 'credit_purchases', 'brief_opens', 'activity_log'
  ];
begin
  foreach t in array tenant_scoped loop
    execute format('alter table %I enable row level security', t);

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

-- ── tenants — เห็นเฉพาะบัญชีตัวเอง แก้เพดานได้เฉพาะ owner ──
--
-- เพดานพวกนี้ (ช่วงห้ามส่ง · จำนวนข้อความต่อคนต่อสัปดาห์ · เพดานส่วนลด)
-- คือสิ่งที่กันไม่ให้ร้านถูกปิดกั้น operator จึงไม่ควรแก้ได้เอง
alter table tenants enable row level security;

create policy tenants_read on tenants
  for select using (id in (select app.user_tenants()));

create policy tenants_update on tenants
  for update
  using (
    exists (
      select 1 from tenant_users
       where user_id = (select auth.uid())
         and tenant_id = tenants.id
         and role = 'owner'
    )
  )
  with check (
    exists (
      select 1 from tenant_users
       where user_id = (select auth.uid())
         and tenant_id = tenants.id
         and role = 'owner'
    )
  );

-- ── tenant_users — เห็นรายชื่อเพื่อนร่วมบัญชี แก้ได้เฉพาะ owner ──
alter table tenant_users enable row level security;

create policy tu_read on tenant_users
  for select using (tenant_id in (select app.user_tenants()));

/* ── นโยบายบน tenant_users ห้ามอ่าน tenant_users ตรง ๆ ──

   เดิม tu_manage เขียนว่า `exists (select 1 from tenant_users me ...)`
   ซึ่งดูสมเหตุสมผลแต่วนไม่รู้จบ: subquery นั้นโดน RLS ของ tenant_users
   เอง ซึ่งเรียก tu_manage อีกรอบ Postgres ตอบ 42P17 "infinite recursion
   detected in policy for relation"

   มันไม่โผล่ตอนเขียน ตอน migrate หรือตอน typecheck — โผล่ตอนผู้ใช้จริง
   คนแรกเปิดหน้าแรก

   ทางแก้เหมือน user_tenants(): security definer ทำให้ฟังก์ชันรันในนาม
   เจ้าของตาราง ซึ่งไม่โดน RLS จึงอ่านได้โดยไม่วนกลับ */
create or replace function app.is_owner_of(t text)
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
       and role = 'owner'
  )
$$;

create policy tu_manage on tenant_users
  for all
  using (app.is_owner_of(tenant_id))
  with check (app.is_owner_of(tenant_id));

-- ── play_performance — มุมที่สาม อ่านได้ทุกคน เขียนได้เฉพาะเบื้องหลัง ──
--
-- ไม่มี tenant_id โดยตั้งใจ (§7) เก็บสถิติรวมล้วน ไม่มีแถวลูกค้า
-- ร้านใหม่จึงได้ค่าคาดการณ์ที่เรียนจากร้านอื่นตั้งแต่แคมเปญแรก
-- การอัปเดตเกิดตอนวัดผลซึ่งวิ่งด้วย service role จึงไม่มีนโยบายเขียน
alter table play_performance enable row level security;

create policy pp_read on play_performance
  for select to authenticated using (true);

-- ── ai_cache — คีย์เป็น hash ของอินพุต ไม่ผูกกับบัญชี ──
-- ข้อความที่โมเดลเขียนอาจมีบริบทของร้าน จึงไม่เปิดให้ผู้ใช้อ่านตรง ๆ
-- ให้ผ่านฝั่งเซิร์ฟเวอร์เท่านั้น: เปิด RLS แล้วไม่ประกาศนโยบายใด ๆ
alter table ai_cache enable row level security;

-- ═══════════════════════════════════════════════════════════════
-- ผู้ใช้ใหม่ยังไม่มีบัญชี — ต้องมีคนเชิญเข้ามา
--
-- ตั้งใจไม่สร้าง tenant ให้อัตโนมัติตอนสมัคร เพราะบัญชีที่นี่คือ
-- องค์กรที่มีสัญญาและมีข้อมูลลูกค้าจริง ไม่ใช่ workspace ส่วนตัว
-- ที่ใครสมัครก็ได้ คนแรกของแต่ละบัญชีจึงถูกใส่ด้วย service role
-- แล้ว owner ค่อยเชิญคนที่เหลือผ่าน tenant_users
-- ═══════════════════════════════════════════════════════════════
