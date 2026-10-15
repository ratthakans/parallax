import { all, exec, run, usingPostgres } from "@/lib/engine/sql";
import { TENANT_PROFILES } from "@/lib/shared/tenants";
import { appendAudit } from "@/lib/engine/audit";

/* ── ชั้นเก็บข้อมูล ────────────────────────────────────────────
   schema ตรงตาม Play Engine §5 · §6 · §7

   ใช้ node:sqlite ที่มากับ Node 22+ จึงไม่มี native dependency
   ทุกการเข้าถึงผ่านไฟล์นี้เท่านั้น — เปลี่ยนไป Postgres ตอนขึ้น
   production แก้ที่ไฟล์เดียว
   ───────────────────────────────────────────────────────────── */

/* ── ที่อยู่ของไฟล์ฐานข้อมูล ────────────────────────────────────

   บนเครื่องพัฒนาเขียนลง .data/ ข้างโปรเจกต์ ซึ่งอยู่รอดข้ามการรีสตาร์ต

   บน Vercel ระบบไฟล์อ่านได้อย่างเดียว ยกเว้น /tmp และ /tmp เป็นของ
   instance ใครของมัน หายทุกครั้งที่คอนเทนเนอร์เย็น การเขียนลง cwd
   จะพังทันทีที่สร้างไฟล์ จึงย้ายไป /tmp โดยอัตโนมัติ

   ผลที่ตามมาต้องพูดให้ชัด: ที่นั่นนี่คือ "เดโมที่รีเซ็ตตัวเอง" ไม่ใช่
   ฐานข้อมูลจริง — อนุมัติแคมเปญแล้วปิดไปสักพัก ของที่กดจะหายไป
   ชุดข้อมูลสร้างแบบกำหนดผลตายตัว ทุกครั้งที่เกิดใหม่จึงได้ตัวเลขชุดเดิม
   (ราว 4 วินาที · 88 MB ต่อการเกิดหนึ่งครั้ง)

   ก่อนรับข้อมูลลูกค้าจริง ต้องเปลี่ยนชั้นนี้เป็นฐานข้อมูลที่มีสถานะจริง
   ทุกการเข้าถึงผ่านไฟล์นี้เท่านั้น จุดที่ต้องแก้จึงอยู่ที่เดียว */
/* ── สคีมาฝั่ง sqlite ──────────────────────────────────────────

   เดิม db() สร้างตารางให้เองตอนเปิดคอนเนกชันครั้งแรก พอ db() หายไป
   จึงไม่มีอะไรสร้างตารางอีกเลย และทุกคำสั่งได้ "no such table"

   ตอนนี้ ensureReady() เรียกที่นี่ก่อนแตะข้อมูลใด ๆ
   ฝั่ง Postgres สคีมาเป็นของ supabase/migrations/ จึงข้าม */
export async function ensureSchema(): Promise<void> {
  if (usingPostgres()) return;

  await exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      cycle_shape TEXT NOT NULL,
      tier TEXT NOT NULL DEFAULT 'growth',
      created_at TEXT NOT NULL,
      -- เพดานที่ตั้งไว้เสมอ (blueprint §11)
      max_messages_per_week INTEGER NOT NULL DEFAULT 2,
      quiet_hours_start INTEGER NOT NULL DEFAULT 21,
      quiet_hours_end INTEGER NOT NULL DEFAULT 9,
      max_discount_pct INTEGER NOT NULL DEFAULT 20,
      message_credits INTEGER NOT NULL DEFAULT 2000,
      -- วันที่รอบบิลตัดในแต่ละเดือน (1–28) — รอบบิลจึงคำนวณได้จากปฏิทิน
      -- ไม่ต้องมีสถานะ "รอบปัจจุบัน" ที่ต้องรีเซ็ตด้วย cron และเพี้ยนได้
      billing_day INTEGER NOT NULL DEFAULT 1
    );

    -- เครดิตข้อความจ่ายล่วงหน้า ค่าสมาชิกไม่รวมค่าข้อความ (lib/plans.ts)
    -- เก็บทุกครั้งที่ยอดเครดิตเพิ่ม เพื่อให้ใบแจ้งค่าใช้จ่ายอธิบายที่มาได้
    CREATE TABLE IF NOT EXISTS credit_purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT NOT NULL,
      at TEXT NOT NULL,
      messages INTEGER NOT NULL,
      baht REAL NOT NULL,
      kind TEXT NOT NULL           -- welcome | pack
    );
    CREATE INDEX IF NOT EXISTS ix_credit_tenant ON credit_purchases(tenant_id, at);

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_customers_tenant ON customers(tenant_id);

    -- ตัวระบุถูก hash ก่อนเก็บ ไม่มีเบอร์หรืออีเมลดิบในระบบ
    /* ── ใครเข้าถึงบัญชีไหนได้ ──
       ฝั่ง Postgres นี่คือตารางที่ RLS ทั้งหมดตั้งอยู่บน (app.user_tenants())
       ฝั่ง sqlite ยังไม่มีใครอ่าน แต่ต้องมีอยู่ให้สคีมาสองฝั่งตรงกัน
       ไม่งั้นความต่างจะกลับมาเป็นเรื่องที่ค่อยไปเจอตอนสลับตัวขับ

       ชื่อ tenant_users ไม่ใช่ memberships เพราะ memberships ถูกใช้ไปแล้ว
       กับสมาชิกภาพของลูกค้าร้าน ซึ่งเป็นคนละเรื่องกันคนละชั้น */
    /* ── แคชผลของงาน AI ──
       lib/engine/ai.ts สร้างตารางนี้เองด้วย (ensureCache) เพราะเรียกได้
       ก่อนที่ใครจะแตะ db() แต่ต้องประกาศที่นี่ด้วย ไม่งั้นสคีมา sqlite
       ที่ประกาศไว้จะไม่ครบ และตัวตรวจความตรงกันจะเห็นเป็นช่องว่างจริง

       DDL เหมือนกันทั้งสองที่และ idempotent จึงชนกันไม่ได้ */
    CREATE TABLE IF NOT EXISTS ai_cache (
      key TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      payload TEXT NOT NULL,
      model TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tenant_users (
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      created_at TEXT NOT NULL,
      PRIMARY KEY (tenant_id, user_id)
    );

    /* ฐานบนเครื่องพัฒนาที่สร้างก่อน 2026-10-11 ยังมีตาราง identities อยู่
       CREATE TABLE IF NOT EXISTS ไม่ลบของเดิม จึงต้องลบเองให้ตรงกับ
       supabase/migrations/0004_drop_identities.sql */
    DROP TABLE IF EXISTS identities;

    /* ── ตัวระบุและช่องทางติดต่อทุกช่องทางของลูกค้า ──
       หนึ่งคนมีได้หลายเบอร์ หลายอีเมล หลายที่อยู่ รวมรหัสสมาชิก
       แทนตาราง identities เดิม ซึ่ง hash ค่าเดียวกันซ้ำกับตารางนี้ทุกตัว
       value_enc เข้ารหัสด้วย lib/engine/pii.ts · value_hmac ใช้จับคู่และตรวจซ้ำ */
    CREATE TABLE IF NOT EXISTS contact_points (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      label TEXT,
      value_enc TEXT NOT NULL,
      value_hmac TEXT NOT NULL,
      value_masked TEXT NOT NULL,
      is_primary INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (customer_id, kind, value_hmac)
    );
    CREATE INDEX IF NOT EXISTS ix_cp_tenant ON contact_points (tenant_id);
    CREATE INDEX IF NOT EXISTS ix_cp_match ON contact_points (tenant_id, kind, value_hmac);

    /* ── ข้อมูลประวัติของลูกค้า ──
       แยกจาก customers เพื่อให้ฐาน sqlite ที่มีอยู่แล้วได้ตารางนี้ด้วย
       CREATE TABLE IF NOT EXISTS โดยไม่ต้อง ALTER ตารางเดิม

       ⚠ ไม่มีฟิลด์ข้อมูลอ่อนไหวตาม PDPA มาตรา 26 โดยตั้งใจ — ศาสนา เชื้อชาติ
       สุขภาพ ความคิดเห็นทางการเมือง ประวัติอาชญากรรม ข้อมูลชีวภาพ ฯลฯ
       และไม่มีเลขบัตรประชาชน ซึ่ง CRM ไม่จำเป็นต้องใช้ */
    CREATE TABLE IF NOT EXISTS contact_profiles (
      customer_id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      first_name TEXT,
      last_name TEXT,
      nickname TEXT,
      gender TEXT,
      birthday TEXT,
      company TEXT,
      job_title TEXT,
      subdistrict TEXT,
      district TEXT,
      province TEXT,
      postcode TEXT,
      note TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_cprof_tenant ON contact_profiles (tenant_id);

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      group_role TEXT NOT NULL,
      list_price REAL NOT NULL,
      is_new_arrival INTEGER NOT NULL DEFAULT 0,
      is_dead_stock INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      total REAL NOT NULL,
      discount_total REAL NOT NULL DEFAULT 0,
      channel TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_txn_customer ON transactions(customer_id, occurred_at);

    CREATE TABLE IF NOT EXISTS line_items (
      txn_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      qty INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      unit_list_price REAL NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_li_txn ON line_items(txn_id);

    CREATE TABLE IF NOT EXISTS memberships (
      customer_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      started_at TEXT NOT NULL,
      expires_at TEXT
    );

    CREATE TABLE IF NOT EXISTS consents (
      customer_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      purpose TEXT NOT NULL,
      granted_at TEXT,
      revoked_at TEXT,
      source TEXT NOT NULL,
      PRIMARY KEY (customer_id, purpose)
    );

    CREATE TABLE IF NOT EXISTS events (
      customer_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      type TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      meta TEXT
    );
    CREATE INDEX IF NOT EXISTS ix_events_customer ON events(customer_id, type);

    -- คำนวณล่วงหน้าทุกคืน ห้ามคำนวณสดตอนเปิดหน้า
    CREATE TABLE IF NOT EXISTS customer_features (
      customer_id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      computed_at TEXT NOT NULL,
      payload TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_cf_tenant ON customer_features(tenant_id);

    -- play เป็นแถวในตาราง ไม่ใช่ตรรกะในโค้ด
    CREATE TABLE IF NOT EXISTS tenant_plays (
      tenant_id TEXT NOT NULL,
      play_id TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      min_audience INTEGER,
      cooldown_days INTEGER,
      max_discount_pct INTEGER,
      PRIMARY KEY (tenant_id, play_id)
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      play_id TEXT NOT NULL,
      status TEXT NOT NULL,
      approved_by TEXT,
      approved_at TEXT NOT NULL,
      copy_snapshot TEXT NOT NULL,
      offer_snapshot TEXT NOT NULL,
      holdout_pct INTEGER NOT NULL,
      measurement TEXT NOT NULL,
      audience_size INTEGER NOT NULL,
      treated_size INTEGER NOT NULL,
      holdout_size INTEGER NOT NULL,
      dry_run INTEGER NOT NULL DEFAULT 0,
      est_cost REAL NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS ix_camp_tenant ON campaigns(tenant_id, approved_at);

    -- audience ถูกแช่แข็งตอนอนุมัติ (H1) — ห้ามคำนวณใหม่ตอนส่ง
    CREATE TABLE IF NOT EXISTS campaign_audience (
      campaign_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      arm TEXT NOT NULL,
      PRIMARY KEY (campaign_id, customer_id)
    );

    -- idempotency key ระดับ (campaign_id, customer_id) — retry ไม่ส่งซ้ำ (F12)
    CREATE TABLE IF NOT EXISTS messages (
      campaign_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      status TEXT NOT NULL,
      cost REAL NOT NULL DEFAULT 0,
      sent_at TEXT,
      PRIMARY KEY (campaign_id, customer_id)
    );

    CREATE TABLE IF NOT EXISTS attributions (
      campaign_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      horizon_days INTEGER NOT NULL,
      rph_treated REAL NOT NULL,
      rph_holdout REAL NOT NULL,
      lift_abs REAL NOT NULL,
      lift_pct REAL NOT NULL,
      ci_low REAL NOT NULL,
      ci_high REAL NOT NULL,
      verdict TEXT NOT NULL,
      measured_at TEXT NOT NULL,
      /* ครบกำหนดและมีกลุ่มควบคุมใหญ่พอจะประเมินได้แล้วหรือยัง

         ต่างจาก verdict: แถวที่ matured = 1 แต่ verdict = insufficient_data
         คือแถวที่ "วัดได้แล้วแต่ช่วงความเชื่อมั่นคร่อมศูนย์" ซึ่งเป็น
         ค่าประเมินที่ใช้ได้ ต่างจากแถวที่ยังไม่ถึงกำหนดวัดซึ่งไม่มีอะไรเลย

         ต้องแยกสองอย่างนี้ ไม่อย่างนั้นตัวเลขเรือธงจะเฉลี่ยเฉพาะแคมเปญ
         ที่ผ่านนัยสำคัญ ซึ่งคือแคมเปญที่โชคดี — ค่าที่ได้จะสูงเกินจริงเสมอ */
      matured INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (campaign_id, horizon_days)
    );

    -- มุมที่สาม — เฉพาะสถิติรวม ไม่มีแถวลูกค้าออกจาก tenant (§7)
    CREATE TABLE IF NOT EXISTS play_performance (
      play_id TEXT NOT NULL,
      cycle_shape TEXT NOT NULL,
      size_bucket TEXT NOT NULL,
      trials INTEGER NOT NULL DEFAULT 0,
      successes INTEGER NOT NULL DEFAULT 0,
      posterior_alpha REAL NOT NULL DEFAULT 1,
      posterior_beta REAL NOT NULL DEFAULT 1,
      PRIMARY KEY (play_id, cycle_shape, size_bucket)
    );

    CREATE TABLE IF NOT EXISTS brief_opens (
      tenant_id TEXT NOT NULL,
      opened_on TEXT NOT NULL,
      PRIMARY KEY (tenant_id, opened_on)
    );

    -- ข้อความจากฟอร์มติดต่อของเว็บ ไม่ใช่ข้อมูลของร้านใด (supabase/migrations/0005)
    CREATE TABLE IF NOT EXISTS contact_leads (
      id TEXT PRIMARY KEY,
      received_at TEXT NOT NULL,
      name TEXT NOT NULL,
      company TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      topic TEXT,
      cycle TEXT,
      base_size TEXT,
      message TEXT,
      forwarded INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS ix_leads_received ON contact_leads (received_at);

    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT NOT NULL,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      detail TEXT,
      at TEXT NOT NULL
    );

    /* ── สถานะการชำระต่อบัญชี (docs/plan.md หัวข้อ 9.2 ข้อ 8 · lib/engine/ai/policy.ts) ──
       แยกจาก tenants เพราะเจ้าของร้านแก้แถว tenants ของตัวเองได้ — ตารางนี้ผู้ใช้อ่านได้อย่างเดียว */
    CREATE TABLE IF NOT EXISTS tenant_billing (
      tenant_id TEXT PRIMARY KEY,
      state TEXT NOT NULL DEFAULT 'demo',
      is_customer INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      updated_by TEXT NOT NULL
    );

    /* ── บันทึกการเรียก AI ทุกครั้ง (lib/engine/ai/ledger.ts) — ไม่เก็บ prompt หรือคำตอบ ── */
    CREATE TABLE IF NOT EXISTS ai_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT NOT NULL,
      at TEXT NOT NULL,
      provider TEXT NOT NULL,
      kind TEXT NOT NULL,
      model TEXT NOT NULL,
      served_model TEXT,
      outcome TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS ix_ai_ledger_tenant ON ai_ledger (tenant_id, at);

    /* ══ โครงข้อมูล B2B — Blueprint 2.0 บท 3 · docs/plan.md หัวข้อ 4 ══
       สร้างจากสเปกเดียวกับ supabase/migrations/0007_b2b_model.sql — แก้ที่นี่ต้องแก้ที่นั่นด้วย
       (npm run verify:schema ตรวจให้) */
    -- องค์กร — นิติบุคคลหนึ่งแถว · บริษัทในเครือเชื่อมด้วย parent_id ไม่รวมเป็นแถวเดียว
    CREATE TABLE IF NOT EXISTS orgs (
      id TEXT NOT NULL PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      name_en TEXT,
      name_norm TEXT NOT NULL,
      tax_id TEXT,
      branch_code TEXT,
      legal_entity INTEGER NOT NULL DEFAULT 1,
      parent_id TEXT,
      primary_domain TEXT,
      industry TEXT,
      classification TEXT NOT NULL DEFAULT 'confidential',
      data_owner_id TEXT,
      source_id TEXT,
      lifecycle_state TEXT NOT NULL DEFAULT 'received',
      state_owner_id TEXT,
      state_due_at TEXT,
      restriction_status TEXT NOT NULL DEFAULT 'none',
      retention_rule_id TEXT,
      recorded_at TEXT,
      last_verified_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_orgs_name ON orgs (tenant_id, name_norm);
    CREATE INDEX IF NOT EXISTS ix_orgs_tax ON orgs (tenant_id, tax_id);
    -- โดเมนอีเมลขององค์กร — ใช้เป็นสัญญาณให้ตรวจ ไม่ใช่เหตุผลรวมคน
    CREATE TABLE IF NOT EXISTS org_domains (
      tenant_id TEXT NOT NULL,
      org_id TEXT NOT NULL,
      domain TEXT NOT NULL,
      PRIMARY KEY (tenant_id, domain)
    );
    CREATE INDEX IF NOT EXISTS ix_org_domains_org ON org_domains (tenant_id, org_id);
    -- คนสังกัดองค์กรช่วงไหน · valid_from/valid_to = เวลาที่เป็นจริง · recorded_at = เวลาที่ระบบรับรู้
    CREATE TABLE IF NOT EXISTS affiliations (
      id TEXT NOT NULL PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      org_id TEXT NOT NULL,
      title TEXT,
      department TEXT,
      valid_from TEXT,
      valid_to TEXT,
      source_id TEXT,
      confirmed_by TEXT,
      recorded_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_aff_person ON affiliations (tenant_id, customer_id);
    CREATE INDEX IF NOT EXISTS ix_aff_org ON affiliations (tenant_id, org_id);
    -- ความสัมพันธ์ที่มีหลักฐาน: คน↔คน · คน↔องค์กร · องค์กร↔องค์กร
    CREATE TABLE IF NOT EXISTS relationship_assertions (
      id TEXT NOT NULL PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      from_kind TEXT NOT NULL,
      from_id TEXT NOT NULL,
      to_kind TEXT NOT NULL,
      to_id TEXT NOT NULL,
      type TEXT NOT NULL,
      context TEXT,
      evidence_id TEXT,
      confirmed_by TEXT,
      confirmed_at TEXT,
      valid_from TEXT,
      valid_to TEXT,
      source_id TEXT,
      lifecycle_state TEXT NOT NULL DEFAULT 'pending_review',
      recorded_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_rel_from ON relationship_assertions (tenant_id, from_kind, from_id);
    CREATE INDEX IF NOT EXISTS ix_rel_to ON relationship_assertions (tenant_id, to_kind, to_id);
    -- ปฏิสัมพันธ์: ประชุม · โทร · อีเมลนอกระบบ · กิจกรรม · โน้ต พร้อมผลและผู้รับผิดชอบ
    CREATE TABLE IF NOT EXISTS interactions (
      id TEXT NOT NULL PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      org_id TEXT,
      customer_id TEXT,
      opportunity_id TEXT,
      summary TEXT,
      outcome TEXT,
      owner_id TEXT,
      source_id TEXT,
      classification TEXT NOT NULL DEFAULT 'confidential',
      recorded_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_inter_org ON interactions (tenant_id, org_id, occurred_at);
    CREATE INDEX IF NOT EXISTS ix_inter_person ON interactions (tenant_id, customer_id);
    -- การร่วมงาน/กิจกรรมในบทบาทหนึ่ง เช่น ผู้ออกบูธงานปี 2024
    CREATE TABLE IF NOT EXISTS participations (
      id TEXT NOT NULL PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      org_id TEXT,
      program TEXT NOT NULL,
      edition TEXT,
      role TEXT NOT NULL,
      occurred_at TEXT,
      source_id TEXT,
      recorded_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_part_person ON participations (tenant_id, customer_id);
    CREATE INDEX IF NOT EXISTS ix_part_program ON participations (tenant_id, program, edition);
    -- โอกาสแบบง่าย: ข้อเสนอ · บริษัท · ขั้น · เจ้าของ
    CREATE TABLE IF NOT EXISTS opportunities (
      id TEXT NOT NULL PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      org_id TEXT NOT NULL,
      name TEXT NOT NULL,
      offer TEXT,
      stage TEXT NOT NULL DEFAULT 'open',
      owner_id TEXT,
      value REAL,
      expected_close TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_opp_org ON opportunities (tenant_id, org_id);
    -- ผู้เกี่ยวข้องของโอกาส
    CREATE TABLE IF NOT EXISTS opportunity_people (
      tenant_id TEXT NOT NULL,
      opportunity_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      role TEXT,
      PRIMARY KEY (opportunity_id, customer_id)
    );
    CREATE INDEX IF NOT EXISTS ix_opp_people_person ON opportunity_people (tenant_id, customer_id);
    -- งานถัดไปที่มีเจ้าของและกำหนด
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT NOT NULL PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      due_at TEXT,
      owner_id TEXT,
      org_id TEXT,
      customer_id TEXT,
      opportunity_id TEXT,
      outcome TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      done_at TEXT
    );
    CREATE INDEX IF NOT EXISTS ix_tasks_owner ON tasks (tenant_id, owner_id, status);
    CREATE INDEX IF NOT EXISTS ix_tasks_org ON tasks (tenant_id, org_id);
    -- แหล่งข้อมูลที่ลงทะเบียน: วัตถุประสงค์ · เจ้าของงาน · ขอบเขตสิทธิ · ฟิลด์ที่เลือก — ไม่มีแหล่ง = อัปโหลดไม่ได้
    CREATE TABLE IF NOT EXISTS sources (
      id TEXT NOT NULL PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      purpose_id TEXT,
      owner_id TEXT NOT NULL,
      scope_note TEXT,
      fields TEXT NOT NULL DEFAULT '[]',
      acquisition_note TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      registered_by TEXT NOT NULL,
      registered_at TEXT NOT NULL
    );
    -- ไฟล์หนึ่งไฟล์ที่นำเข้า — เริ่มที่สถานะกัก (quarantined) จนผ่านการสแกน
    CREATE TABLE IF NOT EXISTS import_batches (
      id TEXT NOT NULL PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      bytes INTEGER NOT NULL,
      rows_total INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'quarantined',
      uploaded_by TEXT NOT NULL,
      uploaded_at TEXT NOT NULL,
      finished_at TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS ux_batches_sha ON import_batches (tenant_id, sha256);
    -- ผลรายแถว: accepted · rejected · pending_review · suspended · ค่าดั้งเดิมเข้ารหัสใน payload_enc
    CREATE TABLE IF NOT EXISTS import_rows (
      tenant_id TEXT NOT NULL,
      batch_id TEXT NOT NULL,
      line INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending_review',
      reason TEXT,
      source_ref TEXT,
      customer_id TEXT,
      payload_enc TEXT,
      recorded_at TEXT NOT NULL,
      PRIMARY KEY (batch_id, line)
    );
    CREATE INDEX IF NOT EXISTS ix_rows_person ON import_rows (tenant_id, customer_id);
    -- วัตถุประสงค์การประมวลผลของบัญชี
    CREATE TABLE IF NOT EXISTS purposes (
      id TEXT NOT NULL PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS ux_purposes_code ON purposes (tenant_id, code);
    -- ฐานการประมวลผลต่อวัตถุประสงค์ (เชื่อมทะเบียน ROPA) · เก็บเป็นรุ่น
    CREATE TABLE IF NOT EXISTS processing_records (
      id TEXT NOT NULL PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      purpose_id TEXT NOT NULL,
      lawful_basis TEXT NOT NULL,
      data_scope TEXT,
      approved_by TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      effective_from TEXT NOT NULL,
      effective_to TEXT,
      lia_ref TEXT,
      recorded_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_proc_purpose ON processing_records (tenant_id, purpose_id);
    -- ความยินยอม · ถอน · คัดค้าน · ข้อจำกัด ต่อวัตถุประสงค์และช่องทาง — เพิ่มอย่างเดียว
    CREATE TABLE IF NOT EXISTS preferences (
      id TEXT NOT NULL PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      purpose_id TEXT,
      channel TEXT NOT NULL DEFAULT 'any',
      kind TEXT NOT NULL,
      effective_at TEXT NOT NULL,
      evidence_id TEXT,
      recorded_by TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_pref_person ON preferences (tenant_id, customer_id);
    -- หลักฐานแนบ: แถวในไฟล์ · ฟอร์ม · เอกสาร · คำยืนยัน — เพิ่มอย่างเดียว
    CREATE TABLE IF NOT EXISTS evidence (
      id TEXT NOT NULL PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      ref TEXT,
      note TEXT,
      captured_by TEXT NOT NULL,
      captured_at TEXT NOT NULL
    );
    -- ประวัติทุกการเปลี่ยนค่า (เวลาที่ระบบรับรู้) — ค่า PII เก็บแบบปิดบาง · เพิ่มอย่างเดียว
    CREATE TABLE IF NOT EXISTS record_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT NOT NULL,
      record_kind TEXT NOT NULL,
      record_id TEXT NOT NULL,
      field TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT,
      reason TEXT NOT NULL,
      changed_by TEXT NOT NULL,
      valid_from TEXT,
      recorded_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_versions_record ON record_versions (tenant_id, record_kind, record_id, recorded_at);
    -- การรวมตัวตน — ย้อนได้ · impact เก็บสิ่งที่ย้ายตอนรวม
    CREATE TABLE IF NOT EXISTS merge_log (
      id TEXT NOT NULL PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      survivor_id TEXT NOT NULL,
      merged_id TEXT NOT NULL,
      rule TEXT,
      confidence REAL,
      decided_by TEXT NOT NULL,
      decided_at TEXT NOT NULL,
      impact TEXT NOT NULL DEFAULT '{}',
      undone_at TEXT,
      undone_by TEXT
    );
    CREATE INDEX IF NOT EXISTS ix_merge_survivor ON merge_log (tenant_id, survivor_id);
    -- บันทึกตรวจสอบ — hash ต่อเนื่องตรวจความครบได้ · ไม่มีค่า PII เต็ม · เพิ่มอย่างเดียว
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT NOT NULL,
      at TEXT NOT NULL,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      target_kind TEXT,
      target_id TEXT,
      detail TEXT,
      prev_hash TEXT,
      hash TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_audit_tenant ON audit_log (tenant_id, at);
    CREATE UNIQUE INDEX IF NOT EXISTS ux_audit_chain ON audit_log (tenant_id, prev_hash);

    /* ══ คิวตรวจตัวตน (B3) — สเปกเดียวกับ supabase/migrations/0008_review_queue.sql ══ */
    -- คิวให้คนตรวจ: คู่คนที่อาจเป็นคนเดียวกัน · กลุ่มชื่อองค์กรที่อาจเป็นนิติบุคคลเดียว — ระบบไม่รวมเองจากสัญญาณอ่อน
    CREATE TABLE IF NOT EXISTS review_items (
      id TEXT NOT NULL PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      subject_ids TEXT NOT NULL,
      signals TEXT NOT NULL DEFAULT '[]',
      confidence REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'open',
      assigned_to TEXT,
      due_at TEXT,
      created_at TEXT NOT NULL,
      decided_by TEXT,
      decided_at TEXT,
      decision_note TEXT
    );
    CREATE INDEX IF NOT EXISTS ix_review_open ON review_items (tenant_id, status, kind);
    CREATE UNIQUE INDEX IF NOT EXISTS ux_review_subject ON review_items (tenant_id, kind, subject_ids);
    -- สิ่งที่คนตัดสินแล้ว — ชนะกฎเสมอ และการตรวจตัวตนรอบถัดไปไม่เสนอซ้ำ
    CREATE TABLE IF NOT EXISTS resolution_overrides (
      id TEXT NOT NULL PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      verdict TEXT NOT NULL,
      a_id TEXT NOT NULL,
      b_id TEXT NOT NULL,
      decided_by TEXT NOT NULL,
      decided_at TEXT NOT NULL,
      note TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS ux_override_pair ON resolution_overrides (tenant_id, kind, a_id, b_id);
    -- ผลสุ่มตรวจการรวมโดย data steward — ใช้วัดความแม่นจริง ไม่ใช่ความมั่นใจของระบบ
    CREATE TABLE IF NOT EXISTS sample_checks (
      id TEXT NOT NULL PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      verdict TEXT NOT NULL,
      checked_by TEXT NOT NULL,
      checked_at TEXT NOT NULL,
      note TEXT
    );
    CREATE INDEX IF NOT EXISTS ix_sample_tenant ON sample_checks (tenant_id, checked_at);
    -- กฎอายุข้อมูลต่อประเภท — ไม่มีค่า 'เก็บตลอดไป' เป็นค่าตั้งต้น
    CREATE TABLE IF NOT EXISTS retention_rules (
      id TEXT NOT NULL PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      data_kind TEXT NOT NULL,
      trigger_event TEXT NOT NULL,
      period_days INTEGER NOT NULL,
      review_owner_id TEXT,
      legal_hold INTEGER NOT NULL DEFAULT 0,
      note TEXT,
      created_at TEXT NOT NULL
    );

    /* ══ Account Workspace (B4) — สเปกเดียวกับ supabase/migrations/0009_account_workspace.sql ══ */
    -- สรุปแฟ้มบริษัท — ผูกกับระดับสิทธิ์และ hash ของหลักฐาน · ทุกประโยคมีรหัสหลักฐาน · ลบตามเมื่อหลักฐานถูกลบ
    CREATE TABLE IF NOT EXISTS account_briefs (
      id TEXT NOT NULL PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      org_id TEXT NOT NULL,
      clearance TEXT NOT NULL,
      evidence_hash TEXT NOT NULL,
      source TEXT NOT NULL,
      model TEXT,
      sentences TEXT NOT NULL DEFAULT '[]',
      unknowns TEXT NOT NULL DEFAULT '[]',
      evidence TEXT NOT NULL DEFAULT '[]',
      dropped INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS ux_brief_scope ON account_briefs (tenant_id, org_id, clearance);

    /* ══ Campaign Workspace (B5) — สเปกเดียวกับ supabase/migrations/0010_campaign_workspace.sql ══ */
    -- แคมเปญขาย B2B (เช่น ขายสปอนเซอร์) — วัตถุประสงค์ · ช่องทาง · ชนิดข้อความ · เกณฑ์เป้าหมายแบบอ่านได้
    CREATE TABLE IF NOT EXISTS sales_campaigns (
      id TEXT NOT NULL PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      offer TEXT,
      purpose_id TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'email',
      message_kind TEXT NOT NULL DEFAULT 'marketing',
      disclosure_purpose_id TEXT,
      criteria TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'draft',
      owner_id TEXT,
      starts_at TEXT,
      ends_at TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_sales_campaigns_tenant ON sales_campaigns (tenant_id, status);
    -- รายชื่อเป้าหมายของแคมเปญ — เหตุผลที่ถูกเลือก · ผลตัดสินนโยบายพร้อมรุ่น · ผู้รับผิดชอบ · ผล
    CREATE TABLE IF NOT EXISTS campaign_targets (
      id TEXT NOT NULL PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      campaign_id TEXT NOT NULL,
      org_id TEXT,
      customer_id TEXT NOT NULL,
      reasons TEXT NOT NULL DEFAULT '[]',
      eligibility TEXT NOT NULL DEFAULT 'review_required',
      eligibility_reasons TEXT NOT NULL DEFAULT '[]',
      policy_version TEXT NOT NULL,
      checked_at TEXT NOT NULL,
      assigned_to TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      outcome TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS ux_target_person ON campaign_targets (tenant_id, campaign_id, customer_id);
    CREATE INDEX IF NOT EXISTS ix_target_person ON campaign_targets (tenant_id, customer_id);
    CREATE INDEX IF NOT EXISTS ix_target_assignee ON campaign_targets (tenant_id, assigned_to, status);
    -- กิจกรรมที่มีผล (มอบหมาย · บันทึกผล · ทบทวน) — วัดการใช้งานจริง แยกจาก login · ธง is_staff ไม่นับ · เพิ่มอย่างเดียว
    CREATE TABLE IF NOT EXISTS work_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT NOT NULL,
      actor TEXT NOT NULL,
      is_staff INTEGER NOT NULL DEFAULT 0,
      kind TEXT NOT NULL,
      campaign_id TEXT,
      target_id TEXT,
      at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_work_log_tenant ON work_log (tenant_id, at);

    /* ══ หน้า "วันนี้" (docs/solo-plan.md S1) — สเปกเดียวกับ supabase/migrations/0012_today_queue.sql ══ */
    -- การเลื่อน/รับทราบรายการในคิวของผู้ใช้แต่ละคน — ไม่มีข้อความอิสระ · ไม่มีข้อมูลส่วนบุคคล
    CREATE TABLE IF NOT EXISTS queue_marks (
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      item_kind TEXT NOT NULL,
      item_id TEXT NOT NULL,
      mark TEXT NOT NULL,
      until TEXT,
      count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (tenant_id, user_id, item_kind, item_id)
    );
  `);

  /* บัญชีเดโมสังเคราะห์ได้สถานะ demo — เฉพาะบัญชีในทะเบียนเดโม ไม่ใช่ทุกแถวใน tenants
     บัญชีลูกค้าจริงต้องถูกสร้างพร้อมแถวของตัวเอง (is_customer = 1) ไม่มีแถว = AI ปิด */
  for (const p of TENANT_PROFILES) {
    await run(
      `INSERT OR IGNORE INTO tenant_billing (tenant_id, state, is_customer, updated_at, updated_by)
       VALUES (?, 'demo', 0, ?, 'schema')`,
      p.id,
      new Date().toISOString(),
    );
  }

  /* คอลัมน์ที่เพิ่มทีหลัง — CREATE TABLE IF NOT EXISTS ไม่เพิ่มให้ฐานที่มีอยู่แล้ว
     จึงต้องเติมเอง sqlite ไม่มี ADD COLUMN IF NOT EXISTS ต้องอ่านรายชื่อก่อน */
  /* คอลัมน์ที่เพิ่มทีหลังของฐานที่มีอยู่ก่อนแล้ว — PRAGMA เป็นของ sqlite
     ล้วน และไปถึงที่นี่ได้เฉพาะตอนไม่ได้ใช้ Postgres */
  const columnsOf = async (table: string) =>
    new Set(
      (await all<{ name: string }>(`PRAGMA table_info(${table})`)).map(
        (c) => c.name,
      ),
    );

  if (!(await columnsOf("attributions")).has("matured")) {
    await exec(
      "ALTER TABLE attributions ADD COLUMN matured INTEGER NOT NULL DEFAULT 0",
    );
  }
  if (!(await columnsOf("tenants")).has("billing_day")) {
    await exec(
      "ALTER TABLE tenants ADD COLUMN billing_day INTEGER NOT NULL DEFAULT 1",
    );
  }

  /* ข้อมูลกำกับบนระเบียนเดิม (Blueprint บท 3) — ระดับความลับ · เจ้าของ · ที่มา · สถานะตลอดอายุ
     · ข้อจำกัด · กฎอายุ · เวลาบันทึก/ตรวจล่าสุด และสถานะตรวจของช่องทาง · ธง is_staff ของทีม PARALLAX */
  {
    const have = await columnsOf("customers");
    if (!have.has("classification")) await exec("ALTER TABLE customers ADD COLUMN classification TEXT NOT NULL DEFAULT 'confidential'");
    if (!have.has("data_owner_id")) await exec("ALTER TABLE customers ADD COLUMN data_owner_id TEXT");
    if (!have.has("source_id")) await exec("ALTER TABLE customers ADD COLUMN source_id TEXT");
    if (!have.has("lifecycle_state")) await exec("ALTER TABLE customers ADD COLUMN lifecycle_state TEXT NOT NULL DEFAULT 'received'");
    if (!have.has("state_owner_id")) await exec("ALTER TABLE customers ADD COLUMN state_owner_id TEXT");
    if (!have.has("state_due_at")) await exec("ALTER TABLE customers ADD COLUMN state_due_at TEXT");
    if (!have.has("restriction_status")) await exec("ALTER TABLE customers ADD COLUMN restriction_status TEXT NOT NULL DEFAULT 'none'");
    if (!have.has("retention_rule_id")) await exec("ALTER TABLE customers ADD COLUMN retention_rule_id TEXT");
    if (!have.has("recorded_at")) await exec("ALTER TABLE customers ADD COLUMN recorded_at TEXT");
    if (!have.has("last_verified_at")) await exec("ALTER TABLE customers ADD COLUMN last_verified_at TEXT");
  }
  {
    const have = await columnsOf("contact_points");
    if (!have.has("verify_status")) await exec("ALTER TABLE contact_points ADD COLUMN verify_status TEXT NOT NULL DEFAULT 'unverified'");
    if (!have.has("valid_from")) await exec("ALTER TABLE contact_points ADD COLUMN valid_from TEXT");
    if (!have.has("valid_to")) await exec("ALTER TABLE contact_points ADD COLUMN valid_to TEXT");
    if (!have.has("last_verified_at")) await exec("ALTER TABLE contact_points ADD COLUMN last_verified_at TEXT");
  }
  {
    const have = await columnsOf("tenant_users");
    if (!have.has("is_staff")) await exec("ALTER TABLE tenant_users ADD COLUMN is_staff INTEGER NOT NULL DEFAULT 0");
  }
  /* เจ้าของบัญชีฝั่งขาย (B4 · 0009) */
  {
    const have = await columnsOf("orgs");
    if (!have.has("account_owner_id")) await exec("ALTER TABLE orgs ADD COLUMN account_owner_id TEXT");
  }
  {
    const have = await columnsOf("affiliations");
    if (!have.has("last_seen_at")) await exec("ALTER TABLE affiliations ADD COLUMN last_seen_at TEXT");
  }
  /* งานและโอกาสผูกกับแคมเปญ (B5 · 0010) */
  {
    const have = await columnsOf("tasks");
    if (!have.has("campaign_id")) await exec("ALTER TABLE tasks ADD COLUMN campaign_id TEXT");
    if (!have.has("target_id")) await exec("ALTER TABLE tasks ADD COLUMN target_id TEXT");
  }
  {
    const have = await columnsOf("opportunities");
    if (!have.has("campaign_id")) await exec("ALTER TABLE opportunities ADD COLUMN campaign_id TEXT");
  }
}

/* ── ต้องเขียนผ่าน adapter เดียวกับที่เหลือ ──

   ตอนย้ายทีละไฟล์ ระบบมีคอนเนกชัน sqlite สองตัวชั่วคราว: db() ของเดิม
   กับ sql() ตัวใหม่ ทั้งคู่ชี้ไฟล์เดียวกัน ซึ่งอ่านพร้อมกันได้ไม่มีปัญหา
   แต่เขียนไม่ได้ — พอ tx() เปิดธุรกรรมบนคอนเนกชันหนึ่ง อีกตัวจะได้
   "database is locked" ทันที (เจอจริงตอน travelForward เรียก logActivity
   ระหว่างที่ measureAll ยังอยู่ในธุรกรรม)

   ตัวเขียนทุกตัวจึงต้องอยู่บนคอนเนกชันเดียว */
export async function logActivity(
  tenantId: string,
  actor: string,
  action: string,
  detail?: string,
): Promise<void> {
  await run(
    "INSERT INTO activity_log (tenant_id, actor, action, detail, at) VALUES (?,?,?,?,?)",
    tenantId,
    actor,
    action,
    detail ?? null,
    new Date().toISOString(),
  );
  /* ทุกการกระทำที่บันทึกไว้เข้าสาย audit ด้วย (Blueprint บท 8) — activity_log ไว้แสดงบนหน้าจอ
     audit_log ไว้ตรวจย้อนหลัง แก้ไม่ได้ และต่อกันด้วย hash · detail ของที่นี่ไม่มีค่า PII อยู่แล้ว
     (verify:customers ตรวจ) */
  await appendAudit({ tenantId, actor, action, detail: detail ?? null });
}
