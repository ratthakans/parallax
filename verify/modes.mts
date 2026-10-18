/* ── โหมดลูกค้าของบัญชี (docs/crm-plan.md F1 · migration 0026) ─────────────
   บัญชีเดิมได้โหมดเดิม (หน้าจอไม่เปลี่ยน) · เปลี่ยนได้เฉพาะค่าที่รู้จัก · สมัครเองเลือกโหมดได้
   · ทุกจุดที่เคยดูรหัสบัญชีในโค้ด เปลี่ยนมาอ่านโหมดจากฐาน */
import "./isolate.mts";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { ensureReady } from "@/lib/engine/bootstrap";
import { get } from "@/lib/engine/sql";
import { customerMode, setCustomerMode } from "@/lib/engine/tenant-mode";
import { createSignupTenant } from "@/lib/engine/signup";
import { CUSTOMER_MODES, RETAIL_DEMO_IDS, hasB2B, hasB2C } from "@/lib/shared/tenants";

const out: string[] = [];
const ok = (c: boolean, m: string) => out.push(`${c ? "PASS" : "FAIL"}  ${m}`);
await ensureReady();

// ── บัญชีเดิม ──
ok((await Promise.all(RETAIL_DEMO_IDS.map(customerMode))).every((m) => m === "b2c"), "เดโมค้าปลีกเดิม = ขายให้บุคคล (หน้าจอเดิม)");
ok((await customerMode("sunline-demo")) === "b2b", "เดโม B2B = ขายให้บริษัท");
ok((await customerMode("ไม่มีบัญชีนี้")) === "b2c" && (await customerMode("s-000000000000")) === "b2b", "ไม่มีแถวในฐาน = ค่าสำรองจากทะเบียน (สมัครเอง = B2B)");
ok(hasB2B("hybrid") && hasB2C("hybrid") && hasB2B("b2b") && !hasB2C("b2b") && hasB2C("b2c") && !hasB2B("b2c"), "ทั้งสองแบบ = มีส่วน B2B และส่วนบุคคล");

// ── เปลี่ยนโหมด ──
const T = RETAIL_DEMO_IDS[0];
ok(!(await setCustomerMode(T, "b2x", "verify")).ok && (await customerMode(T)) === "b2c", "ค่าที่ไม่รู้จัก ปฏิเสธ · ค่าเดิมไม่เปลี่ยน");
ok((await setCustomerMode(T, "hybrid", "verify")).ok && (await customerMode(T)) === "hybrid", "เปลี่ยนเป็นทั้งสองแบบได้");
const log = await get<{ detail: string }>("SELECT detail FROM activity_log WHERE tenant_id = ? AND action = 'customer_mode' ORDER BY id DESC LIMIT 1", T);
ok(log?.detail === "ขายให้บุคคล → ทั้งสองแบบ", "บันทึกประวัติการเปลี่ยน");
ok((await setCustomerMode(T, "hybrid", "verify")).ok
  && Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM activity_log WHERE tenant_id = ? AND action = 'customer_mode'", T))?.n) === 1,
  "ตั้งค่าเดิมซ้ำ ไม่บันทึกประวัติซ้ำ");
await setCustomerMode(T, "b2c", "verify");

// ── สมัครเอง ──
process.env.SIGNUP_ENABLED = "1";
const a = await createSignupTenant(randomUUID(), "ร้าน ทดลองบุคคล (สมมุติ)", "a@verify.example", "b2c");
const b = await createSignupTenant(randomUUID(), "บริษัท ทดลองค่าแปลก (สมมุติ)", "b@verify.example", "<script>");
const c = await createSignupTenant(randomUUID(), "บริษัท ทดลองค่าตั้งต้น (สมมุติ)", "c@verify.example");
ok(a.ok && (await customerMode(a.tenantId)) === "b2c", "สมัครแล้วเลือก ขายให้บุคคล ได้");
ok(b.ok && (await customerMode(b.tenantId)) === "b2b" && c.ok && (await customerMode(c.tenantId)) === "b2b", "ค่าแปลก/ไม่เลือก = ขายให้บริษัท");

// ── โค้ด ──
const left = execSync("grep -rln 'isB2BTenant(' app components lib || true", { encoding: "utf8" }).trim().split("\n").filter(Boolean);
ok(left.length === 1 && left[0] === "lib/shared/tenants.ts", "หน้าและ action ไม่ดูรหัสบัญชีตรง ๆ แล้ว (อ่านโหมดจากฐาน)");
const act = readFileSync("app/(app)/account-actions.ts", "utf8");
ok(/setCustomerModeAction[\s\S]{0,200}denied\(v, "account_admin"\)/.test(act), "เปลี่ยนโหมดได้เฉพาะเจ้าของบัญชี");
const mig = readFileSync("supabase/migrations/0026_customer_mode.sql", "utf8");
ok(CUSTOMER_MODES.every((m) => mig.includes(`'${m}'`)) && RETAIL_DEMO_IDS.every((i) => mig.includes(`'${i}'`)), "migration ครบทุกโหมดและเดโมค้าปลีก");

for (const line of out) console.log(line);
const failed = out.filter((l) => l.startsWith("FAIL"));
if (failed.length) { console.log(`\n=== FAIL ${failed.length} ข้อ ===`); process.exit(1); }
console.log(`\n=== ผ่านทั้งหมด ${out.length} ข้อ ===`);
