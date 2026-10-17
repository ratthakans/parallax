import { createHash, randomUUID } from "node:crypto";
import { all, get, tx } from "@/lib/engine/sql";
import { logActivity } from "@/lib/engine/db";
import { scanFile } from "@/lib/engine/vault/scan";
import { TableTooLarge, readTable } from "@/lib/engine/vault/read";
import { orgAccess, type Viewer } from "@/lib/engine/accounts";
import { orgByName } from "@/lib/engine/accounts/edit";
import { listFields, normaliseValue, valuesFor, type CustomField } from "@/lib/engine/custom-fields";
import { orgIdFor } from "@/lib/engine/vault/resolve";
import { orgInfo } from "@/lib/shared/identity";
import { normaliseTaxId } from "@/lib/shared/tax-id";

/* ── นำเข้าไฟล์ระดับบริษัทเพื่ออัปเดต (docs/crm-plan.md D2) ───────────────────

   ไฟล์หนึ่งแถว = หนึ่งบริษัทที่มีอยู่แล้ว · หาบริษัทจาก เลขนิติบุคคล > รหัสบริษัท > ชื่อ (ไม่สร้างบริษัทใหม่จากที่นี่)
   ช่องที่อัปเดตได้: อุตสาหกรรม · เลขนิติบุคคล · ชื่ออังกฤษ · โดเมน · ทีม · เจ้าของบัญชี · ฟิลด์ของบัญชี
   ช่องว่าง = ไม่เปลี่ยน (ไม่ล้างค่า) · ดูความต่างทั้งหมดก่อนยืนยัน · ทุกการเปลี่ยนมีรุ่นในประวัติ
   ย้อนได้ทั้งชุด: คืนค่าเดิมเฉพาะช่องที่ยังเป็นค่าจากชุดนี้ (มีคนแก้ต่อหลังจากนั้น = ไม่ทับ)
   ไฟล์ผ่านการตรวจเดียวกับการนำเข้าทุกทาง (scanFile) · ไม่มีข้อมูลบุคคลในไฟล์นี้ */

export type Target = "match_name" | "match_id" | "industry" | "tax_id" | "name_en" | "primary_domain" | "team" | "owner" | `cf.${string}` | "ignore";
export const TARGET_TH: Record<string, string> = {
  match_name: "ชื่อบริษัท (ใช้หาบริษัท)", match_id: "รหัสบริษัทในระบบ (ใช้หาบริษัท)", industry: "อุตสาหกรรม", tax_id: "เลขนิติบุคคล",
  name_en: "ชื่อภาษาอังกฤษ", primary_domain: "โดเมน", team: "ทีมที่ดูแล (ชื่อทีม)", owner: "เจ้าของบัญชี (อีเมล)", ignore: "ไม่ใช้คอลัมน์นี้",
};
const ORG_COLUMNS = new Set(["industry", "tax_id", "name_en", "primary_domain"]);
/* คอลัมน์ของ orgs ที่ชุดนี้เขียนได้ — ชื่อคอลัมน์ถูกต่อเข้า SQL จึงต้องมาจากรายการนี้เท่านั้น
   (แถวใน org_update_changes เขียนได้ผ่าน RLS ของผู้ใช้ — ห้ามเชื่อค่า field จากตาราง) */
const WRITABLE = new Set([...ORG_COLUMNS, "team_id", "account_owner_id"]);
const safeField = (f: string) => WRITABLE.has(f) || /^cf\.cf-[0-9a-f-]{36}$/.test(f);

export type Change = { orgId: string; org: string; field: string; label: string; oldValue: string | null; newValue: string };
export type OrgUpdatePlan = {
  sha256: string; rows: number; columns: { index: number; header: string; target: Target }[];
  matched: number; changes: Change[]; problems: { line: number; reason: string }[];
};
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

function guess(header: string, fields: CustomField[]): Target {
  const h = header.trim();
  const cf = fields.find((f) => f.label.toLowerCase() === h.toLowerCase());
  if (cf) return `cf.${cf.id}`;
  if (/^(org.?id|รหัสบริษัท)$/i.test(h)) return "match_id";
  if (/(tax.?(id|no)|ผู้เสียภาษี|นิติบุคคล|juristic)/i.test(h)) return "tax_id";
  if (/(industry|อุตสาหกรรม|ประเภทธุรกิจ)/i.test(h)) return "industry";
  if (/(english|ชื่ออังกฤษ|name.?en)/i.test(h)) return "name_en";
  if (/(domain|โดเมน|website|เว็บไซต์)/i.test(h)) return "primary_domain";
  if (/(team|territory|ทีม|เขต)/i.test(h)) return "team";
  if (/(owner|เจ้าของ)/i.test(h)) return "owner";
  if (/(company|organi[sz]ation|account|บริษัท|องค์กร|หน่วยงาน|ชื่อ)/i.test(h)) return "match_name";
  return "ignore";
}

async function read(bytes: Uint8Array, filename: string) {
  const scan = await scanFile(bytes, filename);
  if (!scan.ok) return { error: scan.reason };
  try {
    const t = readTable(bytes, scan.kind);
    if (!t.rows.length) return { error: "ไม่มีข้อมูลในไฟล์" };
    return { table: t };
  } catch (e) {
    return { error: e instanceof TableTooLarge ? e.message : "อ่านไฟล์ไม่ได้ — ไฟล์อาจเสียหรือถูกป้องกันด้วยรหัสผ่าน" };
  }
}

export async function planOrgUpdate(
  tenantId: string, bytes: Uint8Array, filename: string, viewer: Viewer, override?: Record<number, Target>,
): Promise<Result<{ plan: OrgUpdatePlan }>> {
  const r = await read(bytes, filename);
  if ("error" in r) return { ok: false, error: r.error! };
  const t = r.table!;
  const fields = await listFields(tenantId, "org");
  const columns = t.headers.map((header, index) => ({ index, header, target: override?.[index] ?? guess(header, fields) }));
  const col = (k: Target) => columns.find((c) => c.target === k)?.index;
  const iTax = col("tax_id"), iId = col("match_id"), iName = col("match_name");
  if (iTax == null && iId == null && iName == null) return { ok: false, error: "ไม่พบคอลัมน์ที่ใช้หาบริษัท — ต้องมีชื่อบริษัท เลขนิติบุคคล หรือรหัสบริษัทอย่างน้อยหนึ่งคอลัมน์" };
  if (!columns.some((c) => c.target !== "ignore" && c.target !== "match_name" && c.target !== "match_id")) return { ok: false, error: "ไม่มีคอลัมน์ที่จะอัปเดต" };

  const teams = new Map((await all<{ id: string; name: string }>("SELECT id, name FROM teams WHERE tenant_id = ?", tenantId)).map((x) => [x.name.trim(), x.id]));
  const teamName = new Map([...teams].map(([n, id]) => [id, n]));
  const plan: OrgUpdatePlan = { sha256: createHash("sha256").update(bytes).digest("hex"), rows: t.rows.length, columns, matched: 0, changes: [], problems: [] };
  const seen = new Set<string>();
  const cell = (row: string[], i?: number) => (i == null ? "" : (row[i] ?? "").trim());

  for (let li = 0; li < t.rows.length; li++) {
    const row = t.rows[li], line = li + 2;
    /* หาบริษัท: เลขนิติบุคคล (ตรงกับที่มีอยู่) > รหัส > ชื่อ */
    const tax = normaliseTaxId(cell(row, iTax));
    let orgId: string | null = null;
    if (tax) orgId = (await get<{ id: string }>("SELECT id FROM orgs WHERE tenant_id = ? AND tax_id = ?", tenantId, tax))?.id ?? null;
    if (!orgId && cell(row, iId)) orgId = (await get<{ id: string }>("SELECT id FROM orgs WHERE tenant_id = ? AND id = ?", tenantId, cell(row, iId)))?.id ?? null;
    if (!orgId && cell(row, iName)) {
      orgId = await orgByName(tenantId, cell(row, iName));
      if (!orgId) {
        const key = orgInfo(cell(row, iName)).key;
        if (key) orgId = (await get<{ id: string }>("SELECT id FROM orgs WHERE tenant_id = ? AND id = ?", tenantId, orgIdFor(tenantId, key)))?.id ?? null;
      }
    }
    if (!orgId) { plan.problems.push({ line, reason: `ไม่พบบริษัท "${cell(row, iName) || cell(row, iTax) || cell(row, iId)}" — ไฟล์นี้อัปเดตบริษัทที่มีอยู่เท่านั้น` }); continue; }
    if (seen.has(orgId)) { plan.problems.push({ line, reason: "บริษัทนี้อยู่ในไฟล์มากกว่าหนึ่งแถว — ใช้แถวแรก" }); continue; }
    seen.add(orgId);
    const access = await orgAccess(tenantId, orgId, viewer);
    if (!access.ok) { plan.problems.push({ line, reason: access.error }); continue; }
    const o = (await get<Record<string, string | null>>("SELECT * FROM orgs WHERE tenant_id = ? AND id = ?", tenantId, orgId))!;
    const cv = (await valuesFor(tenantId, "org", [orgId])).get(orgId);
    plan.matched++;
    for (const c of columns) {
      const raw = cell(row, c.index);
      if (!raw || c.target === "ignore" || c.target === "match_name" || c.target === "match_id") continue;
      const add = (field: string, label: string, oldValue: string | null, newValue: string) => {
        if ((oldValue ?? "") !== newValue) plan.changes.push({ orgId, org: o.name ?? "", field, label, oldValue, newValue });
      };
      if (c.target === "tax_id") {
        const v = normaliseTaxId(raw);
        if (!v) { plan.problems.push({ line, reason: `เลขนิติบุคคล "${raw}" ไม่ถูกต้อง` }); continue; }
        const twin = await get<{ name: string }>("SELECT name FROM orgs WHERE tenant_id = ? AND tax_id = ? AND id <> ?", tenantId, v, orgId);
        if (twin) { plan.problems.push({ line, reason: `เลข ${v} เป็นของ "${twin.name}" อยู่แล้ว — ข้ามช่องนี้` }); continue; }
        add("tax_id", TARGET_TH.tax_id, o.tax_id, v);
      } else if (c.target === "primary_domain") {
        const v = raw.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
        if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(v)) { plan.problems.push({ line, reason: `โดเมน "${raw}" ไม่ถูกรูปแบบ` }); continue; }
        add("primary_domain", TARGET_TH.primary_domain, o.primary_domain, v);
      } else if (ORG_COLUMNS.has(c.target)) {
        add(c.target, TARGET_TH[c.target], o[c.target] ?? null, raw.slice(0, 200));
      } else if (c.target === "team") {
        const id = teams.get(raw);
        if (!id) { plan.problems.push({ line, reason: `ไม่มีทีมชื่อ "${raw}" — สร้างทีมก่อนที่ ตั้งค่า › ทีม` }); continue; }
        if (o.team_id !== id) plan.changes.push({ orgId, org: o.name ?? "", field: "team_id", label: TARGET_TH.team, oldValue: o.team_id ? teamName.get(o.team_id) ?? o.team_id : null, newValue: raw });
      } else if (c.target === "owner") {
        add("account_owner_id", TARGET_TH.owner, o.account_owner_id, raw.slice(0, 120));
      } else if (c.target.startsWith("cf.")) {
        const f = fields.find((x) => x.id === c.target.slice(3));
        if (!f) continue;
        const n = normaliseValue(f, raw);
        if (!n.ok || n.value == null) { plan.problems.push({ line, reason: `${f.label}: ${n.ok ? "ค่าว่าง" : n.error}` }); continue; }
        add(c.target, f.label, cv?.get(f.id) ?? null, n.value);
      }
    }
  }
  return { ok: true, plan };
}

export async function applyOrgUpdate(
  tenantId: string, bytes: Uint8Array, filename: string, expectedSha: string, viewer: Viewer, override?: Record<number, Target>,
): Promise<Result<{ batchId: string; changes: number }>> {
  const p = await planOrgUpdate(tenantId, bytes, filename, viewer, override);
  if (!p.ok) return p;
  if (p.plan.sha256 !== expectedSha) return { ok: false, error: "ไฟล์ไม่ใช่ไฟล์เดียวกับที่ดูตัวอย่างไว้ — เริ่มใหม่" };
  if (!p.plan.changes.length) return { ok: false, error: "ไม่มีอะไรเปลี่ยน — ค่าในไฟล์ตรงกับในระบบแล้ว" };
  const teams = new Map((await all<{ id: string; name: string }>("SELECT id, name FROM teams WHERE tenant_id = ?", tenantId)).map((x) => [x.name.trim(), x.id]));
  const batchId = `ou-${randomUUID()}`, at = new Date().toISOString(), why = `นำเข้าไฟล์ ${filename}`;
  await tx(async (q) => {
    await q.run("INSERT INTO org_update_batches (id, tenant_id, filename, sha256, rows, changes, applied_by, applied_at) VALUES (?,?,?,?,?,?,?,?)",
      batchId, tenantId, filename.slice(0, 200), expectedSha, p.plan.rows, p.plan.changes.length, viewer.id, at);
    for (const c of p.plan.changes) {
      if (!safeField(c.field)) continue;
      /* ค่าที่เก็บจริง: ทีมเก็บเป็นรหัส (ชื่อแสดงในตัวอย่างเท่านั้น) */
      const stored = c.field === "team_id" ? teams.get(c.newValue) ?? null : c.newValue;
      let old: string | null;
      if (c.field.startsWith("cf.")) {
        const last = await q.get<{ value: string | null; recorded_at: string }>(
          "SELECT value, recorded_at FROM custom_values WHERE tenant_id = ? AND entity = 'org' AND record_id = ? AND field_id = ? ORDER BY recorded_at DESC, id DESC LIMIT 1",
          tenantId, c.orgId, c.field.slice(3));
        old = last?.value ?? null;
        const t2 = new Date(Math.max(Date.parse(at), last ? Date.parse(last.recorded_at) + 1 : 0)).toISOString();
        await q.run("INSERT INTO custom_values (id, tenant_id, field_id, entity, record_id, value, recorded_by, recorded_at) VALUES (?,?,?,?,?,?,?,?)",
          `cv-${randomUUID()}`, tenantId, c.field.slice(3), "org", c.orgId, stored, viewer.id, t2);
      } else {
        old = (await q.get<Record<string, string | null>>(`SELECT ${c.field} AS v FROM orgs WHERE tenant_id = ? AND id = ?`, tenantId, c.orgId))?.v ?? null;
        await q.run(
          "INSERT INTO record_versions (tenant_id, record_kind, record_id, field, old_value, new_value, reason, changed_by, valid_from, recorded_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
          tenantId, "org", c.orgId, c.field, old, stored, why, viewer.id, null, at);
        await q.run(`UPDATE orgs SET ${c.field} = ?, recorded_at = ? WHERE tenant_id = ? AND id = ?`, stored, at, tenantId, c.orgId);
      }
      await q.run("INSERT INTO org_update_changes (id, tenant_id, batch_id, org_id, field, old_value, new_value) VALUES (?,?,?,?,?,?,?)",
        `oc-${randomUUID()}`, tenantId, batchId, c.orgId, c.field, old, stored);
    }
  });
  await logActivity(tenantId, viewer.id, "org_update_import", `${batchId} · ${p.plan.changes.length} changes`);
  return { ok: true, batchId, changes: p.plan.changes.length };
}

/** ย้อนทั้งชุด — คืนค่าเดิมเฉพาะช่องที่ยังเป็นค่าจากชุดนี้ */
export async function undoOrgUpdate(tenantId: string, batchId: string, viewer: Viewer): Promise<Result<{ reverted: number; kept: number }>> {
  const b = await get<{ undone_at: string | null; filename: string }>("SELECT undone_at, filename FROM org_update_batches WHERE tenant_id = ? AND id = ?", tenantId, batchId);
  if (!b) return { ok: false, error: "ไม่พบชุดนี้" };
  if (b.undone_at) return { ok: false, error: "ชุดนี้ย้อนไปแล้ว" };
  const changes = await all<{ org_id: string; field: string; old_value: string | null; new_value: string | null }>(
    "SELECT org_id, field, old_value, new_value FROM org_update_changes WHERE tenant_id = ? AND batch_id = ?", tenantId, batchId);
  let reverted = 0, kept = 0;
  const at = new Date().toISOString(), why = `ย้อนการนำเข้าไฟล์ ${b.filename}`;
  await tx(async (q) => {
    for (const c of changes) {
      if (!safeField(c.field)) { kept++; continue; }
      const access = await orgAccess(tenantId, c.org_id, viewer);
      if (!access.ok) { kept++; continue; }
      if (c.field.startsWith("cf.")) {
        const last = await q.get<{ value: string | null; recorded_at: string }>(
          "SELECT value, recorded_at FROM custom_values WHERE tenant_id = ? AND entity = 'org' AND record_id = ? AND field_id = ? ORDER BY recorded_at DESC, id DESC LIMIT 1",
          tenantId, c.org_id, c.field.slice(3));
        if ((last?.value ?? null) !== c.new_value) { kept++; continue; }
        const t2 = new Date(Math.max(Date.parse(at), last ? Date.parse(last.recorded_at) + 1 : 0)).toISOString();
        await q.run("INSERT INTO custom_values (id, tenant_id, field_id, entity, record_id, value, recorded_by, recorded_at) VALUES (?,?,?,?,?,?,?,?)",
          `cv-${randomUUID()}`, tenantId, c.field.slice(3), "org", c.org_id, c.old_value, viewer.id, t2);
      } else {
        const cur = (await q.get<Record<string, string | null>>(`SELECT ${c.field} AS v FROM orgs WHERE tenant_id = ? AND id = ?`, tenantId, c.org_id))?.v ?? null;
        if (cur !== c.new_value) { kept++; continue; }
        await q.run(
          "INSERT INTO record_versions (tenant_id, record_kind, record_id, field, old_value, new_value, reason, changed_by, valid_from, recorded_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
          tenantId, "org", c.org_id, c.field, cur, c.old_value, why, viewer.id, null, at);
        await q.run(`UPDATE orgs SET ${c.field} = ?, recorded_at = ? WHERE tenant_id = ? AND id = ?`, c.old_value, at, tenantId, c.org_id);
      }
      reverted++;
    }
    await q.run("UPDATE org_update_batches SET undone_at = ?, undone_by = ? WHERE tenant_id = ? AND id = ?", at, viewer.id, tenantId, batchId);
  });
  await logActivity(tenantId, viewer.id, "org_update_undo", `${batchId} · ${reverted} reverted · ${kept} kept`);
  return { ok: true, reverted, kept };
}

export async function listOrgUpdates(tenantId: string): Promise<{ id: string; filename: string; rows: number; changes: number; by: string; at: string; undoneAt: string | null }[]> {
  return (await all<{ id: string; filename: string; rows: number | string; changes: number | string; applied_by: string; applied_at: string; undone_at: string | null }>(
    "SELECT id, filename, rows, changes, applied_by, applied_at, undone_at FROM org_update_batches WHERE tenant_id = ? ORDER BY applied_at DESC LIMIT 30", tenantId,
  )).map((r) => ({ id: r.id, filename: r.filename, rows: Number(r.rows), changes: Number(r.changes), by: r.applied_by, at: r.applied_at, undoneAt: r.undone_at }));
}
