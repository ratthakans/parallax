/* ── ดีลกับลูกค้าบุคคล (docs/crm-plan.md F3 · migration 0027) ─────────────
   ดีลไม่มีบริษัทได้ · ด่านคือระดับความลับของคนนั้น · ทุกทางที่แตะดีล (ย้ายขั้น · แก้ค่า · พยากรณ์ · ฟิลด์ · งาน · กิจกรรม
   · ต่อสัญญา · ถังขยะ · pivot) ทำงานกับดีลบุคคล · รวมคน = ดีลย้ายตาม · ลบคนตามคำขอสิทธิ = ดีลและประวัติของดีลหายไปด้วย
   ข้อมูลทั้งหมดเป็นชื่อสมมุติ */
import "./isolate.mts";
import { ensureReady } from "@/lib/engine/bootstrap";
import { all, get, run } from "@/lib/engine/sql";
import { createCustomer, deleteCustomer } from "@/lib/engine/customers";
import { createDeal, createRenewal, dealCandidates, dealsOfPerson, getDeal, listDeals, moveDeal, setDealPerson, updateDeal } from "@/lib/engine/deals";
import { setForecast } from "@/lib/engine/forecast";
import { createField, setValue } from "@/lib/engine/custom-fields";
import { createTask } from "@/lib/engine/tasks";
import { createOrg, logInteraction } from "@/lib/engine/accounts/edit";
import { trashDeal, restoreTrash } from "@/lib/engine/trash";
import { pivot } from "@/lib/engine/pivot";
import { mergePersons, unmerge } from "@/lib/engine/vault/merge";
import { MAX_PEOPLE, assignTarget, buildTargets, createCampaign, matchCriteria, recordOutcome } from "@/lib/engine/campaigns";
import { adoptTemplate } from "@/lib/engine/policy/templates";
import { affiliateManual } from "@/lib/engine/accounts/edit";
import { describeCriteria } from "@/lib/shared/policy";
import { recordPreference } from "@/lib/engine/policy/preferences";

const out: string[] = [];
const ok = (c: boolean, m: string) => out.push(`${c ? "PASS" : "FAIL"}  ${m}`);
await ensureReady();

const T = "hongmove";
const ME = { id: "owner@verify", clearance: "restricted_high" as const };
const LOW = { id: "intern@verify", clearance: "internal" as const };
const person = async (name: string, phone: string) => {
  const r = await createCustomer(T, { name, contacts: [{ kind: "phone", value: phone }], profile: {}, consent: false }, "verify");
  if (!r.ok) throw new Error(r.error);
  return r.id;
};
const A = await person("สมหญิง ทดสอบดีล", "081-777-0001");
const B = await person("สมศรี ทดสอบดีล", "081-777-0002");

// ── สร้างและเห็น ──
ok(!(await createDeal(T, { name: "ไม่มีคู่ค้า" }, ME)).ok, "ไม่มีทั้งบริษัทและคน = สร้างไม่ได้");
let threw = false;
try { await run("INSERT INTO opportunities (id, tenant_id, name, stage, created_at, updated_at) VALUES ('x-noparty', ?, 'x', 'open', 'now', 'now')", T); } catch { threw = true; }
ok(threw, "ฐานข้อมูลเองก็ไม่รับดีลที่ไม่มีคู่ค้า (opportunities_party)");
const d1 = await createDeal(T, { customerId: A, name: "แพ็กเกจรายเดือน 2026", value: "28,000", expectedClose: "2026-12-01" }, ME);
ok(d1.ok, "สร้างดีลกับลูกค้าบุคคลได้");
const D = d1.ok ? d1.id : "";
const row = (await listDeals(T, { view: "all" }, ME)).find((x) => x.id === D);
ok(row?.orgId === null && row.customerId === A && row.org === "สมหญิง ทดสอบดีล" && row.value === 28000, "รายการดีลแสดงชื่อลูกค้าแทนบริษัท");
ok((await listDeals(T, { view: "all", q: "สมหญิง" }, ME)).some((x) => x.id === D), "ค้นดีลด้วยชื่อลูกค้าได้");
const rec = await getDeal(T, D, ME);
ok(rec !== null && rec !== "masked" && rec.customerId === A, "เปิดหน้าดีลได้");

// ── ระดับความลับของคน ──
await run("UPDATE customers SET classification = 'restricted_high' WHERE tenant_id = ? AND id = ?", T, A);
ok(!(await listDeals(T, { view: "all" }, LOW)).some((x) => x.id === D) && (await getDeal(T, D, LOW)) === "masked", "คนเกินสิทธิ์: ดีลไม่ขึ้นและเปิดไม่ได้");
ok(!(await moveDeal(T, D, "qualified", LOW)).ok && !(await updateDeal(T, D, "value", "1", LOW)).ok, "คนเกินสิทธิ์: ย้ายขั้น/แก้ค่าไม่ได้");
ok(!(await createDeal(T, { customerId: A, name: "แอบสร้าง" }, LOW)).ok, "คนเกินสิทธิ์: สร้างดีลกับคนนี้ไม่ได้");
await run("UPDATE customers SET classification = 'confidential' WHERE tenant_id = ? AND id = ?", T, A);

// ── ทุกทางที่แตะดีล ──
ok((await moveDeal(T, D, "qualified", ME)).ok && (await updateDeal(T, D, "value", "30000", ME)).ok, "ย้ายขั้นและแก้มูลค่าได้");
ok((await setForecast(T, D, "commit", ME)).ok, "ตั้งหมวดพยากรณ์ได้");
const f = await createField(T, { entity: "deal", label: "ช่องทางที่รู้จัก", kind: "text" }, "verify");
ok(f.ok && (await setValue(T, "deal", D, f.id, "หน้าร้าน", ME)).ok, "กรอกฟิลด์ของดีลได้");
const cands = await dealCandidates(T, D, ME);
ok(cands.length === 1 && cands[0].id === A, "คนในดีล = ลูกค้าคนนั้นคนเดียว");
ok(!(await setDealPerson(T, D, B, "decision_maker", ME)).ok, "เพิ่มคนอื่นเข้าดีลบุคคลไม่ได้");
const task = await createTask(T, { title: "โทรยืนยันแพ็กเกจ", dealId: D }, ME);
ok(task.ok && (await get<{ customer_id: string; org_id: string | null }>("SELECT customer_id, org_id FROM tasks WHERE tenant_id = ? AND id = ?", T, task.ok ? task.id : ""))?.customer_id === A,
  "งานของดีลผูกกับลูกค้าคนนั้น");
ok(!(await createTask(T, { title: "ผิดคน", dealId: D, personId: B }, ME)).ok, "งานของดีลบุคคล ระบุคนอื่นไม่ได้");
const act = await logInteraction(T, null, { kind: "call", occurredAt: "2026-10-01", personId: A, opportunityId: D, summary: "โทรคุยเรื่องแพ็กเกจ (สมมุติ)" }, "verify");
ok(act.ok, "บันทึกกิจกรรมของดีลบุคคลได้ (ไม่มีบริษัท)");
ok(!(await logInteraction(T, null, { kind: "call", occurredAt: "2026-10-01", personId: B, opportunityId: D, summary: "ผิดดีล" }, "verify")).ok, "กิจกรรมของคนอื่นผูกดีลนี้ไม่ได้");
const mine = await dealsOfPerson(T, [A], ME);
ok(mine.some((x) => x.id === D && x.own), "หน้าคนเห็นดีลของตัวเอง");
const pv = await pivot(T, ME, { rows: "customer_type", measure: "count" });
ok(pv.rows.includes("ลูกค้าบุคคล"), "pivot แยกชนิดลูกค้าได้");
ok((await moveDeal(T, D, "won", ME)).ok, "ปิดได้");
const ren = await createRenewal(T, D, ME);
const renRow = ren.ok ? await get<{ customer_id: string; org_id: string | null }>("SELECT customer_id, org_id FROM opportunities WHERE tenant_id = ? AND id = ?", T, ren.id) : undefined;
ok(renRow?.customer_id === A && renRow.org_id === null, "ต่อสัญญาได้ ดีลใหม่เป็นของลูกค้าคนเดิม");

// ── ถังขยะ ──
const d2 = await createDeal(T, { customerId: A, name: "ดีลทิ้งแล้วกู้" }, ME);
const tr = d2.ok ? await trashDeal(T, d2.id, ME) : undefined;
ok(!!tr?.ok && !(await get("SELECT 1 AS x FROM opportunities WHERE tenant_id = ? AND id = ?", T, d2.ok ? d2.id : "")), "ทิ้งดีลบุคคลลงถังขยะได้");
const back = tr?.ok ? await restoreTrash(T, tr.trashId, ME) : undefined;
ok(!!back?.ok && !!(await get("SELECT 1 AS x FROM opportunities WHERE tenant_id = ? AND id = ? AND customer_id = ?", T, d2.ok ? d2.id : "", A)), "กู้คืนได้ ยังเป็นของคนเดิม");

// ── รวมคน ──
const d3 = await createDeal(T, { customerId: B, name: "ดีลของคนที่ถูกรวม" }, ME);
const m = await mergePersons(T, A, B, "verify", "ทดสอบ", null);
ok(m.ok && (await get<{ customer_id: string }>("SELECT customer_id FROM opportunities WHERE tenant_id = ? AND id = ?", T, d3.ok ? d3.id : ""))?.customer_id === A, "รวมคน = ดีลย้ายไปคนที่คงอยู่");
ok(m.ok && (await unmerge(T, m.mergeId, "verify")).ok
  && (await get<{ customer_id: string }>("SELECT customer_id FROM opportunities WHERE tenant_id = ? AND id = ?", T, d3.ok ? d3.id : ""))?.customer_id === B, "แยกคืน = ดีลกลับไปคนเดิม");

// ── F5 · แคมเปญถึงลูกค้าบุคคล ──
{
  const base = await matchCriteria(T, { audience: "person", minOrders: 2 });
  const ms = base.matches;
  ok(ms.length > 0 && ms.every((m) => m.orgId === null) && ms.every((m, i) => i === 0 || ms[i - 1].rank >= m.rank), "เกณฑ์ลูกค้าบุคคล: ไม่มีบริษัท · เรียงตามยอดซื้อ");
  const lapsed = (await matchCriteria(T, { audience: "person", lapsedForDays: 365 })).matches;
  const cutoff = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
  ok(lapsed.length > 0 && lapsed.every((m) => (m.reasons[0].match(/ล่าสุด (\d{4}-\d{2}-\d{2})/)?.[1] ?? "9999") <= cutoff), "หายไปนานกว่า N วัน = ซื้อล่าสุดก่อนวันตัด");
  const cat = (await matchCriteria(T, { audience: "person", boughtCategory: "limousine" })).matches;
  const catOk = await all<{ customer_id: string }>(
    `SELECT DISTINCT t.customer_id FROM transactions t JOIN line_items li ON li.txn_id = t.id JOIN products p ON p.id = li.product_id
     WHERE t.tenant_id = ? AND LOWER(p.category) LIKE '%limousine%'`, T);
  const catSet = new Set(catOk.map((r) => r.customer_id));
  ok(cat.length > 0 && cat.length === Math.min(catOk.length, MAX_PEOPLE) && cat.every((m) => catSet.has(m.customerId)), "เคยซื้อหมวดสินค้า = ตรงกับรายการซื้อจริง (เพดาน 500 คน)");
  const top = ms[0];
  await affiliateManual(T, top.customerId, { company: "บริษัท ลูกค้าย้ายเป็นบริษัท จำกัด", title: "ผู้จัดการ" }, "verify");
  ok(!(await matchCriteria(T, { audience: "person", minOrders: 2 })).matches.some((m) => m.customerId === top.customerId), "คนที่มีสังกัดบริษัทแล้ว ไม่อยู่ในกลุ่มลูกค้าบุคคล");
  const second = ms[1];
  await createDeal(T, { customerId: second.customerId, name: "ดีลเปิดอยู่ (สมมุติ)" }, ME);
  ok(!(await matchCriteria(T, { audience: "person", minOrders: 2, excludeOpenOpportunities: true })).matches.some((m) => m.customerId === second.customerId), "ไม่รวมลูกค้าที่มีดีลเปิด");
  ok(describeCriteria({ audience: "person", minSpent: 20000 })[0].startsWith("ลูกค้าบุคคล") && !describeCriteria({ audience: "person" }).some((x) => x.includes("ต่อบริษัท")), "คำอธิบายเกณฑ์เป็นภาษาลูกค้าบุคคล");
  ok((await matchCriteria(T, { titleKeywords: ["ผู้จัดการ"] })).matches.every((m) => m.orgId), "ค่าตั้งต้นยังเป็นคนในบริษัทเหมือนเดิม");

  /* แม่แบบที่ใช้กับลูกค้าบุคคลได้ = ฐานความยินยอม ไม่ผูกบริษัท · ยินยอมรายคนก่อน — คนที่ไม่ยินยอมต้องไม่ผ่าน */
  const purpose = await adoptTemplate(T, "b2b_marketing_consented", "มีหลักฐานความยินยอมรายคน (สมมุติ)", "verify");
  const consentFor = ms.slice(2, 5).map((m) => m.customerId);
  if (purpose.ok) for (const id of consentFor) {
    await recordPreference(T, id, { kind: "consent", purposeId: purpose.purposeId, channel: "phone", evidence: "ยินยอมรับข้อเสนอทางโทรศัพท์ที่หน้าร้าน (สมมุติ)" }, "verify");
  }
  const camp = purpose.ok ? await createCampaign(T, { name: "ชวนลูกค้าเดิมกลับมา (สมมุติ)", purposeId: purpose.purposeId, channel: "phone", messageKind: "marketing",
    criteria: { audience: "person", minOrders: 2 } }, "verify") : undefined;
  const built = camp?.ok ? await buildTargets(T, camp.id, "verify") : undefined;
  ok(!!built?.ok && built.people > 0 && built.orgs === 0 && built.eligible === consentFor.length, "สร้างรายชื่อเป้าหมายลูกค้าบุคคลได้ — ผ่านนโยบายเฉพาะคนที่ยินยอม (การซื้อนับเป็นหลักฐานว่าข้อมูลยังใหม่)");
  const tgt = camp?.ok ? await get<{ id: string; customer_id: string }>(
    "SELECT id, customer_id FROM campaign_targets WHERE tenant_id = ? AND campaign_id = ? AND eligibility = 'eligible' ORDER BY id LIMIT 1", T, camp.id) : undefined;
  if (tgt) {
    ok((await assignTarget(T, tgt.id, "owner@verify", "2026-12-01", "verify")).ok, "มอบหมายเป้าหมายลูกค้าบุคคลได้");
    const rec = await recordOutcome(T, tgt.id, { outcome: "proposal", note: "เสนอแพ็กเกจรายเดือน (สมมุติ)", value: 12000 }, "verify");
    const opp = await get<{ org_id: string | null; customer_id: string; value: number }>(
      "SELECT org_id, customer_id, value FROM opportunities WHERE tenant_id = ? AND campaign_id = ?", T, camp!.ok ? camp!.id : "");
    ok(rec.ok && opp?.org_id === null && opp.customer_id === tgt.customer_id && Number(opp.value) === 12000, "ส่งข้อเสนอ = เกิดดีลลูกค้าบุคคล");
    ok(!!(await get("SELECT 1 AS x FROM interactions WHERE tenant_id = ? AND customer_id = ? AND org_id IS NULL", T, tgt.customer_id)), "ผลการติดต่อเป็นกิจกรรมของลูกค้าคนนั้น");
  } else ok(false, "มีเป้าหมายที่นโยบายอนุญาตให้ติดต่อ");
}

// ── ลบตามคำขอสิทธิ ──
const org = await createOrg(T, { name: "บริษัท ทดสอบดีลบุคคล จำกัด" }, "verify");
const orgDeal = org.ok ? await createDeal(T, { orgId: org.id, name: "ดีลบริษัทที่คนนี้แค่อยู่ในดีล" }, ME) : undefined;
if (orgDeal?.ok) await run("INSERT INTO opportunity_people (tenant_id, opportunity_id, customer_id, role) VALUES (?,?,?,?)", T, orgDeal.id, A, "user");
const d4 = await createDeal(T, { customerId: A, name: "ดีลในถังขยะตอนลบคน" }, ME);
if (d4.ok) await trashDeal(T, d4.id, ME);
const orgTrash = org.ok ? await createDeal(T, { orgId: org.id, name: "ดีลบริษัทในถังขยะ" }, ME) : undefined;
if (orgTrash?.ok) { await run("INSERT INTO opportunity_people (tenant_id, opportunity_id, customer_id, role) VALUES (?,?,?,?)", T, orgTrash.id, A, "user"); await trashDeal(T, orgTrash.id, ME); }
const ownIds = (await all<{ id: string }>("SELECT id FROM opportunities WHERE tenant_id = ? AND customer_id = ? AND org_id IS NULL", T, A)).map((r) => r.id);
const del = await deleteCustomer(T, A, "verify", { reason: "request" });
ok(del.ok, "ลบคนตามคำขอสิทธิได้");
ok(!(await get("SELECT 1 AS x FROM opportunities WHERE tenant_id = ? AND customer_id = ?", T, A)), "ดีลของคนนั้นหายไปด้วย");
ok(ownIds.length >= 3 && Number((await get<{ n: number }>(`SELECT COUNT(*) AS n FROM record_versions WHERE tenant_id = ? AND record_kind = 'opportunity' AND record_id IN (${ownIds.map(() => "?").join(",")})`, T, ...ownIds))?.n) === 0,
  "ประวัติขั้นของดีลเหล่านั้นหายไปด้วย");
ok(!(await get("SELECT 1 AS x FROM custom_values WHERE tenant_id = ? AND entity = 'deal' AND record_id = ?", T, D)), "ค่าฟิลด์ของดีลหายไปด้วย");
ok(!(await get("SELECT 1 AS x FROM trash WHERE tenant_id = ? AND record_id = ?", T, d4.ok ? d4.id : "")), "ดีลของคนนั้นในถังขยะหายไปด้วย");
ok(!!orgDeal?.ok && !!(await get("SELECT 1 AS x FROM opportunities WHERE tenant_id = ? AND id = ?", T, orgDeal.id))
  && !!orgTrash?.ok && !!(await get("SELECT 1 AS x FROM trash WHERE tenant_id = ? AND record_id = ?", T, orgTrash.id)),
  "ดีลบริษัทที่เขาแค่อยู่ในดีลยังอยู่ (ทั้งที่ใช้งานและในถังขยะ)");
ok(task.ok && (await get<{ n: number }>("SELECT COUNT(*) AS n FROM tasks WHERE tenant_id = ? AND id = ?", T, task.id))?.n == 0, "งานของคนนั้นหายไปด้วย");

for (const line of out) console.log(line);
const failed = out.filter((l) => l.startsWith("FAIL"));
if (failed.length) { console.log(`\n=== FAIL ${failed.length} ข้อ ===`); process.exit(1); }
console.log(`\n=== ผ่านทั้งหมด ${out.length} ข้อ ===`);
