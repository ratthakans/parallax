/* ── เกณฑ์เดโม (docs/plan.md หัวข้อ 3.5) — ข้อ 1–2 (B4) ─────────────

   1. แฟ้มบริษัทตามเวลา — คนในบริษัท บทบาท ช่วงเวลา และความสัมพันธ์ที่ยืนยันพร้อมผู้ยืนยัน · ช่องที่ไม่ทราบแสดงว่าไม่ทราบ
   2. หลักฐานทุกค่า — ค่าใดก็ได้ เห็นแหล่ง (ไฟล์ แถว) เวลาที่บันทึก เวลาตรวจล่าสุด และประวัติรุ่น
   3. สถานะใช้ข้อมูลพร้อมเหตุผล — คนเดียวกัน ใช้ได้สำหรับวัตถุประสงค์หนึ่ง และห้าม/ต้องตรวจสำหรับอีกวัตถุประสงค์ พร้อมรุ่นนโยบาย (B5)
   4. วงจรแคมเปญ — เกณฑ์ → รายชื่อพร้อมเหตุผล → มอบหมาย → บันทึกผล → หน้าทบทวนรายสัปดาห์ (B5)
   ข้อมูลทั้งหมดเป็นชื่อสมมุติ โดเมน .example */
import "./isolate.mts";
import { createHash } from "node:crypto";
import { ensureReady } from "@/lib/engine/bootstrap";
import { all, get } from "@/lib/engine/sql";
import { registerSource } from "@/lib/engine/vault/sources";
import { commitUpload } from "@/lib/engine/vault/intake";
import { resolveTenant } from "@/lib/engine/vault/resolve";
import { getDossier, listAccounts, unknownsOf } from "@/lib/engine/accounts";
import { ensurePurpose } from "@/lib/engine/vault/sources";
import { decide, setBasis } from "@/lib/engine/policy";
import { recordPreference } from "@/lib/engine/policy/preferences";
import { assignTarget, buildTargets, createCampaign, getCampaign, logWork, recordOutcome, weeklyReview } from "@/lib/engine/campaigns";
import {
  addRelationship, confirmAffiliation, endAffiliation, logInteraction, setAccountOwner, setParent, updateOrgField, verifyOrg,
} from "@/lib/engine/accounts/edit";

const out: string[] = [];
const ok = (c: boolean, m: string) => out.push(`${c ? "PASS" : "FAIL"}  ${m}`);
const T = "hongmove";
const day = (iso: string | null | undefined) => iso?.slice(0, 10) ?? null;
const V = { id: "bd@verify", clearance: "confidential" as const };
await ensureReady();

const MAP = { 0: "first_name", 1: "last_name", 2: "company", 3: "job_title", 4: "email", 5: "phone", 6: "occurred_at" };
const src = await registerSource(T, {
  name: "รายชื่อสมมุติสำหรับเกณฑ์เดโม", kind: "file", newPurpose: "ขายสปอนเซอร์ (สมมุติ)",
  acquisitionNote: "ข้อมูลสมมุติที่เขียนขึ้นในชุดตรวจ ไม่ใช่ข้อมูลของใคร", fields: Object.values(MAP),
}, "verify");
if (!src.ok) throw new Error(src.error);
async function importCsv(name: string, lines: string[]) {
  const bytes = new TextEncoder().encode(["ชื่อ,นามสกุล,บริษัท,ตำแหน่ง,อีเมล,โทรศัพท์,วันที่", ...lines].join("\n"));
  const r = await commitUpload(T, (src as { id: string }).id, bytes, name, MAP, createHash("sha256").update(bytes).digest("hex"), "verify");
  if (!r.ok) throw new Error(r.error);
  await resolveTenant(T, "verify");
  return r.batchId;
}

/* ปี 2023: ปรีชาอยู่ลมทะเล · ปี 2025 (ไฟล์คนละชุด): ปรีชาย้ายไปสยามกริด — เบอร์มือถือเดิม จึงเป็นคนเดียวกัน */
const b1 = await importCsv("ผู้ร่วมงาน-2023.csv", [
  "ปรีชา,วงศ์ดี,บริษัท ลมทะเล จำกัด,ผู้จัดการจัดซื้อ,preecha@lomtalay.example,081-555-1001,2023-05-10",
  "อรุณี,แก้วใส,บริษัท ลมทะเล จำกัด,ผู้อำนวยการการตลาด,arunee@lomtalay.example,081-555-1002,2023-05-10",
]);
const b2 = await importCsv("ผู้ร่วมงาน-2025.csv", [
  "ปรีชา,วงศ์ดี,บริษัท สยามกริด จำกัด,ผู้อำนวยการจัดซื้อ,preecha.w@siamgrid.example,081-555-1001,2025-03-02",
  "อรุณี,แก้วใส,บริษัท ลมทะเล จำกัด,ผู้อำนวยการการตลาด,arunee@lomtalay.example,081-555-1002,2025-03-02",
]);

const { rows: accounts } = await listAccounts(T);
const lom = accounts.find((a) => a.name.includes("ลมทะเล"))!;
const siam = accounts.find((a) => a.name.includes("สยามกริด"))!;
ok(Boolean(lom && siam), `รายชื่อบริษัทมีทั้งสองที่ (${accounts.length} บริษัท)`);

// ── 1 · แฟ้มตามเวลา ──
let dl = (await getDossier(T, lom.id, V))!;
const preechaAtLom = dl.people.find((p) => p.name.includes("ปรีชา"));
ok(preechaAtLom != null && !preechaAtLom.current && day(preechaAtLom.to) === "2025-03-02",
  `ไฟล์ปี 2025 ปิดช่วงสังกัดเดิมของปรีชาที่ลมทะเล (ถึง ${day(preechaAtLom?.to) ?? "ยังเปิด"}) แม้มาจากไฟล์คนละชุด`);
ok(day(preechaAtLom?.from) === "2023-05-10" && preechaAtLom?.title === "ผู้จัดการจัดซื้อ", "ช่วงเริ่มและตำแหน่งที่ลมทะเลมาจากแถวปี 2023");
const ds = (await getDossier(T, siam.id, V))!;
const preechaAtSiam = ds.people.find((p) => p.name.includes("ปรีชา"));
ok(preechaAtSiam?.current === true && day(preechaAtSiam.from) === "2025-03-02" && preechaAtSiam.title === "ผู้อำนวยการจัดซื้อ", "ที่สยามกริดเป็นสังกัดปัจจุบัน ตั้งแต่ 2025-03-02");
ok(preechaAtLom?.personId === preechaAtSiam?.personId, "เป็นคนเดียวกันทั้งสองแฟ้ม (ประวัติตามเวลา ไม่ใช่สองคน)");
ok(dl.people.find((p) => p.name.includes("อรุณี"))?.current === true, "คนที่ยังอยู่ยังเป็นสังกัดปัจจุบัน");

const arunee = dl.people.find((p) => p.name.includes("อรุณี"))!;
const rel = await addRelationship(T, {
  type: "decision_maker", fromKind: "person", fromId: arunee.personId, toKind: "org", toId: lom.id,
  evidence: "คุณอรุณีแจ้งในการประชุมสมมุติว่าเป็นผู้อนุมัติงบสปอนเซอร์",
}, "bd@verify");
ok(rel.ok, "บันทึกความสัมพันธ์พร้อมหลักฐานได้");
ok(!(await addRelationship(T, { type: "decision_maker", fromKind: "person", fromId: arunee.personId, toKind: "org", toId: lom.id, evidence: "" }, "bd@verify")).ok,
  "ความสัมพันธ์ที่ไม่มีหลักฐานบันทึกไม่ได้");
ok(!(await addRelationship(T, { type: "reports_to", fromKind: "person", fromId: arunee.personId, toKind: "org", toId: lom.id, evidence: "ทดสอบชนิดผิดคู่" }, "bd@verify")).ok,
  "ชนิดความสัมพันธ์ต้องตรงกับคู่ปลายทาง (รายงานต่อ = คน→คน)");
dl = (await getDossier(T, lom.id, V))!;
const r0 = dl.relationships[0];
ok(r0?.confirmedBy === "bd@verify" && Boolean(r0.confirmedAt) && /อนุมัติงบ/.test(r0.evidenceNote ?? ""), "แฟ้มแสดงความสัมพันธ์พร้อมผู้ยืนยัน เวลา และหลักฐาน");

const unknown = unknownsOf(dl);
ok(dl.org.industry === null && unknown.includes("อุตสาหกรรม"), "อุตสาหกรรมที่ไม่มีหลักฐานเป็น \"ไม่ทราบ\" ไม่ถูกเติม");
ok(unknown.includes("เจ้าของบัญชี") && unknown.includes("ประวัติการติดต่อ"), `ช่องที่ไม่ทราบแสดงตามจริง (${unknown.join(" · ")})`);

// ── 2 · หลักฐานทุกค่า ──
ok(preechaAtLom!.rows.length === 1 && preechaAtLom!.rows[0].batchId === b1 && preechaAtLom!.rows[0].file === "ผู้ร่วมงาน-2023.csv" && preechaAtLom!.rows[0].line === 2,
  "สังกัดชี้กลับไปแถวต้นทาง (ไฟล์ · บรรทัด 2)");
ok(preechaAtSiam!.rows.every((r) => r.batchId === b2), "สังกัดที่ใหม่ชี้ไฟล์ปี 2025 เท่านั้น ไม่ปนแถวที่เก่า");
ok(dl.namesAsWritten.some((n) => n.name === "บริษัท ลมทะเล จำกัด" && n.rows.length === 3), "ชื่อบริษัทมีหลักฐานเป็นแถวที่เขียนชื่อนั้น (3 แถว)");
ok(dl.domains.some((x) => x.domain === "lomtalay.example" && x.rows.length >= 2), "โดเมนมีหลักฐานเป็นแถวที่ใช้อีเมลโดเมนนั้น");
ok(preechaAtLom!.rows.every((r) => Boolean(r.recordedAt)), "แถวหลักฐานมีเวลาที่บันทึก");
const json = JSON.stringify(dl);
ok(!/preecha@|arunee@|555-?100/.test(json), "แฟ้มไม่มีอีเมลหรือเบอร์ในรูปเต็ม");

ok(!(await updateOrgField(T, lom.id, "industry", "พลังงาน", "", "bd@verify")).ok, "แก้ค่าโดยไม่บอกที่มาไม่ได้");
ok(!(await updateOrgField(T, lom.id, "tax_id", "12345", "จากหนังสือรับรอง", "bd@verify")).ok, "เลขผู้เสียภาษีที่ไม่ครบ 13 หลักถูกปฏิเสธ");
ok(!(await updateOrgField(T, lom.id, "name", "ชื่อใหม่", "ทดสอบ", "bd@verify")).ok, "ชื่อบริษัทแก้จากแฟ้มไม่ได้ (มาจากไฟล์ — แก้ที่ต้นทาง)");
await updateOrgField(T, lom.id, "industry", "พลังงาน", "จากเว็บไซต์บริษัท (สมมุติ)", "bd@verify");
await updateOrgField(T, lom.id, "industry", "พลังงานหมุนเวียน", "ลูกค้าแจ้งในที่ประชุม", "steward@verify");
await verifyOrg(T, lom.id, "steward@verify");
await setAccountOwner(T, lom.id, "bd@verify", "bd@verify");
dl = (await getDossier(T, lom.id, V))!;
const hist = dl.versions.industry ?? [];
ok(dl.org.industry === "พลังงานหมุนเวียน" && hist.length === 2, `ค่าปัจจุบันพร้อมประวัติรุ่น ${hist.length} รุ่น`);
ok(hist[0].oldValue === "พลังงาน" && hist[0].by === "steward@verify" && hist[0].reason === "ลูกค้าแจ้งในที่ประชุม" && hist[1].oldValue === null,
  "รุ่นล่าสุดอยู่บน · มีค่าเดิม ผู้แก้ และที่มา · รุ่นแรกเริ่มจากไม่ทราบ");
ok(Boolean(dl.org.lastVerifiedAt) && dl.org.lifecycle === "confirmed", "ยืนยันข้อมูลแล้วมีเวลาตรวจล่าสุด");
ok(dl.org.accountOwner === "bd@verify" && (dl.versions.account_owner_id?.length ?? 0) === 1, "เจ้าของบัญชีมีประวัติว่าใครรับเมื่อไร");

// สังกัด: คนยืนยัน → ไฟล์ที่นำเข้าทีหลังไม่เลื่อนช่วงที่คนกำหนด
await confirmAffiliation(T, arunee.affiliationId, "steward@verify");
const ended = await endAffiliation(T, arunee.affiliationId, "2025-06-30", "แจ้งลาออกทางอีเมล (สมมุติ)", "steward@verify");
ok(ended.ok, "ปิดช่วงสังกัดพร้อมที่มาได้");
await importCsv("ผู้ร่วมงาน-2025-ปลายปี.csv", [
  "อรุณี,แก้วใส,บริษัท ลมทะเล จำกัด,ผู้อำนวยการการตลาด,arunee@lomtalay.example,081-555-1002,2025-11-01",
]);
const a2 = await get<{ valid_to: string | null; last_seen_at: string | null }>("SELECT valid_to, last_seen_at FROM affiliations WHERE id = ?", arunee.affiliationId);
ok(a2?.valid_to === "2025-06-30", `ไฟล์ใหม่ไม่เปิดช่วงที่คนปิดไว้ (ถึง ${a2?.valid_to ?? "เปิด"})`);
ok(day(a2?.last_seen_at) === "2025-11-01", "แต่บันทึกวันที่ไฟล์เห็นล่าสุดไว้ให้คนทบทวน");
const affVersions = await all("SELECT 1 FROM record_versions WHERE tenant_id = ? AND record_kind = 'affiliation' AND record_id = ?", T, arunee.affiliationId);
ok(affVersions.length === 2, "การยืนยันและการปิดช่วงสังกัดมีประวัติรุ่น");

// บริษัทในเครือ: เชื่อม ไม่รวม · กันวง
ok((await setParent(T, siam.id, lom.id, "รายงานประจำปี (สมมุติ)", "steward@verify")).ok, "บันทึกบริษัทแม่ได้");
ok(!(await setParent(T, lom.id, siam.id, "ทดสอบวง", "steward@verify")).ok, "กันวงบริษัทแม่-ลูก");
dl = (await getDossier(T, lom.id, V))!;
ok(dl.subsidiaries.some((s) => s.id === siam.id) && Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM orgs WHERE tenant_id = ?", T))!.n) >= 2,
  "บริษัทในเครือแสดงเป็นแฟ้มแยก ไม่ถูกรวมเป็นนิติบุคคลเดียว");

// ไทม์ไลน์ + การปิดบัง
await logInteraction(T, lom.id, { kind: "meeting", occurredAt: "2025-07-01", personId: arunee.personId, summary: "คุยแพ็กเกจสปอนเซอร์ (สมมุติ)", outcome: "ส่งข้อเสนอสัปดาห์หน้า" }, "bd@verify");
await logInteraction(T, lom.id, { kind: "note", occurredAt: "2025-07-02", summary: "ราคาที่ต่อรองได้ (สมมุติ)", classification: "restricted_high" }, "bd@verify");
ok(!(await logInteraction(T, lom.id, { kind: "meeting", occurredAt: "2099-01-01", summary: "อนาคต" }, "bd@verify")).ok, "บันทึกการติดต่อในอนาคตไม่ได้ (ให้สร้างเป็นงาน)");
const other = (await getDossier(T, lom.id, { id: "someone@verify", clearance: "confidential" }))!;
const mine = (await getDossier(T, lom.id, V))!;
const hiddenForOther = other.interactions.find((i) => i.classification === "restricted_high");
ok(hiddenForOther?.masked === true && hiddenForOther.summary === null, "บันทึกระดับจำกัดสูง: คนอื่นเห็นว่ามี แต่ไม่เห็นเนื้อหา");
ok(mine.interactions.find((i) => i.classification === "restricted_high")?.summary === "ราคาที่ต่อรองได้ (สมมุติ)", "ผู้บันทึกเห็นเนื้อหาของตัวเอง");
ok(other.interactions.find((i) => i.kind === "meeting")?.summary?.includes("สปอนเซอร์") === true, "บันทึกระดับลับเห็นได้ทุกคนในบัญชี (ระดับเริ่มต้นจนกว่าจะแยกบทบาทใน B6)");

// การร่วมงานจากไฟล์ลงทะเบียน: "งาน" มีปีติดท้าย → งาน + ครั้ง · "ประเภทผู้ร่วมงาน" → บทบาท
const MAP2 = { 0: "customer_name", 1: "company", 2: "email", 3: "participant_role", 4: "program", 5: "occurred_at" };
const src2 = await registerSource(T, {
  name: "ผู้ลงทะเบียนงานสมมุติ", kind: "file", newPurpose: "ขายสปอนเซอร์ (สมมุติ)",
  acquisitionNote: "ข้อมูลสมมุติที่เขียนขึ้นในชุดตรวจ ไม่ใช่ข้อมูลของใคร", fields: Object.values(MAP2),
}, "verify");
if (!src2.ok) throw new Error(src2.error);
const reg = new TextEncoder().encode([
  "ชื่อ-นามสกุล,บริษัท,อีเมล,ประเภทผู้ร่วมงาน,งาน,วันที่ลงทะเบียน",
  "อรุณี แก้วใส,บริษัท ลมทะเล จำกัด,arunee@lomtalay.example,ผู้ออกบูธ,Sunline Energy Week 2024,2024-09-01",
  "อรุณี แก้วใส,บริษัท ลมทะเล จำกัด,arunee@lomtalay.example,สปอนเซอร์,Sunline Energy Week 2025,2025-09-01",
  "อรุณี แก้วใส,บริษัท ลมทะเล จำกัด,arunee@lomtalay.example,,,2025-09-02",
].join("\n"));
const c2 = await commitUpload(T, src2.id, reg, "ลงทะเบียนงาน.csv", MAP2, createHash("sha256").update(reg).digest("hex"), "verify");
if (!c2.ok) throw new Error(c2.error);
const st = await resolveTenant(T, "verify");
ok(st.participations === 2, `แถวที่มีชื่องานกลายเป็นการร่วมงาน 2 ครั้ง · แถวที่ไม่มีชื่องานไม่ถูกเดา (${st.participations})`);
dl = (await getDossier(T, lom.id, V))!;
const p24 = dl.participations.find((p) => p.edition === "2024");
ok(p24?.program === "Sunline Energy Week" && p24.role === "ผู้ออกบูธ" && p24.personName?.includes("อรุณี") === true,
  "แยกปีออกจากชื่องาน และเก็บบทบาทในงาน");
ok(dl.participations.some((p) => p.edition === "2025" && p.role === "สปอนเซอร์"), "ประวัติการร่วมงานหลายปีอยู่ในแฟ้มบริษัท");
const again = await resolveTenant(T, "verify");
ok(again.participations === 0 && (await getDossier(T, lom.id, V))!.participations.length === 2, "ตรวจตัวตนซ้ำไม่สร้างการร่วมงานซ้ำ");

// ── 3 · สถานะใช้ข้อมูลพร้อมเหตุผล ──
const SPONSOR = await ensurePurpose(T, "ขายสปอนเซอร์ (เดโม)", "verify");
const NEWS = await ensurePurpose(T, "ข่าวสารจากผู้จัดงาน (เดโม)", "verify");
await setBasis(T, SPONSOR, { lawfulBasis: "legitimate_interest", liaRef: "LIA-DEMO-01 (สมมุติ)" }, "dpo@verify");
await setBasis(T, NEWS, { lawfulBasis: "consent" }, "dpo@verify");
const preecha = preechaAtSiam!.personId;
const dA = await decide(T, { customerId: preecha, purposeId: SPONSOR, channel: "email", messageKind: "marketing" });
const dB = await decide(T, { customerId: preecha, purposeId: NEWS, channel: "email", messageKind: "marketing" });
ok(dA.status === "eligible" && dA.reasons.length > 0 && /ฐานรุ่น 1$/.test(dA.policyVersion), `คนเดียวกัน: ขายสปอนเซอร์ = ใช้ได้ พร้อมเหตุผลและรุ่น (${dA.policyVersion})`);
ok(dB.status === "review_required" && dB.reasons.some((r) => /ไม่ทราบสถานะความยินยอม/.test(r)), "คนเดียวกัน: ข่าวสาร (ฐานยินยอม) = ต้องตรวจก่อน เพราะไม่ทราบความยินยอม");
await recordPreference(T, preecha, { kind: "withdrawal", purposeId: NEWS, evidence: "ขอยกเลิกรับข่าวทางอีเมล (สมมุติ)" }, "verify");
ok((await decide(T, { customerId: preecha, purposeId: NEWS, channel: "email", messageKind: "marketing" })).status === "suppressed"
  && (await decide(T, { customerId: preecha, purposeId: SPONSOR, channel: "email", messageKind: "marketing" })).status === "eligible",
  "หลังถอนรับข่าว: ข่าวสาร = ห้าม · ขายสปอนเซอร์ยังใช้ได้");

// ── 4 · วงจรแคมเปญ ──
const camp = await createCampaign(T, {
  name: "ขายสปอนเซอร์ Sunline 2027 (สมมุติ)", offer: "แพ็กเกจ Gold", purposeId: SPONSOR, channel: "email", messageKind: "marketing",
  criteria: { titleKeywords: ["จัดซื้อ"], maxPerOrg: 2 },
}, "lead@verify");
if (!camp.ok) throw new Error(camp.error);
const built = await buildTargets(T, camp.id, "lead@verify");
const cv = (await getCampaign(T, camp.id))!;
const tp = cv.targets.find((t) => t.customerId === preecha);
ok(built.ok && cv.criteriaText.some((t) => /จัดซื้อ/.test(t)), "เกณฑ์แสดงเป็นประโยคที่อ่านได้");
ok(tp != null && tp.reasons.some((r) => /สยามกริด/.test(r)) && tp.reasons.some((r) => /จัดซื้อ/.test(r)) && tp.eligibility === "eligible",
  "รายชื่อมีเหตุผลที่ถูกเลือก (บริษัท · ตำแหน่ง) และผลนโยบาย");
ok(!cv.targets.some((t) => t.name.includes("อรุณี")), "คนที่ออกจากบริษัทแล้วไม่อยู่ในรายชื่อ (เกณฑ์ใช้สังกัดปัจจุบัน)");
const due = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
ok((await assignTarget(T, tp!.id, "bd@verify", due, "lead@verify")).ok, "มอบหมายให้ BD");
ok((await recordOutcome(T, tp!.id, { outcome: "meeting", note: "นัดคุยแพ็กเกจ (สมมุติ)", nextStep: "ส่งข้อเสนอ", nextDue: due }, "bd@verify")).ok, "บันทึกผล: นัดประชุม + ขั้นตอนถัดไป");
ok((await recordOutcome(T, tp!.id, { outcome: "proposal", note: "ส่งข้อเสนอ Gold (สมมุติ)", value: 450000 }, "bd@verify")).ok, "บันทึกผล: ส่งข้อเสนอ → เกิดโอกาสขาย");
await logWork(null, T, "staff@parallax", true, "assign", camp.id, tp!.id);
const wk = await weeklyReview(T);
const row = wk.campaigns.find((c) => c.id === camp.id);
ok(row?.counts.proposal === 1, "หน้าทบทวนรายสัปดาห์เห็นเป้าหมายในขั้นส่งข้อเสนอ");
ok(wk.opportunities.some((o) => o.org.includes("สยามกริด") && o.stage === "proposal" && Number(o.value) === 450000), "โอกาสที่ขยับในสัปดาห์นี้มีมูลค่าข้อเสนอ");
const bd = wk.activity.find((a) => a.actor === "bd@verify"), lead = wk.activity.find((a) => a.actor === "lead@verify");
ok(bd?.outcomes === 2 && lead?.assign === 1 && !wk.activity.some((a) => a.actor === "staff@parallax") && wk.staffActions === 1,
  "กิจกรรมที่มีผลนับต่อคน และไม่นับทีม PARALLAX");
const dossier = (await getDossier(T, siam.id, V))!;
ok(dossier.interactions.some((i) => /ส่งข้อเสนอ Gold/.test(i.summary ?? "")) && dossier.opportunities.some((o) => o.stage === "proposal"),
  "ผลที่บันทึกลงไทม์ไลน์และโอกาสขายในแฟ้มบริษัท");

for (const line of out) console.log(line);
const failed = out.filter((l) => l.startsWith("FAIL"));
if (failed.length) {
  console.log(`\n=== FAIL ${failed.length} ข้อ ===`);
  process.exit(1);
}
console.log(`\n=== ผ่านทั้งหมด ${out.length} ข้อ ===`);
