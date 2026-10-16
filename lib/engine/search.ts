import { all } from "@/lib/engine/sql";
import { searchCustomers } from "@/lib/engine/customers";
import { listAccounts, MASKED_PERSON, type Viewer } from "@/lib/engine/accounts";
import { canSee } from "@/lib/shared/accounts";
import type { Classification } from "@/lib/shared/vault";

/* ── ค้นหารวมจากแถบบน (docs/ux-plan.md U1) ─────────────────────────────

   ช่องเดียวค้นได้ทุกชนิดข้อมูล แบบ global search ของ Salesforce:
     บริษัท   ชื่อ/ชื่ออังกฤษ/โดเมน บางส่วน (listAccounts — กรองระดับความลับแล้ว ไม่เผยบริษัทที่เกินสิทธิ์)
     ผู้ติดต่อ  ชื่อบางส่วน · อีเมล/เบอร์ต้องครบ (searchCustomers — หาด้วย HMAC ไม่ถอดรหัสใคร)
              คนที่ระดับเกินสิทธิ์ขึ้นเป็นชื่อปิดบังและไม่มีลิงก์ (แบบเดียวกับหน้า "วันนี้")
     แคมเปญ   ชื่อบางส่วน
   ไม่บันทึกคำค้น — อาจเป็นเบอร์หรือชื่อคน */

export type SearchResults = {
  orgs: { id: string; name: string; domain: string | null; people: number }[];
  people: { id: string; name: string; visible: boolean; org: string | null; title: string | null }[];
  campaigns: { id: string; name: string; status: string }[];
};

const LIMIT = 10;

export async function searchEverything(tenantId: string, q: string, viewer: Viewer): Promise<SearchResults> {
  const term = q.trim().slice(0, 120);
  if (term.length < 2) return { orgs: [], people: [], campaigns: [] };
  const [orgs, people, campaigns] = await Promise.all([
    listAccounts(tenantId, { q: term, limit: LIMIT, viewer }),
    searchCustomers(tenantId, { q: term, sort: "name" }),
    all<{ id: string; name: string; status: string }>(
      "SELECT id, name, status FROM sales_campaigns WHERE tenant_id = ? AND name LIKE ? ORDER BY updated_at DESC LIMIT ?",
      tenantId, `%${term}%`, LIMIT),
  ]);
  const found = people.rows.slice(0, LIMIT);
  const ids = found.map((p) => p.id);
  const marks = ids.map(() => "?").join(",");
  const [levels, jobs] = ids.length
    ? await Promise.all([
      all<{ id: string; classification: string | null }>(`SELECT id, classification FROM customers WHERE tenant_id = ? AND id IN (${marks})`, tenantId, ...ids),
      all<{ customer_id: string; org: string; title: string | null; classification: string | null }>(
        `SELECT a.customer_id, o.name AS org, a.title, o.classification FROM affiliations a
         JOIN orgs o ON o.id = a.org_id AND o.tenant_id = a.tenant_id
         WHERE a.tenant_id = ? AND a.valid_to IS NULL AND a.customer_id IN (${marks})`, tenantId, ...ids),
    ])
    : [[], []];
  const level = new Map(levels.map((l) => [l.id, (l.classification ?? "confidential") as Classification]));
  const job = new Map<string, { org: string; title: string | null }>();
  for (const j of jobs) {
    if (!job.has(j.customer_id) && canSee(viewer.clearance, (j.classification ?? "confidential") as Classification)) {
      job.set(j.customer_id, { org: j.org, title: j.title });
    }
  }
  return {
    orgs: orgs.rows.map((o) => ({ id: o.id, name: o.name, domain: o.domain, people: o.current })),
    people: found.map((p) => {
      const visible = canSee(viewer.clearance, level.get(p.id) ?? "confidential");
      const j = visible ? job.get(p.id) : undefined;
      return { id: p.id, name: visible ? p.name : MASKED_PERSON, visible, org: j?.org ?? null, title: j?.title ?? null };
    }),
    campaigns,
  };
}
