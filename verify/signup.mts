/* ── สมัครเองและขั้นตั้งต้น (docs/solo-plan.md S9) ─────────────────────────

   1. ธงปิด (ค่าตั้งต้น) = สมัครไม่ได้ทุกทาง — engine ปฏิเสธ และ action/หน้าตรวจธงเป็นบรรทัดแรก
   2. ผู้ใช้หนึ่งคนได้บัญชีเดียว: เจ้าของ · โหมดคนเดียว · ทดลอง 14 วัน · AI ปิด
   3. ขั้นตั้งต้นบังคับตามลำดับ DPA → ยืนยันสองชั้น → แม่แบบ 1–3 ตัว → ข้อมูลสมมุติ — ข้ามขั้นไม่ได้
   4. บัญชีสมัครเองนำเข้าไฟล์จริงไม่ได้ทุกเส้นทาง (Data Vault · CSV ค้าปลีก · เพิ่มคนเอง) แต่รับไฟล์สมมุติของระบบได้
   5. หมดช่วงทดลอง = คอนโซลพาไปหน้าอัปเกรดและทุก action ถูกปฏิเสธ · ชำระแล้ว = ใช้ต่อได้และ AI เปิด
   6. ทะเบียนบัญชีรู้จักบัญชีสมัครเองโดยไม่กระทบบัญชีเดโมเดิม
   ส่วนที่ต้องมี Postgres (ฟังก์ชันสร้างบัญชี · RLS · สร้างบัญชีที่สองไม่ได้) อยู่ใน verify:pg ข้อ 14
   ผู้ใช้และค่าทั้งหมดในชุดนี้เป็นของสมมุติ */
import "./isolate.mts";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { ensureReady } from "@/lib/engine/bootstrap";
import { get, run } from "@/lib/engine/sql";
import { acceptDpa, chooseTemplates, confirmMfa, createSignupTenant, loadSignupDemo, onboardingStatus } from "@/lib/engine/signup";
import { consoleGate, importBlockedReason, REAL_FILES_BLOCKED_TH, signupInfo, signupLock, syntheticDigests } from "@/lib/engine/signup/gate";
import { aiPolicy } from "@/lib/engine/ai/policy";
import { registerSource } from "@/lib/engine/vault/sources";
import { analyseUpload, commitUpload } from "@/lib/engine/vault/intake";
import { commitImport, parseCsv } from "@/lib/engine/ingest";
import { createCustomer } from "@/lib/engine/customers";
import { resolveTenant } from "@/lib/engine/access";
import { DEFAULT_TENANT_ID, isKnownTenant, isStaticTenant, profileFor } from "@/lib/shared/tenants";
import { SIGNUP_SYNTHETIC, TRIAL_DAYS, signupInputError } from "@/lib/shared/signup";
import { fileBytes, generateSynthetic } from "@/lib/shared/synthetic-b2b";
import { PURPOSE_TEMPLATES } from "@/lib/shared/purpose-templates";

const out: string[] = [];
const ok = (c: boolean, m: string) => out.push(`${c ? "PASS" : "FAIL"}  ${m}`);
await ensureReady();

const userA = randomUUID(), userB = randomUUID();
const actorA = "a.signup@verify.example";

// ── 1 · ธงปิด ──
delete process.env.SIGNUP_ENABLED;
const off = await createSignupTenant(userA, "บริษัท ทดลองปิด (สมมุติ)", actorA);
ok(!off.ok && /ยังไม่เปิดรับสมัคร/.test(off.error), "ไม่ตั้ง SIGNUP_ENABLED = สร้างบัญชีไม่ได้ (ปิดโดยปริยาย)");
process.env.SIGNUP_ENABLED = "true";
const offTrue = await createSignupTenant(userA, "บริษัท ทดลองปิด (สมมุติ)", actorA);
ok(!offTrue.ok, "ค่าที่ไม่ใช่ \"1\" (เช่น true) ยังนับว่าปิด");
ok(Number((await get<{ n: number | string }>("SELECT COUNT(*) AS n FROM tenant_users WHERE user_id = ?", userA))!.n) === 0, "ธงปิดแล้วไม่มีแถวสมาชิกหลุดเข้าฐาน");
{
  const act = readFileSync("app/(gate)/signup/actions.ts", "utf8");
  const bodies = act.split(/^export async function /m).slice(1);
  ok(bodies.length === 2 && bodies.every((b) => /^[^\n]*\n\s*if \(!signupEnabled\(\)\) return \{ error: SIGNUP_CLOSED_TH \};/.test(b)),
    "signUpAction และ createWorkspaceAction ตรวจธงเป็นบรรทัดแรก ก่อนแตะ Supabase หรือฐาน");
  const page = readFileSync("app/(gate)/signup/page.tsx", "utf8");
  ok(/await connection\(\)/.test(page) && /signupEnabled\(\)/.test(page) && /SIGNUP_CLOSED_TH/.test(page),
    "หน้า /signup อ่านธงตอนขอ (ไม่ใช่ตอน build) และแสดง \"ยังไม่เปิดรับสมัคร\" เมื่อปิด");
}

// ── 2 · สร้างบัญชีครั้งเดียวต่อผู้ใช้ ──
process.env.SIGNUP_ENABLED = "1";
ok(!(await createSignupTenant(userA, " ", actorA)).ok, "ชื่อบัญชีว่างถูกปฏิเสธ");
const made = await createSignupTenant(userA, "บริษัท ทดลองสมัคร จำกัด (สมมุติ)", actorA);
if (!made.ok) throw new Error(made.error);
const T = made.tenantId;
ok(/^s-[0-9a-f]{12}$/.test(T), `รหัสบัญชีสมัครเองตามรูปแบบ (${T})`);
const again = await createSignupTenant(userA, "บัญชีที่สอง (สมมุติ)", actorA);
ok(!again.ok && /มีบัญชีอยู่แล้ว/.test(again.error), "ผู้ใช้คนเดิมสร้างบัญชีที่สองไม่ได้");
ok(Number((await get<{ n: number | string }>("SELECT COUNT(*) AS n FROM tenant_users WHERE user_id = ?", userA))!.n) === 1, "ผู้ใช้หนึ่งคนมีบัญชีเดียว");
const madeB = await createSignupTenant(userB, "ร้าน ทดลองอีกราย (สมมุติ)", "b.signup@verify.example");
ok(madeB.ok && madeB.tenantId !== T, "ผู้ใช้อีกคนได้บัญชีของตัวเอง ไม่ใช่บัญชีเดิม");
const member = await get<{ role: string }>("SELECT role FROM tenant_users WHERE tenant_id = ? AND user_id = ?", T, userA);
const settings = await get<{ mode: string; signup_source: string }>("SELECT mode, signup_source FROM tenant_settings WHERE tenant_id = ?", T);
const bill = await get<{ state: string; is_customer: number; trial_ends_at: string }>("SELECT state, is_customer, trial_ends_at FROM tenant_billing WHERE tenant_id = ?", T);
ok(member?.role === "owner", "ผู้สมัครเป็นเจ้าของบัญชี");
ok(settings?.mode === "solo" && settings.signup_source === "self", "โหมดคนเดียว · ที่มา = สมัครเอง");
const days = bill ? (Date.parse(bill.trial_ends_at) - Date.now()) / 864e5 : 0;
ok(bill?.state === "trial" && Number(bill.is_customer) === 1 && days > TRIAL_DAYS - 0.1 && days <= TRIAL_DAYS, `ทดลองใช้ ${TRIAL_DAYS} วัน (เหลือ ${days.toFixed(2)} วัน)`);
const ai = await aiPolicy(T);
ok(!ai.allowed && /ทดลอง/.test(ai.reason), "AI ปิดระหว่างทดลอง");
ok(Number((await get<{ c: number }>("SELECT message_credits AS c FROM tenants WHERE id = ?", T))!.c) === 0, "บัญชีทดลองไม่มีเครดิตข้อความ");

// ── 3 · ลำดับขั้นตั้งต้น ──
const st0 = await onboardingStatus(T, "none");
ok(st0.selfSignup && st0.step === "dpa", "ขั้นแรกคือยอมรับ DPA");
ok(consoleGate(await signupInfo(T, "verified")) === "/onboarding", "ยังตั้งค่าไม่ครบ = คอนโซลพาไป /onboarding");
ok(signupLock(await signupInfo(T, "verified")) !== null, "ยังตั้งค่าไม่ครบ = action ในคอนโซลถูกปฏิเสธ (locked)");
const pickTwo = PURPOSE_TEMPLATES.slice(0, 2).map((t) => ({ code: t.code, confirmation: "ยืนยันข้อเท็จจริงของบัญชีทดลอง (สมมุติ)" }));
ok(!(await chooseTemplates(T, pickTwo, actorA, "verified")).ok, "เลือกแม่แบบก่อนยอมรับ DPA ไม่ได้");
ok(!(await loadSignupDemo(T, actorA, "verified")).ok, "โหลดข้อมูลสมมุติก่อนยอมรับ DPA ไม่ได้");
ok(!(await acceptDpa(T, false, actorA, "none")).ok, "ไม่ติ๊กยอมรับ = ไม่ผ่าน");
ok((await acceptDpa(T, true, actorA, "none")).ok, "ยอมรับ DPA ได้ก่อนเปิดยืนยันสองชั้น");
const dpa = await get<{ dpa_version: string; dpa_accepted_by: string }>("SELECT dpa_version, dpa_accepted_by FROM tenant_settings WHERE tenant_id = ?", T);
ok(Boolean(dpa?.dpa_version) && dpa?.dpa_accepted_by === actorA, "เก็บรุ่นของ DPA และผู้ยอมรับ");
ok(!(await acceptDpa(T, true, actorA, "none")).ok, "ยอมรับ DPA ซ้ำไม่ได้ (ไม่ใช่ขั้นปัจจุบัน)");
ok((await onboardingStatus(T, "none")).step === "mfa", "ขั้นที่สองคือยืนยันตัวตนสองชั้น");
ok(!(await chooseTemplates(T, pickTwo, actorA, "none")).ok, "ยังไม่ยืนยันสองชั้น = เลือกแม่แบบไม่ได้");
ok(!(await confirmMfa(T, actorA, "none")).ok, "กด \"ยืนยันแล้ว\" โดยที่ session ยังไม่ใช่ aal2 ไม่ผ่าน");
ok(!(await confirmMfa(T, actorA, "pending")).ok, "ใส่รหัสผ่านแล้วแต่ยังไม่ใส่รหัสจากแอป ไม่ผ่าน");
ok((await confirmMfa(T, actorA, "verified")).ok, "ยืนยันสองชั้นแล้วผ่านขั้นที่สอง");
ok((await onboardingStatus(T, "verified")).step === "templates", "ขั้นที่สามคือเลือกแม่แบบ");
ok(!(await loadSignupDemo(T, actorA, "verified")).ok, "โหลดข้อมูลสมมุติก่อนเลือกแม่แบบไม่ได้");
ok(!(await chooseTemplates(T, [], actorA, "verified")).ok, "ไม่เลือกแม่แบบเลยไม่ได้");
ok(!(await chooseTemplates(T, PURPOSE_TEMPLATES.slice(0, 4).map((t) => ({ code: t.code, confirmation: "ยืนยันข้อเท็จจริง (สมมุติ)" })), actorA, "verified")).ok, "เลือกเกิน 3 แม่แบบไม่ได้");
ok(!(await chooseTemplates(T, [{ code: PURPOSE_TEMPLATES[0].code, confirmation: "" }], actorA, "verified")).ok, "ไม่พิมพ์ยืนยันข้อเท็จจริงของแม่แบบ = ไม่ผ่าน");
ok(!(await chooseTemplates(T, [{ code: "no_such_template", confirmation: "ยืนยันข้อเท็จจริง (สมมุติ)" }], actorA, "verified")).ok, "รหัสแม่แบบที่ไม่มีอยู่ถูกปฏิเสธ");
const chosen = await chooseTemplates(T, pickTwo, actorA, "verified");
ok(chosen.ok && chosen.purposeIds.length === 2, "เลือกแม่แบบสองตัว = วัตถุประสงค์สองรายการพร้อมฐานรุ่น 1");
ok((await onboardingStatus(T, "verified")).step === "demo", "ขั้นที่สี่คือข้อมูลสมมุติ");
ok((await onboardingStatus(T, "none")).step === "mfa", "ปิดยืนยันสองชั้นทีหลัง = กลับไปขั้นยืนยันสองชั้น (อ่านจาก session ทุกครั้ง)");
ok(!(await loadSignupDemo(T, actorA, "none")).ok, "ไม่มีรหัสจากแอปในรอบนี้ = โหลดข้อมูลไม่ได้");

// ── 4 · ไฟล์จริงไม่เข้า · ไฟล์สมมุติเข้า ──
const demo = await loadSignupDemo(T, actorA, "verified");
ok(demo.ok && demo.rows > 0 && demo.people > 0, `โหลดข้อมูลสมมุติผ่านเส้นทางนำเข้าจริง${demo.ok ? ` (${demo.rows} แถว → ${demo.people} คน)` : ` (${demo.error})`}`);
ok((await onboardingStatus(T, "verified")).step === "done", "ตั้งค่าครบ = พร้อมใช้งาน");
ok(consoleGate(await signupInfo(T, "verified")) === null && signupLock(await signupInfo(T, "verified")) === null, "ตั้งค่าครบ + ยืนยันสองชั้น = ใช้คอนโซลได้");
ok(consoleGate(await signupInfo(T, "none")) === "/onboarding", "ตั้งค่าครบแล้วแต่รอบนี้ไม่ได้ยืนยันสองชั้น = กลับไปขั้นตั้งค่า");
ok(!(await loadSignupDemo(T, actorA, "verified")).ok, "ตั้งค่าเสร็จแล้วโหลดซ้ำไม่ได้");

const src = await registerSource(T, {
  name: "ไฟล์ที่ผู้ใช้อัปโหลดเอง (สมมุติ)", kind: "file", newPurpose: "ทดสอบไฟล์จริง",
  acquisitionNote: "ชุดตรวจ — แทนไฟล์ที่ผู้ใช้อาจอัปโหลดเอง", fields: ["customer_name", "email", "phone"],
}, actorA);
if (!src.ok) throw new Error(src.error);
const real = new TextEncoder().encode("ชื่อ,อีเมล,โทร\nสมมุติ คนจริง,real.person@verify.example,081-555-0000\n");
const realSha = createHash("sha256").update(real).digest("hex");
const an = await analyseUpload(T, src.id, real, "customers.csv", actorA);
ok(!an.ok && an.error === REAL_FILES_BLOCKED_TH, "Data Vault: ตรวจไฟล์ที่ไม่ใช่ไฟล์สมมุติของระบบ = ถูกปฏิเสธก่อนอ่าน");
const cm = await commitUpload(T, src.id, real, "customers.csv", { 0: "customer_name", 1: "email", 2: "phone" }, realSha, actorA);
ok(!cm.ok && cm.error === REAL_FILES_BLOCKED_TH, "Data Vault: ยิง commit ตรง (ข้ามขั้นตรวจ) ก็ถูกปฏิเสธ");
ok(Number((await get<{ n: number | string }>("SELECT COUNT(*) AS n FROM import_batches WHERE tenant_id = ? AND sha256 = ?", T, realSha))!.n) === 0, "ไม่มีชุดนำเข้าของไฟล์จริงในฐาน");
let retail = "";
try { await commitImport(T, parseCsv("name,email\nสมมุติ,x@verify.example"), { mappings: [], unmapped: [] } as never); } catch (e) { retail = (e as Error).message; }
ok(retail === REAL_FILES_BLOCKED_TH, "นำเข้า CSV ค้าปลีกถูกปิดทั้งเส้นสำหรับบัญชีสมัครเอง");
const manual = await createCustomer(T, { name: "เพิ่มเอง สมมุติ", contacts: [{ kind: "email", value: "manual@verify.example" }], profile: {}, consent: false }, actorA);
ok(!manual.ok && manual.error === REAL_FILES_BLOCKED_TH, "เพิ่มคนเองด้วยมือ (ข้อมูลจริงอีกทาง) ถูกปฏิเสธ");
const synth = generateSynthetic({ ...SIGNUP_SYNTHETIC }).files.map(fileBytes);
const synthSha = createHash("sha256").update(synth[0]).digest("hex");
ok(syntheticDigests().has(synthSha) && await importBlockedReason(T, synthSha) === null, "ไฟล์สมมุติของระบบ (hash ตรง) ผ่านด่าน");
const synthAgain = await analyseUpload(T, src.id, synth[0], "registrations.csv", actorA);
ok(synthAgain.ok && Boolean(synthAgain.duplicateOf), "ไฟล์สมมุติที่โหลดไปแล้วถูกรู้ว่าเป็นไฟล์ซ้ำ");
ok(await importBlockedReason("hongmove") === null && await importBlockedReason("sunline-demo", realSha) === null, "บัญชีที่ไม่ได้สมัครเองนำเข้าได้ตามเดิม");
ok(await importBlockedReason(`s-${"0".repeat(12)}`) === REAL_FILES_BLOCKED_TH, "รหัสรูปแบบบัญชีสมัครเองที่ไม่มีแถวค่าตั้ง = ยังถูกกั้น (fail closed)");

// ── 5 · หมดช่วงทดลอง · ชำระแล้ว ──
await run("UPDATE tenant_billing SET trial_ends_at = ? WHERE tenant_id = ?", new Date(Date.now() - 1000).toISOString(), T);
const expired = await signupInfo(T, "verified");
ok(expired.expired && expired.daysLeft === 0 && consoleGate(expired) === "/upgrade", "หมดช่วงทดลอง = คอนโซลพาไปหน้าอัปเกรด");
ok(signupLock(expired) !== null && /ทดลองใช้หมด/.test(signupLock(expired)!), "หมดช่วงทดลอง = action ในคอนโซลถูกปฏิเสธ");
ok(!(await aiPolicy(T)).allowed, "หมดช่วงทดลองแล้ว AI ยังปิด");
await run("UPDATE tenant_billing SET state = 'paid' WHERE tenant_id = ?", T);
const paid = await signupInfo(T, "verified");
ok(!paid.expired && consoleGate(paid) === null && (await aiPolicy(T)).allowed, "ชำระแล้ว (ทีมเปลี่ยนสถานะจากฝั่งระบบ) = ใช้ต่อได้และ AI เปิด");
ok(await importBlockedReason(T, realSha) === REAL_FILES_BLOCKED_TH, "ชำระแล้วก็ยังรับไฟล์จริงไม่ได้ จนกว่าจะผ่าน pentest");
await run("UPDATE tenant_billing SET state = 'suspended' WHERE tenant_id = ?", T);
ok(consoleGate(await signupInfo(T, "verified")) === "/upgrade", "ระงับบัญชี = เหมือนหมดช่วงทดลอง");
await run("DELETE FROM tenant_billing WHERE tenant_id = ?", T);
ok((await signupInfo(T, "verified")).expired, "ไม่มีแถวการชำระ = ถือว่าหมดสิทธิ์ (fail closed)");

// ── 6 · ทะเบียนบัญชี ──
ok(isKnownTenant(T) && !isStaticTenant(T) && isStaticTenant("mst-golf"), "รู้จักบัญชีสมัครเองจากรูปแบบรหัส แยกจากทะเบียนนิ่ง");
ok(profileFor(T).id === T && profileFor(T).vocab.th.person === "ผู้ติดต่อ" && profileFor("hongmove").id === "hongmove", "บัญชีสมัครเองได้คำเรียกแบบ B2B · บัญชีเดิมได้โปรไฟล์เดิม");
ok(await resolveTenant(null, T) === DEFAULT_TENANT_ID, "โหมดเดโม (ไม่บังคับสมาชิก) เปิดบัญชีสมัครเองจากคุกกี้ไม่ได้");
ok((await signupInfo("hongmove", "none")).selfSignup === false && consoleGate(await signupInfo("hongmove", "none")) === null, "บัญชีที่ทีมสร้างไม่ถูกกั้นด้วยด่านของการสมัครเอง");
ok(signupInputError("a@verify.example", "short", "short") !== null && signupInputError("someone@verify.example", "someone-long-pass", "someone-long-pass") !== null
  && signupInputError("someone@verify.example", "correct horse battery", "correct horse battery") === null, "ฟอร์มสมัคร: รหัสผ่านสั้นหรือมีชื่ออีเมลถูกปฏิเสธ");

// ── 7 · ด่านในคอนโซล ──
{
  const acts = readFileSync("app/(app)/onboarding-actions.ts", "utf8");
  const bodies = acts.split(/^export async function /m).slice(1);
  ok(bodies.length === 4 && bodies.every((b) => /denied\(\{ \.\.\.v, locked: null \}, "(policy|import)"\)/.test(b.slice(0, 400))), "ทุกขั้นตั้งต้นตรวจบทบาทด้วย denied()");
  ok(/onboarding-actions/.test(readFileSync("verify/roles.mts", "utf8")), "verify:roles ตรวจไฟล์ขั้นตั้งต้นด้วย");
  const layout = readFileSync("app/(app)/layout.tsx", "utf8");
  ok(/consoleGate\(signup\)/.test(layout) && /if \(gateTo\) redirect\(gateTo\)/.test(layout), "layout ของคอนโซลพาบัญชีสมัครเองที่ไม่ครบไป /onboarding หรือ /upgrade");
  const viewer = readFileSync("app/(app)/viewer.ts", "utf8");
  ok(/return v\.locked \?\? gate\(/.test(viewer), "denied() ปฏิเสธเมื่อบัญชีถูกล็อกก่อนดูบทบาท");
  const proxy = readFileSync("proxy.ts", "utf8");
  ok(/under\("\/signup"\)/.test(proxy) && /needsAuth = under\("\/app"\) \|\| under\("\/onboarding"\) \|\| under\("\/upgrade"\)/.test(proxy), "proxy: /signup ได้ CSP ของคอนโซล · /onboarding และ /upgrade ต้องล็อกอิน");
  ok(!/stripe|paddle|omise/i.test(readFileSync("package.json", "utf8")), "ไม่มี SDK รับชำระเงิน (ยังไม่เลือกผู้ให้บริการ)");
}

for (const line of out) console.log(line);
const failed = out.filter((l) => l.startsWith("FAIL"));
if (failed.length) {
  console.log(`\n=== FAIL ${failed.length} ข้อ ===`);
  process.exit(1);
}
console.log(`\n=== ผ่านทั้งหมด ${out.length} ข้อ ===`);
process.exit(0);
