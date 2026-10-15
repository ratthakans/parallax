/* ── แม่แบบวัตถุประสงค์ + ฐานที่ผูกกับบริษัท (docs/solo-plan.md S4 · S3) ─────────

   เลือกแม่แบบ = วัตถุประสงค์ + ฐานรุ่น 1 + ขอบเขต + กฎอายุ · ต้องยืนยันข้อเท็จจริง · เลือกซ้ำไม่สร้างซ้อน
   ฐานจากแม่แบบไม่ครอบคลุมช่องทาง/ชนิดข้อความนอกขอบเขต
   ฐานที่ผูกกับบริษัท + คนย้ายบริษัท = ต้องตรวจ จนกว่ามีหลักฐานใหม่ที่บริษัทใหม่ (คุยกันหลังย้าย หรือยินยอมหลังย้าย)
   ข้อมูลทั้งหมดเป็นชื่อสมมุติ โดเมน .example */
import "./isolate.mts";
import { createHash, randomUUID } from "node:crypto";
import { ensureReady } from "@/lib/engine/bootstrap";
import { get, run } from "@/lib/engine/sql";
import { ensurePurpose, registerSource } from "@/lib/engine/vault/sources";
import { commitUpload } from "@/lib/engine/vault/intake";
import { resolveTenant } from "@/lib/engine/vault/resolve";
import { decide, setBasis, type Ask } from "@/lib/engine/policy";
import { recordPreference } from "@/lib/engine/policy/preferences";
import { adoptTemplate, listTemplates } from "@/lib/engine/policy/templates";
import { PURPOSE_TEMPLATES } from "@/lib/shared/purpose-templates";

const out: string[] = [];
const ok = (c: boolean, m: string) => out.push(`${c ? "PASS" : "FAIL"}  ${m}`);
const T = "hongmove";
await ensureReady();

const MAP = { 0: "first_name", 1: "last_name", 2: "company", 3: "job_title", 4: "email", 5: "phone", 6: "occurred_at" };
const src = await registerSource(T, {
  name: "รายชื่อสมมุติสำหรับตรวจแม่แบบ", kind: "file", newPurpose: "นำเข้าเพื่อตรวจแม่แบบ",
  acquisitionNote: "ข้อมูลสมมุติที่เขียนขึ้นในชุดตรวจ ไม่ใช่ข้อมูลของใคร", fields: Object.values(MAP),
}, "verify");
if (!src.ok) throw new Error(src.error);
const d40 = new Date(Date.now() - 40 * 864e5).toISOString().slice(0, 10);
const d10 = new Date(Date.now() - 10 * 864e5).toISOString().slice(0, 10);
const upload = async (name: string, lines: string[]) => {
  const bytes = new TextEncoder().encode(["ชื่อ,นามสกุล,บริษัท,ตำแหน่ง,อีเมล,โทรศัพท์,วันที่", ...lines].join("\n"));
  const r = await commitUpload(T, src.id, bytes, name, MAP, createHash("sha256").update(bytes).digest("hex"), "verify");
  if (!r.ok) throw new Error(r.error);
  await resolveTenant(T, "verify");
  return r.batchId;
};
const batch = await upload("แม่แบบ.csv", [
  `ไพลิน,พลอยงาม,บริษัท พลอยเพชร จำกัด,ผู้จัดการฝ่ายจัดซื้อ,pailin@ploypet.example,081-555-6001,${d40}`,
  `มานพ,ย้ายงาน,บริษัท ต้นทาง จำกัด,ผู้จัดการฝ่ายจัดซื้อ,manop@personal-mail.example,081-555-6002,${d40}`,
  `ศรี,ย้ายเหมือนกัน,บริษัท ต้นน้ำ จำกัด,ผู้จัดการฝ่ายจัดซื้อ,sri@personal-mail2.example,081-555-6003,${d40}`,
]);
const who = async (first: string) => (await get<{ id: string }>(
  "SELECT DISTINCT c.id FROM customers c JOIN import_rows r ON r.customer_id = c.id AND r.tenant_id = c.tenant_id WHERE c.tenant_id = ? AND r.batch_id = ? AND c.name LIKE ?",
  T, batch, `${first}%`))!.id;
const pailin = await who("ไพลิน"), manop = await who("มานพ"), sri = await who("ศรี");
const ask = (customerId: string, purposeId: string, extra: Partial<Ask> = {}): Ask => ({ customerId, purposeId, channel: "email", messageKind: "marketing", ...extra });
const count = async (sql: string, ...p: string[]) => Number((await get<{ n: number | string }>(sql, ...p))!.n);

// ── รายการและการเลือก ──
let list = await listTemplates(T);
ok(list.length === PURPOSE_TEMPLATES.length && list.every((t) => !t.adopted), `มีแม่แบบ ${list.length} ตัว ยังไม่มีตัวไหนถูกใช้`);
ok(PURPOSE_TEMPLATES.every((t) => t.channels.length > 0 && t.messageKinds.length > 0 && !t.messageKinds.includes("consent_request")),
  "ทุกแม่แบบจำกัดช่องทางและชนิดข้อความ — ไม่มีแม่แบบ \"ใช้ได้ทุกอย่าง\"");
const before = await count("SELECT COUNT(*) AS n FROM purposes WHERE tenant_id = ?", T);
ok(!(await adoptTemplate(T, "b2b_followup_existing", "", "owner@verify")).ok
  && await count("SELECT COUNT(*) AS n FROM purposes WHERE tenant_id = ?", T) === before, "ไม่ยืนยันข้อเท็จจริง = ไม่สร้างอะไรเลย");
ok(!(await adoptTemplate(T, "no_such_template", "ยืนยันว่าเป็นจริงทุกอย่าง", "owner@verify")).ok, "แม่แบบที่ไม่มีอยู่ใช้ไม่ได้");
const fu = await adoptTemplate(T, "b2b_followup_existing", "ลูกค้าในไฟล์ซื้อบริการปี 2567 (สมมุติ)", "owner@verify");
if (!fu.ok) throw new Error(fu.error);
const rec = await get<{ lawful_basis: string; version: number | string; employer_scoped: number | string; allowed_channels: string; lia_ref: string; data_scope: string }>(
  "SELECT lawful_basis, version, employer_scoped, allowed_channels, lia_ref, data_scope FROM processing_records WHERE tenant_id = ? AND purpose_id = ?", T, fu.purposeId);
ok(rec?.lawful_basis === "legitimate_interest" && Number(rec.version) === 1 && Number(rec.employer_scoped) === 1
  && JSON.parse(rec.allowed_channels).includes("email") && /แม่แบบ b2b_followup_existing รุ่น 1/.test(rec.lia_ref) && /ซื้อบริการปี 2567/.test(rec.data_scope),
  "เลือกแม่แบบ = ฐานรุ่น 1 พร้อมขอบเขต อ้างแม่แบบ และเก็บคำยืนยันของผู้อนุมัติ");
ok(await count("SELECT COUNT(*) AS n FROM retention_rules WHERE tenant_id = ? AND data_kind = ?", T, `purpose:${fu.purposeId}`) === 1, "สร้างกฎอายุข้อมูลพร้อมกัน");
const again = await adoptTemplate(T, "b2b_followup_existing", "เลือกซ้ำอีกครั้ง (สมมุติ)", "owner@verify");
ok(again.ok && again.existed && again.purposeId === fu.purposeId
  && await count("SELECT COUNT(*) AS n FROM purposes WHERE tenant_id = ? AND template_code = ?", T, "b2b_followup_existing") === 1, "เลือกซ้ำได้วัตถุประสงค์เดิม ไม่สร้างซ้อน");
list = await listTemplates(T);
ok(list.find((t) => t.code === "b2b_followup_existing")?.adopted?.purposeId === fu.purposeId && !list.some((t) => t.newer), "รายการแสดงว่าใช้แม่แบบไหนอยู่ และยังไม่มีรุ่นใหม่");

// ── ขอบเขตของฐาน ──
ok((await decide(T, ask(pailin, fu.purposeId))).status === "eligible", "แม่แบบติดตามลูกค้าเดิม: คนที่ไม่ได้ย้ายบริษัท = ใช้ได้");
const sp = await adoptTemplate(T, "b2b_sponsor_offer", "บริษัทในไฟล์เคยออกบูธงานปี 2568 (สมมุติ)", "owner@verify");
if (!sp.ok) throw new Error(sp.error);
const svc = await decide(T, ask(pailin, sp.purposeId, { messageKind: "service" }));
ok(svc.status === "review_required" && svc.reasons.some((r) => /ชนิดข้อความนี้อยู่นอกขอบเขต/.test(r)), "แม่แบบเสนอสปอนเซอร์ไม่ครอบคลุมข้อความบริการ");
const cs = await adoptTemplate(T, "b2b_marketing_consented", "มีแบบฟอร์มความยินยอมรายคน (สมมุติ)", "owner@verify");
if (!cs.ok) throw new Error(cs.error);
const noConsent = await decide(T, ask(pailin, cs.purposeId));
ok(noConsent.status === "review_required" && noConsent.reasons.some((r) => /ไม่ทราบสถานะความยินยอม/.test(r)), "แม่แบบความยินยอมไม่ทำให้ใครใช้ได้จนกว่ามีความยินยอมรายคน");
const meet = await decide(T, ask(pailin, cs.purposeId, { channel: "meeting" }));
ok(meet.status === "review_required" && meet.reasons.some((r) => /นอกขอบเขตของฐานนี้/.test(r)), "ช่องทางนอกขอบเขตของแม่แบบ = ต้องตรวจ");
await recordPreference(T, pailin, { kind: "consent", purposeId: cs.purposeId, evidence: "แบบฟอร์มยินยอม (สมมุติ)" }, "verify");
ok((await decide(T, ask(pailin, cs.purposeId))).status === "eligible", "บันทึกความยินยอมแล้ว = ใช้ได้");

// ── ย้ายบริษัท ──
await upload("ย้ายบริษัท.csv", [
  `มานพ,ย้ายงาน,บริษัท ปลายทาง จำกัด,ผู้อำนวยการฝ่ายจัดซื้อ,manop@personal-mail.example,081-555-6002,${d10}`,
  `ศรี,ย้ายเหมือนกัน,บริษัท ปลายน้ำ จำกัด,ผู้อำนวยการฝ่ายจัดซื้อ,sri@personal-mail2.example,081-555-6003,${d10}`,
]);
const moved = await decide(T, ask(manop, fu.purposeId));
ok(moved.status === "review_required" && moved.reasons.some((r) => /ย้ายไป บริษัท ปลายทาง/.test(r) && /ผูกกับความสัมพันธ์ที่บริษัทเดิม/.test(r)),
  "ฐานที่ผูกกับบริษัท + ย้ายบริษัท = ต้องตรวจ พร้อมเหตุผลว่าย้ายไปไหน เมื่อไร");
const plain = await ensurePurpose(T, "ติดต่อทั่วไป (ไม่ใช่แม่แบบ)", "verify");
await setBasis(T, plain, { lawfulBasis: "legitimate_interest", liaRef: "LIA-PLAIN (สมมุติ)" }, "owner@verify");
ok((await decide(T, ask(manop, plain))).status === "eligible", "ฐานที่ตั้งเองโดยไม่ผูกบริษัท ไม่เปลี่ยนพฤติกรรมเดิม");
const newOrg = (await get<{ org_id: string }>("SELECT org_id FROM affiliations WHERE tenant_id = ? AND customer_id = ? AND valid_to IS NULL", T, manop))!.org_id;
const oldOrg = (await get<{ org_id: string }>("SELECT org_id FROM affiliations WHERE tenant_id = ? AND customer_id = ? AND valid_to IS NOT NULL", T, manop))!.org_id;
const now = new Date().toISOString();
await run("INSERT INTO interactions (id, tenant_id, kind, occurred_at, org_id, customer_id, summary, owner_id, recorded_at) VALUES (?,?,?,?,?,?,?,?,?)",
  randomUUID(), T, "call", d40, oldOrg, manop, "คุยตอนยังอยู่ที่เดิม (สมมุติ)", "owner@verify", now);
ok((await decide(T, ask(manop, fu.purposeId))).status === "review_required", "การคุยกันที่บริษัทเดิมก่อนย้ายไม่นับเป็นหลักฐานใหม่");
await run("INSERT INTO interactions (id, tenant_id, kind, occurred_at, org_id, customer_id, summary, owner_id, recorded_at) VALUES (?,?,?,?,?,?,?,?,?)",
  randomUUID(), T, "meeting", now, newOrg, manop, "นัดคุยที่บริษัทใหม่ (สมมุติ)", "owner@verify", now);
const cleared = await decide(T, ask(manop, fu.purposeId));
ok(cleared.status === "eligible" && cleared.reasons.some((r) => /หลักฐานใหม่หลังวันที่ย้าย/.test(r)), "คุยกันที่บริษัทใหม่หลังย้ายแล้ว = ใช้ได้ พร้อมเหตุผล");
ok((await decide(T, ask(sri, fu.purposeId))).status === "review_required", "อีกคนที่ย้ายแต่ยังไม่มีหลักฐานใหม่ยังต้องตรวจ");
await recordPreference(T, sri, { kind: "consent", purposeId: fu.purposeId, evidence: "ยินยอมทางอีเมลหลังย้ายงาน (สมมุติ)" }, "verify");
ok((await decide(T, ask(sri, fu.purposeId))).status === "eligible", "ความยินยอมของวัตถุประสงค์นี้หลังวันที่ย้าย = ใช้ได้");

// ── ฐานรุ่นใหม่ ──
const sriOnly = await ensurePurpose(T, "ทดสอบรุ่นใหม่", "verify");
await setBasis(T, sriOnly, { lawfulBasis: "legitimate_interest", liaRef: "LIA-V1 (สมมุติ)", employerScoped: true, channels: ["email"] }, "owner@verify");
await setBasis(T, sriOnly, { lawfulBasis: "legitimate_interest", liaRef: "LIA-V2 (สมมุติ)" }, "owner@verify");
const v2 = await get<{ employer_scoped: number | string; allowed_channels: string | null }>(
  "SELECT employer_scoped, allowed_channels FROM processing_records WHERE tenant_id = ? AND purpose_id = ? AND effective_to IS NULL", T, sriOnly);
ok(Number(v2?.employer_scoped) === 1 && v2?.allowed_channels === JSON.stringify(["email"]), "ตั้งฐานรุ่นใหม่โดยไม่ระบุขอบเขต = ใช้ขอบเขตของรุ่นก่อน (ไม่หายเงียบ)");
await setBasis(T, sriOnly, { lawfulBasis: "legitimate_interest", liaRef: "LIA-V3 (สมมุติ)", employerScoped: false, channels: null }, "owner@verify");
const v3 = await get<{ employer_scoped: number | string; allowed_channels: string | null }>(
  "SELECT employer_scoped, allowed_channels FROM processing_records WHERE tenant_id = ? AND purpose_id = ? AND effective_to IS NULL", T, sriOnly);
ok(Number(v3?.employer_scoped) === 0 && v3?.allowed_channels === null, "ยกเลิกขอบเขตได้เมื่อระบุชัด");
ok(!(await setBasis(T, sriOnly, { lawfulBasis: "legitimate_interest", liaRef: "LIA-X", channels: ["fax"] }, "owner@verify")).ok, "ช่องทางที่ไม่รู้จักตั้งเป็นขอบเขตไม่ได้");

for (const line of out) console.log(line);
const failed = out.filter((l) => l.startsWith("FAIL"));
if (failed.length) {
  console.log(`\n=== FAIL ${failed.length} ข้อ ===`);
  process.exit(1);
}
console.log(`\n=== ผ่านทั้งหมด ${out.length} ข้อ ===`);
