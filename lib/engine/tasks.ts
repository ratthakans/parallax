import { randomUUID } from "node:crypto";
import { all, get, run } from "@/lib/engine/sql";
import { logActivity } from "@/lib/engine/db";
import { dealPartyAccess, orgAccess, MASKED_PERSON, type Viewer } from "@/lib/engine/accounts";
import { canSee } from "@/lib/shared/accounts";
import { bangkokDay } from "@/lib/shared/format";
import type { Classification } from "@/lib/shared/vault";

/* ── งาน (docs/ux-plan.md U5) ─────────────────────────────────────────────

   รายการงานทั้งหมดในที่เดียว: งานติดต่อจากแคมเปญ · งานถัดไปจากโน้ต (S6) · งานจากหน้าแฟ้ม
   งานของแคมเปญปิดด้วยการ "บันทึกผล" ที่หน้าแคมเปญเท่านั้น (ตรวจนโยบายซ้ำ) — ที่นี่ปิดได้เฉพาะงานทั่วไป
   งานของบริษัทที่เกินสิทธิ์ไม่ขึ้น (ไม่เผยชื่อบริษัท) · ชื่อคนที่เกินสิทธิ์ถูกปิดบัง */

export const TASK_VIEWS = ["mine", "today", "overdue", "open", "done"] as const;
export type TaskView = (typeof TASK_VIEWS)[number];

export type TaskRow = {
  id: string; title: string; status: string; due: string | null; owner: string | null;
  orgId: string | null; org: string | null; personId: string | null; person: string | null;
  campaignId: string | null; targetId: string | null; doneAt: string | null; outcome: string | null;
  dealId: string | null; deal: string | null; priority: TaskPriority;
};
export const TASK_PRIORITIES = ["high", "normal", "low"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export const PRIORITY_TH: Record<TaskPriority, string> = { high: "ด่วน", normal: "ปกติ", low: "ไม่รีบ" };
const asPriority = (p: string | null | undefined): TaskPriority => ((TASK_PRIORITIES as readonly string[]).includes(p ?? "") ? (p as TaskPriority) : "normal");

const lv = (c: string | null) => (c ?? "confidential") as Classification;

export async function listTasks(
  tenantId: string, view: TaskView, viewer: Viewer, now = new Date(), scope?: { orgId?: string; dealId?: string; personId?: string },
): Promise<TaskRow[]> {
  const where = ["t.tenant_id = ?"];
  const params: string[] = [tenantId];
  /* งานของระเบียนหนึ่ง (หน้าบริษัท · ดีล · ผู้ติดต่อ) */
  if (scope?.orgId) { where.push("t.org_id = ?"); params.push(scope.orgId); }
  if (scope?.dealId) { where.push("t.opportunity_id = ?"); params.push(scope.dealId); }
  if (scope?.personId) { where.push("t.customer_id = ?"); params.push(scope.personId); }
  const today = bangkokDay(now);
  if (view === "done") where.push("t.status = 'done'");
  else {
    where.push("t.status = 'open'");
    if (view === "mine") { where.push("t.owner_id = ?"); params.push(viewer.id); }
    if (view === "today") { where.push("substr(t.due_at, 1, 10) = ?"); params.push(today); }
    if (view === "overdue") { where.push("t.due_at IS NOT NULL AND substr(t.due_at, 1, 10) < ?"); params.push(today); }
  }
  /* ด่วนขึ้นก่อนภายในวันเดียวกัน — ไม่ข้ามวัน (งานเลยกำหนดยังมาก่อนงานด่วนของสัปดาห์หน้า) */
  const order = view === "done" ? "t.done_at DESC"
    : "COALESCE(substr(t.due_at, 1, 10), '9999') ASC, CASE t.priority WHEN 'high' THEN 0 WHEN 'low' THEN 2 ELSE 1 END, t.created_at ASC";
  const rows = await all<{ id: string; title: string; status: string; due_at: string | null; owner_id: string | null; org_id: string | null; org: string | null;
    org_class: string | null; acc_owner: string | null; customer_id: string | null; person: string | null; person_class: string | null;
    campaign_id: string | null; target_id: string | null; done_at: string | null; outcome: string | null; opportunity_id: string | null; deal: string | null; priority: string | null }>(
    `SELECT t.id, t.title, t.status, t.due_at, t.owner_id, t.org_id, o.name AS org, o.classification AS org_class, o.account_owner_id AS acc_owner,
       t.customer_id, c.name AS person, c.classification AS person_class, t.campaign_id, t.target_id, t.done_at, t.outcome,
       t.opportunity_id, p.name AS deal, t.priority
     FROM tasks t
     LEFT JOIN orgs o ON o.id = t.org_id AND o.tenant_id = t.tenant_id
     LEFT JOIN customers c ON c.id = t.customer_id AND c.tenant_id = t.tenant_id
     LEFT JOIN opportunities p ON p.id = t.opportunity_id AND p.tenant_id = t.tenant_id
     WHERE ${where.join(" AND ")} ORDER BY ${order}, t.id LIMIT 300`, ...params);
  return rows
    .filter((r) => !r.org_id || canSee(viewer.clearance, lv(r.org_class)) || r.acc_owner === viewer.id || r.owner_id === viewer.id)
    .map((r) => ({
      id: r.id, title: r.title, status: r.status, due: r.due_at, owner: r.owner_id, orgId: r.org_id, org: r.org,
      personId: r.customer_id, person: r.customer_id ? (canSee(viewer.clearance, lv(r.person_class)) ? r.person : MASKED_PERSON) : null,
      campaignId: r.campaign_id, targetId: r.target_id, doneAt: r.done_at, outcome: r.outcome,
      dealId: r.opportunity_id, deal: r.deal, priority: asPriority(r.priority),
    }));
}

/* ── สร้างและแก้งาน (docs/crm-plan.md E1) ───────────────────────────────

   งานผูกกับบริษัท · คน · ดีล ได้พร้อมกัน — ดีลบอกบริษัทเอง · คนต้องสังกัด (หรือเคยสังกัด) บริษัทนั้น
   ผู้รับงานเป็นใครก็ได้ในทีม (ค่าเริ่มต้น = ผู้สร้าง) · ตรวจสิทธิ์บริษัทแบบเดียวกับการแก้แฟ้ม */

export type TaskInput = { title: string; due?: string; owner?: string; orgId?: string; personId?: string; dealId?: string; priority?: string };

export async function createTask(tenantId: string, input: TaskInput, viewer: Viewer): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const title = input.title.trim().slice(0, 200);
  if (title.length < 2) return { ok: false, error: "บอกว่าต้องทำอะไร เช่น \"ส่งใบเสนอราคา Gold\"" };
  const due = input.due?.trim() || null;
  if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) return { ok: false, error: "เลือกวันครบกำหนด" };
  let org = input.orgId?.trim() || null;
  const deal = input.dealId?.trim() || null;
  let person = input.personId?.trim() || null;
  if (deal) {
    const d = await get<{ org_id: string | null; customer_id: string | null }>("SELECT org_id, customer_id FROM opportunities WHERE tenant_id = ? AND id = ?", tenantId, deal);
    if (!d) return { ok: false, error: "ไม่พบดีลนี้" };
    if (org && org !== d.org_id) return { ok: false, error: "ดีลนี้ไม่ใช่ของบริษัทที่เลือก" };
    /* ดีลลูกค้าบุคคล (F3): งานผูกกับลูกค้าคนนั้น · ด่านเดียวกับดีล */
    if (!d.org_id) {
      if (person && person !== d.customer_id) return { ok: false, error: "ดีลนี้เป็นของลูกค้าคนอื่น" };
      const access = await dealPartyAccess(tenantId, d, viewer);
      if (!access.ok) return access;
      person = d.customer_id;
    }
    org = d.org_id;
  }
  if (person) {
    if (!(await get("SELECT 1 AS x FROM customers WHERE tenant_id = ? AND id = ?", tenantId, person))) return { ok: false, error: "ไม่พบผู้ติดต่อนี้" };
    if (org && !(await get("SELECT 1 AS x FROM affiliations WHERE tenant_id = ? AND org_id = ? AND customer_id = ?", tenantId, org, person))) {
      return { ok: false, error: "ผู้ติดต่อนี้ไม่ได้สังกัดบริษัทของงาน" };
    }
    if (!org) {
      /* คนเดียว ไม่ระบุบริษัท → ใช้บริษัทปัจจุบันของเขา (ถ้ามีที่เดียว) เพื่อให้งานขึ้นที่หน้าบริษัทด้วย */
      const cur = await all<{ org_id: string }>("SELECT org_id FROM affiliations WHERE tenant_id = ? AND customer_id = ? AND valid_to IS NULL", tenantId, person);
      if (cur.length === 1) org = cur[0].org_id;
    }
  }
  if (org) {
    const access = await orgAccess(tenantId, org, viewer);
    if (!access.ok) return access;
  }
  const owner = input.owner?.trim().slice(0, 120) || viewer.id;
  const id = randomUUID();
  await run(
    `INSERT INTO tasks (id, tenant_id, title, status, due_at, owner_id, org_id, customer_id, opportunity_id, outcome, created_by, created_at, done_at, priority)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, tenantId, title, "open", due, owner, org, person, deal, null, viewer.id, new Date().toISOString(), null, asPriority(input.priority));
  await logActivity(tenantId, viewer.id, "task_create", `${id}${owner !== viewer.id ? ` → ${owner}` : ""}`);
  return { ok: true, id };
}

/** เลื่อนวัน · เปลี่ยนผู้รับ — งานแคมเปญเปลี่ยนที่หน้าแคมเปญ (มอบหมายใหม่ตรวจนโยบายซ้ำ) */
export async function updateTask(tenantId: string, id: string, input: { due?: string; owner?: string; title?: string; priority?: string }, viewer: Viewer): Promise<{ ok: true } | { ok: false; error: string }> {
  const t = await get<{ status: string; org_id: string | null; target_id: string | null }>("SELECT status, org_id, target_id FROM tasks WHERE tenant_id = ? AND id = ?", tenantId, id);
  if (!t) return { ok: false, error: "ไม่พบงานนี้" };
  if (t.status !== "open") return { ok: false, error: "งานนี้ปิดไปแล้ว" };
  if (t.target_id) return { ok: false, error: "งานของแคมเปญ — มอบหมายใหม่ที่หน้าแคมเปญ" };
  if (t.org_id) {
    const access = await orgAccess(tenantId, t.org_id, viewer);
    if (!access.ok) return access;
  }
  const sets: string[] = [], params: string[] = [];
  if (input.due !== undefined) {
    const due = input.due.trim();
    if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) return { ok: false, error: "เลือกวันครบกำหนด" };
    sets.push("due_at = ?"); params.push(due || (null as unknown as string));
  }
  if (input.owner !== undefined) {
    const o = input.owner.trim().slice(0, 120);
    if (!o) return { ok: false, error: "เลือกผู้รับงาน" };
    sets.push("owner_id = ?"); params.push(o);
  }
  if (input.title !== undefined) {
    const ti = input.title.trim().slice(0, 200);
    if (ti.length < 2) return { ok: false, error: "ชื่องานสั้นเกินไป" };
    sets.push("title = ?"); params.push(ti);
  }
  if (input.priority !== undefined) { sets.push("priority = ?"); params.push(asPriority(input.priority)); }
  if (!sets.length) return { ok: true };
  await run(`UPDATE tasks SET ${sets.join(", ")} WHERE tenant_id = ? AND id = ? AND status = 'open'`, ...params, tenantId, id);
  await logActivity(tenantId, viewer.id, "task_update", id);
  return { ok: true };
}

/** ปิดงานทั่วไป — งานของแคมเปญต้องบันทึกผลที่หน้าแคมเปญ (มีการตรวจนโยบายซ้ำ) */
export async function completeTask(tenantId: string, id: string, outcome: string, viewer: Viewer): Promise<{ ok: true } | { ok: false; error: string }> {
  const t = await get<{ status: string; org_id: string | null; target_id: string | null }>("SELECT status, org_id, target_id FROM tasks WHERE tenant_id = ? AND id = ?", tenantId, id);
  if (!t) return { ok: false, error: "ไม่พบงานนี้" };
  if (t.status !== "open") return { ok: false, error: "งานนี้ปิดไปแล้ว" };
  if (t.target_id) return { ok: false, error: "งานของแคมเปญ — บันทึกผลที่หน้าแคมเปญ (ระบบตรวจนโยบายซ้ำตอนบันทึก)" };
  if (t.org_id) {
    const access = await orgAccess(tenantId, t.org_id, viewer);
    if (!access.ok) return access;
  }
  const res = await run("UPDATE tasks SET status = 'done', outcome = ?, done_at = ? WHERE tenant_id = ? AND id = ? AND status = 'open'",
    outcome.trim().slice(0, 300) || "เสร็จแล้ว", new Date().toISOString(), tenantId, id);
  if (!res.changes) return { ok: false, error: "งานนี้ปิดไปแล้ว" };
  await logActivity(tenantId, viewer.id, "task_done", id);
  return { ok: true };
}
