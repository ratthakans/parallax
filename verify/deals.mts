/* ── ดีล (docs/ux-plan.md U4) ──────────────────────────────────────────────
   สร้าง · ย้ายขั้น (ทุกครั้งมีรุ่นใน record_versions) · แก้ทีละช่อง · มุมมอง · บริษัทเกินสิทธิ์ไม่โผล่และแก้ไม่ได้
   ข้อมูลทั้งหมดเป็นชื่อสมมุติ */
import "./isolate.mts";
import { randomUUID } from "node:crypto";
import { ensureReady } from "@/lib/engine/bootstrap";
import { all, run } from "@/lib/engine/sql";
import { createDeal, getDeal, listDeals, moveDeal, updateDeal } from "@/lib/engine/deals";

const out: string[] = [];
const ok = (c: boolean, m: string) => out.push(`${c ? "PASS" : "FAIL"}  ${m}`);
const T = "hongmove";
const ME = { id: "bd@verify", clearance: "confidential" as const };
const OTHER = { id: "other@verify", clearance: "confidential" as const };
await ensureReady();
const now = new Date().toISOString();
const org = (name: string, cls = "confidential", owner: string | null = null) => {
  const id = `o-${randomUUID().slice(0, 8)}`;
  return run("INSERT INTO orgs (id, tenant_id, name, name_norm, classification, account_owner_id, lifecycle_state, recorded_at, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
    id, T, name, name, cls, owner, "confirmed", now, now).then(() => id);
};
const A = await org("บริษัท ดีลหนึ่ง จำกัด (สมมุติ)");
const SECRET = await org("บริษัท ลับมาก จำกัด (สมมุติ)", "restricted_high", "boss@verify");

ok(!(await createDeal(T, { orgId: A, name: "x" }, ME)).ok, "ชื่อดีลสั้นเกินไป = ไม่สร้าง");
ok(!(await createDeal(T, { orgId: A, name: "สปอนเซอร์ทอง", value: "abc" }, ME)).ok, "มูลค่าที่ไม่ใช่ตัวเลข = ไม่สร้าง");
const c = await createDeal(T, { orgId: A, name: "สปอนเซอร์ทอง 2027", value: "250,000", expectedClose: "2027-01-31" }, ME);
ok(c.ok, "สร้างดีลได้ (มูลค่ามีจุลภาคก็อ่านได้)");
const id = c.ok ? c.id : "";
const d0 = await getDeal(T, id, ME);
ok(d0 !== null && d0 !== "masked" && d0.stage === "open" && d0.value === 250000 && d0.owner === ME.id && d0.history.length === 1, "ดีลใหม่เริ่มที่ขั้นแรก เจ้าของคือผู้สร้าง และมีประวัติการสร้าง");

ok(!(await moveDeal(T, id, "banana", ME)).ok, "ขั้นที่ไม่รู้จัก = ย้ายไม่ได้");
await moveDeal(T, id, "proposal", ME);
await moveDeal(T, id, "proposal", ME);
const d1 = await getDeal(T, id, ME);
ok(d1 !== null && d1 !== "masked" && d1.stage === "proposal" && d1.history.filter((h) => h.field === "stage").length === 2,
  "ย้ายขั้นเขียนประวัติ · ย้ายไปขั้นเดิมซ้ำไม่เพิ่มประวัติ");
ok(d1 !== null && d1 !== "masked" && d1.history[0].oldValue === "open" && d1.history[0].newValue === "proposal" && d1.history[0].by === ME.id, "ประวัติบอกขั้นเดิม → ใหม่ และใครย้าย");

await updateDeal(T, id, "value", "300000", ME);
const d2 = await getDeal(T, id, ME);
ok(d2 !== null && d2 !== "masked" && d2.value === 300000 && d2.history.some((h) => h.field === "value" && h.oldValue === "250000"), "แก้มูลค่าทีละช่อง พร้อมรุ่น");

ok((await listDeals(T, { view: "open" }, ME)).some((x) => x.id === id), "ดีลเปิดอยู่ขึ้นในมุมมองเปิดอยู่");
ok((await listDeals(T, { view: "mine" }, ME)).some((x) => x.id === id) && !(await listDeals(T, { view: "mine" }, OTHER)).some((x) => x.id === id), "ดีลของฉัน = เจ้าของคือผู้อ่าน");
await moveDeal(T, id, "won", ME);
ok(!(await listDeals(T, { view: "open" }, ME)).some((x) => x.id === id) && (await listDeals(T, { view: "won" }, ME)).some((x) => x.id === id), "ปิดได้แล้วย้ายไปมุมมองปิดได้");

// บริษัทเกินสิทธิ์
ok(!(await createDeal(T, { orgId: SECRET, name: "ดีลลับ (สมมุติ)" }, ME)).ok, "สร้างดีลในบริษัทที่เกินสิทธิ์ไม่ได้");
const sid = randomUUID();
await run("INSERT INTO opportunities (id, tenant_id, org_id, name, stage, owner_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)", sid, T, SECRET, "ดีลลับ (สมมุติ)", "open", "boss@verify", now, now);
ok(!(await listDeals(T, { view: "all" }, ME)).some((x) => x.id === sid), "ดีลของบริษัทเกินสิทธิ์ไม่โผล่ในรายการ");
ok((await getDeal(T, sid, ME)) === "masked" && !(await moveDeal(T, sid, "won", ME)).ok, "เปิดหรือย้ายขั้นดีลของบริษัทเกินสิทธิ์ไม่ได้");
ok((await listDeals(T, { view: "all" }, { id: "boss@verify", clearance: "confidential" })).some((x) => x.id === sid), "เจ้าของบัญชีของบริษัทนั้นยังเห็นดีลตัวเอง");
const leaked = await all<{ n: number }>("SELECT COUNT(*) AS n FROM record_versions WHERE tenant_id = ? AND record_kind = 'opportunity' AND record_id = ?", T, sid);
ok(Number(leaked[0].n) === 0, "การย้ายที่ถูกปฏิเสธไม่ทิ้งประวัติ");

for (const line of out) console.log(line);
const failed = out.filter((l) => l.startsWith("FAIL"));
if (failed.length) { console.log(`\n=== FAIL ${failed.length} ข้อ ===`); process.exit(1); }
console.log(`\n=== ผ่านทั้งหมด ${out.length} ข้อ ===`);
