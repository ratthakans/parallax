-- ═══════════════════════════════════════════════════════════════
-- 0005 · เก็บข้อความจากฟอร์มติดต่อลงฐาน
--
-- ฟอร์ม /contact เป็นปลายทางของทุกปุ่ม "ขอทดลองใช้" บนเว็บ แต่ส่งต่อได้ทางเดียว
-- คือ CONTACT_WEBHOOK_URL ซึ่งยังไม่เคยตั้ง ฟอร์มจึงปฏิเสธทุกข้อความ — คนที่สนใจ
-- ไปต่อไม่ได้เลย ตารางนี้ทำให้ทุกข้อความถึงเรา แม้ยังไม่มี webhook
--
-- ไม่ใช่ข้อมูลของร้านใด จึงไม่มี tenant_id และเปิด RLS โดยไม่มี policy เลย —
-- publishable key อ่านหรือเขียนไม่ได้ เขียนได้จากเซิร์ฟเวอร์เท่านั้น
-- อ่านได้จาก Supabase Table Editor หรือสคริปต์ที่ใช้ DATABASE_URL
--
-- ⚠ ต้องตรงกับ ensureSchema() ใน lib/engine/db.ts — npm run verify:schema ตรวจให้
-- ═══════════════════════════════════════════════════════════════

create table if not exists contact_leads (
  id           text primary key,
  received_at  text not null,
  name         text not null,
  company      text not null,
  email        text not null,
  phone        text,
  topic        text,
  cycle        text,
  base_size    text,
  message      text,
  forwarded    integer not null default 0
);
create index if not exists ix_leads_received on contact_leads (received_at);
alter table contact_leads enable row level security;
