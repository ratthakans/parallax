/* ── ทะเบียนการลบ (docs/plan.md หัวข้อ 7.5 · B6) ─────────────────────────────

   ลบคนแล้วต้องไม่กลับมา: นำเข้าไฟล์ที่มีคนนั้นอีก · แถวที่รอตรวจในไฟล์อื่น · กู้คืน backup ที่ทำก่อนการลบ
   ทะเบียนเก็บแค่ HMAC เหตุผล เวลา ผู้ลบ — ไม่มีชื่อหรือค่าติดต่อ
   ข้อมูลทั้งหมดเป็นชื่อสมมุติ โดเมน .example */
import "./isolate.mts";
import { createHash } from "node:crypto";
import { ensureReady } from "@/lib/engine/bootstrap";
import { all, get, run } from "@/lib/engine/sql";
import { registerSource } from "@/lib/engine/vault/sources";
import { analyseUpload, commitUpload } from "@/lib/engine/vault/intake";
import { resolveTenant } from "@/lib/engine/vault/resolve";
import { deleteCustomer } from "@/lib/engine/customers";
import { matchKey } from "@/lib/engine/pii";
import { exportErasures, reapplyErasures } from "@/lib/engine/vault/erasure";

const out: string[] = [];
const ok = (c: boolean, m: string) => out.push(`${c ? "PASS" : "FAIL"}  ${m}`);
const T = "hongmove";
await ensureReady();

const MAP = { 0: "first_name", 1: "last_name", 2: "company", 3: "job_title", 4: "email", 5: "phone", 6: "occurred_at" };
const src = await registerSource(T, {
  name: "รายชื่อสมมุติสำหรับตรวจการลบ", kind: "file", newPurpose: "ตรวจทะเบียนการลบ (สมมุติ)",
  acquisitionNote: "ข้อมูลสมมุติในชุดตรวจ", fields: Object.values(MAP),
}, "verify");
if (!src.ok) throw new Error(src.error);
const file = (lines: string[]) => new TextEncoder().encode(["ชื่อ,นามสกุล,บริษัท,ตำแหน่ง,อีเมล,โทรศัพท์,วันที่", ...lines].join("\n"));
const commit = async (name: string, lines: string[], resolve = true) => {
  const bytes = file(lines);
  const r = await commitUpload(T, src.id, bytes, name, MAP, createHash("sha256").update(bytes).digest("hex"), "verify");
  if (!r.ok) throw new Error(r.error);
  if (resolve) await resolveTenant(T, "verify");
  return r;
};
const d = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
const PIM = `พิมพ์,ลบแล้ว,บริษัท ลบออก จำกัด,ผู้จัดการ,pim.erase@lob.example,081-555-9001,${d}`;
const SOM = `สมร,รอตรวจ,บริษัท รอนาน จำกัด,ผู้จัดการ,somorn@ronan.example,081-555-9002,${d}`;
await commit("ชุดแรก.csv", [PIM, SOM]);
const byEmail = async (email: string) => (await get<{ customer_id: string }>(
  "SELECT customer_id FROM contact_points WHERE tenant_id = ? AND kind = 'email' AND value_hmac = ?", T, matchKey(T, "email", email)))?.customer_id ?? null;
const pim = (await byEmail("pim.erase@lob.example"))!;

// ── ลบ = บันทึกทะเบียน (ไม่มีชื่อหรือค่าติดต่อ) ──
const del = await deleteCustomer(T, pim, "dpo@verify", { reason: "request", requestRef: "DSAR-2026-001 (สมมุติ)" });
const reg = await all<{ keys: string; reason: string; request_ref: string | null; deleted_by: string }>("SELECT keys, reason, request_ref, deleted_by FROM deletion_registry WHERE tenant_id = ?", T);
ok(del.ok && reg.length === 1 && JSON.parse(reg[0].keys).length === 2 && reg[0].reason === "request" && reg[0].request_ref === "DSAR-2026-001 (สมมุติ)",
  "ลบตามคำขอ = ทะเบียนเก็บกุญแจของอีเมลและเบอร์ พร้อมเหตุผลและเลขอ้างอิง");
const raw = JSON.stringify(reg);
ok(!/พิมพ์|pim\.erase|081-555-9001|0815559001/.test(raw), "ทะเบียนไม่มีชื่อ อีเมล หรือเบอร์แบบอ่านได้");
ok((await byEmail("pim.erase@lob.example")) === null, "ลบแล้วไม่เหลือช่องทางติดต่อ");

// ── นำเข้าไฟล์ที่มีคนที่ถูกลบอีกครั้ง ──
const again = file([`พิมพ์,ลบแล้ว,บริษัท ใหม่ จำกัด,ผู้อำนวยการ,pim.erase@lob.example,,${d}`, `รุ่ง,ใหม่,บริษัท ใหม่ จำกัด,ผู้จัดการ,rung@mai.example,081-555-9003,${d}`]);
const an = await analyseUpload(T, src.id, again, "ไฟล์เก่าอีกรอบ.csv", "verify");
ok(an.ok && an.estimate.suspended === 1 && an.estimate.pending_review === 1, "ตรวจไฟล์ก่อนนำเข้า: บอกว่าจะพัก 1 แถวที่ตรงกับคนที่ถูกลบ");
const c2 = await commit("ไฟล์เก่าอีกรอบ.csv", [`พิมพ์,ลบแล้ว,บริษัท ใหม่ จำกัด,ผู้อำนวยการ,pim.erase@lob.example,,${d}`, `รุ่ง,ใหม่,บริษัท ใหม่ จำกัด,ผู้จัดการ,rung@mai.example,081-555-9003,${d}`]);
const rows = await all<{ line: number | string; status: string; reason: string | null; payload_enc: string | null; customer_id: string | null }>(
  "SELECT line, status, reason, payload_enc, customer_id FROM import_rows WHERE tenant_id = ? AND batch_id = ? ORDER BY line", T, c2.batchId);
ok(rows[0].status === "suspended" && rows[0].payload_enc === null && /ตามคำขอของเจ้าของข้อมูล/.test(rows[0].reason ?? ""), "แถวที่ตรงถูกพัก ไม่เก็บค่าในแถว พร้อมเหตุผล");
ok((await byEmail("pim.erase@lob.example")) === null, "คนที่ถูกลบไม่ถูกสร้างกลับจากไฟล์เก่า");
ok((await byEmail("rung@mai.example")) !== null, "คนอื่นในไฟล์เดียวกันนำเข้าตามปกติ");
const phoneOnly = await commit("เบอร์อย่างเดียว.csv", [`พิมพ์,ลบแล้ว,บริษัท อื่น จำกัด,ผู้จัดการ,,081-555-9001,${d}`]);
ok((await get<{ status: string }>("SELECT status FROM import_rows WHERE tenant_id = ? AND batch_id = ?", T, phoneOnly.batchId))?.status === "suspended",
  "ตรงแค่เบอร์ก็ถูกพัก");

// ── แถวที่รอตรวจในไฟล์อื่น (ยังไม่ผูกกับคน) ──
const som = (await byEmail("somorn@ronan.example"))!;
const pending = await commit("ยังไม่ตรวจ.csv", [SOM.replace("ผู้จัดการ", "ผู้อำนวยการ")], false);
await deleteCustomer(T, som, "dpo@verify", { reason: "retention" });
await resolveTenant(T, "verify");
const pend = await get<{ status: string; payload_enc: string | null }>("SELECT status, payload_enc FROM import_rows WHERE tenant_id = ? AND batch_id = ?", T, pending.batchId);
ok((await byEmail("somorn@ronan.example")) === null && pend?.status === "suspended" && pend.payload_enc === null,
  "แถวที่รอตรวจในไฟล์อื่นถูกพักในรอบตรวจตัวตนถัดไป — ไม่สร้างคนที่ถูกลบกลับมา");

// ── คนที่ไม่มีอีเมลหรือเบอร์ ──
await commit("ชื่ออย่างเดียว.csv", [`ไร้,ช่องทาง,บริษัท ไร้ จำกัด,ผู้จัดการ,,,${d}`]);
const nameOnly = (await get<{ id: string }>("SELECT id FROM customers WHERE tenant_id = ? AND name LIKE 'ไร้%'", T))?.id;
const before = (await exportErasures(T)).length;
ok(Boolean(nameOnly) && (await deleteCustomer(T, nameOnly!, "verify")).ok && (await exportErasures(T)).length === before,
  "คนที่ไม่มีอีเมล/เบอร์ลบได้ และไม่เพิ่มทะเบียนที่ว่างเปล่า");

// ── กู้คืน backup ที่ทำก่อนการลบ ──
const saved = await exportErasures(T);
await run("DELETE FROM deletion_registry WHERE tenant_id = ?", T); // จำลอง: backup เก่าไม่มีรายการในทะเบียน
await commit("ข้อมูลจาก-backup.csv", [`พิมพ์,ลบแล้ว,บริษัท ลบออก จำกัด,ผู้จัดการ,pim.erase@lob.example,081-555-9001,${d}`]);
ok((await byEmail("pim.erase@lob.example")) !== null, "(จำลอง) หลังกู้ backup เก่า คนที่ถูกลบกลับมา");
const re = await reapplyErasures(T, saved, "restore-runbook");
ok(re.restoredEntries === saved.length && re.erased >= 1 && (await byEmail("pim.erase@lob.example")) === null,
  `ใช้ทะเบียนซ้ำหลังกู้: ใส่ทะเบียนกลับ ${re.restoredEntries} รายการ และลบคนที่กลับมา ${re.erased} คน`);
const again2 = await reapplyErasures(T, saved, "restore-runbook");
ok(again2.restoredEntries === 0 && again2.erased === 0, "ใช้ซ้ำสองครั้งไม่ทำซ้ำ (ไม่ใส่ทะเบียนซ้อน ไม่มีคนให้ลบ)");

for (const line of out) console.log(line);
const failed = out.filter((l) => l.startsWith("FAIL"));
if (failed.length) {
  console.log(`\n=== FAIL ${failed.length} ข้อ ===`);
  process.exit(1);
}
console.log(`\n=== ผ่านทั้งหมด ${out.length} ข้อ ===`);
