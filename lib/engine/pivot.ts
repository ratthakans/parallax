import { all } from "@/lib/engine/sql";
import { listDeals, type DealView } from "@/lib/engine/deals";
import { listFields, valuesFor, type CustomField } from "@/lib/engine/custom-fields";
import type { Viewer } from "@/lib/engine/accounts";
import { stageTh } from "@/lib/shared/deals";

/* ── รายงานแบบเลือกมิติเอง (docs/crm-plan.md C5) ─────────────────────────────

   ดีลที่ผู้อ่านเห็น (listDeals — ด่านเดียวกับหน้าดีล) × มิติแถว × มิติคอลัมน์ (ไม่บังคับ) → จำนวนดีลหรือมูลค่ารวม
   มิติ: ขั้น · เจ้าของ · บริษัท · อุตสาหกรรม · กลุ่มบริษัท (บนสุด) · เดือนปิดคาด · เดือนที่สร้าง · แพ็กเกจ · แคมเปญ
         · ฟิลด์ของบริษัท (cf.<id>) · ฟิลด์ของดีล (df.<id>)
   แพ็กเกจ: ดีลหนึ่งมีหลายแพ็กเกจได้ — นับดีลในทุกแพ็กเกจที่มี และมูลค่าใช้ยอดของแพ็กเกจนั้น (ผลรวมทั้งตารางจึงไม่ใช่ผลรวมดีล)
   ไม่มีสูตร ไม่มีคะแนน — นับและรวมอย่างเดียว */

export type Measure = "count" | "value";
export type PivotDim = { key: string; label: string };
export type Pivot = { rows: string[]; cols: string[]; cells: Map<string, number>; rowTotals: Map<string, number>; colTotals: Map<string, number>; total: number; deals: number };

const BASE_DIMS: PivotDim[] = [
  { key: "stage", label: "ขั้น" }, { key: "owner", label: "เจ้าของดีล" }, { key: "company", label: "บริษัท" },
  { key: "industry", label: "อุตสาหกรรม" }, { key: "group", label: "กลุ่มบริษัท" }, { key: "close_month", label: "เดือนปิดคาด" },
  { key: "created_month", label: "เดือนที่สร้าง" }, { key: "package", label: "แพ็กเกจ" }, { key: "campaign", label: "แคมเปญ" },
];

export async function pivotDims(tenantId: string): Promise<PivotDim[]> {
  const fields = await listFields(tenantId);
  return [...BASE_DIMS, ...fields.map((f) => ({ key: `${f.entity === "org" ? "cf" : "df"}.${f.id}`, label: `${f.label} (${f.entity === "org" ? "บริษัท" : "ดีล"})` }))];
}

const NONE = "— ไม่ระบุ —";
const month = (iso: string | null) => (iso ? iso.slice(0, 7) : NONE);

export async function pivot(
  tenantId: string, viewer: Viewer, opts: { rows: string; cols?: string; measure: Measure; view?: DealView },
): Promise<Pivot> {
  const deals = await listDeals(tenantId, { view: opts.view ?? "all", limit: 20000 }, viewer);
  const dims = [opts.rows, opts.cols].filter((d): d is string => Boolean(d));
  const need = (k: string) => dims.some((d) => d === k || d.startsWith(`${k}.`));
  const orgIds = [...new Set(deals.map((d) => d.orgId))], dealIds = deals.map((d) => d.id);
  const chunked = async <T,>(ids: string[], q: (marks: string) => string, extra: (string | number)[] = []) => {
    const out: T[] = [];
    for (let i = 0; i < ids.length; i += 500) {
      const c = ids.slice(i, i + 500);
      out.push(...await all<T>(q(c.map(() => "?").join(",")), tenantId, ...extra, ...c));
    }
    return out;
  };
  const orgInfo = new Map<string, { industry: string | null; parent: string | null; name: string }>();
  if (need("industry") || need("group")) {
    for (const o of await chunked<{ id: string; industry: string | null; parent_id: string | null; name: string }>(orgIds, (m) => `SELECT id, industry, parent_id, name FROM orgs WHERE tenant_id = ? AND id IN (${m})`)) {
      orgInfo.set(o.id, { industry: o.industry, parent: o.parent_id, name: o.name });
    }
  }
  /* กลุ่ม = ชื่อบริษัทบนสุดของสาย parent (อ่านบริษัทแม่ที่ยังไม่โหลดทีละชั้น · เพดาน 20 ชั้น) */
  const rootName = async (id: string): Promise<string> => {
    let cur = id;
    for (let i = 0; i < 20; i++) {
      const o = orgInfo.get(cur) ?? (await all<{ id: string; industry: string | null; parent_id: string | null; name: string }>(
        "SELECT id, industry, parent_id, name FROM orgs WHERE tenant_id = ? AND id = ?", tenantId, cur)).map((x) => ({ industry: x.industry, parent: x.parent_id, name: x.name }))[0];
      if (!o) break;
      orgInfo.set(cur, o);
      if (!o.parent) return o.name;
      cur = o.parent;
    }
    return orgInfo.get(cur)?.name ?? NONE;
  };
  const items = need("package")
    ? await chunked<{ opportunity_id: string; package: string; qty: number | string; unit_price: number | string | null }>(dealIds,
      (m) => `SELECT opportunity_id, package, qty, unit_price FROM deal_items WHERE tenant_id = ? AND opportunity_id IN (${m})`)
    : [];
  const itemsOf = new Map<string, { package: string; total: number }[]>();
  for (const it of items) itemsOf.set(it.opportunity_id, [...(itemsOf.get(it.opportunity_id) ?? []), { package: it.package, total: Number(it.qty) * Number(it.unit_price ?? 0) }]);
  const fields = await listFields(tenantId);
  const fieldOf = new Map<string, CustomField>(fields.map((f) => [f.id, f]));
  const orgVals = dims.some((d) => d.startsWith("cf.")) ? await valuesFor(tenantId, "org", orgIds) : new Map();
  const dealVals = dims.some((d) => d.startsWith("df.")) ? await valuesFor(tenantId, "deal", dealIds) : new Map();

  /* ค่าของมิติต่อดีล → [ค่า, น้ำหนักมูลค่า] (แพ็กเกจให้หลายค่า) */
  const valuesOf = async (dim: string, d: (typeof deals)[number]): Promise<[string, number][]> => {
    const v = d.value ?? 0;
    switch (dim) {
      case "stage": return [[stageTh(d.stage), v]];
      case "owner": return [[d.owner ?? NONE, v]];
      case "company": return [[d.org, v]];
      case "industry": return [[orgInfo.get(d.orgId)?.industry ?? NONE, v]];
      case "group": return [[await rootName(d.orgId), v]];
      case "close_month": return [[month(d.expectedClose), v]];
      case "created_month": return [[month(d.createdAt), v]];
      case "campaign": return [[d.campaign ?? NONE, v]];
      case "package": { const its = itemsOf.get(d.id); return its?.length ? its.map((i) => [i.package, i.total] as [string, number]) : [[NONE, v]]; }
    }
    const [kind, id] = dim.split(".");
    if ((kind === "cf" || kind === "df") && fieldOf.has(id)) {
      const raw = (kind === "cf" ? orgVals.get(d.orgId) : dealVals.get(d.id))?.get(id);
      return [[raw ?? NONE, v]];
    }
    return [[NONE, v]];
  };

  const cells = new Map<string, number>(), rowTotals = new Map<string, number>(), colTotals = new Map<string, number>();
  let total = 0;
  for (const d of deals) {
    const rs = await valuesOf(opts.rows, d);
    const cs = opts.cols ? await valuesOf(opts.cols, d) : [["", d.value ?? 0] as [string, number]];
    for (const [r, rw] of rs) for (const [c, cw] of cs) {
      /* มูลค่า: ถ้ามิติใดเป็นแพ็กเกจ ใช้ยอดของแพ็กเกจ · ไม่งั้นใช้มูลค่าดีล */
      const amt = opts.measure === "count" ? 1 : opts.rows === "package" ? rw : opts.cols === "package" ? cw : d.value ?? 0;
      const k = `${r}\u0000${c}`;
      cells.set(k, (cells.get(k) ?? 0) + amt);
      rowTotals.set(r, (rowTotals.get(r) ?? 0) + amt);
      colTotals.set(c, (colTotals.get(c) ?? 0) + amt);
      total += amt;
    }
  }
  /* เดือนเรียงตามเวลา · มิติอื่นเรียงจากมากไปน้อย · "ไม่ระบุ" ท้ายสุด */
  const order = (m: Map<string, number>, dim?: string) => [...m.keys()].sort((a, b) => (a === NONE ? 1 : b === NONE ? -1
    : dim?.endsWith("_month") ? a.localeCompare(b) : (m.get(b)! - m.get(a)!) || a.localeCompare(b, "th")));
  return { rows: order(rowTotals, opts.rows), cols: opts.cols ? order(colTotals, opts.cols) : [""], cells, rowTotals, colTotals, total, deals: deals.length };
}
