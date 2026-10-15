/* ── อายุข้อมูล (docs/plan.md หัวข้อ 7.5 · B6 ส่วนแรก) ─────────────────────────

   วันครบอายุ = วันเริ่มนับตามเหตุของวัตถุประสงค์ + ระยะเวลา · คนหลายวัตถุประสงค์ใช้วันที่ช้าที่สุด
   ไม่มีกฎ = "ไม่มีกฎอายุ" (ไม่ใช่เก็บตลอดไป) · legal hold = ไม่ครบ · ความยินยอมที่ยังไม่ถอน = ยังไม่เริ่มนับ
   ระบบไม่ลบเอง — รายการที่ครบอายุขึ้นในหน้า "วันนี้" ให้คนตัดสิน
   ข้อมูลทั้งหมดเป็นชื่อสมมุติ โดเมน .example */
import "./isolate.mts";
import { createHash, randomUUID } from "node:crypto";
import { ensureReady } from "@/lib/engine/bootstrap";
import { get, run } from "@/lib/engine/sql";
import { ensurePurpose, registerSource } from "@/lib/engine/vault/sources";
import { commitUpload } from "@/lib/engine/vault/intake";
import { resolveTenant } from "@/lib/engine/vault/resolve";
import { recordPreference } from "@/lib/engine/policy/preferences";
import { deleteCustomer } from "@/lib/engine/customers";
import { retentionForPeople, retentionSummary, setRetentionRule } from "@/lib/engine/retention";
import { todayQueue } from "@/lib/engine/today";
import { MASKED_PERSON } from "@/lib/engine/accounts";
import type { TodayQueue } from "@/lib/shared/today";

const out: string[] = [];
const ok = (c: boolean, m: string) => out.push(`${c ? "PASS" : "FAIL"}  ${m}`);
const T = "hongmove";
const ME = { id: "owner@verify", clearance: "confidential" as const };
await ensureReady();

const ago = (d: number) => new Date(Date.now() - d * 864e5).toISOString();
const MAP = { 0: "first_name", 1: "last_name", 2: "company", 3: "job_title", 4: "email", 5: "phone", 6: "occurred_at" };
const A = await ensurePurpose(T, "อายุข้อมูล ก (สมมุติ)", "verify");
const B = await ensurePurpose(T, "อายุข้อมูล ข (สมมุติ)", "verify");
const sourceFor = async (purposeId: string, name: string) => {
  const s = await registerSource(T, { name, kind: "file", purposeId, acquisitionNote: "ข้อมูลสมมุติในชุดตรวจ", fields: Object.values(MAP) }, "verify");
  if (!s.ok) throw new Error(s.error);
  return s.id;
};
const srcA = await sourceFor(A, "แหล่ง ก (สมมุติ)"), srcB = await sourceFor(B, "แหล่ง ข (สมมุติ)");
const upload = async (src: string, name: string, lines: string[]) => {
  const bytes = new TextEncoder().encode(["ชื่อ,นามสกุล,บริษัท,ตำแหน่ง,อีเมล,โทรศัพท์,วันที่", ...lines].join("\n"));
  const r = await commitUpload(T, src, bytes, name, MAP, createHash("sha256").update(bytes).digest("hex"), "verify");
  if (!r.ok) throw new Error(r.error);
  await resolveTenant(T, "verify");
  return r.batchId;
};
const d = ago(20).slice(0, 10);
const bA = await upload(srcA, "อายุ-ก.csv", [
  `เก่า,ครบอายุ,บริษัท อายุหนึ่ง จำกัด,ผู้จัดการ,kao@ayu1.example,081-555-8001,${d}`,
  `สอง,วัตถุประสงค์,บริษัท อายุสอง จำกัด,ผู้จัดการ,song@ayu2.example,081-555-8002,${d}`,
  `ลับ,มาก,บริษัท อายุสาม จำกัด,ผู้จัดการ,lab@ayu3.example,081-555-8003,${d}`,
]);
const bB = await upload(srcB, "อายุ-ข.csv", [`สอง,วัตถุประสงค์,บริษัท อายุสอง จำกัด,ผู้จัดการ,song@ayu2.example,081-555-8002,${d}`]);
const who = async (first: string) => (await get<{ id: string }>(
  "SELECT DISTINCT c.id FROM customers c JOIN import_rows r ON r.customer_id = c.id AND r.tenant_id = c.tenant_id WHERE c.tenant_id = ? AND r.batch_id = ? AND c.name LIKE ?",
  T, bA, `${first}%`))!.id;
const kao = await who("เก่า"), song = await who("สอง"), lab = await who("ลับ");
const of = async (id: string) => (await retentionForPeople(T, ME)).find((p) => p.customerId === id)!;
const expiring = (q: TodayQueue) => q.sections.find((s) => s.section === "expiring")?.items ?? [];

// ── วัตถุประสงค์ชื่อไทยที่ขึ้นต้นเหมือนกันต้องเป็นคนละวัตถุประสงค์ (เดิมรหัสชนกันแล้วรวมเป็นอันเดียวเงียบ ๆ) ──
ok(A !== B && (await ensurePurpose(T, "ขายสปอนเซอร์ (ทดสอบรหัส)", "verify")) !== (await ensurePurpose(T, "ขายบูธ (ทดสอบรหัส)", "verify")),
  "ชื่อไทยที่ขึ้นต้นเหมือนกันได้วัตถุประสงค์คนละอัน");
ok((await ensurePurpose(T, "อายุข้อมูล ก (สมมุติ)", "verify")) === A, "ชื่อเดิมได้วัตถุประสงค์เดิม");

// ── ไม่มีกฎ ──
ok((await of(kao)).status === "no_rule" && (await of(kao)).dueAt === null, "วัตถุประสงค์ที่ไม่มีกฎ = ไม่มีกฎอายุ (ไม่ใช่เก็บตลอดไป และไม่ขึ้นว่าครบ)");
ok(!expiring(await todayQueue(T, ME)).some((i) => i.id === kao), "ไม่มีกฎ = ไม่ขึ้นในหน้าวันนี้");

// ── ตรวจค่าที่ตั้ง ──
ok(!(await setRetentionRule(T, A, { days: 10, trigger: "received" }, "owner@verify")).ok, "ระยะเวลาสั้นกว่า 30 วันตั้งไม่ได้");
ok(!(await setRetentionRule(T, A, { days: 365, trigger: "forever" }, "owner@verify")).ok, "เหตุเริ่มนับที่ไม่รู้จักตั้งไม่ได้ (ไม่มีตัวเลือกตลอดไป)");
ok(!(await setRetentionRule(T, A, { days: 365, trigger: "received", legalHold: true }, "owner@verify")).ok, "legal hold ต้องมีเหตุผล");

// ── นับจากวันที่ได้รับข้อมูล ──
await setRetentionRule(T, A, { days: 365, trigger: "received" }, "owner@verify");
ok((await of(kao)).status === "active", "เพิ่งได้รับข้อมูล + เก็บ 365 วัน = ยังไม่ครบ");
await run("UPDATE import_batches SET uploaded_at = ? WHERE tenant_id = ? AND id = ?", ago(400), T, bA);
const k = await of(kao);
ok(k.status === "due" && k.purposes[0].anchor!.slice(0, 10) === ago(400).slice(0, 10), "ได้รับข้อมูลเมื่อ 400 วันก่อน + เก็บ 365 วัน = ครบอายุแล้ว");
let q = await todayQueue(T, ME);
ok(expiring(q).some((i) => i.id === kao && /ครบอายุแล้ว/.test(i.title) && i.href === `/app/customers/${kao}`), "ครบอายุขึ้นในหน้าวันนี้ พร้อมลิงก์ไปหน้าคน");
ok((await of(kao)).dueAt !== null && expiring(q).every((i) => i.eligibility === null), "หน้าวันนี้ไม่ได้ลบเอง — เป็นรายการให้คนตัดสิน");

// ── หลายวัตถุประสงค์: ใช้วันที่ช้าที่สุด ──
ok((await of(song)).status === "no_rule", "มีวัตถุประสงค์หนึ่งที่ยังไม่มีกฎ = ยังไม่มีกฎอายุ (ไม่ตัดสินจากกฎที่มีแค่บางส่วน)");
await setRetentionRule(T, B, { days: 730, trigger: "received" }, "owner@verify");
const s = await of(song);
ok(s.status === "active" && s.purposes.length === 2, "ครบในวัตถุประสงค์ ก แต่ยังไม่ครบใน ข = ยังเก็บได้");
ok(!expiring(await todayQueue(T, ME)).some((i) => i.id === song), "คนที่ยังมีวัตถุประสงค์ที่ใช้ได้ไม่ขึ้นในรายการครบอายุ");

// ── นับจากติดต่อล่าสุด · กฎล่าสุดชนะ ──
await setRetentionRule(T, A, { days: 365, trigger: "last_interaction" }, "owner@verify");
await run("INSERT INTO interactions (id, tenant_id, kind, occurred_at, customer_id, summary, owner_id, recorded_at) VALUES (?,?,?,?,?,?,?,?)",
  randomUUID(), T, "call", ago(10), kao, "คุยกันล่าสุด (สมมุติ)", "owner@verify", ago(10));
ok((await of(kao)).status === "active", "กฎล่าสุดชนะ: นับจากติดต่อล่าสุด และเพิ่งคุยกัน = ยังไม่ครบ");

// ── legal hold ──
await setRetentionRule(T, A, { days: 365, trigger: "received", legalHold: true, note: "คำสั่งเก็บรักษาเอกสาร (สมมุติ)" }, "owner@verify");
ok((await of(kao)).status === "held" && !expiring(await todayQueue(T, ME)).some((i) => i.id === kao), "legal hold = ไม่ครบอายุ และไม่ขึ้นในหน้าวันนี้");
await setRetentionRule(T, A, { days: 365, trigger: "received" }, "owner@verify");

// ── ฐานความยินยอม: นับจากวันที่ถอน ──
await setRetentionRule(T, B, { days: 365, trigger: "withdrawal" }, "owner@verify");
ok((await of(song)).status === "not_started", "ยังไม่ถอนความยินยอม = ยังไม่ถึงเหตุเริ่มนับ");
await recordPreference(T, song, { kind: "withdrawal", purposeId: B, evidence: "ถอนทางอีเมล (สมมุติ)", effectiveAt: ago(400) }, "verify");
ok((await of(song)).status === "due", "ถอนเมื่อ 400 วันก่อน + เก็บหลักฐาน 365 วัน และวัตถุประสงค์อื่นครบแล้ว = ครบอายุ");
await recordPreference(T, song, { kind: "consent", purposeId: B, evidence: "ยินยอมใหม่ (สมมุติ)" }, "verify");
ok((await of(song)).status === "not_started", "ยินยอมใหม่หลังถอน = กลับไปยังไม่ถึงเหตุเริ่มนับ");

// ── ปิดบัง · สรุป · ลบแล้วหาย ──
await run("UPDATE customers SET classification = 'restricted_high' WHERE tenant_id = ? AND id = ?", T, lab);
q = await todayQueue(T, ME);
const masked = expiring(q).find((i) => i.id === lab);
ok(Boolean(masked && masked.title.startsWith(MASKED_PERSON) && !/ลับ มาก/.test(masked.title) && masked.href === null),
  "คนที่เกินสิทธิ์ยังขึ้น (ต้องมีคนจัดการ) แต่ชื่อถูกปิดบังและไม่มีลิงก์");
const sum = await retentionSummary(T);
ok(sum.due >= 1 && sum.people >= 3, `สรุปนับได้ (ครบ ${sum.due} · ไม่มีกฎ ${sum.noRule} · hold ${sum.held})`);
const del = await deleteCustomer(T, kao, "owner@verify");
ok(del.ok && !(await retentionForPeople(T, ME)).some((p) => p.customerId === kao), "ลบคนแล้วไม่อยู่ในรายการอายุข้อมูล");

for (const line of out) console.log(line);
const failed = out.filter((l) => l.startsWith("FAIL"));
if (failed.length) {
  console.log(`\n=== FAIL ${failed.length} ข้อ ===`);
  process.exit(1);
}
console.log(`\n=== ผ่านทั้งหมด ${out.length} ข้อ ===`);
