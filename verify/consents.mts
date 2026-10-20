/* ── ความยินยอมรับข่าวสารแหล่งเดียว (docs/crm-plan.md G2) ─────────────────────
   ก่อนย้าย: สองระบบแยกกัน (ไม่สร้าง preferences เอง) · ย้าย: consents → preferences ครบ · กดซ้ำไม่ซ้ำ
   หลังย้าย: บันทึกทางไหน (ช่องติ๊กเดิม · เพิ่มคน · บริการนโยบาย) อีกฝั่งตามทันที · ถอนในที่จริงชนะความยินยอมเก่าในระบบเดิม */
import "./isolate.mts";
import { ensureReady } from "@/lib/engine/bootstrap";
import { all, get, run } from "@/lib/engine/sql";
import { createCustomer, setConsent } from "@/lib/engine/customers";
import { recordPreference } from "@/lib/engine/policy/preferences";
import { adoptTemplate } from "@/lib/engine/policy/templates";
import { decide } from "@/lib/engine/policy";
import { MARKETING_TEMPLATE, legacyConsentStatus, marketingPurposeId, syncLegacyConsents } from "@/lib/engine/policy/marketing";

const out: string[] = [];
const ok = (c: boolean, m: string) => out.push(`${c ? "PASS" : "FAIL"}  ${m}`);
await ensureReady();

const T = "brc-golf";
const prefs = async (id: string) => all<{ kind: string; purpose_id: string | null }>(
  "SELECT kind, purpose_id FROM preferences WHERE tenant_id = ? AND customer_id = ? ORDER BY effective_at, recorded_at", T, id);
const legacy = async (id: string) => get<{ granted_at: string | null; revoked_at: string | null }>(
  "SELECT granted_at, revoked_at FROM consents WHERE tenant_id = ? AND customer_id = ? AND purpose = 'marketing'", T, id);
const granted = await all<{ customer_id: string }>(
  "SELECT customer_id FROM consents WHERE tenant_id = ? AND purpose = 'marketing' AND granted_at IS NOT NULL AND revoked_at IS NULL ORDER BY customer_id LIMIT 4", T);
const [A, B, C, D] = granted.map((r) => r.customer_id);

// ── ก่อนย้าย ──
ok(!(await marketingPurposeId(T)), "บัญชียังไม่มีวัตถุประสงค์รับข่าวสาร");
await setConsent(T, A, false, "verify");
ok((await prefs(A)).length === 0, "ก่อนย้าย: ช่องติ๊กเดิมไม่สร้างบันทึกในบริการนโยบายเอง");
const before = await legacyConsentStatus(T);
ok(before.granted > 0 && before.withdrawn >= 1, "นับความยินยอม/ถอนในระบบเดิมได้");

// ── ย้าย ──
const made = await adoptTemplate(T, MARKETING_TEMPLATE, "ลูกค้าติ๊กรับข่าวสารในใบสมัครสมาชิก (สมมุติ)", "verify");
ok(made.ok, "สร้างวัตถุประสงค์จากแม่แบบ (ยืนยันข้อเท็จจริงแล้ว)");
const MP = (await marketingPurposeId(T))!;
const first = await syncLegacyConsents(T, "verify", undefined, 300);
ok(first.consents + first.withdrawals === 300 && first.remaining === before.granted + before.withdrawn - 300, `ย้ายทีละชุด: ชุดแรก 300 · เหลือ ${first.remaining}`);
ok((await legacyConsentStatus(T)).pending === first.remaining, "หน้าจอบอกจำนวนที่ยังไม่ย้าย ตรงกับที่เหลือจริง");
const r1 = await syncLegacyConsents(T, "verify");
ok(first.consents + r1.consents === before.granted && first.withdrawals + r1.withdrawals === before.withdrawn && r1.remaining === 0,
  `ย้ายครบ: ยินยอม ${first.consents + r1.consents}/${before.granted} · ถอน ${first.withdrawals + r1.withdrawals}/${before.withdrawn}`);
const r2 = await syncLegacyConsents(T, "verify");
ok(r2.consents === 0 && r2.withdrawals === 0, "กดซ้ำไม่บันทึกซ้ำ");
ok((await legacyConsentStatus(T)).pending === 0, "ย้ายครบ = ไม่เหลือค้าง");
ok((await prefs(A)).some((p) => p.kind === "withdrawal" && p.purpose_id === MP), "คนที่ถอนในระบบเดิมมีบันทึกถอนในบริการนโยบาย");
const evidence = await get<{ note: string }>(
  "SELECT e.note FROM preferences f JOIN evidence e ON e.id = f.evidence_id WHERE f.tenant_id = ? AND f.customer_id = ? AND f.kind = 'consent'", T, B);
ok(!!evidence?.note.startsWith("ย้ายจากระบบรับข่าวสารเดิม"), "หลักฐานบอกว่าย้ายมาจากระบบเดิม");
const ask = (id: string) => decide(T, { customerId: id, purposeId: MP, channel: "phone", messageKind: "marketing" });
ok((await ask(A)).status === "suppressed", "บริการนโยบาย: คนที่ถอนในระบบเดิม = ห้ามติดต่อ");

// ── หลังย้าย: ทางไหนก็ตรงกัน ──
await recordPreference(T, B, { kind: "objection", evidence: "คัดค้านทางโทรศัพท์ (สมมุติ)" }, "verify");
ok(!!(await legacy(B))?.revoked_at, "คัดค้านในบริการนโยบาย → ระบบเดิมเห็นว่าถอน (การส่งแบบเดิมหยุด)");
await setConsent(T, C, false, "verify");
ok((await prefs(C)).at(-1)?.kind === "withdrawal" && (await ask(C)).status === "suppressed", "ถอนด้วยช่องติ๊กเดิม → บริการนโยบายห้ามติดต่อทันที");
const newbie = await createCustomer(T, { name: "ลูกค้าใหม่ ยินยอม (สมมุติ)", contacts: [{ kind: "phone", value: "081-777-9001" }], profile: {}, consent: true }, "verify");
ok(newbie.ok && (await prefs(newbie.id)).some((p) => p.kind === "consent" && p.purpose_id === MP), "เพิ่มคนพร้อมติ๊กยินยอม → มีความยินยอมในบริการนโยบาย");
const plain = await createCustomer(T, { name: "ลูกค้าใหม่ ไม่ติ๊ก (สมมุติ)", contacts: [{ kind: "phone", value: "081-777-9002" }], profile: {}, consent: false }, "verify");
await recordPreference(T, plain.ok ? plain.id : "", { kind: "consent", purposeId: MP, evidence: "ยินยอมผ่านแบบฟอร์มออนไลน์ (สมมุติ)" }, "verify");
ok(plain.ok && !!(await legacy(plain.id))?.granted_at && !(await legacy(plain.id))?.revoked_at, "ยินยอมในบริการนโยบาย → ระบบเดิมเห็นว่ายินยอม");

// ── ที่จริงชนะ ──
/* ระบบเดิมถูกแก้ตรง ๆ ให้กลับมายินยอม (เช่น ไฟล์เก่า) ขณะที่ที่จริงมีถอนล่าสุด — ต้องไม่ปลุกความยินยอมกลับมา */
await run("UPDATE consents SET revoked_at = NULL WHERE tenant_id = ? AND customer_id = ? AND purpose = 'marketing'", T, C);
await syncLegacyConsents(T, "verify", [C]);
ok((await prefs(C)).at(-1)?.kind === "withdrawal" && (await ask(C)).status === "suppressed", "ถอนในบริการนโยบายชนะความยินยอมเก่าในระบบเดิม");
ok(D !== undefined && (await ask(D)).status !== "suppressed", "คนที่ยังยินยอมอยู่ไม่ถูกกระทบ");

for (const line of out) console.log(line);
const failed = out.filter((l) => l.startsWith("FAIL"));
if (failed.length) { console.log(`\n=== FAIL ${failed.length} ข้อ ===`); process.exit(1); }
console.log(`\n=== ผ่านทั้งหมด ${out.length} ข้อ ===`);
