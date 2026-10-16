import { all } from "@/lib/engine/sql";
import { canSee } from "@/lib/shared/accounts";
import type { Classification } from "@/lib/shared/vault";
import type { Viewer } from "@/lib/engine/accounts";

/* ── มิติ "งาน/ปี" (docs/crm-plan.md C4) ─────────────────────────────────

   จากการร่วมงาน (participations: งาน · ครั้ง/ปี · บทบาท) ที่นำเข้าจากไฟล์อยู่แล้ว
     ต่อบริษัท   มาร่วมงานไหน ปีไหน ในบทบาทอะไร
     ต่องาน     แต่ละครั้งมีกี่บริษัท · กลับมาจากครั้งก่อนกี่ราย · ใหม่กี่ราย · หลุดไปกี่ราย
   นับระดับบริษัท ไม่ใช่ระดับคน — ผู้จัดงานขายสปอนเซอร์ให้บริษัท · บริษัทที่เกินสิทธิ์ไม่ถูกนับ */

const sortEd = (a: string, b: string) => a.localeCompare(b, "th", { numeric: true });

export async function orgEditions(tenantId: string, orgId: string): Promise<{ program: string; editions: { edition: string; roles: string[]; people: number }[] }[]> {
  const rows = await all<{ program: string; edition: string | null; role: string; n: number | string }>(
    `SELECT program, edition, role, COUNT(DISTINCT customer_id) AS n FROM participations WHERE tenant_id = ? AND org_id = ?
     GROUP BY program, edition, role`, tenantId, orgId);
  const by = new Map<string, Map<string, { roles: Set<string>; people: number }>>();
  for (const r of rows) {
    const ed = r.edition ?? "ไม่ระบุครั้ง";
    const p = by.get(r.program) ?? new Map();
    const e = p.get(ed) ?? { roles: new Set<string>(), people: 0 };
    e.roles.add(r.role); e.people += Number(r.n);
    p.set(ed, e); by.set(r.program, p);
  }
  return [...by].map(([program, eds]) => ({
    program,
    editions: [...eds].sort((a, b) => sortEd(a[0], b[0])).map(([edition, e]) => ({ edition, roles: [...e.roles], people: e.people })),
  })).sort((a, b) => a.program.localeCompare(b.program, "th"));
}

export type EditionRow = { edition: string; orgs: number; returning: number; fresh: number; lapsed: number };

/** การกลับมาของบริษัทต่องาน — role กรองเฉพาะบทบาท (เช่น สปอนเซอร์) ได้ */
export async function editionRetention(tenantId: string, viewer: Viewer, role?: string): Promise<{ program: string; rows: EditionRow[] }[]> {
  const rows = await all<{ program: string; edition: string; org_id: string; classification: string | null; owner: string | null; data_owner: string | null }>(
    `SELECT DISTINCT p.program, p.edition, p.org_id, o.classification, o.account_owner_id AS owner, o.data_owner_id AS data_owner
     FROM participations p JOIN orgs o ON o.id = p.org_id AND o.tenant_id = p.tenant_id
     WHERE p.tenant_id = ? AND p.edition IS NOT NULL AND p.org_id IS NOT NULL${role ? " AND p.role = ?" : ""}`, tenantId, ...(role ? [role] : []));
  const by = new Map<string, Map<string, Set<string>>>();
  for (const r of rows) {
    if (!canSee(viewer.clearance, (r.classification ?? "confidential") as Classification) && ![r.owner, r.data_owner].includes(viewer.id)) continue;
    const p = by.get(r.program) ?? new Map<string, Set<string>>();
    p.set(r.edition, (p.get(r.edition) ?? new Set()).add(r.org_id));
    by.set(r.program, p);
  }
  return [...by].map(([program, eds]) => {
    const order = [...eds.keys()].sort(sortEd);
    return {
      program,
      rows: order.map((ed, i) => {
        const now = eds.get(ed)!, prev = i ? eds.get(order[i - 1])! : null;
        const returning = prev ? [...now].filter((o) => prev.has(o)).length : 0;
        return { edition: ed, orgs: now.size, returning, fresh: now.size - returning, lapsed: prev ? [...prev].filter((o) => !now.has(o)).length : 0 };
      }),
    };
  }).sort((a, b) => b.rows.length - a.rows.length || a.program.localeCompare(b.program, "th"));
}

/** บทบาทที่มีในข้อมูล (ตัวกรองของรายงาน) */
export async function participationRoles(tenantId: string): Promise<string[]> {
  return (await all<{ role: string }>("SELECT DISTINCT role FROM participations WHERE tenant_id = ? ORDER BY role", tenantId)).map((r) => r.role);
}
