-- ═══════════════════════════════════════════════════════════════
-- 0026 · โหมดลูกค้าของบัญชี (docs/crm-plan.md F1)
--
-- เพิ่มอย่างเดียว — รันก่อนโค้ดขึ้นได้ ไม่กระทบของเดิม
--
-- tenants.customer_mode   b2b · b2c · hybrid — ค่าตั้งต้นของหน้าจอ (คำเรียก · ฟอร์ม · เมนู) ไม่ใช่กำแพงข้อมูล
--                         แก้ได้เฉพาะเจ้าของบัญชี (นโยบาย tenants_update เดิม · 0002)
--                         บัญชีเดิมทั้งหมดได้ b2b ยกเว้นเดโมค้าปลีก (ร้านกอล์ฟ · แท็กซี่ EV) = b2c — หน้าจอเหมือนเดิมทุกบัญชี
--
-- ต้องตรงกับ ensureSchema() ใน lib/engine/db.ts (npm run verify:schema)
-- ═══════════════════════════════════════════════════════════════

alter table tenants add column if not exists customer_mode text not null default 'b2b'
  check (customer_mode in ('b2b', 'b2c', 'hybrid'));

update tenants set customer_mode = 'b2c' where id in ('mst-golf', 'hongmove', 'brc-golf');
