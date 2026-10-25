import { createHash, randomUUID } from "node:crypto";
import { all, get, run, tx } from "@/lib/engine/sql";
import { logActivity } from "@/lib/engine/db";
import { VAULT_FIELDS, type SourceKind, type VaultField } from "@/lib/shared/vault";

/* ── ลงทะเบียนแหล่งข้อมูลก่อนอัปโหลด (Blueprint บท 4 ขั้น 1) ───────────

   "การนำเข้าข้อมูลคือการประมวลผลข้อมูลส่วนบุคคล จึงต้องตรวจอำนาจในการนำเข้าและฐาน…ก่อนอัปโหลด"
   ไม่มีแหล่งที่ลงทะเบียน = อัปโหลดไม่ได้ · แหล่งบอกวัตถุประสงค์ เจ้าของงาน ที่มาของข้อมูล
   และเลือกเฉพาะฟิลด์ที่จำเป็น — คอลัมน์นอกนั้นไม่ถูกเก็บแม้อยู่ในไฟล์ */

export type Purpose = { id: string; code: string; name: string };
export type Source = {
  id: string; name: string; kind: SourceKind; purposeId: string | null; purposeName: string | null;
  ownerId: string; scopeNote: string | null; acquisitionNote: string | null; fields: VaultField[];
  status: "active" | "retired"; registeredBy: string; registeredAt: string; batches: number; rows: number;
};

export async function listPurposes(tenantId: string): Promise<Purpose[]> {
  return all<Purpose>("SELECT id, code, name FROM purposes WHERE tenant_id = ? ORDER BY name", tenantId);
}

/* รหัสวัตถุประสงค์จากชื่อ — ชื่อภาษาไทยใช้แฮชของชื่อเต็ม
   เดิมใช้ 6 ไบต์แรกของชื่อ (≈ อักษรไทยสองตัว) ทำให้ "ขายสปอนเซอร์" กับ "ขายบูธ" ได้รหัสเดียวกัน
   แล้ววัตถุประสงค์ใหม่ไปผูกกับฐานและความยินยอมของวัตถุประสงค์เก่าเงียบ ๆ */
function codeFor(name: string): string {
  const latin = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return latin || `p_${createHash("sha256").update(name).digest("hex").slice(0, 16)}`;
}

export async function ensurePurpose(tenantId: string, name: string, actor: string): Promise<string> {
  const clean = name.trim().slice(0, 120);
  /* ชื่อตรงกันทุกตัวก่อน — วัตถุประสงค์ที่สร้างด้วยรหัสแบบเดิมยังหาเจอ */
  const byName = await get<{ id: string }>("SELECT id FROM purposes WHERE tenant_id = ? AND name = ?", tenantId, clean);
  if (byName) return byName.id;
  const code = codeFor(clean);
  const found = await get<{ id: string; name: string }>("SELECT id, name FROM purposes WHERE tenant_id = ? AND code = ?", tenantId, code);
  if (found) return found.id;
  const id = randomUUID();
  await run(
    "INSERT INTO purposes (id, tenant_id, code, name, created_at) VALUES (?,?,?,?,?)",
    id, tenantId, code, clean, new Date().toISOString(),
  );
  await logActivity(tenantId, actor, "purpose_created", id);
  return id;
}

export type RegisterInput = {
  name: string; kind: SourceKind; purposeId?: string; newPurpose?: string;
  scopeNote?: string; acquisitionNote: string; fields: string[];
};

export async function registerSource(
  tenantId: string, input: RegisterInput, actor: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "ตั้งชื่อแหล่งข้อมูล เช่น \"รายชื่อผู้ลงทะเบียนงาน 2016–2025\"" };
  if (input.kind === "namecard") {
    /* แหล่งนามบัตรถูกสร้างโดยหน้า "กรอกนามบัตร" (vault/cards.ts) ซึ่งผูกวัตถุประสงค์จากแม่แบบนามบัตรเสมอ
       ลงทะเบียนเองจากฟอร์มนี้ไม่ได้ — ไม่งั้นนามบัตรผูกกับวัตถุประสงค์อื่นได้ · OCR ยังไม่เปิด (solo-plan หัวข้อ 13) */
    return { ok: false, error: "นามบัตรเพิ่มจากหน้า \"เพิ่มนามบัตร\" — ระบบสร้างแหล่งและผูกวัตถุประสงค์นามบัตรให้เอง" };
  }
  const acquisition = input.acquisitionNote.trim();
  if (acquisition.length < 10) {
    return { ok: false, error: "บอกที่มาของข้อมูลและการแจ้งเจ้าของข้อมูล (เช่น \"แบบฟอร์มลงทะเบียนงาน มีประกาศความเป็นส่วนตัวในฟอร์ม\")" };
  }
  const fields = [...new Set(input.fields)].filter((f): f is VaultField => (VAULT_FIELDS as readonly string[]).includes(f));
  if (!fields.length) return { ok: false, error: "เลือกฟิลด์ที่จำเป็นอย่างน้อยหนึ่งช่อง" };
  if (!input.purposeId && !input.newPurpose?.trim()) return { ok: false, error: "ระบุวัตถุประสงค์ของการใช้ข้อมูลชุดนี้" };

  const id = randomUUID();
  const done = await tx(async () => {
    const purposeId = input.newPurpose?.trim()
      ? await ensurePurpose(tenantId, input.newPurpose, actor)
      : input.purposeId!;
    const ok = await get<{ id: string }>("SELECT id FROM purposes WHERE tenant_id = ? AND id = ?", tenantId, purposeId);
    if (!ok) return false;
    await run(
      `INSERT INTO sources (id, tenant_id, name, kind, purpose_id, owner_id, scope_note, fields, acquisition_note,
         status, registered_by, registered_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      id, tenantId, name.slice(0, 160), input.kind, purposeId, actor, input.scopeNote?.trim() || null,
      JSON.stringify(fields), acquisition.slice(0, 1000), "active", actor, new Date().toISOString(),
    );
    await logActivity(tenantId, actor, "source_registered", `${id} · ${fields.length} fields`);
    return true;
  });
  return done ? { ok: true, id } : { ok: false, error: "ไม่พบวัตถุประสงค์นี้ในบัญชี" };
}

type SourceRow = {
  id: string; name: string; kind: SourceKind; purpose_id: string | null; purpose_name: string | null;
  owner_id: string; scope_note: string | null; acquisition_note: string | null; fields: string;
  status: "active" | "retired"; registered_by: string; registered_at: string;
  batches: number | string | null; rows: number | string | null;
};

const SOURCE_SQL = `SELECT s.id, s.name, s.kind, s.purpose_id, p.name AS purpose_name, s.owner_id, s.scope_note,
    s.acquisition_note, s.fields, s.status, s.registered_by, s.registered_at,
    (SELECT COUNT(*) FROM import_batches b WHERE b.tenant_id = s.tenant_id AND b.source_id = s.id) AS batches,
    (SELECT COALESCE(SUM(b.rows_total), 0) FROM import_batches b WHERE b.tenant_id = s.tenant_id AND b.source_id = s.id) AS rows
  FROM sources s LEFT JOIN purposes p ON p.id = s.purpose_id AND p.tenant_id = s.tenant_id
  WHERE s.tenant_id = ?`;

const toSource = (r: SourceRow): Source => ({
  id: r.id, name: r.name, kind: r.kind, purposeId: r.purpose_id, purposeName: r.purpose_name, ownerId: r.owner_id,
  scopeNote: r.scope_note, acquisitionNote: r.acquisition_note, fields: JSON.parse(r.fields) as VaultField[],
  status: r.status, registeredBy: r.registered_by, registeredAt: r.registered_at,
  batches: Number(r.batches ?? 0), rows: Number(r.rows ?? 0),
});

export async function listSources(tenantId: string): Promise<Source[]> {
  return (await all<SourceRow>(`${SOURCE_SQL} ORDER BY s.registered_at DESC`, tenantId)).map(toSource);
}

export async function getSource(tenantId: string, id: string): Promise<Source | null> {
  const r = await get<SourceRow>(`${SOURCE_SQL} AND s.id = ?`, tenantId, id);
  return r ? toSource(r) : null;
}
