/* ── รากฐานข้อมูล B2B (docs/plan.md B1 · Blueprint 2.0 บท 3 และ 8) ─────

   ตรวจสิ่งที่ถ้าพังจะไม่มีใครเห็น:
   1. ระเบียนใหม่ได้ข้อมูลกำกับตั้งต้นที่ปลอดภัย (ลับ · รับเข้า · ไม่มีข้อจำกัด · ยังไม่ตรวจ)
   2. บันทึกตรวจสอบต่อกันด้วย hash — แก้แถวกลางสายแล้วตรวจเจอ และบอกได้ว่าแถวไหน
   3. ทุกการกระทำที่บันทึกใน activity_log เข้าสาย audit ด้วย
   4. ล้างข้อมูลลูกค้าของบัญชี ล้างตารางข้อมูล B2B ทั้งหมด แต่บันทึกตรวจสอบและการตั้งค่ายังอยู่ */
import "./isolate.mts";
import { ensureReady } from "@/lib/engine/bootstrap";
import { all, get, run, tx } from "@/lib/engine/sql";
import { logActivity } from "@/lib/engine/db";
import { appendAudit, verifyAuditChain } from "@/lib/engine/audit";
import { B2B_DATA_TABLES, wipeCustomerData } from "@/lib/engine/tenant-data";

const out: string[] = [];
const ok = (c: boolean, m: string) => out.push(`${c ? "PASS" : "FAIL"}  ${m}`);

await ensureReady();
const A = "mst-golf", B = "hongmove";
const now = new Date().toISOString();

// ── 1 · ข้อมูลกำกับตั้งต้น ──
await run("INSERT INTO orgs (id, tenant_id, name, name_norm, created_at) VALUES (?,?,?,?,?)", "org-1", A, "บริษัท ตัวอย่าง จำกัด", "ตัวอย่าง", now);
const org = await get<{ classification: string; lifecycle_state: string; restriction_status: string; legal_entity: number }>(
  "SELECT classification, lifecycle_state, restriction_status, legal_entity FROM orgs WHERE id = 'org-1'",
);
ok(org?.classification === "confidential" && org.lifecycle_state === "received" && org.restriction_status === "none",
  "องค์กรใหม่: ระดับลับ · สถานะรับเข้า · ไม่มีข้อจำกัด");
ok(org?.legal_entity === 1, "องค์กรหนึ่งแถว = นิติบุคคลหนึ่งราย (บริษัทในเครือเป็นแถวของตัวเอง)");
const person = await get<{ classification: string; lifecycle_state: string }>(
  "SELECT classification, lifecycle_state FROM customers WHERE tenant_id = ? LIMIT 1", A,
);
ok(person?.classification === "confidential" && person.lifecycle_state === "received", "คนที่มีอยู่เดิมได้ข้อมูลกำกับตั้งต้นเดียวกัน");
const cp = await get<{ verify_status: string }>("SELECT verify_status FROM contact_points WHERE tenant_id = ? LIMIT 1", A);
ok(!cp || cp.verify_status === "unverified", "ช่องทางติดต่อเริ่มที่ยังไม่ตรวจ");
const staffCol = (await all<{ name: string; dflt_value: string | null }>("PRAGMA table_info(tenant_users)")).find((c) => c.name === "is_staff");
ok(staffCol?.dflt_value === "0", "ผู้ใช้ใหม่ไม่ใช่ทีม PARALLAX โดยปริยาย (is_staff = 0)");

// ── 2 · สายของบันทึกตรวจสอบ ──
await appendAudit({ tenantId: B, actor: "verify", action: "export", targetKind: "person", targetId: "p-1", detail: "3 fields" });
await appendAudit({ tenantId: B, actor: "verify", action: "merge", targetKind: "person", targetId: "p-2" });
await appendAudit({ tenantId: B, actor: "verify", action: "reveal", targetKind: "contact_point", targetId: "cp-9" });
const good = await verifyAuditChain(B);
ok(good.ok && good.rows >= 3, "สายบันทึกตรวจสอบครบหลังเพิ่มสามแถว");
const middle = await get<{ id: number }>("SELECT id FROM audit_log WHERE tenant_id = ? AND action = 'merge'", B);
await run("UPDATE audit_log SET detail = 'แก้ย้อนหลัง' WHERE id = ?", middle!.id);
const bad = await verifyAuditChain(B);
ok(!bad.ok && bad.brokenAtId === middle!.id, "แก้แถวกลางสายแล้วตรวจเจอ และชี้แถวที่ถูกแก้");

// ── 3 · activity_log → audit ──
const before = Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log WHERE tenant_id = ?", A))!.n);
await logActivity(A, "verify", "import_csv", "12 customers");
const after = Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log WHERE tenant_id = ?", A))!.n);
ok(after === before + 1, "การกระทำที่บันทึกใน activity_log เข้าสาย audit ด้วย");
ok((await verifyAuditChain(A)).ok, "สายของอีกบัญชีไม่ได้รับผลจากการแก้ในบัญชีแรก");

// ── 4 · ล้างข้อมูลลูกค้า ──
await run("INSERT INTO sources (id, tenant_id, name, kind, owner_id, registered_by, registered_at) VALUES (?,?,?,?,?,?,?)", "src-1", A, "ไฟล์ทดสอบ", "file", "u-1", "verify", now);
await run("INSERT INTO purposes (id, tenant_id, code, name, created_at) VALUES (?,?,?,?,?)", "pur-1", A, "sponsor_sales", "ขายสปอนเซอร์", now);
await tx((q) => wipeCustomerData(q, A));
const leftovers: string[] = [];
for (const t of B2B_DATA_TABLES) {
  const n = Number((await get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t} WHERE tenant_id = ?`, A))!.n);
  if (n) leftovers.push(`${t}=${n}`);
}
ok(leftovers.length === 0, `ล้างข้อมูลแล้วตาราง B2B ว่าง${leftovers.length ? ` (เหลือ ${leftovers.join(", ")})` : ""}`);
const kept = await Promise.all(["audit_log", "sources", "purposes"].map(async (t) =>
  Number((await get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t} WHERE tenant_id = ?`, A))!.n)));
ok(kept.every((n) => n > 0), "บันทึกตรวจสอบ แหล่งข้อมูล และวัตถุประสงค์ยังอยู่หลังล้างข้อมูลลูกค้า");

for (const line of out) console.log(line);
const failed = out.filter((l) => l.startsWith("FAIL"));
if (failed.length) {
  console.log(`\n=== FAIL ${failed.length} ข้อ ===`);
  process.exit(1);
}
console.log(`\n=== ผ่านทั้งหมด ${out.length} ข้อ ===`);
