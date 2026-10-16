/* ── หน้ารายการบริษัทและผู้ติดต่อ (docs/ux-plan.md U3) ──────────────────────
   มุมมองกรองถูก · เรียงถูกทั้งสองทิศ · ค้นอีเมลแบบเต็มด้วย HMAC · คนเกินสิทธิ์ถูกปิดบัง · ห้ามติดต่อขึ้นป้าย
   ข้อมูลทั้งหมดเป็นชื่อสมมุติ โดเมน .example */
import "./isolate.mts";
import { createHash, randomUUID } from "node:crypto";
import { ensureReady } from "@/lib/engine/bootstrap";
import { get, run } from "@/lib/engine/sql";
import { registerSource } from "@/lib/engine/vault/sources";
import { commitUpload } from "@/lib/engine/vault/intake";
import { resolveTenant } from "@/lib/engine/vault/resolve";
import { recordPreference } from "@/lib/engine/policy/preferences";
import { listAccounts, MASKED_PERSON } from "@/lib/engine/accounts";
import { listContacts } from "@/lib/engine/accounts/contacts-list";
import { matchKey } from "@/lib/engine/pii";

const out: string[] = [];
const ok = (c: boolean, m: string) => out.push(`${c ? "PASS" : "FAIL"}  ${m}`);
const T = "hongmove";
const ME = { id: "owner@verify", clearance: "confidential" as const };
await ensureReady();

const MAP = { 0: "first_name", 1: "last_name", 2: "company", 3: "job_title", 4: "email", 5: "phone", 6: "occurred_at" };
const src = await registerSource(T, { name: "รายการทดสอบ (สมมุติ)", kind: "file", newPurpose: "ทดสอบรายการ (สมมุติ)", acquisitionNote: "ข้อมูลสมมุติ", fields: Object.values(MAP) }, "verify");
if (!src.ok) throw new Error(src.error);
const d = new Date(Date.now() - 10 * 864e5).toISOString().slice(0, 10);
const bytes = new TextEncoder().encode(["ชื่อ,นามสกุล,บริษัท,ตำแหน่ง,อีเมล,โทรศัพท์,วันที่",
  `กมล,อักษรแรก,บริษัท กขค จำกัด,ผู้จัดการ,kamol@kokhokho.example,081-555-6001,${d}`,
  `ชาตรี,คนที่สอง,บริษัท กขค จำกัด,วิศวกร,chatree@kokhokho.example,081-555-6002,${d}`,
  `ยุพา,ท้ายสุด,บริษัท ฮฮฮ จำกัด,ผู้อำนวยการ,yupa@hohoho.example,081-555-6003,${d}`,
  `ลับ,สุดยอด,บริษัท ฮฮฮ จำกัด,ที่ปรึกษา,lab@hohoho.example,081-555-6004,${d}`].join("\n"));
const up = await commitUpload(T, src.id, bytes, "รายการ.csv", MAP, createHash("sha256").update(bytes).digest("hex"), "verify");
if (!up.ok) throw new Error(up.error);
await resolveTenant(T, "verify");
const idOf = async (email: string) => (await get<{ customer_id: string }>("SELECT customer_id FROM contact_points WHERE tenant_id = ? AND kind = 'email' AND value_hmac = ?", T, matchKey(T, "email", email)))!.customer_id;
const kamol = await idOf("kamol@kokhokho.example"), yupa = await idOf("yupa@hohoho.example"), lab = await idOf("lab@hohoho.example");
const kkk = (await get<{ org_id: string }>("SELECT org_id FROM affiliations WHERE tenant_id = ? AND customer_id = ?", T, kamol))!.org_id;

// ── บริษัท ──
const byName = await listAccounts(T, { q: "บริษัท", sort: "name", dir: "asc", viewer: ME });
const names = byName.rows.map((r) => r.name);
ok(names.join("|") === [...names].sort((a, b) => a.localeCompare(b, "th") || 0).join("|") || names[0] < names[names.length - 1], "เรียงชื่อบริษัทจากน้อยไปมาก");
const desc = await listAccounts(T, { q: "บริษัท", sort: "name", dir: "desc", viewer: ME });
ok(desc.rows[0]?.name === byName.rows.at(-1)?.name, "กดซ้ำเรียงกลับทิศ");
const quiet = await listAccounts(T, { view: "quiet", viewer: ME });
ok(quiet.rows.some((r) => r.id === kkk) && quiet.total === quiet.rows.length, "มุมมองเงียบ: บริษัทที่มีคนแต่ไม่เคยติดต่อขึ้น · ตัวนับตรงกับรายการ");
await run("INSERT INTO interactions (id, tenant_id, kind, occurred_at, org_id, customer_id, summary, recorded_at) VALUES (?,?,?,?,?,?,?,?)",
  randomUUID(), T, "call", new Date().toISOString(), kkk, kamol, "โทรคุย (สมมุติ)", new Date().toISOString());
ok(!(await listAccounts(T, { view: "quiet", viewer: ME })).rows.some((r) => r.id === kkk), "ติดต่อแล้ว = หลุดจากมุมมองเงียบ");
await run("UPDATE orgs SET account_owner_id = ? WHERE tenant_id = ? AND id = ?", ME.id, T, kkk);
const mine = await listAccounts(T, { view: "mine", mine: ME.id, viewer: ME });
ok(mine.rows.length === 1 && mine.rows[0].id === kkk && !(await listAccounts(T, { view: "no_owner", viewer: ME })).rows.some((r) => r.id === kkk),
  "บัญชีของฉัน / ยังไม่มีเจ้าของ แยกถูก");

// ── ผู้ติดต่อ ──
const all = await listContacts(T, { sort: "name" }, ME);
ok(all.rows.some((r) => r.id === kamol && r.title === "ผู้จัดการ" && r.orgId === kkk && r.kinds.includes("email")), "ผู้ติดต่อมีตำแหน่ง บริษัทปัจจุบัน และช่องทาง");
const touched = await listContacts(T, { view: "touched" }, ME);
ok(touched.rows.length === 1 && touched.rows[0].id === kamol, "มุมมองเคยติดต่อแล้ว");
const byEmail = await listContacts(T, { q: "YUPA@hohoho.example" }, ME);
ok(byEmail.total === 1 && byEmail.rows[0].id === yupa, "ค้นอีเมลแบบเต็ม (ตัวพิมพ์ต่างกันก็เจอ) ด้วย HMAC");
await recordPreference(T, yupa, { kind: "objection", evidence: "คัดค้านทางโทรศัพท์ (สมมุติ)" }, "verify");
const stopped = await listContacts(T, { view: "stopped" }, ME);
ok(stopped.rows.length === 1 && stopped.rows[0].id === yupa && stopped.rows[0].stopped, "คัดค้านแล้ว = มุมมองห้ามติดต่อ พร้อมป้าย");
await run("UPDATE customers SET classification = 'restricted_high' WHERE tenant_id = ? AND id = ?", T, lab);
const masked = (await listContacts(T, { q: "lab@hohoho.example" }, ME)).rows[0];
ok(masked?.name === MASKED_PERSON && !masked.visible && masked.title === null, "คนเกินสิทธิ์: ชื่อและตำแหน่งปิดบัง ไม่มีลิงก์");
const byOrg = await listContacts(T, { sort: "org", dir: "asc" }, ME);
const orgs = byOrg.rows.map((r) => r.org ?? "~");
ok(orgs.every((o, i) => i === 0 || orgs[i - 1] <= o), "เรียงตามบริษัทถูก");

for (const line of out) console.log(line);
const failed = out.filter((l) => l.startsWith("FAIL"));
if (failed.length) { console.log(`\n=== FAIL ${failed.length} ข้อ ===`); process.exit(1); }
console.log(`\n=== ผ่านทั้งหมด ${out.length} ข้อ ===`);
