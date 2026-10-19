import { randomUUID } from "node:crypto";
import { all, get, run } from "@/lib/engine/sql";
import { dealPartyAccess, type Viewer } from "@/lib/engine/accounts";
import { listDeals } from "@/lib/engine/deals";

/* ── แพ็กเกจในดีล (docs/crm-plan.md C4) ── ชื่อแพ็กเกจ · จำนวน · ราคาต่อหน่วย → รายงานแพ็กเกจไหนขายดี
   ชื่อแพ็กเกจเป็นข้อความ (ไม่มีแคตตาล็อกบังคับ) — ช่องกรอกแนะนำชื่อที่บัญชีเคยใช้ จึงรวมยอดได้โดยไม่ต้องตั้งค่า */

export type DealItem = { id: string; package: string; qty: number; unitPrice: number | null; total: number | null };
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/* คู่ค้าของดีล — บริษัท หรือลูกค้าบุคคล (F3) · ด่านเดียวกับการแก้ดีล */
async function dealParty(tenantId: string, dealId: string) {
  return (await get<{ org_id: string | null; customer_id: string | null }>("SELECT org_id, customer_id FROM opportunities WHERE tenant_id = ? AND id = ?", tenantId, dealId)) ?? null;
}

export async function listItems(tenantId: string, dealId: string): Promise<DealItem[]> {
  return (await all<{ id: string; package: string; qty: number | string; unit_price: number | string | null }>(
    "SELECT id, package, qty, unit_price FROM deal_items WHERE tenant_id = ? AND opportunity_id = ? ORDER BY created_at, id", tenantId, dealId,
  )).map((r) => {
    const qty = Number(r.qty), unit = r.unit_price == null ? null : Number(r.unit_price);
    return { id: r.id, package: r.package, qty, unitPrice: unit, total: unit == null ? null : qty * unit };
  });
}

export async function addItem(tenantId: string, dealId: string, input: { package: string; qty?: string; unitPrice?: string }, viewer: Viewer): Promise<Result> {
  const party = await dealParty(tenantId, dealId);
  if (!party) return { ok: false, error: "ไม่พบดีลนี้" };
  const access = await dealPartyAccess(tenantId, party, viewer);
  if (!access.ok) return access;
  const name = input.package.trim().slice(0, 120);
  if (name.length < 2) return { ok: false, error: "ใส่ชื่อแพ็กเกจ เช่น \"Gold\" หรือ \"บูธ 18 ตร.ม.\"" };
  const qty = input.qty?.trim() ? Number(input.qty.replace(/[,\s]/g, "")) : 1;
  if (!Number.isFinite(qty) || qty <= 0 || qty > 1e6) return { ok: false, error: "จำนวนต้องมากกว่า 0" };
  const unit = input.unitPrice?.trim() ? Number(input.unitPrice.replace(/[,฿\s]/g, "")) : null;
  if (unit != null && (!Number.isFinite(unit) || unit < 0 || unit > 1e12)) return { ok: false, error: "ราคาต่อหน่วยต้องเป็นตัวเลขบาท" };
  const at = new Date().toISOString();
  await run("INSERT INTO deal_items (id, tenant_id, opportunity_id, package, qty, unit_price, created_by, created_at) VALUES (?,?,?,?,?,?,?,?)",
    `di-${randomUUID()}`, tenantId, dealId, name, qty, unit, viewer.id, at);
  await run("UPDATE opportunities SET updated_at = ? WHERE tenant_id = ? AND id = ?", at, tenantId, dealId);
  return { ok: true };
}

export async function removeItem(tenantId: string, dealId: string, itemId: string, viewer: Viewer): Promise<Result> {
  const party = await dealParty(tenantId, dealId);
  if (!party) return { ok: false, error: "ไม่พบดีลนี้" };
  const access = await dealPartyAccess(tenantId, party, viewer);
  if (!access.ok) return access;
  const it = await get<{ id: string }>("SELECT id FROM deal_items WHERE tenant_id = ? AND opportunity_id = ? AND id = ?", tenantId, dealId, itemId);
  if (!it) return { ok: false, error: "ไม่พบรายการนี้" };
  await run("DELETE FROM deal_items WHERE tenant_id = ? AND id = ?", tenantId, itemId);
  return { ok: true };
}

/** ชื่อแพ็กเกจที่บัญชีเคยใช้ (แนะนำในช่องกรอก) */
export async function packageNames(tenantId: string): Promise<string[]> {
  return (await all<{ package: string }>("SELECT DISTINCT package FROM deal_items WHERE tenant_id = ? ORDER BY package LIMIT 200", tenantId)).map((r) => r.package);
}

/** แพ็กเกจไหนขายดี — นับจากดีลที่ผู้อ่านเห็น (ด่านเดียวกับหน้าดีล) */
export async function packageReport(tenantId: string, viewer: Viewer): Promise<{ package: string; wonDeals: number; wonQty: number; wonValue: number; openDeals: number; openValue: number }[]> {
  const deals = await listDeals(tenantId, { view: "all" }, viewer);
  const stage = new Map(deals.map((d) => [d.id, d.stage]));
  const items = await all<{ opportunity_id: string; package: string; qty: number | string; unit_price: number | string | null }>(
    "SELECT opportunity_id, package, qty, unit_price FROM deal_items WHERE tenant_id = ?", tenantId);
  const by = new Map<string, { package: string; won: Set<string>; wonQty: number; wonValue: number; open: Set<string>; openValue: number }>();
  for (const it of items) {
    const s = stage.get(it.opportunity_id);
    if (!s || s === "lost") continue;
    const r = by.get(it.package) ?? { package: it.package, won: new Set(), wonQty: 0, wonValue: 0, open: new Set(), openValue: 0 };
    const total = Number(it.qty) * Number(it.unit_price ?? 0);
    if (s === "won") { r.won.add(it.opportunity_id); r.wonQty += Number(it.qty); r.wonValue += total; }
    else { r.open.add(it.opportunity_id); r.openValue += total; }
    by.set(it.package, r);
  }
  return [...by.values()]
    .map((r) => ({ package: r.package, wonDeals: r.won.size, wonQty: r.wonQty, wonValue: r.wonValue, openDeals: r.open.size, openValue: r.openValue }))
    .sort((a, b) => b.wonValue - a.wonValue || b.openValue - a.openValue || a.package.localeCompare(b.package));
}
