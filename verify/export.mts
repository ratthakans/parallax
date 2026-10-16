/* ── ส่งออกแบบขออนุมัติ (docs/plan.md B6 · docs/solo-plan.md หัวข้อ 6.1) ─────────

   ไม่มีการส่งออกทันที: ขอพร้อมเหตุผล → อนุมัติ → ผู้ขอดาวน์โหลดครั้งเดียวภายใน 24 ชั่วโมง
   เจ้าของคนเดียวอนุมัติตัวเองได้ แต่ต้องรอ 1 ชั่วโมง (ยกเลิกได้ระหว่างรอ)
   กติกา "ต้องให้เจ้าของอีกคนอนุมัติ" ต้องมีสมาชิกจริง จึงตรวจใน verify:pg ข้อ 12
   ข้อมูลทั้งหมดเป็นชื่อสมมุติ โดเมน .example */
import "./isolate.mts";
import { ensureReady } from "@/lib/engine/bootstrap";
import { all, get } from "@/lib/engine/sql";
import { createCustomer } from "@/lib/engine/customers";
import { approveExport, cancelExport, downloadExport, listExports, requestExport, scopeFrom } from "@/lib/engine/exports";

const out: string[] = [];
const ok = (c: boolean, m: string) => out.push(`${c ? "PASS" : "FAIL"}  ${m}`);
const T = "hongmove";
const OWNER = "owner@verify", OTHER = "partner@verify";
await ensureReady();
await createCustomer(T, { name: "ส่งออก ทดสอบ", contacts: [{ kind: "email", value: "export@song-ok.example" }], profile: {}, consent: true }, "verify");

const t0 = new Date();
const at = (ms: number) => new Date(+t0 + ms);
const H = 3600e3;

// ── ขอ ──
ok(!(await requestExport(T, scopeFrom({}), "ใช้", OWNER, t0)).ok, "ต้องมีเหตุผลที่ใช้ไฟล์");
const scope = scopeFrom({ q: "ส่งออก", filter: "consent", sort: "name" });
const a = await requestExport(T, scope, "ส่งรายชื่อให้ทีมงานหน้างาน (สมมุติ)", OWNER, t0);
ok(a.ok, "ขอส่งออกพร้อมเหตุผลได้");
const id = a.ok ? a.id : "";
ok(!(await downloadExport(T, id, OWNER, t0)).ok, "ยังไม่อนุมัติ = ดาวน์โหลดไม่ได้");
ok(scopeFrom({ filter: "'; DROP TABLE x", sort: "bogus" }).filter === "all", "ตัวกรองที่ไม่รู้จักกลายเป็นค่าเริ่มต้น");
const logs = JSON.stringify(await all("SELECT detail FROM activity_log WHERE tenant_id = ? AND action = 'export_request'", T));
ok(!logs.includes(scope.q!), "log ของคำขอไม่บันทึกคำค้น");

// ── อนุมัติตัวเอง (เจ้าของคนเดียว) = รอ 1 ชั่วโมง ──
const self = await approveExport(T, id, OWNER, t0);
ok(self.ok && self.self && Date.parse(self.readyAt) === +t0 + H, "เจ้าของคนเดียวอนุมัติตัวเองได้ แต่พร้อมหลัง 1 ชั่วโมง");
ok(!(await approveExport(T, id, OWNER, t0)).ok, "อนุมัติซ้ำไม่ได้");
const early = await downloadExport(T, id, OWNER, at(30 * 60e3));
ok(!early.ok && /ตั้งแต่/.test(early.error), "ระหว่างช่วงรอดาวน์โหลดไม่ได้");
ok(!(await downloadExport(T, id, OTHER, at(2 * H))).ok, "คนอื่นที่ไม่ใช่ผู้ขอดาวน์โหลดไม่ได้");
const got = await downloadExport(T, id, OWNER, at(2 * H));
ok(got.ok && got.rows === 1 && got.csv.includes("export@song-ok.example"), "ครบช่วงรอแล้วผู้ขอดาวน์โหลดได้ ตามขอบเขตที่ขอ");
ok(!(await downloadExport(T, id, OWNER, at(2 * H + 1000))).ok, "ดาวน์โหลดได้ครั้งเดียว");
const row = (await listExports(T, at(3 * H))).find((r) => r.id === id);
ok(row?.stage === "done" && row.rowCount === 1, "บันทึกว่าดาวน์โหลดแล้วกี่แถว");

// ── ยกเลิกระหว่างรอ · หมดเวลา ──
const b = await requestExport(T, scopeFrom({}), "ทดสอบยกเลิกระหว่างรอ (สมมุติ)", OWNER, t0);
if (b.ok) await approveExport(T, b.id, OWNER, t0);
ok(b.ok && (await cancelExport(T, b.id, OWNER, at(10 * 60e3))).ok && !(await downloadExport(T, b.id, OWNER, at(2 * H))).ok,
  "ยกเลิกระหว่างช่วงรอแล้วดาวน์โหลดไม่ได้");
const c = await requestExport(T, scopeFrom({}), "ทดสอบหมดเวลาดาวน์โหลด (สมมุติ)", OWNER, t0);
const cAp = c.ok ? await approveExport(T, c.id, OTHER, t0) : null;
ok(Boolean(cAp?.ok && !cAp.self && Date.parse(cAp.readyAt) === +t0), "อีกคนอนุมัติ = พร้อมทันที ไม่ต้องรอ");
const late = c.ok ? await downloadExport(T, c.id, OWNER, at(25 * H)) : null;
ok(Boolean(late && !late.ok && /เลยเวลา/.test(late.error)), "เกิน 24 ชั่วโมงหลังพร้อม = หมดเวลา ต้องขอใหม่");

// ── audit ──
const acts = (await all<{ action: string }>("SELECT action FROM activity_log WHERE tenant_id = ? AND action LIKE 'export%'", T)).map((x) => x.action);
ok(["export_request", "export_self_approve", "export_approve", "export_cancel", "export_customers"].every((x) => acts.includes(x)), "ทุกขั้นอยู่ในบันทึกกิจกรรม");
ok(!JSON.stringify(await get("SELECT * FROM export_requests WHERE id = ?", id)).includes("export@song-ok"), "แถวคำขอไม่มีค่าจากไฟล์");

for (const line of out) console.log(line);
const failed = out.filter((l) => l.startsWith("FAIL"));
if (failed.length) {
  console.log(`\n=== FAIL ${failed.length} ข้อ ===`);
  process.exit(1);
}
console.log(`\n=== ผ่านทั้งหมด ${out.length} ข้อ ===`);
