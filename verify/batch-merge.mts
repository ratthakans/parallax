/* ── ยืนยันการรวมตัวตนเป็นชุด (docs/solo-plan.md S5 "ผ่านเมื่อ") ─────────

   1. ชุดที่มีสัญญาณอ่อน ("ชื่อเหมือน + โดเมนเดียวกัน") ไม่ถูกเสนอ
   2. ยืนยันชุด = ธุรกรรมเดียว (คู่หนึ่งรวมไม่ได้ = ไม่รวมเลยทั้งชุด) · ย้อนชุด = กลับสภาพเดิมทุกคู่ (รวม consents และข้อจำกัด)
   3. AI ไม่ได้รับค่าติดต่อจริง (ตรวจคำขอที่ตัวแทนโมเดลได้รับ)
   4. AI ปิด → ไม่มีชุดที่พึ่ง AI · ระบบไม่ล้ม · ชุดตามกติกายังทำได้
   5. สุ่มตรวจหลังรวม: ชุด ≥ 20 คู่ สุ่ม 3 คู่ ตรวจได้เมื่อครบ 7 วัน · ผิด ≥ 1 → ส่งชุดกลับไปตรวจทีละคู่
   6. precision บนข้อมูลสมมุติพร้อมเฉลย หลังยืนยันทุกชุดที่เสนอ ≥ precision ของกติกาเดิม (ไม่ยอมให้ความแม่นลดเพื่อความเร็ว)
   ข้อมูลทั้งหมดเป็นชื่อสมมุติ โดเมน .example */
import "./isolate.mts";
import { createHash } from "node:crypto";
import { ensureReady } from "@/lib/engine/bootstrap";
import { all, get, run } from "@/lib/engine/sql";
import { setTestTransport } from "@/lib/engine/ai";
import { registerSource } from "@/lib/engine/vault/sources";
import { analyseUpload, commitUpload } from "@/lib/engine/vault/intake";
import { resolveTenant } from "@/lib/engine/vault/resolve";
import { sampleStats } from "@/lib/engine/vault/sample";
import {
  aiAssist, aiCandidates, batchHistory, confirmBatch, dueBatchSamples, pairFacts, proposeBatches, recordBatchSample, ruleOf, undoBatch,
  type PairFacts, type ProposedBatch,
} from "@/lib/engine/vault/review-batches";
import { fileBytes, generateSynthetic, type Segment } from "@/lib/shared/synthetic-b2b";

const out: string[] = [];
const ok = (c: boolean, m: string) => out.push(`${c ? "PASS" : "FAIL"}  ${m}`);
const T = "hongmove";
const ACTOR = "steward@verify";
await ensureReady();

// ── ข้อมูลสมมุติ ──
const HEAD = "ชื่อ,นามสกุล,บริษัท,ตำแหน่ง,อีเมล,โทรศัพท์,วันที่";
const MAP = { 0: "first_name", 1: "last_name", 2: "company", 3: "job_title", 4: "email", 5: "phone", 6: "occurred_at" };
const src = await registerSource(T, {
  name: "รายชื่อสมมุติสำหรับตรวจการรวมเป็นชุด", kind: "file", newPurpose: "ตรวจการรวมเป็นชุด",
  acquisitionNote: "ข้อมูลสมมุติที่เขียนขึ้นในชุดตรวจ ไม่ใช่ข้อมูลของใคร", fields: Object.values(MAP),
}, "verify");
if (!src.ok) throw new Error(src.error);

const FIRST = [["สมชาย", "Somchai"], ["สมศักดิ์", "Somsak"], ["วิชัย", "Wichai"], ["ประเสริฐ", "Prasert"], ["อนุชา", "Anucha"],
  ["ธนพล", "Thanaphon"], ["กิตติ", "Kitti"], ["ณัฐพล", "Nattaphon"], ["สุรชัย", "Surachai"], ["ปิยะ", "Piya"],
  ["สุภาพร", "Supaporn"], ["วรรณา", "Wanna"], ["กาญจนา", "Kanchana"], ["ศิริพร", "Siriporn"], ["อรุณี", "Arunee"],
  ["พิมพ์ชนก", "Pimchanok"], ["ณัฐธิดา", "Natthida"], ["จิราพร", "Jiraporn"], ["มาลี", "Malee"], ["รัตนา", "Rattana"],
  ["ณัฐวุฒิ", "Natthawut"], ["วิภา", "Wipa"]];
const LAST = [["ใจดี", "Jaidee"], ["ศรีสุข", "Srisuk"], ["วงศ์สวัสดิ์", "Wongsawat"], ["ทองดี", "Thongdee"], ["บุญมา", "Boonma"],
  ["แสงทอง", "Saengthong"], ["รุ่งเรือง", "Rungrueang"], ["ชัยมงคล", "Chaimongkol"], ["พรหมมา", "Phromma"], ["สุขสวัสดิ์", "Suksawat"],
  ["เจริญผล", "Charoenphon"]];
const lines: string[] = [];
const secrets: string[] = []; // อีเมล/เบอร์ทุกค่าในชุดนี้ — ต้องไม่อยู่ในคำขอที่ส่งให้ AI

/* ก · ทับศัพท์ไทย↔อังกฤษ 22 คู่: อีเมลเดียวกัน · บริษัทเดียวกัน · ตำแหน่งเดียวกัน · เบอร์มีฝั่งเดียว → ชุด xscript_email_org */
FIRST.forEach(([th, en], i) => {
  const [lt, le] = LAST[i % LAST.length];
  const email = `${en.toLowerCase()}.${le.toLowerCase().slice(0, 3)}@andamangrid.example`;
  const phone = `081-555-${String(1000 + i)}`;
  secrets.push(email, phone);
  lines.push(`${th},${lt},บริษัท อันดามันกริด จำกัด,ผู้จัดการฝ่ายขาย,${email},${phone},2024-03-01`);
  lines.push(`${en},${le},บริษัท อันดามันกริด จำกัด,ผู้จัดการฝ่ายขาย,${email},,2024-09-01`);
});
/* ข · ชื่อเดียวกัน · บริษัทเดียวกัน · ตำแหน่งเดียวกัน · อีเมลงานกับอีเมลส่วนตัว (ไม่ขัดกัน) 3 คู่ → ชุด same_name_org_title */
for (const [i, [f, l]] of [["ชนิดา", "ทองคำ"], ["อำไพ", "ศรีวงศ์"], ["เกศินี", "มณีรัตน์"]].entries()) {
  const work = `staff${i + 1}@lannadata.example`, home = `home${i + 1}@mail.example`;
  secrets.push(work, home);
  lines.push(`${f},${l},บริษัท ลานนาดาต้า จำกัด,วิศวกร,${work},,2024-02-01`);
  lines.push(`${f},${l},บริษัท ลานนาดาต้า จำกัด,วิศวกร,${home},,2025-02-01`);
}
/* ค · สัญญาณอ่อน 3 คู่: ชื่อเหมือน + อีเมลโดเมนเดียวกัน (คนละที่อยู่) · ไม่มีบริษัท ไม่มีตำแหน่ง → ต้องไม่ถูกเสนอเป็นชุด */
for (const [i, [f, l]] of [["สุดา", "แก้วใส"], ["ประยุทธ", "นาคดี"], ["ลำดวน", "ทองมา"]].entries()) {
  const a = `a${i + 1}@phaisan.example`, b = `b${i + 1}@phaisan.example`;
  secrets.push(a, b);
  lines.push(`${f},${l},,,${a},,2024-01-01`);
  lines.push(`${f},${l},,,${b},,2024-06-01`);
}
/* ง · ชื่อสะกดต่างที่กติกาตัดสินไม่ได้ 2 คู่: อีเมลเดียวกัน · บริษัทเดียวกัน → ให้ AI ช่วย
   ช่องตำแหน่งของแถวหนึ่งมีอีเมลปนมา (ไฟล์จริงเป็นแบบนี้) — ต้องถูกล้างก่อนส่งให้โมเดล */
secrets.push("pornthip.s@chonlathee.example", "081-555-0901", "chatchai.b@chonlathee.example", "089-555-0902");
lines.push(`Pornthip,Saengthong,"Chonlathee Works Co., Ltd.",Sales Manager,pornthip.s@chonlathee.example,081-555-0901,2024-04-01`);
lines.push(`Phonthip,Saengthong,"Chonlathee Works Co., Ltd.",Sales Manager pornthip.s@chonlathee.example,pornthip.s@chonlathee.example,,2025-04-01`);
lines.push(`Chatchai,Boonma,"Chonlathee Works Co., Ltd.",Engineer,chatchai.b@chonlathee.example,089-555-0902,2024-04-01`);
lines.push(`Chadchai,Boonma,"Chonlathee Works Co., Ltd.",Engineer,chatchai.b@chonlathee.example,,2025-04-01`);

const bytes = new TextEncoder().encode([HEAD, ...lines].join("\n"));
const up = await commitUpload(T, src.id, bytes, "ชุดรวม.csv", MAP, createHash("sha256").update(bytes).digest("hex"), "verify");
if (!up.ok) throw new Error(up.error);
const st = await resolveTenant(T, "verify");
ok(st.personPairs === 30, `คิวมี 30 คู่ตามที่ตั้งใจ (22 ทับศัพท์ · 3 ชื่อเดียวกัน · 3 สัญญาณอ่อน · 2 สะกดต่าง) — พบ ${st.personPairs}`);

const facts = await pairFacts(T);
const byName = (needle: string) => facts.find((f) => f.a.name.includes(needle) || f.b.name.includes(needle));
const batches = await proposeBatches(T, facts);
const xs = batches.find((b) => b.rule === "xscript_email_org");
const sn = batches.find((b) => b.rule === "same_name_org_title");

// ── 1 · สัญญาณอ่อนไม่ถูกเสนอ ──
const weakIds = ["สุดา", "ประยุทธ", "ลำดวน"].map((n) => byName(n)?.itemId);
ok(weakIds.every(Boolean), "คู่สัญญาณอ่อนทั้งสามอยู่ในคิว (ชื่อเหมือน + โดเมนเดียวกัน เข้าคิว ไม่รวมเอง)");
ok(batches.every((b) => b.pairs.every((p) => !weakIds.includes(p.itemId))), "ข้อ 1: คู่ที่มีแค่ชื่อเหมือน + โดเมนเดียวกัน ไม่อยู่ในชุดใดเลย");
const weakFact: PairFacts = { ...facts[0], name: "same", email: "none", phone: "none", org: "domain", title: "none", isolated: true, batchId: null, ai: null };
ok(ruleOf(weakFact) === null, "ข้อ 1: กติกาไม่เสนอ \"ชื่อเหมือน + โดเมนเดียวกัน\" แม้ไม่มีช่องทางขัดกัน");
ok(ruleOf({ ...weakFact, org: "same", title: "same", phone: "conflict" }) === null, "เบอร์ขัดกัน = ไม่เข้าชุด แม้ชื่อ บริษัท ตำแหน่งตรงกัน");
ok(ruleOf({ ...weakFact, org: "same", title: "same", isolated: false }) === null, "คนที่อยู่ในหลายคู่ต้องตรวจทีละคู่ (รวมคู่หนึ่งเปลี่ยนอีกคู่)");
ok(xs?.pairs.length === 22, `ชื่อไทยกับชื่ออังกฤษทับศัพท์ตรง + อีเมลเดียวกัน + บริษัทเดียวกัน เป็นชุดเดียว 22 คู่ — พบ ${xs?.pairs.length ?? 0}`);
ok(sn?.pairs.length === 3, `ชื่อเดียวกัน + บริษัทเดียวกัน + ตำแหน่งเดียวกัน เป็นชุด 3 คู่ — พบ ${sn?.pairs.length ?? 0}`);
ok(batches.every((b) => !b.aiAssisted), "ก่อนเรียก AI ไม่มีชุดที่พึ่ง AI");
if (!xs || !sn) { for (const l of out) console.log(l); process.exit(1); }

// ── 3 · AI ไม่ได้รับค่าติดต่อจริง ──
type Req = { system: string; messages: { content: string }[] };
const seen: Req[] = [];
setTestTransport(async (req) => {
  seen.push(req);
  const refs = [...req.messages[0].content.matchAll(/^(P\d+): /gm)].map((m) => m[1]);
  return { text: JSON.stringify({ verdicts: refs.map((ref) => ({ ref, verdict: "same", fields: ["name", "email"], reason: "ชื่อสะกดต่างแต่ทับศัพท์เดียวกัน" })) }) };
});
const cands = await aiCandidates(T);
ok(cands.length === 2 && cands.every((c) => /thip|chai/i.test(c.a.name)), `คู่ที่ชื่อสะกดต่าง (กติกาตัดสินไม่ได้) เป็นงานของ AI — ${cands.length} คู่`);
const assisted = await aiAssist(T, ACTOR);
ok(assisted.ok && assisted.asked === 2 && assisted.same === 2, `AI ตอบครบทุกคู่ (${assisted.ok ? `${assisted.asked} คู่ · same ${assisted.same}` : assisted.error})`);
const payload = seen.map((r) => `${r.system}\n${r.messages.map((m) => m.content).join("\n")}`).join("\n");
const digits = (s: string) => s.replace(/\D/g, "");
ok(seen.length === 1, "เรียกโมเดลครั้งเดียวต่อชุดคู่ (ไม่ใช่ทีละคู่)");
ok(secrets.every((s) => !payload.includes(s)) && !/@/.test(payload.replace(/\[อีเมล\]/g, "")),
  "ข้อ 3: คำขอไม่มีอีเมลจริงสักตัว — รวมอีเมลที่ไฟล์ใส่ปนมาในช่องตำแหน่ง");
ok(secrets.filter((s) => !s.includes("@")).every((p) => !digits(payload).includes(digits(p))), "ข้อ 3: คำขอไม่มีเบอร์จริง (แม้เขียนแบบไม่มีขีด)");
ok(/อีเมล: ตรงกัน/.test(payload) && /เบอร์: (ไม่มี|ตรงกัน|ไม่ตรง)/.test(payload), "ช่องทางส่งเป็น \"ตรงกัน/ไม่ตรง/ไม่มี\" เท่านั้น");
ok(/Pornthip|Phonthip/.test(payload) && /Chonlathee/.test(payload), "ส่งชื่อ ตำแหน่ง และชื่อบริษัท — สิ่งที่ AI ต้องใช้ตัดสิน");
const withAi = await proposeBatches(T);
const aiBatch = withAi.find((b) => b.aiAssisted);
ok(aiBatch?.pairs.length === 2 && aiBatch.rule === "ai_name_match", "คำตอบ same ของ AI กลายเป็นชุดที่ \"เสนอ\" — ยังไม่รวมจนคนยืนยัน");
ok(Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM merge_log WHERE tenant_id = ?", T))!.n) === 0, "AI ไม่รวมเอง — ยังไม่มีการรวมสักคู่");
ok((await aiCandidates(T)).length === 0, "คู่ที่ AI ตอบแล้วไม่ถูกส่งซ้ำ");

// ── 4 · AI ปิด ──
process.env.AI_DISABLED = "1";
const calls = seen.length;
const off = await proposeBatches(T);
ok(off.every((b) => !b.aiAssisted), "ข้อ 4: AI ปิด → ไม่มีชุดที่พึ่ง AI (ข้อเสนอเดิมของ AI ถูกซ่อน)");
ok(off.some((b) => b.rule === "xscript_email_org") && off.some((b) => b.rule === "same_name_org_title"), "ข้อ 4: ชุดตามกติกายังเสนอได้ตามเดิม");
let crashed = false;
let offAssist: Awaited<ReturnType<typeof aiAssist>> | null = null;
try { offAssist = await aiAssist(T, ACTOR); } catch { crashed = true; }
ok(!crashed && offAssist?.ok === false && seen.length === calls, "ข้อ 4: กดให้ AI ช่วยตอน AI ปิด = บอกเหตุผล ไม่ล้ม ไม่เรียกโมเดล");
const offConfirm = await confirmBatch(T, { key: aiBatch?.key ?? "", itemIds: aiBatch?.pairs.map((p) => p.itemId) ?? [] }, ACTOR);
ok(!offConfirm.ok, "ข้อ 4: ยืนยันชุดที่พึ่ง AI ตอน AI ปิดไม่ได้");
delete process.env.AI_DISABLED;

// ── ภาพก่อนรวม ──
const subjectsOf = (b: ProposedBatch) => b.pairs.flatMap((p) => [p.a.id, p.b.id]);
async function snapshot(ids: string[], itemIds: string[]) {
  const q = ids.map(() => "?").join(",");
  const iq = itemIds.map(() => "?").join(",");
  return JSON.stringify({
    customers: await all(`SELECT id, name, lifecycle_state, restriction_status, classification FROM customers WHERE tenant_id = ? AND id IN (${q}) ORDER BY id`, T, ...ids),
    points: await all(`SELECT id, customer_id, kind, value_hmac, value_masked, is_primary FROM contact_points WHERE tenant_id = ? AND customer_id IN (${q}) ORDER BY id`, T, ...ids),
    consents: await all(`SELECT customer_id, purpose, granted_at, revoked_at, source FROM consents WHERE tenant_id = ? AND customer_id IN (${q}) ORDER BY customer_id, purpose`, T, ...ids),
    affiliations: await all(`SELECT id, customer_id, org_id, title FROM affiliations WHERE tenant_id = ? AND customer_id IN (${q}) ORDER BY id`, T, ...ids),
    rows: await all(`SELECT batch_id, line, customer_id FROM import_rows WHERE tenant_id = ? AND customer_id IN (${q}) ORDER BY batch_id, line`, T, ...ids),
    items: await all(`SELECT id, status, subject_ids, decided_by FROM review_items WHERE tenant_id = ? AND id IN (${iq}) ORDER BY id`, T, ...itemIds),
    overrides: await all(`SELECT a_id, b_id, verdict FROM resolution_overrides WHERE tenant_id = ? AND kind = 'person' AND (a_id IN (${q}) OR b_id IN (${q})) ORDER BY a_id, b_id`, T, ...ids, ...ids),
  });
}
const mergesOf = async (group: string) => all<{ id: string; undone_at: string | null }>("SELECT id, undone_at FROM merge_log WHERE tenant_id = ? AND rule = ?", T, group);

// ── 2 · ธุรกรรมเดียว: คู่หนึ่งรวมไม่ได้ = ไม่รวมเลย ──
const snIds = sn.pairs.map((p) => p.itemId);
const [failA, failB] = [sn.pairs[2].a.id, sn.pairs[2].b.id];
for (const [n, id] of [failA, failB].entries()) {
  await run("INSERT INTO transactions (id, tenant_id, customer_id, occurred_at, total, channel) VALUES (?,?,?,?,?,?)", `txn-batch-${n}`, T, id, "2024-01-01", 100, "pos");
}
const before0 = await snapshot(subjectsOf(sn), snIds);
const failed = await confirmBatch(T, { key: sn.key, itemIds: snIds }, ACTOR);
ok(!failed.ok, `คู่ที่สามรวมไม่ได้ (มีข้อมูลยุคค้าปลีก) → ยืนยันชุดไม่สำเร็จ${failed.ok ? "" : ` (${failed.error})`}`);
ok((await snapshot(subjectsOf(sn), snIds)) === before0, "ข้อ 2: สองคู่แรกที่รวมได้ก็ไม่ถูกรวม — ไม่มีชุดค้างครึ่งทาง");
ok(Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM review_batches WHERE tenant_id = ? AND status = 'confirmed'", T))!.n) === 0 &&
  Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM merge_log WHERE tenant_id = ?", T))!.n) === 0, "ไม่มีแถวชุดหรือบันทึกการรวมหลงเหลือ");
await run("DELETE FROM transactions WHERE tenant_id = ? AND id LIKE 'txn-batch-%'", T);

// ── 2 · ยืนยันทั้งชุด → ย้อนทั้งชุดกดเดียว (รวม consents และข้อจำกัด) ──
const [p0, p1] = sn.pairs;
await run("UPDATE customers SET restriction_status = 'suppressed' WHERE tenant_id = ? AND id = ?", T, p0.b.id);
await run("INSERT INTO consents (customer_id, tenant_id, purpose, granted_at, revoked_at, source) VALUES (?,?,?,?,?,?)", p0.a.id, T, "b2b_newsletter", "2024-01-01T00:00:00.000Z", null, "verify");
await run("INSERT INTO consents (customer_id, tenant_id, purpose, granted_at, revoked_at, source) VALUES (?,?,?,?,?,?)", p0.b.id, T, "b2b_newsletter", "2024-02-01T00:00:00.000Z", "2024-05-01T00:00:00.000Z", "verify");
await run("INSERT INTO consents (customer_id, tenant_id, purpose, granted_at, revoked_at, source) VALUES (?,?,?,?,?,?)", p1.b.id, T, "events", "2024-03-01T00:00:00.000Z", null, "verify");
const before = await snapshot(subjectsOf(sn), snIds);
const done = await confirmBatch(T, { key: sn.key, itemIds: snIds }, ACTOR);
ok(done.ok && done.merged === 3, `ยืนยันทั้งชุด 3 คู่ในกดเดียว${done.ok ? "" : ` (${done.error})`}`);
const snBatch = done.ok ? done.batchId : "";
const snMerges = await mergesOf(`batch:${snBatch}`);
ok(snMerges.length === 3, "ทุกการรวมในชุดผูกกับกลุ่มเดียว (merge_group_id) — ย้อนได้ทั้งกลุ่ม");
const merged0 = await get<{ restriction_status: string }>("SELECT restriction_status FROM customers WHERE tenant_id = ? AND id IN (?, ?)", T, p0.a.id, p0.b.id);
ok(merged0?.restriction_status === "suppressed", "ระหว่างรวม: ข้อจำกัดที่เข้มกว่า (ห้ามติดต่อ) มีผลกับคนที่รวมแล้ว");
const consMerged = await all<{ revoked_at: string | null }>("SELECT revoked_at FROM consents WHERE tenant_id = ? AND customer_id IN (?, ?) AND purpose = 'b2b_newsletter'", T, p0.a.id, p0.b.id);
ok(consMerged.length === 1 && consMerged[0].revoked_at != null, "ระหว่างรวม: การถอนความยินยอมของฝั่งใดฝั่งหนึ่งชนะ");
ok(Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log WHERE tenant_id = ? AND action = 'batch_confirm'", T))!.n) === 1, "บันทึกตรวจสอบมีการยืนยันชุดหนึ่งรายการ");
ok((await proposeBatches(T)).every((b) => b.rule !== "same_name_org_title"), "คู่ที่รวมแล้วไม่ถูกเสนอซ้ำ");
const undone = await undoBatch(T, snBatch, ACTOR);
ok(undone.ok && undone.restored === 3, `ย้อนทั้งชุดในกดเดียว${undone.ok ? ` — ${undone.restored} คู่กลับเข้าคิว` : ` (${undone.error})`}`);
ok((await snapshot(subjectsOf(sn), snIds)) === before, "ข้อ 2: ย้อนชุด = ทุกคู่กลับเหมือนก่อนยืนยันทุกแถว (คน · ช่องทาง · consents · ข้อจำกัด · สังกัด · แถวต้นทาง · คิว)");
ok((await mergesOf(`batch:${snBatch}`)).every((m) => m.undone_at), "บันทึกการรวมทุกรายการในชุดถูกทำเครื่องหมายว่าแยกคืนแล้ว (ไม่ถูกลบ)");
ok(!(await undoBatch(T, snBatch, ACTOR)).ok, "ย้อนชุดซ้ำไม่ได้");
ok((await proposeBatches(T)).every((b) => b.rule !== "same_name_org_title"), "คู่จากชุดที่ย้อนแล้วอยู่ในคิวทีละคู่ — ไม่ถูกเสนอเป็นชุดซ้ำ");

// ── 5 · ชุด ≥ 20 คู่ สุ่ม 3 คู่ · เอาบางคู่ออกได้ ──
const xsIds = xs.pairs.map((p) => p.itemId);
const beforeXs = await snapshot(subjectsOf(xs), xsIds);
/* ส่งคู่สัญญาณอ่อนปนเข้ามาด้วย (ยิง action ตรง) — ต้องถูกทิ้ง ไม่ถูกรวม */
const forged = await confirmBatch(T, { key: xs.key, itemIds: [...xsIds, weakIds[0]!] }, ACTOR);
const xsBatchRes = forged.ok ? forged : null;
ok(xsBatchRes?.merged === 22 && xsBatchRes.dropped === 1, `ยืนยันชุดทับศัพท์ 22 คู่ · คู่นอกชุดที่ยิงเข้ามาตรง ๆ ถูกทิ้ง${forged.ok ? "" : ` (${forged.error})`}`);
ok((await get<{ status: string }>("SELECT status FROM review_items WHERE tenant_id = ? AND id = ?", T, weakIds[0]!))?.status === "open", "คู่สัญญาณอ่อนยังรอตรวจทีละคู่");
const xsBatch = xsBatchRes?.batchId ?? "";
ok(xsBatchRes?.sampled === 3, `ชุด ≥ 20 คู่ สุ่ม 3 คู่เข้าการสุ่มตรวจ — ${xsBatchRes?.sampled ?? 0}`);
const pend = await all<{ due_at: string; checked_by: string }>("SELECT due_at, checked_by FROM sample_checks WHERE tenant_id = ? AND batch_id = ? AND verdict = 'pending'", T, xsBatch);
ok(pend.length === 3 && pend.every((p) => Math.abs(Date.parse(p.due_at) - Date.now() - 7 * 864e5) < 60e3 && p.checked_by === "system:batch"), "สุ่มตรวจได้เมื่อครบ 7 วันหลังรวม · ระบบเป็นผู้สุ่ม");
const stats0 = await sampleStats(T);
ok(stats0.mergeChecked === 0, "รายการที่รอตรวจไม่ถูกนับเป็นผลความแม่น");
ok((await dueBatchSamples(T)).length === 0, "ยังไม่ครบ 7 วัน = ยังไม่ขึ้นให้ตรวจ");
const later = new Date(Date.now() + 8 * 864e5);
const due = await dueBatchSamples(T, later);
ok(due.length === 3 && due.every((d) => d.rows.length === 2 && d.rows.every((r) => !r.email || /•/.test(r.email))), "ครบ 7 วัน: ขึ้นให้ตรวจครบ 3 คน พร้อมแถวต้นทาง (อีเมลปิดบาง)");
ok(!(await recordBatchSample(T, due[0].id, "merge_ok", ACTOR)).ok, "ตรวจก่อนครบกำหนดไม่ได้");
const okRes = await recordBatchSample(T, due[0].id, "merge_ok", ACTOR, later);
ok(okRes.ok && !okRes.returned, "ผลถูก → ชุดยังอยู่");
ok((await sampleStats(T)).mergeChecked === 1, "ผลสุ่มตรวจของชุดนับในความแม่นที่วัดจริง");
const wrong = await recordBatchSample(T, due[1].id, "merge_wrong", ACTOR, later);
ok(wrong.ok && wrong.returned, "ข้อ 5: พบผิด 1 ใน 3 → ชุดถูกส่งกลับไปตรวจทีละคู่");
ok((await snapshot(subjectsOf(xs), xsIds)) === beforeXs, "ส่งกลับ = ย้อนทั้งชุด ทุกคู่กลับเหมือนก่อนยืนยัน");
const hist = await batchHistory(T);
ok(hist.find((h) => h.id === xsBatch)?.status === "returned" && hist.find((h) => h.id === snBatch)?.status === "undone", "ประวัติชุดแยก \"ย้อนเอง\" กับ \"ส่งกลับเพราะสุ่มตรวจพบผิด\"");
ok(Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM sample_checks WHERE tenant_id = ? AND batch_id = ? AND verdict = 'pending'", T, xsBatch))!.n) === 0, "รายการสุ่มที่ยังไม่ตรวจของชุดที่ส่งกลับถูกยกเลิก");
ok((await proposeBatches(T)).every((b) => b.rule !== "xscript_email_org"), "คู่จากชุดที่ส่งกลับไม่ถูกเสนอเป็นชุดซ้ำ");

// ── เอาบางคู่ออก + ยืนยันชุดที่ AI เสนอ ──
const aiNow = (await proposeBatches(T)).find((b) => b.aiAssisted);
ok(aiNow?.pairs.length === 2, "ชุดที่ AI เสนอกลับมาเมื่อ AI เปิดอีกครั้ง");
if (!aiNow) { for (const l of out) console.log(l); process.exit(1); }
const keep = aiNow.pairs[0].itemId, drop = aiNow.pairs[1].itemId;
const aiDone = await confirmBatch(T, { key: aiNow.key, itemIds: aiNow.pairs.map((p) => p.itemId), exclude: [drop] }, ACTOR);
ok(aiDone.ok && aiDone.merged === 1 && aiDone.excluded === 1, "เอาคู่ออกจากชุดได้ — รวมเฉพาะคู่ที่เหลือ");
const st2 = await all<{ id: string; status: string }>("SELECT id, status FROM review_items WHERE tenant_id = ? AND id IN (?, ?)", T, keep, drop);
ok(st2.find((s) => s.id === keep)?.status === "merged" && st2.find((s) => s.id === drop)?.status === "open", "คู่ที่เอาออกยังอยู่ในคิวให้ตรวจทีละคู่");
ok((await proposeBatches(T)).length === 0, "ไม่เหลือชุดที่เสนอ — ที่เหลือตรวจทีละคู่");
/* ข้อจำกัดที่บันทึกระหว่างรวม (ไม่รู้ว่าเป็นของใครในสองคน) → ย้อนชุดแล้วทั้งสองคนถือไว้ ไม่อ่อนลง */
const aiPair = aiNow.pairs[0];
const survivor = await get<{ survivor_id: string }>("SELECT survivor_id FROM merge_log WHERE tenant_id = ? AND rule = ?", T, `batch:${aiDone.ok ? aiDone.batchId : ""}`);
await run("UPDATE customers SET restriction_status = 'restricted' WHERE tenant_id = ? AND id = ?", T, survivor?.survivor_id ?? "");
const aiUndo = await undoBatch(T, aiDone.ok ? aiDone.batchId : "", ACTOR);
const both = await all<{ restriction_status: string }>("SELECT restriction_status FROM customers WHERE tenant_id = ? AND id IN (?, ?)", T, aiPair.a.id, aiPair.b.id);
ok(aiUndo.ok && both.length === 2 && both.every((x) => x.restriction_status === "restricted"), "ข้อจำกัดที่บันทึกระหว่างรวม → ย้อนชุดแล้วทั้งสองคนยังถือไว้ (ไม่อ่อนลง)");
setTestTransport(null);

// ── 6 · precision บนข้อมูลสมมุติพร้อมเฉลย ──
process.env.AI_DISABLED = "1"; // วัดเฉพาะกติกา — ข้อเสนอของ AI ต้องผ่านคนยืนยันอยู่แล้ว และไม่มีโมเดลจริงในชุดตรวจ
const c2 = (n: number) => (n * (n - 1)) / 2;
const TENANT: Record<Segment, string> = { events: "mst-golf", services: "brc-golf" };
for (const segment of ["events", "services"] as Segment[]) {
  const S = TENANT[segment];
  const syn = generateSynthetic({ segment });
  const s2 = await registerSource(S, {
    name: `ไฟล์สมมุติ ${segment}`, kind: "file", newPurpose: "ทดสอบความแม่น",
    acquisitionNote: "ข้อมูลสมมุติจากตัวสร้าง ไม่ใช่ข้อมูลของใคร",
    fields: ["customer_name", "first_name", "last_name", "company", "job_title", "email", "phone", "occurred_at"],
  }, "verify");
  if (!s2.ok) { ok(false, `[${segment}] ลงทะเบียนแหล่งไม่ได้: ${s2.error}`); continue; }
  const batchOf = new Map<string, string>();
  for (const f of syn.files) {
    const b = fileBytes(f);
    const an = await analyseUpload(S, s2.id, b, f.name, "verify");
    if (!an.ok) continue;
    const d = await commitUpload(S, s2.id, b, f.name, Object.fromEntries(an.columns.map((c) => [c.index, c.field])), an.sha256, "verify");
    if (d.ok) batchOf.set(d.batchId, f.name);
  }
  await resolveTenant(S, "verify");
  const truth = new Map(syn.truth.map((t) => [`${t.file}#${t.line + 1}`, t.personKey]));
  const measure = async () => {
    const rows = await all<{ batch_id: string; line: number | string; customer_id: string | null }>(
      `SELECT batch_id, line, customer_id FROM import_rows WHERE tenant_id = ? AND batch_id IN (${[...batchOf.keys()].map(() => "?").join(",")})`, S, ...batchOf.keys(),
    );
    const pred = new Map<string, number>(), both = new Map<string, number>(), real = new Map<string, number>();
    for (const r of rows) {
      const k = truth.get(`${batchOf.get(r.batch_id)}#${Number(r.line)}`);
      if (!k || !r.customer_id) continue;
      pred.set(r.customer_id, (pred.get(r.customer_id) ?? 0) + 1);
      real.set(k, (real.get(k) ?? 0) + 1);
      both.set(`${r.customer_id}|${k}`, (both.get(`${r.customer_id}|${k}`) ?? 0) + 1);
    }
    const sum = (m: Map<string, number>) => [...m.values()].reduce((a, n) => a + c2(n), 0);
    const tp = sum(both), pp = sum(pred), rp = sum(real);
    return { precision: pp ? tp / pp : 1, recall: rp ? tp / rp : 1 };
  };
  const base = await measure();
  const queue0 = Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM review_items WHERE tenant_id = ? AND kind = 'person_pair' AND status = 'open'", S))!.n);
  let confirmed = 0, rounds = 0;
  for (let b = (await proposeBatches(S))[0]; b && rounds < 10; b = (await proposeBatches(S))[0], rounds++) {
    const r = await confirmBatch(S, { key: b.key, itemIds: b.pairs.map((p) => p.itemId) }, ACTOR);
    if (!r.ok) { ok(false, `[${segment}] ยืนยันชุด ${b.rule} ไม่ได้: ${r.error}`); break; }
    confirmed += r.merged;
  }
  const after = await measure();
  const pct = (x: number) => `${(100 * x).toFixed(2)}%`;
  ok(confirmed > 0 && after.precision >= base.precision,
    `[${segment}] ข้อ 6: precision หลังยืนยันทุกชุด ${pct(after.precision)} ≥ กติกาเดิม ${pct(base.precision)} · recall ${pct(base.recall)} → ${pct(after.recall)} · ยืนยันเป็นชุด ${confirmed} จาก ${queue0} คู่ในคิว`);
}
delete process.env.AI_DISABLED;

for (const line of out) console.log(line);
const failedN = out.filter((l) => l.startsWith("FAIL"));
if (failedN.length) {
  console.log(`\n=== FAIL ${failedN.length} ข้อ ===`);
  process.exit(1);
}
console.log(`\n=== ผ่านทั้งหมด ${out.length} ข้อ ===`);
