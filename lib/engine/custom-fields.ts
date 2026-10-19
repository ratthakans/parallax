import { randomUUID } from "node:crypto";
import { all, get, run } from "@/lib/engine/sql";
import { logActivity } from "@/lib/engine/db";
import { dealPartyAccess, type Viewer } from "@/lib/engine/accounts";

/* ── ฟิลด์กำหนดเอง (docs/crm-plan.md C4) ─────────────────────────────────

   บัญชีเพิ่มมิติของตัวเองได้บนบริษัทและดีล (ขนาดบูธ · tier สปอนเซอร์ · ภาค · งบประมาณปี …)
   ไม่มีบนตัวคน — ตั้งใจ: ช่องอิสระบนคนคือทางให้ข้อมูลส่วนบุคคลไหลเข้าโดยไม่ผ่านวัตถุประสงค์และอายุข้อมูล
   ค่าเพิ่มอย่างเดียว: แก้ = แถวใหม่ · ค่าปัจจุบัน = แถวล่าสุด (มีประวัติว่าใครเปลี่ยนเมื่อไร)
   นิยามฟิลด์ = สิทธิ์ fields · กรอกค่า = สิทธิ์ write + ด่านบริษัท (orgAccess) เดียวกับการแก้แฟ้ม */

export const FIELD_ENTITIES = ["org", "deal"] as const;
export type FieldEntity = (typeof FIELD_ENTITIES)[number];
export const FIELD_KINDS = ["text", "number", "choice", "date"] as const;
export type FieldKind = (typeof FIELD_KINDS)[number];
export const FIELD_KIND_TH: Record<FieldKind, string> = { text: "ข้อความ", number: "ตัวเลข", choice: "ตัวเลือก", date: "วันที่" };
export const FIELD_ENTITY_TH: Record<FieldEntity, string> = { org: "บริษัท", deal: "ดีล" };
const MAX_FIELDS = 30;

export type CustomField = { id: string; entity: FieldEntity; label: string; kind: FieldKind; options: string[]; archived: boolean };
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const parseOpts = (s: string | null) => { try { const v = JSON.parse(s ?? "[]"); return Array.isArray(v) ? v.map(String) : []; } catch { return []; } };

export async function listFields(tenantId: string, entity?: FieldEntity, withArchived = false): Promise<CustomField[]> {
  const rows = await all<{ id: string; entity: string; label: string; kind: string; options: string | null; archived_at: string | null }>(
    `SELECT id, entity, label, kind, options, archived_at FROM custom_fields WHERE tenant_id = ?${entity ? " AND entity = ?" : ""}
     ORDER BY entity, position, created_at, id`, tenantId, ...(entity ? [entity] : []));
  return rows.filter((r) => withArchived || !r.archived_at).map((r) => ({
    id: r.id, entity: r.entity as FieldEntity, label: r.label, kind: r.kind as FieldKind, options: parseOpts(r.options), archived: Boolean(r.archived_at),
  }));
}

export async function createField(
  tenantId: string, input: { entity: string; label: string; kind: string; options?: string }, actor: string,
): Promise<Result<{ id: string }>> {
  if (!(FIELD_ENTITIES as readonly string[]).includes(input.entity)) return { ok: false, error: "เลือกว่าฟิลด์อยู่บนบริษัทหรือดีล" };
  if (!(FIELD_KINDS as readonly string[]).includes(input.kind)) return { ok: false, error: "เลือกชนิดของฟิลด์" };
  const label = input.label.trim().slice(0, 60);
  if (label.length < 2) return { ok: false, error: "ตั้งชื่อฟิลด์ เช่น \"ขนาดบูธ\"" };
  const entity = input.entity as FieldEntity, kind = input.kind as FieldKind;
  const current = await listFields(tenantId, entity);
  if (current.length >= MAX_FIELDS) return { ok: false, error: `มีฟิลด์บน${FIELD_ENTITY_TH[entity]}ครบ ${MAX_FIELDS} ช่องแล้ว — ซ่อนช่องที่ไม่ใช้ก่อน` };
  if (current.some((f) => f.label === label)) return { ok: false, error: "มีฟิลด์ชื่อนี้อยู่แล้ว" };
  let options: string[] | null = null;
  if (kind === "choice") {
    options = [...new Set((input.options ?? "").split(/[\n,]/).map((o) => o.trim().slice(0, 60)).filter(Boolean))];
    if (options.length < 2 || options.length > 30) return { ok: false, error: "ตัวเลือกต้องมี 2–30 ข้อ (คั่นด้วยจุลภาคหรือขึ้นบรรทัดใหม่)" };
  }
  const id = `cf-${randomUUID()}`;
  await run(
    "INSERT INTO custom_fields (id, tenant_id, entity, label, kind, options, position, archived_at, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
    id, tenantId, entity, label, kind, options ? JSON.stringify(options) : null, current.length, null, actor, new Date().toISOString());
  await logActivity(tenantId, actor, "custom_field_create", `${entity} · ${label}`);
  return { ok: true, id };
}

/** ซ่อนฟิลด์ (ค่าเดิมยังอยู่ · เปิดคืนได้) — ไม่มีการลบนิยาม เพื่อให้ประวัติของค่าอ่านได้เสมอ */
export async function archiveField(tenantId: string, id: string, archived: boolean, actor: string): Promise<Result> {
  const f = await get<{ id: string }>("SELECT id FROM custom_fields WHERE tenant_id = ? AND id = ?", tenantId, id);
  if (!f) return { ok: false, error: "ไม่พบฟิลด์นี้" };
  await run("UPDATE custom_fields SET archived_at = ? WHERE tenant_id = ? AND id = ?", archived ? new Date().toISOString() : null, tenantId, id);
  await logActivity(tenantId, actor, archived ? "custom_field_archive" : "custom_field_restore", id);
  return { ok: true };
}

/** ค่าปัจจุบัน (แถวล่าสุดต่อฟิลด์) ของหลายระเบียน — Map<recordId, Map<fieldId, value>> */
export async function valuesFor(tenantId: string, entity: FieldEntity, recordIds: string[]): Promise<Map<string, Map<string, string>>> {
  const out = new Map<string, Map<string, string>>();
  for (let i = 0; i < recordIds.length; i += 500) {
    const chunk = recordIds.slice(i, i + 500);
    const rows = await all<{ record_id: string; field_id: string; value: string | null }>(
      `SELECT record_id, field_id, value FROM custom_values WHERE tenant_id = ? AND entity = ? AND record_id IN (${chunk.map(() => "?").join(",")})
       ORDER BY recorded_at, id`, tenantId, entity, ...chunk);
    for (const r of rows) {
      const m = out.get(r.record_id) ?? new Map<string, string>();
      if (r.value == null) m.delete(r.field_id); else m.set(r.field_id, r.value);
      out.set(r.record_id, m);
    }
  }
  return out;
}

export function normaliseValue(f: Pick<CustomField, "kind" | "options">, raw: string): { ok: true; value: string | null } | { ok: false; error: string } {
  const v = raw.trim();
  if (!v) return { ok: true, value: null };
  if (f.kind === "number") {
    const n = Number(v.replace(/[,฿\s]/g, ""));
    return Number.isFinite(n) ? { ok: true, value: String(n) } : { ok: false, error: "ใส่ตัวเลข" };
  }
  if (f.kind === "date") return /^\d{4}-\d{2}-\d{2}$/.test(v) ? { ok: true, value: v } : { ok: false, error: "เลือกวันที่" };
  if (f.kind === "choice") return f.options.includes(v) ? { ok: true, value: v } : { ok: false, error: "เลือกจากตัวเลือกที่ตั้งไว้" };
  return { ok: true, value: v.slice(0, 300) };
}

/** ฝั่งที่ใช้ตรวจสิทธิ์ของระเบียน — ดีลใช้บริษัทของดีล หรือลูกค้าบุคคลของดีล (F3) */
async function partyOf(tenantId: string, entity: FieldEntity, recordId: string): Promise<{ org_id: string | null; customer_id: string | null } | null> {
  if (entity === "org") {
    const id = (await get<{ id: string }>("SELECT id FROM orgs WHERE tenant_id = ? AND id = ?", tenantId, recordId))?.id;
    return id ? { org_id: id, customer_id: null } : null;
  }
  return (await get<{ org_id: string | null; customer_id: string | null }>("SELECT org_id, customer_id FROM opportunities WHERE tenant_id = ? AND id = ?", tenantId, recordId)) ?? null;
}

export async function setValue(
  tenantId: string, entity: FieldEntity, recordId: string, fieldId: string, raw: string, viewer: Viewer,
): Promise<Result> {
  const f = (await listFields(tenantId, entity)).find((x) => x.id === fieldId);
  if (!f) return { ok: false, error: "ไม่พบฟิลด์นี้ (อาจถูกซ่อน)" };
  const party = await partyOf(tenantId, entity, recordId);
  if (!party) return { ok: false, error: `ไม่พบ${FIELD_ENTITY_TH[entity]}นี้` };
  const access = await dealPartyAccess(tenantId, party, viewer);
  if (!access.ok) return access;
  const n = normaliseValue(f, raw);
  if (!n.ok) return n;
  const last = await get<{ value: string | null; recorded_at: string }>(
    `SELECT value, recorded_at FROM custom_values WHERE tenant_id = ? AND entity = ? AND record_id = ? AND field_id = ?
     ORDER BY recorded_at DESC, id DESC LIMIT 1`, tenantId, entity, recordId, fieldId);
  if ((last?.value ?? null) === n.value) return { ok: true };
  /* เวลาต้องมากกว่าแถวก่อนหน้าเสมอ — แก้สองครั้งในมิลลิวินาทีเดียวกัน id สุ่มจะเรียงผิดแล้วได้ค่าเก่าเป็นค่าปัจจุบัน */
  const at = new Date(Math.max(Date.now(), last ? Date.parse(last.recorded_at) + 1 : 0)).toISOString();
  await run(
    "INSERT INTO custom_values (id, tenant_id, field_id, entity, record_id, value, recorded_by, recorded_at) VALUES (?,?,?,?,?,?,?,?)",
    `cv-${randomUUID()}`, tenantId, fieldId, entity, recordId, n.value, viewer.id, at);
  return { ok: true };
}

export async function valueHistory(tenantId: string, entity: FieldEntity, recordId: string): Promise<{ fieldId: string; value: string | null; by: string; at: string }[]> {
  return (await all<{ field_id: string; value: string | null; recorded_by: string; recorded_at: string }>(
    "SELECT field_id, value, recorded_by, recorded_at FROM custom_values WHERE tenant_id = ? AND entity = ? AND record_id = ? ORDER BY recorded_at DESC, id DESC LIMIT 100",
    tenantId, entity, recordId)).map((r) => ({ fieldId: r.field_id, value: r.value, by: r.recorded_by, at: r.recorded_at }));
}

/** ค่าที่แสดง — ตัวเลขใส่จุลภาค · วันที่เป็นแบบไทย */
export function displayValue(f: Pick<CustomField, "kind">, v: string | undefined | null): string {
  if (v == null || v === "") return "—";
  if (f.kind === "number") return Number(v).toLocaleString("th-TH");
  if (f.kind === "date") return new Date(`${v}T00:00:00Z`).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
  return v;
}
