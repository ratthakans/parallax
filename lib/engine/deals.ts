import { randomUUID } from "node:crypto";
import { all, get, tx } from "@/lib/engine/sql";
import { logActivity } from "@/lib/engine/db";
import { orgAccess, type Viewer } from "@/lib/engine/accounts";
import { canSee } from "@/lib/shared/accounts";
import { OPEN_STAGES, isDealRole, isDealStage, type DealStage } from "@/lib/shared/deals";
import type { Classification } from "@/lib/shared/vault";

/* ── ดีล (docs/ux-plan.md U4) ─────────────────────────────────────────────

   ตาราง opportunities เดิม (B5: แคมเปญสร้างดีลตอนส่งข้อเสนอ) — ตอนนี้มีหน้าของมันเอง: รายการ · ไปป์ไลน์ · หน้าระเบียน
   - ย้ายขั้นเขียนรุ่นใน record_versions (ขั้นเดิม → ใหม่ · ใคร · เมื่อไร) ในธุรกรรมเดียวกับการเปลี่ยน
   - ดีลของบริษัทที่เกินสิทธิ์: ไม่ขึ้นในรายการ (ไม่เผยชื่อบริษัทหรือจำนวน) และแก้ไม่ได้ — ด่านเดียวกับแฟ้มบริษัท (orgAccess) */

export type DealRow = {
  id: string; name: string; stage: DealStage | string; value: number | null; expectedClose: string | null;
  owner: string | null; orgId: string; org: string; campaignId: string | null; campaign: string | null; updatedAt: string; createdAt: string;
};
export const DEAL_VIEWS = ["open", "mine", "all", "won", "lost"] as const;
export type DealView = (typeof DEAL_VIEWS)[number];
export const DEAL_SORTS = ["updated", "name", "value", "close", "org"] as const;
export type DealSort = (typeof DEAL_SORTS)[number];
const SORT_SQL: Record<DealSort, string> = {
  updated: "p.updated_at", name: "p.name", value: "COALESCE(p.value, -1)", close: "COALESCE(p.expected_close, '9999')", org: "o.name",
};
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const lv = (c: string | null) => (c ?? "confidential") as Classification;

export async function listDeals(
  tenantId: string, opts: { view?: DealView; sort?: DealSort; dir?: "asc" | "desc"; q?: string }, viewer: Viewer,
): Promise<DealRow[]> {
  const where = ["p.tenant_id = ?"];
  const params: string[] = [tenantId];
  const view = opts.view && (DEAL_VIEWS as readonly string[]).includes(opts.view) ? opts.view : "open";
  if (view === "open" || view === "mine") { where.push(`p.stage IN (${OPEN_STAGES.map(() => "?").join(",")})`); params.push(...OPEN_STAGES); }
  if (view === "mine") { where.push("p.owner_id = ?"); params.push(viewer.id); }
  if (view === "won" || view === "lost") { where.push("p.stage = ?"); params.push(view); }
  const q = opts.q?.trim().slice(0, 120);
  if (q) { where.push("(p.name LIKE ? OR o.name LIKE ?)"); params.push(`%${q}%`, `%${q}%`); }
  const sort = opts.sort && opts.sort in SORT_SQL ? opts.sort : "updated";
  const dir = opts.dir === "asc" ? "ASC" : opts.dir === "desc" ? "DESC" : sort === "name" || sort === "org" || sort === "close" ? "ASC" : "DESC";
  const rows = await all<{ id: string; name: string; stage: string; value: number | string | null; expected_close: string | null; owner_id: string | null;
    org_id: string; org: string; classification: string | null; acc_owner: string | null; data_owner: string | null;
    campaign_id: string | null; campaign: string | null; updated_at: string; created_at: string }>(
    `SELECT p.id, p.name, p.stage, p.value, p.expected_close, p.owner_id, p.org_id, o.name AS org, o.classification,
       o.account_owner_id AS acc_owner, o.data_owner_id AS data_owner, p.campaign_id, c.name AS campaign, p.updated_at, p.created_at
     FROM opportunities p JOIN orgs o ON o.id = p.org_id AND o.tenant_id = p.tenant_id
     LEFT JOIN sales_campaigns c ON c.id = p.campaign_id AND c.tenant_id = p.tenant_id
     WHERE ${where.join(" AND ")} ORDER BY ${SORT_SQL[sort]} ${dir}, p.id LIMIT 500`, ...params);
  return rows
    .filter((r) => canSee(viewer.clearance, lv(r.classification)) || [r.acc_owner, r.data_owner].includes(viewer.id))
    .map((r) => ({
      id: r.id, name: r.name, stage: r.stage, value: r.value == null ? null : Number(r.value), expectedClose: r.expected_close,
      owner: r.owner_id, orgId: r.org_id, org: r.org, campaignId: r.campaign_id, campaign: r.campaign, updatedAt: r.updated_at, createdAt: r.created_at,
    }));
}

export type DealRecord = DealRow & {
  people: { id: string; name: string; role: string | null }[];
  history: { field: string; oldValue: string | null; newValue: string | null; by: string; at: string; reason: string }[];
  interactions: { id: string; kind: string; at: string; summary: string | null; owner: string | null }[];
};

export async function getDeal(tenantId: string, id: string, viewer: Viewer): Promise<DealRecord | "masked" | null> {
  const r = await get<{ id: string; name: string; stage: string; value: number | string | null; expected_close: string | null; owner_id: string | null;
    org_id: string; org: string; classification: string | null; acc_owner: string | null; data_owner: string | null;
    campaign_id: string | null; campaign: string | null; updated_at: string; created_at: string }>(
    `SELECT p.id, p.name, p.stage, p.value, p.expected_close, p.owner_id, p.org_id, o.name AS org, o.classification,
       o.account_owner_id AS acc_owner, o.data_owner_id AS data_owner, p.campaign_id, c.name AS campaign, p.updated_at, p.created_at
     FROM opportunities p JOIN orgs o ON o.id = p.org_id AND o.tenant_id = p.tenant_id
     LEFT JOIN sales_campaigns c ON c.id = p.campaign_id AND c.tenant_id = p.tenant_id
     WHERE p.tenant_id = ? AND p.id = ?`, tenantId, id);
  if (!r) return null;
  if (!canSee(viewer.clearance, lv(r.classification)) && ![r.acc_owner, r.data_owner].includes(viewer.id)) return "masked";
  const [people, history, interactions] = await Promise.all([
    all<{ id: string; name: string; role: string | null; classification: string | null }>(
      `SELECT c.id, c.name, op.role, c.classification FROM opportunity_people op JOIN customers c ON c.id = op.customer_id AND c.tenant_id = op.tenant_id
       WHERE op.tenant_id = ? AND op.opportunity_id = ? ORDER BY c.name`, tenantId, id),
    all<{ field: string; old_value: string | null; new_value: string | null; changed_by: string; recorded_at: string; reason: string }>(
      "SELECT field, old_value, new_value, changed_by, recorded_at, reason FROM record_versions WHERE tenant_id = ? AND record_kind = 'opportunity' AND record_id = ? ORDER BY recorded_at DESC, id DESC",
      tenantId, id),
    all<{ id: string; kind: string; occurred_at: string; summary: string | null; owner_id: string | null; classification: string | null }>(
      "SELECT id, kind, occurred_at, summary, owner_id, classification FROM interactions WHERE tenant_id = ? AND opportunity_id = ? ORDER BY occurred_at DESC, recorded_at DESC LIMIT 30",
      tenantId, id),
  ]);
  return {
    id: r.id, name: r.name, stage: r.stage, value: r.value == null ? null : Number(r.value), expectedClose: r.expected_close, owner: r.owner_id,
    orgId: r.org_id, org: r.org, campaignId: r.campaign_id, campaign: r.campaign, updatedAt: r.updated_at, createdAt: r.created_at,
    people: people.map((p) => ({ id: p.id, name: canSee(viewer.clearance, lv(p.classification)) ? p.name : "บุคคลที่จำกัดการเข้าถึง", role: p.role })),
    history: history.map((h) => ({ field: h.field, oldValue: h.old_value, newValue: h.new_value, by: h.changed_by, at: h.recorded_at, reason: h.reason })),
    interactions: interactions.map((i) => ({
      id: i.id, kind: i.kind, at: i.occurred_at, owner: i.owner_id,
      summary: canSee(viewer.clearance, lv(i.classification)) || i.owner_id === viewer.id ? i.summary : null,
    })),
  };
}

export async function createDeal(
  tenantId: string, input: { orgId: string; name: string; value?: string | number | null; expectedClose?: string | null; stage?: string },
  viewer: Viewer,
): Promise<Result<{ id: string }>> {
  const access = await orgAccess(tenantId, input.orgId, viewer);
  if (!access.ok) return access;
  const name = input.name.trim().slice(0, 160);
  if (name.length < 2) return { ok: false, error: "ตั้งชื่อดีล เช่น \"สปอนเซอร์ Gold งาน 2027\"" };
  const stage = input.stage && isDealStage(input.stage) && OPEN_STAGES.includes(input.stage) ? input.stage : "open";
  const value = input.value === "" || input.value == null ? null : Number(String(input.value).replace(/[,฿\s]/g, ""));
  if (value != null && (!Number.isFinite(value) || value < 0 || value > 1e12)) return { ok: false, error: "มูลค่าต้องเป็นตัวเลขบาท" };
  const close = input.expectedClose && /^\d{4}-\d{2}-\d{2}$/.test(input.expectedClose) ? input.expectedClose : null;
  const id = randomUUID(), at = new Date().toISOString();
  await tx(async (q) => {
    await q.run(
      `INSERT INTO opportunities (id, tenant_id, org_id, name, offer, stage, owner_id, value, expected_close, created_at, updated_at, campaign_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, id, tenantId, input.orgId, name, null, stage, viewer.id, value, close, at, at, null);
    await q.run(
      "INSERT INTO record_versions (tenant_id, record_kind, record_id, field, old_value, new_value, reason, changed_by, valid_from, recorded_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
      tenantId, "opportunity", id, "stage", null, stage, "สร้างดีล", viewer.id, null, at);
  });
  await logActivity(tenantId, viewer.id, "deal_create", `${id} · ${input.orgId}`);
  return { ok: true, id };
}

/** ย้ายขั้น (ลากในไปป์ไลน์ หรือกดใน Path) — เขียนรุ่นในธุรกรรมเดียว · ขั้นเดิมซ้ำ = ไม่ทำอะไร */
export async function moveDeal(tenantId: string, id: string, stage: string, viewer: Viewer): Promise<Result<{ from: string }>> {
  if (!isDealStage(stage)) return { ok: false, error: "ขั้นไม่ถูกต้อง" };
  const d = await get<{ stage: string; org_id: string }>("SELECT stage, org_id FROM opportunities WHERE tenant_id = ? AND id = ?", tenantId, id);
  if (!d) return { ok: false, error: "ไม่พบดีลนี้" };
  const access = await orgAccess(tenantId, d.org_id, viewer);
  if (!access.ok) return access;
  if (d.stage === stage) return { ok: true, from: d.stage };
  const at = new Date().toISOString();
  await tx(async (q) => {
    await q.run(
      "INSERT INTO record_versions (tenant_id, record_kind, record_id, field, old_value, new_value, reason, changed_by, valid_from, recorded_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
      tenantId, "opportunity", id, "stage", d.stage, stage, "ย้ายขั้น", viewer.id, null, at);
    await q.run("UPDATE opportunities SET stage = ?, updated_at = ? WHERE tenant_id = ? AND id = ?", stage, at, tenantId, id);
  });
  await logActivity(tenantId, viewer.id, "deal_stage", `${id} · ${d.stage} → ${stage}`);
  return { ok: true, from: d.stage };
}

/** แก้มูลค่า/วันปิดคาด/ชื่อ — ทีละช่อง พร้อมรุ่น */
export async function updateDeal(
  tenantId: string, id: string, field: "value" | "expected_close" | "name", raw: string, viewer: Viewer,
): Promise<Result> {
  const d = await get<{ org_id: string; value: number | string | null; expected_close: string | null; name: string }>(
    "SELECT org_id, value, expected_close, name FROM opportunities WHERE tenant_id = ? AND id = ?", tenantId, id);
  if (!d) return { ok: false, error: "ไม่พบดีลนี้" };
  const access = await orgAccess(tenantId, d.org_id, viewer);
  if (!access.ok) return access;
  let next: string | number | null;
  if (field === "value") {
    next = raw.trim() === "" ? null : Number(raw.replace(/[,฿\s]/g, ""));
    if (next != null && (!Number.isFinite(next) || next < 0 || next > 1e12)) return { ok: false, error: "มูลค่าต้องเป็นตัวเลขบาท" };
  } else if (field === "expected_close") {
    next = raw.trim() === "" ? null : raw;
    if (next && !/^\d{4}-\d{2}-\d{2}$/.test(next)) return { ok: false, error: "เลือกวันที่" };
  } else {
    next = raw.trim().slice(0, 160);
    if (next.length < 2) return { ok: false, error: "ชื่อดีลสั้นเกินไป" };
  }
  const old = field === "value" ? d.value : field === "expected_close" ? d.expected_close : d.name;
  const at = new Date().toISOString();
  await tx(async (q) => {
    await q.run(
      "INSERT INTO record_versions (tenant_id, record_kind, record_id, field, old_value, new_value, reason, changed_by, valid_from, recorded_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
      tenantId, "opportunity", id, field, old == null ? null : String(old), next == null ? null : String(next), "แก้ค่า", viewer.id, null, at);
    await q.run(`UPDATE opportunities SET ${field} = ?, updated_at = ? WHERE tenant_id = ? AND id = ?`, next, at, tenantId, id);
  });
  return { ok: true };
}


/* ── คนในดีลพร้อมบทบาท (docs/crm-plan.md C1) ─────────────────────────────

   เลือกได้เฉพาะคนที่เคยหรือยังสังกัดบริษัทของดีล (ดีลขายให้บริษัท ไม่ใช่ให้คนลอย ๆ) และผู้อ่านเห็นได้ตามระดับความลับ
   ทุกการเพิ่ม/เปลี่ยนบทบาท/เอาออก เขียนรุ่นใน record_versions ของดีล (field = person) */

export async function dealCandidates(tenantId: string, dealId: string, viewer: Viewer): Promise<{ id: string; name: string; title: string | null; current: boolean }[]> {
  const d = await get<{ org_id: string }>("SELECT org_id FROM opportunities WHERE tenant_id = ? AND id = ?", tenantId, dealId);
  if (!d) return [];
  const rows = await all<{ id: string; name: string; title: string | null; valid_to: string | null; classification: string | null }>(
    `SELECT c.id, c.name, a.title, a.valid_to, c.classification FROM affiliations a
     JOIN customers c ON c.id = a.customer_id AND c.tenant_id = a.tenant_id
     WHERE a.tenant_id = ? AND a.org_id = ? AND c.lifecycle_state <> 'pending_review'
     ORDER BY a.valid_to IS NULL DESC, c.name`, tenantId, d.org_id);
  const seen = new Set<string>();
  return rows
    .filter((r) => canSee(viewer.clearance, lv(r.classification)) && !seen.has(r.id) && seen.add(r.id))
    .map((r) => ({ id: r.id, name: r.name, title: r.title, current: r.valid_to == null }));
}

export async function setDealPerson(tenantId: string, dealId: string, personId: string, role: string, viewer: Viewer): Promise<Result> {
  if (!isDealRole(role)) return { ok: false, error: "เลือกบทบาท" };
  const d = await get<{ org_id: string }>("SELECT org_id FROM opportunities WHERE tenant_id = ? AND id = ?", tenantId, dealId);
  if (!d) return { ok: false, error: "ไม่พบดีลนี้" };
  const access = await orgAccess(tenantId, d.org_id, viewer);
  if (!access.ok) return access;
  if (!(await dealCandidates(tenantId, dealId, viewer)).some((c) => c.id === personId)) {
    return { ok: false, error: "เลือกได้เฉพาะคนในบริษัทของดีลนี้" };
  }
  const prev = await get<{ role: string | null }>("SELECT role FROM opportunity_people WHERE tenant_id = ? AND opportunity_id = ? AND customer_id = ?", tenantId, dealId, personId);
  if (prev && prev.role === role) return { ok: true };
  const at = new Date().toISOString();
  await tx(async (q) => {
    await q.run(
      `INSERT INTO opportunity_people (tenant_id, opportunity_id, customer_id, role) VALUES (?,?,?,?)
       ON CONFLICT(opportunity_id, customer_id) DO UPDATE SET role = excluded.role`, tenantId, dealId, personId, role);
    await q.run(
      "INSERT INTO record_versions (tenant_id, record_kind, record_id, field, old_value, new_value, reason, changed_by, valid_from, recorded_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
      tenantId, "opportunity", dealId, "person", prev ? `${personId}:${prev.role ?? ""}` : null, `${personId}:${role}`, prev ? "เปลี่ยนบทบาท" : "เพิ่มคนในดีล", viewer.id, null, at);
    await q.run("UPDATE opportunities SET updated_at = ? WHERE tenant_id = ? AND id = ?", at, tenantId, dealId);
  });
  await logActivity(tenantId, viewer.id, "deal_person", `${dealId} · ${personId} · ${role}`);
  return { ok: true };
}

export async function removeDealPerson(tenantId: string, dealId: string, personId: string, viewer: Viewer): Promise<Result> {
  const d = await get<{ org_id: string }>("SELECT org_id FROM opportunities WHERE tenant_id = ? AND id = ?", tenantId, dealId);
  if (!d) return { ok: false, error: "ไม่พบดีลนี้" };
  const access = await orgAccess(tenantId, d.org_id, viewer);
  if (!access.ok) return access;
  const prev = await get<{ role: string | null }>("SELECT role FROM opportunity_people WHERE tenant_id = ? AND opportunity_id = ? AND customer_id = ?", tenantId, dealId, personId);
  if (!prev) return { ok: false, error: "คนนี้ไม่ได้อยู่ในดีล" };
  const at = new Date().toISOString();
  await tx(async (q) => {
    await q.run("DELETE FROM opportunity_people WHERE tenant_id = ? AND opportunity_id = ? AND customer_id = ?", tenantId, dealId, personId);
    await q.run(
      "INSERT INTO record_versions (tenant_id, record_kind, record_id, field, old_value, new_value, reason, changed_by, valid_from, recorded_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
      tenantId, "opportunity", dealId, "person", `${personId}:${prev.role ?? ""}`, null, "เอาออกจากดีล", viewer.id, null, at);
  });
  return { ok: true };
}

/** ดีลที่คนนี้อยู่ (หน้าผู้ติดต่อ) — ดีลของบริษัทที่เกินสิทธิ์ไม่ขึ้น */
export async function dealsOfPerson(tenantId: string, personIds: string[], viewer: Viewer): Promise<{ id: string; name: string; stage: string; role: string | null; org: string; value: number | null }[]> {
  if (!personIds.length) return [];
  const rows = await all<{ id: string; name: string; stage: string; role: string | null; org: string; value: number | string | null; classification: string | null; acc_owner: string | null; data_owner: string | null }>(
    `SELECT p.id, p.name, p.stage, op.role, o.name AS org, p.value, o.classification, o.account_owner_id AS acc_owner, o.data_owner_id AS data_owner
     FROM opportunity_people op JOIN opportunities p ON p.id = op.opportunity_id AND p.tenant_id = op.tenant_id
     JOIN orgs o ON o.id = p.org_id AND o.tenant_id = p.tenant_id
     WHERE op.tenant_id = ? AND op.customer_id IN (${personIds.map(() => "?").join(",")}) ORDER BY p.updated_at DESC`, tenantId, ...personIds);
  return rows
    .filter((r) => canSee(viewer.clearance, lv(r.classification)) || [r.acc_owner, r.data_owner].includes(viewer.id))
    .map((r) => ({ id: r.id, name: r.name, stage: r.stage, role: r.role, org: r.org, value: r.value == null ? null : Number(r.value) }));
}
