/* ── งาน (docs/ux-plan.md U5) ──────────────────────────────────────────────
   มุมมองถูก · ปิดงานทั่วไปได้ · งานแคมเปญปิดที่นี่ไม่ได้ (ต้องบันทึกผลที่แคมเปญ) · งานของบริษัทเกินสิทธิ์ไม่โผล่ */
import "./isolate.mts";
import { randomUUID } from "node:crypto";
import { ensureReady } from "@/lib/engine/bootstrap";
import { run } from "@/lib/engine/sql";
import { completeTask, createTask, listTasks, updateTask } from "@/lib/engine/tasks";
import { bangkokDay } from "@/lib/shared/format";

const out: string[] = [];
const ok = (c: boolean, m: string) => out.push(`${c ? "PASS" : "FAIL"}  ${m}`);
const T = "hongmove";
const ME = { id: "bd@verify", clearance: "confidential" as const };
await ensureReady();
const now = new Date().toISOString();
const day = (n: number) => bangkokDay(Date.now() + n * 864e5);
const org = async (cls: string, owner: string | null = null) => {
  const id = `o-${randomUUID().slice(0, 8)}`;
  await run("INSERT INTO orgs (id, tenant_id, name, name_norm, classification, account_owner_id, lifecycle_state, recorded_at, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
    id, T, `บริษัท ${id} (สมมุติ)`, id, cls, owner, "confirmed", now, now);
  return id;
};
const task = async (title: string, due: string | null, owner: string | null, orgId: string | null, extra: { target?: string } = {}) => {
  const id = randomUUID();
  await run(`INSERT INTO tasks (id, tenant_id, title, status, due_at, owner_id, org_id, customer_id, opportunity_id, outcome, created_by, created_at, done_at, campaign_id, target_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, T, title, "open", due, owner, orgId, null, null, null, "verify", now, null, extra.target ? "camp-x" : null, extra.target ?? null);
  return id;
};
const A = await org("confidential");
const SECRET = await org("restricted_high", "boss@verify");
const tToday = await task("โทรนัดวันนี้", day(0), ME.id, A);
const tLate = await task("ส่งเอกสารที่เลยกำหนด", day(-3), ME.id, A);
const tOther = await task("งานของคนอื่น", day(2), "other@verify", A);
const tCamp = await task("งานแคมเปญ", day(1), ME.id, A, { target: "target-x" });
const tSecret = await task("งานบริษัทลับ", day(1), "boss@verify", SECRET);

const ids = (xs: { id: string }[]) => xs.map((x) => x.id);
const mine = ids(await listTasks(T, "mine", ME));
ok(mine.includes(tToday) && mine.includes(tLate) && !mine.includes(tOther), "งานของฉัน = งานเปิดที่ฉันเป็นเจ้าของ");
ok(ids(await listTasks(T, "today", ME)).includes(tToday) && !ids(await listTasks(T, "today", ME)).includes(tLate), "ครบกำหนดวันนี้");
ok(ids(await listTasks(T, "overdue", ME)).includes(tLate) && !ids(await listTasks(T, "overdue", ME)).includes(tToday), "เลยกำหนด");
const open = ids(await listTasks(T, "open", ME));
ok(open.includes(tOther) && !open.includes(tSecret), "ทั้งหมดที่เปิด · งานของบริษัทเกินสิทธิ์ไม่โผล่");
ok(ids(await listTasks(T, "open", { id: "boss@verify", clearance: "confidential" })).includes(tSecret), "เจ้าของบัญชีของบริษัทนั้นยังเห็นงาน");

const camp = await completeTask(T, tCamp, "", ME);
ok(!camp.ok && /แคมเปญ/.test(camp.error), "งานแคมเปญปิดที่นี่ไม่ได้ — ต้องบันทึกผลที่แคมเปญ");
ok(!(await completeTask(T, tSecret, "", ME)).ok, "ปิดงานของบริษัทเกินสิทธิ์ไม่ได้");
ok((await completeTask(T, tToday, "นัดได้แล้ว", ME)).ok, "ปิดงานทั่วไปได้");
const done = await listTasks(T, "done", ME);
ok(done.some((t) => t.id === tToday && t.outcome === "นัดได้แล้ว") && !ids(await listTasks(T, "mine", ME)).includes(tToday), "งานที่ปิดย้ายไปเสร็จแล้ว พร้อมผล");
ok(!(await completeTask(T, tToday, "", ME)).ok, "ปิดซ้ำไม่ได้");

// ── E1 · สร้างและแก้งาน (docs/crm-plan.md) ──
const pid = `c-${randomUUID().slice(0, 12)}`;
await run("INSERT INTO customers (id, tenant_id, name, created_at) VALUES (?,?,?,?)", pid, T, "คนในบริษัท A (สมมุติ)", now);
await run("INSERT INTO affiliations (id, tenant_id, customer_id, org_id, title, valid_from, valid_to, last_seen_at, source_id, recorded_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
  `a-${randomUUID().slice(0, 12)}`, T, pid, A, null, day(-30), null, now, null, now);
const dealId = randomUUID();
await run("INSERT INTO opportunities (id, tenant_id, org_id, name, stage, owner_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)", dealId, T, A, "ดีลของ A (สมมุติ)", "open", ME.id, now, now);
const B = await org("confidential");
ok(!(await createTask(T, { title: "x" }, ME)).ok && !(await createTask(T, { title: "ส่งเอกสาร", due: "พรุ่งนี้" }, ME)).ok, "ชื่องานสั้นเกิน · วันที่ผิดรูป = ไม่สร้าง");
const c1 = await createTask(T, { title: "ส่งใบเสนอราคา (สมมุติ)", due: day(3), dealId }, ME);
const t1 = c1.ok ? (await listTasks(T, "open", ME, new Date(), { dealId })).find((t) => t.id === c1.id) : undefined;
ok(Boolean(t1) && t1?.orgId === A && t1?.owner === ME.id && t1?.deal === "ดีลของ A (สมมุติ)", "งานจากดีล: บริษัทมาจากดีลเอง · ผู้รับเริ่มต้น = ผู้สร้าง");
ok((await listTasks(T, "open", ME, new Date(), { orgId: A })).some((t) => c1.ok && t.id === c1.id), "งานของดีลขึ้นที่หน้าบริษัทด้วย");
ok(!(await createTask(T, { title: "ผิดบริษัท (สมมุติ)", orgId: B, dealId }, ME)).ok, "ดีลกับบริษัทไม่ตรงกัน = ไม่สร้าง");
ok(!(await createTask(T, { title: "คนนอกบริษัท (สมมุติ)", orgId: B, personId: pid }, ME)).ok, "คนที่ไม่ได้สังกัดบริษัทนั้น = ไม่สร้าง");
const c2 = await createTask(T, { title: "โทรหา (สมมุติ)", personId: pid, owner: "other@verify" }, ME);
const t2 = c2.ok ? (await listTasks(T, "open", ME, new Date(), { personId: pid })).find((t) => t.id === c2.id) : undefined;
ok(t2?.orgId === A && t2?.owner === "other@verify", "งานจากคน: ใช้บริษัทปัจจุบันของเขา · มอบให้คนอื่นได้");
ok(!(await createTask(T, { title: "งานบริษัทลับ (สมมุติ)", orgId: SECRET }, ME)).ok, "สร้างงานในบริษัทที่เกินสิทธิ์ไม่ได้");
ok(!(await createTask("mst-golf", { title: "ข้ามบัญชี (สมมุติ)", dealId }, ME)).ok, "สร้างงานผูกดีลข้ามบัญชีไม่ได้");
if (c1.ok) {
  ok((await updateTask(T, c1.id, { due: day(10), owner: "other@verify" }, ME)).ok, "เลื่อนวันและเปลี่ยนผู้รับได้");
  const u = (await listTasks(T, "open", ME, new Date(), { dealId })).find((t) => t.id === c1.id);
  ok(u?.due === day(10) && u?.owner === "other@verify", "ค่าใหม่ถูกบันทึก");
  ok(!(await updateTask(T, c1.id, { due: "13/13/2026" }, ME)).ok && !(await updateTask(T, c1.id, { owner: " " }, ME)).ok, "วันที่ผิดรูป · ผู้รับว่าง = ไม่บันทึก");
  await completeTask(T, c1.id, "", ME);
  ok(!(await updateTask(T, c1.id, { due: day(1) }, ME)).ok, "งานที่ปิดแล้วแก้ไม่ได้");
}
ok(!(await updateTask(T, tCamp, { due: day(5) }, ME)).ok, "งานแคมเปญเลื่อนที่นี่ไม่ได้ (มอบหมายใหม่ที่แคมเปญ)");

// ── ความสำคัญของงาน ──
const lo = await createTask(T, { title: "งานไม่รีบ (สมมุติ)", due: day(4), priority: "low" }, ME);
const hi = await createTask(T, { title: "งานด่วน (สมมุติ)", due: day(4), priority: "high" }, ME);
const no = await createTask(T, { title: "งานปกติ (สมมุติ)", due: day(4), priority: "urgent!!" }, ME);
const order = (await listTasks(T, "mine", ME)).filter((t) => [lo, hi, no].some((x) => x.ok && x.id === t.id)).map((t) => t.priority).join();
ok(order === "high,normal,low", "วันเดียวกัน: ด่วนก่อน · ค่าที่ไม่รู้จัก = ปกติ");
ok(lo.ok && (await updateTask(T, lo.id, { priority: "high" }, ME)).ok && (await listTasks(T, "mine", ME)).find((t) => t.id === lo.id)?.priority === "high", "เปลี่ยนความสำคัญได้");

for (const line of out) console.log(line);
const failed = out.filter((l) => l.startsWith("FAIL"));
if (failed.length) { console.log(`\n=== FAIL ${failed.length} ข้อ ===`); process.exit(1); }
console.log(`\n=== ผ่านทั้งหมด ${out.length} ข้อ ===`);
