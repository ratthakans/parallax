import { all } from "@/lib/engine/sql";

/* ── คนในทีมที่เลือกเป็นผู้รับผิดชอบได้ (docs/crm-plan.md C0 ข้อ 6) ──────────

   ไม่อ่าน auth.users (บน Postgres ผู้ใช้อ่านไม่ได้ และไม่ควรเห็นอีเมลของทุกบัญชี) — ใช้คนที่บัญชีนี้รู้จักอยู่แล้ว:
   เจ้าของบัญชีบริษัท · เจ้าของดีล · ผู้รับงาน · ผู้รับมอบหมายในแคมเปญ · และตัวผู้ใช้เอง
   ช่องยังพิมพ์ชื่อใหม่ได้ (คนที่ยังไม่เคยได้งาน) — รายการนี้เป็นตัวช่วยเลือก ไม่ใช่ด่าน */
export async function teamMembers(tenantId: string, me: string): Promise<string[]> {
  const rows = await all<{ who: string }>(
    `SELECT account_owner_id AS who FROM orgs WHERE tenant_id = ? AND account_owner_id IS NOT NULL
     UNION SELECT owner_id FROM opportunities WHERE tenant_id = ? AND owner_id IS NOT NULL
     UNION SELECT owner_id FROM tasks WHERE tenant_id = ? AND owner_id IS NOT NULL
     UNION SELECT assigned_to FROM campaign_targets WHERE tenant_id = ? AND assigned_to IS NOT NULL`,
    tenantId, tenantId, tenantId, tenantId);
  return [...new Set([me, ...rows.map((r) => r.who).filter(Boolean).sort()])];
}
