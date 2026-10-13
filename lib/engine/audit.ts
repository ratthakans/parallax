import { createHash } from "node:crypto";
import { all, get, run, tx } from "@/lib/engine/sql";

/* ── บันทึกตรวจสอบแบบต่อกันด้วย hash ───────────────────────────

   Blueprint 2.0 บท 8: audit ต้อง "จัดเก็บแยกโดยจำกัดการแก้ย้อนหลัง พร้อมวิธีตรวจความครบถ้วน"
   และ "หลีกเลี่ยงบันทึกค่าข้อมูลส่วนบุคคลเต็มใน log"

   - ผู้ใช้เพิ่มแถวได้ แต่แก้หรือลบไม่ได้ (นโยบาย RLS ใน 0007 มีแค่ select กับ insert)
   - แต่ละแถวเก็บ hash ของแถวก่อนหน้าในบัญชีเดียวกัน — แก้หรือลบแถวกลางสายจากนอกระบบ
     (เช่นผ่าน DATABASE_URL โดยตรง) จะทำให้ verifyAuditChain ชี้จุดที่ขาดได้
   - detail ต้องไม่มีค่า PII — ผู้เรียกส่งรหัสและจำนวน ไม่ส่งชื่อ เบอร์ หรืออีเมล */

export type AuditEntry = {
  tenantId: string;
  actor: string;
  action: string;
  targetKind?: string | null;
  targetId?: string | null;
  detail?: string | null;
};

const GENESIS = "genesis";

function hashOf(prev: string, at: string, e: AuditEntry): string {
  return createHash("sha256")
    .update([prev, e.tenantId, at, e.actor, e.action, e.targetKind ?? "", e.targetId ?? "", e.detail ?? ""].join("\u001f"))
    .digest("hex");
}

export async function appendAudit(e: AuditEntry): Promise<void> {
  await tx(async (q) => {
    const last = await q.get<{ hash: string }>(
      "SELECT hash FROM audit_log WHERE tenant_id = ? ORDER BY id DESC LIMIT 1",
      e.tenantId,
    );
    const prev = last?.hash ?? GENESIS;
    const at = new Date().toISOString();
    await q.run(
      `INSERT INTO audit_log (tenant_id, at, actor, action, target_kind, target_id, detail, prev_hash, hash)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      e.tenantId, at, e.actor, e.action, e.targetKind ?? null, e.targetId ?? null, e.detail ?? null,
      prev, hashOf(prev, at, e),
    );
  });
}

/** ตรวจว่าสายของบัญชีนี้ครบ — คืนตำแหน่งแรกที่ขาด หรือ null ถ้าครบ */
export async function verifyAuditChain(tenantId: string): Promise<{ ok: true; rows: number } | { ok: false; brokenAtId: number }> {
  const rows = await all<{
    id: number | string; at: string; actor: string; action: string;
    target_kind: string | null; target_id: string | null; detail: string | null; prev_hash: string | null; hash: string;
  }>(
    "SELECT id, at, actor, action, target_kind, target_id, detail, prev_hash, hash FROM audit_log WHERE tenant_id = ? ORDER BY id",
    tenantId,
  );
  let prev = GENESIS;
  for (const r of rows) {
    const expect = hashOf(prev, r.at, {
      tenantId, actor: r.actor, action: r.action, targetKind: r.target_kind, targetId: r.target_id, detail: r.detail,
    });
    if (r.prev_hash !== prev || r.hash !== expect) return { ok: false, brokenAtId: Number(r.id) };
    prev = r.hash;
  }
  return { ok: true, rows: rows.length };
}

/** จำนวนแถวของบัญชี — หน้าผู้ดูแลใช้แสดง */
export async function auditCount(tenantId: string): Promise<number> {
  const r = await get<{ n: number | string }>("SELECT COUNT(*) AS n FROM audit_log WHERE tenant_id = ?", tenantId);
  return Number(r?.n ?? 0);
}
