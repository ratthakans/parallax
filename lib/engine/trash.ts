import { randomUUID } from "node:crypto";
import { all, get, run, tx, type Sql } from "@/lib/engine/sql";
import { logActivity } from "@/lib/engine/db";
import { dealPartyAccess, orgAccess, type Viewer } from "@/lib/engine/accounts";

/* ── ถังขยะ (docs/crm-plan.md D3) ─────────────────────────────────────────

   ลบ = ถ่ายภาพระเบียนและของที่ผูกอยู่เก็บใน trash แล้วลบออกจากตารางจริง — คำสั่งอ่านทั้งระบบจึงไม่ต้องกรองอะไร
   กู้คืน = ใส่ภาพกลับ (ภายใน 30 วัน) · เกิน 30 วัน = ลบภาพทิ้งถาวร
   ประวัติ (record_versions) ไม่ถูกลบ — ใครเปลี่ยนอะไรยังอ่านได้ แม้ระเบียนอยู่ในถังขยะ
     ดีล     ทุกดีลลบได้ (สิทธิ์ write + ด่านบริษัท) · งาน/กิจกรรม/ดีลต่อสัญญาที่ผูกอยู่ถูกตัดลิงก์ แล้วผูกคืนตอนกู้
     บริษัท  ลบได้เฉพาะแฟ้มว่าง (ไม่มีคน ดีล กิจกรรม งาน การร่วมงาน แคมเปญ) — บริษัทซ้ำให้รวม ไม่ใช่ลบ
   คนไม่เข้าถังขยะ: การลบคนเป็นเรื่องสิทธิ์ตาม PDPA ต้องลบจริงผ่านคำขอสิทธิ

   ⚠ ชื่อคอลัมน์ตอนกู้คืนมาจากรายการคงที่ด้านล่างเท่านั้น — แถวใน trash เขียนได้ผ่าน RLS ห้ามเชื่อคีย์ใน payload */

export const TRASH_DAYS = 30;
type Row = Record<string, string | number | null>;
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const COLS: Record<string, readonly string[]> = {
  opportunities: ["id", "tenant_id", "org_id", "customer_id", "name", "offer", "stage", "owner_id", "value", "expected_close", "created_at", "updated_at",
    "campaign_id", "forecast_category", "close_reason", "close_note", "renewed_from"],
  deal_items: ["id", "tenant_id", "opportunity_id", "package", "qty", "unit_price", "created_by", "created_at"],
  opportunity_people: ["tenant_id", "opportunity_id", "customer_id", "role"],
  custom_values: ["id", "tenant_id", "field_id", "entity", "record_id", "value", "recorded_by", "recorded_at"],
  orgs: ["id", "tenant_id", "name", "name_en", "name_norm", "tax_id", "branch_code", "legal_entity", "parent_id", "primary_domain", "industry",
    "classification", "data_owner_id", "source_id", "lifecycle_state", "state_owner_id", "state_due_at", "restriction_status", "retention_rule_id",
    "recorded_at", "last_verified_at", "created_at", "account_owner_id", "team_id"],
  org_domains: ["tenant_id", "org_id", "domain"],
};

async function insertRows(q: Sql, table: keyof typeof COLS, tenantId: string, rows: Row[]) {
  for (const r of rows) {
    const cols = COLS[table].filter((c) => c in r);
    if (!cols.includes("tenant_id")) continue;
    if (r.tenant_id !== tenantId) continue;
    await q.run(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(",")})`, ...cols.map((c) => r[c]));
  }
}

// ── ดีล ──
export async function trashDeal(tenantId: string, id: string, viewer: Viewer): Promise<Result<{ trashId: string }>> {
  const d = await get<Row>("SELECT * FROM opportunities WHERE tenant_id = ? AND id = ?", tenantId, id);
  if (!d) return { ok: false, error: "ไม่พบดีลนี้" };
  const access = await dealPartyAccess(tenantId, { org_id: (d.org_id as string | null) ?? null, customer_id: (d.customer_id as string | null) ?? null }, viewer);
  if (!access.ok) return access;
  const [items, people, values, tasks, inter, renewals] = await Promise.all([
    all<Row>("SELECT * FROM deal_items WHERE tenant_id = ? AND opportunity_id = ?", tenantId, id),
    all<Row>("SELECT * FROM opportunity_people WHERE tenant_id = ? AND opportunity_id = ?", tenantId, id),
    all<Row>("SELECT * FROM custom_values WHERE tenant_id = ? AND entity = 'deal' AND record_id = ?", tenantId, id),
    all<{ id: string }>("SELECT id FROM tasks WHERE tenant_id = ? AND opportunity_id = ?", tenantId, id),
    all<{ id: string }>("SELECT id FROM interactions WHERE tenant_id = ? AND opportunity_id = ?", tenantId, id),
    all<{ id: string }>("SELECT id FROM opportunities WHERE tenant_id = ? AND renewed_from = ?", tenantId, id),
  ]);
  const payload = { deal: d, items, people, values, links: { tasks: tasks.map((t) => t.id), interactions: inter.map((i) => i.id), renewals: renewals.map((r) => r.id) } };
  const trashId = `tr-${randomUUID()}`, at = new Date().toISOString();
  await tx(async (q) => {
    await q.run("INSERT INTO trash (id, tenant_id, kind, record_id, name, payload, deleted_by, deleted_at) VALUES (?,?,?,?,?,?,?,?)",
      trashId, tenantId, "deal", id, String(d.name), JSON.stringify(payload), viewer.id, at);
    await q.run("UPDATE tasks SET opportunity_id = NULL WHERE tenant_id = ? AND opportunity_id = ?", tenantId, id);
    await q.run("UPDATE interactions SET opportunity_id = NULL WHERE tenant_id = ? AND opportunity_id = ?", tenantId, id);
    await q.run("UPDATE opportunities SET renewed_from = NULL WHERE tenant_id = ? AND renewed_from = ?", tenantId, id);
    await q.run("DELETE FROM deal_items WHERE tenant_id = ? AND opportunity_id = ?", tenantId, id);
    await q.run("DELETE FROM opportunity_people WHERE tenant_id = ? AND opportunity_id = ?", tenantId, id);
    await q.run("DELETE FROM custom_values WHERE tenant_id = ? AND entity = 'deal' AND record_id = ?", tenantId, id);
    await q.run("DELETE FROM opportunities WHERE tenant_id = ? AND id = ?", tenantId, id);
  });
  await logActivity(tenantId, viewer.id, "deal_trash", id);
  return { ok: true, trashId };
}

// ── บริษัท (แฟ้มว่างเท่านั้น) ──
export async function orgIsEmpty(tenantId: string, orgId: string): Promise<string | null> {
  const checks: [string, string][] = [
    ["affiliations", "มีคนสังกัด (หรือเคยสังกัด)"], ["opportunities", "มีดีล"], ["interactions", "มีกิจกรรม"],
    ["tasks", "มีงาน"], ["participations", "มีข้อมูลการร่วมงาน"], ["campaign_targets", "อยู่ในแคมเปญ"],
  ];
  for (const [t, why] of checks) {
    if (await get(`SELECT 1 AS x FROM ${t} WHERE tenant_id = ? AND org_id = ? LIMIT 1`, tenantId, orgId)) {
      return `ลบได้เฉพาะแฟ้มว่าง — บริษัทนี้${why} · ถ้าเป็นบริษัทซ้ำ ให้รวมที่หน้าตรวจข้อมูลซ้ำ`;
    }
  }
  return null;
}

export async function trashOrg(tenantId: string, orgId: string, viewer: Viewer): Promise<Result<{ trashId: string }>> {
  const o = await get<Row>("SELECT * FROM orgs WHERE tenant_id = ? AND id = ?", tenantId, orgId);
  if (!o) return { ok: false, error: "ไม่พบบริษัทนี้" };
  const access = await orgAccess(tenantId, orgId, viewer);
  if (!access.ok) return access;
  const notEmpty = await orgIsEmpty(tenantId, orgId);
  if (notEmpty) return { ok: false, error: notEmpty };
  const [domains, values, children] = await Promise.all([
    all<Row>("SELECT * FROM org_domains WHERE tenant_id = ? AND org_id = ?", tenantId, orgId),
    all<Row>("SELECT * FROM custom_values WHERE tenant_id = ? AND entity = 'org' AND record_id = ?", tenantId, orgId),
    all<{ id: string }>("SELECT id FROM orgs WHERE tenant_id = ? AND parent_id = ?", tenantId, orgId),
  ]);
  const payload = { org: o, domains, values, links: { children: children.map((c) => c.id) } };
  const trashId = `tr-${randomUUID()}`, at = new Date().toISOString();
  await tx(async (q) => {
    await q.run("INSERT INTO trash (id, tenant_id, kind, record_id, name, payload, deleted_by, deleted_at) VALUES (?,?,?,?,?,?,?,?)",
      trashId, tenantId, "org", orgId, String(o.name), JSON.stringify(payload), viewer.id, at);
    await q.run("UPDATE orgs SET parent_id = NULL WHERE tenant_id = ? AND parent_id = ?", tenantId, orgId);
    await q.run("DELETE FROM org_domains WHERE tenant_id = ? AND org_id = ?", tenantId, orgId);
    await q.run("DELETE FROM custom_values WHERE tenant_id = ? AND entity = 'org' AND record_id = ?", tenantId, orgId);
    await q.run("DELETE FROM account_briefs WHERE tenant_id = ? AND org_id = ?", tenantId, orgId);
    await q.run("DELETE FROM orgs WHERE tenant_id = ? AND id = ?", tenantId, orgId);
  });
  await logActivity(tenantId, viewer.id, "org_trash", orgId);
  return { ok: true, trashId };
}

// ── รายการ · กู้คืน · ล้างที่เกินกำหนด ──
export type TrashItem = { id: string; kind: "deal" | "org"; recordId: string; name: string; by: string; at: string; daysLeft: number };

/** ล้างภาพที่เกิน 30 วัน (ถาวร) — เรียกตอนเปิดถังขยะ ไม่ต้องมีงานตั้งเวลา */
export async function purgeTrash(tenantId: string, now = new Date()): Promise<number> {
  const cutoff = new Date(+now - TRASH_DAYS * 864e5).toISOString();
  const r = await run("DELETE FROM trash WHERE tenant_id = ? AND restored_at IS NULL AND deleted_at < ?", tenantId, cutoff);
  return Number(r.changes ?? 0);
}

export async function listTrash(tenantId: string, now = new Date()): Promise<TrashItem[]> {
  await purgeTrash(tenantId, now);
  return (await all<{ id: string; kind: "deal" | "org"; record_id: string; name: string; deleted_by: string; deleted_at: string }>(
    "SELECT id, kind, record_id, name, deleted_by, deleted_at FROM trash WHERE tenant_id = ? AND restored_at IS NULL ORDER BY deleted_at DESC", tenantId,
  )).map((r) => ({
    id: r.id, kind: r.kind, recordId: r.record_id, name: r.name, by: r.deleted_by, at: r.deleted_at,
    daysLeft: Math.max(0, TRASH_DAYS - Math.floor((+now - Date.parse(r.deleted_at)) / 864e5)),
  }));
}

export async function restoreTrash(tenantId: string, trashId: string, viewer: Viewer, now = new Date()): Promise<Result<{ kind: "deal" | "org"; recordId: string }>> {
  const t = await get<{ kind: string; record_id: string; payload: string; deleted_at: string; restored_at: string | null }>(
    "SELECT kind, record_id, payload, deleted_at, restored_at FROM trash WHERE tenant_id = ? AND id = ?", tenantId, trashId);
  if (!t) return { ok: false, error: "ไม่พบรายการนี้ในถังขยะ" };
  if (t.restored_at) return { ok: false, error: "กู้คืนไปแล้ว" };
  if (+now - Date.parse(t.deleted_at) > TRASH_DAYS * 864e5) return { ok: false, error: `เกิน ${TRASH_DAYS} วันแล้ว — กู้คืนไม่ได้` };
  let p: Record<string, unknown>;
  try { p = JSON.parse(t.payload); } catch { return { ok: false, error: "ข้อมูลในถังขยะเสีย — กู้คืนไม่ได้" }; }
  const at = new Date().toISOString();
  if (t.kind === "deal") {
    const deal = p.deal as Row;
    if (!deal || deal.id !== t.record_id) return { ok: false, error: "ข้อมูลในถังขยะไม่ตรงกับรายการ" };
    const party = { org_id: (deal.org_id as string | null) ?? null, customer_id: (deal.customer_id as string | null) ?? null };
    if (party.org_id && !(await get("SELECT 1 AS x FROM orgs WHERE tenant_id = ? AND id = ?", tenantId, party.org_id))) {
      return { ok: false, error: "บริษัทของดีลนี้ไม่อยู่แล้ว — กู้บริษัทคืนก่อน" };
    }
    /* ดีลลูกค้าบุคคล (F3): คนถูกลบไปแล้ว (เช่น ตามคำขอสิทธิ) = กู้ไม่ได้ — ไม่ปลุกข้อมูลของคนที่ขอลบกลับมา */
    if (!party.org_id && !(await get("SELECT 1 AS x FROM customers WHERE tenant_id = ? AND id = ?", tenantId, String(party.customer_id)))) {
      return { ok: false, error: "ลูกค้าของดีลนี้ถูกลบแล้ว — กู้คืนไม่ได้" };
    }
    const access = await dealPartyAccess(tenantId, party, viewer);
    if (!access.ok) return access;
    if (await get("SELECT 1 AS x FROM opportunities WHERE tenant_id = ? AND id = ?", tenantId, t.record_id)) return { ok: false, error: "มีดีลนี้อยู่แล้ว" };
    const links = (p.links ?? {}) as { tasks?: string[]; interactions?: string[]; renewals?: string[] };
    await tx(async (q) => {
      await insertRows(q, "opportunities", tenantId, [deal]);
      await insertRows(q, "deal_items", tenantId, (p.items as Row[]) ?? []);
      /* คนที่ถูกลบตามคำขอสิทธิระหว่างอยู่ในถังขยะ — ไม่ผูกกลับ (ไม่คืนรหัสของคนที่ลบไปแล้ว) */
      const people: Row[] = [];
      for (const r of (p.people as Row[]) ?? []) if (await q.get("SELECT 1 AS x FROM customers WHERE tenant_id = ? AND id = ?", tenantId, String(r.customer_id))) people.push(r);
      await insertRows(q, "opportunity_people", tenantId, people);
      await insertRows(q, "custom_values", tenantId, ((p.values as Row[]) ?? []).filter((v) => v.entity === "deal" && v.record_id === t.record_id));
      for (const id of links.tasks ?? []) await q.run("UPDATE tasks SET opportunity_id = ? WHERE tenant_id = ? AND id = ? AND opportunity_id IS NULL", t.record_id, tenantId, String(id));
      for (const id of links.interactions ?? []) await q.run("UPDATE interactions SET opportunity_id = ? WHERE tenant_id = ? AND id = ? AND opportunity_id IS NULL", t.record_id, tenantId, String(id));
      for (const id of links.renewals ?? []) await q.run("UPDATE opportunities SET renewed_from = ? WHERE tenant_id = ? AND id = ? AND renewed_from IS NULL", t.record_id, tenantId, String(id));
      await q.run("UPDATE trash SET restored_at = ?, restored_by = ? WHERE tenant_id = ? AND id = ?", at, viewer.id, tenantId, trashId);
    });
  } else {
    const org = p.org as Row;
    if (!org || org.id !== t.record_id) return { ok: false, error: "ข้อมูลในถังขยะไม่ตรงกับรายการ" };
    if (await get("SELECT 1 AS x FROM orgs WHERE tenant_id = ? AND id = ?", tenantId, t.record_id)) return { ok: false, error: "มีบริษัทนี้อยู่แล้ว (อาจถูกสร้างใหม่จากการนำเข้า)" };
    const links = (p.links ?? {}) as { children?: string[] };
    await tx(async (q) => {
      /* บริษัทแม่ที่ถูกลบไปแล้วระหว่างนั้น → ไม่ผูกกลับ */
      const parent = org.parent_id && (await q.get("SELECT 1 AS x FROM orgs WHERE tenant_id = ? AND id = ?", tenantId, String(org.parent_id))) ? org.parent_id : null;
      await insertRows(q, "orgs", tenantId, [{ ...org, parent_id: parent }]);
      /* โดเมนที่ระหว่างนั้นถูกผูกกับบริษัทอื่นแล้ว = ข้าม (กุญแจ tenant+domain) */
      for (const dm of (p.domains as Row[]) ?? []) {
        if (dm.tenant_id === tenantId && !(await q.get("SELECT 1 AS x FROM org_domains WHERE tenant_id = ? AND domain = ?", tenantId, String(dm.domain)))) {
          await q.run("INSERT INTO org_domains (tenant_id, org_id, domain) VALUES (?,?,?)", tenantId, t.record_id, String(dm.domain));
        }
      }
      await insertRows(q, "custom_values", tenantId, ((p.values as Row[]) ?? []).filter((v) => v.entity === "org" && v.record_id === t.record_id));
      for (const id of links.children ?? []) await q.run("UPDATE orgs SET parent_id = ? WHERE tenant_id = ? AND id = ? AND parent_id IS NULL", t.record_id, tenantId, String(id));
      await q.run("UPDATE trash SET restored_at = ?, restored_by = ? WHERE tenant_id = ? AND id = ?", at, viewer.id, tenantId, trashId);
    });
  }
  await logActivity(tenantId, viewer.id, "trash_restore", `${t.kind} · ${t.record_id}`);
  return { ok: true, kind: t.kind as "deal" | "org", recordId: t.record_id };
}
