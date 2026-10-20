import { randomUUID } from "node:crypto";
import { all, get, tx } from "@/lib/engine/sql";
import { logActivity } from "@/lib/engine/db";
import { recheckTargetsFor } from "@/lib/engine/campaigns";
import { personIdsOf } from "@/lib/engine/vault/merge";
import { CHANNELS } from "@/lib/shared/policy";
import { PREFERENCE_KINDS, type PreferenceKind } from "@/lib/shared/vault";
import { mirrorToLegacy } from "@/lib/engine/policy/marketing";

/* ── ความต้องการของเจ้าของข้อมูล (Blueprint บท 5) ─────────────────

   เพิ่มอย่างเดียว: ความยินยอม · ถอน · คัดค้าน · ขอจำกัด ต่อวัตถุประสงค์และช่องทาง พร้อมหลักฐานเสมอ
   ถอน/คัดค้าน/ขอจำกัด มีผลทันที: เป้าหมายแคมเปญที่ยังไม่จบถูกตรวจซ้ำ และงานที่ค้างถูกยกเลิกในคำขอเดียวกัน
   (ระบบยังไม่มี connector ภายนอก — เมื่อมี ต้องกระจายการถอนไปที่นั่นจากจุดนี้) */

export async function recordPreference(
  tenantId: string, customerId: string,
  input: { kind: string; purposeId?: string | null; channel?: string; evidence: string; effectiveAt?: string },
  actor: string,
): Promise<{ ok: true; cancelled: number } | { ok: false; error: string }> {
  if (!(PREFERENCE_KINDS as readonly string[]).includes(input.kind)) return { ok: false, error: "เลือกชนิด: ยินยอม · ถอน · คัดค้าน · ขอจำกัด" };
  const kind = input.kind as PreferenceKind;
  if (!(await get("SELECT 1 AS x FROM customers WHERE tenant_id = ? AND id = ?", tenantId, customerId))) return { ok: false, error: "ไม่พบบุคคลนี้" };
  const purpose = input.purposeId || null;
  if (purpose && !(await get("SELECT 1 AS x FROM purposes WHERE tenant_id = ? AND id = ?", tenantId, purpose))) return { ok: false, error: "ไม่พบวัตถุประสงค์นี้" };
  /* ความยินยอมต้องผูกวัตถุประสงค์เสมอ — "ยินยอมทุกอย่าง" ไม่ใช่ความยินยอมที่ใช้ได้ */
  if (kind === "consent" && !purpose) return { ok: false, error: "ความยินยอมต้องระบุวัตถุประสงค์" };
  const channel = input.channel && input.channel !== "any" ? input.channel : "any";
  if (channel !== "any" && !(CHANNELS as readonly string[]).includes(channel)) return { ok: false, error: "ช่องทางไม่ถูกต้อง" };
  const note = input.evidence?.trim().slice(0, 500) ?? "";
  if (note.length < 5) return { ok: false, error: "บอกหลักฐาน: รับแจ้งทางไหน เมื่อไร (เช่น อีเมลตอบกลับ 3 พ.ย.)" };
  const at = new Date().toISOString();
  const effective = input.effectiveAt && /^\d{4}-\d{2}-\d{2}/.test(input.effectiveAt) ? input.effectiveAt : at;
  const evidenceId = randomUUID();
  await tx(async (q) => {
    await q.run("INSERT INTO evidence (id, tenant_id, kind, ref, note, captured_by, captured_at) VALUES (?,?,?,?,?,?,?)",
      evidenceId, tenantId, "statement", `preference:${customerId}`, note, actor, at);
    await q.run(
      "INSERT INTO preferences (id, tenant_id, customer_id, purpose_id, channel, kind, effective_at, evidence_id, recorded_by, recorded_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
      randomUUID(), tenantId, customerId, purpose, channel, kind, effective, evidenceId, actor, at);
  });
  await logActivity(tenantId, actor, `preference_${kind}`, customerId);
  /* สำเนาให้ระบบรับข่าวสารเดิม (G2) — ถอน/คัดค้านจากทางนี้ หยุดการส่งแบบเดิมด้วย */
  await mirrorToLegacy(tenantId, customerId, kind, purpose, effective);
  const { cancelled } = await recheckTargetsFor(tenantId, customerId, actor);
  return { ok: true, cancelled };
}

export async function preferencesOf(tenantId: string, customerId: string) {
  const ids = await personIdsOf(tenantId, customerId);
  return all<{ kind: PreferenceKind; purpose: string | null; channel: string; effective_at: string; recorded_by: string; note: string | null }>(
    `SELECT f.kind, p.name AS purpose, f.channel, f.effective_at, f.recorded_by, e.note FROM preferences f
     LEFT JOIN purposes p ON p.id = f.purpose_id AND p.tenant_id = f.tenant_id
     LEFT JOIN evidence e ON e.id = f.evidence_id AND e.tenant_id = f.tenant_id
     WHERE f.tenant_id = ? AND f.customer_id IN (${ids.map(() => "?").join(",")}) ORDER BY f.effective_at DESC, f.recorded_at DESC`,
    tenantId, ...ids);
}
