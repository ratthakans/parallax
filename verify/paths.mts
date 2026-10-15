/* ── เส้นทางเข้าถึง + คนที่รู้จักย้ายบริษัท (docs/solo-plan.md S2 · S3) ─────────

   S2: "ฉันรู้จักคนนี้" บันทึกได้โดยเจ้าตัวพร้อมหลักฐานเท่านั้น · เส้นทางไม่เกินสองทอด ทุกทอดยืนยันแล้ว
       ไม่ผ่านคนกลางที่คัดค้าน/ขอจำกัด/เกินสิทธิ์ · ใช้เป็นเกณฑ์และเหตุผลของแคมเปญได้
   S3: การย้ายของคนที่ทีมรู้จักขึ้นในคิว "วันนี้" · คนที่ไม่มีใครรู้จัก คนในคิวตรวจ และคนที่เกินสิทธิ์ไม่ขึ้น
   ข้อมูลทั้งหมดเป็นชื่อสมมุติ โดเมน .example */
import "./isolate.mts";
import { createHash, randomUUID } from "node:crypto";
import { ensureReady } from "@/lib/engine/bootstrap";
import { get, run } from "@/lib/engine/sql";
import { ensurePurpose, registerSource } from "@/lib/engine/vault/sources";
import { commitUpload } from "@/lib/engine/vault/intake";
import { resolveTenant } from "@/lib/engine/vault/resolve";
import { recordPreference } from "@/lib/engine/policy/preferences";
import { buildTargets, createCampaign, matchCriteria } from "@/lib/engine/campaigns";
import { getDossier } from "@/lib/engine/accounts";
import { addMemberLink, addRelationship, endRelationship } from "@/lib/engine/accounts/edit";
import { loadPathGraph, pathsToOrg, pathsToPerson, suggestKnows } from "@/lib/engine/accounts/paths";
import { acknowledgeItem, todayQueue } from "@/lib/engine/today";
import type { TodayQueue } from "@/lib/shared/today";

const out: string[] = [];
const ok = (c: boolean, m: string) => out.push(`${c ? "PASS" : "FAIL"}  ${m}`);
const T = "hongmove";
const ME = { id: "me@verify", clearance: "confidential" as const };
const MATE = { id: "mate@verify", clearance: "confidential" as const };
await ensureReady();

const MAP = { 0: "first_name", 1: "last_name", 2: "company", 3: "job_title", 4: "email", 5: "phone", 6: "occurred_at" };
const src = await registerSource(T, {
  name: "รายชื่อสมมุติสำหรับตรวจเส้นทาง", kind: "file", newPurpose: "ขายสปอนเซอร์ (เส้นทาง)",
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
const batch = await upload("เส้นทาง.csv", [
  `ก้อง,กังวาน,บริษัท เอกชัย จำกัด,ผู้จัดการฝ่ายการตลาด,kong@ekachai.example,081-555-5001,${d40}`,
  `ขวัญ,ขวัญใจ,บริษัท เอกชัย จำกัด,วิศวกรอาวุโส,khwan@ekachai.example,081-555-5002,${d40}`,
  `คม,คมคาย,บริษัท คมสัน จำกัด,ที่ปรึกษาอิสระ,kom@komsan.example,081-555-5003,${d40}`,
  `จันทร์,จันทรา,บริษัท จันทร์เพ็ญ จำกัด,ผู้จัดการฝ่ายการตลาด,jan@janpen.example,081-555-5004,${d40}`,
  `ฉัตร,ฉัตรชัย,บริษัท ฉัตรทอง จำกัด,ผู้จัดการฝ่ายการตลาด,chat@chatthong.example,081-555-5005,${d40}`,
  `ดวง,ดวงดี,บริษัท ดวงดาว จำกัด,ผู้จัดการทั่วไป,duang@duangdao.example,081-555-5006,${d40}`,
]);
const who = async (first: string) => (await get<{ id: string }>(
  "SELECT DISTINCT c.id FROM customers c JOIN import_rows r ON r.customer_id = c.id AND r.tenant_id = c.tenant_id WHERE c.tenant_id = ? AND r.batch_id = ? AND c.name LIKE ?",
  T, batch, `${first}%`))!.id;
const orgOf = async (id: string) => (await get<{ org_id: string }>(
  "SELECT org_id FROM affiliations WHERE tenant_id = ? AND customer_id = ? AND valid_to IS NULL ORDER BY valid_from DESC", T, id))!.org_id;
const kong = await who("ก้อง"), khwan = await who("ขวัญ"), kom = await who("คม"), jan = await who("จันทร์"), chat = await who("ฉัตร"), duang = await who("ดวง");
const orgA = await orgOf(kong), orgD = await orgOf(chat);
const g = () => loadPathGraph(T, "confidential");

// ── S2 · บันทึก "ฉันรู้จัก" ──
ok(!(await addRelationship(T, { type: "knows", fromKind: "member", fromId: ME.id, toKind: "person", toId: chat, evidence: "ยืนยันแทนกัน" }, "boss@verify")).ok,
  "บันทึกว่าคนอื่นในทีมรู้จักใครไม่ได้ (ต้องเป็นเจ้าตัว)");
ok(!(await addMemberLink(T, { personId: chat, type: "knows", context: "" }, ME)).ok, "รู้จักโดยไม่บอกว่ารู้จักจากที่ไหนไม่ได้");
const l1 = await addMemberLink(T, { personId: chat, type: "knows", context: "ประชุมสมาคม ต.ค. 2568 (สมมุติ)" }, ME);
ok(l1.ok && !l1.existed, "บันทึกว่ารู้จักพร้อมบริบทได้");
const l1b = await addMemberLink(T, { personId: chat, type: "knows", context: "บันทึกซ้ำ (สมมุติ)" }, ME);
ok(l1b.ok && l1b.existed, "บันทึกซ้ำไม่สร้างความสัมพันธ์ใหม่");
const ev = l1.ok ? await get<{ kind: string; captured_by: string }>(
  "SELECT e.kind, e.captured_by FROM relationship_assertions r JOIN evidence e ON e.id = r.evidence_id AND e.tenant_id = r.tenant_id WHERE r.tenant_id = ? AND r.id = ?", T, l1.id) : null;
ok(ev?.kind === "self_attestation" && ev.captured_by === ME.id, "หลักฐานคือคำยืนยันของเจ้าตัว");
await run("UPDATE customers SET classification = 'restricted_high' WHERE tenant_id = ? AND id = ?", T, duang);
ok(!(await addMemberLink(T, { personId: duang, type: "knows", context: "พบที่งานสัมมนา (สมมุติ)" }, ME)).ok, "บันทึกว่ารู้จักคนที่เกินระดับสิทธิ์ของตัวเองไม่ได้");
await run("UPDATE customers SET classification = 'confidential' WHERE tenant_id = ? AND id = ?", T, duang);

// ── S2 · เส้นทาง ──
let p = pathsToPerson(await g(), chat, orgD);
ok(p.length === 1 && p[0].hops === 1 && p[0].member === ME.id && /โดยตรง/.test(p[0].text), "รู้จักเอง = เส้นทางทอดเดียว");
await addMemberLink(T, { personId: kom, type: "has_worked_with", context: "โครงการปี 2566 (สมมุติ)" }, ME);
const bridge = await addRelationship(T, { type: "works_with", fromKind: "person", fromId: kom, toKind: "person", toId: kong, evidence: "คุณคมแจ้งว่าทำงานกับคุณก้อง (สมมุติ)" }, ME.id);
if (!bridge.ok) throw new Error(bridge.error);
await addMemberLink(T, { personId: khwan, type: "knows", context: "เพื่อนสมัยเรียน (สมมุติ)" }, MATE);
p = pathsToPerson(await g(), kong, orgA);
ok(p.some((x) => x.hops === 2 && x.via?.id === kom && x.member === ME.id && /คม/.test(x.text)), "ผ่านคนกลางที่ทำงานด้วยกัน = สองทอด พร้อมชื่อคนกลาง");
ok(p.some((x) => x.hops === 2 && x.via?.id === khwan && x.member === MATE.id && /อยู่บริษัทเดียวกับ .* ตอนนี้/.test(x.text)), "ผ่านเพื่อนร่วมบริษัทปัจจุบัน = สองทอด");
ok(!p.some((x) => x.hops === 1), "ไม่มีใครรู้จักก้องโดยตรง — ไม่มีทอดเดียว");
ok(JSON.stringify(p) === JSON.stringify(pathsToPerson(await g(), kong, orgA)), "ลำดับเส้นทางคงที่เมื่อรันซ้ำ");
const toOrg = pathsToOrg(await g(), orgA);
ok(toOrg.some((x) => x.hops === 1 && x.person.id === khwan) && toOrg.some((x) => x.hops === 2 && x.person.id === kong),
  "เส้นทางถึงบริษัท = เส้นทางถึงคนที่อยู่บริษัทนั้นตอนนี้");
ok(pathsToPerson(await g(), jan, await orgOf(jan)).length === 0, "คนที่ไม่มีใครเชื่อมถึง = ไม่มีเส้นทาง (ไม่เดา)");

// ── S2 · เกณฑ์แคมเปญ ──
const ids = (r: Awaited<ReturnType<typeof matchCriteria>>) => new Set(r.matches.map((m) => m.customerId));
let m = await matchCriteria(T, { titleKeywords: ["การตลาด"], warmPath: "direct", maxPerOrg: 5 });
ok(ids(m).has(chat) && !ids(m).has(kong) && !ids(m).has(jan), "เกณฑ์ \"รู้จักโดยตรง\" ได้เฉพาะคนที่ทีมรู้จักเอง");
m = await matchCriteria(T, { titleKeywords: ["การตลาด"], warmPath: "any", maxPerOrg: 5 });
ok(ids(m).has(chat) && ids(m).has(kong) && !ids(m).has(jan), "เกณฑ์ \"ภายในสองทอด\" รวมคนที่เข้าถึงผ่านคนกลาง");
ok(m.matches.find((x) => x.customerId === kong)?.reasons.some((r) => /^เส้นทางเข้าถึง: /.test(r)) ?? false, "เป้าหมายมีเส้นทางเป็นเหตุผลที่อ่านได้");
const now = new Date().toISOString();
await run("INSERT INTO interactions (id, tenant_id, kind, occurred_at, org_id, customer_id, summary, owner_id, recorded_at) VALUES (?,?,?,?,?,?,?,?,?)",
  randomUUID(), T, "meeting", now, orgD, chat, "นัดคุย (สมมุติ)", ME.id, now);
m = await matchCriteria(T, { titleKeywords: ["การตลาด"], interactedWithinDays: 30, maxPerOrg: 5 });
ok(ids(m).has(chat) && !ids(m).has(kong), "เกณฑ์ \"มีปฏิสัมพันธ์ภายใน 30 วัน\" ได้เฉพาะบริษัทที่คุยกันล่าสุด");
m = await matchCriteria(T, { titleKeywords: ["การตลาด"], quietForDays: 30, maxPerOrg: 5 });
ok(!ids(m).has(chat) && ids(m).has(kong), "เกณฑ์ \"เงียบมาแล้ว 30 วัน\" ไม่รวมบริษัทที่เพิ่งคุย แต่รวมบริษัทที่ไม่เคยคุย");

// ── สังกัดปัจจุบันสองแห่ง (บริษัทเดียวกันที่เขียนต่างกัน) — เดิมการสร้างรายชื่อล้มทั้งธุรกรรม ──
await run("INSERT INTO affiliations (id, tenant_id, customer_id, org_id, title, valid_from, valid_to, confirmed_by, recorded_at) VALUES (?,?,?,?,?,?,?,?,?)",
  randomUUID(), T, chat, orgA, "ผู้จัดการฝ่ายการตลาด", d40, null, "verify", new Date().toISOString());
m = await matchCriteria(T, { titleKeywords: ["การตลาด"], maxPerOrg: 5 });
ok(m.matches.filter((x) => x.customerId === chat).length === 1, "คนที่มีสังกัดปัจจุบันสองแห่ง อยู่ในรายชื่อครั้งเดียว");
const dupCamp = await createCampaign(T, { name: "ทดสอบสังกัดซ้อน (สมมุติ)", purposeId: await ensurePurpose(T, "ขายสปอนเซอร์ (เส้นทาง)", "verify"), channel: "email", messageKind: "marketing", criteria: { titleKeywords: ["การตลาด"], maxPerOrg: 5 } }, ME.id);
ok(dupCamp.ok && (await buildTargets(T, dupCamp.id, ME.id)).ok, "สร้างรายชื่อได้ ไม่ล้มเพราะคนเดียวกันซ้ำ");
await run("DELETE FROM affiliations WHERE tenant_id = ? AND customer_id = ? AND org_id = ?", T, chat, orgA);

// ── S2 · คนกลางที่คัดค้าน / เกินสิทธิ์ / ความสัมพันธ์ที่สิ้นสุด ──
await run("UPDATE customers SET classification = 'restricted_high' WHERE tenant_id = ? AND id = ?", T, khwan);
p = pathsToPerson(await g(), kong, orgA);
ok(!p.some((x) => x.via?.id === khwan) && !p.some((x) => /ขวัญ/.test(x.text)), "ไม่มีเส้นทางผ่านคนกลางที่เกินสิทธิ์ผู้อ่าน (ไม่ใช่แค่ซ่อนชื่อ)");
ok(pathsToPerson(await loadPathGraph(T, "restricted_high"), kong, orgA).some((x) => x.via?.id === khwan), "ผู้มีสิทธิ์ระดับนั้นเห็นเส้นทางผ่านเขา");
await run("UPDATE customers SET classification = 'confidential' WHERE tenant_id = ? AND id = ?", T, khwan);
const PURPOSE = await ensurePurpose(T, "ขายสปอนเซอร์ (เส้นทาง)", "verify");
await recordPreference(T, kom, { kind: "objection", purposeId: PURPOSE, evidence: "คัดค้านทางโทรศัพท์ (สมมุติ)" }, "dpo@verify");
ok(!pathsToPerson(await g(), kong, orgA).some((x) => x.via?.id === kom), "ไม่มีเส้นทางผ่านคนกลางที่คัดค้าน");
if (l1.ok) await endRelationship(T, l1.id, new Date(Date.now() - 864e5).toISOString().slice(0, 10), "ไม่ได้ติดต่อกันแล้ว (สมมุติ)", ME.id);
ok(!pathsToPerson(await g(), chat, orgD).some((x) => x.hops === 1), "ความสัมพันธ์ที่สิ้นสุดแล้วไม่เป็นเส้นทาง");
await addMemberLink(T, { personId: chat, type: "knows", context: "กลับมาติดต่อกันใหม่ (สมมุติ)" }, ME);

// ── S2 · ข้อเสนอและแฟ้มบริษัท ──
for (let i = 0; i < 2; i++) {
  await run("INSERT INTO interactions (id, tenant_id, kind, occurred_at, org_id, customer_id, summary, owner_id, recorded_at) VALUES (?,?,?,?,?,?,?,?,?)",
    randomUUID(), T, "call", now, await orgOf(jan), jan, "โทรคุย (สมมุติ)", ME.id, now);
}
ok((await suggestKnows(T, ME)).some((s) => s.personId === jan && s.interactions === 2), "คุยกันสองครั้ง = เสนอให้บันทึกว่ารู้จัก");
ok(pathsToPerson(await g(), jan, await orgOf(jan)).length === 0, "ข้อเสนอไม่สร้างความสัมพันธ์เอง");
ok(!(await suggestKnows(T, MATE)).some((s) => s.personId === jan), "ข้อเสนอมาจากปฏิสัมพันธ์ของผู้อ่านเองเท่านั้น");
await addMemberLink(T, { personId: jan, type: "knows", context: "คุยโทรศัพท์หลายครั้ง (สมมุติ)" }, ME);
ok(!(await suggestKnows(T, ME)).some((s) => s.personId === jan), "บันทึกแล้วไม่เสนอซ้ำ");
const dossier = await getDossier(T, orgD, ME);
ok(dossier?.relationships.some((r) => r.fromKind === "member" && r.fromName === ME.id && r.toName.startsWith("ฉัตร")) ?? false,
  "แฟ้มบริษัทแสดงว่าใครในทีมรู้จักคนในบริษัท");

// ── S3 · คนที่รู้จักย้ายบริษัท ──
const orgNewName = "บริษัท ฉัตรใหม่ จำกัด";
await upload("ย้ายงาน.csv", [
  `ฉัตร,ฉัตรชัย,${orgNewName},ผู้อำนวยการฝ่ายการตลาด,chat@chatthong.example,081-555-5005,${d10}`,
  `ดวง,ดวงดี,บริษัท ดวงใหม่ จำกัด,ผู้จัดการทั่วไป,duang@duangdao.example,081-555-5006,${d10}`,
]);
const newAff = await get<{ id: string; org_id: string }>(
  "SELECT id, org_id FROM affiliations WHERE tenant_id = ? AND customer_id = ? AND valid_to IS NULL ORDER BY valid_from DESC", T, chat);
const oldClosed = await get<{ valid_to: string | null }>("SELECT valid_to FROM affiliations WHERE tenant_id = ? AND customer_id = ? AND org_id = ?", T, chat, orgD);
ok(Boolean(newAff && newAff.org_id !== orgD && oldClosed?.valid_to), "ไฟล์ใหม่ = สังกัดใหม่ และสังกัดเดิมถูกปิดช่วง (ไม่เขียนทับ)");
const moved = (q: TodayQueue) => q.sections.find((s) => s.section === "moved")?.items ?? [];
/* อีเมลเดิมโดเมนเดียวกัน → การตรวจตัวตนเสนอว่าสองบริษัทอาจเป็นบริษัทเดียวกัน — ระหว่างนั้นยังไม่ใช่การย้าย */
const orgReview = await get<{ id: string }>(
  "SELECT id FROM review_items WHERE tenant_id = ? AND kind = 'org_group' AND status = 'open' AND subject_ids LIKE ? AND subject_ids LIKE ?",
  T, `%"${orgD}"%`, `%"${newAff!.org_id}"%`);
ok(Boolean(orgReview) && !moved(await todayQueue(T, ME)).some((i) => i.id === newAff!.id),
  "สองบริษัทที่รอตรวจว่าเป็นบริษัทเดียวกัน = ยังไม่ขึ้นเป็นการย้าย (อาจแค่เปลี่ยนชื่อ)");
if (orgReview) await run("UPDATE review_items SET status = 'kept_apart' WHERE tenant_id = ? AND id = ?", T, orgReview.id);
let q = await todayQueue(T, ME);
const sig = moved(q).find((i) => i.id === newAff!.id);
ok(Boolean(sig && sig.title.includes(orgNewName) && sig.detail.some((d) => d.includes(ME.id))), "คนที่ทีมรู้จักย้ายบริษัท ขึ้นในคิวพร้อมเหตุผลว่าใครรู้จัก");
ok(sig?.detail.some((d) => /ตรวจฐานการติดต่อ/.test(d)) === true && sig?.eligibility === null, "ไม่มีปุ่มติดต่อ — ย้ายบริษัทไม่ได้แปลว่าฐานการติดต่อย้ายตาม");
const duangAff = await get<{ id: string }>("SELECT id FROM affiliations WHERE tenant_id = ? AND customer_id = ? AND valid_to IS NULL", T, duang);
ok(!moved(q).some((i) => i.id === duangAff?.id), "คนที่ไม่มีใครรู้จักย้ายบริษัท ไม่ขึ้นคิว");
await run("INSERT INTO opportunities (id, tenant_id, org_id, name, stage, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
  randomUUID(), T, newAff!.org_id, "ข้อเสนอ (สมมุติ)", "open", now, now);
q = await todayQueue(T, ME);
ok(moved(q).find((i) => i.id === newAff!.id)?.detail[0] === "เข้ามาอยู่ในบัญชีที่คุณกำลังขาย", "ย้ายเข้าบริษัทที่มีโอกาสเปิด = เข้ามาในบัญชีที่กำลังขาย");
await run("UPDATE customers SET classification = 'restricted_high' WHERE tenant_id = ? AND id = ?", T, chat);
ok(!moved(await todayQueue(T, ME)).some((i) => i.id === newAff!.id), "การย้ายของคนที่เกินสิทธิ์ผู้อ่านไม่ขึ้นคิว");
await run("UPDATE customers SET classification = 'confidential' WHERE tenant_id = ? AND id = ?", T, chat);
const rv = randomUUID();
await run("INSERT INTO review_items (id, tenant_id, kind, subject_ids, signals, confidence, status, created_at) VALUES (?,?,?,?,?,?,?,?)",
  rv, T, "person_pair", JSON.stringify([chat, jan]), JSON.stringify(["same_name_same_org"]), 0.5, "open", now);
ok(!moved(await todayQueue(T, ME)).some((i) => i.id === newAff!.id), "คนที่ยังอยู่ในคิวตรวจตัวตนไม่ขึ้นเป็นการย้าย");
await run("DELETE FROM review_items WHERE tenant_id = ? AND id = ?", T, rv);
ok((await acknowledgeItem(T, ME.id, "affiliation", newAff!.id)).ok && !moved(await todayQueue(T, ME)).some((i) => i.id === newAff!.id),
  "รับทราบแล้วหายจากคิว");
ok(moved(await todayQueue(T, MATE)).some((i) => i.id === newAff!.id), "การรับทราบเป็นของแต่ละคน");

for (const line of out) console.log(line);
const failed = out.filter((l) => l.startsWith("FAIL"));
if (failed.length) {
  console.log(`\n=== FAIL ${failed.length} ข้อ ===`);
  process.exit(1);
}
console.log(`\n=== ผ่านทั้งหมด ${out.length} ข้อ ===`);
