import { all, get } from "@/lib/engine/sql";
import { loadFeatures } from "@/lib/engine/derive";
import { roiSummary } from "@/lib/engine/proof";
import { getTenant } from "@/lib/engine/match";
import { planById } from "@/lib/shared/plans";
import { profileFor } from "@/lib/shared/tenants";

/* ── มุมมองผู้บริหาร ───────────────────────────────────────────────

   สำหรับคนที่ไม่ได้กดอนุมัติเอง แต่ต้องรู้ว่าแต่ละร้านเป็นอย่างไร — เจ้าของกิจการ
   ผู้จัดการเขต หรือผู้บริหารที่ดูหลายสาขา อ่านอย่างเดียว ไม่มีปุ่มที่เปลี่ยนอะไร

   ทุกตัวเลขมาจากข้อมูลจริงของบัญชีนั้น ไม่ใช่ค่าประมาณ ยกเว้นที่เขียนกำกับไว้
   ───────────────────────────────────────────────────────────── */

export type ShopSummary = {
  tenantId: string;
  name: string;
  industry: string;
  plan: string;
  customers: number;
  buyers90: number;
  revenue90: number;
  revenuePrev90: number;
  lapsing: number;
  consentShare: number;
  campaignsMeasuring: number;
  awaitingSend: number;
  measuredLift: number;
  verdictPositive: number;
  verdictMeasured: number;
  briefOpens28: number;
  lastActivityAt: string | null;
  lastImportAt: string | null;
  credits: number;
  monthly: { month: string; revenue: number }[];
  attention: string[];
};

const DAY = 86400000;

/** ยอดซื้อรายเดือน 12 เดือนล่าสุด (รวมเดือนนี้) ตามเวลาไทย */
async function monthlyRevenue(tenantId: string, now: number) {
  const since = new Date(now - 370 * DAY).toISOString();
  const rows = await all<{ occurred_at: string; total: number | string }>(
    "SELECT occurred_at, total FROM transactions WHERE tenant_id = ? AND occurred_at >= ?",
    tenantId, since,
  );
  const months: string[] = [];
  const d = new Date(now + 7 * 3600_000);
  for (let i = 11; i >= 0; i--) {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    months.push(m.toISOString().slice(0, 7));
  }
  const sum = new Map(months.map((m) => [m, 0]));
  for (const r of rows) {
    const m = new Date(Date.parse(r.occurred_at) + 7 * 3600_000).toISOString().slice(0, 7);
    if (sum.has(m)) sum.set(m, sum.get(m)! + Number(r.total));
  }
  return months.map((month) => ({ month, revenue: Math.round(sum.get(month)!) }));
}

export async function shopSummary(tenantId: string, now = Date.now()): Promise<ShopSummary> {
  const p90 = new Date(now - 90 * DAY).toISOString();
  const p180 = new Date(now - 180 * DAY).toISOString();
  const p28 = new Date(now - 28 * DAY).toISOString().slice(0, 10);
  const profile = profileFor(tenantId);

  const [tenant, features, roi, money, counts, opens, last, lastImport, monthly] = await Promise.all([
    getTenant(tenantId),
    loadFeatures(tenantId),
    roiSummary(tenantId),
    get<{ r90: number | string | null; rp: number | string | null; b90: number | string | null }>(
      `SELECT
         SUM(CASE WHEN occurred_at >= ? THEN total ELSE 0 END) AS r90,
         SUM(CASE WHEN occurred_at >= ? AND occurred_at < ? THEN total ELSE 0 END) AS rp,
         COUNT(DISTINCT CASE WHEN occurred_at >= ? THEN customer_id END) AS b90
       FROM transactions WHERE tenant_id = ?`,
      p90, p180, p90, p90, tenantId,
    ),
    get<{ customers: number | string; measuring: number | string; awaiting: number | string }>(
      `SELECT
         (SELECT COUNT(*) FROM customers WHERE tenant_id = ?) AS customers,
         (SELECT COUNT(*) FROM campaigns WHERE tenant_id = ? AND dry_run = 0 AND status = 'measuring') AS measuring,
         (SELECT COUNT(*) FROM campaigns c WHERE c.tenant_id = ? AND c.dry_run = 0
            AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.campaign_id = c.id)) AS awaiting`,
      tenantId, tenantId, tenantId,
    ),
    get<{ n: number | string }>(
      "SELECT COUNT(*) AS n FROM brief_opens WHERE tenant_id = ? AND opened_on >= ?", tenantId, p28,
    ),
    get<{ at: string | null }>("SELECT MAX(at) AS at FROM activity_log WHERE tenant_id = ?", tenantId),
    get<{ at: string | null }>(
      "SELECT MAX(at) AS at FROM activity_log WHERE tenant_id = ? AND action = 'import_csv'", tenantId,
    ),
    monthlyRevenue(tenantId, now),
  ]);

  const buyers = features.filter((f) => f.frequency_total > 0);
  const lapsing = buyers.filter((f) => f.churn_risk >= 1.5).length;
  const consentShare = features.length
    ? features.filter((f) => f.consent_marketing).length / features.length
    : 0;
  const customers = Number(counts?.customers ?? 0);
  const briefOpens28 = Number(opens?.n ?? 0);
  const awaitingSend = Number(counts?.awaiting ?? 0);
  const credits = tenant?.message_credits ?? 0;
  const revenue90 = Number(money?.r90 ?? 0);
  const revenuePrev90 = Number(money?.rp ?? 0);

  /* สิ่งที่ผู้บริหารควรรู้ — เรียงจากเรื่องที่ทำให้ระบบไม่ทำงานเลย ไปถึงเรื่องที่ควรดู */
  const attention: string[] = [];
  if (customers === 0) attention.push("ยังไม่มีข้อมูลลูกค้า — ทีมยังไม่ได้นำเข้าไฟล์");
  if (customers > 0 && consentShare < 0.3)
    attention.push(`ยินยอมรับข่าวสารแค่ ${Math.round(consentShare * 100)}% — ส่วนใหญ่ยังส่งหาไม่ได้`);
  if (customers > 0 && briefOpens28 < 8) attention.push(`ทีมเปิดบรีฟแค่ ${briefOpens28} จาก 28 วัน`);
  if (awaitingSend > 0) attention.push(`${awaitingSend} แคมเปญอนุมัติแล้วแต่ยังไม่ได้ส่ง`);
  if (revenuePrev90 > 0 && revenue90 < revenuePrev90 * 0.85)
    attention.push(`ยอดซื้อ 90 วันลดลง ${Math.round((1 - revenue90 / revenuePrev90) * 100)}% จากช่วงก่อน`);
  if (lapsing > 0 && buyers.length && lapsing / buyers.length > 0.3)
    attention.push(`${lapsing} คนเลยรอบซื้อปกติไปแล้ว (${Math.round((lapsing / buyers.length) * 100)}% ของคนที่เคยซื้อ)`);

  return {
    tenantId,
    name: tenant?.name ?? profile.name,
    industry: profile.industry,
    plan: planById(tenant?.tier ?? "growth").name,
    customers,
    buyers90: Number(money?.b90 ?? 0),
    revenue90,
    revenuePrev90,
    lapsing,
    consentShare,
    campaignsMeasuring: Number(counts?.measuring ?? 0),
    awaitingSend,
    measuredLift: roi.liftBaht,
    verdictPositive: roi.verdictMix.positive ?? 0,
    verdictMeasured: roi.measured,
    briefOpens28,
    lastActivityAt: last?.at ?? null,
    lastImportAt: lastImport?.at ?? null,
    credits,
    monthly,
    attention,
  };
}

export async function execOverview(tenantIds: string[]) {
  const now = Date.now();
  const shops = await Promise.all(tenantIds.map((t) => shopSummary(t, now)));
  const months = shops[0]?.monthly.map((m) => m.month) ?? [];
  return {
    shops,
    totals: {
      customers: shops.reduce((s, x) => s + x.customers, 0),
      revenue90: shops.reduce((s, x) => s + x.revenue90, 0),
      revenuePrev90: shops.reduce((s, x) => s + x.revenuePrev90, 0),
      lapsing: shops.reduce((s, x) => s + x.lapsing, 0),
      measuredLift: shops.reduce((s, x) => s + x.measuredLift, 0),
      campaignsMeasuring: shops.reduce((s, x) => s + x.campaignsMeasuring, 0),
    },
    monthly: months.map((month, i) => ({
      month,
      revenue: shops.reduce((s, x) => s + (x.monthly[i]?.revenue ?? 0), 0),
    })),
  };
}
