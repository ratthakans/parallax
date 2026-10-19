import { all, get } from "@/lib/engine/sql";
import { listDeals } from "@/lib/engine/deals";
import { retentionSummary } from "@/lib/engine/retention";
import type { Viewer } from "@/lib/engine/accounts";
import { OPEN_STAGES, type DealStage } from "@/lib/shared/deals";
import { bangkokDay } from "@/lib/shared/format";
import { closedAt, stageTimelines } from "@/lib/engine/velocity";

/* ── รายงาน 4 กราฟตายตัว (docs/ux-plan.md U6) ─────────────────────────────

   ไม่มีตัวสร้างรายงาน (ตั้งใจ — แผนหัวข้อ 7): เปิดมาแล้วอ่านได้เลย ไม่ต้องตั้งค่า
   1. ไปป์ไลน์ตามขั้น: จำนวนและมูลค่าของดีลที่เปิด (ตัดตามสิทธิ์เดียวกับหน้าดีล)
   2. กิจกรรมต่อสัปดาห์ 12 สัปดาห์ล่าสุด แยกชนิด
   3. กรวยแคมเปญ: เป้าหมาย → ใช้ได้ตามนโยบาย → มอบหมาย → ติดต่อแล้ว → ส่งข้อเสนอ → ปิดได้
   4. คุณภาพข้อมูล: มีช่องทาง · มีสังกัดปัจจุบัน · รอตรวจข้อมูลซ้ำ · ไม่มีกฎอายุข้อมูล
   ทุกตัวเลขเป็นจำนวนนับ ไม่มีคะแนนหรือการคาดการณ์ */

export type Reports = {
  pipeline: { stage: DealStage; count: number; value: number }[];
  wonThisQuarter: { count: number; value: number };
  activity: { week: string; meeting: number; call: number; email: number; other: number }[];
  funnel: { label: string; count: number }[];
  quality: { label: string; count: number; of: number; good: boolean }[];
};

export async function reports(tenantId: string, viewer: Viewer, now = new Date()): Promise<Reports> {
  const [open, won] = await Promise.all([listDeals(tenantId, { view: "open" }, viewer), listDeals(tenantId, { view: "won" }, viewer)]);
  const pipeline = OPEN_STAGES.map((stage) => {
    const xs = open.filter((d) => d.stage === stage);
    return { stage, count: xs.length, value: xs.reduce((t, d) => t + (d.value ?? 0), 0) };
  });
  const q = new Date(now); q.setUTCMonth(Math.floor(q.getUTCMonth() / 3) * 3, 1); q.setUTCHours(0, 0, 0, 0);
  /* ปิดได้ไตรมาสนี้ = วันที่เข้าขั้น "ปิดได้" จริง (ประวัติขั้น) ไม่ใช่วันที่แก้ดีลล่าสุด */
  const wonTl = await stageTimelines(tenantId, won);
  const wonQ = won.filter((d) => (closedAt(wonTl.get(d.id) ?? []) ?? d.updatedAt) >= q.toISOString());

  /* สัปดาห์เริ่มวันจันทร์ (เวลาไทย) · 12 สัปดาห์ล่าสุดรวมสัปดาห์นี้ */
  const today = new Date(`${bangkokDay(now)}T00:00:00Z`);
  const monday = new Date(+today - ((today.getUTCDay() + 6) % 7) * 864e5);
  const weeks = Array.from({ length: 12 }, (_, i) => new Date(+monday - (11 - i) * 7 * 864e5).toISOString().slice(0, 10));
  const since = weeks[0];
  /* นับตามวันเวลาไทย — ตัด substr ของเวลา UTC ทำให้กิจกรรมหลังเที่ยงคืนวันจันทร์ (ไทย) ตกไปสัปดาห์ก่อน */
  const acts = (await all<{ kind: string; occurred_at: string }>(
    "SELECT kind, occurred_at FROM interactions WHERE tenant_id = ? AND substr(occurred_at, 1, 10) >= ?", tenantId, prevDay(since)))
    .map((a) => ({ kind: a.kind, day: a.occurred_at.length > 10 ? bangkokDay(new Date(a.occurred_at)) : a.occurred_at.slice(0, 10) }));
  const activity = weeks.map((w, i) => {
    const end = weeks[i + 1] ?? "9999";
    const xs = acts.filter((a) => a.day >= w && a.day < end);
    const n = (k: string) => xs.filter((a) => a.kind === k).length;
    return { week: w, meeting: n("meeting"), call: n("call"), email: n("email"), other: xs.length - n("meeting") - n("call") - n("email") };
  });

  const t = await get<{ total: number | string; eligible: number | string; assigned: number | string; contacted: number | string; proposal: number | string; won: number | string }>(
    `SELECT COUNT(*) AS total,
       SUM(CASE WHEN eligibility = 'eligible' THEN 1 ELSE 0 END) AS eligible,
       SUM(CASE WHEN status NOT IN ('open', 'cancelled') THEN 1 ELSE 0 END) AS assigned,
       SUM(CASE WHEN status IN ('contacted', 'meeting', 'proposal', 'won', 'lost', 'not_interested') THEN 1 ELSE 0 END) AS contacted,
       SUM(CASE WHEN status IN ('proposal', 'won') THEN 1 ELSE 0 END) AS proposal,
       SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) AS won
     FROM campaign_targets WHERE tenant_id = ?`, tenantId);
  const f = (k: keyof NonNullable<typeof t>) => Number(t?.[k] ?? 0);
  const funnel = [
    { label: "เป้าหมาย", count: f("total") }, { label: "ใช้ได้ตามนโยบาย", count: f("eligible") }, { label: "มอบหมายแล้ว", count: f("assigned") },
    { label: "ติดต่อแล้ว", count: f("contacted") }, { label: "ส่งข้อเสนอ", count: f("proposal") }, { label: "ปิดได้", count: f("won") },
  ];

  const qd = await get<{ people: number | string; reachable: number | string; employed: number | string; pairs: number | string }>(
    `SELECT (SELECT COUNT(*) FROM customers c WHERE c.tenant_id = ?) AS people,
       (SELECT COUNT(DISTINCT customer_id) FROM contact_points WHERE tenant_id = ? AND kind IN ('email', 'phone')) AS reachable,
       (SELECT COUNT(DISTINCT customer_id) FROM affiliations WHERE tenant_id = ? AND valid_to IS NULL) AS employed,
       (SELECT COUNT(*) FROM review_items WHERE tenant_id = ? AND status = 'open') AS pairs`, tenantId, tenantId, tenantId, tenantId);
  const people = Number(qd?.people ?? 0);
  const ret = await retentionSummary(tenantId, now);
  const quality = [
    { label: "มีอีเมลหรือเบอร์", count: Number(qd?.reachable ?? 0), of: people, good: true },
    { label: "มีสังกัดปัจจุบัน", count: Number(qd?.employed ?? 0), of: people, good: true },
    { label: "รายการรอตรวจข้อมูลซ้ำ", count: Number(qd?.pairs ?? 0), of: 0, good: false },
    { label: "คนที่ยังไม่มีกฎอายุข้อมูล", count: ret.noRule, of: ret.people, good: false },
  ];
  return { pipeline, wonThisQuarter: { count: wonQ.length, value: wonQ.reduce((s, d) => s + (d.value ?? 0), 0) }, activity, funnel, quality };
}

function prevDay(day: string): string {
  return new Date(+new Date(`${day}T00:00:00Z`) - 864e5).toISOString().slice(0, 10);
}

/* ── รายได้ตามกลุ่มลูกค้า (docs/crm-plan.md F6) ─────────────────────────────
   ไตรมาสนี้: ดีลบริษัทที่ปิดได้ · ดีลลูกค้าบุคคลที่ปิดได้ · ยอดซื้อหน้าร้าน/ออเดอร์ (transactions)
   ดีลตัดตามสิทธิ์เดียวกับหน้าดีล (listDeals) · ยอดซื้อเป็นผลรวมทั้งบัญชี ไม่เผยรายคน */
export type SegmentRevenue = { label: string; count: number; unit: string; value: number }[];

export async function revenueBySegment(tenantId: string, viewer: Viewer, now = new Date()): Promise<SegmentRevenue> {
  const q = new Date(now); q.setUTCMonth(Math.floor(q.getUTCMonth() / 3) * 3, 1); q.setUTCHours(0, 0, 0, 0);
  const won = await listDeals(tenantId, { view: "won", limit: 20000 }, viewer);
  const tl = await stageTimelines(tenantId, won);
  const inQ = won.filter((d) => (closedAt(tl.get(d.id) ?? []) ?? d.updatedAt) >= q.toISOString());
  const sum = (xs: typeof inQ) => xs.reduce((t, d) => t + (d.value ?? 0), 0);
  const org = inQ.filter((d) => d.orgId), person = inQ.filter((d) => !d.orgId);
  const buys = await get<{ n: number | string; total: number | string | null }>(
    "SELECT COUNT(*) AS n, SUM(total) AS total FROM transactions WHERE tenant_id = ? AND occurred_at >= ?", tenantId, q.toISOString().slice(0, 10));
  return [
    { label: "ดีลบริษัทที่ปิดได้", count: org.length, unit: "ดีล", value: sum(org) },
    { label: "ดีลลูกค้าบุคคลที่ปิดได้", count: person.length, unit: "ดีล", value: sum(person) },
    { label: "ยอดซื้อ (หน้าร้าน · ออเดอร์)", count: Number(buys?.n ?? 0), unit: "รายการ", value: Number(buys?.total ?? 0) },
  ];
}
