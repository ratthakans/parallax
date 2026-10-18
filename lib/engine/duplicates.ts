import { all } from "@/lib/engine/sql";
import { canSee } from "@/lib/shared/accounts";
import { compareNames, emailInfo, nameInfo, orgInfo } from "@/lib/shared/identity";
import { normaliseContact } from "@/lib/engine/pii";
import type { Classification } from "@/lib/shared/vault";
import type { Viewer } from "@/lib/engine/accounts";

/* ── กันข้อมูลซ้ำตั้งแต่ตอนกรอก (docs/crm-plan.md รอบสอง) ─────────────────────

   เสนอ "อาจเป็นรายเดิม" — ไม่ตัดสินเอง และไม่รวมเอง (การรวมยังเป็นการกระทำของคน ย้อนได้)
     บริษัท  เลขนิติบุคคลเดียวกัน · โดเมนเดียวกัน · กุญแจชื่อตรงกัน หรือชื่อหนึ่งอยู่ในอีกชื่อ (≥ 4 ตัวอักษร)
     คน     ชื่อเดียวกันในบริษัทเดียวกัน (อีเมล/เบอร์ซ้ำ ระบบปฏิเสธอยู่แล้วตอนสร้าง)
   เห็นเฉพาะระเบียนที่ผู้อ่านเห็นได้ */

export type OrgMatch = { id: string; name: string; why: string };

export async function similarOrgs(tenantId: string, input: { orgId?: string; name?: string; email?: string }, viewer: Viewer): Promise<OrgMatch[]> {
  let name = input.name ?? "", taxId: string | null = null, domains: string[] = [];
  if (input.orgId) {
    const o = (await all<{ name: string; tax_id: string | null }>("SELECT name, tax_id FROM orgs WHERE tenant_id = ? AND id = ?", tenantId, input.orgId))[0];
    if (!o) return [];
    name = o.name; taxId = o.tax_id;
    domains = (await all<{ domain: string }>("SELECT domain FROM org_domains WHERE tenant_id = ? AND org_id = ?", tenantId, input.orgId)).map((d) => d.domain);
  }
  const e = emailInfo(normaliseContact("email", input.email ?? ""));
  if (e && !e.free) domains.push(e.domain);
  const key = orgInfo(name).key.replace(/^\w+:/, "");
  const rows = await all<{ id: string; name: string; name_norm: string; tax_id: string | null; classification: string | null; account_owner_id: string | null; data_owner_id: string | null }>(
    "SELECT id, name, name_norm, tax_id, classification, account_owner_id, data_owner_id FROM orgs WHERE tenant_id = ?", tenantId);
  const domainOrgs = domains.length
    ? new Set((await all<{ org_id: string }>(`SELECT org_id FROM org_domains WHERE tenant_id = ? AND domain IN (${domains.map(() => "?").join(",")})`, tenantId, ...domains)).map((d) => d.org_id))
    : new Set<string>();
  const out: OrgMatch[] = [];
  for (const r of rows) {
    if (r.id === input.orgId) continue;
    if (!canSee(viewer.clearance, (r.classification ?? "confidential") as Classification) && ![r.account_owner_id, r.data_owner_id].includes(viewer.id)) continue;
    const rk = orgInfo(r.name).key.replace(/^\w+:/, "");
    const why = taxId && r.tax_id === taxId ? "เลขนิติบุคคลเดียวกัน"
      : domainOrgs.has(r.id) ? "โดเมนอีเมลเดียวกัน"
      : key && rk === key ? "ชื่อเดียวกันเมื่อตัดคำนิติบุคคล"
      : key.length >= 4 && rk.length >= 4 && (rk.includes(key) || key.includes(rk)) ? "ชื่อคล้ายกัน — ตรวจก่อน อาจเป็นคนละบริษัท"
      : null;
    if (why) out.push({ id: r.id, name: r.name, why });
  }
  const rank = (w: string) => ["เลขนิติบุคคลเดียวกัน", "โดเมนอีเมลเดียวกัน", "ชื่อเดียวกันเมื่อตัดคำนิติบุคคล", "ชื่อคล้ายกัน — ตรวจก่อน อาจเป็นคนละบริษัท"].indexOf(w);
  return out.sort((a, b) => rank(a.why) - rank(b.why) || a.name.localeCompare(b.name, "th")).slice(0, 8);
}

/** คนที่ชื่อเดียวกันและสังกัดบริษัทเดียวกัน (ปัจจุบันหรือเคย) */
export async function similarPeopleAt(tenantId: string, name: string, orgId: string, viewer: Viewer): Promise<{ id: string; name: string }[]> {
  const n = nameInfo(name);
  if (!n.tokens.length) return [];
  const rows = await all<{ id: string; name: string; classification: string | null }>(
    `SELECT DISTINCT c.id, c.name, c.classification FROM affiliations a JOIN customers c ON c.id = a.customer_id AND c.tenant_id = a.tenant_id
     WHERE a.tenant_id = ? AND a.org_id = ?`, tenantId, orgId);
  return rows
    .filter((r) => canSee(viewer.clearance, (r.classification ?? "confidential") as Classification) && compareNames(n, nameInfo(r.name)) === "same")
    .map((r) => ({ id: r.id, name: r.name }));
}
