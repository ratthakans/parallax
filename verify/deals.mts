/* ── ดีล (docs/ux-plan.md U4) ──────────────────────────────────────────────
   สร้าง · ย้ายขั้น (ทุกครั้งมีรุ่นใน record_versions) · แก้ทีละช่อง · มุมมอง · บริษัทเกินสิทธิ์ไม่โผล่และแก้ไม่ได้
   ข้อมูลทั้งหมดเป็นชื่อสมมุติ */
import "./isolate.mts";
import { randomUUID } from "node:crypto";
import { ensureReady } from "@/lib/engine/bootstrap";
import { all, run } from "@/lib/engine/sql";
import { closeDeal, createDeal, createRenewal, getDeal, listDeals, moveDeal, renewalName, updateDeal } from "@/lib/engine/deals";
import { addItem, listItems } from "@/lib/engine/deal-items";
import { closeReasons } from "@/lib/engine/velocity";
import { get } from "@/lib/engine/sql";

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
const SECRET_DEAL = () => sid;
await run("INSERT INTO opportunities (id, tenant_id, org_id, name, stage, owner_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)", sid, T, SECRET, "ดีลลับ (สมมุติ)", "open", "boss@verify", now, now);
ok(!(await listDeals(T, { view: "all" }, ME)).some((x) => x.id === sid), "ดีลของบริษัทเกินสิทธิ์ไม่โผล่ในรายการ");
ok((await getDeal(T, sid, ME)) === "masked" && !(await moveDeal(T, sid, "won", ME)).ok, "เปิดหรือย้ายขั้นดีลของบริษัทเกินสิทธิ์ไม่ได้");
ok((await listDeals(T, { view: "all" }, { id: "boss@verify", clearance: "confidential" })).some((x) => x.id === sid), "เจ้าของบัญชีของบริษัทนั้นยังเห็นดีลตัวเอง");
const leaked = await all<{ n: number }>("SELECT COUNT(*) AS n FROM record_versions WHERE tenant_id = ? AND record_kind = 'opportunity' AND record_id = ?", T, sid);
ok(Number(leaked[0].n) === 0, "การย้ายที่ถูกปฏิเสธไม่ทิ้งประวัติ");

// ── E2 · ปิดดีลพร้อมเหตุผล ──
const mkd = async (name: string, value: string) => { const r = await createDeal(T, { orgId: A, name, value }, ME); return r.ok ? r.id : ""; };
const L1 = await mkd("แพ้ราคา (สมมุติ)", "100000"), L2 = await mkd("แพ้คู่แข่ง (สมมุติ)", "200000"), W1 = await mkd("ได้เพราะสัมพันธ์ (สมมุติ)", "300000");
ok(!(await closeDeal(T, L1, "lost", "", "", ME)).ok && !(await closeDeal(T, L1, "lost", "audience", "", ME)).ok, "ไม่เลือกเหตุผล · เหตุผลของฝั่งได้ใช้กับไม่ได้ = ไม่ปิด");
ok(!(await closeDeal(T, L1, "lost", "other", "", ME)).ok, "เหตุผล 'อื่น ๆ' ต้องเขียนหมายเหตุ");
ok((await closeDeal(T, L1, "lost", "price", "แพงกว่าเจ้าอื่น 20%", ME)).ok, "ปิดว่าไม่ได้พร้อมเหตุผล");
const l1 = await get<{ stage: string; close_reason: string; close_note: string }>("SELECT stage, close_reason, close_note FROM opportunities WHERE tenant_id = ? AND id = ?", T, L1);
ok(l1?.stage === "lost" && l1.close_reason === "price" && l1.close_note === "แพงกว่าเจ้าอื่น 20%", "ขั้น เหตุผล และหมายเหตุถูกบันทึก");
const h1 = await getDeal(T, L1, ME);
ok(h1 !== null && h1 !== "masked" && h1.history.some((h) => h.field === "stage" && h.newValue === "lost"), "การปิดยังมีประวัติขั้นเหมือนการย้ายปกติ");
await closeDeal(T, L2, "lost", "competitor", "", ME);
await closeDeal(T, W1, "won", "relationship", "", ME);
ok(!(await closeDeal(T, SECRET_DEAL(), "won", "price", "", ME)).ok, "ปิดดีลของบริษัทเกินสิทธิ์ไม่ได้");
const rs = await closeReasons(T, ME, new Date(Date.now() - 864e5).toISOString());
ok(rs.find((r) => r.stage === "lost" && r.reason === "price")?.value === 100000 && rs.find((r) => r.stage === "lost" && r.reason === "competitor")?.count === 1
  && rs.find((r) => r.stage === "won" && r.reason === "relationship")?.value === 300000, "รายงานเหตุผลรวมตามฝั่งและเหตุผล");
ok(rs.some((r) => r.reason === "unrecorded"), "ดีลที่ปิดโดยไม่มีเหตุผล (ทางเดิม) นับเป็น 'ไม่ได้บันทึก'");

// ── E4 · ดีลต่อสัญญา ──
ok(renewalName("สปอนเซอร์ Gold งาน 2026") === "สปอนเซอร์ Gold งาน 2027" && renewalName("บูธ ปี 2569") === "บูธ ปี 2570" && renewalName("แพ็กเกจพิเศษ") === "แพ็กเกจพิเศษ (ต่อสัญญา)", "ชื่อดีลเลื่อนปี (ค.ศ./พ.ศ.) · ไม่มีปี = ต่อท้าย");
const R0 = (await createDeal(T, { orgId: A, name: "สปอนเซอร์ Gold งาน 2026 (สมมุติ)", value: "400000", expectedClose: "2026-03-15" }, ME));
const r0 = R0.ok ? R0.id : "";
await addItem(T, r0, { package: "Gold", qty: "1", unitPrice: "400000" }, ME);
ok(!(await createRenewal(T, r0, ME)).ok, "ดีลที่ยังไม่ปิดได้ ต่อสัญญาไม่ได้");
await closeDeal(T, r0, "won", "relationship", "", ME);
const rn = await createRenewal(T, r0, ME);
ok(rn.ok && !rn.existed, "สร้างดีลต่อสัญญาจากดีลที่ปิดได้");
const nd = rn.ok ? await get<{ name: string; stage: string; value: number; expected_close: string; renewed_from: string; owner_id: string }>(
  "SELECT name, stage, value, expected_close, renewed_from, owner_id FROM opportunities WHERE tenant_id = ? AND id = ?", T, rn.id) : undefined;
ok(nd?.name === "สปอนเซอร์ Gold งาน 2027 (สมมุติ)" && nd.stage === "open" && Number(nd.value) === 400000 && nd.expected_close === "2027-03-15" && nd.renewed_from === r0 && nd.owner_id === ME.id,
  "ดีลใหม่: ชื่อปีถัดไป · เริ่มคุย · มูลค่าเดิม · ปิดคาด +1 ปี · ผูกกับดีลเดิม · เจ้าของเดิม");
ok(rn.ok && (await listItems(T, rn.id)).map((i) => `${i.package}:${i.total}`).join() === "Gold:400000", "แพ็กเกจเดิมติดไปด้วย");
const again = await createRenewal(T, r0, ME);
ok(again.ok && again.existed && rn.ok && again.id === rn.id, "ต่อสัญญาซ้ำ = คืนดีลเดิม ไม่สร้างซ้ำ");
ok(!(await createRenewal("mst-golf", r0, ME)).ok, "ต่อสัญญาข้ามบัญชีไม่ได้");
const leap = await createDeal(T, { orgId: A, name: "ดีลวันอธิกสุรทิน 2028 (สมมุติ)", expectedClose: "2028-02-29" }, ME);
if (leap.ok) { await closeDeal(T, leap.id, "won", "timing", "", ME); const lr = await createRenewal(T, leap.id, ME);
  ok(lr.ok && (await get<{ expected_close: string }>("SELECT expected_close FROM opportunities WHERE tenant_id = ? AND id = ?", T, lr.id))?.expected_close === "2029-02-28", "29 ก.พ. ต่อปีถัดไปเป็น 28 ก.พ."); }

for (const line of out) console.log(line);
const failed = out.filter((l) => l.startsWith("FAIL"));
if (failed.length) { console.log(`\n=== FAIL ${failed.length} ข้อ ===`); process.exit(1); }
console.log(`\n=== ผ่านทั้งหมด ${out.length} ข้อ ===`);
