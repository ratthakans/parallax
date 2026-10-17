/* ── จัดการฐานข้อมูล (docs/crm-plan.md รอบสอง · D) ───────────────────────────
   D1 สุขภาพข้อมูล: แต่ละข้อนับถูก · เคารพระดับความลับ · แก้สังกัดเก่าได้ (ยังอยู่ / ออกแล้ว) — ข้อมูลทั้งหมดเป็นชื่อสมมุติ */
import "./isolate.mts";
import { randomUUID } from "node:crypto";
import { ensureReady } from "@/lib/engine/bootstrap";
import { get, run } from "@/lib/engine/sql";
import { dataHealth } from "@/lib/engine/data-health";
import { reaffirmAffiliation, endAffiliation } from "@/lib/engine/accounts/edit";
import { createTeam, listTeams } from "@/lib/engine/forecast";
import { taxIdChecksum } from "@/lib/shared/tax-id";
import { bulkDeals, bulkOrgs } from "@/lib/engine/bulk";
import { createField, valuesFor } from "@/lib/engine/custom-fields";
import { all } from "@/lib/engine/sql";
import { applyOrgUpdate, planOrgUpdate, undoOrgUpdate } from "@/lib/engine/org-update";
import { updateOrgField } from "@/lib/engine/accounts/edit";
import { createHash } from "node:crypto";
import { listTrash, purgeTrash, restoreTrash, trashDeal, trashOrg } from "@/lib/engine/trash";
import { addItem, listItems } from "@/lib/engine/deal-items";
import { createDeal, createRenewal, closeDeal, setDealPerson } from "@/lib/engine/deals";
import { createTask } from "@/lib/engine/tasks";

const out: string[] = [];
const ok = (c: boolean, m: string) => out.push(`${c ? "PASS" : "FAIL"}  ${m}`);
const T = "brc-golf";
const ME = { id: "lead@verify", clearance: "confidential" as const };
const LOW = { id: "intern@verify", clearance: "internal" as const };
await ensureReady();
const NOW = new Date("2026-10-17T03:00:00Z");
const iso = (d: string) => `${d}T03:00:00.000Z`;
const org = async (name: string, o: { industry?: string; owner?: string; tax?: string; cls?: string; team?: string } = {}) => {
  const id = `o-${randomUUID().slice(0, 8)}`;
  await run("INSERT INTO orgs (id, tenant_id, name, name_norm, industry, account_owner_id, tax_id, team_id, classification, lifecycle_state, recorded_at, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
    id, T, name, name, o.industry ?? null, o.owner ?? null, o.tax ?? null, o.team ?? null, o.cls ?? "confidential", "confirmed", iso("2024-01-01"), iso("2024-01-01"));
  return id;
};
const person = async (name: string, cls = "confidential", contact = true) => {
  const id = `c-${randomUUID().slice(0, 12)}`;
  await run("INSERT INTO customers (id, tenant_id, name, created_at, classification) VALUES (?,?,?,?,?)", id, T, name, iso("2024-01-01"), cls);
  if (contact) await run("INSERT INTO contact_points (id, tenant_id, customer_id, kind, value_enc, value_hmac, value_masked, is_primary, source, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
    `cp-${randomUUID()}`, T, id, "email", "enc", `h-${randomUUID()}`, "x***@x.example", 1, "manual", iso("2024-01-01"));
  return id;
};
const aff = async (p: string, o: string, seen: string) => {
  const id = `a-${randomUUID().slice(0, 12)}`;
  await run("INSERT INTO affiliations (id, tenant_id, customer_id, org_id, title, valid_from, valid_to, last_seen_at, source_id, recorded_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
    id, T, p, o, null, seen.slice(0, 10), null, iso(seen), null, iso(seen));
  return id;
};
const deal = async (o: string, name: string, value: number | null, close: string | null, stage = "open") => {
  const id = randomUUID();
  await run("INSERT INTO opportunities (id, tenant_id, org_id, name, stage, owner_id, value, expected_close, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
    id, T, o, name, stage, ME.id, value, close, iso("2026-01-01"), iso("2026-01-01"));
  return id;
};

const TAX = "010555500001" + String(taxIdChecksum("010555500001"));
const A = await org("บริษัท สุขภาพดี จำกัด (สมมุติ)", { industry: "พลังงาน", owner: ME.id, tax: TAX });
const B = await org("บริษัท ซ้ำเลข จำกัด (สมมุติ)", { tax: TAX });
const C = await org("บริษัท ไม่มีเจ้าของ จำกัด (สมมุติ)");
const S = await org("บริษัท ลับสุดยอด จำกัด (สมมุติ)", { cls: "restricted_high" });
const pOld = await person("สมเก่า ทดสอบ"), pNew = await person("สมใหม่ ทดสอบ"), pNo = await person("ไร้ช่องทาง ทดสอบ", "confidential", false);
const pSecret = await person("ลับ ทดสอบ", "restricted_high");
const aOld = await aff(pOld, A, "2024-06-01");
await aff(pNew, A, "2026-09-01");
await aff(pNo, C, "2026-09-01");
await aff(pSecret, S, "2023-01-01");
await deal(A, "เลยกำหนด (สมมุติ)", 100000, "2026-09-30");
await deal(C, "ไม่มีมูลค่า (สมมุติ)", null, "2026-12-31");
await deal(C, "ไม่มีวันปิด (สมมุติ)", 50000, null);
await deal(A, "ปิดแล้วเลยกำหนด (สมมุติ)", 1, "2025-01-01", "won");
await deal(S, "ดีลลับเลยกำหนด (สมมุติ)", 1, "2025-01-01");

const h = await dataHealth(T, ME, NOW);
const c = (k: string) => h.find((x) => x.key === k);
ok(c("stale_affiliation")?.count === 1 && c("stale_affiliation")?.items[0].affiliationId === aOld, "สังกัดที่ไม่มีหลักฐานใหม่เกิน 18 เดือน = 1 (คนใหม่ไม่ติด)");
ok(c("deal_overdue")?.count === 1 && c("deal_overdue")?.items[0].name === "เลยกำหนด (สมมุติ)", "ดีลเลยวันปิดคาด: เฉพาะดีลเปิด (ดีลที่ปิดแล้วไม่ติด)");
ok(c("tax_duplicate")?.count === 2, "บริษัทเลขนิติบุคคลซ้ำ = ทั้งสองแฟ้ม");
ok(c("deal_no_value")?.count === 1 && c("deal_no_close")?.count === 1, "ดีลไม่มีมูลค่า · ไม่มีวันปิดคาด");
ok(c("org_no_owner")?.count === 1 && c("org_no_owner")?.items[0].id === C, "บริษัทมีดีลเปิดแต่ไม่มีเจ้าของ");
ok(Boolean(c("org_no_industry")?.items.some((i) => i.id === C)) && !c("org_no_industry")?.items.some((i) => i.id === B), "ไม่ระบุอุตสาหกรรม: นับเฉพาะบริษัทที่มีคนหรือดีล (แฟ้มว่างไม่รก)");
ok(Boolean(c("person_no_contact")?.items.some((i) => i.id === pNo)) && !c("person_no_contact")?.items.some((i) => i.id === pOld), "ผู้ติดต่อไม่มีอีเมล/เบอร์");
ok(!c("org_no_team"), "ยังไม่มีทีม = ไม่แสดงข้อ 'ไม่ระบุทีม'");
ok(h.findIndex((x) => x.severity === "gap") > h.findLastIndex((x) => x.severity === "risk"), "ข้อที่เสี่ยงต่องานขายขึ้นก่อนข้อความครบถ้วน");
const all_ = JSON.stringify(h);
ok(!all_.includes("ลับสุดยอด") && !all_.includes("ลับ ทดสอบ") && !all_.includes("ดีลลับ"), "บริษัท/คน/ดีลที่เกินระดับความลับไม่ขึ้น และไม่ถูกนับ");
const hLow = await dataHealth(T, LOW, NOW);
ok(hLow.filter((x) => x.key !== "review_queue").every((x) => x.count === 0), "ผู้อ่านระดับ 'ภายใน' ไม่เห็นและไม่ถูกนับอะไรเลย (ทุกแฟ้มที่นี่ระดับ 'ลับ')");

await createTeam(T, "ทีมทดสอบ", ME.id);
ok((await dataHealth(T, ME, NOW)).find((x) => x.key === "org_no_team")?.count === 2, "มีทีมแล้ว = แสดงบริษัทที่มีดีลเปิดแต่ไม่ระบุทีม");

// แก้สังกัดเก่า
ok((await reaffirmAffiliation(T, aOld, ME.id)).ok, "ยืนยันว่ายังอยู่ได้");
const after = await get<{ last_seen_at: string; confirmed_by: string }>("SELECT last_seen_at, confirmed_by FROM affiliations WHERE tenant_id = ? AND id = ?", T, aOld);
ok(after?.confirmed_by === ME.id && (after?.last_seen_at ?? "") > iso("2026-01-01"), "ยืนยันแล้ว: เห็นล่าสุด = วันนี้ · มีผู้ยืนยัน");
ok((await dataHealth(T, ME)).find((x) => x.key === "stale_affiliation")?.count === 0, "ยืนยันแล้วหลุดจากรายการ");
const v = await get<{ n: number | string }>("SELECT COUNT(*) AS n FROM record_versions WHERE tenant_id = ? AND record_kind = 'affiliation' AND record_id = ? AND field = 'last_seen_at'", T, aOld);
ok(Number(v?.n) === 1, "การยืนยันมีประวัติ");
await endAffiliation(T, aOld, "2026-10-17", "ทดสอบ", ME.id);
ok(!(await reaffirmAffiliation(T, aOld, ME.id)).ok, "สังกัดที่ปิดแล้วยืนยันว่ายังอยู่ไม่ได้");
ok(!(await reaffirmAffiliation("mst-golf", aOld, ME.id)).ok, "แก้สังกัดข้ามบัญชีไม่ได้");

// ── E3 · ทำทีละหลายรายการ ──
const teamId = (await listTeams(T))[0].id;
const rOwner = await bulkOrgs(T, [A, C, S, "o-nope"], { kind: "owner", owner: "nok@verify" }, ME);
ok(rOwner.done === 2 && rOwner.skipped.length === 2, "เปลี่ยนเจ้าของหลายบริษัท: ข้ามบริษัทเกินสิทธิ์และที่ไม่มีอยู่ ไม่ล้มทั้งชุด");
const owners = await all<{ id: string; account_owner_id: string | null }>("SELECT id, account_owner_id FROM orgs WHERE tenant_id = ? AND id IN (?, ?, ?)", T, A, C, S);
ok(owners.find((o) => o.id === A)?.account_owner_id === "nok@verify" && owners.find((o) => o.id === S)?.account_owner_id === null, "บริษัทลับไม่ถูกแตะ");
ok((await bulkOrgs(T, [A, C], { kind: "team", teamId }, ME)).done === 2, "ตั้งทีมหลายบริษัท");
const tf = await createField(T, { entity: "org", label: "ภาค", kind: "choice", options: "ตะวันออก, เหนือ" }, ME.id);
const fid = tf.ok ? tf.id : "";
const rField = await bulkOrgs(T, [A, C], { kind: "field", fieldId: fid, value: "ใต้" }, ME);
ok(rField.done === 0 && rField.skipped.every((x) => x.reason.includes("ตัวเลือก")), "ค่าที่ไม่ผ่านตรวจ = ข้ามทุกแถวพร้อมเหตุผล");
await bulkOrgs(T, [A, C], { kind: "field", fieldId: fid, value: "ตะวันออก" }, ME);
const vals = await valuesFor(T, "org", [A, C]);
ok(vals.get(A)?.get(fid) === "ตะวันออก" && vals.get(C)?.get(fid) === "ตะวันออก", "ตั้งฟิลด์หลายบริษัท");
const vCount = await get<{ n: number | string }>("SELECT COUNT(*) AS n FROM record_versions WHERE tenant_id = ? AND record_kind = 'org' AND field = 'team_id'", T);
ok(Number(vCount?.n) === 2, "ทุกแถวมีประวัติเหมือนแก้ทีละแถว");
const dealIds = (await all<{ id: string }>("SELECT id FROM opportunities WHERE tenant_id = ? AND org_id IN (?, ?) AND stage = 'open'", T, A, C)).map((x) => x.id);
ok((await bulkDeals(T, dealIds, { kind: "stage", stage: "won" }, ME)).done === 0, "ปิดดีลหลายรายการไม่ได้ (ต้องมีเหตุผลต่อดีล)");
ok((await bulkDeals(T, dealIds, { kind: "stage", stage: "proposal" }, ME)).done === dealIds.length, "ย้ายขั้นหลายดีล");
ok((await bulkDeals(T, dealIds, { kind: "owner", owner: "nok@verify" }, ME)).done === dealIds.length
  && (await all<{ owner_id: string }>("SELECT owner_id FROM opportunities WHERE tenant_id = ? AND id IN (" + dealIds.map(() => "?").join(",") + ")", T, ...dealIds)).every((x) => x.owner_id === "nok@verify"), "เปลี่ยนเจ้าของหลายดีล");
ok((await bulkDeals(T, dealIds, { kind: "forecast", category: "commit" }, ME)).done === dealIds.length, "ตั้งหมวดพยากรณ์หลายดีล");
ok((await bulkOrgs("mst-golf", [A], { kind: "owner", owner: "x@verify" }, ME)).done === 0, "ทำหลายรายการข้ามบัญชีไม่ได้");
ok((await bulkOrgs(T, Array.from({ length: 250 }, () => A), { kind: "team", teamId }, ME)).done === 1, "รหัสซ้ำนับครั้งเดียว");

// ── D2 · อัปเดตบริษัทจากไฟล์ ──
const csv = (lines: string[]) => new TextEncoder().encode(lines.join("\n"));
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const f1 = csv([
  "บริษัท,เลขนิติบุคคล,อุตสาหกรรม,ทีม,ภาค",
  `บริษัท ไม่มีเจ้าของ จำกัด (สมมุติ),0105555000029,ค้าปลีก,ทีมทดสอบ,เหนือ`,
  `,${TAX},พลังงานทดแทน,ทีมที่ไม่มี,ใต้`,
  `บริษัท ที่ไม่มีอยู่ จำกัด,,ไอที,,`,
  `บริษัท ลับสุดยอด จำกัด (สมมุติ),,อาวุธ,,`,
  `บริษัท ไม่มีเจ้าของ จำกัด (สมมุติ),,ซ้ำ,,`,
  `บริษัท สุขภาพดี จำกัด (สมมุติ),${TAX},,,`,
]);
const p1 = await planOrgUpdate(T, f1, "orgs.csv", ME);
ok(p1.ok, "อ่านไฟล์และวางแผนได้");
const plan = p1.ok ? p1.plan : null;
ok(plan?.columns.map((c) => c.target).join() === `match_name,tax_id,industry,team,cf.${fid}`, "จับคู่คอลัมน์ให้เอง รวมฟิลด์ของบัญชีตามชื่อ");
ok(Boolean(plan?.changes.some((c) => c.orgId === C && c.field === "industry" && c.newValue === "ค้าปลีก")) && !plan?.changes.some((c) => c.orgId === C && c.field === "team_id"),
  "หาบริษัทจากชื่อ · เปลี่ยนอุตสาหกรรม · ทีมที่ตรงกับค่าเดิมแล้วไม่นับเป็นการเปลี่ยน");
ok(Boolean(plan?.problems.some((p) => p.line === 2 && p.reason.includes("ไม่ถูกต้อง"))), "เลขนิติบุคคล checksum ผิดในไฟล์ = ข้ามช่องนั้นพร้อมบอกแถว");
ok(Boolean(plan?.changes.some((c) => c.orgId === A && c.field === "industry" && c.newValue === "พลังงานทดแทน")), "หาบริษัทจากเลขนิติบุคคลได้แม้ไม่มีชื่อ");
const probs = plan?.problems.map((p) => p.reason).join(" | ") ?? "";
ok(probs.includes("ไม่พบบริษัท") && probs.includes("มากกว่าหนึ่งแถว") && probs.includes("ไม่มีทีมชื่อ") && probs.includes("ตัวเลือก"), "รายการที่ข้ามบอกเหตุผล: ไม่พบ · ซ้ำในไฟล์ · ทีมไม่มี · ค่าฟิลด์ไม่ผ่าน");
ok(!plan?.changes.some((c) => c.orgId === S) && Boolean(plan?.problems.some((p) => p.line === 5)), "บริษัทเกินสิทธิ์ไม่ถูกแตะ และขึ้นในรายการที่ข้าม");
const f3 = csv(["บริษัท,เลขนิติบุคคล", `บริษัท ไม่มีเจ้าของ จำกัด (สมมุติ),${TAX}`]);
const p3 = await planOrgUpdate(T, f3, "twin.csv", ME);
ok(p3.ok && p3.plan.changes.length === 0 && p3.plan.problems.some((p) => p.reason.includes("เป็นของ")), "เลขนิติบุคคลที่เป็นของบริษัทอื่นแล้ว = ไม่เปลี่ยน พร้อมบอกว่าเป็นของใคร");
ok(!(await applyOrgUpdate(T, f1, "orgs.csv", "wrong-sha", ME)).ok, "ไฟล์ไม่ตรงกับที่ดูตัวอย่าง = ไม่บันทึก");
const ap = await applyOrgUpdate(T, f1, "orgs.csv", sha(f1), ME);
ok(ap.ok && ap.changes === (plan?.changes.length ?? -1), "ยืนยันแล้วเปลี่ยนตามตัวอย่างทุกช่อง");
const cRow = await get<{ industry: string; team_id: string }>("SELECT industry, team_id FROM orgs WHERE tenant_id = ? AND id = ?", T, C);
ok(cRow?.industry === "ค้าปลีก" && cRow?.team_id === teamId, "ค่าใหม่อยู่ในฐาน (ทีมเก็บเป็นรหัส)");
ok(Number((await get<{ n: number | string }>("SELECT COUNT(*) AS n FROM record_versions WHERE tenant_id = ? AND record_kind = 'org' AND reason = 'นำเข้าไฟล์ orgs.csv'", T))?.n)
  === (plan?.changes.filter((c) => !c.field.startsWith("cf.")).length ?? -1), "ทุกการเปลี่ยนช่องของบริษัทมีประวัติพร้อมชื่อไฟล์");
const f2 = csv(["บริษัท,อุตสาหกรรม", "บริษัท ไม่มีเจ้าของ จำกัด (สมมุติ),ค้าปลีก"]);
const p2 = await planOrgUpdate(T, f2, "same.csv", ME);
ok(p2.ok && p2.plan.changes.length === 0 && !(await applyOrgUpdate(T, f2, "same.csv", sha(f2), ME)).ok, "ไฟล์ที่ค่าตรงกับในระบบแล้ว = ไม่มีอะไรเปลี่ยน ไม่สร้างชุด");
// ย้อน: ช่องที่มีคนแก้ต่อแล้วต้องคงไว้
await updateOrgField(T, A, "industry", "พลังงานลม", "แก้หลังนำเข้า", ME.id);
const un = ap.ok ? await undoOrgUpdate(T, ap.batchId, ME) : null;
ok(Boolean(un?.ok && un.kept === 1), "ย้อนทั้งชุด: ช่องที่มีคนแก้ต่อหลังนำเข้าไม่ถูกทับ");
const after2 = await all<{ id: string; industry: string | null; team_id: string | null }>("SELECT id, industry, team_id FROM orgs WHERE tenant_id = ? AND id IN (?, ?)", T, A, C);
ok(after2.find((o) => o.id === C)?.industry === null && after2.find((o) => o.id === C)?.team_id === teamId && after2.find((o) => o.id === A)?.industry === "พลังงานลม",
  "ค่าที่มาจากชุดคืนเป็นค่าเดิม · ช่องที่ไม่ได้อยู่ในชุดไม่ถูกแตะ");
ok((await valuesFor(T, "org", [C])).get(C)?.get(fid) === "ตะวันออก", "ฟิลด์ของบัญชีคืนค่าเดิมด้วย");
ok(ap.ok && !(await undoOrgUpdate(T, ap.batchId, ME)).ok, "ย้อนซ้ำไม่ได้");
const other = await planOrgUpdate("mst-golf", f1, "orgs.csv", ME);
ok(other.ok && other.plan.matched === 0 && other.plan.changes.length === 0, "ไฟล์เดียวกันในบัญชีอื่นไม่เจอบริษัทของบัญชีนี้");
await run("INSERT INTO org_update_changes (id, tenant_id, batch_id, org_id, field, old_value, new_value) VALUES (?,?,?,?,?,?,?)",
  "oc-evil", T, "ou-evil", A, "name = 'x', industry", "x", "พลังงานลม");
await run("INSERT INTO org_update_batches (id, tenant_id, filename, sha256, rows, changes, applied_by, applied_at) VALUES (?,?,?,?,?,?,?,?)", "ou-evil", T, "evil.csv", "x", 1, 1, ME.id, new Date().toISOString());
const evil = await undoOrgUpdate(T, "ou-evil", ME);
ok(evil.ok && evil.reverted === 0 && (await get<{ name: string }>("SELECT name FROM orgs WHERE tenant_id = ? AND id = ?", T, A))?.name !== "x", "ชื่อคอลัมน์ที่ไม่อยู่ในรายการที่อนุญาต = ไม่ถูกต่อเข้า SQL");

// ── D3 · ถังขยะ ──
const dd = await createDeal(T, { orgId: A, name: "ดีลที่จะลบ 2026 (สมมุติ)", value: "120000" }, ME);
const delId = dd.ok ? dd.id : "";
await addItem(T, delId, { package: "Silver", qty: "1", unitPrice: "120000" }, ME);
await setDealPerson(T, delId, pNew, "decision_maker", ME);
const dField = await createField(T, { entity: "deal", label: "ช่องทางขาย", kind: "text" }, ME.id);
const dfId = dField.ok ? dField.id : "";
const { setValue } = await import("@/lib/engine/custom-fields");
await setValue(T, "deal", delId, dfId, "งานแสดงสินค้า", ME);
const task = await createTask(T, { title: "ส่งสัญญา (สมมุติ)", dealId: delId }, ME);
await closeDeal(T, delId, "won", "fit", "", ME);
const ren = await createRenewal(T, delId, ME);
const tr = await trashDeal(T, delId, ME);
ok(tr.ok && !(await get("SELECT 1 AS x FROM opportunities WHERE tenant_id = ? AND id = ?", T, delId)), "ลบดีลแล้วหายจากตารางจริง (ทุกหน้าไม่ต้องกรอง)");
ok(!(await get("SELECT 1 AS x FROM deal_items WHERE tenant_id = ? AND opportunity_id = ?", T, delId)) && !(await get("SELECT 1 AS x FROM opportunity_people WHERE tenant_id = ? AND opportunity_id = ?", T, delId)), "แพ็กเกจและคนในดีลไปกับดีล");
ok(task.ok && (await get<{ opportunity_id: string | null }>("SELECT opportunity_id FROM tasks WHERE tenant_id = ? AND id = ?", T, task.id))?.opportunity_id === null, "งานที่ผูกอยู่ยังอยู่ แต่ตัดลิงก์");
ok(ren.ok && (await get<{ renewed_from: string | null }>("SELECT renewed_from FROM opportunities WHERE tenant_id = ? AND id = ?", T, ren.id))?.renewed_from === null, "ดีลต่อสัญญายังอยู่ แต่ตัดลิงก์กับดีลที่ลบ");
ok(Number((await get<{ n: number | string }>("SELECT COUNT(*) AS n FROM record_versions WHERE tenant_id = ? AND record_kind = 'opportunity' AND record_id = ?", T, delId))?.n) > 0, "ประวัติของดีลที่ลบยังอยู่");
ok((await listTrash(T)).some((t) => t.recordId === delId && t.daysLeft === 30), "อยู่ในถังขยะ เหลือ 30 วัน");
ok(!(await trashDeal("mst-golf", delId, ME)).ok, "ลบข้ามบัญชีไม่ได้");
const rs = tr.ok ? await restoreTrash(T, tr.trashId, ME) : null;
ok(Boolean(rs?.ok), "กู้คืนได้");
ok((await listItems(T, delId)).length === 1 && Boolean(await get("SELECT 1 AS x FROM opportunity_people WHERE tenant_id = ? AND opportunity_id = ?", T, delId))
  && (await valuesFor(T, "deal", [delId])).get(delId)?.get(dfId) === "งานแสดงสินค้า", "กู้คืนครบ: แพ็กเกจ · คนในดีล · ฟิลด์ของดีล");
ok(task.ok && (await get<{ opportunity_id: string | null }>("SELECT opportunity_id FROM tasks WHERE tenant_id = ? AND id = ?", T, task.id))?.opportunity_id === delId
  && ren.ok && (await get<{ renewed_from: string | null }>("SELECT renewed_from FROM opportunities WHERE tenant_id = ? AND id = ?", T, ren.id))?.renewed_from === delId, "ลิงก์งานและดีลต่อสัญญาผูกคืน");
ok(tr.ok && !(await restoreTrash(T, tr.trashId, ME)).ok, "กู้ซ้ำไม่ได้");
// เกิน 30 วัน
const tr2 = await trashDeal(T, delId, ME);
const later = new Date(Date.now() + 31 * 864e5);
ok(tr2.ok && !(await restoreTrash(T, tr2.trashId, ME, later)).ok, "เกิน 30 วันกู้คืนไม่ได้");
ok((await purgeTrash(T, later)) >= 1 && !(await listTrash(T, later)).some((t) => t.recordId === delId), "เกิน 30 วันถูกลบถาวรเมื่อเปิดถังขยะ");
// บริษัท: ลบได้เฉพาะแฟ้มว่าง
ok(!(await trashOrg(T, A, ME)).ok, "บริษัทที่มีคน/ดีลลบไม่ได้ (ให้รวมแทน)");
const empty = await org("บริษัท แฟ้มว่าง จำกัด (สมมุติ)", { industry: "ทดสอบ" });
const child = await org("บริษัท ลูกของแฟ้มว่าง จำกัด (สมมุติ)");
await run("UPDATE orgs SET parent_id = ? WHERE tenant_id = ? AND id = ?", empty, T, child);
await run("INSERT INTO org_domains (tenant_id, org_id, domain) VALUES (?,?,?)", T, empty, "faemwang.example");
const to = await trashOrg(T, empty, ME);
ok(to.ok && !(await get("SELECT 1 AS x FROM orgs WHERE tenant_id = ? AND id = ?", T, empty)) && (await get<{ parent_id: string | null }>("SELECT parent_id FROM orgs WHERE tenant_id = ? AND id = ?", T, child))?.parent_id === null, "ลบแฟ้มว่างได้ · บริษัทลูกถูกตัดลิงก์");
ok(to.ok && (await restoreTrash(T, to.trashId, ME)).ok && (await get<{ parent_id: string }>("SELECT parent_id FROM orgs WHERE tenant_id = ? AND id = ?", T, child))?.parent_id === empty
  && Boolean(await get("SELECT 1 AS x FROM org_domains WHERE tenant_id = ? AND domain = ?", T, "faemwang.example")), "กู้แฟ้มคืน: โดเมนและบริษัทลูกผูกคืน");
// payload ที่ถูกแก้ผ่าน RLS ห้ามพาคอลัมน์แปลก ๆ เข้า SQL
await run("INSERT INTO trash (id, tenant_id, kind, record_id, name, payload, deleted_by, deleted_at) VALUES (?,?,?,?,?,?,?,?)", "tr-evil", T, "deal", "d-evil", "evil",
  JSON.stringify({ deal: { id: "d-evil", tenant_id: T, org_id: A, name: "x", stage: "open", created_at: "x", updated_at: "x", "name) VALUES ('a'); --": 1 } }), ME.id, new Date().toISOString());
const ev = await restoreTrash(T, "tr-evil", ME);
ok(ev.ok && Boolean(await get("SELECT 1 AS x FROM opportunities WHERE tenant_id = ? AND id = 'd-evil'", T)), "คีย์แปลกใน payload ถูกตัดทิ้ง ใช้เฉพาะคอลัมน์ในรายการคงที่");

for (const line of out) console.log(line);
const failed = out.filter((l) => l.startsWith("FAIL"));
if (failed.length) { console.log(`\n=== FAIL ${failed.length} ข้อ ===`); process.exit(1); }
console.log(`\n=== ผ่านทั้งหมด ${out.length} ข้อ ===`);
