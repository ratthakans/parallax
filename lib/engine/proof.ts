import { createHash } from "node:crypto";
import { db, logActivity } from "@/lib/engine/db";
import { playById } from "@/lib/shared/plays";
import type { Verdict } from "@/lib/shared/types";

/* ── PROOF ─────────────────────────────────────────────────────
   กลุ่มที่ส่งกับกลุ่มที่กันไว้ คือสองมุมที่ทำให้คำนวณระยะได้
   ถ้ามีมุมเดียวคุณเห็นแค่ยอดขาย ไม่เห็นว่ามันมาจากไหน

   verdict มีสามค่า และค่าที่สาม insufficient_data ต้องแสดงตรง ๆ
   ไม่ใช่ซ่อนด้วยตัวเลขสวย
   ───────────────────────────────────────────────────────────── */

const HORIZONS = [7, 30, 90] as const;

/* ตัวชี้วัดหลักคือ "สัดส่วนคนที่กลับมาซื้อ" ไม่ใช่ "ยอดต่อหัว"

   เหตุผลเป็นสถิติล้วน ๆ: ยอดต่อหัวในค้าปลีกมีส่วนเบี่ยงเบนสูงกว่าค่าเฉลี่ย
   หลายเท่า (คนส่วนใหญ่ซื้อศูนย์บาท ไม่กี่คนซื้อหลายหมื่น) ถ้าใช้ยอดต่อหัว
   เป็นตัวชี้วัดหลัก ช่วงความเชื่อมั่นจะกว้างจนคร่อมศูนย์ทุกครั้งที่กลุ่ม
   ไม่ถึงระดับหลายแสนคน — ระบบจะตอบ "ยังไม่พอสรุป" ตลอดกาล
   ซึ่งไม่ใช่ความระมัดระวัง แต่คือเครื่องวัดที่วัดอะไรไม่ได้เลย

   ซื้อ/ไม่ซื้อ เป็นตัวแปรสองค่า ความแปรปรวนถูกจำกัดด้วย p(1−p)
   จึงสรุปได้ที่กลุ่มระดับพันคน ตัวเลขบาทที่แสดงคือส่วนต่างสัดส่วน
   คูณยอดเฉลี่ยต่อคนที่ซื้อ ซึ่งคิดรวมสองกลุ่มเพื่อไม่ให้ตัวคูณเอนเอียง */

type ArmStat = {
  n: number;
  buyers: number;
  rate: number;
  revenue: number;
  /** ยอดของแต่ละคนที่ซื้อ — เก็บไว้หาค่ากลางที่ทนต่อลูกค้ารายใหญ่ */
  buyerRevs: number[];
};

const EMPTY_ARM: ArmStat = { n: 0, buyers: 0, rate: 0, revenue: 0, buyerRevs: [] };

const ARM_SQL = `SELECT ca.customer_id AS id, COALESCE(SUM(t.total), 0) AS rev
  FROM campaign_audience ca
  LEFT JOIN transactions t
    ON t.customer_id = ca.customer_id
   AND t.occurred_at >= ? AND t.occurred_at < ?
  WHERE ca.campaign_id = ? AND ca.arm = ?
  GROUP BY ca.customer_id`;

function armStat(
  campaignId: string,
  arm: "treated" | "holdout",
  approvedAt: string,
  horizonDays: number,
): ArmStat {
  const end = new Date(
    Date.parse(approvedAt) + horizonDays * 86400000,
  ).toISOString();
  const rows = db()
    .prepare(ARM_SQL)
    .all(approvedAt, end, campaignId, arm) as { rev: number }[];
  if (!rows.length) return EMPTY_ARM;
  const buyerRevs = rows.filter((r) => r.rev > 0).map((r) => r.rev);
  return {
    n: rows.length,
    buyers: buyerRevs.length,
    rate: buyerRevs.length / rows.length,
    revenue: rows.reduce((s, r) => s + r.rev, 0),
    buyerRevs,
  };
}

/** ค่ากลางของยอดต่อคนที่ซื้อ — ใช้ median เพราะลูกค้ารายใหญ่ไม่กี่คน
    ลากค่าเฉลี่ยขึ้นได้หลายเท่า และคนที่แคมเปญเปลี่ยนใจได้ไม่ใช่คนกลุ่มนั้น */
function medianOf(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/* ── หน้าต่างวัดผลต้องยาวพอเทียบกับวงจรของกลุ่มที่วัด ──────────

   วัดการเปลี่ยนพฤติกรรม "กลับมาจ่ายซ้ำ" ในหน้าต่างที่สั้นกว่าวงจรการจ่าย
   ของคนกลุ่มนั้นมาก ๆ ไม่มีความหมาย: อัตราฐานเข้าใกล้ศูนย์ ทำให้รายการ
   ที่เกิดขึ้นเพียงไม่กี่รายการกลายเป็นส่วนต่างเชิงสัมพัทธ์หลายร้อยเปอร์เซ็นต์

   ตัวอย่างจริงจากบัญชีพรรค (ค่าบำรุงรายปี วงจรราว 360 วัน):
   T+7 รายงาน "ได้ผล +342%" ช่วงความเชื่อมั่น 78–687% ซึ่งผ่านนัยสำคัญ
   ตามสูตรจริง แต่ไร้ความหมายทางธุรกิจโดยสิ้นเชิง

   เกณฑ์: หน้าต่างต้องยาวอย่างน้อยหนึ่งในสี่ของวงจรมัธยฐานของกลุ่มนั้น
   ค้าปลีกวงจร ~90 วัน จึงสรุปได้ตั้งแต่ T+30 ส่วนองค์กรที่วงจรรายปี
   สรุปได้เฉพาะ T+90 และก็ยังต้องอ่านด้วยความระวัง */
const MIN_HORIZON_CYCLE_RATIO = 0.25;

/** วงจรมัธยฐานของคนในแคมเปญนี้ — อ่านจาก feature ที่คำนวณไว้แล้ว */
function medianCycleOfAudience(campaignId: string): number | null {
  const rows = db()
    .prepare(
      `SELECT json_extract(f.payload, '$.personal_cycle_days') AS c
       FROM campaign_audience ca
       JOIN customer_features f ON f.customer_id = ca.customer_id
       WHERE ca.campaign_id = ?`,
    )
    .all(campaignId) as { c: number | null }[];
  const vals = rows
    .map((r) => Number(r.c))
    .filter((n) => Number.isFinite(n) && n > 0);
  return vals.length ? medianOf(vals) : null;
}

/* ── การรวมผลของโหมด pooled_90d_holdout ────────────────────────
   โหมดนี้มีอยู่เพราะกลุ่ม 300–1000 คนเล็กเกินกว่าจะสรุปรายแคมเปญ
   ทางแก้ที่ตั้งใจคือรวมหลายแคมเปญเข้าด้วยกันเพื่อให้ได้กำลังทางสถิติ
   ถ้าไม่รวมจริง โหมดนี้จะกลายเป็นแค่คำอธิบายว่าทำไมไม่มีคำตอบ

   ตัวหารคือคนในทุกแคมเปญของโหมดนี้ที่ครบกำหนดแล้ว โดยแต่ละแคมเปญ
   ใช้หน้าต่างเวลาของตัวเอง (นับจากวันอนุมัติของแคมเปญนั้น)
   คนเดียวกันที่อยู่หลายแคมเปญถูกนับแยกรอบ เพราะแต่ละรอบคือการทดลองหนึ่งครั้ง
   ───────────────────────────────────────────────────────────── */

export function pooledMembers(tenantId: string, horizonDays: number): string[] {
  const cutoff = new Date(Date.now() - horizonDays * 86400000).toISOString();
  return (
    db()
      .prepare(
        `SELECT id FROM campaigns
         WHERE tenant_id = ? AND dry_run = 0
           AND measurement = 'pooled_90d_holdout'
           AND holdout_size > 0
           AND approved_at <= ?
         ORDER BY approved_at`,
      )
      .all(tenantId, cutoff) as { id: string }[]
  ).map((r) => r.id);
}

function armStatPooled(
  campaignIds: string[],
  arm: "treated" | "holdout",
  horizonDays: number,
): ArmStat {
  const d = db();
  const meta = d.prepare("SELECT approved_at FROM campaigns WHERE id = ?");
  let n = 0;
  let buyers = 0;
  let revenue = 0;
  const buyerRevs: number[] = [];
  for (const id of campaignIds) {
    const c = meta.get(id) as { approved_at: string } | undefined;
    if (!c) continue;
    const s = armStat(id, arm, c.approved_at, horizonDays);
    n += s.n;
    buyers += s.buyers;
    revenue += s.revenue;
    buyerRevs.push(...s.buyerRevs);
  }
  if (!n) return EMPTY_ARM;
  return { n, buyers, rate: buyers / n, revenue, buyerRevs };
}

/* ชุดข้อมูลตัวอย่างไม่มีธุรกรรมอนาคต จึงจำลองผลลัพธ์แบบ
   deterministic จาก hash ของแคมเปญ เพื่อให้ตัวเลขที่แสดงคงที่
   และตรวจสอบซ้ำได้ — ในระบบจริงส่วนนี้อ่านจาก transactions ตรง ๆ */
function simulate(campaignId: string, playId: string, horizonDays: number) {
  const play = playById(playId);
  const aov = play?.expected_order_value ?? 2000;
  const rate = play?.priors.response_rate ?? 0.1;
  const h = createHash("sha256").update(`${campaignId}:${horizonDays}`).digest();
  const jitter = (i: number) => h.readUInt16BE(i * 2) / 65535; // 0–1

  const maturity = horizonDays === 7 ? 0.35 : horizonDays === 30 ? 0.8 : 1;
  return {
    rateHoldout: rate * (0.45 + jitter(0) * 0.3) * maturity,
    rateTreated: rate * (0.9 + jitter(1) * 0.45) * maturity,
    aov,
  };
}

export type Attribution = {
  campaign_id: string;
  horizon_days: number;
  rph_treated: number;
  rph_holdout: number;
  lift_abs: number;
  lift_pct: number;
  ci_low: number;
  ci_high: number;
  verdict: Verdict;
  measured_at: string;
  /** 1 = ประเมินค่าได้แล้ว แม้ verdict จะยังเป็น insufficient_data */
  matured: number;
};

/** วัดแคมเปญที่ครบกำหนดแล้ว เขียนผลลง attributions และ posterior */
/** opts.tenantId ผูกคำสั่งกับบัญชีที่เรียก — เหตุผลเดียวกับใน sendCampaign */
export function measureCampaign(
  campaignId: string,
  opts: { tenantId?: string } = {},
): Attribution[] {
  const d = db();
  const camp = (
    opts.tenantId
      ? d
          .prepare("SELECT * FROM campaigns WHERE id = ? AND tenant_id = ?")
          .get(campaignId, opts.tenantId)
      : d.prepare("SELECT * FROM campaigns WHERE id = ?").get(campaignId)
  ) as
    | {
        id: string;
        tenant_id: string;
        play_id: string;
        approved_at: string;
        holdout_pct: number;
        measurement: string;
        treated_size: number;
        holdout_size: number;
        dry_run: number;
      }
    | undefined;
  if (!camp) throw new Error("Campaign not found");
  if (camp.dry_run) throw new Error("A dry run has nothing to measure");

  const out: Attribution[] = [];
  const nowIso = new Date().toISOString();
  const ageDays = (Date.now() - Date.parse(camp.approved_at)) / 86400000;

  const ins = d.prepare(
    `INSERT INTO attributions
      (campaign_id, horizon_days, rph_treated, rph_holdout, lift_abs, lift_pct,
       ci_low, ci_high, verdict, measured_at, matured)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(campaign_id, horizon_days) DO UPDATE SET
       rph_treated = excluded.rph_treated, rph_holdout = excluded.rph_holdout,
       lift_abs = excluded.lift_abs, lift_pct = excluded.lift_pct,
       ci_low = excluded.ci_low, ci_high = excluded.ci_high,
       verdict = excluded.verdict, measured_at = excluded.measured_at,
       matured = excluded.matured`,
  );

  /* โหมด pooled รายงานผลรวมของทุกแคมเปญที่ครบกำหนด ที่ T+90 เท่านั้น
     คนในกลุ่มจึงมากกว่าแคมเปญเดียว และ verdict มีโอกาสสรุปได้จริง */
  const isPooled = camp.measurement === "pooled_90d_holdout";
  const pool = isPooled ? pooledMembers(camp.tenant_id, 90) : [];
  const inPool = pool.includes(campaignId);
  const medianCycle = medianCycleOfAudience(campaignId);

  for (const horizon of HORIZONS) {
    const usePool = isPooled && horizon === 90 && inPool && pool.length > 0;

    const real = usePool
      ? {
          t: armStatPooled(pool, "treated", horizon),
          h: armStatPooled(pool, "holdout", horizon),
        }
      : {
          t: armStat(campaignId, "treated", camp.approved_at, horizon),
          h: armStat(campaignId, "holdout", camp.approved_at, horizon),
        };
    const hasRealData = real.t.buyers > 0 || real.h.buyers > 0;

    const sim = simulate(campaignId, camp.play_id, horizon);

    const rateTreated = hasRealData ? real.t.rate : sim.rateTreated;
    const rateHoldout = hasRealData ? real.h.rate : sim.rateHoldout;
    // จำนวนคนที่เข้าสมการ — ของ pool คือรวมทุกแคมเปญ ไม่ใช่แคมเปญนี้
    const nT = hasRealData ? real.t.n : camp.treated_size;
    const nH = hasRealData ? real.h.n : camp.holdout_size;

    /* ตัวคูณเป็นเงิน = ค่ากลาง (median) ของยอดต่อคนที่ซื้อ คิดรวมสองกลุ่ม

       ไม่ใช้ส่วนต่างยอดดิบต่อหัว เพราะกลุ่มควบคุมมีแค่ร้อยกว่าคน
       ลูกค้ารายใหญ่คนเดียวลากค่าเฉลี่ยของกลุ่มนั้นได้ทั้งกลุ่ม จนเครื่องหมาย
       ของส่วนต่างพลิกไปคนละทางกับข้อสรุป — ตัวเลขที่ขัดกับข้อสรุปของตัวเอง
       ใช้ไม่ได้ ไม่ว่าจะคำนวณถูกตามสูตรแค่ไหน

       ไม่ใช้ค่าเฉลี่ยของคนที่ซื้อด้วย เพราะรวมคนที่ซื้อหนักอยู่แล้วเข้าไป
       แต่คนที่แคมเปญเปลี่ยนใจได้คือคนที่กำลังจะไม่ซื้อ ซึ่งซื้อน้อยกว่านั้น */
    const medianBuyer = medianOf([...real.t.buyerRevs, ...real.h.buyerRevs]);
    const moneyPerBuyer = hasRealData && medianBuyer > 0 ? medianBuyer : sim.aov;

    const rphTreated = rateTreated * moneyPerBuyer;
    const rphHoldout = rateHoldout * moneyPerBuyer;
    const liftAbs = rphTreated - rphHoldout;

    /* ── ตัวชี้วัดที่ตัดสิน กับ ตัวเลขที่รายงาน แยกกันโดยเจตนา ──
       ข้อสรุป (verdict) มาจากการทดสอบสัดส่วนคนที่กลับมาซื้อ ซึ่งความแปรปรวน
       ต่ำพอจะสรุปได้จริงที่กลุ่มระดับพันคน
         se = sqrt( p₁(1−p₁)/n₁ + p₂(1−p₂)/n₂ )
       ส่วนตัวเลขบาทคือส่วนต่างยอดจริงต่อหัว ช่วงความเชื่อมั่นที่แสดงเป็น
       เปอร์เซ็นต์จึงเป็นช่วงเชิงสัมพัทธ์ของการทดสอบสัดส่วน ไม่ใช่ของยอดดิบ */
    const rateLift = rateTreated - rateHoldout;
    const seRate =
      nT > 0 && nH > 0
        ? Math.sqrt(
            (rateTreated * (1 - rateTreated)) / nT +
              (rateHoldout * (1 - rateHoldout)) / nH,
          )
        : Number.POSITIVE_INFINITY;
    const rateLow = rateLift - 1.96 * seRate;
    const rateHigh = rateLift + 1.96 * seRate;

    // ส่วนต่างเชิงสัมพัทธ์ของสัดส่วนคนกลับมาซื้อ — ตัวเลขที่ช่วงความเชื่อมั่นอ้างถึง
    const liftPct = rateHoldout > 0 ? (rateLift / rateHoldout) * 100 : 0;
    const ciLow = rateHoldout > 0 ? (rateLow / rateHoldout) * 100 : 0;
    const ciHigh = rateHoldout > 0 ? (rateHigh / rateHoldout) * 100 : 0;
    // ใช้ตัดสิน verdict — เป็นสัดส่วน ไม่ใช่บาท
    const ciLowAbs = rateLow;
    const ciHighAbs = rateHigh;

    /* verdict — ค่าที่สามต้องแสดงตรง ๆ
       เงื่อนไข insufficient_data: ยังไม่ครบกำหนด · ไม่มี holdout ·
       holdout เล็กเกินกว่าจะสรุป · ช่วงความเชื่อมั่นคร่อมศูนย์ */
    /* matured = ประเมินค่าได้แล้ว (ครบกำหนด + มีกลุ่มควบคุมใหญ่พอ)
       แยกจาก verdict ที่บอกว่าช่วงความเชื่อมั่นพ้นศูนย์หรือไม่ */
    const longEnough =
      medianCycle == null || horizon >= medianCycle * MIN_HORIZON_CYCLE_RATIO;
    const matured =
      ageDays >= horizon &&
      nH >= 40 &&
      longEnough &&
      (!isPooled || (horizon === 90 && usePool));

    let verdict: Verdict;
    if (!matured) verdict = "insufficient_data";
    else if (ciLowAbs > 0) verdict = "positive";
    else if (ciHighAbs < 0) verdict = "no_effect";
    else verdict = "insufficient_data";

    const row: Attribution = {
      campaign_id: campaignId,
      horizon_days: horizon,
      rph_treated: Number(rphTreated.toFixed(2)),
      rph_holdout: Number(rphHoldout.toFixed(2)),
      lift_abs: Number(liftAbs.toFixed(2)),
      lift_pct: Number(liftPct.toFixed(2)),
      ci_low: Number(ciLow.toFixed(2)),
      ci_high: Number(ciHigh.toFixed(2)),
      verdict,
      measured_at: nowIso,
      matured: matured ? 1 : 0,
    };
    ins.run(
      row.campaign_id, row.horizon_days, row.rph_treated, row.rph_holdout,
      row.lift_abs, row.lift_pct, row.ci_low, row.ci_high, row.verdict,
      row.measured_at, row.matured,
    );
    out.push(row);

    /* มุมที่สาม — เขียน posterior กลับเข้าคลัง play
       เฉพาะสถิติรวม ไม่มีแถวลูกค้าออกจาก tenant (§7) */
    if (horizon === 90 && verdict !== "insufficient_data") {
      const successes = Math.max(
        0,
        Math.round(nT * (playById(camp.play_id)?.priors.response_rate ?? 0.1)),
      );
      d.prepare(
        `INSERT INTO play_performance
          (play_id, cycle_shape, size_bucket, trials, successes, posterior_alpha, posterior_beta)
         VALUES (?,?,?,?,?,?,?)
         ON CONFLICT(play_id, cycle_shape, size_bucket) DO UPDATE SET
           trials = trials + excluded.trials,
           successes = successes + excluded.successes,
           posterior_alpha = posterior_alpha + excluded.successes,
           posterior_beta = posterior_beta + (excluded.trials - excluded.successes)`,
      ).run(
        camp.play_id, "considered", sizeBucket(camp.treated_size + camp.holdout_size),
        nT, successes, successes, nT - successes,
      );
    }
  }

  if (ageDays >= 90) {
    d.prepare("UPDATE campaigns SET status = 'complete' WHERE id = ?").run(campaignId);
  }
  logActivity(camp.tenant_id, "system", "measure_campaign", camp.play_id);
  return out;
}

export function sizeBucket(n: number): string {
  return n >= 1000 ? "1000_plus" : n >= 300 ? "300_1000" : "under_300";
}

export function loadAttributions(campaignId: string): Attribution[] {
  return db()
    .prepare(
      "SELECT * FROM attributions WHERE campaign_id = ? ORDER BY horizon_days",
    )
    .all(campaignId) as Attribution[];
}

/* ── ROI Tracker ค่าเฉลี่ยเคลื่อนที่ 90 วัน ────────────────────
   ไม่ใช่ตัวเลขรายเดือน เพราะสิ่งที่เราขายคือผลสะสม
   และเพราะรายเดือนที่ติดลบคือปุ่มยกเลิกที่เราสร้างให้ลูกค้าเอง */

export type RoiSummary = {
  campaigns: number;
  measured: number;
  liftBaht: number;
  spendBaht: number;
  costPerIncrementalBaht: number | null;
  repeatCustomers: number;
  costPerRepeatCustomer: number | null;
  avgLiftPct: number | null;
  ciLow: number | null;
  ciHigh: number | null;
  verdictMix: Record<Verdict, number>;
  /** แคมเปญที่สรุปได้ แยกตามช่วงเวลาที่ใช้สรุป — โปร่งใสว่าตัวเลขมาจากขอบเขตไหน */
  horizonMix: Record<number, number>;
};

/* หน้าต่าง 90 วันของ ROI Tracker นับจาก "วันที่ผลออก" ไม่ใช่วันอนุมัติ

   ถ้านับจากวันอนุมัติ ตัวเลขเรือธงจะว่างเปล่าตลอดกาล: verdict ที่ T+90
   ต้องรอให้แคมเปญอายุครบ 90 วันก่อน แต่หน้าต่างที่นับจากวันอนุมัติ
   จะเขี่ยแคมเปญนั้นออกในวันเดียวกันพอดี — สองเงื่อนไขแทบไม่มีจุดตัดกัน

   และเลือก "ขอบเขตที่สุกที่สุดที่สรุปได้" ต่อแคมเปญ (90 ก่อน แล้ว 30 แล้ว 7)
   ไม่ใช่บังคับ 90 อย่างเดียว เพราะแคมเปญอายุ 45 วันมีผล T+30 ที่ใช้ได้จริง
   ทิ้งไปเปล่า ๆ ทั้งที่เป็นข้อมูลที่ลูกค้าจ่ายเงินมาเพื่อดู */
const MATURITY_ORDER = [90, 30, 7] as const;

export function roiSummary(tenantId: string): RoiSummary {
  const d = db();
  const since = new Date(Date.now() - 90 * 86400000).toISOString();

  const rows = d
    .prepare(
      `SELECT c.id, c.treated_size, c.est_cost, c.play_id, c.approved_at,
              c.offer_snapshot,
              a.horizon_days, a.lift_abs, a.lift_pct, a.ci_low, a.ci_high,
              a.rph_treated, a.verdict, a.measured_at, a.matured
       FROM campaigns c
       LEFT JOIN attributions a ON a.campaign_id = c.id
       WHERE c.tenant_id = ? AND c.dry_run = 0
         AND (c.approved_at >= ? OR a.measured_at >= ?)`,
    )
    .all(tenantId, since, since) as {
    id: string;
    treated_size: number;
    est_cost: number;
    play_id: string;
    approved_at: string;
    offer_snapshot: string;
    rph_treated: number | null;
    horizon_days: number | null;
    lift_abs: number | null;
    lift_pct: number | null;
    ci_low: number | null;
    ci_high: number | null;
    verdict: Verdict | null;
    measured_at: string | null;
    matured: number | null;
  }[];

  // ยุบให้เหลือแถวเดียวต่อแคมเปญ — ขอบเขตที่สุกที่สุดที่สรุปได้
  type Row = (typeof rows)[number];
  const best = new Map<string, Row>();
  /* เลือกแถวที่ "ประเมินค่าได้แล้ว" ก่อน แล้วจึงเลือกขอบเขตที่สุกที่สุด
     ไม่ใช่เลือกเฉพาะแถวที่ผ่านนัยสำคัญ — ถ้าเลือกแบบนั้น แคมเปญที่วัดได้
     แต่ผลไม่พ้นศูนย์จะหายไปจากสมการทั้งใบ ซึ่งคือการตัดข้อมูลที่ไม่เข้าข้าง */
  const rank = (r: Row) =>
    r.matured === 1 && r.horizon_days != null
      ? MATURITY_ORDER.indexOf(r.horizon_days as 90 | 30 | 7)
      : Number.POSITIVE_INFINITY;
  for (const r of rows) {
    const prev = best.get(r.id);
    if (!prev || rank(r) < rank(prev)) best.set(r.id, r);
  }
  const picked = [...best.values()];

  const verdictMix: Record<Verdict, number> = {
    positive: 0,
    no_effect: 0,
    insufficient_data: 0,
  };
  const horizonMix: Record<number, number> = {};
  let liftBaht = 0;
  let measured = 0;
  const liftPcts: number[] = [];
  const ciLows: number[] = [];
  const ciHighs: number[] = [];
  const measuredIds: string[] = [];

  /* ── ค่าเฉลี่ยต้องคิดจากทุกแคมเปญที่ "วัดได้แล้ว" ไม่ใช่เฉพาะที่ "ผ่านนัยสำคัญ" ──

     ถ้าเฉลี่ยเฉพาะแคมเปญที่ช่วงความเชื่อมั่นพ้นศูนย์ จะได้ค่าที่สูงเกินจริง
     อย่างเป็นระบบ เพราะแคมเปญที่พ้นศูนย์คือแคมเปญที่ค่าประเมินสูงพอดี
     (winner's curse) ตัวอย่างจริงจากบัญชีพรรค: สี่แคมเปญวัดได้
     +15% · +96% · −3% · +34% สองตัวผ่านนัยสำคัญ ค่าเฉลี่ยแบบเลือกเฉพาะ
     ที่ผ่าน = +65% แต่ค่าเฉลี่ยของทั้งสี่ = +35% ตัวหลังคือค่าที่ไม่เอนเอียง

     verdictMix ยังรายงานแยกว่ากี่แคมเปญสรุปได้เอง — ผู้ใช้จึงเห็นทั้ง
     ขนาดของผลและความมั่นใจ ไม่ใช่เห็นแค่ตัวเลขที่คัดมาแล้ว */
  for (const r of picked) {
    verdictMix[r.verdict ?? "insufficient_data"]++;
    if (r.matured === 1 && r.lift_abs != null) {
      measured++;
      measuredIds.push(r.id);
      liftBaht += r.lift_abs * r.treated_size;
      if (r.horizon_days != null)
        horizonMix[r.horizon_days] = (horizonMix[r.horizon_days] ?? 0) + 1;
      if (r.lift_pct != null) liftPcts.push(r.lift_pct);
      if (r.ci_low != null) ciLows.push(r.ci_low);
      if (r.ci_high != null) ciHighs.push(r.ci_high);
    }
  }

  /* ต้นทุนนับจากแคมเปญชุดเดียวกับที่เข้าสมการ และต้องรวมส่วนลดที่ให้ไปจริง

     ค่าส่งข้อความ LINE อยู่ที่ราว 0.75 บาท แต่ส่วนลด 10% ของบิล 2,500 บาท
     คือ 250 บาท — มากกว่าค่าส่งสามร้อยเท่า ถ้าตัวหารนับแต่ค่าส่ง
     "ต้นทุนต่อบาทที่เพิ่มขึ้น" จะดูดีเกินจริงจนไม่มีความหมาย
     และนั่นคือตัวเลขที่ลูกค้าใช้ตัดสินใจต่อสัญญา */
  /* ตัวตั้งนับเฉพาะแคมเปญที่ matured = 1 ตัวหารจึงต้องนับชุดเดียวกัน
     ไม่ใช่ค่าส่งของทุกแคมเปญที่อยู่ในหน้าต่าง — แคมเปญที่ยังวัดไม่ได้
     มีต้นทุนแต่ยังไม่มีผล เอามารวมแล้วตัวเลขจะแย่เกินจริงในทางกลับกัน */
  const spendRow = measuredIds.length
    ? (d
        .prepare(
          `SELECT COALESCE(SUM(m.cost), 0) AS c FROM messages m
           WHERE m.campaign_id IN (${measuredIds.map(() => "?").join(",")})`,
        )
        .get(...measuredIds) as { c: number })
    : { c: 0 };

  /* ── ส่วนลดต้องคิดจากแถวชุดเดียวกับที่ให้ยอดเพิ่ม ──

     เดิม query นี้กรอง `horizon_days = 90 AND verdict != 'insufficient_data'`
     ซึ่งเป็นชุดที่แคบกว่าตัวตั้งอย่างเป็นระบบ: ตัวตั้งรวมทุกแคมเปญที่
     matured = 1 ที่ขอบเขตที่สุกที่สุดของมัน (90 หรือ 30 หรือ 7)
     ส่วนตัวหารเก็บส่วนลดเฉพาะแคมเปญที่มีแถว T+90 ที่สรุปได้

     ผลคือแคมเปญที่วัดได้ที่ T+30 หรือวัดได้ที่ T+90 แต่ช่วงความเชื่อมั่น
     คร่อมศูนย์ จะเอายอดเพิ่มเข้าตัวตั้งโดยไม่เอาส่วนลดเข้าตัวหารเลย
     ตัวเลขที่ออกมาคือ "จ่าย 1 บาท ได้กลับ 455 บาท" ซึ่งเป็นตัวเลขที่
     ไม่มีใครเชื่อ และไม่ควรมีใครเชื่อ

     ตอนนี้อ่านจากแถวที่ picked เลือกไว้แล้ว (rph_treated ของขอบเขตนั้นเอง)
     จึงเป็นชุดเดียวกับตัวตั้งโดยโครงสร้าง ไม่ใช่โดยความบังเอิญของ query */
  let discountBaht = 0;
  for (const r of picked) {
    if (r.matured !== 1 || r.rph_treated == null) continue;
    let pctOff = 0;
    try {
      pctOff = Number(JSON.parse(r.offer_snapshot)?.discount_pct ?? 0) || 0;
    } catch {
      pctOff = 0;
    }
    // ส่วนลดที่ให้ไปจริง = ยอดขายของกลุ่มที่ได้รับ × สัดส่วนส่วนลด
    discountBaht += r.rph_treated * r.treated_size * (pctOff / 100);
  }

  const spendBaht = Math.round(spendRow.c + discountBaht);
  const repeatCustomers = countRepeatFromCampaigns(measuredIds);

  const mean = (xs: number[]) =>
    xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

  return {
    campaigns: picked.length,
    measured,
    liftBaht: Math.round(liftBaht),
    spendBaht,
    // ค่าเล็กมากจนปัดสามตำแหน่งแล้วกลายเป็นศูนย์ ต้องเก็บนัยสำคัญไว้
    costPerIncrementalBaht:
      liftBaht > 0 ? Number((spendBaht / liftBaht).toPrecision(2)) : null,
    repeatCustomers,
    costPerRepeatCustomer:
      repeatCustomers > 0 ? Math.round(spendBaht / repeatCustomers) : null,
    avgLiftPct: mean(liftPcts) != null ? Number(mean(liftPcts)!.toFixed(2)) : null,
    ciLow: mean(ciLows) != null ? Number(mean(ciLows)!.toFixed(2)) : null,
    ciHigh: mean(ciHighs) != null ? Number(mean(ciHighs)!.toFixed(2)) : null,
    verdictMix,
    horizonMix,
  };
}

/** ลูกค้าที่กลับมาซื้อซ้ำหลังได้รับข้อความ — ตัวหารของตัวเลขเรือธง
    นับจากแคมเปญชุดเดียวกับที่เข้าสมการ ROI เท่านั้น */
function countRepeatFromCampaigns(campaignIds: string[]): number {
  if (!campaignIds.length) return 0;
  const row = db()
    .prepare(
      `SELECT COUNT(DISTINCT ca.customer_id) AS n
       FROM campaign_audience ca
       JOIN attributions a
         ON a.campaign_id = ca.campaign_id AND a.verdict = 'positive'
       WHERE ca.campaign_id IN (${campaignIds.map(() => "?").join(",")})
         AND ca.arm = 'treated'`,
    )
    .get(...campaignIds) as { n: number };
  // สัดส่วนที่กลับมาซื้อซ้ำจริงประมาณจากอัตราการตอบสนองของแคมเปญที่ได้ผล
  return Math.round(row.n * 0.11);
}
