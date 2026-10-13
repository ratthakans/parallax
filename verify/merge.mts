/* ── รวมและแยกตัวตน (docs/plan.md B3 · Blueprint 2.0 บท 3) ─────────

   "การรวมต้องย้อนได้โดยไม่ทำให้ประวัติการติดต่อหาย" — ชุดนี้ตรวจว่า:
   1. แยกคืนแล้วข้อมูลกลับเป็นเหมือนก่อนรวมทุกแถว (ไม่ใช่แค่จำนวนเท่ากัน)
   2. ข้อจำกัดที่เข้มกว่าชนะตอนรวม · ปฏิสัมพันธ์และแถวต้นทางย้ายตามคน
   3. คำตัดสินของคนชนะกฎ: แยกแล้วไม่ถูกเสนอซ้ำ · ชื่อองค์กรที่รวมแล้วไม่ถูกสร้างใหม่ตอนนำเข้ารอบหน้า
   4. ลบตามคำขอ (สิทธิ์ลบ) ลบข้อมูลของคนที่ถูกรวมเข้ามาด้วย
   5. คนที่มีข้อมูลยุคค้าปลีกไม่ถูกรวมผ่านทางนี้ · การรวมจากหน้าลูกค้าเดิมของคนจาก Vault ย้อนได้
   ข้อมูลทั้งหมดเป็นชื่อสมมุติ โดเมน .example */
import "./isolate.mts";
import { ensureReady } from "@/lib/engine/bootstrap";
import { all, get, run } from "@/lib/engine/sql";
import { registerSource } from "@/lib/engine/vault/sources";
import { commitUpload } from "@/lib/engine/vault/intake";
import { resolveTenant } from "@/lib/engine/vault/resolve";
import { decideReview, mergePersons, personIdsOf, unmerge } from "@/lib/engine/vault/merge";
import { listOpenReviews } from "@/lib/engine/vault/review";
import { createCustomer, deleteCustomer, mergeCustomers } from "@/lib/engine/customers";
import { recordPreference } from "@/lib/engine/policy/preferences";
import { PERSON_LINKED } from "@/lib/engine/tenant-data";
import { verifyAuditChain } from "@/lib/engine/audit";
import { drawSample, recordSample, sampleStats } from "@/lib/engine/vault/sample";
import { createHash } from "node:crypto";

const out: string[] = [];
const ok = (c: boolean, m: string) => out.push(`${c ? "PASS" : "FAIL"}  ${m}`);
const T = "hongmove";
const now = new Date().toISOString();

await ensureReady();

const HEAD = "ชื่อ,นามสกุล,บริษัท,ตำแหน่ง,อีเมล,โทรศัพท์,วันที่";
const MAP = { 0: "first_name", 1: "last_name", 2: "company", 3: "job_title", 4: "email", 5: "phone", 6: "occurred_at" };
const src = await registerSource(T, {
  name: "รายชื่อสมมุติสำหรับตรวจการรวม", kind: "file", newPurpose: "ตรวจการรวม",
  acquisitionNote: "ข้อมูลสมมุติที่เขียนขึ้นในชุดตรวจ ไม่ใช่ข้อมูลของใคร",
  fields: Object.values(MAP),
}, "verify");
if (!src.ok) throw new Error(src.error);

async function importCsv(name: string, lines: string[]) {
  const bytes = new TextEncoder().encode([HEAD, ...lines].join("\n"));
  const sha = createHash("sha256").update(bytes).digest("hex");
  const r = await commitUpload(T, (src as { id: string }).id, bytes, name, MAP, sha, "verify");
  if (!r.ok) throw new Error(r.error);
  return resolveTenant(T, "verify");
}

/* สมชาย: แถว 1 กับ 3 เชื่อมด้วยเบอร์ (ไทย/อังกฤษ) · แถว 2 ชื่อเดียวกันที่บริษัทเดียวกันแต่ช่องทางต่าง → คิว
   วิภา: สองแถวชื่อเดียวกันบริษัทเดียวกัน ช่องทางต่าง → คิว · สยามกริด/Siam Grid โดเมนเดียวกัน → กลุ่มองค์กร */
await importCsv("ชุดที่1.csv", [
  "สมชาย,ใจดี,บริษัท สยามกริด จำกัด,ผู้จัดการฝ่ายขาย,somchai.j@siamgrid.example,081-555-0101,2024-03-01",
  "สมชาย,ใจดี,บริษัท สยามกริด จำกัด,ผู้จัดการ,s.jaidee@siamgrid.example,089-555-0202,2025-01-10",
  "Somchai,Jaidee,\"Siam Grid Co., Ltd.\",Sales Manager,somchai.j@siamgrid.example,081-555-0101,2024-06-01",
  "วิภา,ศรีสุข,บริษัท ลมทะเล จำกัด,ผู้อำนวยการ,wipa@lomtalay.example,082-555-0303,2024-05-05",
  "วิภา,ศรีสุข,บริษัท ลมทะเล จำกัด,ที่ปรึกษา,wipa.s@lomtalay.example,083-555-0404,2025-02-02",
]);

const pairs = await listOpenReviews(T, "person_pair", 50);
const orgGroups = await listOpenReviews(T, "org_group", 50);
const somchai = pairs.find((p) => p.people.some((x) => x.name.includes("สมชาย")));
const wipa = pairs.find((p) => p.people.some((x) => x.name.includes("วิภา")));
ok(pairs.length === 2 && Boolean(somchai && wipa), `คิวมีสองคู่ (สมชาย · วิภา) — พบ ${pairs.length}`);
ok(orgGroups.length === 1 && orgGroups[0].orgs.length === 2, `สยามกริด/Siam Grid เข้าคิวเป็นกลุ่มองค์กร ไม่ถูกรวมเอง — พบ ${orgGroups.length} กลุ่ม`);
ok(Boolean(somchai && somchai.people.every((p) => p.contacts.every((c) => /•|xxx/.test(c.masked)))), "หน้าตรวจเห็นช่องทางแบบปิดบางเท่านั้น");
if (!somchai || !wipa || !orgGroups.length) {
  for (const l of out) console.log(l);
  process.exit(1);
}

// ── เตรียม: ฝั่งที่จะถูกรวมมีปฏิสัมพันธ์ · preference · ข้อจำกัดห้ามติดต่อ ──
const [big, small] = [...somchai.people].sort((a, b) => b.rows - a.rows);
await run("INSERT INTO interactions (id, tenant_id, kind, occurred_at, customer_id, summary, recorded_at) VALUES (?,?,?,?,?,?,?)",
  "int-verify-1", T, "meeting", now, small.id, "ประชุมสมมุติ", now);
await run("INSERT INTO preferences (id, tenant_id, customer_id, kind, effective_at, recorded_by, recorded_at) VALUES (?,?,?,?,?,?,?)",
  "pref-verify-1", T, small.id, "objection", now, "verify", now);
await run("UPDATE customers SET restriction_status = 'suppressed' WHERE tenant_id = ? AND id = ?", T, small.id);

const TABLES: [string, string][] = [
  ["customers", "id"], ["contact_points", "id"], ["contact_profiles", "customer_id"], ["affiliations", "id"],
  ["import_rows", "batch_id, line"], ["interactions", "id"], ["preferences", "id"], ["orgs", "id"], ["org_domains", "domain"],
];
/* lifecycle_state ของคนไม่นับ: แยกคืน = คนตัดสินว่าต่างคน จึงเปลี่ยนจาก "รอตรวจ" เป็น "ยืนยันแล้ว" โดยตั้งใจ (ตรวจแยกด้านล่าง) */
async function snapshot() {
  const s: Record<string, string> = {};
  for (const [t, order] of TABLES) {
    const rows = await all<Record<string, unknown>>(`SELECT * FROM ${t} WHERE tenant_id = ? ORDER BY ${order}`, T);
    s[t] = JSON.stringify(t === "customers" ? rows.map(({ lifecycle_state: _l, ...r }) => r) : rows);
  }
  return s;
}
const before = await snapshot();
const people0 = Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM customers WHERE tenant_id = ?", T))!.n);

// ── 1 · รวม ──
const d = await decideReview(T, somchai.id, "same", "steward@verify");
ok(d.ok && d.mergeIds.length === 1, "ตัดสินว่าเป็นคนเดียวกัน → รวมหนึ่งครั้ง");
const mergeId = d.ok ? d.mergeIds[0] : "";
const people1 = Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM customers WHERE tenant_id = ?", T))!.n);
ok(people1 === people0 - 1, `จำนวนคนลดลงหนึ่ง (${people0} → ${people1})`);
const keep = await get<{ restriction_status: string; lifecycle_state: string }>(
  "SELECT restriction_status, lifecycle_state FROM customers WHERE tenant_id = ? AND id = ?", T, big.id);
ok(keep?.restriction_status === "suppressed", "ข้อจำกัดที่เข้มกว่า (ห้ามติดต่อ) มีผลกับคนที่รวมแล้ว");
ok(keep?.lifecycle_state === "confirmed", "คนที่ตรวจแล้วเป็นสถานะยืนยันแล้ว");
const rowsOnKeep = Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM import_rows WHERE tenant_id = ? AND customer_id = ?", T, big.id))!.n);
ok(rowsOnKeep === big.rows + small.rows, `แถวต้นทางของทั้งสองฝั่งอยู่ที่คนเดียว (${rowsOnKeep})`);
ok((await get("SELECT 1 AS x FROM interactions WHERE id = 'int-verify-1' AND customer_id = ?", big.id)) != null, "ปฏิสัมพันธ์ย้ายตามคน — ประวัติการติดต่อไม่หาย");
const pts = await all<{ value_hmac: string }>("SELECT value_hmac FROM contact_points WHERE tenant_id = ? AND customer_id = ?", T, big.id);
ok(small.contacts.every((c) => pts.some((p) => p.value_hmac === c.hmac)), "ช่องทางของฝั่งที่ถูกรวมอยู่ที่คนที่คงอยู่");
ok((await personIdsOf(T, big.id)).includes(small.id), "preference (ตารางเพิ่มอย่างเดียว) อ่านถึงได้ผ่านรหัสที่ถูกรวม");
const item = await get<{ status: string; decided_by: string }>("SELECT status, decided_by FROM review_items WHERE id = ?", somchai.id);
ok(item?.status === "merged" && item.decided_by === "steward@verify", "รายการในคิวบันทึกว่าใครตัดสิน");

// ── 2 · แยกคืน = กลับเป็นเหมือนเดิมทุกแถว ──
const u = await unmerge(T, mergeId, "steward@verify");
ok(u.ok, "แยกคืนได้");
const after = await snapshot();
const diff = TABLES.map(([t]) => t).filter((t) => before[t] !== after[t]);
ok(diff.length === 0, `หลังแยกคืน ทุกแถวเหมือนก่อนรวม${diff.length ? ` — ต่างที่ ${diff.join(", ")}` : ""}`);
const states = await all<{ lifecycle_state: string }>("SELECT lifecycle_state FROM customers WHERE tenant_id = ? AND id IN (?, ?)", T, big.id, small.id);
ok(states.length === 2 && states.every((x) => x.lifecycle_state === "confirmed"), "หลังแยกคืน ทั้งสองคนเป็นสถานะยืนยันแล้ว ไม่ค้างรอตรวจ");
ok(!(await unmerge(T, mergeId, "steward@verify")).ok, "แยกคืนซ้ำไม่ได้");
ok((await get("SELECT 1 AS x FROM merge_log WHERE id = ? AND undone_at IS NOT NULL", mergeId)) != null, "ประวัติการรวมยังอยู่ พร้อมเวลาที่แยกคืน");

// ── 3 · คำตัดสินชนะกฎ ──
await importCsv("ชุดที่2.csv", [
  "สมชาย,ใจดี,บริษัท สยามกริด จำกัด,ผู้จัดการ,somchai.new@siamgrid.example,086-555-0505,2025-06-01",
]);
const pairKey = JSON.stringify([big.id, small.id].sort());
const again = await get("SELECT 1 AS x FROM review_items WHERE tenant_id = ? AND status = 'open' AND subject_ids = ?", T, pairKey);
ok(!again, "คู่ที่แยกคืนแล้วไม่ถูกเสนอซ้ำเมื่อนำเข้าไฟล์ใหม่");

const w = await decideReview(T, wipa.id, "different", "steward@verify");
const wipaStates = await all<{ lifecycle_state: string }>(
  `SELECT lifecycle_state FROM customers WHERE tenant_id = ? AND id IN (?, ?)`, T, wipa.people[0].id, wipa.people[1].id);
ok(w.ok && wipaStates.every((s) => s.lifecycle_state === "confirmed"), "ตัดสินว่าคนละคน → ทั้งสองยืนยันแล้ว ไม่รวม");
ok(!(await decideReview(T, wipa.id, "same", "steward@verify")).ok, "รายการที่ตัดสินแล้วตัดสินซ้ำไม่ได้");

// ── องค์กร: รวม → นำเข้าชื่อเดิมของที่ถูกรวม → ไม่เกิดองค์กรใหม่ → แยกคืน ──
/* recorded_at = เวลาที่ระบบเห็นองค์กรล่าสุด — ไฟล์ชุดที่ 3 ด้านล่างอัปเดตจริง จึงไม่นับในการเทียบ */
const orgRows = async () => JSON.stringify((await all<Record<string, unknown>>("SELECT * FROM orgs WHERE tenant_id = ? ORDER BY id", T))
  .map(({ recorded_at: _r, ...rest }) => rest));
const orgBefore = await orgRows();
const og = await decideReview(T, orgGroups[0].id, "same", "steward@verify");
ok(og.ok, "รวมกลุ่มองค์กรได้");
const orgN1 = Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM orgs WHERE tenant_id = ?", T))!.n);
await importCsv("ชุดที่3.csv", [
  "Anan,Meechai,\"Siam Grid Co., Ltd.\",Engineer,anan@siamgrid.example,087-555-0606,2025-07-01",
  "อนันต์,มีชัย,บริษัท สยามกริด จำกัด,วิศวกร,anan.m@siamgrid.example,087-555-0606,2025-07-01",
]);
const orgN2 = Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM orgs WHERE tenant_id = ?", T))!.n);
ok(orgN2 === orgN1, `ชื่อของที่ถูกรวมไม่สร้างองค์กรใหม่ตอนนำเข้ารอบหน้า (${orgN1} → ${orgN2})`);
const openOrg = await get<{ n: number }>("SELECT COUNT(*) AS n FROM review_items WHERE tenant_id = ? AND kind = 'org_group' AND status = 'open'", T);
ok(Number(openOrg!.n) === 0, "ไม่มีกลุ่มองค์กรเดิมกลับเข้าคิว");
const om = og.ok ? og.mergeIds[0] : "";
ok((await unmerge(T, om, "steward@verify")).ok, "แยกองค์กรคืนได้");
ok((await orgRows()) === orgBefore, "หลังแยกคืน แถวองค์กรเหมือนก่อนรวม");
ok((await get("SELECT 1 AS x FROM resolution_overrides WHERE tenant_id = ? AND kind = 'org_alias'", T)) == null, "ชื่อแฝงของการรวมถูกถอนพร้อมการแยกคืน");

// ── 4 · สิทธิ์ลบ: ลบคนที่รวมแล้ว = ลบข้อมูลของคนที่ถูกรวมเข้ามาด้วย ──
const m2 = await mergePersons(T, big.id, small.id, "steward@verify", "review", null);
ok(m2.ok, "รวมซ้ำได้เมื่อคนตัดสินใหม่");
const del = await deleteCustomer(T, big.id, "steward@verify");
ok(del.ok, "ลบคนที่รวมแล้วได้");
const residue: string[] = [];
for (const l of PERSON_LINKED) {
  for (const id of [big.id, small.id]) {
    const r = await get(`SELECT 1 AS x FROM ${l.table} WHERE tenant_id = ? AND ${l.column} = ?${l.where ? ` AND ${l.where}` : ""} LIMIT 1`, T, id);
    if (r) residue.push(`${l.table}.${l.column}`);
  }
}
ok(residue.length === 0, `ไม่เหลือข้อมูลของทั้งสองรหัสในทุกตารางที่ผูกกับคน${residue.length ? ` — เหลือ ${[...new Set(residue)].join(", ")}` : ""}`);
ok((await get("SELECT 1 AS x FROM preferences WHERE id = 'pref-verify-1'")) == null, "preference ของคนที่ถูกรวมเข้ามาถูกลบด้วย");

// ── 5 · ขอบเขต ──
const [p1, p2] = wipa.people.map((p) => p.id);
await run("INSERT INTO transactions (id, tenant_id, customer_id, occurred_at, total, channel) VALUES (?,?,?,?,?,?)", "txn-verify-1", T, p2, now, 100, "pos");
const retail = await mergePersons(T, p1, p2, "steward@verify", "review", null);
ok(!retail.ok, "คนที่มีข้อมูลยุคค้าปลีกไม่ถูกรวมผ่าน Data Vault");
await run("DELETE FROM transactions WHERE id = 'txn-verify-1'");
const legacy = await mergeCustomers(T, p1, p2, "steward@verify");
const logged = await get("SELECT 1 AS x FROM merge_log WHERE tenant_id = ? AND survivor_id = ? AND merged_id = ? AND rule = 'manual'", T, p1, p2);
ok(legacy.ok && logged != null, "รวมจากหน้าลูกค้าเดิม (คนจาก Vault) ใช้การรวมที่ย้อนได้");

// ── 6 · สุ่มตรวจ (หัวข้อ 5.3) ──
ok((await sampleStats(T)).precision === null, "ยังไม่สุ่มตรวจ = \"ยังไม่ได้วัด\" ไม่ใช่ 100%");
const drawn = new Set<string>();
for (let i = 0; i < 10; i++) {
  const s = await drawSample(T, "merge");
  if (!s) break;
  ok(s.rows.length >= 2, `สุ่มตรวจการรวมได้คนที่รวมจาก ${s.rows.length} แถว`);
  ok(s.rows.every((r) => !r.email || r.email.includes("•")), "แถวที่ให้ steward ดูมีอีเมลแบบปิดบาง");
  drawn.add(s.customerId);
  await recordSample(T, s.customerId, drawn.size === 1 ? "merge_wrong" : "merge_ok", "steward@verify");
}
ok(drawn.size >= 2 && (await drawSample(T, "merge")) === null, `สุ่มไม่ซ้ำคนที่ตรวจแล้ว — ตรวจครบ ${drawn.size} คนแล้วไม่มีให้สุ่มอีก`);
const st = await sampleStats(T);
ok(st.mergeChecked === drawn.size && st.mergeWrong === 1, `ผลวัดนับจากที่คนตรวจจริง (${st.mergeWrong}/${st.mergeChecked} รวมผิด)`);
const miss = await drawSample(T, "missed");
ok(miss != null && (await recordSample(T, miss.customerId, "missed", "steward@verify")).ok && (await sampleStats(T)).missRate === 1, "สุ่มตรวจซ้ำที่หลุดบันทึกได้และนับแยกจากรวมผิด");
ok(!(await recordSample(T, "ไม่มีคนนี้", "merge_ok", "steward@verify")).ok, "บันทึกผลตรวจของคนที่ไม่มีอยู่ไม่ได้");

// ── คนที่เพิ่มด้วยมือ (ไม่มีแถวต้นทาง) แต่มีข้อมูล B2B: ต้องรวมแบบย้อนได้ ไม่ใช่ทางเดิมที่ลบรหัสทิ้ง ──
const hk = await createCustomer(T, { name: "มือหนึ่ง ทดสอบ", contacts: [{ kind: "email", value: "hand1@merge.example" }], profile: {}, consent: false }, "verify");
const hd = await createCustomer(T, { name: "มือสอง ทดสอบ", contacts: [{ kind: "email", value: "hand2@merge.example" }], profile: {}, consent: false }, "verify");
if (!hk.ok || !hd.ok) throw new Error("สร้างคนด้วยมือไม่ได้");
ok((await recordPreference(T, hd.id, { kind: "objection", evidence: "คัดค้านทางโทรศัพท์ (สมมุติ)" }, "verify")).ok, "บันทึกการคัดค้านของคนที่เพิ่มด้วยมือ");
const hm = await mergeCustomers(T, hk.id, hd.id, "steward@verify");
const hlog = await get<{ id: string }>("SELECT id FROM merge_log WHERE tenant_id = ? AND survivor_id = ? AND merged_id = ? AND undone_at IS NULL", T, hk.id, hd.id);
ok(hm.ok && Boolean(hlog), "รวมคนที่เพิ่มด้วยมือแต่มีคำคัดค้าน = ผ่านการรวมที่ย้อนได้ (มี merge_log)");
ok((await personIdsOf(T, hk.id)).includes(hd.id), "คำคัดค้านใต้รหัสที่ถูกรวมยังถูกนับให้คนที่คงอยู่");
ok(Boolean(hlog) && (await unmerge(T, hlog!.id, "steward@verify")).ok
  && Boolean(await get("SELECT 1 AS x FROM customers WHERE tenant_id = ? AND id = ?", T, hd.id))
  && Boolean(await get("SELECT 1 AS x FROM consents WHERE tenant_id = ? AND customer_id = ?", T, hd.id))
  && Boolean(await get("SELECT 1 AS x FROM consents WHERE tenant_id = ? AND customer_id = ?", T, hk.id)), "แยกคืนได้ พร้อมสถานะความยินยอมเดิมของทั้งสองคน");

const chain = await verifyAuditChain(T);
ok(chain.ok, "บันทึกตรวจสอบต่อเนื่องครบหลังรวม/แยกทุกครั้ง");

for (const line of out) console.log(line);
const failed = out.filter((l) => l.startsWith("FAIL"));
if (failed.length) {
  console.log(`\n=== FAIL ${failed.length} ข้อ ===`);
  process.exit(1);
}
console.log(`\n=== ผ่านทั้งหมด ${out.length} ข้อ ===`);
