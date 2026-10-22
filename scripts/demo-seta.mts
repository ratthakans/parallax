/* ── ฉากเดโม 5 นาทีสำหรับขาย pilot (ผู้จัดงานที่ขายสปอนเซอร์ แบบ SETA) ─────────────

   ใช้: npm run demo:seta            → ฐานแยก .data/demo-seta.db บัญชี "Sunline Expo (สมมุติ)" (sunline-demo)
        npm run demo:seta -- mst-golf → ใส่ฉากลงบัญชีเดโมอื่นแทน
   ในคอนโซล: แถบข้าง › บัญชีที่กำลังดู › สลับ › Sunline Expo (สมมุติ)
   แล้วเปิด dev server บนฐานนี้: PARALLAX_DB_PATH=.data/demo-seta.db npm run dev

   ข้อมูลทั้งหมดสมมุติ (Sunline Energy Week · lib/shared/synthetic-b2b.ts) — ไฟล์เละแบบที่ผู้จัดงานมีจริง:
   รายชื่อลงทะเบียน 10 ปี · รายชื่อสปอนเซอร์ (Windows-874) · นามบัตรที่สแกน
   ⚠ ปฏิเสธเมื่อมี DATABASE_URL — สคริปต์นี้ไม่มีวันเขียนลงฐานจริง */
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { rmSync } from "node:fs";

if (process.env.DATABASE_URL) {
  console.error("มี DATABASE_URL — สคริปต์เดโมเขียนลงฐาน sqlite แยกเท่านั้น ยกเลิก");
  process.exit(1);
}
const dbPath = process.env.PARALLAX_DB_PATH ?? join(process.cwd(), ".data", "demo-seta.db");
process.env.PARALLAX_DB_PATH = dbPath;
for (const ext of ["", "-wal", "-shm"]) rmSync(dbPath + ext, { force: true }); // ฉากเดิมทุกครั้งที่รัน

const { ensureReady } = await import("@/lib/engine/bootstrap");
const { all, get, run } = await import("@/lib/engine/sql");
const { registerSource } = await import("@/lib/engine/vault/sources");
const { analyseUpload, commitUpload } = await import("@/lib/engine/vault/intake");
const { resolveTenant } = await import("@/lib/engine/vault/resolve");
const { adoptTemplate } = await import("@/lib/engine/policy/templates");
const { recordPreference } = await import("@/lib/engine/policy/preferences");
const { addMemberLink, addRelationship, setAccountOwner } = await import("@/lib/engine/accounts/edit");
const { assignTarget, buildTargets, createCampaign, getCampaign } = await import("@/lib/engine/campaigns");
const { fileBytes, generateSynthetic } = await import("@/lib/shared/synthetic-b2b");

const T = process.argv[2] ?? "sunline-demo";
const ME = "owner";                       // ผู้ใช้ใน dev server ที่ไม่ได้ login
const MATE = "nok.bd@sunline.example";    // เพื่อนร่วมทีม BD (สมมุติ)
const ago = (d: number) => new Date(Date.now() - d * 864e5).toISOString();
const day = (d: number) => ago(d).slice(0, 10);
await ensureReady();
/* บัญชีเดโม B2B ไม่ถูก seed ค้าปลีก (lib/shared/tenants.ts) — สร้างแถวบัญชีเอง ด้วยค่าจากโปรไฟล์ */
{
  const { profileFor } = await import("@/lib/shared/tenants");
  const p = profileFor(T);
  await run(
    `INSERT INTO tenants (id, name, cycle_shape, tier, created_at, max_messages_per_week, quiet_hours_start, quiet_hours_end, max_discount_pct, message_credits, billing_day)
     VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`,
    T, p.name, p.cycleShape, p.tier, ago(400), p.limits.weeklyCap, p.limits.quietStart, p.limits.quietEnd, p.limits.maxDiscountPct, p.limits.credits, 1);
}

// ── 1 · วัตถุประสงค์จากแม่แบบ ──
const sponsor = await adoptTemplate(T, "b2b_sponsor_offer", "บริษัทในไฟล์เคยออกบูธหรือเป็นสปอนเซอร์ Sunline Energy Week (สมมุติ)", ME);
const followup = await adoptTemplate(T, "b2b_followup_existing", "บริษัทในไฟล์เคยซื้อแพ็กเกจจากเรา (สมมุติ)", ME);
if (!sponsor.ok || !followup.ok) throw new Error("เลือกแม่แบบไม่สำเร็จ");

// ── 2 · ไฟล์เละสามไฟล์ → Data Vault → ตรวจตัวตน ──
const syn = generateSynthetic({ segment: "events", sourceRows: 1500 });
const src = await registerSource(T, {
  name: "ไฟล์งาน Sunline Energy Week (สมมุติ)", kind: "file", purposeId: sponsor.purposeId,
  acquisitionNote: "ข้อมูลสมมุติจากตัวสร้าง — รายชื่อลงทะเบียน สปอนเซอร์ และนามบัตร",
  fields: ["customer_name", "first_name", "last_name", "company", "job_title", "email", "phone", "occurred_at"],
}, ME);
if (!src.ok) throw new Error(src.error);
for (const f of syn.files) {
  const bytes = fileBytes(f);
  const an = await analyseUpload(T, src.id, bytes, f.name, ME);
  if (!an.ok) throw new Error(`${f.name}: ${an.error}`);
  const done = await commitUpload(T, src.id, bytes, f.name, Object.fromEntries(an.columns.map((c) => [c.index, c.field])), an.sha256, ME);
  if (!done.ok) throw new Error(`${f.name}: ${done.error}`);
}
const stats = await resolveTenant(T, ME);

// ── 3 · ตัวละคร: บริษัทที่มีคนสังกัดอยู่มากที่สุด ──
const orgs = await all<{ id: string; name: string; n: number | string }>(
  `SELECT o.id, o.name, COUNT(DISTINCT a.customer_id) AS n FROM orgs o JOIN affiliations a ON a.org_id = o.id AND a.tenant_id = o.tenant_id
   WHERE o.tenant_id = ? AND a.valid_to IS NULL GROUP BY o.id, o.name HAVING COUNT(DISTINCT a.customer_id) >= 2
   ORDER BY CASE WHEN o.name LIKE 'บริษัท %' THEN 0 ELSE 1 END, n DESC, o.name LIMIT 6`, T); // ชื่อนิติบุคคลเต็มก่อน — อ่านง่ายบนจอ
if (orgs.length < 4) throw new Error("ข้อมูลสมมุติมีบริษัทไม่พอสำหรับฉาก");
const peopleAt = (orgId: string) => all<{ id: string; name: string; email: string | null }>(
  `SELECT c.id, c.name, (SELECT value_masked FROM contact_points p WHERE p.tenant_id = c.tenant_id AND p.customer_id = c.id AND p.kind = 'email' LIMIT 1) AS email
   FROM customers c JOIN affiliations a ON a.customer_id = c.id AND a.tenant_id = c.tenant_id
   WHERE c.tenant_id = ? AND a.org_id = ? AND a.valid_to IS NULL AND c.lifecycle_state <> 'pending_review' ORDER BY c.name LIMIT 3`, T, orgId);
const [A, B, C, D] = orgs;
const [a1] = await peopleAt(A.id), [b1] = await peopleAt(B.id), [c1, c2] = await peopleAt(C.id);

// ── 4 · ใครในทีมรู้จักใคร (S2) ──
await addMemberLink(T, { personId: a1.id, type: "knows", context: "เจอที่บูธ Sunline Energy Week 2025 คุยเรื่องแพ็กเกจ Gold (สมมุติ)" }, { id: ME, clearance: "confidential" });
await addMemberLink(T, { personId: b1.id, type: "has_worked_with", context: "เคยทำโครงการสัมมนาร่วมกันปี 2567 (สมมุติ)" }, { id: MATE, clearance: "confidential" });
if (c1 && c2) {
  await addMemberLink(T, { personId: c1.id, type: "knows", context: "เพื่อนสมัยเรียน (สมมุติ)" }, { id: ME, clearance: "confidential" });
  await addRelationship(T, { type: "works_with", fromKind: "person", fromId: c1.id, toKind: "person", toId: c2.id, evidence: "คุณผู้ติดต่อเล่าว่าทำงานทีมเดียวกัน (สมมุติ)" }, ME);
}

// ── 5 · บัญชีที่กำลังขาย + บัญชีที่เงียบ ──
await setAccountOwner(T, A.id, ME, ME);
await run("INSERT INTO opportunities (id, tenant_id, org_id, name, offer, stage, owner_id, value, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
  randomUUID(), T, D.id, "สปอนเซอร์ Silver 2026 (สมมุติ)", "Silver", "proposal", ME, 350000, ago(70), ago(70));
await run("INSERT INTO interactions (id, tenant_id, kind, occurred_at, org_id, summary, outcome, owner_id, recorded_at) VALUES (?,?,?,?,?,?,?,?,?)",
  randomUUID(), T, "meeting", ago(65), D.id, "นำเสนอแพ็กเกจ Silver (สมมุติ)", "ขอกลับไปคุยภายใน", ME, ago(65));

// ── 5b · ไปป์ไลน์ที่เล่าเรื่องได้ (docs/demo-b2b.md ฉาก 4 · 6) ──
/* ดีลกระจายทุกขั้น + ปิดได้/ไม่ได้พร้อมเหตุผล · ประวัติขั้นย้อนวันจริง ให้ "อยู่ขั้นนี้กี่วัน" และความเร็วไปป์ไลน์มีตัวเลข
   ชื่อดีลและมูลค่าเป็นของสมมุติ · ใช้บริษัทที่มีคนสังกัด (ไม่ซ้ำกับ D ที่มีดีล Silver อยู่แล้ว) */
{
  const pool = await all<{ id: string; name: string }>(
    `SELECT o.id, o.name FROM orgs o WHERE o.tenant_id = ? AND o.id NOT IN (?, ?)
       AND EXISTS (SELECT 1 FROM affiliations a WHERE a.tenant_id = o.tenant_id AND a.org_id = o.id AND a.valid_to IS NULL)
     ORDER BY CASE WHEN o.name LIKE 'บริษัท %' THEN 0 ELSE 1 END, o.name LIMIT 8`, T, A.id, D.id);
  const plan: { org: { id: string; name: string }; name: string; value: number; owner: string; path: [string, number][]; reason?: string; pkg?: string }[] = [
    { org: A, name: "สปอนเซอร์ Gold 2027 (สมมุติ)", value: 600000, owner: ME, path: [["open", 32], ["qualified", 21], ["proposal", 6]], pkg: "Gold" },
    { org: B, name: "บูธ 36 ตร.ม. 2027 (สมมุติ)", value: 240000, owner: MATE, path: [["open", 18], ["qualified", 8]] },
    { org: C, name: "สปอนเซอร์เวทีสัมมนา 2027 (สมมุติ)", value: 450000, owner: ME, path: [["open", 3]] },
    ...(pool[0] ? [{ org: pool[0], name: "สปอนเซอร์ Silver 2027 (สมมุติ)", value: 380000, owner: MATE, path: [["open", 44], ["qualified", 33], ["proposal", 19], ["negotiation", 4]] as [string, number][], pkg: "Silver" }] : []),
    ...(pool[1] ? [{ org: pool[1], name: "บูธ 18 ตร.ม. 2026 (สมมุติ)", value: 180000, owner: ME, path: [["open", 75], ["qualified", 50], ["proposal", 30], ["won", 9]] as [string, number][], reason: "relationship", pkg: "บูธ 18 ตร.ม." }] : []),
    ...(pool[2] ? [{ org: pool[2], name: "สปอนเซอร์ Gold 2026 (สมมุติ)", value: 550000, owner: MATE, path: [["open", 90], ["qualified", 70], ["proposal", 40], ["negotiation", 25], ["lost", 14]] as [string, number][], reason: "price" }] : []),
    ...(pool[3] ? [{ org: pool[3], name: "บูธ 9 ตร.ม. 2026 (สมมุติ)", value: 95000, owner: ME, path: [["open", 60], ["proposal", 35], ["won", 20]] as [string, number][], reason: "fit", pkg: "บูธ 9 ตร.ม." }] : []),
    ...(pool[4] ? [{ org: pool[4], name: "สปอนเซอร์ Bronze 2026 (สมมุติ)", value: 120000, owner: MATE, path: [["open", 50], ["qualified", 38], ["lost", 26]] as [string, number][], reason: "budget" }] : []),
  ];
  for (const p of plan) {
    const id = randomUUID(), stage = p.path.at(-1)![0], first = p.path[0][1], last = p.path.at(-1)![1];
    const closed = stage === "won" || stage === "lost";
    await run(
      `INSERT INTO opportunities (id, tenant_id, org_id, name, offer, stage, owner_id, value, expected_close, created_at, updated_at, close_reason)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      id, T, p.org.id, p.name, p.pkg ?? null, stage, p.owner, p.value, closed ? day(last) : day(-45 - last), ago(first), ago(last), p.reason ?? null);
    let prev: string | null = null;
    for (const [s, d] of p.path) {
      await run(
        "INSERT INTO record_versions (tenant_id, record_kind, record_id, field, old_value, new_value, reason, changed_by, valid_from, recorded_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
        T, "opportunity", id, "stage", prev, s, prev ? "ย้ายขั้น" : "สร้างดีล", p.owner, null, ago(d));
      prev = s;
    }
    if (p.pkg) await run("INSERT INTO deal_items (id, tenant_id, opportunity_id, package, qty, unit_price, created_by, created_at) VALUES (?,?,?,?,?,?,?,?)",
      `di-${randomUUID()}`, T, id, p.pkg, 1, p.value, p.owner, ago(first));
    const [who] = await peopleAt(p.org.id);
    if (who) await run("INSERT INTO opportunity_people (tenant_id, opportunity_id, customer_id, role) VALUES (?,?,?,?)", T, id, who.id, "decision_maker");
  }
  /* กฎขั้น: ก่อนเข้า "เสนอราคา" ต้องมีมูลค่า — ฉาก "ลากข้ามแล้วถูกปฏิเสธพร้อมบอกว่าขาดอะไร" */
  await run("INSERT INTO stage_rules (tenant_id, stage, requirement, created_by, created_at) VALUES (?,?,?,?,?) ON CONFLICT DO NOTHING", T, "proposal", "value", ME, ago(30));
  await run(
    "INSERT INTO opportunities (id, tenant_id, org_id, name, offer, stage, owner_id, value, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
    randomUUID(), T, B.id, "แพ็กเกจสื่อออนไลน์ (ยังไม่ใส่มูลค่า · สมมุติ)", null, "qualified", ME, null, ago(5), ago(5));
}

// ── 6 · คนที่รู้จักย้ายบริษัท (S3) ──
/* ตัวละครที่เขียนเอง (ไม่ใช่จากตัวสร้าง) เพื่อให้ฉากแน่นอน: ปีที่แล้วอยู่บริษัท A และทีมรู้จัก
   แล้วไฟล์นามบัตรเดือนนี้บอกว่าอยู่บริษัท D — อีเมลส่วนตัวเดิม เบอร์เดิม (การตรวจตัวตนรวมเป็นคนเดียวกันเอง)
   อีเมลต้องเป็นโดเมนอีเมลทั่วไป (mail.example ตรง FREE_DOMAIN) — ถ้าเป็นโดเมนอื่น การตรวจตัวตนจะเสนอว่า
   สองบริษัทอาจเป็นบริษัทเดียวกัน (โดเมนเดียวกัน) แล้วสัญญาณการย้ายจะถูกพักไว้ตามกติกา S3 */
const MOVE_MAP = { 0: "customer_name", 1: "company", 2: "job_title", 3: "email", 4: "phone", 5: "occurred_at" };
const importRows = async (name: string, lines: string[]) => {
  const bytes = new TextEncoder().encode(["ชื่อ,บริษัท,ตำแหน่ง,อีเมล,โทร,วันที่", ...lines].join("\n"));
  const done = await commitUpload(T, src.id, bytes, name, MOVE_MAP, createHash("sha256").update(bytes).digest("hex"), ME);
  if (!done.ok) throw new Error(`${name}: ${done.error}`);
  await resolveTenant(T, ME);
  return done.batchId;
};
const mover = "พิมพ์ชนก ศรีสวัสดิ์";
const moverBatch = await importRows("sponsor_contacts_2025.csv", [`${mover},${A.name},ผู้จัดการฝ่ายการตลาด,pimchanok.s@mail.example,081-555-7001,${day(400)}`]);
const moverId = (await get<{ customer_id: string }>("SELECT customer_id FROM import_rows WHERE tenant_id = ? AND batch_id = ? AND customer_id IS NOT NULL", T, moverBatch))!.customer_id;
await addMemberLink(T, { personId: moverId, type: "knows", context: "ดูแลแพ็กเกจสปอนเซอร์ของบริษัทเขาปี 2568 (สมมุติ)" }, { id: ME, clearance: "confidential" });
await importRows("namecards_2026-10.csv", [`${mover},${D.name},ผู้อำนวยการฝ่ายการตลาด,pimchanok.s@mail.example,081-555-7001,${day(12)}`]);

// ── 7 · แคมเปญที่เหตุผลครบทุกมิติ + งานวันนี้ ──
const camp = await createCampaign(T, {
  name: "ขายสปอนเซอร์ Sunline Energy Week 2027 (สมมุติ)", offer: "แพ็กเกจ Gold / Silver", purposeId: sponsor.purposeId,
  channel: "email", messageKind: "marketing", criteria: { maxPerOrg: 2, warmPath: "any" },
}, ME);
if (!camp.ok) throw new Error(camp.error);
await buildTargets(T, camp.id, ME);
const view = (await getCampaign(T, camp.id))!;
const eligible = view.targets.filter((t) => t.eligibility === "eligible");
for (const [i, t] of eligible.slice(0, 2).entries()) await assignTarget(T, t.id, ME, day(i === 0 ? 0 : 2), ME);

// ── 8 · ต้องหยุด: มีคนถอนความยินยอมเมื่อวาน ──
const stopper = view.targets.find((t) => t.eligibility === "eligible" && !eligible.slice(0, 2).includes(t)) ?? view.targets.at(-1);
if (stopper) await recordPreference(T, stopper.customerId, { kind: "objection", evidence: "ตอบอีเมลว่าไม่ต้องการรับข้อเสนอแล้ว (สมมุติ)", effectiveAt: ago(1) }, ME);

const finalView = (await getCampaign(T, camp.id))!;
const moved = await get<{ n: number | string }>(
  "SELECT COUNT(*) AS n FROM affiliations WHERE tenant_id = ? AND customer_id = ? AND valid_to IS NOT NULL", T, moverId);
console.log([
  `ฉากเดโมพร้อม → ${dbPath} · บัญชี ${T}`,
  `ไฟล์: ${syn.files.map((f) => `${f.name} (${f.rows.length} แถว · ${f.encoding})`).join(" · ")}`,
  `ตรวจตัวตน: ${stats.rows} แถว → ${stats.people} คน · ${stats.orgs} บริษัท · คิวตรวจ ${stats.personPairs} คู่ / ${stats.orgGroups} กลุ่มบริษัท`,
  `แฟ้มบริษัทหลัก (ฉาก 3): /app/accounts/${A.id} — ${A.name}`,
  `บัญชีเงียบ + ปลายทางคนย้าย: /app/accounts/${D.id} — ${D.name}`,
  `แคมเปญ (ฉาก 4): /app/sales/${camp.id} — เป้าหมาย ${finalView.targets.length} คน · ใช้ได้ ${finalView.targets.filter((t) => t.eligibility === "eligible").length} · ต้องตรวจ ${finalView.targets.filter((t) => t.eligibility === "review_required").length} · ห้ามติดต่อ ${finalView.targets.filter((t) => t.eligibility === "suppressed").length}`,
  `คนย้ายบริษัท (ฉาก 5): ${Number(moved?.n ?? 0) ? `${mover}: ${A.name} → ${D.name}` : "ไม่สำเร็จ — ดูหัวข้อ 'ถ้าเดโมพัง'"}`,
  `เปิด: PARALLAX_DB_PATH=${dbPath} npm run dev → http://localhost:3000/app/today · แถบข้าง › สลับ › ${T === "sunline-demo" ? "Sunline Expo (สมมุติ)" : T}`,
].join("\n"));
