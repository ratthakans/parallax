import { randomUUID } from "node:crypto";
import { all, get, run } from "@/lib/engine/sql";
import { logActivity } from "@/lib/engine/db";
import { membershipEnforced } from "@/lib/engine/access";
import { CUSTOMER_FILTERS, CUSTOMER_SORTS, exportCustomersCsv, type CustomerFilter, type CustomerSort } from "@/lib/engine/customers";

/* ── ส่งออกแบบขออนุมัติ (docs/plan.md B6 · docs/solo-plan.md หัวข้อ 6.1) ─────────

   ไฟล์ส่งออกมีเบอร์และอีเมลแบบอ่านได้ — ออกไปแล้วตามคืนไม่ได้ จึงไม่ใช่ปุ่มกดแล้วได้ไฟล์ทันที
   ขอ (พร้อมเหตุผล) → อนุมัติ → ผู้ขอดาวน์โหลดได้ครั้งเดียว ภายใน 24 ชั่วโมงนับจากพร้อม
   - มีเจ้าของบัญชีคนอื่น: ต้องให้คนอื่นอนุมัติ · อนุมัติแล้วพร้อมทันที
   - เจ้าของคนเดียว (โหมดคนเดียว): อนุมัติตัวเองได้ แต่พร้อมหลังรอ 1 ชั่วโมง — เวลาทำหน้าที่แทนคนที่สอง
     (กันกดผิด และกันบัญชีที่ถูกยึดดึงข้อมูลออกทันที) · ยกเลิกได้ระหว่างรอ
   - ทุกขั้นอยู่ใน audit · ไม่บันทึกค่าใดในไฟล์ */

export const SELF_APPROVAL_WAIT_MS = 60 * 60 * 1000;
export const DOWNLOAD_WINDOW_MS = 24 * 60 * 60 * 1000;

export type ExportScope = { q?: string; filter: CustomerFilter; sort: CustomerSort };
export type ExportStatus = "pending" | "approved" | "downloaded" | "cancelled";
export type ExportRequest = {
  id: string; scope: ExportScope; reason: string; status: ExportStatus;
  requestedBy: string; requestedAt: string; approvedBy: string | null; approvedAt: string | null;
  readyAt: string | null; expiresAt: string | null; downloadedAt: string | null; rowCount: number | null;
  cancelledBy: string | null; cancelledAt: string | null;
  /** สถานะ ณ ตอนอ่าน: รออนุมัติ · รอช่วงรอ · ดาวน์โหลดได้ · หมดเวลา · จบแล้ว */
  stage: "awaiting_approval" | "waiting" | "ready" | "expired" | "done" | "cancelled";
};

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
type Row = {
  id: string; scope: string; reason: string; status: ExportStatus; requested_by: string; requested_at: string;
  approved_by: string | null; approved_at: string | null; ready_at: string | null; expires_at: string | null;
  downloaded_at: string | null; row_count: number | string | null; cancelled_by: string | null; cancelled_at: string | null;
};

function toRequest(r: Row, now: Date): ExportRequest {
  const t = now.toISOString();
  const stage: ExportRequest["stage"] =
    r.status === "cancelled" ? "cancelled" : r.status === "downloaded" ? "done" : r.status === "pending" ? "awaiting_approval"
      : r.ready_at && t < r.ready_at ? "waiting" : r.expires_at && t >= r.expires_at ? "expired" : "ready";
  return {
    id: r.id, scope: JSON.parse(r.scope), reason: r.reason, status: r.status, requestedBy: r.requested_by, requestedAt: r.requested_at,
    approvedBy: r.approved_by, approvedAt: r.approved_at, readyAt: r.ready_at, expiresAt: r.expires_at, downloadedAt: r.downloaded_at,
    rowCount: r.row_count == null ? null : Number(r.row_count), cancelledBy: r.cancelled_by, cancelledAt: r.cancelled_at, stage,
  };
}

/** จำนวนเจ้าของบัญชี — โหมดเดโม (ไม่มีการล็อกอิน) นับเป็นเจ้าของคนเดียว */
async function ownerCount(tenantId: string): Promise<number> {
  if (!membershipEnforced()) return 1;
  return Number((await get<{ n: number | string }>("SELECT COUNT(*) AS n FROM tenant_users WHERE tenant_id = ? AND role = 'owner'", tenantId))?.n ?? 0);
}

export function scopeFrom(input: { q?: string | null; filter?: string | null; sort?: string | null }): ExportScope {
  const filter = CUSTOMER_FILTERS.find((f) => f === input.filter) ?? "all";
  const sort = CUSTOMER_SORTS.find((s) => s === input.sort) ?? "last";
  const q = input.q?.trim().slice(0, 120);
  return q ? { q, filter, sort } : { filter, sort };
}

export async function listExports(tenantId: string, now = new Date()): Promise<ExportRequest[]> {
  const rows = await all<Row>("SELECT * FROM export_requests WHERE tenant_id = ? ORDER BY requested_at DESC LIMIT 50", tenantId);
  return rows.map((r) => toRequest(r, now));
}

async function load(tenantId: string, id: string, now: Date) {
  const r = await get<Row>("SELECT * FROM export_requests WHERE tenant_id = ? AND id = ?", tenantId, id);
  return r ? toRequest(r, now) : null;
}

export async function requestExport(tenantId: string, scope: ExportScope, reason: string, actor: string, now = new Date()): Promise<Result<{ id: string }>> {
  const why = reason.trim().slice(0, 300);
  if (why.length < 10) return { ok: false, error: "บอกเหตุผลที่ต้องใช้ไฟล์นี้ (เช่น ส่งรายชื่อให้ทีมงานหน้างาน 20 ต.ค.)" };
  const id = randomUUID();
  await run("INSERT INTO export_requests (id, tenant_id, scope, reason, status, requested_by, requested_at) VALUES (?,?,?,?,'pending',?,?)",
    id, tenantId, JSON.stringify(scope), why, actor, now.toISOString());
  // บันทึกตัวกรอง ไม่บันทึกคำค้น — คำค้นอาจเป็นชื่อหรือเบอร์
  await logActivity(tenantId, actor, "export_request", `${id} · ${scope.filter}${scope.q ? " · มีคำค้น" : ""}`);
  return { ok: true, id };
}

export async function approveExport(tenantId: string, id: string, actor: string, now = new Date()): Promise<Result<{ readyAt: string; self: boolean }>> {
  const r = await load(tenantId, id, now);
  if (!r) return { ok: false, error: "ไม่พบคำขอนี้" };
  if (r.status !== "pending") return { ok: false, error: "คำขอนี้ไม่ได้รออนุมัติแล้ว" };
  const self = r.requestedBy === actor;
  if (self && (await ownerCount(tenantId)) > 1) return { ok: false, error: "ให้เจ้าของบัญชีอีกคนอนุมัติ — อนุมัติคำขอของตัวเองได้เฉพาะบัญชีที่มีเจ้าของคนเดียว" };
  const ready = new Date(+now + (self ? SELF_APPROVAL_WAIT_MS : 0));
  const res = await run(
    "UPDATE export_requests SET status = 'approved', approved_by = ?, approved_at = ?, ready_at = ?, expires_at = ? WHERE tenant_id = ? AND id = ? AND status = 'pending'",
    actor, now.toISOString(), ready.toISOString(), new Date(+ready + DOWNLOAD_WINDOW_MS).toISOString(), tenantId, id);
  if (!res.changes) return { ok: false, error: "คำขอนี้ไม่ได้รออนุมัติแล้ว" };
  await logActivity(tenantId, actor, self ? "export_self_approve" : "export_approve", id);
  return { ok: true, readyAt: ready.toISOString(), self };
}

export async function cancelExport(tenantId: string, id: string, actor: string, now = new Date()): Promise<Result> {
  const r = await load(tenantId, id, now);
  if (!r) return { ok: false, error: "ไม่พบคำขอนี้" };
  if (r.status !== "pending" && r.status !== "approved") return { ok: false, error: "คำขอนี้จบไปแล้ว" };
  await run("UPDATE export_requests SET status = 'cancelled', cancelled_by = ?, cancelled_at = ? WHERE tenant_id = ? AND id = ? AND status IN ('pending', 'approved')",
    actor, now.toISOString(), tenantId, id);
  await logActivity(tenantId, actor, "export_cancel", id);
  return { ok: true };
}

/** ดาวน์โหลด: ผู้ขอเท่านั้น · ครั้งเดียว · ระหว่างพร้อมถึงหมดเวลา — จองสถานะก่อนสร้างไฟล์ กันกดสองครั้งพร้อมกันได้สองไฟล์ */
export async function downloadExport(tenantId: string, id: string, actor: string, now = new Date()): Promise<Result<{ csv: string; rows: number }>> {
  const r = await load(tenantId, id, now);
  if (!r) return { ok: false, error: "ไม่พบคำขอนี้" };
  if (r.requestedBy !== actor) return { ok: false, error: "ผู้ขอเท่านั้นที่ดาวน์โหลดไฟล์นี้ได้" };
  if (r.stage === "awaiting_approval") return { ok: false, error: "คำขอนี้ยังไม่ได้รับอนุมัติ" };
  if (r.stage === "waiting") return { ok: false, error: `อนุมัติตัวเองแล้ว — ดาวน์โหลดได้ตั้งแต่ ${r.readyAt}` };
  if (r.stage === "expired") return { ok: false, error: "เลยเวลาดาวน์โหลดแล้ว — ขอใหม่" };
  if (r.stage !== "ready") return { ok: false, error: "คำขอนี้ใช้ไปแล้วหรือถูกยกเลิก" };
  const claim = await run("UPDATE export_requests SET status = 'downloaded', downloaded_at = ? WHERE tenant_id = ? AND id = ? AND status = 'approved'",
    now.toISOString(), tenantId, id);
  if (!claim.changes) return { ok: false, error: "คำขอนี้ใช้ไปแล้ว" };
  const out = await exportCustomersCsv(tenantId, r.scope, actor);
  await run("UPDATE export_requests SET row_count = ? WHERE tenant_id = ? AND id = ?", out.rows, tenantId, id);
  return { ok: true, csv: out.csv, rows: out.rows };
}
