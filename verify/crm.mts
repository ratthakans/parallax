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
import { setParent, updateOrgField } from "@/lib/engine/accounts/edit";
import { orgGroup } from "@/lib/engine/accounts/group";
import { registerSource } from "@/lib/engine/vault/sources";
import { commitUpload } from "@/lib/engine/vault/intake";
import { resolveTenant } from "@/lib/engine/vault/resolve";
import { normaliseTaxId, taxIdChecksum } from "@/lib/shared/tax-id";
import { createHash } from "node:crypto";
import { pipelineAsOf, stageTimelines, velocity } from "@/lib/engine/velocity";
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

// ── C2 · เลขนิติบุคคล ──
const tax = (first12: string) => first12 + String(taxIdChecksum(first12));
const TAX_A = tax("010555012345"), TAX_B = tax("010555099999");
ok(normaliseTaxId(TAX_A) === TAX_A && normaliseTaxId(`${TAX_A.slice(0, 1)}-${TAX_A.slice(1, 5)}-${TAX_A.slice(5)}`) === TAX_A, "เลขนิติบุคคลที่ถูกต้องผ่าน (มีขีดก็อ่านได้)");
const wrong = TAX_A.slice(0, 12) + String((Number(TAX_A[12]) + 1) % 10);
ok(normaliseTaxId(wrong) === null && normaliseTaxId("1101700203451") === null && normaliseTaxId("12345") === null, "เลขที่ checksum ผิด · เลขบุคคลธรรมดา · เลขสั้น = ไม่รับ");

// นำเข้าไฟล์: ชื่อสามแบบ เลขเดียวกัน = บริษัทเดียว · เลขต่าง = คนละบริษัท
const src = await registerSource(T, {
  name: "ไฟล์ทดสอบเลขนิติบุคคล (สมมุติ)", kind: "file", newPurpose: "ทดสอบ C2",
  acquisitionNote: "ข้อมูลสมมุติ", fields: ["customer_name", "company", "tax_id", "email"],
}, ME.id);
const importCsv = async (name: string, lines: string[]) => {
  const bytes = new TextEncoder().encode(["ชื่อ,บริษัท,เลขนิติบุคคล,อีเมล", ...lines].join("\n"));
  const done = src.ok ? await commitUpload(T, src.id, bytes, name, { 0: "customer_name", 1: "company", 2: "tax_id", 3: "email" },
    createHash("sha256").update(bytes).digest("hex"), ME.id) : null;
  await resolveTenant(T, ME.id);
  return done?.ok ?? false;
};
ok(await importCsv("tax1.csv", [
  `อนันต์ ทดสอบ,บริษัท ฟ้าใส พลังงาน จำกัด,${TAX_A},anan@fahsai.example`,
  `บุญมี ทดสอบ,"Fahsai Energy Co.,Ltd.",${TAX_A},boonmee@fahsai-energy.example`,
  `ชูใจ ทดสอบ,ฟ้าใส เอนเนอร์ยี่,${TAX_A},chujai@fahsai.example`,
  `มานะ ทดสอบ,บริษัท ฟ้าใส พลังงาน จำกัด,${TAX_B},mana@other.example`,
]), "นำเข้าไฟล์ที่มีคอลัมน์เลขนิติบุคคลได้");
const taxOrgs = await all<{ id: string; tax_id: string | null }>("SELECT id, tax_id FROM orgs WHERE tenant_id = ? AND tax_id IN (?, ?)", T, TAX_A, TAX_B);
ok(taxOrgs.filter((o) => o.tax_id === TAX_A).length === 1, "ชื่อเขียนสามแบบแต่เลขเดียวกัน = บริษัทเดียว");
const orgA = taxOrgs.find((o) => o.tax_id === TAX_A)?.id ?? "";
const atA = await all<{ name: string }>("SELECT c.name FROM affiliations a JOIN customers c ON c.id = a.customer_id AND c.tenant_id = a.tenant_id WHERE a.tenant_id = ? AND a.org_id = ?", T, orgA);
ok(["อนันต์ ทดสอบ", "บุญมี ทดสอบ", "ชูใจ ทดสอบ"].every((n) => atA.some((x) => x.name === n)) && !atA.some((x) => x.name === "มานะ ทดสอบ"), "ทั้งสามคนสังกัดบริษัทเดียวกัน · คนที่เลขต่างไม่ปน");
ok(await importCsv("tax2.csv", [`ปิติ ทดสอบ,FAHSAI GROUP,${TAX_A},piti@fahsai.example`]), "นำเข้าไฟล์ที่สอง");
const piti = await get<{ org_id: string }>("SELECT a.org_id FROM affiliations a JOIN customers c ON c.id = a.customer_id AND c.tenant_id = a.tenant_id WHERE a.tenant_id = ? AND c.name = ?", T, "ปิติ ทดสอบ");
ok(piti?.org_id === orgA, "ไฟล์ทีหลังที่เลขตรงกับบริษัทเดิม = เข้าบริษัทเดิม แม้ชื่อต่าง");

// แก้เลขด้วยมือ
const r5 = await affiliateManual(T, await person("วีระ ทดสอบ (สมมุติ)"), { company: "บริษัท ทดสอบเลขซ้ำ จำกัด" }, ME.id);
const orgX = r5.ok ? r5.orgId : "";
ok(!(await updateOrgField(T, orgX, "tax_id", wrong, "จากหนังสือรับรอง", ME.id)).ok, "แก้เลขที่ checksum ผิด = ไม่บันทึก");
const twin = await updateOrgField(T, orgX, "tax_id", TAX_A, "จากหนังสือรับรอง", ME.id);
ok(!twin.ok && twin.error.includes("รวม"), "เลขที่เป็นของบริษัทอื่นแล้ว = ไม่บันทึก และบอกให้รวมแฟ้ม");
const t3 = tax("010555077777");
ok((await updateOrgField(T, orgX, "tax_id", `${t3.slice(0, 1)} ${t3.slice(1)}`, "จากหนังสือรับรอง", ME.id)).ok
  && (await get<{ tax_id: string }>("SELECT tax_id FROM orgs WHERE tenant_id = ? AND id = ?", T, orgX))?.tax_id === t3, "เลขที่ถูกต้องบันทึกแบบตัวเลขล้วน");

// ── C2 · กลุ่มบริษัทในเครือ ──
const parent = r1.ok ? r1.orgId : "";
await setParent(T, orgA, parent, "บริษัทลูกตามรายงานประจำปี (สมมุติ)", ME.id);
await setParent(T, orgX, orgA, "บริษัทหลานตามรายงานประจำปี (สมมุติ)", ME.id);
const g = await orgGroup(T, orgX, ME);
ok(g !== null && g.rootId === parent && g.members.length === 3 && g.members.find((m) => m.id === orgX)?.depth === 2, "กลุ่มรวมจากบนสุดลงล่าง (แม่ · ลูก · หลาน) ไม่ว่าจะเปิดจากบริษัทไหน");
ok(g !== null && g.totals.current >= 5 && g.totals.openDeals >= 2, "ยอดรวมทั้งกลุ่ม: คนปัจจุบันและดีลเปิด");
ok(!(await setParent(T, parent, orgX, "ทดสอบวง", ME.id)).ok, "ตั้งบริษัทแม่จนเป็นวงไม่ได้");
ok((await orgGroup("mst-golf", orgX, ME)) === null, "ดูกลุ่มข้ามบัญชีไม่ได้");

// ── C3 · มิติเวลา ── บัญชีแยก (tenant ใหม่ไม่มีดีลอื่นปน) · เวลาในประวัติกำหนดเอง
const V = "brc-golf"; // บัญชีค้าปลีกที่ไม่มีดีล — ตัวเลขจึงมาจากสามดีลข้างล่างเท่านั้น
const at = (d: string) => `${d}T03:00:00.000Z`;
const vOrg = `o-${randomUUID().slice(0, 8)}`;
await run("INSERT INTO orgs (id, tenant_id, name, name_norm, classification, lifecycle_state, recorded_at, created_at) VALUES (?,?,?,?,?,?,?,?)",
  vOrg, V, "บริษัท เวลาทดสอบ จำกัด (สมมุติ)", "เวลาทดสอบ", "confidential", "confirmed", now, now);
const mkDeal = async (name: string, created: string, value: number, moves: [string, string | null, string][]) => {
  const id = randomUUID();
  const final = moves.at(-1)?.[2] ?? "open";
  await run("INSERT INTO opportunities (id, tenant_id, org_id, name, stage, owner_id, value, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
    id, V, vOrg, name, final, ME.id, value, at(created), at(created));
  for (const [day, from, to] of moves) {
    await run("INSERT INTO record_versions (tenant_id, record_kind, record_id, field, old_value, new_value, reason, changed_by, valid_from, recorded_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
      V, "opportunity", id, "stage", from, to, "ทดสอบ", ME.id, null, at(day));
  }
  return id;
};
// ก: สร้าง 1 ม.ค. → เสนอราคา 11 ม.ค. (อยู่ "เริ่มคุย" 10 วัน) → ปิดได้ 31 ม.ค.
const dA = await mkDeal("ก (สมมุติ)", "2026-01-01", 100000, [["2026-01-01", null, "open"], ["2026-01-11", "open", "proposal"], ["2026-01-31", "proposal", "won"]]);
// ข: สร้าง 1 ม.ค. → ยืนยัน 21 ม.ค. (20 วัน) → ไม่ได้ 1 ก.พ.
await mkDeal("ข (สมมุติ)", "2026-01-01", 50000, [["2026-01-01", null, "open"], ["2026-01-21", "open", "qualified"], ["2026-02-01", "qualified", "lost"]]);
// ค: ดีลจากแคมเปญ (ไม่มีรุ่นตอนสร้าง) เสนอราคา 1 ม.ค. → ต่อรอง 1 มี.ค. และค้างอยู่
await mkDeal("ค (สมมุติ)", "2026-01-01", 200000, [["2026-03-01", "proposal", "negotiation"]]);
const tlA = (await stageTimelines(V, [{ id: dA, stage: "won", createdAt: at("2026-01-01") }])).get(dA)!;
ok(tlA.map((s) => s.stage).join(">") === "open>proposal>won", "ลำดับขั้นของดีลอ่านจากประวัติได้ครบ");
const vel = await velocity(V, ME, new Date("2026-10-16T00:00:00Z"));
const st = (s: string) => vel.stages.find((x) => x.stage === s)!;
ok(st("open").avgDays === 15 && st("open").reached === 3, "อยู่ขั้นเริ่มคุยเฉลี่ย 15 วัน (10 และ 20) · ค ที่เริ่มกลางทางนับว่าผ่านขั้นนี้");
ok(st("qualified").reached === 3 && st("qualified").advanced === 2, "ข้ามขั้นนับว่าผ่าน: ก กับ ค ผ่าน 'ยืนยัน' · ข ไปไม่ถึงขั้นถัดไป");
ok(st("proposal").avgDays === 39.5 && st("negotiation").stuck === 1, "อยู่ขั้นเสนอราคาเฉลี่ย 39.5 วัน (20 และ 59) · ต่อรองค้างเกิน 30 วัน 1 ดีล");
ok(vel.won === 1 && vel.lost === 1 && vel.winRate === 0.5 && vel.avgCycleDays === 30, "อัตราปิดได้ 50% · รอบขายเฉลี่ย 30 วัน");
const p15 = await pipelineAsOf(V, ME, "2026-01-15");
ok(p15.find((x) => x.stage === "open")?.count === 1 && p15.find((x) => x.stage === "proposal")?.count === 2, "ณ 15 ม.ค.: ข ยังเริ่มคุย · ก กับ ค อยู่เสนอราคา");
const pFeb = await pipelineAsOf(V, ME, "2026-02-15");
ok(pFeb.reduce((t, x) => t + x.count, 0) === 1 && pFeb.find((x) => x.stage === "proposal")?.value === 200000, "ณ 15 ก.พ.: ดีลที่ปิดแล้วไม่อยู่ในไปป์ไลน์");
await run("INSERT INTO record_versions (tenant_id, record_kind, record_id, field, old_value, new_value, reason, changed_by, valid_from, recorded_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
  V, "opportunity", dA, "value", "80000", "100000", "ทดสอบ", ME.id, null, at("2026-01-20"));
ok((await pipelineAsOf(V, ME, "2026-01-15")).find((x) => x.stage === "proposal")?.value === 280000, "มูลค่า ณ วันนั้นใช้ค่าก่อนแก้ (80,000 ไม่ใช่ 100,000)");

for (const line of out) console.log(line);
