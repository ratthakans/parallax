/* ── ร่างข้อความหลังผ่านนโยบาย (docs/solo-plan.md S7) ─────────────────────

   ไม่เรียก API จริง: ตัวแทนโมเดล (setTestTransport) จับคำขอที่ออกจากระบบ และป้อนคำตอบที่ตั้งใจให้ผิด
   "ผ่านเมื่อ" ของ S7:
   1. คนที่ Review required / Suppressed ไม่มีปุ่มร่าง — และยิง action ตรงก็ไม่ได้ร่าง ไม่มีอะไรถึงโมเดล
   2. ถอนความยินยอมระหว่างร่างกับกด "ส่งแล้ว" → บันทึกไม่ได้ (ไม่มีปฏิสัมพันธ์ใหม่)
   3. ร่างไม่มีข้อมูลที่ผู้ใช้เปิดไม่ได้ — ทั้งในคำขอที่ออกจากระบบและในร่างที่แสดง (รวมช่องทางติดต่อ)
   4. ไม่อ้างการแนะนำที่ไม่มีหลักฐาน — อ้างได้เฉพาะ "ได้รับการแนะนำโดย" ที่ยืนยันแล้ว ยังไม่สิ้นสุด และผู้ร่างเห็นผู้แนะนำ
   เพิ่ม: ข้อความการตลาดมีวิธียกเลิกรับเสมอ · AI ปิด = ร่างจากแม่แบบ · ไม่ส่งจากระบบและไม่เก็บร่าง
   ข้อมูลทั้งหมดเป็นชื่อสมมุติ โดเมน .example */
import "./isolate.mts";
import { createHash, randomUUID } from "node:crypto";
import { ensureReady } from "@/lib/engine/bootstrap";
import { all, get, run } from "@/lib/engine/sql";
import { setTestTransport } from "@/lib/engine/ai";
import { ensurePurpose, registerSource } from "@/lib/engine/vault/sources";
import { commitUpload } from "@/lib/engine/vault/intake";
import { resolveTenant } from "@/lib/engine/vault/resolve";
import { setBasis } from "@/lib/engine/policy";
import { recordPreference } from "@/lib/engine/policy/preferences";
import { assignTarget, buildTargets, createCampaign, getCampaign } from "@/lib/engine/campaigns";
import { draftableTargets, draftForTarget, markDraftSent, provenIntroducer } from "@/lib/engine/campaigns/draft";
import { addRelationship, endRelationship, logInteraction, setClassification } from "@/lib/engine/accounts/edit";
import { listAccounts } from "@/lib/engine/accounts";
import { OPT_OUT_TEXT } from "@/lib/shared/purpose-templates";

const out: string[] = [];
const ok = (c: boolean, m: string) => out.push(`${c ? "PASS" : "FAIL"}  ${m}`);
const T = "hongmove";
const BD = { id: "bd@verify", clearance: "confidential" as const };
const INTERN = { id: "intern@verify", clearance: "internal" as const };
await ensureReady();
const T0 = new Date().toISOString();

// ── ข้อมูลสมมุติ ──
const MAP = { 0: "first_name", 1: "last_name", 2: "company", 3: "job_title", 4: "email", 5: "phone", 6: "occurred_at" };
const src = await registerSource(T, {
  name: "รายชื่อสมมุติสำหรับตรวจร่างข้อความ", kind: "file", newPurpose: "เสนอสปอนเซอร์ (สมมุติ)",
  acquisitionNote: "ข้อมูลสมมุติที่เขียนขึ้นในชุดตรวจ ไม่ใช่ข้อมูลของใคร", fields: Object.values(MAP),
}, "verify");
if (!src.ok) throw new Error(src.error);
const recent = new Date(Date.now() - 20 * 864e5).toISOString().slice(0, 10);
const bytes = new TextEncoder().encode([
  "ชื่อ,นามสกุล,บริษัท,ตำแหน่ง,อีเมล,โทรศัพท์,วันที่",
  `อรุณี,แสงทอง,บริษัท ใบไม้เขียว จำกัด,ผู้อำนวยการฝ่ายยุทธศาสตร์,arunee@baimai.example,081-555-7001,${recent}`,
  `บุษบา,ริมน้ำ,บริษัท ใบไม้เขียว จำกัด,ผู้จัดการฝ่ายยุทธศาสตร์,butsaba@baimai.example,081-555-7002,${recent}`,
  `ดารณี,ไม่รับ,บริษัท ใบไม้เขียว จำกัด,นักวิเคราะห์ยุทธศาสตร์,daranee@baimai.example,081-555-7003,${recent}`,
  `เอกชัย,นานมาก,บริษัท ใบไม้เขียว จำกัด,ที่ปรึกษายุทธศาสตร์,ekkachai@baimai.example,081-555-7004,2019-03-01`,
  `กานดา,เพื่อนร่วมงาน,บริษัท ใบไม้เขียว จำกัด,ผู้จัดการฝ่ายบัญชี,kanda@baimai.example,081-555-7005,${recent}`,
  `ลับสุด,ปิดชื่อ,บริษัท ใบไม้เขียว จำกัด,ผู้บริหารระดับสูง,lab@baimai.example,081-555-7006,${recent}`,
  `ชัยวัฒน์,ผู้แนะนำ,บริษัท ภูเขาคราม จำกัด,กรรมการผู้จัดการ,chaiwat@phukao.example,081-555-7007,${recent}`,
].join("\n"));
const up = await commitUpload(T, src.id, bytes, "ร่างข้อความ.csv", MAP, createHash("sha256").update(bytes).digest("hex"), "verify");
if (!up.ok) throw new Error(up.error);
await resolveTenant(T, "verify");
const who = async (first: string) => (await get<{ id: string }>(
  "SELECT DISTINCT c.id FROM customers c JOIN import_rows r ON r.customer_id = c.id AND r.tenant_id = c.tenant_id WHERE c.tenant_id = ? AND r.batch_id = ? AND c.name LIKE ?",
  T, up.batchId, `${first}%`))!.id;
const arunee = await who("อรุณี"), butsaba = await who("บุษบา"), daranee = await who("ดารณี"), ekkachai = await who("เอกชัย");
const kanda = await who("กานดา"), hidden = await who("ลับสุด"), chaiwat = await who("ชัยวัฒน์");
const org = (await listAccounts(T, { q: "ใบไม้เขียว" })).rows[0];
/* บริษัทและผู้รับระดับ "ภายใน" — ผู้ร่างระดับภายในเปิดได้ · ผู้แนะนำคงระดับลับ (ตั้งต้น) · อีกคนระดับจำกัดสูง */
await setClassification(T, org.id, "internal", "steward@verify");
for (const id of [arunee, butsaba]) await run("UPDATE customers SET classification = 'internal' WHERE tenant_id = ? AND id = ?", T, id);
await run("UPDATE customers SET classification = 'restricted_high' WHERE tenant_id = ? AND id = ?", T, hidden);

const SALES = await ensurePurpose(T, "เสนอสปอนเซอร์ (สมมุติ)", "verify");
await setBasis(T, SALES, { lawfulBasis: "legitimate_interest", liaRef: "LIA-DRAFT-01 (สมมุติ)" }, "dpo@verify");
await recordPreference(T, daranee, { kind: "objection", evidence: "ตอบอีเมลว่าไม่ต้องการรับข้อเสนอ (สมมุติ)" }, "verify");

// ── หลักฐานในแฟ้ม: บางอย่างผู้ร่างเห็นได้ บางอย่างไม่ได้ ──
const SECRET = "ส่วนลดสูงสุดที่ยอมได้ 41% (สมมุติ)";
const CONF = "งบการตลาดปีหน้า 3.2 ล้าน (สมมุติ)";
const KANDA_NOTE = "กานดาบอกเรื่องรอบบัญชีปิดงบเดือนมีนาคม (สมมุติ)";
await logInteraction(T, org.id, { kind: "meeting", occurredAt: recent, personId: arunee, summary: "คุยเรื่องบูธงานแสดงสินค้าปีที่แล้ว ติดต่อกลับที่ arunee.private@mail.example หรือ 089-123-4567", classification: "internal" }, "bd@verify");
await logInteraction(T, org.id, { kind: "meeting", occurredAt: recent, personId: arunee, summary: CONF, classification: "confidential" }, "bd@verify");
await logInteraction(T, org.id, { kind: "note", occurredAt: recent, summary: SECRET, classification: "restricted_high" }, "owner@verify");
await logInteraction(T, org.id, { kind: "call", occurredAt: recent, personId: kanda, summary: KANDA_NOTE, classification: "internal" }, "bd@verify");
/* หลักฐานการแนะนำที่ "ยังไม่มี": บันทึกที่พูดถึงการแนะนำ และความสัมพันธ์ที่ยังรอตรวจ (ไม่มีผู้ยืนยัน) */
await logInteraction(T, org.id, { kind: "call", occurredAt: recent, personId: butsaba, summary: "บุษบาบอกว่าคุณชัยวัฒน์อาจจะแนะนำให้คุยกัน (ยังไม่ยืนยัน · สมมุติ)", classification: "internal" }, "bd@verify");
await run(
  `INSERT INTO relationship_assertions (id, tenant_id, from_kind, from_id, to_kind, to_id, type, context, evidence_id, confirmed_by, confirmed_at, valid_from, valid_to, source_id, lifecycle_state, recorded_at)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  randomUUID(), T, "person", butsaba, "person", chaiwat, "introduced_by", "จากไฟล์ (สมมุติ)", null, null, null, null, null, null, "pending_review", new Date().toISOString());
const intro = await addRelationship(T, {
  type: "introduced_by", fromKind: "person", fromId: arunee, toKind: "person", toId: chaiwat,
  context: "งานสัมมนา (สมมุติ)", evidence: "คุณชัยวัฒน์ส่งอีเมลแนะนำตัวให้ทั้งสองฝ่าย (สมมุติ)",
}, "bd@verify");
if (!intro.ok) throw new Error(intro.error);

// ── แคมเปญ ──
const camp = await createCampaign(T, {
  name: "เสนอสปอนเซอร์งานสัมมนา 2027 (สมมุติ)", offer: "แพ็กเกจ Silver", purposeId: SALES, channel: "email", messageKind: "marketing",
  criteria: { titleKeywords: ["ยุทธศาสตร์"], maxPerOrg: 10 },
}, "lead@verify");
if (!camp.ok) throw new Error(camp.error);
const built = await buildTargets(T, camp.id, "lead@verify");
ok(built.ok && built.people === 4, `เกณฑ์ "ยุทธศาสตร์" ได้ 4 คน (${built.ok ? built.people : "-"})`);
const view = (await getCampaign(T, camp.id))!;
const tOf = (id: string) => view.targets.find((t) => t.customerId === id)!;
const tA = tOf(arunee), tB = tOf(butsaba), tD = tOf(daranee), tE = tOf(ekkachai);
const due = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
ok((await assignTarget(T, tA.id, "bd@verify", due, "lead@verify")).ok && (await assignTarget(T, tB.id, "bd@verify", due, "lead@verify")).ok, "มอบหมายคนที่ใช้ได้สองคน");

// ── ตัวแทนโมเดล ──
type Req = { system: string; messages: { content: string }[]; output_config: unknown };
const seen: Req[] = [];
let reply: (req: Req) => { subject: string; body: string; cites: string[] } = () => ({ subject: "", body: "", cites: [] });
setTestTransport(async (req) => { seen.push(req); return { text: JSON.stringify(reply(req)) }; });
const eids = (req: Req) => [...req.messages[0].content.matchAll(/^(E\d+): /gm)].map((m) => m[1]);
const clean = (req: Req) => ({ subject: "ข้อเสนอสปอนเซอร์งานสัมมนา 2027", body: "เรียนคุณ {{name}}\nขออนุญาตเสนอแพ็กเกจ Silver สำหรับงานสัมมนา 2027\nขอบคุณ", cites: eids(req).slice(0, 1) });
reply = clean;

const statusOf = async (id: string) => (await get<{ eligibility: string }>("SELECT eligibility FROM campaign_targets WHERE tenant_id = ? AND id = ?", T, id))!.eligibility;
const live = async () => draftableTargets(T, camp.id, (await getCampaign(T, camp.id))!.targets);

// ══ 1 · Review required / Suppressed ไม่มีปุ่มร่าง ══
ok(tD.eligibility === "suppressed" && tE.eligibility === "review_required", `คนที่คัดค้านเป็นห้ามติดต่อ · ข้อมูลเก่าเป็นต้องตรวจก่อน (${tD.eligibility} · ${tE.eligibility})`);
let can = await live();
ok(can.has(tA.id) && can.has(tB.id) && !can.has(tD.id) && !can.has(tE.id), "ปุ่มร่างมีเฉพาะคนที่ decide() ให้ใช้ได้ ณ ตอนแสดง (ไม่มีสำหรับห้ามติดต่อ/ต้องตรวจก่อน)");
/* ยิง action ตรง: คนที่ไม่ผ่านต้องไม่ได้ร่าง และไม่มีอะไรถึงโมเดล — บังคับสถานะให้ "มอบหมายแล้ว" เพื่อข้ามด่านสถานะ */
await run("UPDATE campaign_targets SET status = 'assigned' WHERE tenant_id = ? AND id IN (?, ?)", T, tD.id, tE.id);
const dD = await draftForTarget(T, tD.id, BD), dE = await draftForTarget(T, tE.id, BD);
ok(!dD.ok && !dE.ok && Boolean(!dD.ok && dD.reasons?.length) && seen.length === 0, "ยิงร่างตรงสำหรับห้ามติดต่อ/ต้องตรวจก่อน = ไม่ได้ร่าง พร้อมเหตุผล · ไม่มีคำขอถึงโมเดล");
ok(!(await live()).has(tD.id) && !(await live()).has(tE.id), "แม้สถานะเป้าหมายถูกบังคับเป็นมอบหมายแล้ว ก็ยังไม่มีปุ่มร่าง (ตัดสินจากนโยบายสด)");
/* ผลที่เก็บไว้ยัง "ใช้ได้" แต่ตอนนี้ไม่ใช่แล้ว: ตัวตนถูกส่งกลับมาทบทวน */
await run("UPDATE customers SET lifecycle_state = 'needs_review' WHERE tenant_id = ? AND id = ?", T, butsaba);
can = await live();
const dStale = await draftForTarget(T, tB.id, BD);
ok(await statusOf(tB.id) === "eligible" && !can.has(tB.id) && !dStale.ok && seen.length === 0,
  "ผลที่เก็บไว้ว่าใช้ได้ไม่พอ: ตอนนี้ต้องตรวจก่อน = ไม่มีปุ่ม และกดร่างไม่ได้");
await run("UPDATE customers SET lifecycle_state = 'confirmed' WHERE tenant_id = ? AND id = ?", T, butsaba);
process.env.PARALLAX_POLICY_FAULT = "1";
const dFault = await draftForTarget(T, tA.id, BD);
ok(!dFault.ok && !(await live()).has(tA.id) && seen.length === 0, "บริการนโยบายล่ม = ไม่มีปุ่มและไม่ร่าง (fail closed)");
delete process.env.PARALLAX_POLICY_FAULT;
ok(!(await draftForTarget(T, tD.id, BD)).ok && seen.length === 0, "คนที่คัดค้านยังร่างไม่ได้หลังบริการกลับมา");

// ══ 3 · ร่างไม่มีข้อมูลที่ผู้ใช้เปิดไม่ได้ ══
const rA = await draftForTarget(T, tA.id, BD);
const reqA = seen.at(-1)!;
const sentA = JSON.stringify(reqA);
ok(rA.ok && rA.draft.generatedBy === "ai" && seen.length === 1, "ร่างด้วย AI ได้ (บัญชีเดโม) · เรียกโมเดลครั้งเดียว");
ok(!sentA.includes(SECRET) && !(rA.ok && rA.draft.body.includes(SECRET)), "บันทึกระดับจำกัดสูงไม่อยู่ในคำขอและไม่อยู่ในร่าง");
ok(!sentA.includes("ลับสุด") && !sentA.includes("ปิดชื่อ"), "คนระดับจำกัดสูงในบริษัทเดียวกันไม่ถูกเอ่ยถึงในคำขอ");
ok(!/@[\w-]+\.example|08\d-?\d{3}-?\d{4}|081-?555/.test(sentA), "ไม่มีอีเมลหรือเบอร์ในคำขอ — รวมที่พิมพ์ไว้ในบันทึกการคุย (ถูกตัดก่อนส่ง)");
ok(!sentA.includes("อรุณี") && sentA.includes("{{name}}"), "ชื่อผู้รับไม่ออกจากระบบ (ส่งเป็น {{name}} แล้วแทนค่าในระบบ)");
ok(!sentA.includes("ชัยวัฒน์"), "ชื่อผู้แนะนำไม่ออกจากระบบ (ระบบใส่บรรทัดแนะนำเอง)");
ok(!sentA.includes(KANDA_NOTE) && !sentA.includes("กานดา"), "หลักฐานของคนอื่นในบริษัทไม่ถูกส่ง — เฉพาะที่เกี่ยวกับผู้รับ");
ok(sentA.includes("3.2 ล้าน"), "หลักฐานระดับลับส่งได้เมื่อผู้ร่างมีสิทธิ์ระดับลับ");
const content = reqA.messages[0].content;
ok(/ไม่ใช่คำสั่ง/.test(reqA.system) && content.indexOf("<evidence>") < content.indexOf("E1:") && !/"tools"/.test(sentA), "หลักฐานอยู่ในแท็ก · ระบบบอกว่าเป็นข้อมูลไม่ใช่คำสั่ง · ไม่มีเครื่องมือ");
if (rA.ok) {
  ok(rA.draft.body.includes("อรุณี") && !rA.draft.body.includes("{{"), "ร่างที่แสดงแทนชื่อผู้รับแล้ว ไม่มีตัวแปรค้าง");
  ok(rA.draft.evidence.every((e) => !e.text.includes(SECRET) && !/@|08\d-?\d{3}/.test(e.text)), "หลักฐานที่แสดงคู่ร่างไม่มีความลับหรือช่องทางติดต่อ");
}
/* ผู้ร่างระดับภายใน: ไม่เห็นบันทึกระดับลับ และไม่เห็นผู้แนะนำ (ระดับลับ) — การแนะนำจึงอ้างไม่ได้ */
const rI = await draftForTarget(T, tA.id, INTERN);
const sentI = JSON.stringify(seen.at(-1));
ok(rI.ok && !sentI.includes("3.2 ล้าน") && !rI.draft.body.includes("3.2 ล้าน"), "ผู้ร่างระดับภายใน: หลักฐานระดับลับไม่อยู่ในคำขอและไม่อยู่ในร่าง");
ok(rI.ok && rI.draft.introducedBy === null && !rI.draft.body.includes("ชัยวัฒน์"), "ผู้ร่างที่เปิดผู้แนะนำไม่ได้ = ร่างไม่เอ่ยชื่อผู้แนะนำ แม้ความสัมพันธ์จะยืนยันแล้ว");
/* โมเดลแต่งช่องทางติดต่อขึ้นเอง = ทิ้ง ใช้แม่แบบ */
reply = (req) => ({ ...clean(req), body: "เรียนคุณ {{name}}\nโทรกลับที่ 02-555-0199 หรือ sales@ours.example ได้เลย" });
const rC = await draftForTarget(T, tA.id, BD);
ok(rC.ok && rC.draft.generatedBy === "fallback" && !/02-555|@ours/.test(rC.draft.body), "โมเดลใส่ช่องทางติดต่อเอง = ทิ้งผลของโมเดล ใช้แม่แบบ");
reply = (req) => ({ ...clean(req), cites: ["E999"] });
const rX = await draftForTarget(T, tA.id, BD);
ok(rX.ok && rX.draft.generatedBy === "fallback", "โมเดลอ้างหลักฐานที่ไม่มีในชุด = ใช้แม่แบบ");
reply = clean;

// ══ 4 · ไม่อ้างการแนะนำที่ไม่มีหลักฐาน ══
ok(rA.ok && rA.draft.introducedBy === "ชัยวัฒน์ ผู้แนะนำ" && rA.draft.body.includes("คุณชัยวัฒน์ ผู้แนะนำ แนะนำให้ติดต่อคุณ"),
  `มีความสัมพันธ์ "ได้รับการแนะนำโดย" ที่ยืนยันแล้ว = ระบบใส่บรรทัดแนะนำ (${rA.ok ? rA.draft.introducedBy : "-"})`);
const before = seen.length;
const rB = await draftForTarget(T, tB.id, BD);
ok(rB.ok && rB.draft.generatedBy === "ai" && rB.draft.introducedBy === null && !/แนะนำให้ติดต่อ/.test(rB.draft.body) && seen.length === before + 1,
  "มีแค่บันทึกที่พูดถึงการแนะนำและความสัมพันธ์ที่ยังรอตรวจ = ไม่อ้างการแนะนำ");
/* โมเดลอ่านบันทึกแล้ว "อ้าง" การแนะนำเอง = ทิ้ง */
reply = (req) => ({ ...clean(req), body: "เรียนคุณ {{name}}\nคุณชัยวัฒน์แนะนำให้ติดต่อมาเรื่องแพ็กเกจ Silver\nขอบคุณ" });
const rB2 = await draftForTarget(T, tB.id, BD);
ok(rB2.ok && rB2.draft.generatedBy === "fallback" && !rB2.draft.body.includes("ชัยวัฒน์") && rB2.draft.introducedBy === null,
  "โมเดลอ้างการแนะนำเองจากบันทึกที่ไม่ใช่หลักฐาน = ทิ้งผลของโมเดล · ร่างไม่มีชื่อผู้แนะนำ");
reply = (req) => ({ ...clean(req), body: "เรียนคุณ {{name}}\nได้รับการแนะนำจากเพื่อนร่วมงานของคุณ\nขอบคุณ" });
const rA2 = await draftForTarget(T, tA.id, BD);
ok(rA2.ok && rA2.draft.generatedBy === "fallback" && rA2.draft.body.split("แนะนำให้ติดต่อ").length === 2,
  "แม้มีผู้แนะนำจริง โมเดลก็เขียนเรื่องการแนะนำเองไม่ได้ — มีแค่บรรทัดที่ระบบใส่ หนึ่งบรรทัด");
reply = clean;
await endRelationship(T, intro.id, new Date(Date.now() - 864e5).toISOString().slice(0, 10), "ผู้แนะนำขอถอนการแนะนำ (สมมุติ)", "bd@verify");
ok((await provenIntroducer(T, arunee, "confidential")) === null, "ความสัมพันธ์ที่สิ้นสุดแล้วไม่นับเป็นหลักฐานการแนะนำ");

// ══ ข้อความการตลาดมีวิธียกเลิกรับ · AI ปิด = แม่แบบ ══
ok([rA, rB, rB2, rI].every((r) => r.ok && r.draft.optOut && r.draft.body.trimEnd().endsWith(OPT_OUT_TEXT.reply)), "ข้อความการตลาดต่อท้ายวิธียกเลิกรับตามแม่แบบทุกร่าง (ทั้ง AI และแม่แบบ)");
const billing = (await get<{ state: string }>("SELECT state FROM tenant_billing WHERE tenant_id = ?", T))!;
await run("UPDATE tenant_billing SET state = 'trial' WHERE tenant_id = ?", T);
const n0 = seen.length;
const rOff = await draftForTarget(T, tB.id, BD);
ok(rOff.ok && rOff.draft.generatedBy === "fallback" && seen.length === n0 && rOff.draft.body.includes("บุษบา") && rOff.draft.body.includes(OPT_OUT_TEXT.reply),
  "AI ปิด (ยังไม่ชำระ) = ร่างจากแม่แบบ ไม่มีคำขอถึงโมเดล และยังมีวิธียกเลิกรับ");
await run("UPDATE tenant_billing SET state = ? WHERE tenant_id = ?", billing.state, T);
const stored = await get<{ n: number | string }>("SELECT COUNT(*) AS n FROM ai_cache WHERE kind = 'outreach_draft'").catch(() => ({ n: 0 }));
ok(Number(stored?.n ?? 0) === 0, "ร่างไม่ถูกเก็บ (ไม่มีในแคช AI)");

// ══ 2 · ถอนระหว่างร่างกับกด "ส่งแล้ว" ══
const nInter = async (id: string) => Number((await get<{ n: number | string }>("SELECT COUNT(*) AS n FROM interactions WHERE tenant_id = ? AND customer_id = ?", T, id))!.n);
const bBefore = await nInter(butsaba);
const sentB = await markDraftSent(T, tB.id, "bd@verify");
const tBNow = (await get<{ status: string }>("SELECT status FROM campaign_targets WHERE tenant_id = ? AND id = ?", T, tB.id))!;
ok(sentB.ok && (await nInter(butsaba)) === bBefore + 1 && tBNow.status === "contacted", "\"ส่งแล้ว\" = ตรวจนโยบายซ้ำ แล้วบันทึกปฏิสัมพันธ์และสถานะติดต่อแล้ว");
const aDraft = await draftForTarget(T, tA.id, BD);
ok(aDraft.ok, "ร่างให้อรุณีได้ก่อนถอน");
await recordPreference(T, arunee, { kind: "withdrawal", purposeId: SALES, evidence: "ตอบกลับว่าขอถอนการใช้ข้อมูลเพื่อเสนอขาย (สมมุติ)" }, "verify");
const aBefore = await nInter(arunee);
const sentA2 = await markDraftSent(T, tA.id, "bd@verify");
ok(!sentA2.ok && (await nInter(arunee)) === aBefore, "ถอนระหว่างร่างกับกด \"ส่งแล้ว\" = บันทึกไม่ได้ ไม่มีปฏิสัมพันธ์ใหม่");
ok(!(await live()).has(tA.id) && !(await draftForTarget(T, tA.id, BD)).ok, "หลังถอน ไม่มีปุ่มร่างและร่างใหม่ไม่ได้");
/* ถอนแบบที่ recheck ยกเลิกไม่ทัน (เขียนตรงลงตาราง): recordOutcome ตรวจนโยบายเองก็ยังกัน */
await run("UPDATE campaign_targets SET status = 'assigned' WHERE tenant_id = ? AND id = ?", T, tA.id);
ok(!(await markDraftSent(T, tA.id, "bd@verify")).ok && (await nInter(arunee)) === aBefore, "แม้เป้าหมายยังไม่ถูกยกเลิก การตรวจนโยบายตอนกด \"ส่งแล้ว\" ก็กันไว้");

// ── ไม่ส่งจากระบบ ──
const acts = await all<{ action: string; detail: string | null }>("SELECT action, detail FROM activity_log WHERE tenant_id = ? AND at >= ?", T, T0);
ok(!acts.some((a) => /send|dispatch/i.test(a.action)), "ไม่มีการส่งข้อความจากระบบ (ไม่มีกิจกรรมส่งระหว่างชุดตรวจ)");
const drafts = acts.filter((a) => a.action === "outreach_draft");
ok(drafts.length > 0 && drafts.every((a) => !/อรุณี|บุษบา|@|แพ็กเกจ/.test(a.detail ?? "")), "บันทึกกิจกรรมของการร่างมีแค่รหัสเป้าหมายและแหล่งที่มา ไม่มีเนื้อความหรือชื่อ");

for (const line of out) console.log(line);
const failed = out.filter((l) => l.startsWith("FAIL"));
if (failed.length) {
  console.log(`\n=== FAIL ${failed.length} ข้อ ===`);
  process.exit(1);
}
console.log(`\n=== ผ่านทั้งหมด ${out.length} ข้อ ===`);
