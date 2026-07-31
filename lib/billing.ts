import { db, logActivity } from "./db";
import {
  MESSAGE_COST_BAHT,
  PLANS,
  planById,
  priceForMessages,
  type Plan,
  type PlanId,
} from "./plans";

/* ── ค่าใช้จ่ายและเพดานของแผน ──────────────────────────────────
   ชั้นนี้ต่อ lib/plans.ts (ข้อมูลล้วน) เข้ากับฐานข้อมูล และเป็นที่เดียว
   ที่ตอบคำถาม "แผนนี้ทำอะไรได้" ให้ทั้งหน้าจอและชั้น dispatch

   หลักเดียวของไฟล์นี้: ทุกเพดานที่หน้าราคาประกาศ ต้องมีฟังก์ชันที่นี่
   ที่บังคับใช้จริง ถ้าประกาศแต่ไม่มีคนเรียก มันคือคำโฆษณา ไม่ใช่เพดาน
   ───────────────────────────────────────────────────────────── */

export function planFor(tenantId: string): Plan {
  const row = db().prepare("SELECT tier FROM tenants WHERE id = ?").get(tenantId) as
    | { tier: string }
    | undefined;
  return planById(row?.tier ?? "growth");
}

/* ── รอบบิล ────────────────────────────────────────────────────
   คำนวณจากปฏิทินกับ billing_day ทุกครั้ง ไม่เก็บสถานะ "รอบปัจจุบัน"
   ในฐานข้อมูล เพราะสถานะแบบนั้นต้องมีงานตามเวลามาเลื่อนให้ และถ้า
   งานนั้นไม่ทำงานคืนหนึ่ง ยอดใช้งานจะค้างอยู่ในรอบเก่าอย่างเงียบ ๆ */

export type Period = {
  start: Date;
  end: Date;
  daysLeft: number;
  daysTotal: number;
};

export function billingPeriod(billingDay: number, now = new Date()): Period {
  const day = Math.min(28, Math.max(1, Math.floor(billingDay) || 1));
  const start = new Date(now.getFullYear(), now.getMonth(), day, 0, 0, 0, 0);
  if (now < start) start.setMonth(start.getMonth() - 1);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);

  const dayMs = 86400000;
  return {
    start,
    end,
    daysLeft: Math.max(0, Math.ceil((end.getTime() - now.getTime()) / dayMs)),
    daysTotal: Math.round((end.getTime() - start.getTime()) / dayMs),
  };
}

/* ── จำนวนคนที่ระบุตัวตนได้ ────────────────────────────────────
   ตัวเลขที่ราคาคิดตาม จึงต้องนิยามให้ตรงกับที่หน้าราคาเขียน:
   คนที่มีตัวระบุอย่างน้อยหนึ่งอย่าง (จึงติดต่อหรือจับคู่ได้)
   ไม่ใช่จำนวนแถวในไฟล์ที่นำเข้า */
export function identifiedCount(tenantId: string): number {
  return (
    db()
      .prepare(
        `SELECT COUNT(*) AS n FROM customers c
         WHERE c.tenant_id = ?
           AND EXISTS (SELECT 1 FROM identities i WHERE i.customer_id = c.id)`,
      )
      .get(tenantId) as { n: number }
  ).n;
}

export type Usage = {
  plan: Plan;
  period: Period;
  billingDay: number;

  identified: number;
  contactCap: number | null;
  /** สัดส่วนของเพดานที่ใช้ไป — null เมื่อแผนไม่มีเพดานตัวเลข */
  contactPct: number | null;
  overCap: boolean;

  creditsLeft: number;
  messagesThisPeriod: number;
  messagesAllTime: number;
  /** ต้นทุนค่าส่งที่เกิดขึ้นจริงในรอบนี้ (บาท) */
  messageCostThisPeriod: number;
  /** จำนวนวันที่เครดิตคงเหลือจะพอ ตามอัตราการส่งของรอบนี้ — null เมื่อยังไม่ส่งเลย */
  creditRunwayDays: number | null;

  purchasesThisPeriod: { at: string; messages: number; baht: number; kind: string }[];
  creditSpendThisPeriod: number;
  /** ค่าสมาชิก + เครดิตที่ซื้อในรอบนี้ */
  invoiceThisPeriod: number;
};

export function usageFor(tenantId: string, now = new Date()): Usage {
  const d = db();
  const t = d
    .prepare(
      "SELECT tier, message_credits, billing_day FROM tenants WHERE id = ?",
    )
    .get(tenantId) as
    | { tier: string; message_credits: number; billing_day: number }
    | undefined;

  const plan = planById(t?.tier ?? "growth");
  const billingDay = t?.billing_day ?? 1;
  const period = billingPeriod(billingDay, now);
  const startIso = period.start.toISOString();

  const identified = identifiedCount(tenantId);

  const msgRow = d
    .prepare(
      `SELECT COUNT(*) AS n, COALESCE(SUM(m.cost), 0) AS c
       FROM messages m JOIN campaigns c2 ON c2.id = m.campaign_id
       WHERE c2.tenant_id = ? AND m.sent_at >= ?`,
    )
    .get(tenantId, startIso) as { n: number; c: number };

  const allTime = (
    d
      .prepare(
        `SELECT COUNT(*) AS n FROM messages m
         JOIN campaigns c2 ON c2.id = m.campaign_id WHERE c2.tenant_id = ?`,
      )
      .get(tenantId) as { n: number }
  ).n;

  const purchases = d
    .prepare(
      `SELECT at, messages, baht, kind FROM credit_purchases
       WHERE tenant_id = ? AND at >= ? ORDER BY at DESC`,
    )
    .all(tenantId, startIso) as {
    at: string;
    messages: number;
    baht: number;
    kind: string;
  }[];

  const creditSpend = purchases.reduce((s, p) => s + p.baht, 0);
  const creditsLeft = t?.message_credits ?? 0;

  const elapsedDays = Math.max(
    1,
    (now.getTime() - period.start.getTime()) / 86400000,
  );
  const perDay = msgRow.n / elapsedDays;

  const contactPct =
    plan.contactCap == null ? null : (identified / plan.contactCap) * 100;

  return {
    plan,
    period,
    billingDay,
    identified,
    contactCap: plan.contactCap,
    contactPct,
    overCap: plan.contactCap != null && identified > plan.contactCap,
    creditsLeft,
    messagesThisPeriod: msgRow.n,
    messagesAllTime: allTime,
    messageCostThisPeriod: msgRow.c,
    creditRunwayDays: perDay > 0 ? Math.floor(creditsLeft / perDay) : null,
    purchasesThisPeriod: purchases,
    creditSpendThisPeriod: creditSpend,
    invoiceThisPeriod: (plan.monthlyBaht ?? 0) + creditSpend,
  };
}

/* ── เพดานที่บังคับใช้จริง ─────────────────────────────────────── */

/** เหตุผลที่แผนนี้ยังส่งไม่ได้ — null คือส่งได้ */
export function reachBlockedReason(tenantId: string): string | null {
  const plan = planFor(tenantId);
  if (plan.caps.reach.kind === "yes") return null;
  return `${plan.name} can read the data but cannot send yet — upgrade to ${PLANS.growth.name} to unlock Reach.`;
}

/** เหตุผลที่นำเข้าข้อมูลชุดนี้ไม่ได้ — null คือนำเข้าได้ */
export function contactCapBlockedReason(
  tenantId: string,
  adding: number,
  opts: { replacing?: boolean } = {},
): string | null {
  const plan = planFor(tenantId);
  if (plan.contactCap == null) return null;
  /* แทนที่ทั้งฐานคือเริ่มจากศูนย์ ไม่ใช่บวกทับของเดิม — ถ้านับทับ
     ร้านที่อยู่ใกล้เพดานจะแก้ไขข้อมูลตัวเองไม่ได้เลย */
  const base = opts.replacing ? 0 : identifiedCount(tenantId);
  const after = base + Math.max(0, adding);
  if (after <= plan.contactCap) return null;
  const next = nextPlanUp(plan.id);
  return (
    `This file would leave ${after.toLocaleString("en-US")} identifiable customers, ` +
    `past the ${plan.name} cap of ${plan.contactCap.toLocaleString("en-US")}` +
    (next ? ` — ${PLANS[next].name} takes more than this.` : ".")
  );
}

export function nextPlanUp(id: PlanId): PlanId | null {
  const order: PlanId[] = ["free", "growth", "multi", "chain"];
  const i = order.indexOf(id);
  return i >= 0 && i < order.length - 1 ? order[i + 1] : null;
}

/** แผนที่เล็กที่สุดที่รับฐานขนาดนี้ได้ — ใช้ตอบว่า "ควรอยู่แผนไหน" */
export function planForBaseSize(people: number): PlanId {
  const order: PlanId[] = ["free", "growth", "multi", "chain"];
  for (const id of order) {
    const cap = PLANS[id].contactCap;
    if (cap == null || people <= cap) return id;
  }
  return "chain";
}

/* ── การเปลี่ยนแปลงยอดเงิน ─────────────────────────────────────── */

/** ซื้อเครดิตข้อความ — คืนจำนวนบาทที่คิด */
export function buyCredits(
  tenantId: string,
  messages: number,
  kind: "welcome" | "pack" = "pack",
  at = new Date(),
): number {
  const n = Math.max(0, Math.floor(messages));
  if (n === 0) return 0;
  const baht = kind === "welcome" ? 0 : priceForMessages(n);
  const d = db();
  d.exec("BEGIN");
  try {
    d.prepare(
      "UPDATE tenants SET message_credits = message_credits + ? WHERE id = ?",
    ).run(n, tenantId);
    d.prepare(
      `INSERT INTO credit_purchases (tenant_id, at, messages, baht, kind)
       VALUES (?,?,?,?,?)`,
    ).run(tenantId, at.toISOString(), n, baht, kind);
    d.exec("COMMIT");
  } catch (err) {
    d.exec("ROLLBACK");
    throw err;
  }
  logActivity(
    tenantId,
    "owner",
    "buy_credits",
    `${n.toLocaleString("en-US")} messages · ฿${baht.toLocaleString("en-US")}`,
  );
  return baht;
}

/** เปลี่ยนแผน — ของเดโม ระบบจริงต้องผ่านการชำระเงินและสัญญา */
export function changePlan(tenantId: string, planId: PlanId) {
  db().prepare("UPDATE tenants SET tier = ? WHERE id = ?").run(planId, tenantId);
  logActivity(tenantId, "owner", "change_plan", PLANS[planId].name);
}

/* ── ค่าส่งรายแคมเปญ ───────────────────────────────────────────
   คืนแคมเปญล่าสุดพร้อมธงว่าอยู่ในรอบบิลปัจจุบันไหม ไม่ใช่กรองเฉพาะ
   ในรอบ — เพราะประวัติของบัญชีตัวอย่างกระจายย้อนหลังกว่าปี ตารางที่
   กรองเฉพาะรอบนี้จึงว่างเปล่าตลอดเวลาและอ่านเหมือนระบบพัง
   ยอดรวมของรอบยังคิดจาก usageFor ซึ่งกรองตามรอบจริง */
export function recentCampaignCosts(
  tenantId: string,
  limit = 12,
  now = new Date(),
) {
  const period = billingPeriod(
    (
      db()
        .prepare("SELECT billing_day FROM tenants WHERE id = ?")
        .get(tenantId) as { billing_day: number } | undefined
    )?.billing_day ?? 1,
    now,
  );
  const startIso = period.start.toISOString();

  const rows = db()
    .prepare(
      `SELECT c.id, c.play_id, c.approved_at,
              MAX(m.sent_at) AS last_sent_at,
              COUNT(m.customer_id) AS sent,
              COALESCE(SUM(m.cost), 0) AS cost
       FROM campaigns c JOIN messages m ON m.campaign_id = c.id
       WHERE c.tenant_id = ? AND m.sent_at IS NOT NULL
       GROUP BY c.id
       ORDER BY last_sent_at DESC
       LIMIT ?`,
    )
    .all(tenantId, limit) as {
    id: string;
    play_id: string;
    approved_at: string;
    last_sent_at: string;
    sent: number;
    cost: number;
  }[];

  return rows.map((r) => ({ ...r, inPeriod: r.last_sent_at >= startIso }));
}

export { MESSAGE_COST_BAHT };
