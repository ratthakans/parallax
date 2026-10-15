-- ═══════════════════════════════════════════════════════════════
-- 0013 · แม่แบบวัตถุประสงค์และขอบเขตของฐาน (docs/solo-plan.md S4)
--
-- purposes.template_code/template_version
--     วัตถุประสงค์นี้สร้างจากแม่แบบไหน รุ่นอะไร — ตัวแม่แบบอยู่ในโค้ด (lib/shared/purpose-templates.ts)
--     ไม่ใช่ในฐาน เพื่อให้ทุกการแก้ข้อความทางกฎหมายผ่าน PR และมีประวัติใน git
-- processing_records.employer_scoped
--     ฐานนี้ผูกกับความสัมพันธ์ทางธุรกิจกับบริษัทที่เขาสังกัด — ย้ายบริษัทแล้วต้องตรวจใหม่
-- processing_records.allowed_channels / allowed_message_kinds
--     ขอบเขตช่องทางและชนิดข้อความของฐานรุ่นนี้ (JSON array) · null = ไม่จำกัด (ฐานที่ตั้งเองก่อนมีแม่แบบ)
--
-- ต้องตรงกับ ensureSchema() ใน lib/engine/db.ts (npm run verify:schema)
-- ═══════════════════════════════════════════════════════════════

alter table purposes add column if not exists template_code text;
alter table purposes add column if not exists template_version integer;
alter table processing_records add column if not exists employer_scoped integer not null default 0;
alter table processing_records add column if not exists allowed_channels text;
alter table processing_records add column if not exists allowed_message_kinds text;
