/* ── CRM C0 (docs/crm-plan.md) ─────────────────────────────────────────────
   ผูกผู้ติดต่อที่เพิ่มด้วยมือเข้าบริษัท (ใช้กุญแจเดียวกับการนำเข้า · ชื่อตรง · โดเมนตรง · สร้างใหม่)
   หาบริษัทจากชื่อ · ค้นหารวมเจอดีล · คนในทีมสำหรับมอบหมาย — ข้อมูลทั้งหมดเป็นชื่อสมมุติ */
import "./isolate.mts";
import { randomUUID } from "node:crypto";
import { ensureReady } from "@/lib/engine/bootstrap";
import { all, get, run } from "@/lib/engine/sql";
import { affiliateManual, orgByName } from "@/lib/engine/accounts/edit";
import { orgIdFor } from "@/lib/engine/vault/resolve";
import { orgInfo } from "@/lib/shared/identity";
import { createDeal, dealCandidates, dealsOfPerson, getDeal, removeDealPerson, setDealPerson } from "@/lib/engine/deals";
import { logInteraction } from "@/lib/engine/accounts/edit";
import { personB2B } from "@/lib/engine/accounts/person";
import { searchEverything } from "@/lib/engine/search";
import { teamMembers } from "@/lib/engine/team";

const out: string[] = [];
const ok = (c: boolean, m: string) => out.push(`${c ? "PASS" : "FAIL"}  ${m}`);
const T = "hongmove";
const ME = { id: "bd@verify", clearance: "confidential" as const };
await ensureReady();
const now = new Date().toISOString();
const person = async (name: string) => {
  const id = `c-${randomUUID().slice(0, 12)}`;
  await run("INSERT INTO customers (id, tenant_id, name, created_at) VALUES (?,?,?,?)", id, T, name, now);
  return id;
};
const affOf = (pid: string) => all<{ org_id: string; title: string | null; valid_to: string | null; confirmed_by: string | null }>(
  "SELECT org_id, title, valid_to, confirmed_by FROM affiliations WHERE tenant_id = ? AND customer_id = ?", T, pid);

// ── บริษัทใหม่ ──
const p1 = await person("สมหญิง ทดสอบ (สมมุติ)");
const r1 = await affiliateManual(T, p1, { company: "บริษัท เมฆขาว เทคโนโลยี จำกัด", title: "ผู้จัดการจัดซื้อ", email: "somying@mekkhao.example" }, ME.id);
const key = orgInfo("บริษัท เมฆขาว เทคโนโลยี จำกัด").key;
ok(r1.ok && r1.created && r1.orgId === orgIdFor(T, key), "บริษัทที่ยังไม่มี = สร้างใหม่ ด้วย id เดียวกับที่การนำเข้าไฟล์จะสร้าง");
const a1 = await affOf(p1);
ok(a1.length === 1 && a1[0].title === "ผู้จัดการจัดซื้อ" && a1[0].valid_to === null && a1[0].confirmed_by === ME.id, "สังกัดปัจจุบัน พร้อมตำแหน่ง และถือว่ายืนยันโดยผู้กรอก");
ok(Boolean(await get("SELECT 1 AS x FROM org_domains WHERE tenant_id = ? AND domain = ?", T, "mekkhao.example")), "โดเมนอีเมลบริษัทถูกผูกกับบริษัทใหม่");

// ── ชื่อเขียนต่างแต่กุญแจเดียวกัน (ตัด "บริษัท … จำกัด") = บริษัทเดิม ──
const p2 = await person("สมชาย ทดสอบ (สมมุติ)");
const r2 = await affiliateManual(T, p2, { company: "เมฆขาว เทคโนโลยี" }, ME.id);
ok(r2.ok && !r2.created && r1.ok && r2.orgId === r1.orgId, "ชื่อบริษัทแบบไม่มีคำนิติบุคคล = บริษัทเดิม ไม่สร้างซ้ำ");

// ── ชื่อไม่ตรง แต่โดเมนอีเมลบริษัทตรง = บริษัทของโดเมนนั้น ──
const p3 = await person("สมศรี ทดสอบ (สมมุติ)");
const r3 = await affiliateManual(T, p3, { company: "Mekkhao Tech", email: "somsri@mekkhao.example" }, ME.id);
ok(r3.ok && !r3.created && r1.ok && r3.orgId === r1.orgId, "ชื่อภาษาอังกฤษ + โดเมนบริษัทเดียวกัน = บริษัทเดิม");

// ── อีเมลฟรีไม่บอกบริษัท ──
const p4 = await person("สมปอง ทดสอบ (สมมุติ)");
const r4 = await affiliateManual(T, p4, { company: "Cloudwhite Trading", email: "sompong@gmail.com" }, ME.id);
ok(r4.ok && r4.created && r1.ok && r4.orgId !== r1.orgId, "อีเมลฟรีไม่ทำให้ไปผูกกับบริษัทอื่น");

ok(!(await affiliateManual(T, p4, { company: "   " }, ME.id)).ok, "ไม่ใส่ชื่อบริษัท = ไม่ผูก");
ok(!(await affiliateManual(T, "c-nobody", { company: "เมฆขาว" }, ME.id)).ok, "คนที่ไม่มีในบัญชี = ไม่ผูก");
ok(!(await affiliateManual("mst-golf", p1, { company: "เมฆขาว" }, ME.id)).ok, "ผูกคนข้ามบัญชีไม่ได้");

// ── เลือกบริษัทจากชื่อ (ช่องพิมพ์ค้นหา) ──
ok(r1.ok && (await orgByName(T, "บริษัท เมฆขาว เทคโนโลยี จำกัด")) === r1.orgId, "หาบริษัทจากชื่อที่เลือกในรายการได้");
ok((await orgByName(T, "บริษัทที่ไม่มีอยู่จริง (สมมุติ)")) === null && (await orgByName(T, "  ")) === null, "ชื่อที่ไม่มี = ไม่เดา");
ok(r1.ok && (await orgByName("mst-golf", "บริษัท เมฆขาว เทคโนโลยี จำกัด")) === null, "หาบริษัทจากชื่อข้ามบัญชีไม่ได้");

// ── ค้นหารวมเจอดีล ──
if (r1.ok) await createDeal(T, { orgId: r1.orgId, name: "แพ็กเกจแพลทินัม 2027 (สมมุติ)", value: "500000" }, ME);
const s = await searchEverything(T, "แพลทินัม", ME);
ok(s.deals.some((d) => d.name.includes("แพลทินัม") && d.value === 500000), "ค้นหารวมเจอดีลจากชื่อดีล");
ok((await searchEverything(T, "เมฆขาว", ME)).deals.length >= 1, "ค้นหารวมเจอดีลจากชื่อบริษัท");
ok((await searchEverything("mst-golf", "แพลทินัม", ME)).deals.length === 0, "ค้นหารวมไม่เห็นดีลของบัญชีอื่น");

// ── คนในทีม ──
const team = await teamMembers(T, "me@verify");
ok(team[0] === "me@verify" && team.includes(ME.id), "รายชื่อทีม = ตัวเอง + คนที่บัญชีนี้รู้จัก (เจ้าของดีล ฯลฯ)");
ok(!(await teamMembers("mst-golf", "me@verify")).includes(ME.id), "รายชื่อทีมไม่ข้ามบัญชี");

// ── C1 · คนในดีลพร้อมบทบาท ──
const deal = r1.ok ? await createDeal(T, { orgId: r1.orgId, name: "บูธ 36 ตร.ม. (สมมุติ)" }, ME) : null;
const dealId = deal && deal.ok ? deal.id : "";
const cands = await dealCandidates(T, dealId, ME);
ok(cands.some((c) => c.id === p1) && cands.some((c) => c.id === p2) && !cands.some((c) => c.id === p4), "ผู้ที่เลือกเข้าดีลได้ = คนในบริษัทของดีลเท่านั้น");
ok(!(await setDealPerson(T, dealId, p4, "decision_maker", ME)).ok, "เพิ่มคนนอกบริษัทเข้าดีลไม่ได้");
ok(!(await setDealPerson(T, dealId, p1, "boss", ME)).ok, "บทบาทที่ไม่รู้จัก = ไม่บันทึก");
ok((await setDealPerson(T, dealId, p1, "decision_maker", ME)).ok && (await setDealPerson(T, dealId, p2, "budget_approver", ME)).ok, "เพิ่มผู้ตัดสินใจและผู้อนุมัติงบได้");
await setDealPerson(T, dealId, p2, "champion", ME);
await setDealPerson(T, dealId, p2, "champion", ME);
const dd = await getDeal(T, dealId, ME);
ok(dd !== null && dd !== "masked" && dd.people.length === 2 && dd.people.find((p) => p.id === p2)?.role === "champion", "เปลี่ยนบทบาทได้ ไม่ซ้ำคน");
ok(dd !== null && dd !== "masked" && dd.history.filter((h) => h.field === "person").length === 3, "ทุกการเพิ่ม/เปลี่ยนมีประวัติ · ค่าเดิมซ้ำไม่เพิ่มประวัติ");
ok((await dealsOfPerson(T, [p1], ME)).some((x) => x.id === dealId && x.role === "decision_maker"), "หน้าผู้ติดต่อเห็นดีลที่ตัวเองอยู่พร้อมบทบาท");
ok((await removeDealPerson(T, dealId, p2, ME)).ok && !(await removeDealPerson(T, dealId, p2, ME)).ok, "เอาออกได้ · เอาออกซ้ำ = แจ้งว่าไม่ได้อยู่");
ok(!(await setDealPerson("mst-golf", dealId, p1, "user", ME)).ok, "แก้คนในดีลข้ามบัญชีไม่ได้");

// ── C1 · กิจกรรมเดียวขึ้นทุกที่ ──
const day = new Date().toISOString().slice(0, 10);
const li = r1.ok ? await logInteraction(T, r1.orgId, { kind: "meeting", occurredAt: day, personId: p1, opportunityId: dealId, summary: "นำเสนอบูธ (สมมุติ)" }, ME.id) : null;
ok(Boolean(li?.ok), "บันทึกกิจกรรมผูกคน + บริษัท + ดีลพร้อมกัน");
const dd2 = await getDeal(T, dealId, ME);
ok(dd2 !== null && dd2 !== "masked" && dd2.interactions.some((i) => i.summary === "นำเสนอบูธ (สมมุติ)"), "กิจกรรมขึ้นที่หน้าดีล");
ok((await personB2B(T, p1, ME)).interactions.some((i) => i.summary === "นำเสนอบูธ (สมมุติ)"), "กิจกรรมขึ้นที่หน้าผู้ติดต่อ");
const otherOrg = r4.ok ? r4.orgId : "";
ok(!(await logInteraction(T, otherOrg, { kind: "call", occurredAt: day, opportunityId: dealId, summary: "x" }, ME.id)).ok, "ผูกกิจกรรมกับดีลของบริษัทอื่นไม่ได้");

for (const line of out) console.log(line);
