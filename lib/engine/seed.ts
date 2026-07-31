import { db } from "@/lib/engine/db";
import { ALL_PLAYS } from "@/lib/shared/plays";
import {
  DEFAULT_TENANT_ID,
  TENANT_PROFILES,
  type CatalogueItem,
  type TenantProfile,
} from "@/lib/shared/tenants";
import { PLANS, priceForMessages } from "@/lib/shared/plans";

/* ── ชุดข้อมูลตัวอย่าง ─────────────────────────────────────────
   ตัวสร้างเดียวใช้ได้ทุกธุรกิจ — รูปร่างของฐานมาจากโปรไฟล์ใน
   lib/tenants.ts ไม่ใช่จากโค้ดในไฟล์นี้ เพิ่มบัญชีใหม่จึงไม่ต้อง
   แก้ไฟล์นี้เลย

   MST Golf ต้องได้ตัวเลขทั้งหกตรงกับ Playbook เสมอ —
   ฐาน 1,240 · เคยซื้อ 999 · ซื้อซ้ำ 707 · เข้ามาใน 30 วัน 248 ·
   เงียบเกิน 90 วัน 585 · กลุ่มบนสุด 2% สร้างรายได้ 41%

   สุ่มแบบ deterministic (mulberry32) ต่อบัญชี — reseed แล้วได้
   ตัวเลขเดิมทุกครั้ง และบัญชีหนึ่งไม่ขยับตัวเลขของอีกบัญชี
   เพราะแต่ละบัญชีมี seedKey ของตัวเอง
   ───────────────────────────────────────────────────────────── */

export const TENANT_ID = DEFAULT_TENANT_ID;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const THAI_FIRST = [
  "ปรีชา", "สมชาย", "วิชัย", "อนันต์", "ธนกร", "ณัฐพล", "กิตติ", "ศักดิ์ชัย",
  "พีระ", "วรพล", "จิรายุ", "ภาณุ", "สุทธิพงษ์", "ชัยวัฒน์", "เอกชัย",
  "นภัสสร", "ปิยะดา", "วรรณา", "สุนิสา", "อารยา", "ชนิดา", "พิมพ์ใจ", "รัตนา",
  "ธีรพงศ์", "อรุณี", "มานพ", "เพ็ญศรี", "สุรชัย", "กาญจนา", "วีระพันธ์",
];
const THAI_LAST = [
  "ศรีสุวรรณ", "วงศ์อนันต์", "รักไทย", "บุญมี", "จันทร์เพ็ญ", "ทองดี",
  "พูนทรัพย์", "สุขสวัสดิ์", "เจริญพร", "อินทรา", "มณีรัตน์", "ภูวดล",
  "แสงทอง", "พงษ์ไพบูลย์", "ธนะสาร", "ชูเกียรติ", "วัฒนศิริ",
];

function iso(d: Date) {
  return d.toISOString();
}
function daysAgo(base: Date, n: number) {
  return new Date(base.getTime() - n * 86400000);
}
/** จำนวนเต็มในช่วง [a, b] */
function pick(rnd: () => number, [a, b]: [number, number]) {
  return a + Math.floor(rnd() * (b - a + 1));
}

export function isSeeded(): boolean {
  const row = db().prepare("SELECT COUNT(*) AS n FROM customers").get() as
    | { n: number }
    | undefined;
  return (row?.n ?? 0) > 0;
}

/** บัญชีนี้มีข้อมูลแล้วหรือยัง — ใช้ตอนเพิ่มบัญชีใหม่เข้าฐานที่มีอยู่แล้ว */
export function isTenantSeeded(tenantId: string): boolean {
  const row = db()
    .prepare("SELECT COUNT(*) AS n FROM customers WHERE tenant_id = ?")
    .get(tenantId) as { n: number } | undefined;
  return (row?.n ?? 0) > 0;
}

/* ── ลบข้อมูลของบัญชีเดียว ─────────────────────────────────────
   ต้องลบทีละบัญชี ไม่ใช่ DELETE ทั้งตาราง เพราะตอนนี้มีสี่บัญชี
   อยู่ในฐานเดียวกัน การ reseed บัญชีหนึ่งต้องไม่ล้างอีกสามบัญชี

   ตารางลูก (line_items · messages · attributions · campaign_audience)
   ไม่มีคอลัมน์ tenant_id จึงต้องไล่ผ่านแม่ และต้องลบลูกก่อนแม่
   ไม่ใช่ลบแม่ก่อน มิฉะนั้นจะเหลือแถวลูกที่หาเจ้าของไม่ได้อีกเลย
   ───────────────────────────────────────────────────────────── */
function wipeTenant(tenantId: string) {
  const d = db();

  for (const t of ["campaign_audience", "messages", "attributions"]) {
    d.prepare(
      `DELETE FROM ${t} WHERE campaign_id IN
         (SELECT id FROM campaigns WHERE tenant_id = ?)`,
    ).run(tenantId);
  }
  d.prepare(
    `DELETE FROM line_items WHERE txn_id IN (
       SELECT tx.id FROM transactions tx
       JOIN customers c ON c.id = tx.customer_id
       WHERE c.tenant_id = ?)`,
  ).run(tenantId);
  for (const t of ["events", "consents", "memberships", "identities", "transactions"]) {
    d.prepare(
      `DELETE FROM ${t} WHERE customer_id IN
         (SELECT id FROM customers WHERE tenant_id = ?)`,
    ).run(tenantId);
  }
  for (const t of [
    "campaigns", "tenant_plays", "customer_features",
    "customers", "products", "brief_opens", "activity_log",
    "credit_purchases",
  ]) {
    d.prepare(`DELETE FROM ${t} WHERE tenant_id = ?`).run(tenantId);
  }
}

/* ── สร้างข้อมูลของบัญชีเดียวตามโปรไฟล์ ───────────────────────── */

function seedTenant(p: TenantProfile, now: Date) {
  const d = db();
  const rnd = mulberry32(p.seedKey);
  const s = p.scale;

  const anchors = p.catalogue.filter((c) => c.group_role === "anchor");
  const attachments = p.catalogue.filter((c) => c.group_role === "attachment");
  const consumables = p.catalogue.filter((c) => c.group_role === "consumable");

  const openedAt = daysAgo(now, p.createdDaysAgo);
  /* วันตัดรอบบิลมาจากวันที่เปิดบัญชี ไม่ใช่วันที่ 1 ของทุกคน —
     ไม่งั้นทั้งสี่บัญชีมีรอบบิลเหมือนกันเป๊ะ และบั๊กเรื่องขอบรอบบิล
     จะโผล่พร้อมกันเดือนละครั้งแทนที่จะโผล่ให้เห็นตอนพัฒนา */
  const billingDay = Math.min(28, openedAt.getDate());

  d.prepare(
    `INSERT INTO tenants
       (id, name, cycle_shape, tier, created_at, max_messages_per_week,
        quiet_hours_start, quiet_hours_end, max_discount_pct, message_credits,
        billing_day)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name, cycle_shape = excluded.cycle_shape,
       tier = excluded.tier,
       max_messages_per_week = excluded.max_messages_per_week,
       quiet_hours_start = excluded.quiet_hours_start,
       quiet_hours_end = excluded.quiet_hours_end,
       max_discount_pct = excluded.max_discount_pct,
       message_credits = excluded.message_credits,
       billing_day = excluded.billing_day`,
  ).run(
    p.id, p.name, p.cycleShape, p.tier, iso(openedAt),
    p.limits.weeklyCap, p.limits.quietStart, p.limits.quietEnd,
    p.limits.maxDiscountPct, p.limits.credits, billingDay,
  );

  /* ── ที่มาของยอดเครดิต ──
     ยอดคงเหลือลอย ๆ ตอบคำถาม "จ่ายไปเท่าไร" ไม่ได้ จึงบันทึกที่มา:
     เครดิตแรกเข้าที่แผนแจกให้ครั้งเดียว บวกกับส่วนที่ซื้อเพิ่ม
     คิดราคาตามแพ็กที่ยอดนั้นเข้าเกณฑ์ (lib/plans.ts) */
  const plan = PLANS[p.tier];
  const welcome = Math.min(plan.welcomeCredits, p.limits.credits);
  const bought = Math.max(0, p.limits.credits - welcome);
  const insCredit = d.prepare(
    `INSERT INTO credit_purchases (tenant_id, at, messages, baht, kind)
     VALUES (?,?,?,?,?)`,
  );
  if (welcome > 0) insCredit.run(p.id, iso(openedAt), welcome, 0, "welcome");
  if (bought > 0) {
    /* ลงวันที่ตอนเปิดบัญชี ไม่ใช่ในรอบบิลปัจจุบัน

       เคยลงเป็น "สองวันก่อน" เพื่อให้หน้าค่าใช้จ่ายมีตัวเลขให้ดู แล้วได้
       หน้าจอที่ขัดกันเอง: ใบแจ้งค่าใช้จ่ายเดือนนี้ขึ้นค่าเครดิต 55,000 บาท
       ขณะที่ข้อความที่เครดิตนั้นจ่ายไปถูกส่งเมื่อปีที่แล้ว (ประวัติเดโม
       เลื่อน sent_at ย้อนหลังไปพร้อม approved_at ตามที่ควรเป็น)
       ใบแจ้งค่าใช้จ่ายที่มีรายการซึ่งไม่ได้เกิดในรอบนั้น อ่านไม่ได้ */
    insCredit.run(p.id, iso(openedAt), bought, priceForMessages(bought), "pack");
  }

  const insProduct = d.prepare(
    `INSERT INTO products (id, tenant_id, name, category, group_role, list_price, is_new_arrival, is_dead_stock)
     VALUES (?,?,?,?,?,?,?,?)`,
  );
  for (const c of p.catalogue) {
    insProduct.run(
      `${p.id}:${c.id}`, p.id, c.name, c.category, c.group_role, c.list_price,
      c.is_new_arrival ? 1 : 0, c.is_dead_stock ? 1 : 0,
    );
  }

  const insCustomer = d.prepare(
    "INSERT INTO customers (id, tenant_id, name, created_at) VALUES (?,?,?,?)",
  );
  const insIdentity = d.prepare(
    "INSERT INTO identities (customer_id, type, value_hash) VALUES (?,?,?)",
  );
  const insTxn = d.prepare(
    `INSERT INTO transactions (id, customer_id, occurred_at, total, discount_total, channel)
     VALUES (?,?,?,?,?,?)`,
  );
  const insLine = d.prepare(
    `INSERT INTO line_items (txn_id, product_id, qty, unit_price, unit_list_price)
     VALUES (?,?,?,?,?)`,
  );
  const insConsent = d.prepare(
    `INSERT INTO consents (customer_id, purpose, granted_at, revoked_at, source)
     VALUES (?,?,?,?,?)`,
  );
  const insMembership = d.prepare(
    "INSERT INTO memberships (customer_id, kind, started_at, expires_at) VALUES (?,?,?,?)",
  );
  const insEvent = d.prepare(
    "INSERT INTO events (customer_id, type, occurred_at, meta) VALUES (?,?,?,?)",
  );

  /* recency ถูกวางแผนล่วงหน้าเพื่อให้จำนวนคนในแต่ละช่วงตรงเป้าพอดี
     ไม่ปล่อยให้เป็นผลพลอยได้ของการสุ่ม */
  const recencyPlan: number[] = [];
  for (let i = 0; i < s.recent30; i++) recencyPlan.push(1 + Math.floor(rnd() * 29));
  const midCount = Math.max(0, s.everTransacted - s.recent30 - s.silent90);
  for (let i = 0; i < midCount; i++) recencyPlan.push(31 + Math.floor(rnd() * 59));
  for (let i = 0; i < s.silent90; i++) recencyPlan.push(91 + Math.floor(rnd() * 500));
  for (let i = recencyPlan.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [recencyPlan[i], recencyPlan[j]] = [recencyPlan[j], recencyPlan[i]];
  }

  let txnSeq = 0;
  for (let i = 0; i < s.people; i++) {
    const id = `${p.id}-c-${String(i + 1).padStart(5, "0")}`;
    const name = `${THAI_FIRST[Math.floor(rnd() * THAI_FIRST.length)]} ${
      THAI_LAST[Math.floor(rnd() * THAI_LAST.length)]
    }`;
    const transacts = i < s.everTransacted;
    const isRepeat = i < s.repeat;
    const isWhale = i < Math.round(s.people * s.whaleShare);

    /* วางแผนวันที่ทุกรายการก่อน แล้วจึงตั้งวันสมัครให้เก่ากว่ารายการแรกเสมอ
       ถ้าทำสลับกัน รายการที่เก่ากว่าวันสมัครจะถูกทิ้ง และจำนวนคนที่
       "เคยจ่าย" จะต่ำกว่าเป้าโดยไม่มีใครรู้ */
    const txnCount = !transacts
      ? 0
      : isWhale
        ? pick(rnd, s.whaleTxns)
        : isRepeat
          ? pick(rnd, s.repeatTxns)
          : 1;
    const recency = transacts ? (recencyPlan[i] ?? 30 + Math.floor(rnd() * 300)) : 0;
    const cycle = isWhale
      ? s.whaleCycle[0] + rnd() * (s.whaleCycle[1] - s.whaleCycle[0])
      : s.normalCycle[0] + rnd() * (s.normalCycle[1] - s.normalCycle[0]);

    const offsets: number[] = [];
    for (let t = 0; t < txnCount; t++) {
      // รายการล่าสุดต้องตรงกับ recency ที่วางแผนไว้พอดี ห้ามใส่ jitter ที่ t=0
      offsets.push(t === 0 ? recency : Math.round(recency + t * cycle + rnd() * 10));
    }
    const oldest = offsets.length ? Math.max(...offsets) : 0;
    const signupDays = transacts
      ? oldest + 20 + Math.floor(rnd() * 120)
      : 5 + Math.floor(rnd() * 80);
    insCustomer.run(id, p.id, name, iso(daysAgo(now, signupDays)));
    insIdentity.run(id, "phone", `ph_${id}_${Math.floor(rnd() * 1e9)}`);

    /* ── ความยินยอมและช่องทางที่ทักถึง ──
       คนที่ถอนความยินยอมคือคนที่ Keep ยอมแพ้ และไม่มีสิทธิ์ถูกส่ง
       หรือถูกส่งออกไปที่ใดอีก ไม่ว่า play ไหนก็ตาม */
    const consentRoll = rnd();
    if (consentRoll > p.noConsentShare) {
      const revoked = consentRoll > 1 - p.revokedShare;
      insConsent.run(
        id, "marketing",
        iso(daysAgo(now, signupDays)),
        revoked ? iso(daysAgo(now, Math.floor(rnd() * 90))) : null,
        rnd() > 0.5 ? "signup_form" : "line_oa",
      );
    }
    if (rnd() < p.lineShare) insIdentity.run(id, "line", `line_${id}`);

    /* ── สมาชิกที่มีวันหมดอายุ — ป้อนให้ play กลุ่ม expiry ──

       ต้องกระจายแบบ "สถานะคงตัว" คือนับจากวันหมดอายุที่เหลือ ไม่ใช่จาก
       วันเริ่มต้น เพราะสมาชิกที่ต่ออายุทุกปีจะมีวันคงเหลือกระจายสม่ำเสมอ
       ตลอดช่วงหนึ่งปี ทำให้ทุกเดือนมีคนหมดอายุประมาณ 1/12 ของสมาชิก

       วิธีเดิม (สุ่มวันเริ่มต้นในช่วง 1.9 เท่าของอายุสมาชิก) ทำให้เกินครึ่ง
       หมดอายุไปแล้ว และเหลือคนที่จะหมดอายุใน 30 วันข้างหน้าเพียง 4%
       สนามกอล์ฟที่มีสมาชิก 1,600 คนจึงมีคนใกล้หมดอายุแค่ 40 คน
       ซึ่งน้อยกว่าความจริงหลายเท่า และทำให้ play หลักของธุรกิจนี้ไร้ความหมาย */
    if (p.membership && rnd() < p.membership.share) {
      const term = p.membership.termDays;
      // 22% ขาดต่ออายุไปแล้ว (กลุ่มที่ play ดึงกลับมีความหมายจริง)
      const lapsed = rnd() < 0.22;
      const remaining = lapsed
        ? -Math.floor(rnd() * term) // หมดอายุแล้วไม่เกินหนึ่งรอบ
        : Math.floor(rnd() * term); // ยังไม่หมด กระจายสม่ำเสมอทั้งปี
      const startedDaysAgo = term - remaining;
      insMembership.run(
        id, p.membership.kind,
        iso(daysAgo(now, startedDaysAgo)),
        iso(daysAgo(now, -remaining)),
      );
    }

    // มาแต่ไม่จ่าย
    const visits = Math.floor(rnd() * (p.events.visitMax + 1));
    for (let v = 0; v < visits; v++) {
      insEvent.run(id, "visit", iso(daysAgo(now, Math.floor(rnd() * 240))), null);
    }
    // ใช้บริการที่ไม่ใช่การซื้อของ
    if (rnd() < p.events.bookingShare) {
      insEvent.run(
        id, "booking",
        iso(daysAgo(now, Math.floor(rnd() * 120))),
        p.events.bookingLabel,
      );
    }
    if (!transacts && rnd() < p.events.formShare) {
      insEvent.run(id, "form", iso(daysAgo(now, 7 + Math.floor(rnd() * 70))), "lead_form");
    }

    if (!transacts) continue;

    const discountSeeker = isWhale
      ? rnd() < p.whaleDiscountShare
      : rnd() < p.discountSeekerShare;

    for (const offset of offsets) {
      const txnId = `${p.id}-t-${String(++txnSeq).padStart(6, "0")}`;
      const at = iso(daysAgo(now, offset));

      const items: CatalogueItem[] = [];
      const anchorRoll = rnd();
      const anchorCut = isWhale ? p.anchorProb.whale : p.anchorProb.normal;
      /* กลุ่มบนสุดหยิบของหลักแทบทุกครั้ง จึงเป็นที่มาของการกระจุกตัว
         ของรายได้ ซึ่งเป็นข้อเท็จจริงที่ทุกธุรกิจในเดโมมีเหมือนกัน */
      if (anchors.length && anchorRoll < anchorCut) {
        items.push(anchors[Math.floor(rnd() * anchors.length)]);
        if (isWhale && rnd() > 0.6) {
          items.push(anchors[Math.floor(rnd() * anchors.length)]);
        }
      }
      // ประมาณครึ่งของคนที่จ่ายของหลักไม่จ่ายของพ่วงตาม — ป้อนให้ K3
      if (attachments.length && rnd() > (items.length ? 0.55 : 0.32)) {
        items.push(attachments[Math.floor(rnd() * attachments.length)]);
      }
      if (consumables.length && rnd() > 0.6) {
        items.push(consumables[Math.floor(rnd() * consumables.length)]);
      }
      if (!items.length) {
        const pool = consumables.length ? consumables : p.catalogue;
        items.push(pool[Math.floor(rnd() * pool.length)]);
      }

      let total = 0;
      let discountTotal = 0;
      for (const c of items) {
        const qty = c.group_role === "consumable" ? 1 + Math.floor(rnd() * 3) : 1;
        /* ราคาป้ายเทียบราคาที่จ่าย = ที่มาของ discount_affinity
           เพดานส่วนลดของบัญชีคุมค่านี้ด้วย บัญชีที่ตั้งเพดาน 0 จึงไม่มี
           ใครเป็น discount_seeker เลย ซึ่งถูกต้องตามธรรมชาติของธุรกิจนั้น */
        const maxOff = p.limits.maxDiscountPct / 100;
        const disc =
          maxOff === 0
            ? 0
            : discountSeeker
              ? Math.min(maxOff, 0.1 + rnd() * 0.25)
              : rnd() > 0.85
                ? Math.min(maxOff, 0.05 + rnd() * 0.1)
                : 0;
        const unit = Math.round(c.list_price * (1 - disc));
        insLine.run(txnId, `${p.id}:${c.id}`, qty, unit, c.list_price);
        total += unit * qty;
        discountTotal += (c.list_price - unit) * qty;
      }
      insTxn.run(
        txnId, id, at, total, discountTotal,
        rnd() > 0.82 ? p.channels[1] : p.channels[0],
      );
    }
  }

  /* เปิด play ทั้งคลังให้บัญชีตั้งแต่วันแรก (D2)
     ตัวที่ไม่เข้ากับรูปทรงวงจรของบัญชีจะถูกกรองตอน MATCH ไม่ใช่ตรงนี้ */
  const insTenantPlay = d.prepare(
    "INSERT INTO tenant_plays (tenant_id, play_id, enabled) VALUES (?,?,1)",
  );
  for (const play of ALL_PLAYS) insTenantPlay.run(p.id, play.id);
}

export function seed({ force = false, only }: { force?: boolean; only?: string } = {}) {
  const d = db();
  const targets = only
    ? TENANT_PROFILES.filter((t) => t.id === only)
    : TENANT_PROFILES;
  if (!targets.length) return { seeded: false, tenants: [] as string[] };

  const pending = force ? targets : targets.filter((t) => !isTenantSeeded(t.id));
  if (!pending.length) return { seeded: false, tenants: [] as string[] };

  const now = new Date();
  d.exec("BEGIN");
  try {
    for (const p of pending) {
      wipeTenant(p.id);
      seedTenant(p, now);
    }

    /* prior ที่สืบทอดมาจากร้านอื่นในวงจรเดียวกัน (D9 · §7)
       ตารางนี้ข้ามบัญชีโดยเจตนา — เก็บเฉพาะสถิติรวม ไม่มีแถวลูกค้า
       จึงเขียนครั้งเดียวครอบทุกรูปทรงวงจร ไม่ผูกกับบัญชีใด
       และเป็นเหตุผลว่าทำไมร้านที่สองได้ประโยชน์จากร้านแรกทันที */
    const perfEmpty =
      (d.prepare("SELECT COUNT(*) AS n FROM play_performance").get() as { n: number })
        .n === 0;
    if (perfEmpty) {
      const rnd = mulberry32(9090909);
      const insPerf = d.prepare(
        `INSERT INTO play_performance
          (play_id, cycle_shape, size_bucket, trials, successes, posterior_alpha, posterior_beta)
         VALUES (?,?,?,?,?,?,?)
         ON CONFLICT(play_id, cycle_shape, size_bucket) DO NOTHING`,
      );
      for (const play of ALL_PLAYS) {
        for (const shape of play.cycle_shape) {
          const trials = 120 + Math.floor(rnd() * 900);
          const successes = Math.round(
            trials * play.priors.response_rate * (0.75 + rnd() * 0.5),
          );
          insPerf.run(
            play.id, shape, "300_1000", trials, successes,
            1 + successes, 1 + (trials - successes),
          );
        }
      }
    }

    d.exec("COMMIT");
  } catch (err) {
    d.exec("ROLLBACK");
    throw err;
  }

  return { seeded: true, tenants: pending.map((t) => t.id) };
}
