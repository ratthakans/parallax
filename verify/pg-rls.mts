/* ── ภายใต้ตัวตนผู้ใช้จริงบน Postgres (RLS · grant · role authenticated) ─────────

   ชุดตรวจอื่นทั้งหมดรันบน sqlite ซึ่งไม่มี RLS และไม่มี grant — บั๊กที่เกิดเฉพาะบนฐานจริงจึงผ่านทุกชุด
   แล้วไปพังบน production คนแรกที่ใช้ ชุดนี้รันคำขอในนามผู้ใช้ (withIdentity → SET LOCAL role authenticated)
   บนฐานที่ใช้ migration จริงทุกไฟล์ และตรวจเฉพาะสิ่งที่ sqlite มองไม่เห็น:

   1. ลบคนตามคำขอสิทธิ (PDPA) ได้จริง — preferences · evidence · record_versions ถูกถอนสิทธิ์ DELETE (0007)
   2. ลบประวัติในตารางเพิ่มอย่างเดียวของคนที่ยังอยู่ไม่ได้ — ลบ "คัดค้าน" ทิ้งแล้วติดต่อต่อไม่ได้
   3. สาย audit ไม่แตกเมื่อเขียนพร้อมกันหลายคำขอ
   4. ผล AI ที่สำเร็จถึงผู้ใช้และถูกแคช — ai_cache เปิด RLS โดยไม่มีนโยบาย
   6. คิว "วันนี้" รันได้ในนามผู้ใช้ และการเลื่อนผ่าน RLS โดยไม่รั่วข้ามบัญชี (0012)
   7. "ฉันรู้จัก" · เส้นทางเข้าถึง · คนที่รู้จักย้ายบริษัท — query ของกราฟและการย้ายรันได้ในนามผู้ใช้
   8. เลือกแม่แบบวัตถุประสงค์ในนามผู้ใช้ และฐานที่ผูกกับบริษัทจับการย้ายบน Postgres (0013)
   9. ตั้งกฎอายุข้อมูลและคำนวณวันครบอายุในนามผู้ใช้ (B6)
   10. ทะเบียนการลบเขียนได้ระหว่างลบตามคำขอ และผู้ใช้ลบแถวทะเบียนไม่ได้ (0014)
   11. คำขอสิทธิ: เปิด · ยืนยัน · รายงาน · ปิดด้วยการลบ ในนามผู้ใช้ · อีกบัญชีมองไม่เห็น · ลบแถวคำขอไม่ได้ (0015)
   12. ส่งออกแบบขออนุมัติ: มีเจ้าของสองคน = อนุมัติคำขอของตัวเองไม่ได้ · อีกคนอนุมัติแล้วผู้ขอดาวน์โหลดได้ครั้งเดียว (0016)
   15. ลบคนตามคำขอในนามผู้ใช้ = หลักฐานโน้ตของปฏิสัมพันธ์ถูกลบด้วย (0021)
   13. บทบาทหกแบบ: BD และผู้ดูแลข้อมูลส่วนบุคคลเขียนผ่าน RLS ได้ · viewer เขียนไม่ได้ · ค่าบทบาทที่ไม่รู้จักบันทึกไม่ได้ (0017)
   14. สมัครเอง (0019): app.create_signup_tenant สร้างบัญชีให้ auth.uid() ครั้งเดียว (แม้กดพร้อมกัน) · เรียกโดยไม่มีตัวตนไม่ได้
       · เข้าบัญชีคนอื่นไม่ได้ · ผู้ใช้เปลี่ยนสถานะการชำระหรือ signup_source เองไม่ได้ · ขั้นตั้งต้นรันในนามผู้ใช้ได้
   16. สรุปรายสัปดาห์: ตั้งได้เฉพาะแถวของตัวเอง · เพื่อนร่วมบัญชีมองไม่เห็น/แก้ไม่ได้ · cron อ่าน auth.users และนับในนามผู้ใช้ (0020)
   17. ยืนยันการรวมเป็นชุดและย้อนทั้งชุดในนามผู้ใช้ · อีกบัญชีมองไม่เห็นชุด (0018 · solo S5)

   ต้องมี DATABASE_URL ของฐานทดสอบที่ใช้ migration แล้ว (npm run pg:test-db) — ไม่มีก็ข้าม
   ⚠ ห้ามชี้ไปที่ production: ชุดนี้สร้างบัญชีและผู้ใช้ทดสอบ */
import { randomUUID } from "node:crypto";

if (!process.env.DATABASE_URL) {
  if (process.env.PG_REQUIRED === "1") {
    console.error("ไม่มี DATABASE_URL — ชุดตรวจ Postgres ถูกบังคับให้รันใน CI");
    process.exit(1);
  }
  console.log("ข้าม — ไม่มี DATABASE_URL");
  process.exit(0);
}

const { all, get, run, withIdentity, asSystem } = await import("@/lib/engine/sql");
const { createCustomer, deleteCustomer } = await import("@/lib/engine/customers");
const { recordPreference } = await import("@/lib/engine/policy/preferences");
const { appendAudit, verifyAuditChain } = await import("@/lib/engine/audit");
const { mapColumns, mapColumnsHeuristic, setTestTransport } = await import("@/lib/engine/ai");
const { tenantRole } = await import("@/lib/engine/access");

const out: string[] = [];
const ok = (c: boolean, m: string) => out.push(`${c ? "PASS" : "FAIL"}  ${m}`);

const T = `pgt-${randomUUID().slice(0, 8)}`;
const op = randomUUID();
const now = new Date().toISOString();
await run("INSERT INTO tenants (id, name, cycle_shape, created_at) VALUES (?, ?, ?, ?)", T, "บัญชีทดสอบ Postgres", "event", now);
await run("INSERT INTO auth.users (id, email) VALUES (?, ?)", op, `${op}@pg.example`);
await run("INSERT INTO tenant_users (user_id, tenant_id, role) VALUES (?, ?, 'lead')", op, T);
await run("INSERT INTO tenant_billing (tenant_id, state, is_customer, updated_at, updated_by) VALUES (?, 'paid', 1, ?, 'verify')", T, now);
const as = <R,>(fn: () => Promise<R>) => withIdentity(op, fn);
const countFor = async (table: string, where: string, ...p: string[]) =>
  Number((await get<{ n: number | string }>(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`, ...p))!.n);

// ── 1 · ลบตามคำขอสิทธิ ──
const made = await as(() => createCustomer(T, { name: "ลบ ทดสอบ", contacts: [{ kind: "email", value: "erase@pg.example" }], profile: {}, consent: false }, "verify"));
if (!made.ok) throw new Error(made.error);
const pref = await as(() => recordPreference(T, made.id, { kind: "objection", evidence: "คัดค้าน (สมมุติ)" }, "verify"));
ok(pref.ok, "บันทึกคำคัดค้านในนามผู้ใช้ได้ (insert ผ่าน RLS)");
await as(() => run(
  "INSERT INTO record_versions (tenant_id, record_kind, record_id, field, old_value, new_value, reason, changed_by, valid_from, recorded_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
  T, "person", made.id, "name", null, "ลบ ทดสอบ", "ทดสอบ", "verify", null, now));
let del: Awaited<ReturnType<typeof deleteCustomer>> | { ok: false; error: string };
try { del = await as(() => deleteCustomer(T, made.id, "verify")); } catch (e) { del = { ok: false, error: (e as Error).message }; }
ok(del.ok, `ลบคนตามคำขอสิทธิได้บน Postgres${del.ok ? "" : ` (${del.error})`}`);
ok(await countFor("preferences", "tenant_id = ? AND customer_id = ?", T, made.id) === 0
  && await countFor("record_versions", "tenant_id = ? AND record_kind = 'person' AND record_id = ?", T, made.id) === 0
  && await countFor("evidence", "tenant_id = ?", T) === 0,
  "ไม่เหลือคำคัดค้าน หลักฐาน หรือประวัติรุ่นของคนที่ถูกลบ");

// ── 2 · ลบคำคัดค้านของคนที่ยังอยู่ไม่ได้ ──
const kept = await as(() => createCustomer(T, { name: "คง ทดสอบ", contacts: [{ kind: "email", value: "keep@pg.example" }], profile: {}, consent: false }, "verify"));
if (!kept.ok) throw new Error(kept.error);
await as(() => recordPreference(T, kept.id, { kind: "objection", evidence: "คัดค้าน (สมมุติ)" }, "verify"));
let erased = true;
try { await as(() => run("SELECT app.erase_person_history(?, ?::text[])", T, `{"${kept.id}"}`)); } catch { erased = false; }
ok(!erased && await countFor("preferences", "tenant_id = ? AND customer_id = ?", T, kept.id) === 1, "ลบคำคัดค้านของคนที่ยังอยู่ในทะเบียนไม่ได้");
let direct = true;
try { await as(() => run("DELETE FROM preferences WHERE tenant_id = ? AND customer_id = ?", T, kept.id)); } catch { direct = false; }
ok(!direct, "ลบ preferences ตรง ๆ ในนามผู้ใช้ไม่ได้ (ตารางเพิ่มอย่างเดียว)");

// ── 3 · สาย audit เมื่อเขียนพร้อมกัน ──
await Promise.all(Array.from({ length: 12 }, (_, i) =>
  as(() => appendAudit({ tenantId: T, actor: "verify", action: "concurrent", targetId: String(i) }))));
const chain = await verifyAuditChain(T);
ok(chain.ok && chain.rows >= 12, `เขียน audit พร้อมกัน 12 คำขอ สายยังต่อกันครบ${chain.ok ? ` (${chain.rows} แถว)` : ` (ขาดที่ ${chain.brokenAtId})`}`);

// ── 4 · แคช AI ในนามผู้ใช้ ──
const headers = [`ชื่อ-${T}`, "อีเมล"];
let calls = 0;
setTestTransport(async () => { calls++; return { text: JSON.stringify(mapColumnsHeuristic(headers)) }; });
const first = await as(() => mapColumns(T, headers, [["สมมุติ", "a@pg.example"]]));
const second = await as(() => mapColumns(T, headers, [["สมมุติ", "a@pg.example"]]));
setTestTransport(null);
ok(first.source === "ai", `ผล AI ที่สำเร็จถึงผู้ใช้ ไม่ถูกทิ้งไปใช้สูตรสำเร็จ (${first.source}${first.note ? ` · ${first.note}` : ""})`);
ok(second.source === "cache" && calls === 1, `ครั้งที่สองมาจากแคช ไม่เรียกโมเดลซ้ำ (${second.source} · เรียก ${calls} ครั้ง)`);
const ledger = await all<{ outcome: string }>("SELECT outcome FROM ai_ledger WHERE tenant_id = ?", T);
ok(!ledger.some((l) => l.outcome === "error"), `ledger ไม่นับการเรียกที่สำเร็จเป็น error (${ledger.map((l) => l.outcome).join(", ")})`);

// ── 5 · บทบาทจาก tenant_users (ด่านของ Server Action) ──
ok(await tenantRole(T, op) === "lead" && await tenantRole(T, randomUUID()) === "viewer" && await tenantRole(T, null) === "viewer",
  "บทบาทอ่านจาก tenant_users · ไม่พบสมาชิก = viewer (สิทธิ์น้อยสุด) ไม่ใช่ owner");

// ── 6 · หน้า "วันนี้" ในนามผู้ใช้ (0012) ── SQL ของคิวต้องรันบน Postgres และการเลื่อนต้องผ่าน RLS
const { todayQueue, snoozeItem } = await import("@/lib/engine/today");
const taskId = randomUUID();
const due = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
await run("INSERT INTO tasks (id, tenant_id, title, status, due_at, owner_id, created_by, created_at) VALUES (?,?,?,?,?,?,?,?)",
  taskId, T, "งานทดสอบ (สมมุติ)", "open", due, `${op}@pg.example`, "verify", now);
const viewerPg = { id: `${op}@pg.example`, clearance: "confidential" as const };
const q1 = await as(() => todayQueue(T, viewerPg));
ok(q1.sections.some((s) => s.items.some((i) => i.id === taskId && i.section === "overdue")), "คิววันนี้รันบน Postgres ในนามผู้ใช้ และเห็นงานเลยกำหนด");
const tomorrowPg = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);
const sn = await as(() => snoozeItem(T, viewerPg.id, "task", taskId, tomorrowPg));
const again = await as(() => snoozeItem(T, viewerPg.id, "task", taskId, tomorrowPg));
ok(sn.ok && again.ok && await countFor("queue_marks", "tenant_id = ? AND item_id = ? AND count = 2", T, taskId) === 1,
  `เลื่อนงานในนามผู้ใช้ได้ และเลื่อนซ้ำอัปเดตแถวเดิม (ON CONFLICT ผ่าน RLS)${sn.ok ? "" : ` (${sn.error})`}`);
const stranger = randomUUID();
const peek = await withIdentity(stranger, () => all<{ item_id: string }>("SELECT item_id FROM queue_marks WHERE tenant_id = ?", T));
ok(peek.length === 0, "ผู้ใช้ที่ไม่ได้อยู่ในบัญชีอ่านการเลื่อนของบัญชีนี้ไม่ได้");

// ── 7 · เส้นทางเข้าถึงและคนที่รู้จักย้ายบริษัท (S2 · S3) ในนามผู้ใช้ ── query ของกราฟและการย้ายต้องรันบน Postgres
const { addMemberLink } = await import("@/lib/engine/accounts/edit");
const { loadPathGraph, pathsToPerson } = await import("@/lib/engine/accounts/paths");
const mover = await as(() => createCustomer(T, { name: "ย้าย ทดสอบ", contacts: [{ kind: "email", value: "mover@pg.example" }], profile: {}, consent: false }, "verify"));
if (!mover.ok) throw new Error(mover.error);
const [oldOrg, newOrg] = [randomUUID(), randomUUID()];
for (const [id, name] of [[oldOrg, "บริษัทเก่า (สมมุติ)"], [newOrg, "บริษัทใหม่ (สมมุติ)"]]) {
  await run("INSERT INTO orgs (id, tenant_id, name, name_norm, created_at) VALUES (?,?,?,?,?)", id, T, name, name, now);
}
const moveAff = randomUUID();
const ago = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
await run("INSERT INTO affiliations (id, tenant_id, customer_id, org_id, valid_from, valid_to, confirmed_by, recorded_at) VALUES (?,?,?,?,?,?,?,?)",
  randomUUID(), T, mover.id, oldOrg, ago(400), ago(20), "verify", now);
await run("INSERT INTO affiliations (id, tenant_id, customer_id, org_id, valid_from, valid_to, confirmed_by, recorded_at) VALUES (?,?,?,?,?,?,?,?)",
  moveAff, T, mover.id, newOrg, ago(20), null, "verify", now);
const link = await as(() => addMemberLink(T, { personId: mover.id, type: "knows", context: "พบที่งานสัมมนา (สมมุติ)" }, viewerPg));
const paths = await as(async () => pathsToPerson(await loadPathGraph(T, "confidential"), mover.id, newOrg));
ok(link.ok && paths.length === 1 && paths[0].hops === 1, `บันทึก "ฉันรู้จัก" และหาเส้นทางในนามผู้ใช้ได้${link.ok ? "" : ` (${link.error})`}`);
const q2 = await as(() => todayQueue(T, viewerPg));
ok(q2.sections.some((s) => s.section === "moved" && s.items.some((i) => i.id === moveAff)), "คนที่รู้จักย้ายบริษัทขึ้นในคิว (query การย้ายรันบน Postgres)");

// ── 8 · แม่แบบวัตถุประสงค์และฐานที่ผูกกับบริษัท (S4 · 0013) ในนามผู้ใช้ ──
const { adoptTemplate } = await import("@/lib/engine/policy/templates");
const { decide } = await import("@/lib/engine/policy");
const adopted = await as(() => adoptTemplate(T, "b2b_followup_existing", "ลูกค้าเคยซื้อบริการ (สมมุติ)", viewerPg.id));
ok(adopted.ok, `เลือกแม่แบบในนามผู้ใช้ได้ (วัตถุประสงค์ · ฐาน · กฎอายุ ผ่าน RLS)${adopted.ok ? "" : ` (${adopted.error})`}`);
if (adopted.ok) {
  const dmove = await as(() => decide(T, { customerId: mover.id, purposeId: adopted.purposeId, channel: "email", messageKind: "marketing" }));
  ok(dmove.status === "review_required" && dmove.reasons.some((r) => /ย้ายไป/.test(r)) && !dmove.failed,
    `ฐานที่ผูกกับบริษัทจับการย้ายบน Postgres (${dmove.status}${dmove.failed ? " · บริการล้ม" : ""})`);
}

// ── 9 · อายุข้อมูล (B6) ในนามผู้ใช้ ── query รวม UNION/MAX ต้องรันบน Postgres และตั้งกฎผ่าน RLS ได้
const { retentionForPeople, setRetentionRule } = await import("@/lib/engine/retention");
if (adopted.ok) {
  const rule = await as(() => setRetentionRule(T, adopted.purposeId, { days: 365, trigger: "received" }, viewerPg.id));
  const ret = await as(() => retentionForPeople(T, viewerPg));
  ok(rule.ok && Array.isArray(ret), `ตั้งกฎอายุและคำนวณอายุข้อมูลในนามผู้ใช้บน Postgres ได้${rule.ok ? "" : ` (${rule.error})`}`);
}

// ── 10 · ทะเบียนการลบ (0014) ── การลบในข้อ 1 ต้องเขียนทะเบียนผ่าน RLS ได้ · ผู้ใช้ลบแถวทะเบียนไม่ได้ (ลบได้ = คนที่ถูกลบกลับมา)
const regRows = await countFor("deletion_registry", "tenant_id = ?", T);
ok(regRows >= 1, `การลบตามคำขอในนามผู้ใช้เขียนทะเบียนการลบได้ (${regRows} รายการ)`);
const wiped = await as(async () => { try { await run("DELETE FROM deletion_registry WHERE tenant_id = ?", T); return true; } catch { return false; } });
ok(!wiped && await countFor("deletion_registry", "tenant_id = ?", T) === regRows, "ผู้ใช้ลบแถวในทะเบียนการลบไม่ได้ (เพิ่มอย่างเดียว)");

// ── 11 · คำขอสิทธิ (0015) ── ทุกขั้นในนามผู้ใช้ · รายงานอ่านหลายตาราง (LIKE บน activity_log · อายุข้อมูล · สรุป AI) ผ่าน RLS
{
  const { openRequest, verifyIdentity, buildReport, closeRequest, getRequest } = await import("@/lib/engine/dsar");
  const subj = await as(() => createCustomer(T, { name: "ขอสิทธิ ทดสอบ", contacts: [{ kind: "email", value: "dsar@pg.example" }], profile: {}, consent: false }, "verify"));
  if (!subj.ok) throw new Error(subj.error);
  const accR = await as(() => openRequest(T, { kind: "access", channel: "email", receivedAt: now.slice(0, 10), contactKind: "email", contactValue: "dsar@pg.example" }, viewerPg.id));
  const ver = accR.ok ? await as(() => verifyIdentity(T, accR.id, "ตอบกลับจากอีเมลในระบบ (สมมุติ)", viewerPg.id)) : { ok: false as const, error: "ไม่ได้เปิด" };
  const rep = accR.ok ? await as(() => buildReport(T, accR.id, viewerPg.id)) : null;
  ok(accR.ok && accR.found && ver.ok && Boolean(rep?.ok && rep.report.contacts.some((c) => c.value === "dsar@pg.example")),
    `เปิดคำขอ · ยืนยันตัวตน · สร้างรายงานในนามผู้ใช้บน Postgres ได้${rep && !rep.ok ? ` (${rep.error})` : ""}`);
  const peekReq = await withIdentity(stranger, () => all<{ id: string }>("SELECT id FROM dsar_requests WHERE tenant_id = ?", T));
  ok(peekReq.length === 0, "ผู้ใช้นอกบัญชีมองไม่เห็นคำขอสิทธิ");
  const erR = await as(() => openRequest(T, { kind: "erase", channel: "email", receivedAt: now.slice(0, 10), subjectId: subj.id }, viewerPg.id));
  if (erR.ok) await as(() => verifyIdentity(T, erR.id, "ตอบกลับจากอีเมลในระบบ (สมมุติ)", viewerPg.id));
  const closed = erR.ok ? await as(() => closeRequest(T, erR.id, { outcome: "done", note: "แจ้งผู้ขอแล้ว (สมมุติ)" }, viewerPg.id)) : null;
  const after = erR.ok ? await as(() => getRequest(T, erR.id)) : null;
  ok(Boolean(closed?.ok && after?.status === "done" && after.subjectGone),
    `ปิดคำขอลบในนามผู้ใช้ = ลบคนจริง และคำขออยู่ต่อ${closed && !closed.ok ? ` (${closed.error})` : ""}`);
  const nReq = await countFor("dsar_requests", "tenant_id = ?", T);
  const gone = await as(async () => { try { await run("DELETE FROM dsar_requests WHERE tenant_id = ?", T); return true; } catch { return false; } });
  ok(!gone && await countFor("dsar_requests", "tenant_id = ?", T) === nReq, "ผู้ใช้ลบแถวคำขอสิทธิไม่ได้ (หลักฐานว่าทำตามคำขอ)");
}

// ── 12 · ส่งออกแบบขออนุมัติ (0016) ── สองเจ้าของ: คนขออนุมัติตัวเองไม่ได้ (นับเจ้าของผ่าน RLS) · อีกคนอนุมัติ = พร้อมทันที
{
  const { requestExport, approveExport, downloadExport, scopeFrom } = await import("@/lib/engine/exports");
  const [o1, o2] = [randomUUID(), randomUUID()];
  for (const u of [o1, o2]) {
    await run("INSERT INTO auth.users (id, email) VALUES (?, ?)", u, `${u}@pg.example`);
    await run("INSERT INTO tenant_users (user_id, tenant_id, role) VALUES (?, ?, 'owner')", u, T);
  }
  const e1 = `${o1}@pg.example`, e2 = `${o2}@pg.example`;
  const req = await withIdentity(o1, () => requestExport(T, scopeFrom({}), "ส่งรายชื่อให้ทีมหน้างาน (สมมุติ)", e1));
  const selfAp = req.ok ? await withIdentity(o1, () => approveExport(T, req.id, e1)) : null;
  ok(Boolean(req.ok && selfAp && !selfAp.ok), "มีเจ้าของสองคน: อนุมัติคำขอส่งออกของตัวเองไม่ได้");
  const otherAp = req.ok ? await withIdentity(o2, () => approveExport(T, req.id, e2)) : null;
  const dl = req.ok ? await withIdentity(o1, () => downloadExport(T, req.id, e1)) : null;
  const again = req.ok ? await withIdentity(o1, () => downloadExport(T, req.id, e1)) : null;
  ok(Boolean(otherAp?.ok && !otherAp.self && dl?.ok && again && !again.ok),
    `เจ้าของอีกคนอนุมัติแล้วผู้ขอดาวน์โหลดได้ครั้งเดียวบน Postgres${dl && !dl.ok ? ` (${dl.error})` : ""}`);
  const gone = await withIdentity(o1, async () => { try { await run("DELETE FROM export_requests WHERE tenant_id = ?", T); return true; } catch { return false; } });
  ok(!gone, "ผู้ใช้ลบแถวคำขอส่งออกไม่ได้");
  await run("DELETE FROM tenant_users WHERE tenant_id = ? AND user_id IN (?, ?)", T, o1, o2);
  await run("DELETE FROM auth.users WHERE id IN (?, ?)", o1, o2);
}

// ── 13 · บทบาทหกแบบ (0017) ── RLS แยกแค่เขียนได้/อ่านอย่างเดียว · การแยกละเอียดอยู่ที่ Server Action (verify:roles)
{
  const users = { bd: randomUUID(), privacy: randomUUID(), viewer: randomUUID() };
  for (const [role, u] of Object.entries(users)) {
    await run("INSERT INTO auth.users (id, email) VALUES (?, ?)", u, `${u}@pg.example`);
    await run("INSERT INTO tenant_users (user_id, tenant_id, role) VALUES (?, ?, ?)", u, T, role);
  }
  const write = (u: string) => withIdentity(u, async () => {
    try {
      await run("INSERT INTO interactions (id, tenant_id, kind, occurred_at, summary, recorded_at) VALUES (?,?,?,?,?,?)", randomUUID(), T, "call", now, "บทบาท (สมมุติ)", now);
      return true;
    } catch { return false; }
  });
  ok(await write(users.bd) && await write(users.privacy) && !(await write(users.viewer)),
    "BD และผู้ดูแลข้อมูลส่วนบุคคลบันทึกปฏิสัมพันธ์ผ่าน RLS ได้ · viewer ไม่ได้");
  ok(await tenantRole(T, users.privacy) === "privacy" && await tenantRole(T, users.bd) === "bd", "อ่านบทบาทใหม่จาก tenant_users ได้");
  let bad = false;
  try { await run("INSERT INTO tenant_users (user_id, tenant_id, role) VALUES (?, ?, 'superuser')", randomUUID(), T); bad = true; } catch { /* ถูกปฏิเสธตามที่ควร */ }
  ok(!bad, "ค่าบทบาทที่ไม่รู้จักบันทึกไม่ได้ (check constraint)");
  await run(`DELETE FROM tenant_users WHERE tenant_id = ? AND user_id IN (?, ?, ?)`, T, users.bd, users.privacy, users.viewer);
  await run(`DELETE FROM auth.users WHERE id IN (?, ?, ?)`, users.bd, users.privacy, users.viewer);
}

// ── 14 · สมัครเอง (0019) ── บัญชีของผู้ใช้ใหม่สร้างผ่านฟังก์ชัน security definer เท่านั้น
{
  const { createSignupTenant, acceptDpa, chooseTemplates, loadSignupDemo } = await import("@/lib/engine/signup");
  const { importBlockedReason, signupInfo } = await import("@/lib/engine/signup/gate");
  process.env.SIGNUP_ENABLED = "1";
  const u = randomUUID(), racer = randomUUID(), other = randomUUID();
  for (const id of [u, racer, other]) await run("INSERT INTO auth.users (id, email) VALUES (?, ?)", id, `${id}@pg.example`);
  const made = await withIdentity(u, () => createSignupTenant(u, "บัญชีสมัครเอง (สมมุติ)", `${u}@pg.example`));
  ok(made.ok, `สร้างบัญชีสมัครเองในนามผู้ใช้ผ่าน app.create_signup_tenant${made.ok ? "" : ` (${made.error})`}`);
  const S = made.ok ? made.tenantId : "";
  const row = await get<{ role: string; state: string; trial_ends_at: string; mode: string; signup_source: string }>(
    `SELECT tu.role, b.state, b.trial_ends_at, s.mode, s.signup_source FROM tenant_users tu
       JOIN tenant_billing b ON b.tenant_id = tu.tenant_id JOIN tenant_settings s ON s.tenant_id = tu.tenant_id
      WHERE tu.user_id = ? AND tu.tenant_id = ?`, u, S);
  const days = row ? (Date.parse(row.trial_ends_at) - Date.now()) / 864e5 : 0;
  ok(row?.role === "owner" && row.state === "trial" && row.mode === "solo" && row.signup_source === "self" && days > 13.9 && days <= 14,
    "ฟังก์ชันสร้างครบสี่แถวในธุรกรรมเดียว: เจ้าของ · ทดลอง 14 วัน · โหมดคนเดียว · ที่มา = สมัครเอง");
  const second = await withIdentity(u, () => createSignupTenant(u, "บัญชีที่สอง (สมมุติ)", "verify"));
  ok(!second.ok && await countFor("tenant_users", "user_id = ?", u) === 1, "ผู้ใช้ที่มีบัญชีแล้วสร้างบัญชีที่สองไม่ได้ (ฐานข้อมูลปฏิเสธ)");
  const race = await Promise.all([1, 2, 3].map((i) => withIdentity(racer, () => createSignupTenant(racer, `กดพร้อมกัน ${i} (สมมุติ)`, "verify"))));
  ok(race.filter((r) => r.ok).length === 1 && await countFor("tenant_users", "user_id = ?", racer) === 1, "กดสร้างพร้อมกันสามครั้ง = ได้บัญชีเดียว (advisory lock)");
  let anon = true;
  try { await run("SELECT app.create_signup_tenant(?, ?)", "s-0123456789ab", "ไม่มีตัวตน"); } catch { anon = false; }
  ok(!anon && await countFor("tenants", "id = ?", "s-0123456789ab") === 0, "เรียกฟังก์ชันโดยไม่มีตัวตน (auth.uid() ว่าง) ไม่ได้");
  let joined = true;
  try { await withIdentity(other, () => run("SELECT app.create_signup_tenant(?, ?)", S, "ยึดบัญชีคนอื่น")); } catch { joined = false; }
  ok(!joined && await countFor("tenant_users", "user_id = ?", other) === 0, "ส่งรหัสบัญชีของคนอื่นเข้าฟังก์ชัน = ไม่ได้เป็นสมาชิกบัญชีนั้น");
  let selfInvite = true;
  try { await withIdentity(other, () => run("INSERT INTO tenant_users (user_id, tenant_id, role) VALUES (?, ?, 'owner')", other, S)); } catch { selfInvite = false; }
  ok(!selfInvite && await countFor("tenant_users", "user_id = ? AND tenant_id = ?", other, S) === 0, "ใส่ตัวเองเข้าบัญชีคนอื่นตรง ๆ ไม่ได้ (RLS ของ tenant_users)");
  const peek = await withIdentity(other, () => all("SELECT tenant_id FROM tenant_settings WHERE tenant_id = ?", S));
  ok(peek.length === 0, "คนนอกอ่านค่าตั้งของบัญชีนี้ไม่ได้");
  let paidSelf = true;
  try { await withIdentity(u, () => run("UPDATE tenant_billing SET state = 'paid' WHERE tenant_id = ?", S)); } catch { paidSelf = false; }
  ok(!paidSelf && (await get<{ state: string }>("SELECT state FROM tenant_billing WHERE tenant_id = ?", S))?.state === "trial", "เจ้าของเปลี่ยนสถานะการชำระเป็น paid เองไม่ได้");
  let unblock = true;
  try { await withIdentity(u, () => run("UPDATE tenant_settings SET signup_source = 'invite' WHERE tenant_id = ?", S)); } catch { unblock = false; }
  ok(!unblock && (await get<{ s: string }>("SELECT signup_source AS s FROM tenant_settings WHERE tenant_id = ?", S))?.s === "self", "เจ้าของแก้ signup_source เพื่อปลดด่านไฟล์จริงไม่ได้ (สิทธิ์ระดับคอลัมน์)");
  let modeOk = false;
  try { modeOk = (await withIdentity(u, () => run("UPDATE tenant_settings SET mode = 'solo', today_quiet_days = 21 WHERE tenant_id = ?", S))).changes === 1; } catch { modeOk = false; }
  ok(modeOk, "เจ้าของแก้โหมดและวันนับบัญชีเงียบได้");
  const asU = <R,>(fn: () => Promise<R>) => withIdentity(u, fn);
  const dpa = await asU(() => acceptDpa(S, true, "verify", "none"));
  const tpl = await asU(() => chooseTemplates(S, [{ code: "b2b_event_namecard", confirmation: "ยืนยันข้อเท็จจริง (สมมุติ)" }], "verify", "verified"));
  const demo = await asU(() => loadSignupDemo(S, "verify", "verified"));
  ok(dpa.ok && tpl.ok && demo.ok, `ขั้นตั้งต้นครบในนามผู้ใช้: DPA · แม่แบบ · ข้อมูลสมมุติผ่านด่านไฟล์${demo.ok ? ` (${demo.rows} แถว)` : ` (${!dpa.ok ? dpa.error : !tpl.ok ? tpl.error : demo.error})`}`);
  ok((await asU(() => signupInfo(S, "verified"))).step === "done" && await asU(() => importBlockedReason(S, "0".repeat(64))) !== null,
    "ตั้งค่าครบแล้วไฟล์ที่ไม่ใช่ไฟล์สมมุติยังถูกกั้นบน Postgres");
  for (const id of [u, racer]) {
    for (const t of await all<{ tenant_id: string }>("SELECT tenant_id FROM tenant_users WHERE user_id = ?", id)) await run("DELETE FROM tenants WHERE id = ?", t.tenant_id);
  }
  await run("DELETE FROM auth.users WHERE id IN (?, ?, ?)", u, racer, other);
}

// ── 16 · สรุปรายสัปดาห์ (0020) ── ตั้งได้เฉพาะแถวของตัวเอง · เพื่อนร่วมบัญชีมองไม่เห็นและแก้ไม่ได้ · cron นับในนามผู้ใช้บน Postgres
{
  const { setDigestPrefs, digestPrefs, runWeeklyDigests } = await import("@/lib/engine/digest");
  const { bangkokWeekday } = await import("@/lib/shared/digest");
  const wd = bangkokWeekday();
  const set = await as(() => setDigestPrefs(T, op, { enabled: true, weekday: wd }));
  const mine = await as(() => digestPrefs(T, op));
  ok(set.ok && mine.enabled && mine.weekday === wd, `ตั้งสรุปรายสัปดาห์ของตัวเองในนามผู้ใช้ได้ (insert/update ผ่าน RLS)${set.ok ? "" : ` (${set.error})`}`);
  const peer = randomUUID();
  await run("INSERT INTO auth.users (id, email) VALUES (?, ?)", peer, `${peer}@pg.example`);
  await run("INSERT INTO tenant_users (user_id, tenant_id, role) VALUES (?, ?, 'bd')", peer, T);
  const peek = await withIdentity(peer, () => all<{ user_id: string }>("SELECT user_id FROM digest_prefs WHERE tenant_id = ?", T));
  const flip = await withIdentity(peer, () => run("UPDATE digest_prefs SET enabled = 0 WHERE tenant_id = ? AND user_id = ?", T, op));
  ok(peek.length === 0 && flip.changes === 0 && (await as(() => digestPrefs(T, op))).enabled,
    "เพื่อนร่วมบัญชีมองไม่เห็นและปิดสรุปของคนอื่นไม่ได้");
  const got: string[] = [];
  const r = await runWeeklyDigests({ send: async (m) => { got.push(m.to); return { status: "sent" }; }, consoleUrl: "https://console.example" });
  ok(r.failed === 0 && got.includes(`${op}@pg.example`), `cron อ่านอีเมลจาก auth.users และนับคิวในนามผู้ใช้บน Postgres (ส่ง ${r.sent} · ล้ม ${r.failed})`);
  await run("DELETE FROM tenant_users WHERE tenant_id = ? AND user_id = ?", T, peer);
  await run("DELETE FROM auth.users WHERE id = ?", peer);
}

// ── 17 · ยืนยันการรวมเป็นชุดและย้อนทั้งชุด (S5 · 0018) ในนามผู้ใช้ ── review_batches ผ่าน RLS · ธุรกรรมเดียวบน Postgres
{
  const { proposeBatches, confirmBatch, undoBatch } = await import("@/lib/engine/vault/review-batches");
  const org = randomUUID();
  await run("INSERT INTO orgs (id, tenant_id, name, name_norm, created_at) VALUES (?,?,?,?,?)", org, T, "บริษัทชุดทดสอบ (สมมุติ)", "บริษัทชุดทดสอบ", now);
  const people: string[] = [];
  for (const [i, nm] of ["ชุดหนึ่ง ทดสอบ", "ชุดสอง ทดสอบ"].entries()) {
    const ids: string[] = [];
    for (const k of [0, 1]) {
      const c = await as(() => createCustomer(T, { name: nm, contacts: [{ kind: "email", value: `batch${i}${k}@pg${k}.example` }], profile: {}, consent: false }, "verify"));
      if (!c.ok) throw new Error(c.error);
      ids.push(c.id);
      await run("INSERT INTO affiliations (id, tenant_id, customer_id, org_id, title, valid_from, confirmed_by, recorded_at) VALUES (?,?,?,?,?,?,?,?)",
        randomUUID(), T, c.id, org, "วิศวกร", ago(30), "verify", now);
    }
    ids.sort();
    people.push(...ids);
    await run("INSERT INTO review_items (id, tenant_id, kind, subject_ids, signals, confidence, status, created_at) VALUES (?,?,?,?,?,?,?,?)",
      randomUUID(), T, "person_pair", JSON.stringify(ids), '["same_name_same_org"]', 0.8, "open", now);
  }
  const b = (await as(() => proposeBatches(T))).find((x) => x.rule === "same_name_org_title");
  ok(b?.pairs.length === 2, "คำนวณชุดที่เสนอในนามผู้ใช้บน Postgres ได้");
  const cf = b ? await as(() => confirmBatch(T, { key: b.key, itemIds: b.pairs.map((p) => p.itemId) }, viewerPg.id)) : null;
  const inPeople = `tenant_id = ? AND id IN (${people.map(() => "?").join(",")})`;
  ok(Boolean(cf?.ok && cf.merged === 2) && await countFor("customers", inPeople, T, ...people) === 2,
    `ยืนยันทั้งชุดเป็นธุรกรรมเดียวในนามผู้ใช้ (review_batches · merge_log ผ่าน RLS)${cf && !cf.ok ? ` (${cf.error})` : ""}`);
  const peekB = await withIdentity(stranger, () => all<{ id: string }>("SELECT id FROM review_batches WHERE tenant_id = ?", T));
  ok(peekB.length === 0, "ผู้ใช้นอกบัญชีมองไม่เห็นชุด");
  const ud = cf?.ok ? await as(() => undoBatch(T, cf.batchId, viewerPg.id)) : null;
  ok(Boolean(ud?.ok && ud.restored === 2) && await countFor("customers", inPeople, T, ...people) === 4
    && await countFor("review_items", "tenant_id = ? AND kind = 'person_pair' AND status = 'open' AND batch_id IS NOT NULL", T) === 2,
    `ย้อนทั้งชุดในนามผู้ใช้ได้ — ทั้งสี่คนกลับมา และคู่กลับเข้าคิว${ud && !ud.ok ? ` (${ud.error})` : ""}`);
}

// ── 15 · หลักฐานโน้ตตามการลบ (0021) ── evidence ลบตรงไม่ได้ ต้องผ่าน app.erase_person_history
{
  const p = await as(() => createCustomer(T, { name: "โน้ต ทดสอบ", contacts: [{ kind: "email", value: "note-erase@pg.example" }], profile: {}, consent: false }, "verify"));
  if (!p.ok) throw new Error(p.error);
  const intId = randomUUID();
  await as(async () => {
    await run("INSERT INTO interactions (id, tenant_id, kind, occurred_at, customer_id, summary, recorded_at) VALUES (?,?,?,?,?,?,?)", intId, T, "meeting", now, p.id, "โน้ต (สมมุติ)", now);
    await run("INSERT INTO evidence (id, tenant_id, kind, ref, note, captured_by, captured_at) VALUES (?,?,?,?,?,?,?)", randomUUID(), T, "note", `interaction:${intId}`, "คุยกัน (สมมุติ)", "verify", now);
  });
  const gone = await as(() => deleteCustomer(T, p.id, "verify", { reason: "request" }));
  ok(gone.ok && await countFor("evidence", "tenant_id = ? AND ref = ?", T, `interaction:${intId}`) === 0,
    "ลบคนในนามผู้ใช้บน Postgres = หลักฐานโน้ตของปฏิสัมพันธ์หายด้วย");
}

// เก็บกวาด — บัญชีทดสอบหายพร้อมทุกแถว (on delete cascade)
await asSystem(() => run("DELETE FROM ai_cache WHERE kind = 'map_columns' AND created_at >= ?", now));
await run("DELETE FROM tenants WHERE id = ?", T);
await run("DELETE FROM auth.users WHERE id = ?", op);

for (const line of out) console.log(line);
const failed = out.filter((l) => l.startsWith("FAIL"));
if (failed.length) {
  console.log(`\n=== FAIL ${failed.length} ข้อ ===`);
  process.exit(1);
}
console.log(`\n=== ผ่านทั้งหมด ${out.length} ข้อ ===`);
process.exit(0);
