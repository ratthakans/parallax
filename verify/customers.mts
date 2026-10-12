/* ── จัดการฐานลูกค้าทีละคน ─────────────────────────────────────

   ตรวจสิ่งที่พังแล้วเงียบ:
   1. คนที่เพิ่มเองกับแถวในไฟล์ที่นำเข้าทีหลังต้องเป็นคนเดียวกัน ไม่ใช่สองคน
   2. ค้นด้วยเบอร์ที่พิมพ์คนละรูปแบบต้องเจอคนเดิม และค้นข้ามร้านต้องไม่เจอ
   3. ถอนความยินยอมหลังอนุมัติแคมเปญแล้ว ข้อความต้องไม่ออกไปหาคนนั้น
   4. ลบหนึ่งคนต้องไม่เหลือเศษในตารางไหนเลย และไม่แตะคนอื่น
   5. ค่าที่พิมพ์เข้ามาไม่ลงฐานแบบอ่านได้ และไม่ลง activity_log */
import "./isolate.mts";
import { existsSync, readFileSync } from "node:fs";
import { ensureReady } from "@/lib/engine/bootstrap";
import { all, get } from "@/lib/engine/sql";
import { commitImport, parseCsv } from "@/lib/engine/ingest";
import { mapColumnsHeuristic } from "@/lib/engine/ai";
import { customerIdFor, normaliseContact } from "@/lib/engine/pii";
import { revealContactPoint } from "@/lib/engine/contacts";
import {
  addContact, createCustomer, deleteCustomer, getCustomer, removeContact, searchCustomers,
  setConsent, updateCustomer,
} from "@/lib/engine/customers";
import { runMatch } from "@/lib/engine/match";
import { approveCampaign, sendCampaign } from "@/lib/engine/dispatch";

const out: string[] = [];
const ok = (c: boolean, m: string) => out.push(`${c ? "PASS" : "FAIL"}  ${m}`);

await ensureReady();
const A = "mst-golf", B = "hongmove";
const PHONE = "089 765 4321", PHONE_E164 = "+66897654321";
const EMAIL = "Somchai.Test@Example.com";

// ── 1 · เพิ่ม ──
const noId = await createCustomer(A, { name: "ไม่มีช่องทาง", contacts: [], profile: {}, consent: false }, "test");
ok(!noId.ok, "เพิ่มโดยไม่มีเบอร์ อีเมล LINE หรือรหัส ถูกปฏิเสธ");

const bad = await createCustomer(A, { name: "อีเมลผิด", contacts: [{ kind: "email", value: "not-an-email" }], profile: {}, consent: false }, "test");
ok(!bad.ok, "อีเมลรูปแบบผิดถูกปฏิเสธ ไม่บันทึกครึ่ง ๆ");

const made = await createCustomer(A, {
  name: "สมชาย ทดสอบระบบ",
  contacts: [{ kind: "phone", value: PHONE }, { kind: "email", value: EMAIL }],
  profile: { nickname: "ชาย", province: "เชียงใหม่", birthday: "1990-02-30x" },
  consent: false,
}, "test");
const id = made.ok ? made.id : "";
ok(made.ok && id === customerIdFor(A, "phone", PHONE_E164), "ID มาจากเบอร์ด้วยสูตรเดียวกับการนำเข้า");

const rec = await getCustomer(A, id);
ok(rec?.contacts.length === 2 && rec.contacts.every((c) => !c.masked.includes("7654321")), "เก็บสองช่องทาง แสดงแบบปิดบางส่วน");
ok(rec?.consent.granted === false, "ค่าตั้งต้นคือยังไม่ยินยอม");
ok(rec?.profile?.province === "เชียงใหม่" && rec.profile.birthday === null, "บันทึกประวัติ และทิ้งวันเกิดที่รูปแบบผิด");

const dup = await createCustomer(A, { name: "คนซ้ำ", contacts: [{ kind: "phone", value: "+66 89 765 4321" }], profile: {}, consent: false }, "test");
ok(!dup.ok && dup.existingId === id, "เบอร์เดียวกันคนละรูปแบบ = คนเดิม ไม่สร้างซ้ำ");

const dupEmail = await createCustomer(A, {
  name: "อีเมลซ้ำ", contacts: [{ kind: "phone", value: "0811110000" }, { kind: "email", value: EMAIL.toLowerCase() }],
  profile: {}, consent: false,
}, "test");
ok(!dupEmail.ok && dupEmail.existingId === id, "อีเมลที่เป็นของคนอื่นอยู่แล้วถูกปฏิเสธ พร้อมบอกว่าเป็นของใคร");

const otherShop = await createCustomer(B, { name: "คนละร้าน", contacts: [{ kind: "phone", value: PHONE }], profile: {}, consent: false }, "test");
ok(otherShop.ok && otherShop.id !== id, "อีกร้านเพิ่มเบอร์เดียวกันได้ เป็นคนละ ID");

// ── 2 · นำเข้าไฟล์ทีหลังต้องเติมให้คนเดิม ──
const before = Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM customers WHERE tenant_id = ?", A))!.n);
const csv = parseCsv(`phone,name,date,total\n${PHONE},สมชาย ทดสอบระบบ,2026-09-01,2400\n`);
await commitImport(A, csv, mapColumnsHeuristic(csv.headers));
const after = Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM customers WHERE tenant_id = ?", A))!.n);
const rec2 = await getCustomer(A, id);
ok(after === before && rec2?.stats.orders === 1 && rec2.stats.spent === 2400, "ไฟล์ที่มีเบอร์เดียวกันเติมการซื้อให้คนที่เพิ่มเอง ไม่สร้างคนใหม่");
ok(Boolean(rec2?.timeline.some((t) => t.kind === "purchase") && rec2?.timeline.some((t) => t.kind === "created")), "ประวัติมีทั้งการซื้อและวันที่เพิ่ม");

// ── 3 · ค้นหา ──
const byName = await searchCustomers(A, { q: "ทดสอบ" });
ok(byName.rows.some((r) => r.id === id), "ค้นด้วยบางส่วนของชื่อเจอ");
const byPhone = await searchCustomers(A, { q: "089-765-4321" });
ok(byPhone.total === 1 && byPhone.rows[0].id === id, "ค้นด้วยเบอร์ที่มีขีดเจอคนเดียวกัน");
const byEmail = await searchCustomers(A, { q: "somchai.test@example.com" });
ok(byEmail.rows.some((r) => r.id === id), "ค้นด้วยอีเมลตัวพิมพ์เล็กเจอ");
const crossShop = await searchCustomers(B, { q: "ทดสอบระบบ" });
ok(!crossShop.rows.some((r) => r.id === id) && (await getCustomer(B, id)) === null, "อีกร้านค้นไม่เจอและเปิดหน้าไม่ได้");
const like = await searchCustomers(A, { q: "%" });
ok(like.total === 0, "เครื่องหมาย % ในคำค้นไม่กลายเป็นค้นทุกคน");

const all1 = await searchCustomers(A, {});
ok(all1.rows.length === 50 && all1.pages === Math.ceil(all1.total / 50), "แบ่งหน้าละ 50 คน");
const p2 = await searchCustomers(A, { page: 2 });
ok(p2.rows[0]?.id !== all1.rows[0]?.id, "หน้า 2 ไม่ซ้ำกับหน้า 1");
const big = await searchCustomers(A, { sort: "spent" });
const maxSpent = Number((await get<{ m: number }>(
  "SELECT MAX(s) AS m FROM (SELECT SUM(total) AS s FROM transactions WHERE tenant_id = ? GROUP BY customer_id) x", A,
))!.m);
ok(Math.round(big.rows[0].spent) === Math.round(maxSpent), "เรียงตามยอดซื้อ คนแรกคือคนที่ซื้อมากที่สุด");
const never = await searchCustomers(A, { filter: "never" });
ok(never.rows.every((r) => r.orders === 0), "กรอง ยังไม่เคยซื้อ ได้แต่คนที่ไม่มีการซื้อ");

// ── 4 · แก้ไข · ช่องทาง ──
await updateCustomer(A, id, { name: "สมชาย ใจดี", profile: { nickname: "ชาย", company: "ร้านทดสอบ" } }, "test");
ok((await getCustomer(A, id))?.name === "สมชาย ใจดี", "แก้ชื่อแล้วหน้าเห็นชื่อใหม่");
ok(!(await updateCustomer(B, id, { name: "ข้ามร้าน", profile: {} }, "test")).ok, "อีกร้านแก้คนนี้ไม่ได้");

ok(!(await addContact(A, id, "email", "bad", null, "test")).ok, "เพิ่มอีเมลรูปแบบผิดไม่ได้");
ok(!(await addContact(A, id, "phone", PHONE, null, "test")).ok, "เพิ่มเบอร์ที่มีอยู่แล้วซ้ำไม่ได้");
ok((await addContact(A, id, "phone", "0822223333", "ที่ทำงาน", "test")).ok, "เพิ่มเบอร์ที่สองได้");
let phones = (await getCustomer(A, id))!.contacts.filter((c) => c.kind === "phone");
ok(phones.length === 2 && phones.filter((c) => c.isPrimary).length === 1, "สองเบอร์ มีตัวหลักตัวเดียว");
await removeContact(A, phones.find((c) => c.isPrimary)!.id, "test");
phones = (await getCustomer(A, id))!.contacts.filter((c) => c.kind === "phone");
ok(phones.length === 1 && phones[0].isPrimary, "ลบเบอร์หลัก เบอร์ที่เหลือขึ้นเป็นตัวหลัก");

const shown = await revealContactPoint(A, phones[0].id, "test");
ok(shown === normaliseContact("phone", "0822223333"), "กดแสดงได้ค่าเต็ม");

// ── 5 · ถอนความยินยอมหลังอนุมัติ ข้อความต้องไม่ออก ──
const { candidates } = await runMatch(A);
const cand = candidates.filter((c) => !c.blocked).sort((a, b) => a.audience.length - b.audience.length)[0];
const appr = await approveCampaign(cand, { tenantId: A, playId: cand.play.id, approvedBy: "test" });
const victim = (await get<{ customer_id: string }>(
  "SELECT customer_id FROM campaign_audience WHERE campaign_id = ? AND arm = 'treated' LIMIT 1", appr.campaignId,
))!.customer_id;
await setConsent(A, victim, false, "test");
const sent = await sendCampaign(appr.campaignId, { ignoreQuietHours: true, tenantId: A });
const reached = await get<{ x: number }>("SELECT 1 AS x FROM messages WHERE campaign_id = ? AND customer_id = ?", appr.campaignId, victim);
ok(sent.skippedNoConsent >= 1 && !reached, `ถอนความยินยอมหลังอนุมัติ → ข้ามตอนส่ง (ข้าม ${sent.skippedNoConsent})`);
ok(sent.sent === appr.treated - sent.skippedNoConsent, "คนอื่นในกลุ่มยังถูกบันทึกครบ");
await setConsent(A, id, true, "test");
ok((await getCustomer(A, id))?.consent.granted === true, "บันทึกความยินยอมได้");
const consented = await searchCustomers(A, { filter: "consent", q: "สมชาย ใจดี" });
ok(consented.rows.some((r) => r.id === id && r.consent), "กรอง ยินยอม เจอคนที่เพิ่งยินยอม");
await setConsent(A, id, false, "test");
const revoked = await get<{ granted_at: string | null; revoked_at: string | null }>(
  "SELECT granted_at, revoked_at FROM consents WHERE customer_id = ? AND purpose = 'marketing'", id,
);
ok(Boolean(revoked?.granted_at && revoked.revoked_at), "ถอนแล้วยังเก็บวันที่เคยยินยอมไว้ เป็นหลักฐาน");

// ── 6 · ค่าดิบไม่ลงฐานและไม่ลง log ──
const dbPath = process.env.PARALLAX_DB_PATH!;
const raw = Buffer.concat([dbPath, `${dbPath}-wal`].filter(existsSync).map((p) => readFileSync(p)));
ok(raw.includes(Buffer.from("สมชาย ใจดี")), "ตัวค้นไฟล์ทำงานจริง — ชื่อซึ่งเก็บแบบอ่านได้ถูกเจอ");
ok(!raw.includes(Buffer.from("897654321")) && !raw.includes(Buffer.from("somchai.test")), "เบอร์และอีเมลที่พิมพ์เข้ามาไม่อยู่ในไฟล์ฐานข้อมูลแบบอ่านได้");
const logs = await all<{ detail: string | null }>("SELECT detail FROM activity_log WHERE tenant_id = ?", A);
ok(!logs.some((l) => l.detail?.includes("897654321") || l.detail?.includes("822223333") || l.detail?.includes("สมชาย")), "activity_log ไม่มีเบอร์หรือชื่อ");

// ── 7 · ลบ ──
ok(!(await deleteCustomer(B, id, "test")).ok, "อีกร้านลบคนนี้ไม่ได้");
const neighbour = all1.rows.find((r) => r.id !== id)!.id;
const del = await deleteCustomer(A, id, "test");
ok(del.ok, "ลบได้");
const tables = [
  "customers:id", "contact_points:customer_id", "contact_profiles:customer_id", "consents:customer_id",
  "transactions:customer_id", "events:customer_id", "memberships:customer_id", "customer_features:customer_id",
  "campaign_audience:customer_id", "messages:customer_id",
];
const left: string[] = [];
for (const t of tables) {
  const [name, col] = t.split(":");
  const n = Number((await get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${name} WHERE ${col} = ?`, id))!.n);
  if (n) left.push(`${name}=${n}`);
}
ok(left.length === 0, `ลบแล้วไม่เหลือเศษในตารางไหน${left.length ? ` (เหลือ ${left.join(", ")})` : ""}`);
ok((await getCustomer(A, neighbour)) !== null, "คนอื่นไม่ถูกแตะ");
ok((await getCustomer(B, otherShop.ok ? otherShop.id : "")) !== null, "คนเบอร์เดียวกันในอีกร้านยังอยู่");

for (const l of out) console.log(l);
const fails = out.filter((l) => l.startsWith("FAIL"));
console.log(fails.length ? `\n=== มี FAIL ${fails.length} ข้อ ===` : `\n=== ผ่านทั้งหมด ${out.length} ข้อ ===`);
process.exit(fails.length ? 1 : 0);
