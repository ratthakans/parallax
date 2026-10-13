import { all, exec, run, usingPostgres } from "@/lib/engine/sql";
import { TENANT_PROFILES } from "@/lib/shared/tenants";

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
}
