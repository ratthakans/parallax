import { randomUUID } from "node:crypto";
import { all, get, tx } from "@/lib/engine/sql";
import { logActivity } from "@/lib/engine/db";
import { PURPOSE_TEMPLATES, templateOf, type PurposeTemplate } from "@/lib/shared/purpose-templates";

/* ── เริ่มวัตถุประสงค์จากแม่แบบ (docs/solo-plan.md S4) ─────────────────────

   เลือกแม่แบบ = วัตถุประสงค์ + ฐานรุ่น 1 (พร้อมขอบเขตช่องทาง/ชนิดข้อความ/บริษัท) + กฎอายุข้อมูล ในธุรกรรมเดียว
   ล้มกลางทาง = ไม่มีอะไรถูกสร้าง · เลือกซ้ำ = ได้วัตถุประสงค์เดิม (ไม่สร้างซ้อน)
   ผู้ใช้ต้องพิมพ์ยืนยันข้อเท็จจริงของแม่แบบ (mustConfirm) — การยืนยันถูกเก็บเป็นหลักฐาน ไม่ใช่ checkbox ที่กดผ่าน
   วัตถุประสงค์ใหม่ไม่มีแคมเปญ จึงไม่ต้องตรวจเป้าหมายซ้ำ · แก้ฐานภายหลังผ่าน setBasis ตามปกติ (ขอบเขตตามรุ่นก่อน) */

export type TemplateRow = PurposeTemplate & { adopted: { purposeId: string; version: number } | null; newer: boolean };

export async function listTemplates(tenantId: string): Promise<TemplateRow[]> {
  const used = await all<{ id: string; template_code: string; template_version: number | string }>(
    "SELECT id, template_code, template_version FROM purposes WHERE tenant_id = ? AND template_code IS NOT NULL", tenantId);
  return PURPOSE_TEMPLATES.map((t) => {
    const u = used.find((x) => x.template_code === t.code);
    return { ...t, adopted: u ? { purposeId: u.id, version: Number(u.template_version) } : null, newer: Boolean(u && Number(u.template_version) < t.version) };
  });
}

export async function adoptTemplate(
  tenantId: string, code: string, confirmation: string, actor: string,
): Promise<{ ok: true; purposeId: string; existed: boolean } | { ok: false; error: string }> {
  const t = templateOf(code);
  if (!t) return { ok: false, error: "ไม่พบแม่แบบนี้" };
  const existing = await get<{ id: string }>("SELECT id FROM purposes WHERE tenant_id = ? AND template_code = ?", tenantId, t.code);
  if (existing) return { ok: true, purposeId: existing.id, existed: true };
  const confirmed = confirmation.trim().slice(0, 300);
  if (confirmed.length < 10) return { ok: false, error: `ยืนยันข้อเท็จจริงก่อนใช้แม่แบบ: ${t.mustConfirm}` };
  const purposeId = randomUUID(), at = new Date().toISOString();
  /* รหัสวัตถุประสงค์ = รหัสแม่แบบ — ถ้าบัญชีมีรหัสนี้อยู่แล้ว (สร้างเองด้วยชื่อเดียวกัน) ไม่ทับ ให้เติมท้าย */
  const taken = await get("SELECT 1 AS x FROM purposes WHERE tenant_id = ? AND code = ?", tenantId, t.code);
  const purposeCode = taken ? `${t.code}_${purposeId.slice(0, 6)}` : t.code;
  await tx(async (q) => {
    await q.run(
      "INSERT INTO purposes (id, tenant_id, code, name, description, created_at, template_code, template_version) VALUES (?,?,?,?,?,?,?,?)",
      purposeId, tenantId, purposeCode, t.name, t.description, at, t.code, t.version);
    await q.run(
      `INSERT INTO processing_records (id, tenant_id, purpose_id, lawful_basis, data_scope, approved_by, version, effective_from, effective_to, lia_ref, recorded_at,
         employer_scoped, allowed_channels, allowed_message_kinds)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      randomUUID(), tenantId, purposeId, t.lawfulBasis, `ยืนยันโดยผู้อนุมัติ: ${confirmed}`, actor, 1, at, null,
      t.lia ? `แม่แบบ ${t.code} รุ่น ${t.version}${t.draft ? " (ร่าง — รอนักกฎหมายตรวจ)" : ""}` : null, at,
      t.employerScoped ? 1 : 0, JSON.stringify(t.channels), JSON.stringify(t.messageKinds));
    await q.run(
      "INSERT INTO retention_rules (id, tenant_id, data_kind, trigger_event, period_days, review_owner_id, legal_hold, note, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
      randomUUID(), tenantId, `purpose:${purposeId}`, t.retention.trigger, t.retention.days, actor, 0, `${t.name} — ${t.retention.note}`, at);
  });
  await logActivity(tenantId, actor, "purpose_from_template", `${purposeId} · ${t.code} v${t.version}`);
  return { ok: true, purposeId, existed: false };
}
