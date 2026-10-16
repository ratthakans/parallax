/* ── งาน (docs/ux-plan.md U5) ──────────────────────────────────────────────
   มุมมองถูก · ปิดงานทั่วไปได้ · งานแคมเปญปิดที่นี่ไม่ได้ (ต้องบันทึกผลที่แคมเปญ) · งานของบริษัทเกินสิทธิ์ไม่โผล่ */
import "./isolate.mts";
import { randomUUID } from "node:crypto";
import { ensureReady } from "@/lib/engine/bootstrap";
import { run } from "@/lib/engine/sql";
import { completeTask, listTasks } from "@/lib/engine/tasks";
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

for (const line of out) console.log(line);
const failed = out.filter((l) => l.startsWith("FAIL"));
if (failed.length) { console.log(`\n=== FAIL ${failed.length} ข้อ ===`); process.exit(1); }
console.log(`\n=== ผ่านทั้งหมด ${out.length} ข้อ ===`);
