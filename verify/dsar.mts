/* ── คำขอสิทธิ (docs/plan.md หัวข้อ 7.4 · B6) ─────────────────────────────

   รับคำขอ → ตัวนับ 30 วัน → ยืนยันตัวตน → รายงาน (รวมข้อมูลที่ AI สร้าง · ปิดชื่อคนอื่น) → ปิดแล้วระบบทำตามจริง
   คำขอไม่เก็บชื่อหรือค่าติดต่อของผู้ขอ และอยู่ต่อหลังลบคน
   ข้อมูลทั้งหมดเป็นชื่อสมมุติ โดเมน .example */
import "./isolate.mts";
import { createHash, randomUUID } from "node:crypto";
import { ensureReady } from "@/lib/engine/bootstrap";
import { all, get, run } from "@/lib/engine/sql";
import { registerSource } from "@/lib/engine/vault/sources";
import { commitUpload } from "@/lib/engine/vault/intake";
import { resolveTenant } from "@/lib/engine/vault/resolve";
import { revealContactPoint } from "@/lib/engine/contacts";
import { matchKey } from "@/lib/engine/pii";
import { buildReport, closeRequest, getRequest, openRequest, requestsFor, verifyIdentity } from "@/lib/engine/dsar";
import { snoozeItem, todayQueue } from "@/lib/engine/today";
import { bangkokDay } from "@/lib/shared/format";

const out: string[] = [];
const ok = (c: boolean, m: string) => out.push(`${c ? "PASS" : "FAIL"}  ${m}`);
const T = "hongmove";
const DPO = "dpo@verify";
const ME = { id: DPO, clearance: "confidential" as const };
await ensureReady();

const MAP = { 0: "first_name", 1: "last_name", 2: "company", 3: "job_title", 4: "email", 5: "phone", 6: "occurred_at" };
const src = await registerSource(T, {
  name: "รายชื่อสมมุติสำหรับตรวจคำขอสิทธิ", kind: "file", newPurpose: "ตรวจคำขอสิทธิ (สมมุติ)",
  acquisitionNote: "ข้อมูลสมมุติในชุดตรวจ", fields: Object.values(MAP),
}, "verify");
if (!src.ok) throw new Error(src.error);
const d = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
const bytes = new TextEncoder().encode(["ชื่อ,นามสกุล,บริษัท,ตำแหน่ง,อีเมล,โทรศัพท์,วันที่",
  `วรรณา,ขอดู,บริษัท สิทธิ จำกัด,ผู้จัดการ,wanna@sitthi.example,081-555-7001,${d}`,
  `ธนา,เพื่อนร่วมงาน,บริษัท สิทธิ จำกัด,วิศวกร,thana@sitthi.example,081-555-7002,${d}`,
  `ลบ,ตามขอ,บริษัท ลบทิ้ง จำกัด,ผู้จัดการ,lob@lobthing.example,081-555-7003,${d}`,
  `ถอน,ความยินยอม,บริษัท ถอน จำกัด,ผู้จัดการ,thon@thon.example,081-555-7004,${d}`].join("\n"));
const up = await commitUpload(T, src.id, bytes, "คำขอสิทธิ.csv", MAP, createHash("sha256").update(bytes).digest("hex"), "verify");
if (!up.ok) throw new Error(up.error);
await resolveTenant(T, "verify");
const byEmail = async (email: string) => (await get<{ customer_id: string }>(
  "SELECT customer_id FROM contact_points WHERE tenant_id = ? AND kind = 'email' AND value_hmac = ?", T, matchKey(T, "email", email)))?.customer_id ?? null;
const wanna = (await byEmail("wanna@sitthi.example"))!, thana = (await byEmail("thana@sitthi.example"))!;
const lob = (await byEmail("lob@lobthing.example"))!, thon = (await byEmail("thon@thon.example"))!;
const today = bangkokDay();
const daysAgo = (n: number) => bangkokDay(Date.now() - n * 864e5);

// ── เปิดคำขอ ──
ok(!(await openRequest(T, { kind: "access", channel: "email", receivedAt: bangkokDay(Date.now() + 2 * 864e5), contactValue: "wanna@sitthi.example" }, DPO)).ok,
  "วันที่ได้รับในอนาคตบันทึกไม่ได้");
ok(!(await openRequest(T, { kind: "everything", channel: "email", receivedAt: today, contactValue: "wanna@sitthi.example" }, DPO)).ok, "ชนิดคำขอที่ไม่รู้จักบันทึกไม่ได้");
ok(!(await openRequest(T, { kind: "access", channel: "email", receivedAt: today }, DPO)).ok, "ต้องระบุผู้ขอ");
const acc = await openRequest(T, { kind: "access", channel: "email", receivedAt: daysAgo(5), contactKind: "email", contactValue: " Wanna@Sitthi.example " }, DPO);
const accReq = acc.ok ? await getRequest(T, acc.id) : null;
ok(acc.ok && acc.found && accReq?.subjectId === wanna && acc.ref === `DSAR-${daysAgo(5).slice(0, 4)}-001`,
  "หาผู้ขอจากอีเมล (ตัวพิมพ์/ช่องว่างต่างกันก็เจอ) และได้เลขเรื่องเรียงต่อปี");
ok(accReq?.dueAt === new Date(Date.parse(`${daysAgo(5)}T00:00:00Z`) + 30 * 864e5).toISOString().slice(0, 10) && accReq?.daysLeft === 25,
  `ครบกำหนด = วันที่ได้รับ + 30 วัน (ไม่ใช่วันที่บันทึก) · เหลือ ${accReq?.daysLeft} วัน`);
const row = JSON.stringify(await all("SELECT * FROM dsar_requests WHERE tenant_id = ?", T));
ok(!/wanna|วรรณา|081-555-7001/i.test(row), "แถวคำขอไม่มีชื่อหรือค่าติดต่อของผู้ขอ");

const none = await openRequest(T, { kind: "erase", channel: "web", receivedAt: today, contactKind: "phone", contactValue: "089-999-0000" }, DPO);
ok(none.ok && !none.found, "ไม่พบผู้ขอในระบบก็ยังบันทึกคำขอได้ (ต้องตอบว่าไม่มีข้อมูล)");

// ── ยืนยันตัวตน · รายงาน ──
ok(acc.ok && !(await buildReport(T, acc.id, DPO)).ok, "สร้างรายงานก่อนยืนยันตัวตนไม่ได้");
ok(acc.ok && !(await closeRequest(T, acc.id, { outcome: "done", note: "ส่งแล้ว" }, DPO)).ok, "ปิดคำขอก่อนยืนยันตัวตนไม่ได้");
ok(acc.ok && !(await verifyIdentity(T, acc.id, "ok", DPO)).ok, "ยืนยันตัวตนต้องบอกวิธีที่ใช้");
if (acc.ok) await verifyIdentity(T, acc.id, "ตอบกลับจากอีเมลที่อยู่ในระบบ (สมมุติ)", DPO);
ok(acc.ok && !(await closeRequest(T, acc.id, { outcome: "done", note: "ส่งรายงานทางอีเมลแล้ว" }, DPO)).ok, "คำขอเข้าถึงปิดก่อนสร้างรายงานไม่ได้");

// ข้อมูลรอบตัวผู้ขอ: ปฏิสัมพันธ์ · ความสัมพันธ์กับอีกคน · สรุป AI ที่เอ่ยชื่อ · มีคนเปิดดูเบอร์
const orgId = (await get<{ org_id: string }>("SELECT org_id FROM affiliations WHERE tenant_id = ? AND customer_id = ?", T, wanna))!.org_id;
const now = new Date().toISOString();
await run("INSERT INTO interactions (id, tenant_id, kind, occurred_at, org_id, customer_id, summary, owner_id, recorded_at) VALUES (?,?,?,?,?,?,?,?,?)",
  randomUUID(), T, "meeting", now, orgId, wanna, "คุยเรื่องบูธปีหน้า (สมมุติ)", DPO, now);
await run(`INSERT INTO relationship_assertions (id, tenant_id, from_kind, from_id, to_kind, to_id, type, context, lifecycle_state, recorded_at)
  VALUES (?,?,?,?,?,?,?,?,?,?)`, randomUUID(), T, "person", wanna, "person", thana, "reports_to", "สายงานเดียวกัน", "confirmed", now);
await run(`INSERT INTO account_briefs (id, tenant_id, org_id, clearance, evidence_hash, source, model, sentences, created_by, created_at)
  VALUES (?,?,?,?,?,?,?,?,?,?)`, randomUUID(), T, orgId, "confidential", "stale-hash", "ai", "claude-opus-5-5",
  JSON.stringify([{ text: "วรรณา ขอดู เป็นผู้จัดการและเพิ่งคุยเรื่องบูธ", cites: ["E3"] }, { text: "บริษัทนี้มีทีมวิศวกร", cites: ["E1"] }]), "verify", now);
const point = (await get<{ id: string }>("SELECT id FROM contact_points WHERE tenant_id = ? AND customer_id = ? AND kind = 'phone'", T, wanna))!.id;
await revealContactPoint(T, point, "sales@verify");

const rep = acc.ok ? await buildReport(T, acc.id, DPO) : null;
const r = rep?.ok ? rep.report : null;
ok(Boolean(r && r.contacts.some((c) => c.value === "wanna@sitthi.example") && r.contacts.some((c) => c.kind === "phone" && c.value.replace(/\D/g, "").endsWith("815557001"))),
  "รายงานมีช่องทางติดต่อแบบเต็ม (สิทธิขอสำเนา)");
ok(Boolean(r && r.affiliations.some((a) => a.org === "บริษัท สิทธิ จำกัด" && a.title === "ผู้จัดการ") && r.sources.some((s) => s.filename === "คำขอสิทธิ.csv")),
  "รายงานมีสังกัดและแหล่งที่มา (ไฟล์ · บรรทัด)");
ok(Boolean(r && r.purposes.some((p) => p.purpose === "ตรวจคำขอสิทธิ (สมมุติ)")), "รายงานบอกวัตถุประสงค์ที่ใช้ข้อมูล");
ok(Boolean(r && r.interactions.some((i) => i.summary === "คุยเรื่องบูธปีหน้า (สมมุติ)")), "รายงานมีบันทึกปฏิสัมพันธ์");
ok(Boolean(r && r.relationships.length === 1 && r.relationships[0].other === "บุคคลอื่น" && !JSON.stringify(r).includes("ธนา") && !JSON.stringify(r).includes("thana@")),
  "ความสัมพันธ์กับอีกคนอยู่ในรายงาน แต่ชื่อและช่องทางของอีกคนไม่หลุด");
ok(Boolean(r && r.aiGenerated.length === 1 && r.aiGenerated[0].sentences.length === 1 && r.aiGenerated[0].sentences[0].startsWith("วรรณา")),
  "ข้อมูลที่ AI สร้าง: เฉพาะประโยคที่เกี่ยวกับผู้ขอ (ประโยคอื่นของบริษัทไม่ติดมา)");
ok(Boolean(r && r.accessLog.some((a) => a.action === "reveal_contact" && a.by === "sales@verify")), "รายงานบอกว่าใครเคยเปิดดูช่องทางติดต่อ");
ok(Boolean(r && r.reviewBeforeSending.some((x) => /ปฏิสัมพันธ์/.test(x)) && r.reviewBeforeSending.some((x) => /AI/.test(x))),
  "รายงานบอกจุดที่ต้องตรวจข้อมูลของคนอื่นก่อนส่ง");
const logged = await all<{ detail: string }>("SELECT detail FROM activity_log WHERE tenant_id = ? AND action = 'dsar_report'", T);
ok(logged.length === 1 && !/wanna|081/.test(logged[0].detail), "บันทึกว่าสร้างรายงาน ไม่บันทึกเนื้อหา");
ok(acc.ok && (await closeRequest(T, acc.id, { outcome: "done", note: "ส่งรายงานทางอีเมลที่ยืนยันแล้ว (สมมุติ)" }, DPO)).ok
  && (await getRequest(T, acc.id))?.status === "done", "สร้างรายงานแล้วปิดคำขอเข้าถึงได้");
ok(acc.ok && !(await closeRequest(T, acc.id, { outcome: "rejected", note: "ปิดซ้ำไม่ควรได้เลย" }, DPO)).ok, "คำขอที่ปิดแล้วปิดซ้ำไม่ได้");

// ── ถอนความยินยอม: ปิด = บันทึกการถอนจริง ──
const wd = await openRequest(T, { kind: "withdraw", channel: "phone", receivedAt: today, subjectId: thon }, DPO);
if (wd.ok) await verifyIdentity(T, wd.id, "โทรกลับเบอร์ที่อยู่ในระบบ (สมมุติ)", DPO);
const wdc = wd.ok ? await closeRequest(T, wd.id, { outcome: "done", note: "ยืนยันทางโทรศัพท์" }, DPO) : null;
const pref = await get<{ kind: string; note: string }>(
  "SELECT f.kind, e.note FROM preferences f JOIN evidence e ON e.id = f.evidence_id AND e.tenant_id = f.tenant_id WHERE f.tenant_id = ? AND f.customer_id = ? ORDER BY f.recorded_at DESC", T, thon);
ok(Boolean(wdc?.ok && pref?.kind === "withdrawal" && wd.ok && pref.note.includes(wd.ref)), "ปิดคำขอถอน = บันทึกการถอนพร้อมเลขเรื่องเป็นหลักฐาน");

// ── ขอให้ลบ: ปิด = ลบจริง + ทะเบียนการลบอ้างเลขเรื่อง · คำขออยู่ต่อ ──
const er = await openRequest(T, { kind: "erase", channel: "email", receivedAt: today, contactValue: "lob@lobthing.example" }, DPO);
ok(er.ok && !(await closeRequest(T, er.id, { outcome: "rejected", note: "สั้น" }, DPO)).ok, "ปฏิเสธต้องมีเหตุผลที่แจ้งผู้ขอได้");
if (er.ok) await verifyIdentity(T, er.id, "ตอบกลับจากอีเมลที่อยู่ในระบบ (สมมุติ)", DPO);
const erc = er.ok ? await closeRequest(T, er.id, { outcome: "done", note: "แจ้งผู้ขอทางอีเมลแล้ว" }, DPO) : null;
const reg = await get<{ request_ref: string; reason: string }>("SELECT request_ref, reason FROM deletion_registry WHERE tenant_id = ?", T);
ok(Boolean(erc?.ok && (await byEmail("lob@lobthing.example")) === null && er.ok && reg?.request_ref === er.ref && reg.reason === "request"),
  "ปิดคำขอลบ = ลบคนจริง และทะเบียนการลบอ้างเลขเรื่องกับเหตุ 'ตามคำขอ'");
const erAfter = er.ok ? await getRequest(T, er.id) : null;
ok(Boolean(erAfter && erAfter.status === "done" && erAfter.subjectGone && erAfter.subjectName === null && erAfter.subjectId === lob),
  "คำขออยู่ต่อหลังลบคน (หลักฐานว่าทำแล้ว) โดยไม่มีชื่อเหลือ");
ok((await requestsFor(T, wanna)).length === 1, "หน้าคนเห็นคำขอของคนนั้น");

// ── ไม่พบข้อมูล ──
ok(none.ok && (await closeRequest(T, none.id, { outcome: "done", note: "ตอบผู้ขอทางเว็บว่าไม่มีข้อมูลในระบบ" }, DPO)).ok, "ไม่พบผู้ขอ: ปิดได้พร้อมบันทึกว่าแจ้งผู้ขอแล้ว");

// ── หน้า "วันนี้": ตัวนับ 30 วัน ──
const late = await openRequest(T, { kind: "rectify", channel: "letter", receivedAt: daysAgo(40), subjectId: thana }, DPO);
const soon = await openRequest(T, { kind: "object", channel: "email", receivedAt: daysAgo(27), subjectId: thana }, DPO);
const q = await todayQueue(T, ME);
const items = q.sections.find((s) => s.section === "requests")?.items ?? [];
ok(late.ok && soon.ok && items.length === 2 && items[0].id === late.id && /เลยกำหนด 10 วัน/.test(items[0].title) && /เหลือ 3 วัน/.test(items[1].title),
  "คำขอที่เปิดอยู่ขึ้นหน้า 'วันนี้' — เลยกำหนดก่อน แล้วใกล้ครบกำหนด");
ok(items.every((i) => !/ธนา|วรรณา/.test(i.title + i.detail.join(" ")) && !i.snoozable), "รายการคำขอในคิวไม่มีชื่อผู้ขอ และเลื่อนไม่ได้");
ok(late.ok && !(await snoozeItem(T, DPO, "dsar", late.id, bangkokDay(Date.now() + 3 * 864e5))).ok, "เลื่อนคำขอสิทธิผ่านคิวไม่ได้ (กำหนดตามกฎหมาย)");
ok(q.sections.findIndex((s) => s.section === "requests") === 1, "หมวดคำขอสิทธิอยู่รองจาก 'ต้องหยุด'");

for (const line of out) console.log(line);
const failed = out.filter((l) => l.startsWith("FAIL"));
if (failed.length) {
  console.log(`\n=== FAIL ${failed.length} ข้อ ===`);
  process.exit(1);
}
console.log(`\n=== ผ่านทั้งหมด ${out.length} ข้อ ===`);
