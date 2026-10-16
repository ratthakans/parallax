import { randomUUID } from "node:crypto";
import { all, get, run } from "@/lib/engine/sql";

/* ── มุมมองรายการที่บันทึกไว้ (docs/crm-plan.md C5) ─────────────────────────

   เก็บแค่ชื่อกับ query string ของหน้ารายการ — เปิดแล้วหน้ารายการตีความ query เองด้วยด่านเดิมทุกตัว
   จึงไม่มีทางที่มุมมองที่บันทึกไว้จะเห็นข้อมูลเกินสิทธิ์ของคนที่เปิด
   ส่วนตัว = เห็นเฉพาะเจ้าของ · แชร์ = ทุกคนในบัญชี (ตั้งแชร์ได้เฉพาะสิทธิ์ fields — ตรวจที่ action) */

export const VIEW_LISTS = ["accounts", "deals", "pivot"] as const;
export type ViewList = (typeof VIEW_LISTS)[number];
export type SavedView = { id: string; name: string; query: string; shared: boolean; mine: boolean };

/** query ที่เก็บได้: เฉพาะคีย์ที่หน้ารายการรู้จัก · ไม่เก็บคำค้น q (อาจเป็นชื่อคน) */
const KEY_RE = /^(view|sort|dir|mode|industry|owner|team|period|group|tax|minValue|closeFrom|closeTo|package|role|rows|cols|measure|stage|cf\.[\w-]+|df\.[\w-]+)$/;
export function cleanQuery(raw: string): string {
  const out = new URLSearchParams();
  for (const [k, v] of new URLSearchParams(raw.replace(/^\?/, ""))) if (KEY_RE.test(k) && v.length <= 120) out.append(k, v);
  return out.toString();
}

export async function listViews(tenantId: string, list: ViewList, me: string): Promise<SavedView[]> {
  return (await all<{ id: string; name: string; query: string; shared: number | string; owner_id: string }>(
    "SELECT id, name, query, shared, owner_id FROM saved_views WHERE tenant_id = ? AND list = ? AND (shared = 1 OR owner_id = ?) ORDER BY shared DESC, name",
    tenantId, list, me)).map((r) => ({ id: r.id, name: r.name, query: r.query, shared: Number(r.shared) === 1, mine: r.owner_id === me }));
}

export async function saveView(tenantId: string, input: { list: string; name: string; query: string; shared: boolean }, me: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!(VIEW_LISTS as readonly string[]).includes(input.list)) return { ok: false, error: "ไม่รู้จักรายการนี้" };
  const name = input.name.trim().slice(0, 60);
  if (name.length < 2) return { ok: false, error: "ตั้งชื่อมุมมอง เช่น \"สปอนเซอร์ Gold ภาคตะวันออก\"" };
  const query = cleanQuery(input.query);
  if (!query) return { ok: false, error: "ยังไม่ได้เลือกตัวกรองหรือการเรียง — ไม่มีอะไรให้บันทึก" };
  const n = await get<{ n: number | string }>("SELECT COUNT(*) AS n FROM saved_views WHERE tenant_id = ? AND list = ? AND owner_id = ?", tenantId, input.list, me);
  if (Number(n?.n ?? 0) >= 30) return { ok: false, error: "บันทึกมุมมองได้สูงสุด 30 รายการต่อหน้า — ลบที่ไม่ใช้ก่อน" };
  const id = `sv-${randomUUID()}`;
  await run("INSERT INTO saved_views (id, tenant_id, list, name, query, shared, owner_id, created_at) VALUES (?,?,?,?,?,?,?,?)",
    id, tenantId, input.list, name, query, input.shared ? 1 : 0, me, new Date().toISOString());
  return { ok: true, id };
}

/** ลบได้เฉพาะเจ้าของมุมมอง (มุมมองแชร์ของคนอื่น ลบไม่ได้) */
export async function deleteView(tenantId: string, id: string, me: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const v = await get<{ owner_id: string }>("SELECT owner_id FROM saved_views WHERE tenant_id = ? AND id = ?", tenantId, id);
  if (!v) return { ok: false, error: "ไม่พบมุมมองนี้" };
  if (v.owner_id !== me) return { ok: false, error: "ลบได้เฉพาะมุมมองที่คุณสร้าง" };
  await run("DELETE FROM saved_views WHERE tenant_id = ? AND id = ?", tenantId, id);
  return { ok: true };
}
