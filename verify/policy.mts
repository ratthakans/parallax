/* ── บริการนโยบาย (docs/plan.md หัวข้อ 6 · B5) ─────────────────────

   ทุกกรณีในหัวข้อ 6.3 + fail closed + ตรวจซ้ำก่อนติดต่อ + ถอน/คัดค้านยกเลิกงานค้าง
   ข้อมูลทั้งหมดเป็นชื่อสมมุติ โดเมน .example */
import "./isolate.mts";
import { createHash } from "node:crypto";
import { ensureReady } from "@/lib/engine/bootstrap";
import { all, get, run } from "@/lib/engine/sql";
import { ensurePurpose, registerSource } from "@/lib/engine/vault/sources";
import { commitUpload } from "@/lib/engine/vault/intake";
import { resolveTenant } from "@/lib/engine/vault/resolve";
import { mergePersons } from "@/lib/engine/vault/merge";
import { decide, setBasis, type Ask } from "@/lib/engine/policy";
import { recordPreference } from "@/lib/engine/policy/preferences";
import { assignTarget, buildTargets, createCampaign, getCampaign, recordOutcome } from "@/lib/engine/campaigns";

const out: string[] = [];
const ok = (c: boolean, m: string) => out.push(`${c ? "PASS" : "FAIL"}  ${m}`);
const T = "hongmove";
await ensureReady();

const MAP = { 0: "first_name", 1: "last_name", 2: "company", 3: "job_title", 4: "email", 5: "phone", 6: "occurred_at" };
const src = await registerSource(T, {
  name: "รายชื่อสมมุติสำหรับตรวจนโยบาย", kind: "file", newPurpose: "ขายสปอนเซอร์",
  acquisitionNote: "ข้อมูลสมมุติที่เขียนขึ้นในชุดตรวจ ไม่ใช่ข้อมูลของใคร", fields: Object.values(MAP),
}, "verify");
if (!src.ok) throw new Error(src.error);
const recent = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
const bytes = new TextEncoder().encode([
  "ชื่อ,นามสกุล,บริษัท,ตำแหน่ง,อีเมล,โทรศัพท์,วันที่",
  `กมล,สุขดี,บริษัท ทะเลทอง จำกัด,ผู้จัดการฝ่ายการตลาด,kamon@taleethong.example,081-555-3001,${recent}`,
  `จิรา,มั่นคง,บริษัท ทะเลทอง จำกัด,ผู้อำนวยการฝ่ายการตลาด,jira@taleethong.example,,${recent}`,
  `ประเสริฐ,เก่าแก่,บริษัท ทะเลทอง จำกัด,ผู้จัดการทั่วไป,prasert@taleethong.example,081-555-3003,2020-01-15`,
  `วีระ,ซ้ำซ้อน,บริษัท ฟ้าคราม จำกัด,ผู้จัดการฝ่ายการตลาด,weera@fahkram.example,081-555-3004,${recent}`,
].join("\n"));
const c = await commitUpload(T, src.id, bytes, "นโยบาย.csv", MAP, createHash("sha256").update(bytes).digest("hex"), "verify");
if (!c.ok) throw new Error(c.error);
await resolveTenant(T, "verify");
/* บัญชีเดโมมีลูกค้ายุคค้าปลีกชื่อไทยซ้ำได้ — หาเฉพาะคนจากไฟล์นี้ (มีแถวต้นทางในชุดนี้) */
const who = async (first: string) => (await get<{ id: string }>(
  "SELECT DISTINCT c.id FROM customers c JOIN import_rows r ON r.customer_id = c.id AND r.tenant_id = c.tenant_id WHERE c.tenant_id = ? AND r.batch_id = ? AND c.name LIKE ?",
  T, c.batchId, `${first}%`))!.id;
const kamon = await who("กมล"), jira = await who("จิรา"), prasert = await who("ประเสริฐ"), weera = await who("วีระ");

const SALES = await ensurePurpose(T, "ขายสปอนเซอร์", "verify");
const NEWS = await ensurePurpose(T, "ข่าวสารจากผู้จัดงาน", "verify");
const SHARE = await ensurePurpose(T, "ส่งรายชื่อให้สปอนเซอร์", "verify");
const TICKET = await ensurePurpose(T, "บริการผู้ซื้อบัตร", "verify");
const ask = (customerId: string, purposeId: string, extra: Partial<Ask> = {}): Ask => ({ customerId, purposeId, channel: "email", messageKind: "marketing", ...extra });

// ── ฐาน ──
let d = await decide(T, ask(kamon, SALES));
ok(d.status === "review_required" && d.reasons.some((r) => /ยังไม่มีฐาน/.test(r)), "วัตถุประสงค์ที่ยังไม่มีฐาน = ต้องตรวจก่อน");
ok(!(await setBasis(T, SALES, { lawfulBasis: "legitimate_interest" }, "dpo@verify")).ok, "ฐานประโยชน์โดยชอบต้องอ้าง LIA");
await setBasis(T, SALES, { lawfulBasis: "legitimate_interest", liaRef: "LIA-2026-01 (สมมุติ)" }, "dpo@verify");
await setBasis(T, NEWS, { lawfulBasis: "consent" }, "dpo@verify");
await setBasis(T, SHARE, { lawfulBasis: "consent" }, "dpo@verify");
await setBasis(T, TICKET, { lawfulBasis: "contract" }, "dpo@verify");
d = await decide(T, ask(kamon, SALES));
ok(d.status === "eligible" && /ฐานรุ่น 1$/.test(d.policyVersion), `ขายสปอนเซอร์ด้วยฐานประโยชน์โดยชอบ + LIA = ใช้ได้ (รุ่น ${d.policyVersion})`);

// ── 6.3 ข้อ 1: ซื้อบัตร → ข้อความบริการได้ ≠ ข้อเสนอ ──
ok((await decide(T, ask(kamon, TICKET, { messageKind: "service" }))).status === "eligible", "ฐานสัญญา (ผู้ซื้อบัตร): ข้อความบริการใช้ได้");
d = await decide(T, ask(kamon, TICKET, { messageKind: "marketing" }));
ok(d.status === "review_required" && d.reasons.some((r) => /เฉพาะข้อความบริการ/.test(r)), "ฐานสัญญา: ข้อเสนอการตลาดไม่ผ่าน");

// ── ไม่ทราบ = พัก ──
d = await decide(T, ask(kamon, NEWS));
ok(d.status === "review_required" && d.reasons.some((r) => /ไม่ทราบสถานะความยินยอม/.test(r)), "ฐานความยินยอมที่ไม่มีบันทึกความยินยอม = พักไว้ ไม่ใช่ใช้ได้");
ok(!(await recordPreference(T, kamon, { kind: "consent", evidence: "แบบฟอร์มสมมุติ" }, "verify")).ok, "ความยินยอมที่ไม่ระบุวัตถุประสงค์บันทึกไม่ได้");
ok(!(await recordPreference(T, kamon, { kind: "consent", purposeId: NEWS, evidence: "" }, "verify")).ok, "บันทึกความยินยอมโดยไม่มีหลักฐานไม่ได้");
await recordPreference(T, kamon, { kind: "consent", purposeId: NEWS, evidence: "ติ๊กช่องรับข่าวในแบบฟอร์มลงทะเบียน (สมมุติ)" }, "verify");
ok((await decide(T, ask(kamon, NEWS))).status === "eligible", "มีความยินยอมของวัตถุประสงค์นั้น = ใช้ได้");

// ── 6.3 ข้อ 2: ยินยอมรับข่าว ≠ อนุญาตส่งให้สปอนเซอร์ ──
d = await decide(T, ask(kamon, SALES, { disclosurePurposeId: SHARE }));
ok(d.status === "review_required" && d.reasons.some((r) => /เปิดเผยต่อบุคคลอื่น/.test(r)), "ยินยอมรับข่าวจากผู้จัดงานไม่นับเป็นการอนุญาตให้เปิดเผยต่อสปอนเซอร์");
await recordPreference(T, kamon, { kind: "consent", purposeId: SHARE, evidence: "ติ๊กช่องยินยอมให้ส่งข้อมูลแก่สปอนเซอร์ (สมมุติ)" }, "verify");
ok((await decide(T, ask(kamon, SALES, { disclosurePurposeId: SHARE }))).status === "eligible", "ยินยอมให้เปิดเผยแยกแล้ว = เปิดเผยได้");

// ── 6.3 ข้อ 3: ถอนมีผลในขอบเขตของมัน ──
await recordPreference(T, kamon, { kind: "withdrawal", purposeId: NEWS, evidence: "ตอบอีเมลขอยกเลิกรับข่าว (สมมุติ)" }, "verify");
ok((await decide(T, ask(kamon, NEWS))).status === "suppressed", "ถอนความยินยอมรับข่าว = ห้ามส่งข่าว");
ok((await decide(T, ask(kamon, SALES))).status === "eligible", "ถอนเฉพาะข่าวสาร ไม่กระทบวัตถุประสงค์อื่นที่ใช้ฐานอื่น");

// ── 6.3 ข้อ 4: ห้ามเปลี่ยนฐานเพื่อหลบการถอน ──
await setBasis(T, NEWS, { lawfulBasis: "legitimate_interest", liaRef: "LIA-2026-02 (สมมุติ)" }, "dpo@verify");
d = await decide(T, ask(kamon, NEWS));
ok(d.status === "suppressed" && /ฐานรุ่น 2$/.test(d.policyVersion), `เปลี่ยนฐานของวัตถุประสงค์เป็นประโยชน์โดยชอบแล้ว คนที่ถอนไว้ยังห้าม (รุ่น ${d.policyVersion})`);

// ── คัดค้านการตลาด = หยุดใช้เพื่อการตลาดทุกวัตถุประสงค์ ──
await recordPreference(T, jira, { kind: "objection", evidence: "แจ้งทางโทรศัพท์ว่าไม่ต้องการรับข้อเสนอ (สมมุติ)" }, "verify");
ok((await decide(T, ask(jira, SALES, { channel: "meeting" }))).status === "suppressed", "คัดค้านการตลาด = ห้ามเสนอขาย (ทุกช่องทาง)");
ok((await decide(T, ask(jira, TICKET, { messageKind: "service", channel: "meeting" }))).status === "eligible", "คัดค้านการตลาดไม่ห้ามข้อความบริการ");

// ── 6.3 ข้อ 5: ไม่ส่งขอความยินยอมแบบเหมารวม ──
d = await decide(T, ask(weera, NEWS, { messageKind: "consent_request" }));
ok(d.status === "review_required" && d.reasons.some((r) => /เหมารวม/.test(r)), "แคมเปญขอความยินยอมให้กลุ่มไม่ทราบสถานะ = ต้องให้คนตัดสินรายคน");

// ── ช่องทาง · อายุข้อมูล · ข้อจำกัด · ตัวตนรอตรวจ ──
d = await decide(T, ask(jira, TICKET, { messageKind: "service", channel: "phone" }));
ok(d.status === "channel_invalid", "ไม่มีเบอร์ = ช่องทางใช้ไม่ได้ (ไม่ใช่ข้อสรุปเรื่องฐาน)");
d = await decide(T, ask(prasert, SALES));
ok(d.status === "review_required" && d.reasons.some((r) => /เก่ากว่า 3 ปี/.test(r)), "ข้อมูลล่าสุดเก่ากว่า 3 ปี = ยืนยันก่อนใช้");
await recordPreference(T, weera, { kind: "restriction", purposeId: SALES, evidence: "ขอระงับการใช้ระหว่างตรวจสอบ (สมมุติ)" }, "verify");
ok((await decide(T, ask(weera, SALES))).status === "suppressed", "ขอจำกัดการใช้ = ห้าม");
await run("UPDATE customers SET lifecycle_state = 'pending_review' WHERE tenant_id = ? AND id = ?", T, kamon);
ok((await decide(T, ask(kamon, SALES))).status === "review_required", "ตัวตนที่ยังรอตรวจในคิว = ต้องตรวจก่อน");
await run("UPDATE customers SET lifecycle_state = 'needs_review' WHERE tenant_id = ? AND id = ?", T, kamon);
ok((await decide(T, ask(kamon, SALES))).status === "review_required", "ระเบียนที่ถูกส่งกลับมาทบทวน (needs_review) = ต้องตรวจก่อน");
await run("UPDATE customers SET lifecycle_state = 'confirmed' WHERE tenant_id = ? AND id = ?", T, kamon);

// ── fail closed ──
process.env.PARALLAX_POLICY_FAULT = "1";
d = await decide(T, ask(kamon, SALES));
ok(d.failed === true && d.status !== "eligible", "บริการนโยบายใช้ไม่ได้ = ไม่ผ่าน และบอกผู้เรียกให้หยุด");
const camp0 = await createCampaign(T, { name: "แคมเปญทดสอบ fail closed", purposeId: SALES, channel: "email", messageKind: "marketing", criteria: {} }, "bd@verify");
const failedBuild = camp0.ok ? await buildTargets(T, camp0.id, "bd@verify") : null;
ok(failedBuild != null && !failedBuild.ok, "สร้างรายชื่อตอนบริการนโยบายล่ม = ไม่สร้าง");
delete process.env.PARALLAX_POLICY_FAULT;

// ── วงจรแคมเปญ: ตรวจซ้ำก่อนมอบหมาย · คัดค้านยกเลิกงานค้าง ──
const camp = await createCampaign(T, {
  name: "ขายสปอนเซอร์ (สมมุติ)", offer: "แพ็กเกจ Gold", purposeId: SALES, channel: "email", messageKind: "marketing",
  criteria: { titleKeywords: ["การตลาด"], maxPerOrg: 2 },
}, "bd@verify");
if (!camp.ok) throw new Error(camp.error);
const built = await buildTargets(T, camp.id, "bd@verify");
ok(built.ok && built.people === 3, `เกณฑ์ "ตำแหน่งมีคำว่าการตลาด" ได้ 3 คน (${built.ok ? built.people : "-"})`);
let view = (await getCampaign(T, camp.id))!;
const tk = view.targets.find((t) => t.customerId === kamon)!;
const tj = view.targets.find((t) => t.customerId === jira)!;
ok(tk.reasons.some((r) => /การตลาด/.test(r)) && tk.eligibility === "eligible", "เป้าหมายมีเหตุผลที่ถูกเลือก และผลนโยบาย");
ok(tj.eligibility === "suppressed" && tj.eligibilityReasons.some((r) => /คัดค้าน/.test(r)), "คนที่คัดค้านอยู่ในรายชื่อพร้อมสถานะห้ามติดต่อ (เห็นว่าทำไม ไม่ใช่หายไปเฉย ๆ)");
const blocked = await assignTarget(T, tj.id, "bd@verify", recent, "bd@verify");
ok(!blocked.ok && Boolean(blocked.reasons?.length), "มอบหมายคนที่นโยบายไม่อนุญาตไม่ได้ พร้อมเหตุผล");
const due = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
ok((await assignTarget(T, tk.id, "bd@verify", due, "bd@verify")).ok, "มอบหมายคนที่ใช้ได้ = สร้างงาน");
ok(Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM tasks WHERE tenant_id = ? AND target_id = ? AND status = 'open'", T, tk.id))!.n) === 1, "มีงานเปิดหนึ่งงาน");

/* บันทึกผลต้องผ่านการมอบหมาย และต้อง Eligible จริง ณ ตอนนั้น — ไม่ใช่แค่ "ไม่ถูกระงับ" (plan 6.1)
   Server Action ยิงตรงได้ หน้าจอที่ซ่อนฟอร์มไม่ใช่ด่าน */
const tw = view.targets.find((t) => t.customerId === weera)!;
const unassigned = await recordOutcome(T, tw.id, { outcome: "meeting", note: "นัดแล้ว", nextStep: "ส่งข้อเสนอ", nextDue: due }, "bd@verify");
ok(!unassigned.ok && /มอบหมาย/.test(unassigned.ok ? "" : unassigned.error), "บันทึกผลกับเป้าหมายที่ยังไม่มอบหมายไม่ได้");
await run("UPDATE customers SET lifecycle_state = 'pending_review' WHERE tenant_id = ? AND id = ?", T, kamon);
const review = await recordOutcome(T, tk.id, { outcome: "meeting", note: "นัดแล้ว" }, "bd@verify");
ok(!review.ok && /ยังไม่อนุญาต/.test(review.ok ? "" : review.error), "คนที่กลับไปรอตรวจ (Review required) บันทึกว่านัดประชุมไม่ได้");
ok(!(await recordOutcome(T, tk.id, { outcome: "not_interested", note: "ไม่สนใจ", nextStep: "โทรตาม", nextDue: due }, "bd@verify")).ok,
  "ปิดว่าไม่สนใจพร้อมสร้างงานติดต่อต่อกับคนที่ยังไม่ผ่านนโยบายไม่ได้");
await run("UPDATE customers SET lifecycle_state = 'confirmed' WHERE tenant_id = ? AND id = ?", T, kamon);

/* ตรวจซ้ำตอนบันทึกผล: การคัดค้านมาทางอื่นระหว่างงาน (ใส่ตรงลงตาราง ไม่ผ่านการยกเลิกอัตโนมัติ) */
await run("INSERT INTO preferences (id, tenant_id, customer_id, purpose_id, channel, kind, effective_at, evidence_id, recorded_by, recorded_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
  "pref-direct", T, kamon, null, "any", "objection", new Date().toISOString(), null, "import", new Date().toISOString());
const late = await recordOutcome(T, tk.id, { outcome: "contacted", note: "ส่งอีเมลแล้ว" }, "bd@verify");
ok(!late.ok && /ระงับ/.test(late.ok ? "" : late.error), "บันทึกว่าติดต่อแล้ว ตรวจนโยบายซ้ำ ณ ตอนนั้น — คนที่มอบหมายตอนใช้ได้ แต่คัดค้านทีหลัง ถูกหยุด");

const pref = await recordPreference(T, kamon, { kind: "objection", evidence: "ตอบอีเมลว่าไม่ต้องการรับข้อเสนอ (สมมุติ)" }, "verify");
ok(pref.ok && pref.cancelled === 1, "บันทึกการคัดค้านผ่านระบบ = เป้าหมายที่ยังไม่จบถูกยกเลิกทันที");
view = (await getCampaign(T, camp.id))!;
ok(view.targets.find((t) => t.id === tk.id)?.status === "cancelled", "สถานะเป้าหมายเป็นยกเลิก (นโยบายไม่อนุญาตแล้ว)");
ok(Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM tasks WHERE tenant_id = ? AND target_id = ? AND status = 'open'", T, tk.id))!.n) === 0, "งานที่ค้างถูกยกเลิก");
ok(!(await recordOutcome(T, tk.id, { outcome: "contacted", note: "ส่งอีเมลแล้ว" }, "bd@verify")).ok, "บันทึกการติดต่อกับเป้าหมายที่ยกเลิกไม่ได้");

// ── คนที่ถูกรวม: การคัดค้านใต้รหัสเดิมยังมีผล ──
const dup = await createCampaign(T, { name: "ทดสอบรวมคน", purposeId: SALES, channel: "meeting", messageKind: "marketing", criteria: { maxPerOrg: 5 } }, "bd@verify");
ok(dup.ok, "สร้างแคมเปญทดสอบได้");
if (dup.ok) await buildTargets(T, dup.id, "bd@verify");
const both = await all("SELECT customer_id FROM campaign_targets WHERE tenant_id = ? AND campaign_id = ? AND customer_id IN (?, ?)", T, dup.ok ? dup.id : "", prasert, jira);
ok(both.length === 2, "ทั้งสองคนเป็นเป้าหมายของแคมเปญเดียวกันก่อนรวม");
const m = await mergePersons(T, prasert, jira, "steward@verify", "review", null);
ok(m.ok && (await decide(T, ask(prasert, SALES, { channel: "meeting" }))).status === "suppressed", "รวมคนแล้ว การคัดค้านของรหัสที่ถูกรวมมีผลกับคนที่คงอยู่");
const afterMerge = await all("SELECT customer_id FROM campaign_targets WHERE tenant_id = ? AND campaign_id = ? AND customer_id IN (?, ?)", T, dup.ok ? dup.id : "", prasert, jira);
ok(afterMerge.length === 1, "รวมคนที่เป็นเป้าหมายแคมเปญเดียวกัน: เหลือเป้าหมายเดียว ไม่ชนกุญแจ");
if (m.ok) {
  const { unmerge } = await import("@/lib/engine/vault/merge");
  ok((await unmerge(T, m.mergeId, "steward@verify")).ok
    && (await all("SELECT customer_id FROM campaign_targets WHERE tenant_id = ? AND campaign_id = ? AND customer_id IN (?, ?)", T, dup.ok ? dup.id : "", prasert, jira)).length === 2,
    "แยกคืนแล้ว เป้าหมายของฝั่งที่ถูกรวมกลับมาครบ");
}

// ── เปลี่ยนฐานของวัตถุประสงค์ = งานที่ค้างถูกตรวจซ้ำทันที ไม่รอถึงตอนติดต่อ ──
const fresh = new TextEncoder().encode([
  "ชื่อ,นามสกุล,บริษัท,ตำแหน่ง,อีเมล,โทรศัพท์,วันที่",
  `สมใจ,ใหม่เอี่ยม,บริษัท ดาวเหนือ จำกัด,ผู้จัดการฝ่ายการตลาด,somjai@daonuea.example,081-555-3101,${recent}`,
].join("\n"));
const cf = await commitUpload(T, src.id, fresh, "ฐาน.csv", MAP, createHash("sha256").update(fresh).digest("hex"), "verify");
if (!cf.ok) throw new Error(cf.error);
await resolveTenant(T, "verify");
const somjai = (await get<{ id: string }>("SELECT id FROM customers WHERE tenant_id = ? AND name LIKE ?", T, "สมใจ%"))!.id;
const BASIS = await ensurePurpose(T, "ทดสอบเปลี่ยนฐาน", "verify");
await setBasis(T, BASIS, { lawfulBasis: "legitimate_interest", liaRef: "LIA-2026-02 (สมมุติ)" }, "dpo@verify");
const cb = await createCampaign(T, { name: "ทดสอบเปลี่ยนฐาน", purposeId: BASIS, channel: "email", messageKind: "marketing", criteria: { titleKeywords: ["การตลาด"], maxPerOrg: 2 } }, "bd@verify");
if (!cb.ok) throw new Error(cb.error);
await buildTargets(T, cb.id, "bd@verify");
const ts = (await getCampaign(T, cb.id))!.targets.find((t) => t.customerId === somjai)!;
ok((await assignTarget(T, ts.id, "bd@verify", due, "bd@verify")).ok, "มอบหมายคนที่ใช้ได้ในแคมเปญที่จะเปลี่ยนฐาน");
await setBasis(T, BASIS, { lawfulBasis: "contract" }, "dpo@verify");
const tsAfter = (await getCampaign(T, cb.id))!.targets.find((t) => t.id === ts.id)!;
ok(tsAfter.eligibility === "review_required", `ผลตัดสินของเป้าหมายถูกตรวจซ้ำทันทีหลังเปลี่ยนฐาน (${tsAfter.eligibility})`);
const rr = await recordOutcome(T, ts.id, { outcome: "contacted", note: "ส่งอีเมลแล้ว" }, "bd@verify");
ok(!rr.ok, "หลังเปลี่ยนฐาน บันทึกว่าติดต่อแล้วไม่ได้");

// ── วันและชั่วโมงตามเวลาไทย (เซิร์ฟเวอร์เป็น UTC) ──
const { bangkokDay, bangkokHour } = await import("@/lib/shared/format");
ok(bangkokDay(Date.parse("2026-10-13T18:30:00Z")) === "2026-10-14" && bangkokHour(Date.parse("2026-10-13T18:30:00Z")) === 1,
  "ตีหนึ่งครึ่งเวลาไทยนับเป็นวันใหม่ — งานครบกำหนดเมื่อวานขึ้นว่าเลยกำหนด และช่วงห้ามส่งไม่คลาดเจ็ดชั่วโมง");

// ── ไม่คัดลอกข้อมูลส่วนบุคคลลงผลตัดสิน ──
const stored = await all<{ eligibility_reasons: string; policy_version: string }>("SELECT eligibility_reasons, policy_version FROM campaign_targets WHERE tenant_id = ?", T);
ok(stored.length > 0 && stored.every((s) => !/@|081-?555/.test(s.eligibility_reasons) && Boolean(s.policy_version)), "ผลตัดสินที่เก็บมีเหตุผลและรุ่น ไม่มีอีเมลหรือเบอร์");

for (const line of out) console.log(line);
const failed = out.filter((l) => l.startsWith("FAIL"));
if (failed.length) {
  console.log(`\n=== FAIL ${failed.length} ข้อ ===`);
  process.exit(1);
}
console.log(`\n=== ผ่านทั้งหมด ${out.length} ข้อ ===`);
