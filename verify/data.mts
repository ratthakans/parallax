/* ── จัดการฐานข้อมูล (docs/crm-plan.md รอบสอง · D) ───────────────────────────
   D1 สุขภาพข้อมูล: แต่ละข้อนับถูก · เคารพระดับความลับ · แก้สังกัดเก่าได้ (ยังอยู่ / ออกแล้ว) — ข้อมูลทั้งหมดเป็นชื่อสมมุติ */
import "./isolate.mts";
import { randomUUID } from "node:crypto";
import { ensureReady } from "@/lib/engine/bootstrap";
import { get, run } from "@/lib/engine/sql";
import { dataHealth } from "@/lib/engine/data-health";
import { reaffirmAffiliation, endAffiliation } from "@/lib/engine/accounts/edit";
import { createTeam } from "@/lib/engine/forecast";

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

const A = await org("บริษัท สุขภาพดี จำกัด (สมมุติ)", { industry: "พลังงาน", owner: ME.id, tax: "0105555000011" });
const B = await org("บริษัท ซ้ำเลข จำกัด (สมมุติ)", { tax: "0105555000011" });
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
ok(c("org_no_industry")?.items.some((i) => i.id === C) && !c("org_no_industry")?.items.some((i) => i.id === B), "ไม่ระบุอุตสาหกรรม: นับเฉพาะบริษัทที่มีคนหรือดีล (แฟ้มว่างไม่รก)");
ok(c("person_no_contact")?.items.some((i) => i.id === pNo) && !c("person_no_contact")?.items.some((i) => i.id === pOld), "ผู้ติดต่อไม่มีอีเมล/เบอร์");
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

for (const line of out) console.log(line);
const failed = out.filter((l) => l.startsWith("FAIL"));
if (failed.length) { console.log(`\n=== FAIL ${failed.length} ข้อ ===`); process.exit(1); }
console.log(`\n=== ผ่านทั้งหมด ${out.length} ข้อ ===`);
