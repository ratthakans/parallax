import { db } from "./db";
import { loadFeatures, type StoredFeature } from "./derive";
import { ALL_PLAYS } from "./plays";
import type { Candidate, MeasurementMode, Play, Selector } from "./types";

/* ── MATCH ─────────────────────────────────────────────────────
   รัน selector ของทุก play ทั้งสองฝั่ง แล้วจัดอันดับ

   ขั้นนี้ต้องเป็น deterministic ห้ามใช้ LLM (Play Engine §5 · §8)
   — ต้องอธิบายได้ว่าทำไมคนนี้อยู่ในกลุ่ม
   — ต้องรันซ้ำได้ผลเดิม
   — ต้องไม่มีต้นทุนต่อการรัน
   ───────────────────────────────────────────────────────────── */

/* ราคาต่อข้อความอยู่ที่ lib/plans.ts ที่เดียว — เดิมเลข 0.75 ถูกพิมพ์ซ้ำ
   ในสามไฟล์ (ที่นี่ · dispatch · คำอธิบายใน proof) ราคาที่เขียนไว้สามที่
   คือราคาที่จะไม่ตรงกันเองหลังการปรับครั้งแรก */
import { MEDIA_COST_PER_PERSON, MESSAGE_COST_BAHT as MESSAGE_COST } from "./plans";

export type TenantSettings = {
  id: string;
  name: string;
  cycle_shape: string;
  tier: string;
  max_messages_per_week: number;
  quiet_hours_start: number;
  quiet_hours_end: number;
  max_discount_pct: number;
  message_credits: number;
};

export type TenantPlayConfig = {
  play_id: string;
  enabled: boolean;
  min_audience: number | null;
  cooldown_days: number | null;
  max_discount_pct: number | null;
};

export function getTenant(tenantId: string): TenantSettings | undefined {
  return db().prepare("SELECT * FROM tenants WHERE id = ?").get(tenantId) as
    | TenantSettings
    | undefined;
}

export function getTenantPlays(tenantId: string): Map<string, TenantPlayConfig> {
  const rows = db()
    .prepare("SELECT * FROM tenant_plays WHERE tenant_id = ?")
    .all(tenantId) as (Omit<TenantPlayConfig, "enabled"> & { enabled: number })[];
  return new Map(
    rows.map((r) => [r.play_id, { ...r, enabled: Boolean(r.enabled) }]),
  );
}

/** guard ที่ใช้จริง = ค่าตั้งต้นของ play ทับด้วยค่าที่ร้านปรับ (D4) */
export function effectiveGuards(play: Play, cfg?: TenantPlayConfig) {
  return {
    min_audience: cfg?.min_audience ?? play.guards.min_audience,
    cooldown_days: cfg?.cooldown_days ?? play.guards.cooldown_days,
    max_discount_pct: cfg?.max_discount_pct ?? play.guards.max_discount_pct,
  };
}

/* ── selector evaluation ─────────────────────────────────────── */

function matchesSelector(f: StoredFeature, s: Selector): boolean {
  if (s.consent_marketing && !f.consent_marketing) return false;
  if (s.reachable_by && !s.reachable_by.includes(f.reachable_by)) return false;

  if (s.monetary_percentile_min != null && f.monetary_percentile < s.monetary_percentile_min)
    return false;
  if (s.ltv_decile_min != null && f.ltv_decile < s.ltv_decile_min) return false;

  if (s.churn_risk_min != null && f.churn_risk < s.churn_risk_min) return false;
  if (s.churn_risk_max != null && f.churn_risk > s.churn_risk_max) return false;
  if (s.cycle_multiple_min != null && f.churn_risk < s.cycle_multiple_min) return false;

  if (s.bought_group && !f.bought_groups.includes(s.bought_group)) return false;
  if (s.not_bought_group && f.bought_groups.includes(s.not_bought_group)) return false;
  if (s.days_since_anchor) {
    const [lo, hi] = s.days_since_anchor;
    if (f.last_anchor_days == null || f.last_anchor_days < lo || f.last_anchor_days > hi)
      return false;
  }

  if (s.used_service_no_product && !(f.used_service && f.frequency_total === 0))
    return false;

  if (s.signed_up_days) {
    const [lo, hi] = s.signed_up_days;
    if (f.signup_days < lo || f.signup_days > hi) return false;
  }
  if (s.no_purchase_ever && f.frequency_total > 0) return false;

  if (s.visit_to_purchase_ratio_min != null) {
    const ratio = f.visits / Math.max(1, f.frequency_total);
    if (ratio < s.visit_to_purchase_ratio_min) return false;
  }

  if (s.tier_gap_max != null && (f.tier_gap < 0 || f.tier_gap > s.tier_gap_max))
    return false;

  if (s.predicted_next_within_days != null) {
    const days = Math.round(
      (Date.parse(f.predicted_next_date) - Date.now()) / 86400000,
    );
    if (days < -3 || days > s.predicted_next_within_days) return false;
  }
  if (s.expiry_within_days != null) {
    if (f.expiry_in_days == null || f.expiry_in_days < 0 || f.expiry_in_days > s.expiry_within_days)
      return false;
  }
  if (s.recall_within_days != null) {
    if (f.recall_in_days == null || f.recall_in_days < 0 || f.recall_in_days > s.recall_within_days)
      return false;
  }
  if (s.lifecycle_within_days != null) {
    if (f.lifecycle_in_days == null || f.lifecycle_in_days > s.lifecycle_within_days)
      return false;
  }

  if (s.affinity_new_arrival && !f.affinity_new_arrival) return false;
  if (s.dead_stock_match && !f.dead_stock_match) return false;
  if (s.never_referred && !f.never_referred) return false;

  if (s.discount_affinity && !s.discount_affinity.includes(f.discount_affinity))
    return false;
  if (s.price_tier_min != null && f.price_tier < s.price_tier_min) return false;
  if (s.frequency_90d_min != null && f.frequency_90d < s.frequency_90d_min) return false;

  if (s.repeat_buyer === true && f.frequency_total < 2) return false;
  if (s.repeat_buyer === false && f.frequency_total < 1) return false;
  if (s.one_and_done && f.frequency_total !== 1) return false;
  if (s.anchor_starter && !f.anchor_starter) return false;
  if (s.no_adjacent_category && f.affinity_categories.length > 2) return false;

  if (s.lapsed_lead_days) {
    const [lo, hi] = s.lapsed_lead_days;
    if (f.lapsed_lead_days == null || f.lapsed_lead_days < lo || f.lapsed_lead_days > hi)
      return false;
  }

  return true;
}

/* ── กติกาการวัด เลือกจากขนาดกลุ่ม ไม่ใช่จากความอยากรายงาน (H3) ── */
export function pickMeasurement(size: number): {
  measurement: MeasurementMode;
  holdout_pct: number;
  note: string;
} {
  if (size >= 1000) {
    return {
      measurement: "per_campaign_holdout",
      holdout_pct: 15,
      note: "Large enough to report a per-campaign difference",
    };
  }
  if (size >= 300) {
    return {
      measurement: "pooled_90d_holdout",
      holdout_pct: 15,
      note: "Genuinely held back, but pooled every 90 days rather than per campaign",
    };
  }
  return {
    measurement: "time_shifted",
    holdout_pct: 0,
    note: "Too small for a holdout — time-shifted instead",
  };
}

/* ── เพดานความถี่ข้ามทุกแคมเปญ (F9 · กับดักข้อ 1) ──────────────
   ลูกค้าคนหนึ่งเข้าเกณฑ์ห้า play พร้อมกันได้ง่ายมาก
   จึงต้องตรวจข้ามทั้ง Keep และ Reach ไม่ใช่ตรวจแค่ภายใน play เดียว */
function recentContactCounts(tenantId: string, days: number): Map<string, number> {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const rows = db()
    .prepare(
      `SELECT ca.customer_id AS id, COUNT(*) AS n
       FROM campaign_audience ca
       JOIN campaigns c ON c.id = ca.campaign_id
       WHERE c.tenant_id = ? AND c.dry_run = 0 AND ca.arm = 'treated'
         AND c.approved_at >= ?
       GROUP BY ca.customer_id`,
    )
    .all(tenantId, since) as { id: string; n: number }[];
  return new Map(rows.map((r) => [r.id, r.n]));
}

function lastRunByPlay(tenantId: string): Map<string, string> {
  const rows = db()
    .prepare(
      `SELECT play_id, MAX(approved_at) AS last_at
       FROM campaigns WHERE tenant_id = ? AND dry_run = 0
       GROUP BY play_id`,
    )
    .all(tenantId) as { play_id: string; last_at: string }[];
  return new Map(rows.map((r) => [r.play_id, r.last_at]));
}

/** หน้าต่างที่ถือว่าแคมเปญยังรอการตอบสนอง — สั้นกว่าหน้าต่างวัดผล */
const RESPONSE_WINDOW_DAYS = 14;

/* ── คนที่ถูกล็อกไม่ให้ดึงซ้ำ ─────────────────────────────────
   แยกสองกรณีออกจากกัน เพราะเหตุผลไม่เหมือนกัน

   กลุ่ม holdout — ล็อกตลอดหน้าต่างวัดผลที่ยังไม่จบ ถ้าคนกลุ่มนี้
   ได้รับข้อความจากแคมเปญอื่นระหว่างทาง กลุ่มควบคุมจะปนเปื้อน
   และส่วนต่างที่วัดได้จะไม่มีความหมาย

   กลุ่ม treated — ล็อกแค่ช่วงรอการตอบสนอง หลังจากนั้นปล่อยให้
   เพดานความถี่รายสัปดาห์เป็นตัวคุม ไม่ใช่ล็อกยาว 90 วัน
   ซึ่งจะทำให้ทักลูกค้าได้ปีละสี่ครั้งเท่านั้น
   ───────────────────────────────────────────────────────────── */
function lockedCustomers(tenantId: string): {
  holdoutLocked: Set<string>;
  responseLocked: Set<string>;
} {
  const since = new Date(
    Date.now() - RESPONSE_WINDOW_DAYS * 86400000,
  ).toISOString();

  const holdout = db()
    .prepare(
      `SELECT DISTINCT ca.customer_id AS id
       FROM campaign_audience ca
       JOIN campaigns c ON c.id = ca.campaign_id
       WHERE c.tenant_id = ? AND c.dry_run = 0 AND c.status = 'measuring'
         AND ca.arm = 'holdout'`,
    )
    .all(tenantId) as { id: string }[];

  const responding = db()
    .prepare(
      `SELECT DISTINCT ca.customer_id AS id
       FROM campaign_audience ca
       JOIN campaigns c ON c.id = ca.campaign_id
       WHERE c.tenant_id = ? AND c.dry_run = 0 AND ca.arm = 'treated'
         AND c.approved_at >= ?`,
    )
    .all(tenantId, since) as { id: string }[];

  return {
    holdoutLocked: new Set(holdout.map((r) => r.id)),
    responseLocked: new Set(responding.map((r) => r.id)),
  };
}

/* posterior ต้องอ่านของรูปทรงวงจรเดียวกัน ไม่ใช่แถวไหนก็ได้

   `LIMIT 1` โดยไม่ระบุ cycle_shape ทำให้สนามกอล์ฟ (expiry) หยิบสถิติ
   ของร้านค้าปลีก (considered) มาใช้ ซึ่งขัดกับข้อความหลักของ engine
   ที่บอกว่าเรียนรู้ข้ามร้าน "ในวงจรเดียวกัน" — ถ้าปนวงจรกัน อัตรา
   ตอบสนองที่คาดจะเพี้ยนทันทีที่มีลูกค้าเจ้าที่สองที่วงจรไม่เหมือนเจ้าแรก */
function posteriorRate(
  playId: string,
  cycleShape: string,
  fallback: number,
): number {
  const d = db();
  const row =
    (d
      .prepare(
        `SELECT posterior_alpha AS a, posterior_beta AS b
         FROM play_performance WHERE play_id = ? AND cycle_shape = ? LIMIT 1`,
      )
      .get(playId, cycleShape) as { a: number; b: number } | undefined) ??
    // ยังไม่มีสถิติของวงจรนี้ — รวมทุกวงจรเป็นค่าประมาณกว้าง ๆ ดีกว่าไม่มีอะไรเลย
    (d
      .prepare(
        `SELECT SUM(posterior_alpha) AS a, SUM(posterior_beta) AS b
         FROM play_performance WHERE play_id = ?`,
      )
      .get(playId) as { a: number | null; b: number | null } | undefined);
  if (!row?.a || !row?.b) return fallback;
  return row.a / (row.a + row.b);
}

export type MatchResult = {
  candidates: Candidate[];
  features: StoredFeature[];
  weeklyCap: number;
};

export function runMatch(tenantId: string): MatchResult {
  const tenant = getTenant(tenantId);
  const features = loadFeatures(tenantId);
  const cfgs = getTenantPlays(tenantId);
  const weeklyCap = tenant?.max_messages_per_week ?? 2;

  const contacts = recentContactCounts(tenantId, 7);
  const lastRun = lastRunByPlay(tenantId);
  const { holdoutLocked, responseLocked } = lockedCustomers(tenantId);

  const candidates: Candidate[] = [];

  /* play ผูกกับรูปทรงวงจร ไม่ผูกกับอุตสาหกรรม (blueprint §5)
     จึงต้องกรองด้วยวงจรของบัญชี ไม่ใช่รันทุก play ให้ทุกคน —
     ไม่อย่างนั้นบริษัทแท็กซี่จะได้รับข้อเสนอ "ล้างสต๊อกค้าง"
     ซึ่งไม่มีความหมายและทำลายความน่าเชื่อถือของบรีฟทั้งหน้า */
  const shape = tenant?.cycle_shape ?? "considered";

  for (const play of ALL_PLAYS) {
    if (!play.cycle_shape.includes(shape as never)) continue;
    const cfg = cfgs.get(play.id);
    if (cfg && !cfg.enabled) continue;
    const guards = effectiveGuards(play, cfg);

    // cooldown ระดับ play
    const last = lastRun.get(play.id);
    const cooldownBlocked =
      last != null &&
      (Date.now() - Date.parse(last)) / 86400000 < guards.cooldown_days;

    const filtered: { reason: string; count: number }[] = [];
    let noConsent = 0;
    let cappedOut = 0;
    let respondingOut = 0;
    let holdoutOut = 0;
    const audience: string[] = [];

    for (const f of features) {
      if (!matchesSelector(f, play.selector)) continue;

      /* กรองความยินยอมที่ชั้น dispatch ไม่ใช่ชั้นหน้าจอ (B8)

         บังคับกับทุก play ไม่มีข้อยกเว้น — รวมรายชื่อตัดออกด้วย
         เพราะการอัปโหลดตัวระบุขึ้นแพลตฟอร์มโฆษณาคือการเปิดเผยข้อมูล
         ต่อบุคคลที่สาม ไม่ว่าเจตนาจะเป็นการ "ตัดออก" ก็ตาม
         ผลข้างเคียงที่ยอมรับ: คนที่ถอนความยินยอมจะไม่ถูกใส่ในรายชื่อ
         ตัดออก จึงอาจยังเห็นโฆษณา — นั่นคือผลที่ถูกกฎหมาย */
      if (!f.consent_marketing) {
        noConsent++;
        continue;
      }
      /* กลุ่มควบคุมของแคมเปญที่ยังวัดผลอยู่ ต้องไม่ถูกแตะเลย
         แม้แต่รายชื่อตัดออก เพราะการถูกตัดออกจากโฆษณาก็เป็นการ
         แทรกแซงที่ทำให้กลุ่มควบคุมไม่เทียบเท่ากลุ่มที่ส่งอีกต่อไป */
      if (holdoutLocked.has(f.customer_id)) {
        holdoutOut++;
        continue;
      }
      // รายชื่อตัดออกไม่นับเป็นการติดต่อ จึงไม่ติดเพดานความถี่
      const isSuppression = play.offer.type === "suppression_list";
      if (!isSuppression) {
        if ((contacts.get(f.customer_id) ?? 0) >= weeklyCap) {
          cappedOut++;
          continue;
        }
        if (responseLocked.has(f.customer_id)) {
          respondingOut++;
          continue;
        }
      }
      audience.push(f.customer_id);
    }

    if (noConsent) filtered.push({ reason: "No marketing consent", count: noConsent });
    if (cappedOut) filtered.push({ reason: `Hit the ${weeklyCap}-per-week cap`, count: cappedOut });
    if (respondingOut)
      filtered.push({
        reason: `Messaged within the last ${RESPONSE_WINDOW_DAYS} days`,
        count: respondingOut,
      });
    if (holdoutOut)
      filtered.push({
        reason: "In the control group of a campaign still measuring",
        count: holdoutOut,
      });

    const size = audience.length;
    const { measurement, holdout_pct } = pickMeasurement(size);
    const rate = posteriorRate(play.id, shape, play.priors.response_rate);
    const priceWeight = 1;
    const perPerson =
      play.engine === "keep" ? MESSAGE_COST : MEDIA_COST_PER_PERSON;
    const treated = Math.max(1, Math.round(size * (1 - holdout_pct / 100)));
    const discountCost =
      play.engine === "keep"
        ? treated * rate * play.expected_order_value * (guards.max_discount_pct / 100)
        : 0;
    const estimatedCost = treated * perPerson + discountCost;

    const expectedValue =
      play.offer.type === "suppression_list"
        ? size * MEDIA_COST_PER_PERSON // มูลค่าคือค่าสื่อที่ประหยัดได้
        : treated * rate * play.expected_order_value;

    const score =
      estimatedCost > 0 ? (expectedValue * priceWeight) / estimatedCost : 0;

    let blocked: string | undefined;
    if (size === 0) blocked = "Nobody qualifies this round";
    else if (size < guards.min_audience)
      blocked = `Cohort below the ${guards.min_audience} minimum`;
    else if (cooldownBlocked)
      blocked = `Within the ${guards.cooldown_days}-day cooldown`;

    candidates.push({
      play,
      audience,
      filtered,
      score: Number(score.toFixed(2)),
      expected_response_rate: Number(rate.toFixed(4)),
      expected_order_value: play.expected_order_value,
      estimated_cost: Math.round(estimatedCost),
      expected_value: Math.round(expectedValue),
      measurement,
      holdout_pct,
      blocked,
    });
  }

  candidates.sort((a, b) => {
    if (Boolean(a.blocked) !== Boolean(b.blocked)) return a.blocked ? 1 : -1;
    return b.score - a.score;
  });

  return { candidates, features, weeklyCap };
}

/** สามอย่างที่ควรทำวันนี้ — บรีฟเช้า (E1) */
export function topThree(candidates: Candidate[]): Candidate[] {
  return candidates.filter((c) => !c.blocked).slice(0, 3);
}
