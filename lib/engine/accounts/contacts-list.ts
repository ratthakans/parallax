import { all, get } from "@/lib/engine/sql";
import { findCustomersByContact } from "@/lib/engine/contacts";
import { MASKED_PERSON, type Viewer } from "@/lib/engine/accounts";
import { canSee } from "@/lib/shared/accounts";
import type { Classification } from "@/lib/shared/vault";

/* ── รายการผู้ติดต่อของบัญชี B2B (docs/ux-plan.md U3) ─────────────────────

   คอลัมน์แบบ CRM: ชื่อ · ตำแหน่ง · บริษัทปัจจุบัน · ช่องทาง · ติดต่อล่าสุด · ป้ายห้ามติดต่อ
   (หน้ารายชื่อเดิมเป็นของยุคค้าปลีก: ยอดซื้อ · ซื้อซ้ำ ซึ่งเป็นศูนย์ทั้งหมดในบัญชี B2B)
   ค้นชื่อบางส่วน หรืออีเมล/เบอร์ครบ (HMAC — ไม่ถอดรหัสใคร) · คนระดับเกินสิทธิ์ขึ้นเป็นชื่อปิดบังและไม่มีลิงก์ */

export const CONTACT_VIEWS = ["all", "employed", "no_org", "buyers", "email", "phone", "stopped", "touched"] as const;
export type ContactView = (typeof CONTACT_VIEWS)[number];
export const CONTACT_SORTS = ["name", "org", "last", "recent", "spent"] as const;
export type ContactSort = (typeof CONTACT_SORTS)[number];

export type ContactRow = {
  id: string; name: string; visible: boolean; title: string | null; org: string | null; orgId: string | null;
  kinds: string[]; lastAt: string | null; stopped: boolean; createdAt: string;
  /** ยอดซื้อ — มีเฉพาะเมื่อขอ purchases (บัญชีที่มีลูกค้าบุคคล · docs/crm-plan.md F2) · คนเกินสิทธิ์ = null */
  orders?: number | null; spent?: number | null;
};

const CUR = `(SELECT a.org_id FROM affiliations a WHERE a.tenant_id = c.tenant_id AND a.customer_id = c.id AND a.valid_to IS NULL ORDER BY COALESCE(a.valid_from, '') DESC LIMIT 1)`;
/* หยุดแล้ว = ความต้องการล่าสุดของคนนี้เป็นถอน/คัดค้าน/ขอจำกัด (ยินยอมใหม่หลังจากนั้น = ไม่หยุด) */
const STOPPED = `(SELECT f.kind FROM preferences f WHERE f.tenant_id = c.tenant_id AND f.customer_id = c.id ORDER BY f.effective_at DESC, f.recorded_at DESC LIMIT 1) IN ('withdrawal', 'objection', 'restriction')`;
const LAST = `(SELECT MAX(i.occurred_at) FROM interactions i WHERE i.tenant_id = c.tenant_id AND i.customer_id = c.id)`;

const VIEW_SQL: Record<ContactView, string> = {
  all: "",
  employed: `${CUR} IS NOT NULL`,
  no_org: `${CUR} IS NULL`,
  email: "EXISTS (SELECT 1 FROM contact_points p WHERE p.tenant_id = c.tenant_id AND p.customer_id = c.id AND p.kind = 'email')",
  phone: "EXISTS (SELECT 1 FROM contact_points p WHERE p.tenant_id = c.tenant_id AND p.customer_id = c.id AND p.kind = 'phone')",
  stopped: STOPPED,
  touched: `${LAST} IS NOT NULL`,
  buyers: "EXISTS (SELECT 1 FROM transactions t WHERE t.tenant_id = c.tenant_id AND t.customer_id = c.id)",
};
const SORT_SQL: Record<ContactSort, string> = {
  name: "c.name", org: "COALESCE(org_name, '~')", last: "COALESCE(last_at, '')", recent: "c.created_at", spent: "COALESCE(spent, 0)",
};
const ORDERS = "(SELECT COUNT(*) FROM transactions t WHERE t.tenant_id = c.tenant_id AND t.customer_id = c.id)";
const SPENT = "(SELECT SUM(t.total) FROM transactions t WHERE t.tenant_id = c.tenant_id AND t.customer_id = c.id)";

export async function listContacts(
  tenantId: string,
  opts: { q?: string; view?: ContactView; sort?: ContactSort; dir?: "asc" | "desc"; page?: number; pageSize?: number; purchases?: boolean },
  viewer: Viewer,
): Promise<{ rows: ContactRow[]; total: number; page: number; pages: number }> {
  const size = Math.min(100, Math.max(10, opts.pageSize ?? 50));
  const where: string[] = ["c.tenant_id = ?"];
  const params: (string | number)[] = [tenantId];
  const q = opts.q?.trim().slice(0, 120) ?? "";
  if (q) {
    /* อีเมล/เบอร์ครบ → หาด้วย HMAC · ไม่อย่างนั้นค้นชื่อบางส่วน */
    const byContact = [
      ...(q.includes("@") ? await findCustomersByContact(tenantId, "email", q) : []),
      ...(/\d{6,}/.test(q.replace(/\D/g, "")) ? await findCustomersByContact(tenantId, "phone", q) : []),
    ];
    if (byContact.length) { where.push(`c.id IN (${byContact.map(() => "?").join(",")})`); params.push(...byContact); }
    else { where.push("c.name LIKE ?"); params.push(`%${q}%`); }
  }
  const view = opts.view && opts.view in VIEW_SQL ? opts.view : "all";
  if (VIEW_SQL[view]) where.push(VIEW_SQL[view]);
  const W = where.join(" AND ");
  const total = Number((await get<{ n: number | string }>(`SELECT COUNT(*) AS n FROM customers c WHERE ${W}`, ...params))?.n ?? 0);
  const pages = Math.max(1, Math.ceil(total / size));
  const page = Math.min(pages, Math.max(1, opts.page ?? 1));
  /* ยอดซื้อคำนวณเฉพาะเมื่อขอ — บัญชี B2B ล้วนไม่จ่ายค่า subquery ต่อแถว */
  const buy = opts.purchases === true;
  const sort = opts.sort && opts.sort in SORT_SQL && (opts.sort !== "spent" || buy) ? opts.sort : "name";
  const dir = opts.dir === "desc" ? "DESC" : opts.dir === "asc" ? "ASC" : sort === "last" || sort === "recent" || sort === "spent" ? "DESC" : "ASC";
  const rows = await all<{ id: string; name: string; classification: string | null; created_at: string; org_id: string | null; org_name: string | null;
    org_class: string | null; org_owner: string | null; title: string | null; last_at: string | null; stopped: number | string | boolean;
    orders?: number | string | null; spent?: number | string | null }>(
    `SELECT * FROM (
       SELECT c.id, c.name, c.classification, c.created_at, ${CUR} AS org_id, ${LAST} AS last_at,
         CASE WHEN ${STOPPED} THEN 1 ELSE 0 END AS stopped,${buy ? ` ${ORDERS} AS orders, ${SPENT} AS spent,` : ""}
         (SELECT o.name FROM orgs o WHERE o.tenant_id = c.tenant_id AND o.id = ${CUR}) AS org_name,
         (SELECT o.classification FROM orgs o WHERE o.tenant_id = c.tenant_id AND o.id = ${CUR}) AS org_class,
         (SELECT o.account_owner_id FROM orgs o WHERE o.tenant_id = c.tenant_id AND o.id = ${CUR}) AS org_owner,
         (SELECT a.title FROM affiliations a WHERE a.tenant_id = c.tenant_id AND a.customer_id = c.id AND a.valid_to IS NULL ORDER BY COALESCE(a.valid_from, '') DESC LIMIT 1) AS title
       FROM customers c WHERE ${W}
     ) c ORDER BY ${SORT_SQL[sort]} ${dir}, c.name ASC, c.id ASC LIMIT ? OFFSET ?`,
    ...params, size, (page - 1) * size);
  const ids = rows.map((r) => r.id);
  const kinds = ids.length
    ? await all<{ customer_id: string; kind: string }>(
      `SELECT DISTINCT customer_id, kind FROM contact_points WHERE tenant_id = ? AND customer_id IN (${ids.map(() => "?").join(",")})`, tenantId, ...ids)
    : [];
  const kindOf = new Map<string, string[]>();
  for (const k of kinds) kindOf.set(k.customer_id, [...(kindOf.get(k.customer_id) ?? []), k.kind]);
  const lv = (c: string | null) => (c ?? "confidential") as Classification;
  return {
    total, page, pages,
    rows: rows.map((r) => {
      const visible = canSee(viewer.clearance, lv(r.classification));
      const orgVisible = r.org_id != null && (canSee(viewer.clearance, lv(r.org_class)) || r.org_owner === viewer.id);
      return {
        id: r.id, name: visible ? r.name : MASKED_PERSON, visible, title: visible ? r.title : null,
        org: r.org_id ? (orgVisible ? r.org_name : "บริษัทที่จำกัดการเข้าถึง") : null, orgId: orgVisible ? r.org_id : null,
        kinds: (kindOf.get(r.id) ?? []).sort(), lastAt: r.last_at, stopped: Boolean(Number(r.stopped)), createdAt: r.created_at,
        ...(buy ? { orders: visible ? Number(r.orders ?? 0) : null, spent: visible ? Number(r.spent ?? 0) : null } : {}),
      };
    }),
  };
}
