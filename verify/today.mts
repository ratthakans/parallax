/* ── หน้า "วันนี้" (docs/solo-plan.md S1) ─────────────────────────

   คิวเดียวของคนที่ถือหลายบทบาท: ต้องหยุด → ครบกำหนด → เลยกำหนด → รอตรวจที่กระทบงาน → บัญชีที่เงียบ
   ตรวจว่าคิวไม่เป็นทางรั่ว (ชื่อที่ถูกปิดบัง · บัญชีอื่น) และไม่เป็นทางลัดข้ามนโยบาย (งานติดต่อตรวจซ้ำตอนแสดง)
   ข้อมูลทั้งหมดเป็นชื่อสมมุติ โดเมน .example */
import "./isolate.mts";
import { createHash, randomUUID } from "node:crypto";
import { ensureReady } from "@/lib/engine/bootstrap";
import { all, get, run } from "@/lib/engine/sql";
import { ensurePurpose, registerSource } from "@/lib/engine/vault/sources";
import { commitUpload } from "@/lib/engine/vault/intake";
import { resolveTenant } from "@/lib/engine/vault/resolve";
import { setBasis } from "@/lib/engine/policy";
import { recordPreference } from "@/lib/engine/policy/preferences";
import { assignTarget, buildTargets, createCampaign, getCampaign } from "@/lib/engine/campaigns";
import { MASKED_PERSON } from "@/lib/engine/accounts";
import { acknowledgeItem, snoozeItem, todayQueue } from "@/lib/engine/today";
import { MAX_SNOOZES, type QueueItem, type TodayQueue } from "@/lib/shared/today";
import { bangkokDay } from "@/lib/shared/format";

const out: string[] = [];
const ok = (c: boolean, m: string) => out.push(`${c ? "PASS" : "FAIL"}  ${m}`);
const T = "hongmove";
const BD = "bd@verify";
const me = { id: BD, clearance: "confidential" as const };
await ensureReady();

/* ── ข้อมูลตั้งต้น: สี่คน สี่บริษัท ตำแหน่งการตลาดทั้งหมด ── */
const MAP = { 0: "first_name", 1: "last_name", 2: "company", 3: "job_title", 4: "email", 5: "phone", 6: "occurred_at" };
const src = await registerSource(T, {
  name: "รายชื่อสมมุติสำหรับตรวจหน้าวันนี้", kind: "file", newPurpose: "ขายสปอนเซอร์ (วันนี้)",
  acquisitionNote: "ข้อมูลสมมุติที่เขียนขึ้นในชุดตรวจ ไม่ใช่ข้อมูลของใคร", fields: Object.values(MAP),
}, "verify");
if (!src.ok) throw new Error(src.error);
const recent = new Date(Date.now() - 20 * 864e5).toISOString().slice(0, 10);
const bytes = new TextEncoder().encode([
  "ชื่อ,นามสกุล,บริษัท,ตำแหน่ง,อีเมล,โทรศัพท์,วันที่",
  `อรุณ,แสงทอง,บริษัท อรุณรุ่ง จำกัด,ผู้จัดการฝ่ายการตลาด,arun@arunrung.example,081-555-4001,${recent}`,
  `บุษบา,ใบไม้,บริษัท ใบไม้เขียว จำกัด,ผู้จัดการฝ่ายการตลาด,butsaba@baimai.example,081-555-4002,${recent}`,
  `ชาตรี,ชายทะเล,บริษัท ชายหาด จำกัด,ผู้อำนวยการฝ่ายการตลาด,chatree@chaihat.example,081-555-4003,${recent}`,
  `ดารา,ดาวเด่น,บริษัท ดาวเด่น จำกัด,ผู้จัดการฝ่ายการตลาด,dara@daoden.example,081-555-4004,${recent}`,
].join("\n"));
const c = await commitUpload(T, src.id, bytes, "วันนี้.csv", MAP, createHash("sha256").update(bytes).digest("hex"), "verify");
if (!c.ok) throw new Error(c.error);
await resolveTenant(T, "verify");
const who = async (first: string) => (await get<{ id: string }>(
  "SELECT DISTINCT c.id FROM customers c JOIN import_rows r ON r.customer_id = c.id AND r.tenant_id = c.tenant_id WHERE c.tenant_id = ? AND r.batch_id = ? AND c.name LIKE ?",
  T, c.batchId, `${first}%`))!.id;
const arun = await who("อรุณ"), butsaba = await who("บุษบา"), chatree = await who("ชาตรี"), dara = await who("ดารา");
const orgOf = async (id: string) => (await get<{ org_id: string }>("SELECT org_id FROM affiliations WHERE tenant_id = ? AND customer_id = ? AND valid_to IS NULL", T, id))!.org_id;

const SALES = await ensurePurpose(T, "ขายสปอนเซอร์ (วันนี้)", "verify");
await setBasis(T, SALES, { lawfulBasis: "legitimate_interest", liaRef: "LIA-TODAY-01 (สมมุติ)" }, "dpo@verify");
const camp = await createCampaign(T, {
  name: "แคมเปญหน้าวันนี้ (สมมุติ)", purposeId: SALES, channel: "email", messageKind: "marketing",
  criteria: { titleKeywords: ["การตลาด"], maxPerOrg: 2 },
}, BD);
if (!camp.ok) throw new Error(camp.error);
const built = await buildTargets(T, camp.id, BD);
if (!built.ok) throw new Error(built.error);
const view = (await getCampaign(T, camp.id))!;
const target = (id: string) => view.targets.find((t) => t.customerId === id)!;

const today = bangkokDay();
const yesterday = bangkokDay(Date.now() - 864e5);
const inFive = bangkokDay(Date.now() + 5 * 864e5);
for (const [id, due] of [[arun, today], [butsaba, yesterday], [chatree, inFive], [dara, today]] as const) {
  const r = await assignTarget(T, target(id).id, BD, due, BD);
  if (!r.ok) throw new Error(`มอบหมายไม่สำเร็จ: ${r.error}`);
}
const taskOf = async (id: string) => (await get<{ id: string }>(
  "SELECT id FROM tasks WHERE tenant_id = ? AND customer_id = ? AND campaign_id = ? AND status = 'open'", T, id, camp.id))?.id ?? null;
const tArun = (await taskOf(arun))!, tButsaba = (await taskOf(butsaba))!, tChatree = (await taskOf(chatree))!;

const find = (q: TodayQueue, kind: QueueItem["kind"], id: string) =>
  q.sections.flatMap((s) => s.items).find((i) => i.kind === kind && i.id === id) ?? null;
const ids = (q: TodayQueue) => q.sections.flatMap((s) => s.items.map((i) => `${i.section}:${i.kind}:${i.id}`));

// ── ครบกำหนด · เลยกำหนด · ยังไม่ถึง ──
let q = await todayQueue(T, me);
ok(find(q, "task", tArun)?.section === "due", "งานที่ครบกำหนดวันนี้อยู่หมวดครบกำหนด");
ok(find(q, "task", tButsaba)?.section === "overdue", "งานที่เลยกำหนดอยู่หมวดเลยกำหนด");
ok(find(q, "task", tChatree) === null, "งานที่ครบกำหนดอีกห้าวันยังไม่ขึ้น");
ok(find(q, "task", tArun)?.eligibility?.status === "eligible", "งานติดต่อแสดงสถานะนโยบาย ณ ตอนแสดง");
ok(find(q, "task", tArun)?.href === `/app/sales/${camp.id}`, "งานแคมเปญลิงก์ไปหน้าแคมเปญ");
ok((await todayQueue(T, { id: "someone-else@verify", clearance: "confidential" }).then((x) => find(x, "task", tArun))) === null,
  "งานของคนอื่นไม่ขึ้นในคิวของเรา");

// ── ตรวจนโยบายซ้ำตอนแสดง โดยไม่เขียนผลกลับ ──
await run("UPDATE customers SET lifecycle_state = 'needs_review' WHERE tenant_id = ? AND id = ?", T, arun);
q = await todayQueue(T, me);
ok(find(q, "task", tArun)?.eligibility?.status === "review_required", "คนที่ถูกส่งกลับไปทบทวน: งานขึ้นว่าต้องตรวจก่อนติดต่อ");
const stored = await get<{ eligibility: string }>("SELECT eligibility FROM campaign_targets WHERE tenant_id = ? AND id = ?", T, target(arun).id);
ok(stored?.eligibility === "eligible", "หน้าวันนี้ไม่เขียนผลนโยบายกลับลงเป้าหมาย (อ่านอย่างเดียว)");
await run("UPDATE customers SET lifecycle_state = 'confirmed' WHERE tenant_id = ? AND id = ?", T, arun);

// ── ต้องหยุด: ถอนความยินยอม → งานหายจากหมวดติดต่อ และขึ้นในหมวดต้องหยุด ──
const tDara = (await taskOf(dara))!;
const w = await recordPreference(T, dara, { kind: "withdrawal", purposeId: SALES, evidence: "อีเมลตอบกลับ (สมมุติ)" }, "dpo@verify");
if (!w.ok) throw new Error(w.error);
q = await todayQueue(T, me);
const pref = (await get<{ id: string }>("SELECT id FROM preferences WHERE tenant_id = ? AND customer_id = ? AND kind = 'withdrawal'", T, dara))!.id;
const stop = find(q, "preference", pref);
ok(stop?.section === "stop" && stop.detail.some((d) => /ยกเลิกเป้าหมาย.*1/.test(d)), "ถอนความยินยอมขึ้นหมวดต้องหยุด พร้อมจำนวนเป้าหมายที่ถูกยกเลิก");
ok(find(q, "task", tDara) === null, "งานติดต่อของคนที่ถอนความยินยอมไม่อยู่ในคิวแล้ว");
ok(q.sections[0].section === "stop", "หมวดต้องหยุดอยู่บนสุดเสมอ");
ok(!(await snoozeItem(T, BD, "preference", pref, bangkokDay(Date.now() + 864e5))).ok, "รายการที่ต้องหยุดเลื่อนไม่ได้");
ok((await acknowledgeItem(T, BD, "preference", pref)).ok && find(await todayQueue(T, me), "preference", pref) === null, "รับทราบแล้วหายจากคิว");
ok(find(await todayQueue(T, { id: "dpo@verify", clearance: "confidential" }), "preference", pref) !== null,
  "การรับทราบเป็นของแต่ละคน — อีกคนยังเห็น");

// ── เลื่อน ──
const tomorrow = bangkokDay(Date.now() + 864e5);
ok((await snoozeItem(T, BD, "task", tButsaba, tomorrow)).ok, "เลื่อนงานไปพรุ่งนี้ได้");
ok(find(await todayQueue(T, me), "task", tButsaba) === null, "งานที่เลื่อนไม่ขึ้นวันนี้");
ok(find(await todayQueue(T, me, new Date(Date.now() + 2 * 864e5)), "task", tButsaba) !== null, "ถึงวันที่เลื่อนไป งานกลับมา");
ok(!(await snoozeItem(T, BD, "task", tButsaba, today)).ok, "เลื่อนไปวันนี้หรือย้อนหลังไม่ได้");
ok(!(await snoozeItem(T, BD, "task", randomUUID(), tomorrow)).ok, "เลื่อนรายการที่ไม่มีอยู่ไม่ได้");
for (let i = 1; i < MAX_SNOOZES; i++) await snoozeItem(T, BD, "task", tButsaba, tomorrow);
ok(!(await snoozeItem(T, BD, "task", tButsaba, tomorrow)).ok, `เลื่อนเกิน ${MAX_SNOOZES} ครั้งไม่ได้ — ต้องทำหรือยกเลิก`);
await run("DELETE FROM queue_marks WHERE tenant_id = ? AND user_id = ? AND item_id = ?", T, BD, tButsaba);

// ── รอตรวจ: เฉพาะที่กระทบงานขึ้นเป็นรายการ ที่เหลือนับ ──
const stranger = (await get<{ id: string }>(
  "SELECT id FROM customers WHERE tenant_id = ? AND id NOT IN (SELECT customer_id FROM campaign_targets WHERE tenant_id = ?) LIMIT 1", T, T))!.id;
const stranger2 = (await get<{ id: string }>(
  "SELECT id FROM customers WHERE tenant_id = ? AND id NOT IN (SELECT customer_id FROM campaign_targets WHERE tenant_id = ?) AND id <> ? LIMIT 1", T, T, stranger))!.id;
const before = (await todayQueue(T, me)).reviewsNotBlocking;
const rBlock = randomUUID(), rIdle = randomUUID();
const at = new Date().toISOString();
await run("INSERT INTO review_items (id, tenant_id, kind, subject_ids, signals, confidence, status, created_at) VALUES (?,?,?,?,?,?,?,?)",
  rBlock, T, "person_pair", JSON.stringify([butsaba, stranger]), JSON.stringify(["same_name_same_org"]), 0.6, "open", at);
await run("INSERT INTO review_items (id, tenant_id, kind, subject_ids, signals, confidence, status, created_at) VALUES (?,?,?,?,?,?,?,?)",
  rIdle, T, "person_pair", JSON.stringify([stranger, stranger2]), JSON.stringify(["same_name_same_org"]), 0.6, "open", at);
q = await todayQueue(T, me);
ok(find(q, "review", rBlock)?.section === "review", "คู่ที่มีคนในแคมเปญที่ยังเปิดขึ้นในหมวดรอตรวจ");
ok(find(q, "review", rIdle) === null && q.reviewsNotBlocking === before + 1, "คู่ที่ไม่กระทบงานไม่ขึ้นเป็นรายการ แต่นับจำนวน");

// ── ปิดบัง: คนระดับจำกัดสูงไม่รั่วผ่านชื่องานหรือคิวตรวจ ──
await run("UPDATE customers SET classification = 'restricted_high' WHERE tenant_id = ? AND id = ?", T, butsaba);
q = await todayQueue(T, me);
const masked = find(q, "task", tButsaba);
ok(masked !== null && !/บุษบา/.test(masked.title) && masked.title.includes(MASKED_PERSON), "ชื่อคนระดับจำกัดสูงในชื่องานถูกปิดบัง");
ok(!/บุษบา/.test(find(q, "review", rBlock)?.title ?? "บุษบา"), "ชื่อคนระดับจำกัดสูงในคิวตรวจถูกปิดบัง");
ok(/บุษบา/.test(find(await todayQueue(T, { id: BD, clearance: "restricted_high" }), "task", tButsaba)?.title ?? ""),
  "ผู้มีสิทธิ์ระดับจำกัดสูงเห็นชื่อจริง");
await run("UPDATE customers SET classification = 'confidential' WHERE tenant_id = ? AND id = ?", T, butsaba);

// ── บัญชีที่เงียบ ──
const quietOrg = await orgOf(chatree);
const oppAt = new Date(Date.now() - 60 * 864e5).toISOString();
await run("INSERT INTO opportunities (id, tenant_id, org_id, name, stage, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
  randomUUID(), T, quietOrg, "ข้อเสนอสปอนเซอร์ (สมมุติ)", "proposal", oppAt, oppAt);
q = await todayQueue(T, me);
ok(find(q, "org", quietOrg)?.section === "quiet", "บัญชีที่มีโอกาสเปิดแต่ไม่มีปฏิสัมพันธ์ขึ้นในหมวดบัญชีที่เงียบ");
await run("INSERT INTO interactions (id, tenant_id, kind, occurred_at, org_id, summary, owner_id, recorded_at) VALUES (?,?,?,?,?,?,?,?)",
  randomUUID(), T, "call", new Date().toISOString(), quietOrg, "โทรติดตาม (สมมุติ)", BD, new Date().toISOString());
ok(find(await todayQueue(T, me), "org", quietOrg) === null, "มีปฏิสัมพันธ์ล่าสุดแล้ว บัญชีหายจากหมวดเงียบ");
await run("UPDATE orgs SET classification = 'restricted_high' WHERE tenant_id = ? AND id = ?", T, quietOrg);
await run("DELETE FROM interactions WHERE tenant_id = ? AND org_id = ?", T, quietOrg);
ok(find(await todayQueue(T, me), "org", quietOrg) === null, "บัญชีเงียบที่ระดับเกินสิทธิ์และไม่ได้เป็นเจ้าของไม่ขึ้นเลย");
await run("UPDATE orgs SET classification = 'confidential' WHERE tenant_id = ? AND id = ?", T, quietOrg);

// ── ลำดับคงที่ · ไม่ข้ามบัญชี ──
const fixed = new Date();
ok(JSON.stringify(ids(await todayQueue(T, me, fixed))) === JSON.stringify(ids(await todayQueue(T, me, fixed))), "รันซ้ำบนข้อมูลเดียวกันได้ลำดับเดิม");
const otherTenant = (await all<{ id: string }>("SELECT id FROM tenants WHERE id <> ? ORDER BY id LIMIT 1", T))[0]?.id;
if (otherTenant) {
  const mine = new Set(ids(await todayQueue(T, me)).map((x) => x.split(":").slice(1).join(":")));
  ok(!ids(await todayQueue(otherTenant, me)).some((x) => mine.has(x.split(":").slice(1).join(":"))), "บัญชีอื่นไม่เห็นรายการของบัญชีนี้");
  ok(!(await snoozeItem(otherTenant, BD, "task", tArun, tomorrow)).ok, "เลื่อนงานของบัญชีอื่นไม่ได้");
}

for (const line of out) console.log(line);
const failed = out.filter((l) => l.startsWith("FAIL"));
if (failed.length) {
  console.log(`\n=== FAIL ${failed.length} ข้อ ===`);
  process.exit(1);
}
console.log(`\n=== ผ่านทั้งหมด ${out.length} ข้อ ===`);
