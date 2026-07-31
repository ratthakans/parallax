import { db } from "./db";
import type { CustomerFeature, DiscountAffinity, GroupRole, ReachableBy } from "./types";

/* ── DERIVE ────────────────────────────────────────────────────
   คำนวณ feature รายคนล่วงหน้า (Play Engine §5)
   ห้ามคำนวณสดตอนเปิดหน้า — หน้าจอต้องอ่านจากตารางนี้เท่านั้น

   personal_cycle_days คือมุมที่สองของการวัดลูกค้ารายคน และเป็น
   เหตุผลที่ระบบไม่ใช้เกณฑ์ "เงียบเกิน 90 วัน" กับทุกคน
   ───────────────────────────────────────────────────────────── */

const DAY = 86400000;

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

type TxnRow = {
  customer_id: string;
  occurred_at: string;
  total: number;
  discount_total: number;
};

export function deriveFeatures(tenantId: string) {
  const d = db();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  const customers = d
    .prepare("SELECT id, name, created_at FROM customers WHERE tenant_id = ?")
    .all(tenantId) as { id: string; name: string; created_at: string }[];

  const txns = d
    .prepare(
      `SELECT t.customer_id, t.occurred_at, t.total, t.discount_total
       FROM transactions t JOIN customers c ON c.id = t.customer_id
       WHERE c.tenant_id = ? ORDER BY t.customer_id, t.occurred_at`,
    )
    .all(tenantId) as TxnRow[];

  const lineRows = d
    .prepare(
      `SELECT t.customer_id, p.group_role, p.category, li.unit_price, li.unit_list_price,
              li.qty, t.occurred_at
       FROM line_items li
       JOIN transactions t ON t.id = li.txn_id
       JOIN products p ON p.id = li.product_id
       JOIN customers c ON c.id = t.customer_id
       WHERE c.tenant_id = ?`,
    )
    .all(tenantId) as {
    customer_id: string;
    group_role: GroupRole;
    category: string;
    unit_price: number;
    unit_list_price: number;
    qty: number;
    occurred_at: string;
  }[];

  const eventRows = d
    .prepare(
      `SELECT e.customer_id, e.type, e.occurred_at, e.meta
       FROM events e JOIN customers c ON c.id = e.customer_id
       WHERE c.tenant_id = ?`,
    )
    .all(tenantId) as {
    customer_id: string;
    type: string;
    occurred_at: string;
    meta: string | null;
  }[];

  const memberRows = d
    .prepare(
      `SELECT m.customer_id, m.expires_at, m.started_at
       FROM memberships m JOIN customers c ON c.id = m.customer_id
       WHERE c.tenant_id = ?`,
    )
    .all(tenantId) as {
    customer_id: string;
    expires_at: string | null;
    started_at: string;
  }[];

  const consentRows = d
    .prepare(
      `SELECT s.customer_id, s.purpose, s.granted_at, s.revoked_at
       FROM consents s JOIN customers c ON c.id = s.customer_id
       WHERE c.tenant_id = ?`,
    )
    .all(tenantId) as {
    customer_id: string;
    purpose: string;
    granted_at: string | null;
    revoked_at: string | null;
  }[];

  const lineIdentities = new Set(
    (
      d
        .prepare(
          `SELECT i.customer_id FROM identities i
           JOIN customers c ON c.id = i.customer_id
           WHERE c.tenant_id = ? AND i.type = 'line'`,
        )
        .all(tenantId) as { customer_id: string }[]
    ).map((r) => r.customer_id),
  );

  const newArrivalCats = new Set(
    (
      d
        .prepare(
          "SELECT category FROM products WHERE tenant_id = ? AND is_new_arrival = 1",
        )
        .all(tenantId) as { category: string }[]
    ).map((r) => r.category),
  );
  const deadStockCats = new Set(
    (
      d
        .prepare(
          "SELECT category FROM products WHERE tenant_id = ? AND is_dead_stock = 1",
        )
        .all(tenantId) as { category: string }[]
    ).map((r) => r.category),
  );

  // ── รวมข้อมูลต่อคน ──
  const byCustomer = new Map<
    string,
    {
      dates: number[];
      totals: number[];
      discount: number;
      groups: Set<GroupRole>;
      cats: Map<string, number>;
      lastAnchor: number | null;
      unitPaid: number;
      unitList: number;
      firstGroup: GroupRole | null;
    }
  >();
  const blank = () => ({
    dates: [] as number[],
    totals: [] as number[],
    discount: 0,
    groups: new Set<GroupRole>(),
    cats: new Map<string, number>(),
    lastAnchor: null as number | null,
    unitPaid: 0,
    unitList: 0,
    firstGroup: null as GroupRole | null,
  });

  for (const t of txns) {
    const e = byCustomer.get(t.customer_id) ?? blank();
    e.dates.push(Date.parse(t.occurred_at));
    e.totals.push(t.total);
    e.discount += t.discount_total;
    byCustomer.set(t.customer_id, e);
  }
  // เรียงตามเวลาเพื่อให้รู้ว่าเริ่มความสัมพันธ์จากกลุ่มไหน
  const sortedLines = [...lineRows].sort(
    (a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at),
  );
  for (const l of sortedLines) {
    const e = byCustomer.get(l.customer_id) ?? blank();
    e.groups.add(l.group_role);
    e.cats.set(l.category, (e.cats.get(l.category) ?? 0) + l.qty);
    e.unitPaid += l.unit_price * l.qty;
    e.unitList += l.unit_list_price * l.qty;
    if (e.firstGroup === null) e.firstGroup = l.group_role;
    if (l.group_role === "anchor") {
      const ts = Date.parse(l.occurred_at);
      if (e.lastAnchor === null || ts > e.lastAnchor) e.lastAnchor = ts;
    }
    byCustomer.set(l.customer_id, e);
  }

  const eventsByCustomer = new Map<string, typeof eventRows>();
  for (const e of eventRows) {
    const list = eventsByCustomer.get(e.customer_id) ?? [];
    list.push(e);
    eventsByCustomer.set(e.customer_id, list);
  }
  const memberByCustomer = new Map(memberRows.map((m) => [m.customer_id, m]));
  const consentByCustomer = new Map<string, { granted: boolean }>();
  for (const c of consentRows) {
    if (c.purpose !== "marketing") continue;
    consentByCustomer.set(c.customer_id, {
      granted: Boolean(c.granted_at) && !c.revoked_at,
    });
  }

  /* วงจรของทั้งกลุ่ม — ใช้เป็น fallback ให้คนที่ซื้อครั้งเดียว
     ซึ่งคำนวณวงจรตัวเองไม่ได้ (กับดักข้อ 4 ใน §10) */
  const allGaps: number[] = [];
  for (const e of byCustomer.values()) {
    const ds = [...e.dates].sort((a, b) => a - b);
    for (let i = 1; i < ds.length; i++) allGaps.push((ds[i] - ds[i - 1]) / DAY);
  }
  const cohortCycle = Math.max(14, Math.round(median(allGaps) || 90));

  // เปอร์เซ็นไทล์มูลค่า
  const ltvPairs = customers.map((c) => {
    const e = byCustomer.get(c.id);
    return { id: c.id, ltv: e ? e.totals.reduce((a, b) => a + b, 0) : 0 };
  });
  const sortedLtv = [...ltvPairs].sort((a, b) => a.ltv - b.ltv);
  const rankOf = new Map<string, number>();
  sortedLtv.forEach((r, i) => rankOf.set(r.id, i));
  const n = sortedLtv.length || 1;

  // ระดับราคาที่ยอมจ่าย — ควอร์ไทล์ของราคาต่อชิ้นที่จ่ายจริง
  const avgUnitPrices = customers
    .map((c) => {
      const e = byCustomer.get(c.id);
      if (!e || !e.totals.length) return 0;
      return e.unitPaid / Math.max(1, e.totals.length);
    })
    .filter((x) => x > 0)
    .sort((a, b) => a - b);
  const q = (p: number) =>
    avgUnitPrices.length
      ? avgUnitPrices[Math.min(avgUnitPrices.length - 1, Math.floor(avgUnitPrices.length * p))]
      : 0;
  const quartiles = [q(0.25), q(0.5), q(0.75)];

  const ins = d.prepare(
    `INSERT INTO customer_features (customer_id, tenant_id, computed_at, payload)
     VALUES (?,?,?,?)
     ON CONFLICT(customer_id) DO UPDATE SET
       computed_at = excluded.computed_at, payload = excluded.payload`,
  );

  d.exec("BEGIN");
  try {
    for (const c of customers) {
      const e = byCustomer.get(c.id);
      const dates = e ? [...e.dates].sort((a, b) => a - b) : [];
      const frequencyTotal = dates.length;
      const ltv = e ? e.totals.reduce((a, b) => a + b, 0) : 0;
      const aov = frequencyTotal ? ltv / frequencyTotal : 0;
      const recencyDays = dates.length
        ? Math.floor((now - dates[dates.length - 1]) / DAY)
        : Math.floor((now - Date.parse(c.created_at)) / DAY);

      const gaps: number[] = [];
      for (let i = 1; i < dates.length; i++) gaps.push((dates[i] - dates[i - 1]) / DAY);
      const cycleIsEstimated = gaps.length === 0;
      const personalCycle = cycleIsEstimated
        ? cohortCycle
        : Math.max(7, Math.round(median(gaps)));
      const mean = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
      const variance = gaps.length
        ? Math.sqrt(gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length) /
          Math.max(1, mean)
        : 0;

      const churnRisk = recencyDays / personalCycle;
      const freq90 = dates.filter((t) => now - t <= 90 * DAY).length;

      const discountShare = e && e.unitList > 0 ? 1 - e.unitPaid / e.unitList : 0;
      const discountAffinity: DiscountAffinity =
        discountShare < 0.02 ? "full_price" : discountShare < 0.12 ? "mixed" : "discount_seeker";

      const avgUnit = e && frequencyTotal ? e.unitPaid / frequencyTotal : 0;
      const priceTier =
        avgUnit === 0 ? 0 : avgUnit <= quartiles[0] ? 1 : avgUnit <= quartiles[1] ? 2 : avgUnit <= quartiles[2] ? 3 : 4;

      const consent = consentByCustomer.get(c.id);
      const consentMarketing = Boolean(consent?.granted);
      const hasLine = lineIdentities.has(c.id);
      /* reachable_by คือสวิตช์ที่โยนคนจาก Keep ไป Reach

         ไม่มีความยินยอม หรือถอนแล้ว → none และแปลว่าห้ามทั้งส่งข้อความ
         และห้ามส่งออกไปแพลตฟอร์มโฆษณา เพราะการอัปโหลดตัวระบุที่ hash แล้ว
         ยังนับเป็นการเปิดเผยข้อมูลต่อบุคคลที่สาม

         paid_only = ยินยอมอยู่ แต่ไม่มีช่องทางตรงให้ทัก (ไม่มี LINE)
         จึงเห็นได้เฉพาะผ่านสื่อที่เสียเงิน — นี่คือจุดที่ Keep ยอมแพ้
         แล้ว Reach รับต่ออย่างถูกกฎหมาย */
      const reachableBy: ReachableBy = !consentMarketing
        ? "none"
        : hasLine
          ? "line"
          : "paid_only";

      const evs = eventsByCustomer.get(c.id) ?? [];
      const visits = evs.filter((x) => x.type === "visit").length;
      const usedService = evs.some((x) => x.type === "booking");
      const formEvent = evs
        .filter((x) => x.type === "form")
        .sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at))[0];
      const lapsedLeadDays = formEvent
        ? Math.floor((now - Date.parse(formEvent.occurred_at)) / DAY)
        : null;

      const mem = memberByCustomer.get(c.id);
      const expiryInDays = mem?.expires_at
        ? Math.floor((Date.parse(mem.expires_at) - now) / DAY)
        : null;

      // ถึงรอบบริการ — รอบ 180 วันนับจากบริการครั้งล่าสุด
      const lastBooking = evs
        .filter((x) => x.type === "booking")
        .sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at))[0];
      const recallInDays = lastBooking
        ? 180 - Math.floor((now - Date.parse(lastBooking.occurred_at)) / DAY)
        : null;

      // วันครบรอบการสมัคร ใช้แทนวันเกิดในชุดข้อมูลตัวอย่าง
      const signupDate = new Date(c.created_at);
      const anniv = new Date(signupDate);
      anniv.setFullYear(new Date(now).getFullYear());
      let lifecycleInDays = Math.floor((anniv.getTime() - now) / DAY);
      if (lifecycleInDays < 0) lifecycleInDays += 365;

      const affinityCats = e ? [...e.cats.keys()] : [];
      const rank = rankOf.get(c.id) ?? 0;
      const monetaryPercentile = Math.round((rank / Math.max(1, n - 1)) * 100);
      const ltvDecile = Math.min(10, Math.floor((rank / n) * 10) + 1);

      const TIER_THRESHOLD = 50000;
      const tierGap = ltv > 0 && ltv < TIER_THRESHOLD ? TIER_THRESHOLD - ltv : Infinity;

      const feature: CustomerFeature = {
        customer_id: c.id,
        name: c.name,
        recency_days: recencyDays,
        frequency_90d: freq90,
        frequency_total: frequencyTotal,
        monetary_ltv: Math.round(ltv),
        avg_order_value: Math.round(aov),
        personal_cycle_days: personalCycle,
        cycle_is_estimated: cycleIsEstimated,
        cycle_variance: Number(variance.toFixed(2)),
        churn_risk: Number(churnRisk.toFixed(2)),
        price_tier: priceTier,
        discount_affinity: discountAffinity,
        discount_share: Number(discountShare.toFixed(3)),
        predicted_next_date: new Date(
          (dates.length ? dates[dates.length - 1] : now) + personalCycle * DAY,
        )
          .toISOString()
          .slice(0, 10),
        reachable_by: reachableBy,
        monetary_percentile: monetaryPercentile,
        ltv_decile: ltvDecile,
        bought_groups: e ? [...e.groups] : [],
        last_anchor_days:
          e?.lastAnchor != null ? Math.floor((now - e.lastAnchor) / DAY) : null,
        used_service: usedService,
        visits,
        signup_days: Math.floor((now - Date.parse(c.created_at)) / DAY),
        expiry_in_days: expiryInDays,
        recall_in_days: recallInDays,
        lifecycle_in_days: lifecycleInDays,
        affinity_categories: affinityCats,
        never_referred: true,
        lapsed_lead_days: lapsedLeadDays,
        consent_marketing: consentMarketing,
        tier_gap: tierGap === Infinity ? -1 : Math.round(tierGap),
      };

      // ธงสองตัวที่ต้องรู้หมวดของร้าน จึงคำนวณท้ายสุด
      const hasNewArrivalAffinity = affinityCats.some((k) => newArrivalCats.has(k));
      const hasDeadStockAffinity = affinityCats.some((k) => deadStockCats.has(k));

      ins.run(
        c.id,
        tenantId,
        nowIso,
        JSON.stringify({
          ...feature,
          affinity_new_arrival: hasNewArrivalAffinity,
          dead_stock_match: hasDeadStockAffinity,
          anchor_starter: e?.firstGroup === "anchor",
        }),
      );
    }
    d.exec("COMMIT");
  } catch (err) {
    d.exec("ROLLBACK");
    throw err;
  }

  return { customers: customers.length, cohortCycle, computedAt: nowIso };
}

export type StoredFeature = CustomerFeature & {
  affinity_new_arrival: boolean;
  dead_stock_match: boolean;
  anchor_starter: boolean;
};

export function loadFeatures(tenantId: string): StoredFeature[] {
  const rows = db()
    .prepare("SELECT payload FROM customer_features WHERE tenant_id = ?")
    .all(tenantId) as { payload: string }[];
  return rows.map((r) => JSON.parse(r.payload) as StoredFeature);
}

export function featuresComputedAt(tenantId: string): string | null {
  const row = db()
    .prepare(
      "SELECT computed_at FROM customer_features WHERE tenant_id = ? LIMIT 1",
    )
    .get(tenantId) as { computed_at: string } | undefined;
  return row?.computed_at ?? null;
}
