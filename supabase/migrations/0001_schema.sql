-- ═══════════════════════════════════════════════════════════════
-- PARALLAX — สคีมา Postgres สำหรับ Supabase
--
-- แปลจาก lib/db.ts (node:sqlite) โดยมีความต่างที่ตั้งใจสามข้อ
-- อธิบายไว้ตรงจุดที่มันเกิด อย่าเปลี่ยนกลับโดยไม่อ่านเหตุผลก่อน
-- ═══════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── เวลาเก็บเป็น text ไม่ใช่ timestamptz ────────────────────────
--
-- ทั้งระบบเก็บเวลาเป็นสตริง ISO-8601 UTC และโค้ดอ่านมันด้วย
-- Date.parse() กับเปรียบเทียบด้วย >= ตรง ๆ อยู่แล้ว
--
-- ISO-8601 UTC เรียงตามตัวอักษรได้ผลเท่ากับเรียงตามเวลา ดัชนี btree
-- บน text จึงยังทำ range scan ได้ตามปกติ
--
-- ถ้าเปลี่ยนเป็น timestamptz ตอนนี้ ไดรเวอร์จะคืนอ็อบเจกต์ Date กลับมา
-- แล้ว Date.parse(row.approved_at) จะพังทุกจุดพร้อมกัน — เป็นการเปลี่ยน
-- ความหมายของเวลาไปพร้อมกับการย้ายฐานข้อมูล ซึ่งคูณความเสี่ยงเข้าด้วยกัน
-- แยกทำทีหลังเมื่อการย้ายนิ่งแล้ว

-- ═══════════════════════════════════════════════════════════════
-- ผู้ใช้ ↔ บัญชี
-- ═══════════════════════════════════════════════════════════════

create table if not exists tenants (
  id                    text primary key,
  name                  text not null,
  cycle_shape           text not null,
  tier                  text not null default 'growth',
  created_at            text not null,
  max_messages_per_week integer not null default 2,
  quiet_hours_start     integer not null default 21,
  quiet_hours_end       integer not null default 9,
  max_discount_pct      integer not null default 20,
  message_credits       integer not null default 2000,
  billing_day           integer not null default 1
);

/* ตารางนี้ไม่ใช่ memberships

   memberships ในระบบนี้หมายถึงสมาชิกภาพของ "ลูกค้าของร้าน" (บัตรสมาชิก
   สนามกอล์ฟ · สมาชิกพรรค) ซึ่งมีอยู่แล้วข้างล่าง คนละเรื่องกับสิทธิ์
   ของคนที่ล็อกอินเข้าคอนโซล ถ้าตั้งชื่อซ้ำกันจะสับสนถาวร */
create table if not exists tenant_users (
  user_id    uuid not null references auth.users (id) on delete cascade,
  tenant_id  text not null references tenants (id) on delete cascade,
  role       text not null default 'operator',   -- owner | operator | viewer
  created_at timestamptz not null default now(),
  primary key (user_id, tenant_id)
);
create index if not exists ix_tenant_users_tenant on tenant_users (tenant_id);

-- ═══════════════════════════════════════════════════════════════
-- ฐานลูกค้า
--
-- ── tenant_id อยู่ทุกตาราง แม้จะรู้ได้จากการ join ──
--
-- เดิมมีเก้าตารางที่ไม่มี tenant_id เลย (identities · transactions ·
-- line_items · memberships · consents · events · campaign_audience ·
-- messages · attributions) การแยกบัญชีจึงต้องไล่ join ขึ้นไปหาเจ้าของ
-- และในโค้ดแปลว่าทุก query ต้องจำเติม AND tenant_id = ? เอง
--
-- ลืมเติมไปแล้วสองครั้งจริง ๆ: commitImport ลบข้อมูลทุกบัญชี และ
-- sendCampaign/measureCampaign สั่งงานแคมเปญของบัญชีอื่นได้
--
-- ใส่ tenant_id ลงทุกตารางแล้ว RLS ข้างล่างจึงเป็นการเทียบค่าตรง ๆ
-- ไม่ใช่ EXISTS ที่ไล่ join ขึ้นไปทีละชั้น — ทั้งเร็วกว่าและอ่านออกว่า
-- มันกันอะไรอยู่ ค่าที่จ่ายคือคอลัมน์ที่ซ้ำกับที่ join ได้ ซึ่งถูกกว่า
-- การเผลอทำข้อมูลรั่วข้ามบัญชีมาก
-- ═══════════════════════════════════════════════════════════════

create table if not exists customers (
  id         text primary key,
  tenant_id  text not null references tenants (id) on delete cascade,
  name       text not null,
  created_at text not null
);
create index if not exists ix_customers_tenant on customers (tenant_id);

-- ตัวระบุถูก hash ก่อนเก็บ ไม่มีเบอร์หรืออีเมลดิบในระบบ
create table if not exists identities (
  tenant_id   text not null references tenants (id) on delete cascade,
  customer_id text not null references customers (id) on delete cascade,
  type        text not null,
  value_hash  text not null,
  primary key (customer_id, type)
);
create index if not exists ix_identities_tenant on identities (tenant_id);
create index if not exists ix_identities_hash on identities (tenant_id, type, value_hash);

create table if not exists products (
  id             text primary key,
  tenant_id      text not null references tenants (id) on delete cascade,
  name           text not null,
  category       text not null,
  group_role     text not null,
  list_price     double precision not null,
  is_new_arrival integer not null default 0,
  is_dead_stock  integer not null default 0
);
create index if not exists ix_products_tenant on products (tenant_id);

create table if not exists transactions (
  id             text primary key,
  tenant_id      text not null references tenants (id) on delete cascade,
  customer_id    text not null references customers (id) on delete cascade,
  occurred_at    text not null,
  total          double precision not null,
  discount_total double precision not null default 0,
  channel        text not null
);
create index if not exists ix_txn_customer on transactions (customer_id, occurred_at);
create index if not exists ix_txn_tenant on transactions (tenant_id, occurred_at);

create table if not exists line_items (
  tenant_id        text not null references tenants (id) on delete cascade,
  txn_id           text not null references transactions (id) on delete cascade,
  product_id       text not null references products (id) on delete cascade,
  qty              integer not null,
  unit_price       double precision not null,
  unit_list_price  double precision not null
);
create index if not exists ix_li_txn on line_items (txn_id);
create index if not exists ix_li_tenant on line_items (tenant_id);

-- สมาชิกภาพของลูกค้าร้าน ไม่ใช่สิทธิ์ผู้ใช้คอนโซล (ดู tenant_users)
create table if not exists memberships (
  tenant_id   text not null references tenants (id) on delete cascade,
  customer_id text not null references customers (id) on delete cascade,
  kind        text not null,
  started_at  text not null,
  expires_at  text
);
create index if not exists ix_memberships_tenant on memberships (tenant_id);

create table if not exists consents (
  tenant_id   text not null references tenants (id) on delete cascade,
  customer_id text not null references customers (id) on delete cascade,
  purpose     text not null,
  granted_at  text,
  revoked_at  text,
  source      text not null,
  primary key (customer_id, purpose)
);
create index if not exists ix_consents_tenant on consents (tenant_id);

create table if not exists events (
  tenant_id   text not null references tenants (id) on delete cascade,
  customer_id text not null references customers (id) on delete cascade,
  type        text not null,
  occurred_at text not null,
  meta        text
);
create index if not exists ix_events_customer on events (customer_id, type);
create index if not exists ix_events_tenant on events (tenant_id);

-- คำนวณล่วงหน้าเป็นรอบ ห้ามคำนวณสดตอนเปิดหน้า
create table if not exists customer_features (
  customer_id text primary key references customers (id) on delete cascade,
  tenant_id   text not null references tenants (id) on delete cascade,
  computed_at text not null,
  payload     jsonb not null
);
create index if not exists ix_cf_tenant on customer_features (tenant_id);

-- ═══════════════════════════════════════════════════════════════
-- เครื่องยนต์
-- ═══════════════════════════════════════════════════════════════

create table if not exists tenant_plays (
  tenant_id        text not null references tenants (id) on delete cascade,
  play_id          text not null,
  enabled          integer not null default 1,
  min_audience     integer,
  cooldown_days    integer,
  max_discount_pct integer,
  primary key (tenant_id, play_id)
);

create table if not exists campaigns (
  id             text primary key,
  tenant_id      text not null references tenants (id) on delete cascade,
  play_id        text not null,
  status         text not null,
  approved_by    text,
  approved_at    text not null,
  copy_snapshot  jsonb not null,
  offer_snapshot jsonb not null,
  holdout_pct    integer not null,
  measurement    text not null,
  audience_size  integer not null,
  treated_size   integer not null,
  holdout_size   integer not null,
  dry_run        integer not null default 0,
  est_cost       double precision not null default 0
);
create index if not exists ix_camp_tenant on campaigns (tenant_id, approved_at);

-- audience ถูกแช่แข็งตอนอนุมัติ (H1) — ห้ามคำนวณใหม่ตอนส่ง
create table if not exists campaign_audience (
  tenant_id   text not null references tenants (id) on delete cascade,
  campaign_id text not null references campaigns (id) on delete cascade,
  customer_id text not null references customers (id) on delete cascade,
  arm         text not null,
  primary key (campaign_id, customer_id)
);
create index if not exists ix_ca_tenant on campaign_audience (tenant_id);

-- idempotency key ระดับ (campaign_id, customer_id) — retry ไม่ส่งซ้ำ (F12)
create table if not exists messages (
  tenant_id   text not null references tenants (id) on delete cascade,
  campaign_id text not null references campaigns (id) on delete cascade,
  customer_id text not null references customers (id) on delete cascade,
  channel     text not null,
  status      text not null,
  cost        double precision not null default 0,
  sent_at     text,
  primary key (campaign_id, customer_id)
);
create index if not exists ix_messages_tenant on messages (tenant_id);

create table if not exists attributions (
  tenant_id    text not null references tenants (id) on delete cascade,
  campaign_id  text not null references campaigns (id) on delete cascade,
  horizon_days integer not null,
  rph_treated  double precision not null,
  rph_holdout  double precision not null,
  lift_abs     double precision not null,
  lift_pct     double precision not null,
  /* ช่วงความเชื่อมั่นเป็น null ได้ ต่างจาก SQLite ที่บังคับ not null

     แคมเปญที่เล็กเกินกว่าจะกันกลุ่มควบคุมได้วัดด้วยวิธี time-shift
     ค่าความคลาดเคลื่อนมาตรฐานเป็นอนันต์ตามนิยาม ของเดิมจึงเก็บ
     ±Infinity ลงคอลัมน์ REAL แล้วหน้าจอพิมพ์ออกมาว่า
     "95% CI -Infinity to Infinity%" — ค่าที่ไม่มีอยู่ต้องเป็น null
     ไม่ใช่สัญลักษณ์อนันต์ที่รอให้เผลอเอาไปหาค่าเฉลี่ย */
  ci_low       double precision,
  ci_high      double precision,
  verdict      text not null,
  measured_at  text not null,
  matured      integer not null default 0,
  primary key (campaign_id, horizon_days)
);
create index if not exists ix_attr_tenant on attributions (tenant_id);

create table if not exists credit_purchases (
  id        bigint generated always as identity primary key,
  tenant_id text not null references tenants (id) on delete cascade,
  at        text not null,
  messages  integer not null,
  baht      double precision not null,
  kind      text not null           -- welcome | pack
);
create index if not exists ix_credit_tenant on credit_purchases (tenant_id, at);

create table if not exists brief_opens (
  tenant_id text not null references tenants (id) on delete cascade,
  opened_on text not null,
  primary key (tenant_id, opened_on)
);

create table if not exists activity_log (
  id        bigint generated always as identity primary key,
  tenant_id text not null references tenants (id) on delete cascade,
  actor     text not null,
  action    text not null,
  detail    text,
  at        text not null
);
create index if not exists ix_activity_tenant on activity_log (tenant_id, at desc);

/* ── มุมที่สาม — ตารางเดียวที่ข้ามบัญชีโดยตั้งใจ (§7) ──

   เก็บเฉพาะสถิติรวมของ play ต่อรูปทรงวงจร ไม่มีแถวลูกค้าและไม่มี
   tenant_id ร้านใหม่จึงเริ่มด้วยค่าคาดการณ์ที่เรียนจากร้านอื่นได้
   ตั้งแต่แคมเปญแรก โดยไม่มีข้อมูลบุคคลออกจากบัญชีไหนเลย

   RLS ของตารางนี้จึงต่างจากทุกตาราง: อ่านได้ทุกคนที่ล็อกอิน เขียนได้
   เฉพาะ service role เพราะการอัปเดตเกิดตอนวัดผล ไม่ใช่จากหน้าจอ */
create table if not exists play_performance (
  play_id         text not null,
  cycle_shape     text not null,
  size_bucket     text not null,
  trials          integer not null default 0,
  successes       integer not null default 0,
  posterior_alpha double precision not null default 1,
  posterior_beta  double precision not null default 1,
  primary key (play_id, cycle_shape, size_bucket)
);

-- แคชข้อความที่โมเดลเขียน — คีย์เป็น hash ของอินพุต ไม่ผูกกับบัญชี
create table if not exists ai_cache (
  key        text primary key,
  kind       text not null,
  value      jsonb not null,
  created_at text not null
);
