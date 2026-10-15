import { randomUUID } from "node:crypto";
import { all, run, type Sql } from "@/lib/engine/sql";
import { matchKey, normaliseContact } from "@/lib/engine/pii";

/* ── ทะเบียนการลบ (docs/plan.md หัวข้อ 7.5 · B6) ─────────────────────────────

   ลบคนแล้วต้องไม่กลับมา — จากสามทาง:
   1. นำเข้าไฟล์เก่าที่มีคนนั้นอีกครั้ง → แถวที่ตรงถูกพัก (suspended) และไม่เก็บค่าในแถวเลย
   2. แถวที่ยังรอตรวจตัวตนในไฟล์อื่น (ยังไม่ผูกกับคน จึงไม่ถูกลบไปพร้อมคน) → รอบตรวจตัวตนถัดไปพักแถวนั้นแทนที่จะสร้างคนใหม่
   3. กู้คืน backup ที่ทำก่อนการลบ → ส่งออกทะเบียนก่อนกู้ แล้วใช้ซ้ำหลังกู้ (reapplyErasures) ลบคนที่กลับมา

   ทะเบียนเก็บเฉพาะ HMAC ของอีเมลและเบอร์ (กุญแจผูกบัญชี ถอดกลับไม่ได้) เหตุผล เวลา และผู้ลบ — ไม่มีชื่อ
   HMAC ยังเป็นข้อมูลส่วนบุคคล แต่เป็นข้อมูลขั้นต่ำที่ต้องมีเพื่อทำตามคำขอให้ลบได้จริง (plan 7.5) · ตารางเพิ่มอย่างเดียว */

export type ErasureReason = "request" | "retention" | "manual" | "reapply";
export const ERASURE_REASON_TH: Record<ErasureReason, string> = {
  request: "ตามคำขอของเจ้าของข้อมูล", retention: "ครบอายุข้อมูล", manual: "ผู้ใช้ลบ", reapply: "ลบซ้ำหลังกู้คืน",
};

export type ErasureEntry = { id: string; keys: string[]; reason: ErasureReason; requestRef: string | null; deletedBy: string; deletedAt: string };

/** กุญแจของแถว/ค่าติดต่อ — อีเมลและเบอร์ที่จัดรูปแล้ว เป็น HMAC เดียวกับ contact_points.value_hmac */
export function contactKeys(tenantId: string, v: { email?: string; phone?: string; phone_alt?: string }): string[] {
  const out: string[] = [];
  const e = normaliseContact("email", v.email ?? "");
  if (e) out.push(matchKey(tenantId, "email", e));
  for (const p of [v.phone, v.phone_alt]) {
    const n = normaliseContact("phone", p ?? "");
    if (n) out.push(matchKey(tenantId, "phone", n));
  }
  return out;
}

/** กุญแจที่ถูกลบ → เหตุผลและเวลาล่าสุด */
export async function erasedKeys(tenantId: string, q?: Sql): Promise<Map<string, { reason: ErasureReason; at: string }>> {
  const sql = "SELECT keys, reason, deleted_at FROM deletion_registry WHERE tenant_id = ? ORDER BY deleted_at";
  const rows = q ? await q.all<{ keys: string; reason: ErasureReason; deleted_at: string }>(sql, tenantId)
    : await all<{ keys: string; reason: ErasureReason; deleted_at: string }>(sql, tenantId);
  const out = new Map<string, { reason: ErasureReason; at: string }>();
  for (const r of rows) for (const k of JSON.parse(r.keys) as string[]) out.set(k, { reason: r.reason, at: r.deleted_at });
  return out;
}

/** ข้อความเหตุผลของแถวที่ถูกพักเพราะตรงกับคนที่ถูกลบ — ไม่มีชื่อหรือค่าติดต่อ */
export const erasedReason = (hit: { reason: ErasureReason; at: string }) =>
  `ตรงกับบุคคลที่ถูกลบ (${ERASURE_REASON_TH[hit.reason]} ${hit.at.slice(0, 10)}) — ไม่นำเข้าซ้ำและไม่เก็บค่าในแถวนี้`;

/** บันทึกการลบ — เรียกในธุรกรรมเดียวกับการลบ ก่อนที่ช่องทางติดต่อจะหายไป · ids = คนนั้นและทุกรหัสที่ถูกรวมเข้ามา */
export async function recordErasure(
  q: Sql, tenantId: string, ids: string[], reason: ErasureReason, actor: string, requestRef: string | null = null,
): Promise<number> {
  if (!ids.length) return 0;
  const points = await q.all<{ value_hmac: string; kind: string }>(
    `SELECT value_hmac, kind FROM contact_points WHERE tenant_id = ? AND kind IN ('email', 'phone') AND customer_id IN (${ids.map(() => "?").join(",")})`,
    tenantId, ...ids);
  const keys = [...new Set(points.map((p) => p.value_hmac))];
  if (!keys.length) return 0; // ไม่มีอีเมล/เบอร์ = ไม่มีอะไรให้จับได้ตอนนำเข้า (คนที่มีแค่ชื่อ)
  await q.run(
    "INSERT INTO deletion_registry (id, tenant_id, keys, reason, request_ref, deleted_by, deleted_at) VALUES (?,?,?,?,?,?,?)",
    randomUUID(), tenantId, JSON.stringify(keys), reason, requestRef?.slice(0, 120) ?? null, actor, new Date().toISOString());
  return keys.length;
}

/** ส่งออกทะเบียน — เก็บไว้นอก backup ก่อนกู้คืน (docs/runbooks: กู้คืนฐานข้อมูล) */
export async function exportErasures(tenantId: string): Promise<ErasureEntry[]> {
  const rows = await all<{ id: string; keys: string; reason: ErasureReason; request_ref: string | null; deleted_by: string; deleted_at: string }>(
    "SELECT id, keys, reason, request_ref, deleted_by, deleted_at FROM deletion_registry WHERE tenant_id = ? ORDER BY deleted_at", tenantId);
  return rows.map((r) => ({ id: r.id, keys: JSON.parse(r.keys), reason: r.reason, requestRef: r.request_ref, deletedBy: r.deleted_by, deletedAt: r.deleted_at }));
}

/** ใช้ทะเบียนซ้ำหลังกู้คืน — ใส่ทะเบียนที่ส่งออกไว้กลับ (ถ้ายังไม่มี) แล้วลบทุกคนที่มีอีเมล/เบอร์ตรงกับที่เคยลบ
    คืนจำนวนคนที่ถูกลบซ้ำ · ลบผ่าน deleteCustomer ตัวเดียวกับหน้าจอ (ทุกตารางที่ข้อมูลของคนอยู่) */
export async function reapplyErasures(tenantId: string, entries: ErasureEntry[] | null, actor: string): Promise<{ restoredEntries: number; erased: number }> {
  let restoredEntries = 0;
  if (entries) {
    const have = new Set((await exportErasures(tenantId)).map((e) => e.id));
    for (const e of entries.filter((x) => !have.has(x.id))) {
      await run("INSERT INTO deletion_registry (id, tenant_id, keys, reason, request_ref, deleted_by, deleted_at) VALUES (?,?,?,?,?,?,?)",
        e.id, tenantId, JSON.stringify(e.keys), e.reason, e.requestRef, e.deletedBy, e.deletedAt);
      restoredEntries++;
    }
  }
  const keys = [...(await erasedKeys(tenantId)).keys()];
  const hit = new Set<string>();
  for (let i = 0; i < keys.length; i += 400) {
    const chunk = keys.slice(i, i + 400);
    for (const r of await all<{ customer_id: string }>(
      `SELECT DISTINCT customer_id FROM contact_points WHERE tenant_id = ? AND value_hmac IN (${chunk.map(() => "?").join(",")})`, tenantId, ...chunk)) {
      hit.add(r.customer_id);
    }
  }
  const { deleteCustomer } = await import("@/lib/engine/customers"); // customers นำเข้าไฟล์นี้ — import ตอนเรียกกันวงวน
  let erased = 0;
  for (const id of hit) if ((await deleteCustomer(tenantId, id, actor, { reason: "reapply" })).ok) erased++;
  /* แถวที่รอตรวจตัวตนซึ่งตรงกับคนที่ถูกลบ ถูกพักในรอบตรวจตัวตนถัดไป (resolve.ts) */
  return { restoredEntries, erased };
}
