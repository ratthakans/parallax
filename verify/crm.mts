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
import { archiveField, createField, listFields, setValue, valueHistory, valuesFor } from "@/lib/engine/custom-fields";
import { addItem, listItems, packageReport, removeItem } from "@/lib/engine/deal-items";
import { editionRetention, orgEditions } from "@/lib/engine/editions";
import { mergeOrgs } from "@/lib/engine/vault/merge";
import { wipeCustomerData } from "@/lib/engine/tenant-data";
import { tx } from "@/lib/engine/sql";
import { listAccounts, type AccountFilters } from "@/lib/engine/accounts";
import { listDeals as listDealsC5, type DealFilters } from "@/lib/engine/deals";
import { cleanQuery, deleteView, listViews, saveView } from "@/lib/engine/saved-views";
import { pivot } from "@/lib/engine/pivot";
import { createTeam, forecastReport, listTeams, nearbyQuarters, setForecast, setOrgTeam, setQuota, setTeamMember } from "@/lib/engine/forecast";
import { effectiveForecast, quarterOf, quarterRange } from "@/lib/shared/deals";
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

// ── C4 · ฟิลด์กำหนดเอง ──
ok(!(await createField(T, { entity: "person", label: "ศาสนา", kind: "text" }, ME.id)).ok, "ฟิลด์บนตัวคนสร้างไม่ได้ (ข้อมูลส่วนบุคคลต้องผ่านวัตถุประสงค์)");
ok(!(await createField(T, { entity: "org", label: "Tier", kind: "choice", options: "Gold" }, ME.id)).ok, "ตัวเลือกน้อยกว่า 2 ข้อ = ไม่สร้าง");
const fTier = await createField(T, { entity: "org", label: "Tier สปอนเซอร์", kind: "choice", options: "Platinum, Gold, Silver" }, ME.id);
const fBooth = await createField(T, { entity: "org", label: "ขนาดบูธ (ตร.ม.)", kind: "number" }, ME.id);
const fDue = await createField(T, { entity: "deal", label: "วันส่งสัญญา", kind: "date" }, ME.id);
ok(fTier.ok && fBooth.ok && fDue.ok, "สร้างฟิลด์ตัวเลือก · ตัวเลข · วันที่ได้");
ok(!(await createField(T, { entity: "org", label: "Tier สปอนเซอร์", kind: "text" }, ME.id)).ok, "ชื่อฟิลด์ซ้ำบนที่เดียวกัน = ไม่สร้าง");
const tierId = fTier.ok ? fTier.id : "", boothId = fBooth.ok ? fBooth.id : "", dueId = fDue.ok ? fDue.id : "";
ok(!(await setValue(T, "org", orgA, tierId, "Bronze", ME)).ok, "ค่าที่ไม่อยู่ในตัวเลือก = ไม่บันทึก");
ok(!(await setValue(T, "org", orgA, boothId, "ใหญ่มาก", ME)).ok, "ตัวเลขที่ไม่ใช่ตัวเลข = ไม่บันทึก");
await setValue(T, "org", orgA, tierId, "Silver", ME);
await setValue(T, "org", orgA, tierId, "Gold", ME);
await setValue(T, "org", orgA, tierId, "Gold", ME);
await setValue(T, "org", orgA, boothId, "36", ME);
ok((await valuesFor(T, "org", [orgA])).get(orgA)?.get(tierId) === "Gold", "ค่าปัจจุบัน = ค่าล่าสุด");
ok((await valueHistory(T, "org", orgA)).filter((h) => h.fieldId === tierId).length === 2, "ทุกการเปลี่ยนเก็บประวัติ · ค่าเดิมซ้ำไม่เพิ่มแถว");
await setValue(T, "org", orgA, boothId, "", ME);
ok(!(await valuesFor(T, "org", [orgA])).get(orgA)?.has(boothId), "ลบค่า (เว้นว่าง) ได้ และยังมีประวัติ");
ok((await setValue(T, "deal", dealId, dueId, "2027-01-15", ME)).ok && !(await setValue(T, "deal", dealId, dueId, "15/1/2027", ME)).ok, "ฟิลด์วันที่รับเฉพาะวันที่");
ok(!(await setValue(T, "org", orgA, dueId, "2027-01-15", ME)).ok, "ใช้ฟิลด์ของดีลบนบริษัทไม่ได้");
ok(!(await setValue("mst-golf", "org", orgA, tierId, "Gold", ME)).ok, "กรอกค่าข้ามบัญชีไม่ได้");
await archiveField(T, boothId, true, ME.id);
ok(!(await listFields(T, "org")).some((f) => f.id === boothId) && (await listFields(T, "org", true)).some((f) => f.id === boothId), "ซ่อนฟิลด์แล้วไม่ขึ้นในหน้าระเบียน แต่ยังอยู่ในหน้าตั้งค่า");
ok(!(await setValue(T, "org", orgA, boothId, "18", ME)).ok, "ฟิลด์ที่ซ่อนกรอกค่าไม่ได้");
// รวมบริษัท: ค่าย้ายตาม
const dupOrg = await affiliateManual(T, await person("ทดสอบรวม (สมมุติ)"), { company: "บริษัท ฟ้าใสสำรอง จำกัด" }, ME.id);
const dupId = dupOrg.ok ? dupOrg.orgId : "";
await setValue(T, "org", dupId, tierId, "Platinum", ME);
const mg = await mergeOrgs(T, dupId, orgX, ME.id);
ok(mg.ok && (await valuesFor(T, "org", [dupId])).get(dupId)?.get(tierId) === "Platinum", "รวมบริษัทแล้วค่าฟิลด์ยังอยู่กับบริษัทที่คงอยู่");

// ── C4 · แพ็กเกจในดีล ──
ok(!(await addItem(T, dealId, { package: "G", qty: "1" }, ME)).ok && !(await addItem(T, dealId, { package: "Gold", qty: "0" }, ME)).ok, "ชื่อสั้นเกิน · จำนวน 0 = ไม่เพิ่ม");
await addItem(T, dealId, { package: "Gold", qty: "1", unitPrice: "350,000" }, ME);
await addItem(T, dealId, { package: "บูธ 18 ตร.ม.", qty: "2", unitPrice: "45000" }, ME);
const items = await listItems(T, dealId);
ok(items.length === 2 && items.reduce((t, i) => t + (i.total ?? 0), 0) === 440000, "ยอดรวมแพ็กเกจ = จำนวน × ราคา");
ok(!(await addItem("mst-golf", dealId, { package: "Gold" }, ME)).ok, "เพิ่มแพ็กเกจข้ามบัญชีไม่ได้");
const rep0 = await packageReport(T, ME);
ok(rep0.find((p) => p.package === "Gold")?.openValue === 350000 && rep0.find((p) => p.package === "Gold")?.wonDeals === 0, "รายงานแพ็กเกจ: ดีลเปิดนับเป็นยอดเปิด");
const { moveDeal } = await import("@/lib/engine/deals");
await moveDeal(T, dealId, "won", ME);
ok((await packageReport(T, ME)).find((p) => p.package === "Gold")?.wonValue === 350000, "ปิดได้แล้วนับเป็นยอดที่ปิดได้");
ok((await removeItem(T, dealId, items[1].id, ME)).ok && (await listItems(T, dealId)).length === 1, "เอาแพ็กเกจออกได้");

// ── C4 · งาน/ปี ──
const part = (org: string, ed: string, role = "สปอนเซอร์") => run(
  "INSERT INTO participations (id, tenant_id, customer_id, org_id, program, edition, role, occurred_at, source_id, recorded_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
  `pt-${randomUUID().slice(0, 12)}`, T, p1, org, "งานทดสอบ C4 (สมมุติ)", ed, role, null, null, now);
const o1 = parent, o2 = orgA, o3 = dupId;
await part(o1, "2024"); await part(o2, "2024");
await part(o1, "2025"); await part(o3, "2025");
await part(o3, "2026"); await part(o2, "2026", "ผู้ออกบูธ");
const ret = (await editionRetention(T, ME)).find((p) => p.program === "งานทดสอบ C4 (สมมุติ)")!;
const e = (x: string) => ret.rows.find((r) => r.edition === x)!;
ok(e("2024").orgs === 2 && e("2025").returning === 1 && e("2025").fresh === 1 && e("2025").lapsed === 1, "2025: กลับมา 1 · ใหม่ 1 · หลุด 1");
ok(e("2026").returning === 1 && e("2026").fresh === 1 && e("2026").lapsed === 1, "2026: บริษัทที่หลุดปีก่อนแล้วกลับมา = นับเป็นใหม่เทียบกับปีก่อน");
const sp = (await editionRetention(T, ME, "สปอนเซอร์")).find((p) => p.program === "งานทดสอบ C4 (สมมุติ)")!;
ok(sp.rows.find((r) => r.edition === "2026")?.orgs === 1, "กรองตามบทบาท (สปอนเซอร์) ได้");
ok((await orgEditions(T, o2)).find((p) => p.program === "งานทดสอบ C4 (สมมุติ)")?.editions.map((x) => x.edition).join(",") === "2024,2026", "หน้าบริษัทเห็นว่ามาปีไหนบ้าง");

// ── C4 · ล้างบัญชีล้างฟิลด์และแพ็กเกจ แต่คงนิยามฟิลด์ ──
await tx((q) => wipeCustomerData(q, T));
const leftV = await get<{ n: number | string }>("SELECT COUNT(*) AS n FROM custom_values WHERE tenant_id = ?", T);
const leftI = await get<{ n: number | string }>("SELECT COUNT(*) AS n FROM deal_items WHERE tenant_id = ?", T);
ok(Number(leftV?.n) === 0 && Number(leftI?.n) === 0 && (await listFields(T, undefined, true)).length === 3, "ล้างข้อมูลลูกค้า = ล้างค่าฟิลด์และแพ็กเกจ · นิยามฟิลด์ (การตั้งค่า) อยู่ต่อ");

// ── C5 · ตัวกรอง · มุมมองที่บันทึก · รายงานเลือกมิติ ── บัญชี V (มีสามดีลของ C3 อยู่แล้ว)
const mkOrg = async (name: string, industry: string | null, owner: string | null, tax: string | null = null, parentId: string | null = null) => {
  const id = `o-${randomUUID().slice(0, 8)}`;
  await run("INSERT INTO orgs (id, tenant_id, name, name_norm, industry, account_owner_id, tax_id, parent_id, classification, lifecycle_state, recorded_at, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
    id, V, name, name, industry, owner, tax, parentId, "confidential", "confirmed", now, now);
  return id;
};
const oE = await mkOrg("บริษัท พลังงานตะวันออก จำกัด (สมมุติ)", "พลังงาน", ME.id, TAX_B);
const oF = await mkOrg("บริษัท อาหารเหนือ จำกัด (สมมุติ)", "อาหาร", null, null, oE);
const oG = await mkOrg("บริษัท พลังงานใต้ จำกัด (สมมุติ)", "พลังงาน", null);
const vTier = await createField(V, { entity: "org", label: "Tier", kind: "choice", options: "Gold, Silver" }, ME.id);
const vTierId = vTier.ok ? vTier.id : "";
await setValue(V, "org", oE, vTierId, "Silver", ME);
await setValue(V, "org", oE, vTierId, "Gold", ME);
await setValue(V, "org", oG, vTierId, "Silver", ME);
const names = async (filters: AccountFilters) =>
  (await listAccounts(V, { viewer: ME, filters, limit: 100 })).rows.map((r) => r.id);
ok((await names({ industry: "พลังงาน" })).sort().join() === [oE, oG].sort().join(), "กรองตามอุตสาหกรรม");
ok((await names({ owner: "-", industry: "พลังงาน" })).join() === oG, "กรองบริษัทที่ยังไม่มีเจ้าของ");
ok((await names({ custom: [{ fieldId: vTierId, value: "Gold" }] })).join() === oE, "กรองตามฟิลด์ของบัญชี ใช้ค่าล่าสุด (เคยเป็น Silver)");
ok((await names({ group: "in" })).sort().join() === [oE, oF].sort().join() && (await names({ taxId: "has" })).join() === oE, "กรองบริษัทในเครือ · มีเลขนิติบุคคล");
ok((await listAccounts(V, { viewer: ME, filters: { industry: "พลังงาน" } })).total === 2, "ตัวนับตรงกับตัวกรอง");

const mk = async (org: string, name: string, value: number, close: string | null, owner = ME.id) => {
  const r = await createDeal(V, { orgId: org, name, value: String(value), expectedClose: close }, { id: owner, clearance: "confidential" });
  return r.ok ? r.id : "";
};
const d1 = await mk(oE, "ดีลพลังงาน 1 (สมมุติ)", 500000, "2026-11-30");
const d2 = await mk(oG, "ดีลพลังงาน 2 (สมมุติ)", 120000, "2027-02-15", "nok@verify");
const d3 = await mk(oF, "ดีลอาหาร (สมมุติ)", 80000, null);
await addItem(V, d1, { package: "Gold", qty: "1", unitPrice: "400000" }, ME);
await addItem(V, d1, { package: "บูธ", qty: "2", unitPrice: "50000" }, ME);
await addItem(V, d2, { package: "Gold", qty: "1", unitPrice: "120000" }, ME);
const dDue = await createField(V, { entity: "deal", label: "แหล่งที่มา", kind: "choice", options: "งานแสดงสินค้า, แนะนำ" }, ME.id);
const dDueId = dDue.ok ? dDue.id : "";
await setValue(V, "deal", d2, dDueId, "แนะนำ", ME);
const dn = async (filters: DealFilters) => (await listDealsC5(V, { view: "all", filters }, ME)).map((d) => d.id).sort().join();
ok((await dn({ owner: "nok@verify" })) === d2, "กรองดีลตามเจ้าของ");
ok((await dn({ minValue: 100000, package: "Gold" })) === [d1, d2].sort().join(), "กรองมูลค่าขั้นต่ำ + แพ็กเกจ");
ok((await dn({ closeFrom: "2026-11-01", closeTo: "2026-12-31" })) === d1, "กรองช่วงปิดคาด (ดีลไม่มีวันปิดไม่ติดมา)");
ok((await dn({ custom: [{ fieldId: dDueId, value: "แนะนำ" }] })) === d2, "กรองตามฟิลด์ของดีล");

ok(cleanQuery("?q=สมชาย&industry=พลังงาน&evil=1&cf.abc=Gold") === "industry=%E0%B8%9E%E0%B8%A5%E0%B8%B1%E0%B8%87%E0%B8%87%E0%B8%B2%E0%B8%99&cf.abc=Gold", "มุมมองที่บันทึกไม่เก็บคำค้น (อาจเป็นชื่อคน) และคีย์ที่ไม่รู้จัก");
const sv = await saveView(V, { list: "accounts", name: "พลังงาน", query: "industry=พลังงาน", shared: false }, ME.id);
const svShared = await saveView(V, { list: "deals", name: "Gold ทั้งทีม", query: "package=Gold", shared: true }, ME.id);
ok(sv.ok && svShared.ok && !(await saveView(V, { list: "accounts", name: "ว่าง", query: "q=x", shared: false }, ME.id)).ok, "บันทึกมุมมองได้ · query ว่างหลังทำความสะอาด = ไม่บันทึก");
ok((await listViews(V, "accounts", ME.id)).length === 1 && (await listViews(V, "accounts", "nok@verify")).length === 0, "มุมมองส่วนตัวเห็นเฉพาะเจ้าของ");
ok((await listViews(V, "deals", "nok@verify")).some((x) => x.name === "Gold ทั้งทีม" && !x.mine), "มุมมองที่แชร์ทุกคนในบัญชีเห็น");
ok(svShared.ok && !(await deleteView(V, svShared.id, "nok@verify")).ok && (await deleteView(V, svShared.id, ME.id)).ok, "ลบได้เฉพาะเจ้าของมุมมอง");
ok((await listViews("mst-golf", "accounts", ME.id)).length === 0, "มุมมองไม่ข้ามบัญชี");

const pv = await pivot(V, ME, { rows: "industry", measure: "value", view: "open" });
ok(pv.rowTotals.get("พลังงาน") === 620000 && pv.rowTotals.get("อาหาร") === 80000, "รายงานเลือกมิติ: มูลค่าดีลเปิดตามอุตสาหกรรม");
const pc = await pivot(V, ME, { rows: "industry", cols: "owner", measure: "count", view: "open" });
ok(pc.cells.get(`พลังงาน\u0000${ME.id}`) === 1 && pc.cells.get("พลังงาน\u0000nok@verify") === 1, "แถว × คอลัมน์: จำนวนดีลตามอุตสาหกรรม × เจ้าของ");
const pp = await pivot(V, ME, { rows: "package", measure: "value", view: "open" });
ok(pp.rowTotals.get("Gold") === 520000 && pp.rowTotals.get("บูธ") === 100000, "มิติแพ็กเกจใช้ยอดของแพ็กเกจ ไม่ใช่มูลค่าดีลทั้งก้อน");
const pg = await pivot(V, ME, { rows: "group", measure: "count", view: "open" });
ok(pg.rowTotals.get("บริษัท พลังงานตะวันออก จำกัด (สมมุติ)") === 2, "มิติกลุ่มบริษัท: บริษัทลูกนับรวมใต้บริษัทบนสุด");
const pf = await pivot(V, ME, { rows: `cf.${vTierId}`, measure: "count", view: "open" });
ok(pf.rowTotals.get("Gold") === 1 && pf.rowTotals.get("Silver") === 1 && pf.rowTotals.get("— ไม่ระบุ —") === 2, "มิติฟิลด์ของบัญชี (ไม่ได้กรอก = ไม่ระบุ · ดีล ค ของ C3 กับดีลอาหาร)");
ok((await pivot("mst-golf", ME, { rows: "stage", measure: "count" })).deals === 0, "รายงานไม่ข้ามบัญชี");

// ── C6 · พยากรณ์ · เป้า · ทีม ── บัญชี V
ok(quarterOf("2026-03-31T18:00:00Z") === "2026-Q2" && quarterOf("2026-03-31T16:00:00Z") === "2026-Q1", "ไตรมาสนับตามเวลาไทย (31 มี.ค. ตีหนึ่งเวลาไทย = Q2)");
ok(quarterRange("2026-Q4").from === "2026-10-01" && quarterRange("2026-Q4").to === "2026-12-31" && quarterRange("2024-Q1").to === "2024-03-31", "ช่วงวันของไตรมาส");
ok(nearbyQuarters(new Date("2026-01-15T00:00:00Z")).join() === "2025-Q2,2025-Q3,2025-Q4,2026-Q1,2026-Q2,2026-Q3,2026-Q4", "ไตรมาสที่เลือกได้ข้ามปีถูก");
ok(effectiveForecast("proposal", null) === "best_case" && effectiveForecast("open", null) === "pipeline" && effectiveForecast("open", "commit") === "commit" && effectiveForecast("won", "commit") === null, "หมวดพยากรณ์: ตั้งเอง > ตามขั้น · ดีลปิดแล้วไม่อยู่ในพยากรณ์");
ok(!(await setForecast(V, d1, "sure", ME)).ok && (await setForecast(V, d1, "commit", ME)).ok, "หมวดที่ไม่รู้จัก = ไม่บันทึก");
ok(!(await setForecast("mst-golf", d1, "commit", ME)).ok, "ตั้งหมวดข้ามบัญชีไม่ได้");
const fdeal = await getDeal(V, d1, ME);
ok(fdeal !== null && fdeal !== "masked" && fdeal.history.some((h) => h.field === "forecast" && h.newValue === "commit"), "ตั้งหมวดพยากรณ์มีประวัติ");
ok(!(await setQuota(V, ME.id, "2026-Q5", "1000", ME.id)).ok && !(await setQuota(V, ME.id, "2026-Q4", "-5", ME.id)).ok, "ไตรมาสผิด · เป้าติดลบ = ไม่บันทึก");
await setQuota(V, ME.id, "2026-Q4", "1,000,000", ME.id);
await setQuota(V, "nok@verify", "2026-Q4", "500000", ME.id);
const tE = await createTeam(V, "ทีมตะวันออก", ME.id);
ok(tE.ok && !(await createTeam(V, "ทีมตะวันออก", ME.id)).ok, "สร้างทีม · ชื่อซ้ำไม่ได้");
const tId = tE.ok ? tE.id : "";
await setTeamMember(V, tId, ME.id, true, ME.id);
await setTeamMember(V, tId, ME.id, true, ME.id);
ok((await listTeams(V)).find((t) => t.id === tId)?.members.join() === ME.id, "เพิ่มคนเข้าทีม (ซ้ำไม่เพิ่ม)");
ok((await setOrgTeam(V, oE, tId, ME)).ok && !(await setOrgTeam(V, oE, "tm-nope", ME)).ok, "ตั้งทีมของบริษัท · ทีมที่ไม่มีไม่ได้");
ok((await listAccounts(V, { viewer: ME, filters: { team: tId } })).rows.map((r) => r.id).join() === oE, "กรองบริษัทตามทีม");
// d1: commit 500k ปิด 30 พ.ย. 2026 (ของ ME) · d2: proposal? เริ่มคุย → มีโอกาส 120k ปิด ก.พ. 2027 (ไม่อยู่ Q4) · ปิดได้หนึ่งดีลใน Q4
const d4 = await mk(oG, "ดีลปิดได้ Q4 (สมมุติ)", 300000, "2026-12-01", "nok@verify");
await run("INSERT INTO record_versions (tenant_id, record_kind, record_id, field, old_value, new_value, reason, changed_by, valid_from, recorded_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
  V, "opportunity", d4, "stage", "open", "won", "ทดสอบ", "nok@verify", null, "2026-10-10T03:00:00.000Z");
await run("UPDATE opportunities SET stage = 'won' WHERE tenant_id = ? AND id = ?", V, d4);
const fr = await forecastReport(V, ME, "2026-Q4");
const me = fr.rows.find((r) => r.owner === ME.id), nok = fr.rows.find((r) => r.owner === "nok@verify");
ok(me?.quota === 1000000 && me.commit === 500000 && me.team === "ทีมตะวันออก", "พยากรณ์ของฉัน: เป้า 1 ล้าน · แน่นอน 500k · อยู่ทีมตะวันออก");
ok(nok?.won === 300000 && nok.pipeline === 0 && nok.quota === 500000, "ปิดได้ในไตรมาสนับจากวันเข้าขั้นปิดได้ · ดีลที่ปิดคาดไตรมาสอื่นไม่นับ");
ok(fr.teams.some((g) => g.team === "ไม่อยู่ในทีม" && g.rows.some((r) => r.owner === "nok@verify")), "คนที่ไม่อยู่ในทีมแยกกลุ่ม");
ok((await forecastReport(V, ME, "bad")).rows.length === 0, "ไตรมาสผิดรูปแบบ = ไม่มีผล");
ok((await pivot(V, ME, { rows: "team", measure: "count", view: "open" })).rowTotals.get("ทีมตะวันออก") === 1, "รายงานเลือกมิติแยกตามทีมได้");
ok((await pivot(V, ME, { rows: "forecast", measure: "value", view: "open" })).rowTotals.get("แน่นอน") === 500000, "รายงานเลือกมิติแยกตามหมวดพยากรณ์ได้");

for (const line of out) console.log(line);
const failed = out.filter((l) => l.startsWith("FAIL"));
if (failed.length) { console.log(`\n=== FAIL ${failed.length} ข้อ ===`); process.exit(1); }
console.log(`\n=== ผ่านทั้งหมด ${out.length} ข้อ ===`);
