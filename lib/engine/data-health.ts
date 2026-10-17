import { all } from "@/lib/engine/sql";
import { canSee } from "@/lib/shared/accounts";
import { bangkokDay } from "@/lib/shared/format";
import type { Classification } from "@/lib/shared/vault";
import type { Viewer } from "@/lib/engine/accounts";

/* ── สุขภาพข้อมูล (docs/crm-plan.md D1) ─────────────────────────────────────

   ไม่ใช่คะแนน — เป็นรายการสิ่งที่ต้องแก้ แต่ละข้อบอกว่าทำไมสำคัญ และพาไปจุดที่แก้ได้
   ทุกข้อนับเฉพาะระเบียนที่ผู้อ่านเห็นได้ (ระดับความลับ) — ไม่เผยว่ามีบริษัท/คนที่ถูกจำกัดกี่ราย
   ข้อที่เป็นความเสี่ยงต่องานขาย (ข้อมูลเก่า · ดีลเลยกำหนด) ขึ้นก่อนข้อที่เป็นความครบถ้วน */

export type HealthItem = { id: string; name: string; href: string; detail?: string; affiliationId?: string };
export type HealthCheck = {
  key: string; title: string; why: string; count: number; items: HealthItem[]; severity: "risk" | "gap";
  action?: { label: string; href: string };
};

const SAMPLE = 25;
const STALE_MONTHS = 18;
const lv = (c: string | null) => (c ?? "confidential") as Classification;

export async function dataHealth(tenantId: string, viewer: Viewer, now = new Date()): Promise<HealthCheck[]> {
  const today = bangkokDay(now);
  const staleBefore = new Date(+now - STALE_MONTHS * 30.44 * 864e5).toISOString();
  const seeOrg = (r: { classification: string | null; account_owner_id?: string | null; data_owner_id?: string | null }) =>
    canSee(viewer.clearance, lv(r.classification)) || [r.account_owner_id, r.data_owner_id].includes(viewer.id);

  type Org = { id: string; name: string; classification: string | null; account_owner_id: string | null; data_owner_id: string | null;
    industry: string | null; team_id: string | null; tax_id: string | null; cur: number | string; open_deals: number | string };
  const [orgs, teams, stale, noContact, deals, review] = await Promise.all([
    all<Org>(
      `SELECT o.id, o.name, o.classification, o.account_owner_id, o.data_owner_id, o.industry, o.team_id, o.tax_id,
         COALESCE(a.cur, 0) AS cur, COALESCE(d.n, 0) AS open_deals
       FROM orgs o
       LEFT JOIN (SELECT org_id, COUNT(DISTINCT customer_id) AS cur FROM affiliations WHERE tenant_id = ? AND valid_to IS NULL GROUP BY org_id) a ON a.org_id = o.id
       LEFT JOIN (SELECT org_id, COUNT(*) AS n FROM opportunities WHERE tenant_id = ? AND stage NOT IN ('won', 'lost') GROUP BY org_id) d ON d.org_id = o.id
       WHERE o.tenant_id = ?`, tenantId, tenantId, tenantId),
    all<{ n: number | string }>("SELECT COUNT(*) AS n FROM teams WHERE tenant_id = ?", tenantId),
    all<{ aff_id: string; customer_id: string; name: string; person_class: string | null; org_id: string; org: string; org_class: string | null;
      account_owner_id: string | null; data_owner_id: string | null; seen: string | null }>(
      `SELECT a.id AS aff_id, a.customer_id, c.name, c.classification AS person_class, a.org_id, o.name AS org, o.classification AS org_class,
         o.account_owner_id, o.data_owner_id, COALESCE(a.last_seen_at, a.valid_from, a.recorded_at) AS seen
       FROM affiliations a JOIN customers c ON c.id = a.customer_id AND c.tenant_id = a.tenant_id
       JOIN orgs o ON o.id = a.org_id AND o.tenant_id = a.tenant_id
       WHERE a.tenant_id = ? AND a.valid_to IS NULL AND COALESCE(a.last_seen_at, a.valid_from, a.recorded_at) < ?
       ORDER BY seen`, tenantId, staleBefore),
    all<{ id: string; name: string; classification: string | null }>(
      `SELECT c.id, c.name, c.classification FROM customers c
       WHERE c.tenant_id = ? AND c.lifecycle_state <> 'pending_review'
         AND NOT EXISTS (SELECT 1 FROM contact_points p WHERE p.tenant_id = c.tenant_id AND p.customer_id = c.id AND p.kind IN ('email', 'phone'))
       ORDER BY c.name`, tenantId),
    all<{ id: string; name: string; org: string; org_id: string; classification: string | null; account_owner_id: string | null; data_owner_id: string | null;
      value: number | string | null; expected_close: string | null; owner_id: string | null }>(
      `SELECT p.id, p.name, o.name AS org, p.org_id, o.classification, o.account_owner_id, o.data_owner_id, p.value, p.expected_close, p.owner_id
       FROM opportunities p JOIN orgs o ON o.id = p.org_id AND o.tenant_id = p.tenant_id
       WHERE p.tenant_id = ? AND p.stage NOT IN ('won', 'lost') ORDER BY p.expected_close, p.name`, tenantId),
    all<{ n: number | string }>("SELECT COUNT(*) AS n FROM review_items WHERE tenant_id = ? AND status = 'open'", tenantId),
  ]);
  /* ดีลที่ปิดได้ใน 9–15 เดือนที่แล้ว และยังไม่มีดีลต่อสัญญา (E4) — รอบถัดไปของลูกค้าเดิมที่ยังไม่มีใครเริ่มคุย */
  const renewFrom = new Date(+now - 15 * 30.44 * 864e5).toISOString(), renewTo = new Date(+now - 9 * 30.44 * 864e5).toISOString();
  const unrenewed = await all<{ id: string; name: string; org: string; classification: string | null; account_owner_id: string | null; data_owner_id: string | null; updated_at: string; owner_id: string | null }>(
    `SELECT p.id, p.name, o.name AS org, o.classification, o.account_owner_id, o.data_owner_id, p.updated_at, p.owner_id
     FROM opportunities p JOIN orgs o ON o.id = p.org_id AND o.tenant_id = p.tenant_id
     WHERE p.tenant_id = ? AND p.stage = 'won' AND p.deleted_at IS NULL AND p.updated_at BETWEEN ? AND ?
       AND NOT EXISTS (SELECT 1 FROM opportunities r WHERE r.tenant_id = p.tenant_id AND r.renewed_from = p.id AND r.deleted_at IS NULL)
     ORDER BY p.updated_at`, tenantId, renewFrom, renewTo);

  const visOrgs = orgs.filter(seeOrg);
  const active = (o: Org) => Number(o.cur) > 0 || Number(o.open_deals) > 0;
  const orgItem = (o: Org, detail?: string): HealthItem => ({ id: o.id, name: o.name, href: `/app/accounts/${o.id}?tab=details`, detail });
  const check = (key: string, title: string, why: string, severity: HealthCheck["severity"], all_: HealthItem[], action?: HealthCheck["action"]): HealthCheck =>
    ({ key, title, why, severity, count: all_.length, items: all_.slice(0, SAMPLE), action });

  /* เลขนิติบุคคลซ้ำ — ควรเป็นบริษัทเดียวกัน (การแก้ด้วยมือกันไว้แล้ว แต่ข้อมูลเก่าก่อน C2 อาจมี) */
  const byTax = new Map<string, Org[]>();
  for (const o of visOrgs) if (o.tax_id) byTax.set(o.tax_id, [...(byTax.get(o.tax_id) ?? []), o]);
  const taxDup = [...byTax.values()].filter((g) => g.length > 1).flatMap((g) => g.map((o) => orgItem(o, `เลข ${o.tax_id} · ซ้ำกับ ${g.filter((x) => x !== o).map((x) => x.name).join(", ")}`)));

  const visStale = stale.filter((s) => seeOrg({ classification: s.org_class, account_owner_id: s.account_owner_id, data_owner_id: s.data_owner_id })
    && canSee(viewer.clearance, lv(s.person_class)));
  const visDeals = deals.filter(seeOrg);
  const hasTeams = Number(teams[0]?.n ?? 0) > 0;
  const dealItem = (d: (typeof deals)[number], detail: string): HealthItem => ({ id: d.id, name: d.name, href: `/app/deals/${d.id}`, detail: `${d.org} · ${detail}` });

  const checks: HealthCheck[] = [
    check("stale_affiliation", `สังกัดที่ไม่มีหลักฐานใหม่เกิน ${STALE_MONTHS} เดือน`,
      "คนอาจย้ายงานไปแล้ว — ส่งข้อเสนอถึงคนที่ไม่อยู่แล้วเสียโอกาสและเสียภาพ · ยืนยันว่ายังอยู่ หรือบันทึกว่าออกแล้ว", "risk",
      visStale.map((s) => ({ id: s.customer_id, name: s.name, href: `/app/customers/${s.customer_id}`, affiliationId: s.aff_id,
        detail: `${s.org} · เห็นล่าสุด ${s.seen ? s.seen.slice(0, 10) : "ไม่ทราบ"}` }))),
    check("deal_overdue", "ดีลเปิดที่เลยวันปิดคาดแล้ว", "ไปป์ไลน์และพยากรณ์จะเพี้ยน — เลื่อนวันปิดคาด หรือปิดดีลว่าไม่ได้", "risk",
      visDeals.filter((d) => d.expected_close && d.expected_close < today).map((d) => dealItem(d, `ปิดคาด ${d.expected_close} · ${d.owner_id ?? "ไม่มีเจ้าของ"}`))),
    check("renewal_missing", "ลูกค้าที่ปิดได้ราวหนึ่งปีก่อน แต่ยังไม่มีดีลต่อสัญญา", "รอบถัดไปของลูกค้าเดิมคือดีลที่ปิดง่ายที่สุด — สร้างดีลต่อสัญญาจากหน้าดีลเดิม", "risk",
      unrenewed.filter(seeOrg).map((d) => ({ id: d.id, name: d.name, href: `/app/deals/${d.id}`, detail: `${d.org} · ปิดได้ ${d.updated_at.slice(0, 10)} · ${d.owner_id ?? "ไม่มีเจ้าของ"}` }))),
    check("tax_duplicate", "บริษัทที่เลขนิติบุคคลซ้ำกัน", "เลขเดียวกัน = นิติบุคคลเดียวกัน — ควรรวมเป็นแฟ้มเดียว ไม่งั้นประวัติและดีลกระจายสองที่", "risk", taxDup,
      { label: "ไปที่คิวตรวจข้อมูลซ้ำ", href: "/app/vault/review" }),
    check("deal_no_value", "ดีลเปิดที่ยังไม่มีมูลค่า", "ไม่ถูกนับในไปป์ไลน์และพยากรณ์", "gap",
      visDeals.filter((d) => d.value == null).map((d) => dealItem(d, d.owner_id ?? "ไม่มีเจ้าของ"))),
    check("deal_no_close", "ดีลเปิดที่ยังไม่มีวันปิดคาด", "ไม่ถูกนับในพยากรณ์รายไตรมาส", "gap",
      visDeals.filter((d) => !d.expected_close).map((d) => dealItem(d, d.owner_id ?? "ไม่มีเจ้าของ"))),
    check("org_no_owner", "บริษัทที่มีดีลเปิดแต่ยังไม่มีเจ้าของบัญชี", "ไม่มีใครรับผิดชอบติดตาม — บัญชีเงียบในหน้าแรกจะไม่ไปหาใคร", "gap",
      visOrgs.filter((o) => Number(o.open_deals) > 0 && !o.account_owner_id).map((o) => orgItem(o, `ดีลเปิด ${o.open_deals}`)),
      { label: "ดูในรายการบริษัท", href: "/app/accounts?view=open_deals&owner=-" }),
    check("org_no_industry", "บริษัทที่ยังไม่ระบุอุตสาหกรรม", "แยกรายงานและตั้งแคมเปญตามอุตสาหกรรมไม่ได้ · นับเฉพาะบริษัทที่มีคนหรือดีลอยู่", "gap",
      visOrgs.filter((o) => active(o) && !o.industry).map((o) => orgItem(o, `คนปัจจุบัน ${o.cur}`))),
    ...(hasTeams ? [check("org_no_team", "บริษัทที่มีดีลเปิดแต่ยังไม่ระบุทีม", "พยากรณ์รายทีมจะขาดดีลเหล่านี้", "gap",
      visOrgs.filter((o) => Number(o.open_deals) > 0 && !o.team_id).map((o) => orgItem(o, `ดีลเปิด ${o.open_deals}`)),
      { label: "ดูในรายการบริษัท", href: "/app/accounts?view=open_deals&team=-" })] : []),
    check("person_no_contact", "ผู้ติดต่อที่ไม่มีอีเมลหรือเบอร์", "ติดต่อไม่ได้ และการนำเข้าครั้งหน้าจับคู่ไม่ได้ว่าเป็นคนเดิม", "gap",
      noContact.filter((c) => canSee(viewer.clearance, lv(c.classification))).map((c) => ({ id: c.id, name: c.name, href: `/app/customers/${c.id}` }))),
  ];
  const pending = Number(review[0]?.n ?? 0);
  if (pending) checks.push({ key: "review_queue", title: "รายการรอตรวจข้อมูลซ้ำ", why: "คนหรือบริษัทที่อาจเป็นรายเดียวกัน — ยังไม่รวมจนกว่าจะมีคนตัดสิน", severity: "gap",
    count: pending, items: [], action: { label: "เปิดคิวตรวจ", href: "/app/vault/review" } });
  return checks.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "risk" ? -1 : 1));
}
