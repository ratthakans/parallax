/* ── AI gateway (docs/plan.md หัวข้อ 9.2) ──────────────────────

   ตรวจสิ่งที่ถ้าพังจะไม่มีใครเห็นจากหน้าจอ:
   1. บัญชีลูกค้าที่ยังไม่ชำระ ไม่ได้ผลของ AI — ได้สูตรสำเร็จพร้อมเหตุผลที่อ่านออก
   2. ไม่มีแถวสถานะ = ปิด (fail closed) · สวิตช์ปิดทั้งระบบชนะทุกสถานะ
   3. สิ่งที่ส่งให้โมเดลตอนจับคู่คอลัมน์ไม่มีค่าในเซลล์เลย มีแค่ชื่อคอลัมน์และชนิดของค่า
   4. บันทึกการเรียก AI เขียนได้ และไม่มีช่องเก็บ prompt หรือคำตอบ */
import "./isolate.mts";
import { ensureReady } from "@/lib/engine/bootstrap";
import { all, get, run } from "@/lib/engine/sql";
import { aiPolicy } from "@/lib/engine/ai/policy";
import { recordAiCall } from "@/lib/engine/ai/ledger";
import { columnShapes, mapColumns, shapeOf } from "@/lib/engine/ai";

const out: string[] = [];
const ok = (c: boolean, m: string) => out.push(`${c ? "PASS" : "FAIL"}  ${m}`);

await ensureReady();
const now = new Date().toISOString();

// ── 1–2 · นโยบาย ──
ok((await aiPolicy("mst-golf")).allowed, "บัญชีเดโมสังเคราะห์ใช้ AI ได้");
const none = await aiPolicy("ไม่มีบัญชีนี้");
ok(!none.allowed, "ไม่มีแถวสถานะการชำระ = AI ปิด");

const C = "verify-customer";
await run(
  "INSERT INTO tenant_billing (tenant_id, state, is_customer, updated_at, updated_by) VALUES (?,?,?,?,?)",
  C, "trial_audit", 1, now, "verify",
);
const trial = await aiPolicy(C);
ok(!trial.allowed && /ชำระ/.test(trial.reason), "ลูกค้าระหว่าง Audit ก่อนชำระ = AI ปิด พร้อมเหตุผลภาษาไทย");

await run("UPDATE tenant_billing SET state = 'demo' WHERE tenant_id = ?", C);
ok(!(await aiPolicy(C)).allowed, "บัญชีลูกค้าจริงที่ถูกตั้งเป็น demo ก็ยังปิด (demo เปิดได้เฉพาะบัญชีสังเคราะห์)");

await run("UPDATE tenant_billing SET state = 'paid' WHERE tenant_id = ?", C);
ok((await aiPolicy(C)).allowed, "ชำระแล้ว = AI เปิด");

process.env.AI_DISABLED = "1";
ok(!(await aiPolicy(C)).allowed && !(await aiPolicy("mst-golf")).allowed, "สวิตช์ปิดทั้งระบบชนะทุกสถานะ");
delete process.env.AI_DISABLED;

await run("UPDATE tenant_billing SET state = 'suspended' WHERE tenant_id = ?", C);
const blocked = await mapColumns(C, ["ชื่อ", "อีเมล"], [["สมชาย", "somchai@example.com"]]);
ok(blocked.source === "fallback" && /ชำระ/.test(blocked.note ?? ""), "mapColumns ของบัญชีที่ถูกระงับได้สูตรสำเร็จ ไม่ถึงโมเดล");
ok(blocked.value.mappings.length === 2, "สูตรสำเร็จยังจับคู่คอลัมน์ให้ครบ — งานหลักทำต่อได้โดยไม่มี AI");

// ── 3 · สิ่งที่ออกจากระบบ ──
const values = [
  ["สมชาย ใจดี", "somchai.jaidee@example.co.th", "081-234-5678", "14/02/1985", "15900", "บจก. ตัวอย่าง จำกัด"],
  ["Jane Doe", "jane@corp.example", "+66 89 765 4321", "1990-07-01", "฿2,500", "Example Co., Ltd."],
];
const headers = ["ชื่อ", "อีเมล", "เบอร์", "วันเกิด", "ยอด", "บริษัท"];
const shapes = columnShapes(headers, values);
const sent = JSON.stringify({ headers, shapes });
const digits = (v: string) => v.replace(/\D/g, "");
const leaked = values.flat().filter((v) => sent.includes(v) || (digits(v).length >= 4 && sent.includes(digits(v))));
ok(leaked.length === 0, `ไม่มีค่าในเซลล์หลุดไปกับคำขอจับคู่คอลัมน์${leaked.length ? ` (หลุด: ${leaked.join(", ")})` : ""}`);
ok(shapes["อีเมล"].every((s) => s === "email") && shapes["เบอร์"].every((s) => s === "phone"), "ชนิดของค่ายังพอให้แยกอีเมลกับเบอร์ได้");
ok(shapes["วันเกิด"].every((s) => s === "date") && shapes["ยอด"].every((s) => s === "number"), "วันที่และตัวเลขส่งเป็นชนิด ไม่ใช่ค่า");
ok(shapeOf("") === "empty" && shapeOf("สมชาย") === "thai_text" && shapeOf("Jane") === "latin_text", "ข้อความส่งเป็นชนิดภาษา");

// ── 4 · บันทึก ──
await recordAiCall({ tenantId: "mst-golf", kind: "verify", model: "claude-opus-5-5", outcome: "ai", inputTokens: 10, outputTokens: 5 });
const row = await get<{ n: number | string }>("SELECT COUNT(*) AS n FROM ai_ledger WHERE kind = 'verify'");
ok(Number(row?.n) === 1, "การเรียก AI ถูกบันทึกหนึ่งแถว");
const cols = (await all<{ name: string }>("PRAGMA table_info(ai_ledger)")).map((c) => c.name);
ok(!cols.some((c) => /prompt|content|response|text|message/.test(c)), "ai_ledger ไม่มีช่องเก็บ prompt หรือคำตอบ");

for (const line of out) console.log(line);
const failed = out.filter((l) => l.startsWith("FAIL"));
if (failed.length) {
  console.log(`\n=== FAIL ${failed.length} ข้อ ===`);
  process.exit(1);
}
console.log(`\n=== ผ่านทั้งหมด ${out.length} ข้อ ===`);
