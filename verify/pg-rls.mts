/* ── ภายใต้ตัวตนผู้ใช้จริงบน Postgres (RLS · grant · role authenticated) ─────────

   ชุดตรวจอื่นทั้งหมดรันบน sqlite ซึ่งไม่มี RLS และไม่มี grant — บั๊กที่เกิดเฉพาะบนฐานจริงจึงผ่านทุกชุด
   แล้วไปพังบน production คนแรกที่ใช้ ชุดนี้รันคำขอในนามผู้ใช้ (withIdentity → SET LOCAL role authenticated)
   บนฐานที่ใช้ migration จริงทุกไฟล์ และตรวจเฉพาะสิ่งที่ sqlite มองไม่เห็น:

   1. ลบคนตามคำขอสิทธิ (PDPA) ได้จริง — preferences · evidence · record_versions ถูกถอนสิทธิ์ DELETE (0007)
   2. ลบประวัติในตารางเพิ่มอย่างเดียวของคนที่ยังอยู่ไม่ได้ — ลบ "คัดค้าน" ทิ้งแล้วติดต่อต่อไม่ได้
   3. สาย audit ไม่แตกเมื่อเขียนพร้อมกันหลายคำขอ
   4. ผล AI ที่สำเร็จถึงผู้ใช้และถูกแคช — ai_cache เปิด RLS โดยไม่มีนโยบาย
   6. คิว "วันนี้" รันได้ในนามผู้ใช้ และการเลื่อนผ่าน RLS โดยไม่รั่วข้ามบัญชี (0012)
   7. "ฉันรู้จัก" · เส้นทางเข้าถึง · คนที่รู้จักย้ายบริษัท — query ของกราฟและการย้ายรันได้ในนามผู้ใช้

   ต้องมี DATABASE_URL ของฐานทดสอบที่ใช้ migration แล้ว (npm run pg:test-db) — ไม่มีก็ข้าม
   ⚠ ห้ามชี้ไปที่ production: ชุดนี้สร้างบัญชีและผู้ใช้ทดสอบ */
import { randomUUID } from "node:crypto";

if (!process.env.DATABASE_URL) {
  if (process.env.PG_REQUIRED === "1") {
    console.error("ไม่มี DATABASE_URL — ชุดตรวจ Postgres ถูกบังคับให้รันใน CI");
    process.exit(1);
  }
  console.log("ข้าม — ไม่มี DATABASE_URL");
  process.exit(0);
}

const { all, get, run, withIdentity, asSystem } = await import("@/lib/engine/sql");
const { createCustomer, deleteCustomer } = await import("@/lib/engine/customers");
const { recordPreference } = await import("@/lib/engine/policy/preferences");
const { appendAudit, verifyAuditChain } = await import("@/lib/engine/audit");
const { mapColumns, mapColumnsHeuristic, setTestTransport } = await import("@/lib/engine/ai");
const { tenantRole } = await import("@/lib/engine/access");

const out: string[] = [];
const ok = (c: boolean, m: string) => out.push(`${c ? "PASS" : "FAIL"}  ${m}`);

const T = `pgt-${randomUUID().slice(0, 8)}`;
const op = randomUUID();
const now = new Date().toISOString();
await run("INSERT INTO tenants (id, name, cycle_shape, created_at) VALUES (?, ?, ?, ?)", T, "บัญชีทดสอบ Postgres", "event", now);
await run("INSERT INTO auth.users (id, email) VALUES (?, ?)", op, `${op}@pg.example`);
await run("INSERT INTO tenant_users (user_id, tenant_id, role) VALUES (?, ?, 'operator')", op, T);
await run("INSERT INTO tenant_billing (tenant_id, state, is_customer, updated_at, updated_by) VALUES (?, 'paid', 1, ?, 'verify')", T, now);
const as = <R,>(fn: () => Promise<R>) => withIdentity(op, fn);
const countFor = async (table: string, where: string, ...p: string[]) =>
  Number((await get<{ n: number | string }>(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`, ...p))!.n);

// ── 1 · ลบตามคำขอสิทธิ ──
const made = await as(() => createCustomer(T, { name: "ลบ ทดสอบ", contacts: [{ kind: "email", value: "erase@pg.example" }], profile: {}, consent: false }, "verify"));
if (!made.ok) throw new Error(made.error);
const pref = await as(() => recordPreference(T, made.id, { kind: "objection", evidence: "คัดค้าน (สมมุติ)" }, "verify"));
ok(pref.ok, "บันทึกคำคัดค้านในนามผู้ใช้ได้ (insert ผ่าน RLS)");
await as(() => run(
  "INSERT INTO record_versions (tenant_id, record_kind, record_id, field, old_value, new_value, reason, changed_by, valid_from, recorded_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
  T, "person", made.id, "name", null, "ลบ ทดสอบ", "ทดสอบ", "verify", null, now));
let del: Awaited<ReturnType<typeof deleteCustomer>> | { ok: false; error: string };
try { del = await as(() => deleteCustomer(T, made.id, "verify")); } catch (e) { del = { ok: false, error: (e as Error).message }; }
ok(del.ok, `ลบคนตามคำขอสิทธิได้บน Postgres${del.ok ? "" : ` (${del.error})`}`);
ok(await countFor("preferences", "tenant_id = ? AND customer_id = ?", T, made.id) === 0
  && await countFor("record_versions", "tenant_id = ? AND record_kind = 'person' AND record_id = ?", T, made.id) === 0
  && await countFor("evidence", "tenant_id = ?", T) === 0,
  "ไม่เหลือคำคัดค้าน หลักฐาน หรือประวัติรุ่นของคนที่ถูกลบ");

// ── 2 · ลบคำคัดค้านของคนที่ยังอยู่ไม่ได้ ──
const kept = await as(() => createCustomer(T, { name: "คง ทดสอบ", contacts: [{ kind: "email", value: "keep@pg.example" }], profile: {}, consent: false }, "verify"));
if (!kept.ok) throw new Error(kept.error);
await as(() => recordPreference(T, kept.id, { kind: "objection", evidence: "คัดค้าน (สมมุติ)" }, "verify"));
let erased = true;
try { await as(() => run("SELECT app.erase_person_history(?, ?::text[])", T, `{"${kept.id}"}`)); } catch { erased = false; }
ok(!erased && await countFor("preferences", "tenant_id = ? AND customer_id = ?", T, kept.id) === 1, "ลบคำคัดค้านของคนที่ยังอยู่ในทะเบียนไม่ได้");
let direct = true;
try { await as(() => run("DELETE FROM preferences WHERE tenant_id = ? AND customer_id = ?", T, kept.id)); } catch { direct = false; }
ok(!direct, "ลบ preferences ตรง ๆ ในนามผู้ใช้ไม่ได้ (ตารางเพิ่มอย่างเดียว)");

// ── 3 · สาย audit เมื่อเขียนพร้อมกัน ──
await Promise.all(Array.from({ length: 12 }, (_, i) =>
  as(() => appendAudit({ tenantId: T, actor: "verify", action: "concurrent", targetId: String(i) }))));
const chain = await verifyAuditChain(T);
ok(chain.ok && chain.rows >= 12, `เขียน audit พร้อมกัน 12 คำขอ สายยังต่อกันครบ${chain.ok ? ` (${chain.rows} แถว)` : ` (ขาดที่ ${chain.brokenAtId})`}`);

// ── 4 · แคช AI ในนามผู้ใช้ ──
const headers = [`ชื่อ-${T}`, "อีเมล"];
let calls = 0;
setTestTransport(async () => { calls++; return { text: JSON.stringify(mapColumnsHeuristic(headers)) }; });
const first = await as(() => mapColumns(T, headers, [["สมมุติ", "a@pg.example"]]));
const second = await as(() => mapColumns(T, headers, [["สมมุติ", "a@pg.example"]]));
setTestTransport(null);
ok(first.source === "ai", `ผล AI ที่สำเร็จถึงผู้ใช้ ไม่ถูกทิ้งไปใช้สูตรสำเร็จ (${first.source}${first.note ? ` · ${first.note}` : ""})`);
ok(second.source === "cache" && calls === 1, `ครั้งที่สองมาจากแคช ไม่เรียกโมเดลซ้ำ (${second.source} · เรียก ${calls} ครั้ง)`);
const ledger = await all<{ outcome: string }>("SELECT outcome FROM ai_ledger WHERE tenant_id = ?", T);
ok(!ledger.some((l) => l.outcome === "error"), `ledger ไม่นับการเรียกที่สำเร็จเป็น error (${ledger.map((l) => l.outcome).join(", ")})`);

// ── 5 · บทบาทจาก tenant_users (ด่านของ Server Action) ──
ok(await tenantRole(T, op) === "operator" && await tenantRole(T, randomUUID()) === "viewer" && await tenantRole(T, null) === "viewer",
  "บทบาทอ่านจาก tenant_users · ไม่พบสมาชิก = viewer (สิทธิ์น้อยสุด) ไม่ใช่ owner");

// ── 6 · หน้า "วันนี้" ในนามผู้ใช้ (0012) ── SQL ของคิวต้องรันบน Postgres และการเลื่อนต้องผ่าน RLS
const { todayQueue, snoozeItem } = await import("@/lib/engine/today");
const taskId = randomUUID();
const due = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
await run("INSERT INTO tasks (id, tenant_id, title, status, due_at, owner_id, created_by, created_at) VALUES (?,?,?,?,?,?,?,?)",
  taskId, T, "งานทดสอบ (สมมุติ)", "open", due, `${op}@pg.example`, "verify", now);
const viewerPg = { id: `${op}@pg.example`, clearance: "confidential" as const };
const q1 = await as(() => todayQueue(T, viewerPg));
ok(q1.sections.some((s) => s.items.some((i) => i.id === taskId && i.section === "overdue")), "คิววันนี้รันบน Postgres ในนามผู้ใช้ และเห็นงานเลยกำหนด");
const tomorrowPg = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);
const sn = await as(() => snoozeItem(T, viewerPg.id, "task", taskId, tomorrowPg));
const again = await as(() => snoozeItem(T, viewerPg.id, "task", taskId, tomorrowPg));
ok(sn.ok && again.ok && await countFor("queue_marks", "tenant_id = ? AND item_id = ? AND count = 2", T, taskId) === 1,
  `เลื่อนงานในนามผู้ใช้ได้ และเลื่อนซ้ำอัปเดตแถวเดิม (ON CONFLICT ผ่าน RLS)${sn.ok ? "" : ` (${sn.error})`}`);
const stranger = randomUUID();
const peek = await withIdentity(stranger, () => all<{ item_id: string }>("SELECT item_id FROM queue_marks WHERE tenant_id = ?", T));
ok(peek.length === 0, "ผู้ใช้ที่ไม่ได้อยู่ในบัญชีอ่านการเลื่อนของบัญชีนี้ไม่ได้");

// ── 7 · เส้นทางเข้าถึงและคนที่รู้จักย้ายบริษัท (S2 · S3) ในนามผู้ใช้ ── query ของกราฟและการย้ายต้องรันบน Postgres
const { addMemberLink } = await import("@/lib/engine/accounts/edit");
const { loadPathGraph, pathsToPerson } = await import("@/lib/engine/accounts/paths");
const mover = await as(() => createCustomer(T, { name: "ย้าย ทดสอบ", contacts: [{ kind: "email", value: "mover@pg.example" }], profile: {}, consent: false }, "verify"));
if (!mover.ok) throw new Error(mover.error);
const [oldOrg, newOrg] = [randomUUID(), randomUUID()];
for (const [id, name] of [[oldOrg, "บริษัทเก่า (สมมุติ)"], [newOrg, "บริษัทใหม่ (สมมุติ)"]]) {
  await run("INSERT INTO orgs (id, tenant_id, name, name_norm, created_at) VALUES (?,?,?,?,?)", id, T, name, name, now);
}
const moveAff = randomUUID();
const ago = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
await run("INSERT INTO affiliations (id, tenant_id, customer_id, org_id, valid_from, valid_to, confirmed_by, recorded_at) VALUES (?,?,?,?,?,?,?,?)",
  randomUUID(), T, mover.id, oldOrg, ago(400), ago(20), "verify", now);
await run("INSERT INTO affiliations (id, tenant_id, customer_id, org_id, valid_from, valid_to, confirmed_by, recorded_at) VALUES (?,?,?,?,?,?,?,?)",
  moveAff, T, mover.id, newOrg, ago(20), null, "verify", now);
const link = await as(() => addMemberLink(T, { personId: mover.id, type: "knows", context: "พบที่งานสัมมนา (สมมุติ)" }, viewerPg));
const paths = await as(async () => pathsToPerson(await loadPathGraph(T, "confidential"), mover.id, newOrg));
ok(link.ok && paths.length === 1 && paths[0].hops === 1, `บันทึก "ฉันรู้จัก" และหาเส้นทางในนามผู้ใช้ได้${link.ok ? "" : ` (${link.error})`}`);
const q2 = await as(() => todayQueue(T, viewerPg));
ok(q2.sections.some((s) => s.section === "moved" && s.items.some((i) => i.id === moveAff)), "คนที่รู้จักย้ายบริษัทขึ้นในคิว (query การย้ายรันบน Postgres)");

// เก็บกวาด — บัญชีทดสอบหายพร้อมทุกแถว (on delete cascade)
await asSystem(() => run("DELETE FROM ai_cache WHERE kind = 'map_columns' AND created_at >= ?", now));
await run("DELETE FROM tenants WHERE id = ?", T);
await run("DELETE FROM auth.users WHERE id = ?", op);

for (const line of out) console.log(line);
const failed = out.filter((l) => l.startsWith("FAIL"));
if (failed.length) {
  console.log(`\n=== FAIL ${failed.length} ข้อ ===`);
  process.exit(1);
}
console.log(`\n=== ผ่านทั้งหมด ${out.length} ข้อ ===`);
process.exit(0);
