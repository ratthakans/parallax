import { randomUUID } from "node:crypto";
import { all, get, run, tx, type Sql } from "@/lib/engine/sql";
import { logActivity } from "@/lib/engine/db";
import { bangkokDay } from "@/lib/shared/format";
import { decide, type Decision } from "@/lib/engine/policy";
import { personIdsOf } from "@/lib/engine/vault/merge";
import {
  CHANNELS, MESSAGE_KINDS, OUTCOMES, TARGET_STATUS_TH, describeCriteria,
  type Channel, type Criteria, type MessageKind, type TargetStatus,
} from "@/lib/shared/policy";
import type { Eligibility } from "@/lib/shared/vault";

/* ── Campaign Workspace (docs/plan.md B5 · Blueprint 2.0 บท 2, 5) ─────────────

   หนึ่งวงจรขาย: เกณฑ์ที่อ่านได้ → รายชื่อเป้าหมายพร้อมเหตุผล → ตรวจนโยบาย → มอบหมาย → บันทึกผล → ทบทวนรายสัปดาห์
   - เกณฑ์ตรวจกับหลักฐานในฐานเท่านั้น (สังกัดปัจจุบัน · ตำแหน่ง · การร่วมงาน · อุตสาหกรรมที่คนบันทึก) — ไม่มีคะแนน
   - ทุกเป้าหมายมีผลตัดสินนโยบายพร้อมรุ่น · ตรวจซ้ำตอนมอบหมายและตอนบันทึกว่าติดต่อ (ไม่อาศัยสถานะตอนสร้างรายชื่อ)
   - ถอน/คัดค้าน/ขอจำกัด → เป้าหมายที่ยังไม่จบถูกยกเลิก และงานที่ค้างถูกยกเลิกทันที
   - pilot: ไม่เกิน 100 บริษัทต่อแคมเปญ (Blueprint บท 11) */

export const MAX_ORGS = 100;
const FINAL: TargetStatus[] = ["won", "lost", "not_interested", "cancelled"];
const now = () => new Date().toISOString();
const clean = (v: unknown, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export type CampaignInput = {
  name: string; offer?: string; purposeId: string; channel: string; messageKind: string;
  disclosurePurposeId?: string; criteria: Criteria; ownerId?: string; startsAt?: string; endsAt?: string;
};

export async function logWork(q: Sql | null, tenantId: string, actor: string, isStaff: boolean, kind: string, campaignId: string | null, targetId: string | null) {
  const sql = "INSERT INTO work_log (tenant_id, actor, is_staff, kind, campaign_id, target_id, at) VALUES (?,?,?,?,?,?,?)";
  if (q) await q.run(sql, tenantId, actor, isStaff ? 1 : 0, kind, campaignId, targetId, now());
  else await run(sql, tenantId, actor, isStaff ? 1 : 0, kind, campaignId, targetId, now());
}

function normaliseCriteria(c: Criteria): Criteria {
  const list = (xs?: string[]) => (xs ?? []).map((x) => clean(x, 60)).filter(Boolean).slice(0, 10);
  const max = Math.max(1, Math.min(10, Math.round(Number(c.maxPerOrg) || 2)));
  return {
    titleKeywords: list(c.titleKeywords), program: clean(c.program, 120) || undefined, roles: list(c.roles),
    sinceEdition: clean(c.sinceEdition, 10) || undefined, industry: clean(c.industry, 80) || undefined,
    excludeOpenOpportunities: Boolean(c.excludeOpenOpportunities), maxPerOrg: max,
  };
}

export async function createCampaign(tenantId: string, input: CampaignInput, actor: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const name = clean(input.name, 120);
  if (!name) return { ok: false, error: "ตั้งชื่อแคมเปญ เช่น \"ขายสปอนเซอร์ Sunline 2027\"" };
  if (!(CHANNELS as readonly string[]).includes(input.channel)) return { ok: false, error: "เลือกช่องทาง" };
  if (!(MESSAGE_KINDS as readonly string[]).includes(input.messageKind)) return { ok: false, error: "เลือกชนิดข้อความ" };
  if (!(await get("SELECT 1 AS x FROM purposes WHERE tenant_id = ? AND id = ?", tenantId, input.purposeId))) return { ok: false, error: "เลือกวัตถุประสงค์ของแคมเปญ" };
  const disclosure = input.disclosurePurposeId || null;
  if (disclosure && !(await get("SELECT 1 AS x FROM purposes WHERE tenant_id = ? AND id = ?", tenantId, disclosure))) return { ok: false, error: "ไม่พบวัตถุประสงค์ของการเปิดเผย" };
  const id = randomUUID(), at = now();
  await run(
    `INSERT INTO sales_campaigns (id, tenant_id, name, offer, purpose_id, channel, message_kind, disclosure_purpose_id, criteria, status, owner_id, starts_at, ends_at, created_by, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id, tenantId, name, clean(input.offer, 500) || null, input.purposeId, input.channel, input.messageKind, disclosure,
    JSON.stringify(normaliseCriteria(input.criteria)), "draft", clean(input.ownerId, 120) || actor, clean(input.startsAt, 10) || null, clean(input.endsAt, 10) || null, actor, at, at,
  );
  await logActivity(tenantId, actor, "campaign_create", id);
  return { ok: true, id };
}

export async function updateCriteria(tenantId: string, campaignId: string, criteria: Criteria, actor: string) {
  const c = await get("SELECT 1 AS x FROM sales_campaigns WHERE tenant_id = ? AND id = ?", tenantId, campaignId);
  if (!c) return { ok: false as const, error: "ไม่พบแคมเปญ" };
  await run("UPDATE sales_campaigns SET criteria = ?, updated_at = ? WHERE tenant_id = ? AND id = ?", JSON.stringify(normaliseCriteria(criteria)), now(), tenantId, campaignId);
  await logActivity(tenantId, actor, "campaign_criteria", campaignId);
  return { ok: true as const };
}

type CampaignRow = {
  id: string; name: string; offer: string | null; purpose_id: string; channel: Channel; message_kind: MessageKind;
  disclosure_purpose_id: string | null; criteria: string; status: string; owner_id: string | null; starts_at: string | null;
  ends_at: string | null; created_at: string;
};
const loadCampaign = (tenantId: string, id: string) =>
  get<CampaignRow>("SELECT * FROM sales_campaigns WHERE tenant_id = ? AND id = ?", tenantId, id);
const askFor = (c: CampaignRow, customerId: string) => ({
  customerId, purposeId: c.purpose_id, channel: c.channel, messageKind: c.message_kind, disclosurePurposeId: c.disclosure_purpose_id,
});

/* ── เกณฑ์ → คนที่เข้าเกณฑ์ พร้อมเหตุผล ── */
type Match = { customerId: string; orgId: string; reasons: string[]; rank: number };

export async function matchCriteria(tenantId: string, raw: Criteria): Promise<{ matches: Match[]; orgsOverCap: number }> {
  const c = normaliseCriteria(raw);
  const affs = await all<{ customer_id: string; org_id: string; org: string; name: string; title: string | null; valid_from: string | null;
    confirmed_by: string | null; industry: string | null }>(
    `SELECT a.customer_id, a.org_id, o.name AS org, cu.name, a.title, a.valid_from, a.confirmed_by, o.industry
     FROM affiliations a JOIN orgs o ON o.id = a.org_id AND o.tenant_id = a.tenant_id
     JOIN customers cu ON cu.id = a.customer_id AND cu.tenant_id = a.tenant_id
     WHERE a.tenant_id = ? AND a.valid_to IS NULL ORDER BY o.name, cu.name`, tenantId);
  const parts = c.program || c.roles?.length
    ? await all<{ customer_id: string; program: string; edition: string | null; role: string }>(
        "SELECT customer_id, program, edition, role FROM participations WHERE tenant_id = ?", tenantId)
    : [];
  const openOpp = c.excludeOpenOpportunities
    ? new Set((await all<{ org_id: string }>("SELECT DISTINCT org_id FROM opportunities WHERE tenant_id = ? AND stage NOT IN ('won','lost')", tenantId)).map((r) => r.org_id))
    : new Set<string>();
  const kw = (c.titleKeywords ?? []).map((k) => k.toLowerCase());
  const byOrg = new Map<string, Match[]>();
  for (const a of affs) {
    if (openOpp.has(a.org_id)) continue;
    if (c.industry && !(a.industry ?? "").toLowerCase().includes(c.industry.toLowerCase())) continue;
    const reasons = [`${a.org} · ${a.title ?? "ไม่ทราบตำแหน่ง"} (ยังสังกัด${a.valid_from ? ` ตั้งแต่ ${a.valid_from.slice(0, 10)}` : ""}${a.confirmed_by ? " · คนยืนยันแล้ว" : ""})`];
    let rank = a.confirmed_by ? 1 : 0;
    if (kw.length) {
      const hit = kw.find((k) => (a.title ?? "").toLowerCase().includes(k));
      if (!hit) continue;
      reasons.push(`ตำแหน่งตรงคำว่า “${hit}”`);
      rank += 4;
    }
    if (c.program || c.roles?.length) {
      const mine = parts.filter((p) => p.customer_id === a.customer_id
        && (!c.program || p.program.toLowerCase().includes(c.program.toLowerCase()))
        && (!c.roles?.length || c.roles.some((r) => p.role.toLowerCase().includes(r.toLowerCase())))
        && (!c.sinceEdition || (p.edition != null && p.edition >= c.sinceEdition)));
      if (!mine.length) continue;
      mine.slice(0, 3).forEach((p) => reasons.push(`เคยเป็น${p.role} ${p.program}${p.edition ? ` ${p.edition}` : ""}`));
      rank += 2 + mine.length;
    }
    if (c.industry) reasons.push(`อุตสาหกรรม: ${a.industry}`);
    byOrg.set(a.org_id, [...(byOrg.get(a.org_id) ?? []), { customerId: a.customer_id, orgId: a.org_id, reasons, rank }]);
  }
  const orgs = [...byOrg.entries()].sort((x, y) => Math.max(...y[1].map((m) => m.rank)) - Math.max(...x[1].map((m) => m.rank)));
  const matches = orgs.slice(0, MAX_ORGS).flatMap(([, ms]) => ms.sort((x, y) => y.rank - x.rank).slice(0, c.maxPerOrg ?? 2));
  return { matches, orgsOverCap: Math.max(0, orgs.length - MAX_ORGS) };
}

/** สร้าง/ปรับรายชื่อเป้าหมายตามเกณฑ์ปัจจุบัน — เป้าหมายที่มอบหมายแล้วไม่ถูกลบ แม้เกณฑ์เปลี่ยน */
export async function buildTargets(tenantId: string, campaignId: string, actor: string) {
  const c = await loadCampaign(tenantId, campaignId);
  if (!c) return { ok: false as const, error: "ไม่พบแคมเปญ" };
  const { matches, orgsOverCap } = await matchCriteria(tenantId, JSON.parse(c.criteria) as Criteria);
  const decisions = new Map<string, Decision>();
  for (const m of matches) {
    const d = await decide(tenantId, askFor(c, m.customerId));
    if (d.failed) return { ok: false as const, error: "บริการนโยบายใช้ไม่ได้ — ยังไม่สร้างรายชื่อ (fail closed)" };
    decisions.set(m.customerId, d);
  }
  const at = now();
  await tx(async (q) => {
    const keep = new Set(matches.map((m) => m.customerId));
    const existing = await q.all<{ id: string; customer_id: string; status: string }>(
      "SELECT id, customer_id, status FROM campaign_targets WHERE tenant_id = ? AND campaign_id = ?", tenantId, campaignId);
    for (const e of existing) if (!keep.has(e.customer_id) && e.status === "open") await q.run("DELETE FROM campaign_targets WHERE tenant_id = ? AND id = ?", tenantId, e.id);
    for (const m of matches) {
      const d = decisions.get(m.customerId)!;
      const prev = existing.find((e) => e.customer_id === m.customerId);
      if (prev) {
        await q.run(
          `UPDATE campaign_targets SET org_id = ?, reasons = ?, eligibility = ?, eligibility_reasons = ?, policy_version = ?, checked_at = ?, updated_at = ?
           WHERE tenant_id = ? AND id = ?`,
          m.orgId, JSON.stringify(m.reasons), d.status, JSON.stringify(d.reasons), d.policyVersion, at, at, tenantId, prev.id);
        /* เป้าหมายที่มอบหมายแล้วแต่ตอนนี้ถูกระงับ: ยกเลิกพร้อมงานค้าง แบบเดียวกับ recheckTargetsFor — ไม่ใช่แค่เปลี่ยนป้าย */
        if (d.status === "suppressed" && prev.status !== "open" && !FINAL.includes(prev.status as TargetStatus)) {
          await q.run("UPDATE campaign_targets SET status = 'cancelled', outcome = ? WHERE tenant_id = ? AND id = ?", d.reasons.join(" · "), tenantId, prev.id);
          await q.run("UPDATE tasks SET status = 'cancelled', outcome = ?, done_at = ? WHERE tenant_id = ? AND target_id = ? AND status = 'open'", "ยกเลิกตามนโยบาย", at, tenantId, prev.id);
        }
      } else {
        await q.run(
          `INSERT INTO campaign_targets (id, tenant_id, campaign_id, org_id, customer_id, reasons, eligibility, eligibility_reasons, policy_version, checked_at, assigned_to, status, outcome, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          randomUUID(), tenantId, campaignId, m.orgId, m.customerId, JSON.stringify(m.reasons), d.status, JSON.stringify(d.reasons), d.policyVersion, at, null, "open", null, at, at);
      }
    }
    await q.run("UPDATE sales_campaigns SET status = CASE WHEN status = 'draft' THEN 'active' ELSE status END, updated_at = ? WHERE tenant_id = ? AND id = ?", at, tenantId, campaignId);
  });
  await logActivity(tenantId, actor, "campaign_targets", `${campaignId} · ${matches.length} people`);
  const count = (s: Eligibility) => [...decisions.values()].filter((d) => d.status === s).length;
  return { ok: true as const, people: matches.length, orgs: new Set(matches.map((m) => m.orgId)).size, orgsOverCap,
    eligible: count("eligible"), review: count("review_required"), suppressed: count("suppressed"), channelInvalid: count("channel_invalid") };
}

/* ── มอบหมาย: ตรวจนโยบายซ้ำ ณ ตอนนี้ ไม่ใช้ผลตอนสร้างรายชื่อ ── */
export async function assignTarget(
  tenantId: string, targetId: string, assignee: string, dueOn: string, actor: string, isStaff = false,
): Promise<{ ok: true } | { ok: false; error: string; reasons?: string[] }> {
  const t = await get<{ campaign_id: string; customer_id: string; org_id: string | null; status: string; name: string }>(
    `SELECT t.campaign_id, t.customer_id, t.org_id, t.status, cu.name FROM campaign_targets t
     JOIN customers cu ON cu.id = t.customer_id AND cu.tenant_id = t.tenant_id WHERE t.tenant_id = ? AND t.id = ?`, tenantId, targetId);
  if (!t) return { ok: false, error: "ไม่พบเป้าหมายนี้" };
  if (FINAL.includes(t.status as TargetStatus)) return { ok: false, error: `เป้าหมายนี้จบแล้ว (${TARGET_STATUS_TH[t.status as TargetStatus]})` };
  const who = clean(assignee, 120);
  if (!who) return { ok: false, error: "เลือกผู้รับผิดชอบ" };
  const due = clean(dueOn, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return { ok: false, error: "ระบุวันครบกำหนด" };
  const c = (await loadCampaign(tenantId, t.campaign_id))!;
  const d = await decide(tenantId, askFor(c, t.customer_id));
  const at = now();
  await run("UPDATE campaign_targets SET eligibility = ?, eligibility_reasons = ?, policy_version = ?, checked_at = ? WHERE tenant_id = ? AND id = ?",
    d.status, JSON.stringify(d.reasons), d.policyVersion, at, tenantId, targetId);
  if (d.failed) return { ok: false, error: "บริการนโยบายใช้ไม่ได้ — ยังไม่มอบหมาย (fail closed)" };
  if (d.status !== "eligible") return { ok: false, error: "นโยบายยังไม่อนุญาตให้ติดต่อคนนี้ในแคมเปญนี้", reasons: d.reasons };
  const res = await tx(async (q) => {
    /* จองเป้าหมายก่อน: ถ้าถูกยกเลิกระหว่างตรวจนโยบาย (ถอน/คัดค้าน) ต้องไม่สร้างงานเปิดค้างไว้ */
    const claimed = await q.run(
      `UPDATE campaign_targets SET assigned_to = ?, status = CASE WHEN status = 'open' THEN 'assigned' ELSE status END, updated_at = ?
       WHERE tenant_id = ? AND id = ? AND status NOT IN (${FINAL.map(() => "?").join(",")})`,
      who, at, tenantId, targetId, ...FINAL);
    if (!claimed.changes) return false;
    await q.run("UPDATE tasks SET status = 'cancelled', done_at = ? WHERE tenant_id = ? AND target_id = ? AND status = 'open'", at, tenantId, targetId);
    await q.run(
      `INSERT INTO tasks (id, tenant_id, title, status, due_at, owner_id, org_id, customer_id, opportunity_id, outcome, created_by, created_at, done_at, campaign_id, target_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      randomUUID(), tenantId, `ติดต่อ ${t.name} — ${c.name}`, "open", due, who, t.org_id, t.customer_id, null, null, actor, at, null, t.campaign_id, targetId);
    await logWork(q, tenantId, actor, isStaff, "assign", t.campaign_id, targetId);
    return true;
  });
  if (!res) return { ok: false, error: "เป้าหมายนี้เพิ่งถูกปิดหรือยกเลิก — ยังไม่มอบหมาย" };
  await logActivity(tenantId, actor, "target_assign", targetId);
  return { ok: true };
}

/* ── บันทึกผล ── ติดต่อแล้ว · นัดประชุม · ส่งข้อเสนอ · ปิดได้ · ไม่ได้ · ไม่สนใจ */
export async function recordOutcome(
  tenantId: string, targetId: string,
  input: { outcome: string; note: string; nextStep?: string; nextDue?: string; value?: number },
  actor: string, isStaff = false,
): Promise<{ ok: true } | { ok: false; error: string; reasons?: string[] }> {
  if (!OUTCOMES.includes(input.outcome as TargetStatus)) return { ok: false, error: "เลือกผลการติดต่อ" };
  const outcome = input.outcome as TargetStatus;
  const note = clean(input.note, 1000);
  if (!note) return { ok: false, error: "สรุปสั้น ๆ ว่าเกิดอะไรขึ้น" };
  const t = await get<{ campaign_id: string; customer_id: string; org_id: string | null; status: string }>(
    "SELECT campaign_id, customer_id, org_id, status FROM campaign_targets WHERE tenant_id = ? AND id = ?", tenantId, targetId);
  if (!t) return { ok: false, error: "ไม่พบเป้าหมายนี้" };
  if (FINAL.includes(t.status as TargetStatus)) return { ok: false, error: `เป้าหมายนี้จบแล้ว (${TARGET_STATUS_TH[t.status as TargetStatus]})` };
  /* เป้าหมายที่ยังไม่ถูกมอบหมายคือคนที่ยังไม่ผ่านการตรวจตอนมอบหมาย — หน้าจอซ่อนฟอร์มอยู่แล้ว แต่ action ยิงตรงได้ */
  if (t.status === "open") return { ok: false, error: "มอบหมายเป้าหมายนี้ก่อน แล้วค่อยบันทึกผล" };
  const c = (await loadCampaign(tenantId, t.campaign_id))!;
  const nextStep = clean(input.nextStep, 200);
  const nextDue = clean(input.nextDue, 10);
  if (nextStep && !/^\d{4}-\d{2}-\d{2}$/.test(nextDue)) return { ok: false, error: "ขั้นตอนถัดไปต้องมีวันครบกำหนด" };
  /* ก่อนบันทึกว่าติดต่อ/นัด/เสนอ หรือสร้างงานติดต่อต่อ: ตรวจซ้ำ และต้องผ่านจริง (Eligible)
     Review required = ยังไม่มีหลักฐานพอให้ติดต่อ (plan 6.1) — ไม่ใช่แค่กันคนที่ถูกระงับ */
  if (!["lost", "not_interested"].includes(outcome) || nextStep) {
    const d = await decide(tenantId, askFor(c, t.customer_id));
    if (d.failed) return { ok: false, error: "บริการนโยบายใช้ไม่ได้ — ยังไม่บันทึก (fail closed)" };
    if (d.status === "suppressed") return { ok: false, error: "คนนี้ถูกระงับการติดต่อแล้ว — หยุดติดต่อ", reasons: d.reasons };
    if (d.status !== "eligible") return { ok: false, error: "นโยบายยังไม่อนุญาตให้ติดต่อคนนี้ในแคมเปญนี้ — ยังไม่บันทึก", reasons: d.reasons };
  }
  const at = now();
  const res = await tx(async (q) => {
    /* จองเป้าหมายก่อนเขียนอย่างอื่น: ถ้าระหว่างตรวจนโยบายมีคนบันทึกการถอน (recheckTargetsFor → cancelled)
       หรือมีผลอื่นปิดเป้าหมายไปแล้ว ต้องไม่เขียนทับและไม่สร้างงานใหม่ */
    const claimed = await q.run(
      `UPDATE campaign_targets SET status = ?, outcome = ?, updated_at = ? WHERE tenant_id = ? AND id = ? AND status NOT IN (${FINAL.map(() => "?").join(",")})`,
      outcome, note, at, tenantId, targetId, ...FINAL);
    if (!claimed.changes) return false;
    const kind = c.channel === "email" ? "email" : c.channel === "phone" ? "call" : "meeting";
    if (t.org_id) {
      await q.run(
        `INSERT INTO interactions (id, tenant_id, kind, occurred_at, org_id, customer_id, opportunity_id, summary, outcome, owner_id, source_id, classification, recorded_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        randomUUID(), tenantId, kind, bangkokDay(Date.parse(at)), t.org_id, t.customer_id, null, `${c.name}: ${note}`, TARGET_STATUS_TH[outcome], actor, null, "confidential", at);
      await q.run("DELETE FROM account_briefs WHERE tenant_id = ? AND org_id = ?", tenantId, t.org_id);
    }
    await q.run("UPDATE tasks SET status = 'done', outcome = ?, done_at = ? WHERE tenant_id = ? AND target_id = ? AND status = 'open'", TARGET_STATUS_TH[outcome], at, tenantId, targetId);
    if (nextStep) {
      await q.run(
        `INSERT INTO tasks (id, tenant_id, title, status, due_at, owner_id, org_id, customer_id, opportunity_id, outcome, created_by, created_at, done_at, campaign_id, target_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        randomUUID(), tenantId, nextStep, "open", nextDue, actor, t.org_id, t.customer_id, null, null, actor, at, null, t.campaign_id, targetId);
    }
    /* โอกาสแบบง่าย: เกิดเมื่อส่งข้อเสนอ · ขั้นตามผล · หนึ่งโอกาสต่อ (แคมเปญ · บริษัท) */
    if (t.org_id && ["proposal", "won", "lost"].includes(outcome)) {
      const opp = await q.get<{ id: string }>("SELECT id FROM opportunities WHERE tenant_id = ? AND org_id = ? AND campaign_id = ?", tenantId, t.org_id, t.campaign_id);
      const stage = outcome === "proposal" ? "proposal" : outcome;
      if (opp) await q.run("UPDATE opportunities SET stage = ?, value = COALESCE(?, value), updated_at = ? WHERE tenant_id = ? AND id = ?", stage, input.value ?? null, at, tenantId, opp.id);
      else if (outcome === "proposal" || outcome === "won") {
        const oid = randomUUID();
        await q.run(
          `INSERT INTO opportunities (id, tenant_id, org_id, name, offer, stage, owner_id, value, expected_close, created_at, updated_at, campaign_id)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          oid, tenantId, t.org_id, c.name, c.offer, stage, actor, input.value ?? null, c.ends_at, at, at, t.campaign_id);
        await q.run("INSERT INTO opportunity_people (tenant_id, opportunity_id, customer_id, role) VALUES (?,?,?,?)", tenantId, oid, t.customer_id, "ผู้ติดต่อ");
      }
    }
    await logWork(q, tenantId, actor, isStaff, `outcome:${outcome}`, t.campaign_id, targetId);
    return true;
  });
  if (!res) return { ok: false, error: "เป้าหมายนี้เพิ่งถูกปิดหรือยกเลิก (เช่น เจ้าของข้อมูลถอนความยินยอม) — ยังไม่บันทึก" };
  await logActivity(tenantId, actor, "target_outcome", `${targetId} · ${outcome}`);
  return { ok: true };
}

/** หลังเจ้าของข้อมูลถอน/คัดค้าน/ขอจำกัด: ตรวจทุกเป้าหมายที่ยังไม่จบของคนนี้ — ไม่ผ่าน = ยกเลิกพร้อมงานค้าง */
export async function recheckTargetsFor(tenantId: string, customerId: string, actor: string): Promise<{ cancelled: number }> {
  const ids = await personIdsOf(tenantId, customerId);
  const targets = await all<{ id: string; campaign_id: string; customer_id: string; status: string }>(
    `SELECT id, campaign_id, customer_id, status FROM campaign_targets WHERE tenant_id = ? AND customer_id IN (${ids.map(() => "?").join(",")})`,
    tenantId, ...ids);
  let cancelled = 0;
  for (const t of targets) {
    if (FINAL.includes(t.status as TargetStatus)) continue;
    const c = await loadCampaign(tenantId, t.campaign_id);
    if (!c) continue;
    const d = await decide(tenantId, askFor(c, t.customer_id));
    const at = now();
    const stop = d.failed || d.status === "suppressed";
    await tx(async (q) => {
      await q.run("UPDATE campaign_targets SET eligibility = ?, eligibility_reasons = ?, policy_version = ?, checked_at = ?, updated_at = ? WHERE tenant_id = ? AND id = ?",
        d.status, JSON.stringify(d.reasons), d.policyVersion, at, at, tenantId, t.id);
      if (stop) {
        await q.run("UPDATE campaign_targets SET status = 'cancelled', outcome = ? WHERE tenant_id = ? AND id = ?", d.reasons.join(" · "), tenantId, t.id);
        await q.run("UPDATE tasks SET status = 'cancelled', outcome = ?, done_at = ? WHERE tenant_id = ? AND target_id = ? AND status = 'open'", "ยกเลิกตามนโยบาย", at, tenantId, t.id);
      }
    });
    if (stop) cancelled++;
  }
  if (cancelled) await logActivity(tenantId, actor, "targets_cancelled", `${customerId} · ${cancelled}`);
  return { cancelled };
}

/* ── อ่าน ── */

export async function listCampaigns(tenantId: string) {
  return all<{ id: string; name: string; status: string; channel: Channel; message_kind: MessageKind; purpose: string | null; owner_id: string | null;
    targets: number | string; eligible: number | string; won: number | string; created_at: string }>(
    `SELECT c.id, c.name, c.status, c.channel, c.message_kind, p.name AS purpose, c.owner_id, c.created_at,
       (SELECT COUNT(*) FROM campaign_targets t WHERE t.tenant_id = c.tenant_id AND t.campaign_id = c.id) AS targets,
       (SELECT COUNT(*) FROM campaign_targets t WHERE t.tenant_id = c.tenant_id AND t.campaign_id = c.id AND t.eligibility = 'eligible') AS eligible,
       (SELECT COUNT(*) FROM campaign_targets t WHERE t.tenant_id = c.tenant_id AND t.campaign_id = c.id AND t.status = 'won') AS won
     FROM sales_campaigns c LEFT JOIN purposes p ON p.id = c.purpose_id AND p.tenant_id = c.tenant_id
     WHERE c.tenant_id = ? ORDER BY c.created_at DESC`, tenantId);
}

export type TargetView = {
  id: string; customerId: string; name: string; orgId: string | null; org: string | null; reasons: string[];
  eligibility: Eligibility; eligibilityReasons: string[]; policyVersion: string; checkedAt: string;
  assignedTo: string | null; status: TargetStatus; outcome: string | null; due: string | null; updatedAt: string;
};

export async function getCampaign(tenantId: string, id: string) {
  const c = await loadCampaign(tenantId, id);
  if (!c) return null;
  const [purpose, disclosure, targets] = await Promise.all([
    get<{ name: string }>("SELECT name FROM purposes WHERE tenant_id = ? AND id = ?", tenantId, c.purpose_id),
    c.disclosure_purpose_id ? get<{ name: string }>("SELECT name FROM purposes WHERE tenant_id = ? AND id = ?", tenantId, c.disclosure_purpose_id) : null,
    all<Record<string, string | null>>(
      `SELECT t.*, cu.name, o.name AS org,
         (SELECT MIN(k.due_at) FROM tasks k WHERE k.tenant_id = t.tenant_id AND k.target_id = t.id AND k.status = 'open') AS due
       FROM campaign_targets t JOIN customers cu ON cu.id = t.customer_id AND cu.tenant_id = t.tenant_id
       LEFT JOIN orgs o ON o.id = t.org_id AND o.tenant_id = t.tenant_id
       WHERE t.tenant_id = ? AND t.campaign_id = ? ORDER BY o.name, cu.name`, tenantId, id),
  ]);
  const criteria = JSON.parse(c.criteria) as Criteria;
  return {
    id: c.id, name: c.name, offer: c.offer, status: c.status, channel: c.channel, messageKind: c.message_kind,
    purposeId: c.purpose_id, purpose: purpose?.name ?? "—", disclosure: disclosure?.name ?? null, ownerId: c.owner_id,
    startsAt: c.starts_at, endsAt: c.ends_at, criteria, criteriaText: describeCriteria(criteria),
    targets: targets.map((t): TargetView => ({
      id: t.id!, customerId: t.customer_id!, name: t.name!, orgId: t.org_id, org: t.org, reasons: JSON.parse(t.reasons ?? "[]"),
      eligibility: t.eligibility as Eligibility, eligibilityReasons: JSON.parse(t.eligibility_reasons ?? "[]"), policyVersion: t.policy_version!,
      checkedAt: t.checked_at!, assignedTo: t.assigned_to, status: t.status as TargetStatus, outcome: t.outcome, due: t.due, updatedAt: t.updated_at!,
    })),
  };
}

/* ── ทบทวนรายสัปดาห์ (plan หัวข้อ 3.3) ── นับกิจกรรมที่มีผล ไม่นับ login และไม่นับทีม PARALLAX */
export async function weeklyReview(tenantId: string, since = new Date(Date.now() - 7 * 864e5).toISOString()) {
  const today = bangkokDay();
  const [byCampaign, overdue, opps, activity, moves] = await Promise.all([
    all<{ id: string; name: string; status: string; n: number | string }>(
      `SELECT c.id, c.name, t.status, COUNT(*) AS n FROM sales_campaigns c JOIN campaign_targets t ON t.campaign_id = c.id AND t.tenant_id = c.tenant_id
       WHERE c.tenant_id = ? AND c.status <> 'closed' GROUP BY c.id, c.name, t.status`, tenantId),
    all<{ id: string; title: string; due_at: string; owner_id: string | null; org: string | null; org_id: string | null }>(
      `SELECT k.id, k.title, k.due_at, k.owner_id, o.name AS org, k.org_id FROM tasks k LEFT JOIN orgs o ON o.id = k.org_id AND o.tenant_id = k.tenant_id
       WHERE k.tenant_id = ? AND k.status = 'open' AND k.due_at < ? ORDER BY k.due_at LIMIT 50`, tenantId, today),
    all<{ id: string; name: string; stage: string; org: string; org_id: string; value: number | null; updated_at: string }>(
      `SELECT p.id, p.name, p.stage, o.name AS org, p.org_id, p.value, p.updated_at FROM opportunities p JOIN orgs o ON o.id = p.org_id AND o.tenant_id = p.tenant_id
       WHERE p.tenant_id = ? AND p.updated_at >= ? ORDER BY p.updated_at DESC`, tenantId, since),
    all<{ actor: string; kind: string; n: number | string }>(
      "SELECT actor, kind, COUNT(*) AS n FROM work_log WHERE tenant_id = ? AND at >= ? AND is_staff = 0 GROUP BY actor, kind", tenantId, since),
    get<{ n: number | string }>("SELECT COUNT(*) AS n FROM work_log WHERE tenant_id = ? AND at >= ? AND is_staff = 1", tenantId, since),
  ]);
  const campaigns = new Map<string, { id: string; name: string; counts: Partial<Record<TargetStatus, number>> }>();
  for (const r of byCampaign) {
    const c = campaigns.get(r.id) ?? { id: r.id, name: r.name, counts: {} };
    c.counts[r.status as TargetStatus] = Number(r.n);
    campaigns.set(r.id, c);
  }
  const people = new Map<string, { actor: string; assign: number; outcomes: number }>();
  for (const a of activity) {
    const p = people.get(a.actor) ?? { actor: a.actor, assign: 0, outcomes: 0 };
    if (a.kind === "assign") p.assign += Number(a.n);
    else if (a.kind.startsWith("outcome:")) p.outcomes += Number(a.n);
    people.set(a.actor, p);
  }
  return { since, campaigns: [...campaigns.values()], overdue, opportunities: opps, activity: [...people.values()], staffActions: Number(moves?.n ?? 0) };
}

export async function isStaffUser(tenantId: string, userId: string | null | undefined) {
  if (!userId) return false;
  return Boolean((await get<{ is_staff: number }>("SELECT is_staff FROM tenant_users WHERE tenant_id = ? AND user_id = ?", tenantId, userId))?.is_staff);
}
