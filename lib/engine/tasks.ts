import { all, get, run } from "@/lib/engine/sql";
import { logActivity } from "@/lib/engine/db";
import { orgAccess, MASKED_PERSON, type Viewer } from "@/lib/engine/accounts";
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
};

const lv = (c: string | null) => (c ?? "confidential") as Classification;

export async function listTasks(tenantId: string, view: TaskView, viewer: Viewer, now = new Date()): Promise<TaskRow[]> {
  const where = ["t.tenant_id = ?"];
  const params: string[] = [tenantId];
  const today = bangkokDay(now);
  if (view === "done") where.push("t.status = 'done'");
  else {
    where.push("t.status = 'open'");
    if (view === "mine") { where.push("t.owner_id = ?"); params.push(viewer.id); }
    if (view === "today") { where.push("substr(t.due_at, 1, 10) = ?"); params.push(today); }
    if (view === "overdue") { where.push("t.due_at IS NOT NULL AND substr(t.due_at, 1, 10) < ?"); params.push(today); }
  }
  const order = view === "done" ? "t.done_at DESC" : "COALESCE(t.due_at, '9999') ASC, t.created_at ASC";
  const rows = await all<{ id: string; title: string; status: string; due_at: string | null; owner_id: string | null; org_id: string | null; org: string | null;
    org_class: string | null; acc_owner: string | null; customer_id: string | null; person: string | null; person_class: string | null;
    campaign_id: string | null; target_id: string | null; done_at: string | null; outcome: string | null }>(
    `SELECT t.id, t.title, t.status, t.due_at, t.owner_id, t.org_id, o.name AS org, o.classification AS org_class, o.account_owner_id AS acc_owner,
       t.customer_id, c.name AS person, c.classification AS person_class, t.campaign_id, t.target_id, t.done_at, t.outcome
     FROM tasks t
     LEFT JOIN orgs o ON o.id = t.org_id AND o.tenant_id = t.tenant_id
     LEFT JOIN customers c ON c.id = t.customer_id AND c.tenant_id = t.tenant_id
     WHERE ${where.join(" AND ")} ORDER BY ${order}, t.id LIMIT 300`, ...params);
  return rows
    .filter((r) => !r.org_id || canSee(viewer.clearance, lv(r.org_class)) || r.acc_owner === viewer.id || r.owner_id === viewer.id)
    .map((r) => ({
      id: r.id, title: r.title, status: r.status, due: r.due_at, owner: r.owner_id, orgId: r.org_id, org: r.org,
      personId: r.customer_id, person: r.customer_id ? (canSee(viewer.clearance, lv(r.person_class)) ? r.person : MASKED_PERSON) : null,
      campaignId: r.campaign_id, targetId: r.target_id, doneAt: r.done_at, outcome: r.outcome,
    }));
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
