/* ── บทบาทหกแบบ (docs/plan.md B6 · lib/shared/roles.ts) ─────────────────────

   1. ตารางสิทธิ์: แต่ละบทบาททำได้ตามที่ตั้งใจ และ operator เดิม (= หัวหน้าทีม) ไม่เสียสิทธิ์ที่เคยมี
   2. ทุก Server Action ของคอนโซล B2B มีด่านบทบาท — action ใหม่ที่ลืมใส่ denied() จะถูกจับที่นี่
   RLS (เขียนได้/อ่านอย่างเดียว) ตรวจใน verify:pg ข้อ 13 */
import { readFileSync } from "node:fs";
import { CAPABILITIES, ROLES, can, roleFrom, type Capability, type Role } from "@/lib/shared/roles";

const out: string[] = [];
const ok = (c: boolean, m: string) => out.push(`${c ? "PASS" : "FAIL"}  ${m}`);
const only = (cap: Capability, roles: Role[]) =>
  ok(ROLES.every((r) => can(r, cap) === roles.includes(r)), `${cap}: ${roles.join(" · ")}`);

// ── 1 · ตารางสิทธิ์ ──
ok(CAPABILITIES.every((c) => can("owner", c)), "เจ้าของทำได้ทุกอย่าง (โหมดคนเดียว)");
ok(CAPABILITIES.every((c) => !can("viewer", c)), "อ่านอย่างเดียวทำอะไรไม่ได้เลย");
only("policy", ["owner", "privacy"]);
only("privacy", ["owner", "privacy"]);
only("export_approve", ["owner", "privacy"]);
only("import", ["owner", "steward", "lead"]);
only("review", ["owner", "steward", "lead"]);
only("campaign", ["owner", "lead"]);
only("account_admin", ["owner"]);
ok(!can("bd", "import") && !can("bd", "campaign") && !can("bd", "export_request") && can("bd", "write"),
  "BD บันทึกงานได้ แต่นำเข้า สร้างแคมเปญ หรือขอส่งออกไม่ได้");
ok(!can("lead", "export_approve") && can("lead", "export_request"), "หัวหน้าทีมขอส่งออกได้ แต่อนุมัติเองไม่ได้");
/* operator เดิมทำได้: เขียน · นำเข้า · ตรวจตัวตน · แคมเปญ (ไม่เคยตั้งฐาน ลบคน หรือส่งออก) */
const was: Capability[] = ["write", "import", "review", "campaign"];
ok(roleFrom("operator") === "lead" && was.every((c) => can("lead", c)), "operator เดิม = หัวหน้าทีม ไม่เสียสิทธิ์ที่เคยมี");
ok(roleFrom("superuser") === "viewer" && roleFrom(null) === "viewer", "ค่าบทบาทที่ไม่รู้จัก = อ่านอย่างเดียว (สิทธิ์น้อยสุด)");

// ── 2 · ทุก action มีด่าน ──
const FILES = ["sales-actions", "vault-actions", "account-actions", "today-actions", "dsar-actions", "export-actions"];
const missing: string[] = [];
for (const f of FILES) {
  const src = readFileSync(`app/(app)/${f}.ts`, "utf8");
  const parts = src.split(/^export async function /m).slice(1);
  for (const body of parts) {
    const name = body.slice(0, body.indexOf("("));
    if (!/denied\(|await scope\("/.test(body.slice(0, 600))) missing.push(`${f}:${name}`);
  }
}
ok(missing.length === 0, `ทุก Server Action ของคอนโซล B2B ตรวจบทบาทก่อนทำงาน${missing.length ? ` (ขาด: ${missing.join(", ")})` : ""}`);
const del = readFileSync("app/(app)/customers-actions.ts", "utf8");
ok(/deleteCustomerAction[\s\S]{0,300}denied\(await viewer\(\), "privacy"\)/.test(del), "ลบคน = ผู้ดูแลข้อมูลส่วนบุคคลหรือเจ้าของ");

for (const line of out) console.log(line);
const failed = out.filter((l) => l.startsWith("FAIL"));
if (failed.length) {
  console.log(`\n=== FAIL ${failed.length} ข้อ ===`);
  process.exit(1);
}
console.log(`\n=== ผ่านทั้งหมด ${out.length} ข้อ ===`);
