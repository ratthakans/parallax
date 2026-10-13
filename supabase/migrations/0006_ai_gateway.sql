-- ═══════════════════════════════════════════════════════════════
-- 0006 · AI gateway — สถานะการชำระต่อบัญชี และบันทึกการเรียก AI
--
-- docs/plan.md หัวข้อ 9.2 · เจ้าของ 2026-10-13: "ปิด AI บัญชีใหม่ จนกว่าจะเคลียร์ตัง"
--
-- tenant_billing แยกจาก tenants โดยตั้งใจ: นโยบาย tenants_update (0002) ให้เจ้าของร้าน
-- แก้แถวของตัวเองได้ ถ้าสถานะการชำระอยู่ในนั้น เขาจะกดเปิด AI ให้ตัวเองได้
-- ตารางนี้มีแต่นโยบายอ่าน — เขียนได้จากฝั่งระบบ (DATABASE_URL นอกตัวตนผู้ใช้) เท่านั้น
--
-- ai_ledger ผู้ใช้เพิ่มแถวได้ (การเรียก AI เกิดในคำขอของเขา) แต่ไม่มีนโยบาย update/delete
-- จึงแก้ย้อนหลังไม่ได้ · ไม่เก็บ prompt หรือคำตอบ
--
-- ⚠ ต้องตรงกับ ensureSchema() ใน lib/engine/db.ts — npm run verify:schema ตรวจให้
-- ═══════════════════════════════════════════════════════════════

create table if not exists tenant_billing (
  tenant_id   text primary key references tenants (id) on delete cascade,
  state       text not null default 'demo'
              check (state in ('demo', 'trial_audit', 'awaiting_payment', 'paid', 'suspended')),
  is_customer integer not null default 0,
  updated_at  text not null,
  updated_by  text not null
);
alter table tenant_billing enable row level security;
create policy tenant_billing_read on tenant_billing
  for select using (tenant_id in (select app.user_tenants()));

-- บัญชีเดโมสังเคราะห์ที่ยังอยู่ในทะเบียน (lib/shared/tenants.ts) — บัญชีพรรคไม่ได้แถว จึงปิด AI
insert into tenant_billing (tenant_id, state, is_customer, updated_at, updated_by)
select id, 'demo', 0, to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'migration-0006'
  from tenants
 where id in ('mst-golf', 'hongmove', 'brc-golf')
on conflict (tenant_id) do nothing;

create table if not exists ai_ledger (
  id                bigint generated always as identity primary key,
  tenant_id         text not null references tenants (id) on delete cascade,
  at                text not null,
  provider          text not null,
  kind              text not null,
  model             text not null,
  served_model      text,
  outcome           text not null,
  input_tokens      integer not null default 0,
  output_tokens     integer not null default 0,
  cache_read_tokens integer not null default 0
);
create index if not exists ix_ai_ledger_tenant on ai_ledger (tenant_id, at);
alter table ai_ledger enable row level security;
create policy ai_ledger_read on ai_ledger
  for select using (tenant_id in (select app.user_tenants()));
create policy ai_ledger_insert on ai_ledger
  for insert with check (tenant_id in (select app.user_tenants()));

-- Supabase ให้สิทธิ์ตารางใหม่ใน public แก่ authenticated อยู่แล้ว — เขียนไว้ชัดเผื่อค่าตั้งต้นถูกเปลี่ยน (แบบ 0003)
-- tenant_billing ให้แค่ select: การเขียนเกิดนอกตัวตนผู้ใช้เท่านั้น
grant select on tenant_billing to authenticated;
revoke insert, update, delete on tenant_billing from authenticated;
grant select, insert on ai_ledger to authenticated;
revoke update, delete on ai_ledger from authenticated;
