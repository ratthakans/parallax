/* ── สรุปรายสัปดาห์ถึงตัวเอง (docs/solo-plan.md S8) ─────────────────────

   ผ่านเมื่อ: อีเมลไม่มี PII ของคนในฐาน (regex เบอร์/อีเมล + ชื่อจากข้อมูลสมมุติ) · ปิดแล้วไม่ส่ง · ข้ามบัญชีไม่ปน
   เพิ่ม: secret ผิด/ไม่มี = 401 · วันละครั้ง (รันซ้ำ · รันพร้อมกัน) · ส่งล้มแล้วรอบหน้าลองใหม่ · ไม่ได้ตั้งผู้ให้บริการ = ข้ามไม่ล้ม
   ส่งผ่านตัวส่งปลอม (ไม่มีอะไรออกนอกเครื่อง) · ข้อมูลทั้งหมดเป็นชื่อสมมุติ โดเมน .example */
import "./isolate.mts";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { ensureReady } from "@/lib/engine/bootstrap";
import { all, get, run } from "@/lib/engine/sql";
import { registerSource } from "@/lib/engine/vault/sources";
import { commitUpload } from "@/lib/engine/vault/intake";
import { resolveTenant } from "@/lib/engine/vault/resolve";
import { openRequest } from "@/lib/engine/dsar";
import {
  cronAuthorized, digestCounts, digestPrefs, handleDigestCron, resendSender, runWeeklyDigests, setDigestPrefs,
  type DigestMessage, type Sender,
} from "@/lib/engine/digest";
import { bangkokWeekday, buildDigest, type DigestCounts } from "@/lib/shared/digest";
import { QUEUE_SECTIONS } from "@/lib/shared/today";
import { bangkokDay } from "@/lib/shared/format";

const out: string[] = [];
const ok = (c: boolean, m: string) => out.push(`${c ? "PASS" : "FAIL"}  ${m}`);
const T = "hongmove";
const T2 = "mst-golf";
await ensureReady();

/* ── ข้อมูลตั้งต้น: คนสมมุติพร้อมอีเมล/เบอร์ · งานที่ชื่อมีชื่อคน · คำขอสิทธิ · โอกาสที่ขยับและค้าง ── */
const MAP = { 0: "first_name", 1: "last_name", 2: "company", 3: "job_title", 4: "email", 5: "phone", 6: "occurred_at" };
const src = await registerSource(T, {
  name: "รายชื่อสมมุติสำหรับตรวจสรุปรายสัปดาห์", kind: "file", newPurpose: "ตรวจสรุปรายสัปดาห์ (สมมุติ)",
  acquisitionNote: "ข้อมูลสมมุติในชุดตรวจ ไม่ใช่ข้อมูลของใคร", fields: Object.values(MAP),
}, "verify");
if (!src.ok) throw new Error(src.error);
const d = new Date(Date.now() - 20 * 864e5).toISOString().slice(0, 10);
const PEOPLE = [
  ["สมปอง", "สรุปดี", "บริษัท สัปดาห์สุข จำกัด", "ผู้จัดการ", "sompong@sapdasuk.example", "081-555-8801"],
  ["มาลัย", "ตัวเลข", "บริษัท นับเลข จำกัด", "ผู้อำนวยการ", "malai@nablek.example", "081-555-8802"],
];
const bytes = new TextEncoder().encode(["ชื่อ,นามสกุล,บริษัท,ตำแหน่ง,อีเมล,โทรศัพท์,วันที่",
  ...PEOPLE.map((p) => [...p, d].join(","))].join("\n"));
const up = await commitUpload(T, src.id, bytes, "สรุปรายสัปดาห์.csv", MAP, createHash("sha256").update(bytes).digest("hex"), "verify");
if (!up.ok) throw new Error(up.error);
await resolveTenant(T, "verify");
const person = (await get<{ customer_id: string; org_id: string }>(
  "SELECT a.customer_id, a.org_id FROM affiliations a JOIN customers c ON c.id = a.customer_id AND c.tenant_id = a.tenant_id WHERE a.tenant_id = ? AND c.name LIKE ? AND a.valid_to IS NULL",
  T, "สมปอง%"))!;

// ผู้ใช้สมมุติ (uuid เหมือน auth.users บน Postgres) — A อยู่สองบัญชี · B ปิดไว้ · C ถูกถอดจากบัญชี · D เลือกวันอื่น
const [uA, uB, uC, uD] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
const EMAIL = new Map<string, string>([[uA, "solo-a@digest.example"], [uB, "solo-b@digest.example"], [uC, "solo-c@digest.example"], [uD, "solo-d@digest.example"]]);
const at = new Date().toISOString();
for (const [u, t] of [[uA, T], [uA, T2], [uB, T], [uC, T], [uD, T]] as const) {
  await run("INSERT INTO tenant_users (tenant_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)", t, u, at);
}

const now = new Date();
const today = bangkokDay(now);
const W = bangkokWeekday(now);
const other = ((W % 7) + 1) as number;

// งานของ A ใน T ครบกำหนดวันนี้ — ชื่องานมีชื่อคน (แบบที่ assignTarget สร้าง) ต้องไม่หลุดไปในอีเมล
await run("INSERT INTO tasks (id, tenant_id, title, status, due_at, owner_id, org_id, customer_id, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
  randomUUID(), T, "ติดต่อ สมปอง สรุปดี — sompong@sapdasuk.example", "open", `${today}T09:00:00.000Z`, EMAIL.get(uA)!, person.org_id, person.customer_id, "verify", at);
// คำขอสิทธิสองเรื่องใน T (หนึ่งเลยกำหนด) · T2 ไม่มี
await openRequest(T, { kind: "access", channel: "email", receivedAt: bangkokDay(Date.now() - 3 * 864e5), contactValue: "sompong@sapdasuk.example" }, "dpo@verify");
await openRequest(T, { kind: "erase", channel: "phone", receivedAt: bangkokDay(Date.now() - 40 * 864e5), contactKind: "phone", contactValue: "081-555-8802" }, "dpo@verify");
// โอกาสขาย: ขยับเมื่อวาน หนึ่ง · ค้าง 30 วัน หนึ่ง
const [baseMoved, baseStuck] = await Promise.all([
  get<{ n: number }>("SELECT COUNT(*) AS n FROM opportunities WHERE tenant_id = ? AND updated_at >= ?", T, new Date(Date.now() - 7 * 864e5).toISOString()),
  get<{ n: number }>("SELECT COUNT(*) AS n FROM opportunities WHERE tenant_id = ? AND stage NOT IN ('won','lost') AND updated_at < ?", T, new Date(Date.now() - 14 * 864e5).toISOString()),
]);
for (const [name, ago] of [["โอกาสของ สมปอง สรุปดี", 1], ["โอกาสค้างของ มาลัย ตัวเลข", 30]] as const) {
  const t = new Date(Date.now() - ago * 864e5).toISOString();
  await run("INSERT INTO opportunities (id, tenant_id, org_id, name, stage, owner_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)",
    randomUUID(), T, person.org_id, name, "open", EMAIL.get(uA)!, t, t);
}

// ── ความชอบ ──
ok(!(await digestPrefs(T, uA)).enabled && (await digestPrefs(T, uA)).weekday === 1, "ยังไม่ตั้ง = ปิด (เปิดใช้เอง) · วันตั้งต้นคือวันจันทร์");
ok(!(await setDigestPrefs(T, randomUUID(), { enabled: true, weekday: W })).ok, "ผู้ใช้ที่ไม่ใช่สมาชิกของบัญชีตั้งสรุปไม่ได้");
ok(!(await setDigestPrefs(T, uA, { enabled: true, weekday: 9 })).ok && !(await setDigestPrefs(T, uA, { enabled: true, weekday: 0 })).ok,
  "วันในสัปดาห์ต้องเป็น 1–7");
await setDigestPrefs(T, uA, { enabled: true, weekday: W });
await setDigestPrefs(T2, uA, { enabled: true, weekday: W });
await setDigestPrefs(T, uB, { enabled: false, weekday: W });
await setDigestPrefs(T, uC, { enabled: true, weekday: W });
await setDigestPrefs(T, uD, { enabled: true, weekday: other });
await run("DELETE FROM tenant_users WHERE tenant_id = ? AND user_id = ?", T, uC);
const pA = await digestPrefs(T, uA);
ok(pA.enabled && pA.weekday === W, "ตั้งเปิดและเลือกวันได้");

// ── ส่ง ──
const sent: DigestMessage[] = [];
const fake: Sender = async (m) => { sent.push(m); return { status: "sent", id: randomUUID() }; };
const emailsFor = async (ids: string[]) => new Map(ids.filter((i) => EMAIL.has(i)).map((i) => [i, EMAIL.get(i)!]));
const BASE = "https://console.example";
const r1 = await runWeeklyDigests({ now, send: fake, emailsFor, consoleUrl: BASE });
ok(r1.sent === 2 && sent.length === 2, `ส่งให้ผู้ใช้ที่เปิดและเลือกวันนี้ — หนึ่งฉบับต่อบัญชี (ส่ง ${r1.sent})`);
ok(sent.every((m) => m.to === EMAIL.get(uA)), "ผู้รับคือผู้ใช้เอง (อีเมลที่ใช้ล็อกอิน) ไม่ใช่คนในฐาน");
ok(!sent.some((m) => m.to === EMAIL.get(uB)), "ปิดแล้วไม่ส่ง");
ok(!sent.some((m) => m.to === EMAIL.get(uC)), "ถูกถอดออกจากบัญชีแล้วไม่ได้รับ แม้ยังเปิดไว้");
ok(!sent.some((m) => m.to === EMAIL.get(uD)), "เลือกวันอื่น = วันนี้ไม่ส่ง");

// ── ไม่มี PII ของคนในฐาน ──
const names = await all<{ name: string }>(
  `SELECT name FROM customers WHERE tenant_id IN (?, ?) UNION SELECT name FROM orgs WHERE tenant_id IN (?, ?)
   UNION SELECT name FROM opportunities WHERE tenant_id IN (?, ?) UNION SELECT title AS name FROM tasks WHERE tenant_id IN (?, ?)`,
  T, T2, T, T2, T, T2, T, T2);
const words = new Set<string>(PEOPLE.flatMap((p) => [p[0], p[1], p[2], p[4], p[5]]));
for (const n of names) if (n.name && n.name.trim().length >= 4) words.add(n.name.trim());
const blob = sent.map((m) => `${m.subject}\n${m.text}\n${m.html}`).join("\n");
const leaked = [...words].filter((w) => blob.includes(w));
ok(leaked.length === 0, `ไม่มีชื่อคน ชื่อบริษัท ชื่องาน/โอกาสจากฐานในอีเมล (ตรวจ ${words.size} ค่า${leaked.length ? ` · หลุด: ${leaked.slice(0, 3).join(", ")}` : ""})`);
ok(!/[\w.+-]+@[\w-]+\.[\w.-]+/.test(blob), "ไม่มีที่อยู่อีเมลในเนื้อหา");
ok(!/0\d{1,2}[-\s]?\d{3}[-\s]?\d{4}/.test(blob) && !/\d{9,}/.test(blob), "ไม่มีเบอร์โทรในเนื้อหา");
ok(sent.every((m) => m.text.includes(`${BASE}/app/today`) && m.html.includes(`${BASE}/app/today`) && m.text.includes(`${BASE}/app/settings`)),
  "มีลิงก์เข้าระบบและลิงก์ปิด/เปลี่ยนวัน");

// ── ข้ามบัญชีไม่ปน ──
const nameOf = async (t: string) => (await get<{ name: string }>("SELECT name FROM tenants WHERE id = ?", t))!.name;
const [nT, nT2] = [await nameOf(T), await nameOf(T2)];
const mT = sent.find((m) => m.subject.includes(nT)), mT2 = sent.find((m) => m.subject.includes(nT2));
ok(Boolean(mT && mT2 && mT !== mT2 && !mT.text.includes(nT2) && !mT2.text.includes(nT)), "แต่ละบัญชีได้ฉบับของตัวเอง ชื่อบัญชีไม่ปนกัน");
ok(Boolean(mT?.text.includes("- เปิดอยู่: 2") && mT.text.includes("- เลยกำหนด 30 วัน: 1") && mT2?.text.includes("- เปิดอยู่: 0")),
  "คำขอสิทธิของบัญชีหนึ่งไม่ถูกนับในอีกบัญชี");
const cT = await digestCounts(T, { id: EMAIL.get(uA)!, clearance: "confidential" }, now);
const cT2 = await digestCounts(T2, { id: EMAIL.get(uA)!, clearance: "confidential" }, now);
ok(cT.queue.due >= 1 && cT2.queue.due === 0, `งานของผู้ใช้ในบัญชีหนึ่งไม่ขึ้นในสรุปของอีกบัญชี (${cT.queue.due} / ${cT2.queue.due})`);
ok(cT.opportunities.moved === Number(baseMoved?.n ?? 0) + 1 && cT.opportunities.stuck === Number(baseStuck?.n ?? 0) + 1,
  `นับโอกาสที่ขยับใน 7 วันและที่ค้างเกิน 14 วัน (${cT.opportunities.moved} / ${cT.opportunities.stuck})`);
ok(QUEUE_SECTIONS.every((s) => mT!.text.includes(`: ${cT.queue[s]}`)), "จำนวนต่อหมวดของหน้า \"วันนี้\" ตรงกับคิวจริง");

// ── วันละครั้ง ──
const r2 = await runWeeklyDigests({ now, send: fake, emailsFor, consoleUrl: BASE });
ok(r2.sent === 0 && sent.length === 2, "รันซ้ำในวันเดียวกันไม่ส่งซ้ำ");
const later = new Date(+now + 3 * 3600_000);
const r3 = bangkokDay(later) === today ? await runWeeklyDigests({ now: later, send: fake, emailsFor, consoleUrl: BASE }) : r2;
ok(r3.sent === 0 && sent.length === 2, "อีกไม่กี่ชั่วโมงในวันเดียวกันก็ไม่ส่งซ้ำ");
const lastAt = (await digestPrefs(T, uA)).lastSentAt;
ok(lastAt === now.toISOString(), "บันทึกเวลาที่ส่งล่าสุด");

const next = new Date(+now + 7 * 864e5);
const before = sent.length;
const [p1, p2] = await Promise.all([
  runWeeklyDigests({ now: next, send: fake, emailsFor, consoleUrl: BASE }),
  runWeeklyDigests({ now: next, send: fake, emailsFor, consoleUrl: BASE }),
]);
ok(p1.sent + p2.sent === 2 && sent.length === before + 2, `สัปดาห์ถัดไปส่งอีกครั้ง · cron สองรอบพร้อมกันส่งรอบเดียว (${p1.sent} + ${p2.sent})`);

// ── ปิดทีหลัง ──
await setDigestPrefs(T2, uA, { enabled: false, weekday: W });
const w3 = new Date(+now + 14 * 864e5);
const n3 = sent.length;
const r4 = await runWeeklyDigests({ now: w3, send: fake, emailsFor, consoleUrl: BASE });
ok(r4.sent === 1 && sent.slice(n3).every((m) => m.subject.includes(nT)), "ปิดในบัญชีหนึ่งแล้ว เหลือส่งเฉพาะบัญชีที่ยังเปิด");

// ── ส่งล้ม · ไม่ได้ตั้งค่า ──
const w4 = new Date(+now + 21 * 864e5);
const failing: Sender = async () => ({ status: "failed", error: "ทดสอบ" });
const r5 = await runWeeklyDigests({ now: w4, send: failing, emailsFor, consoleUrl: BASE });
const r6 = await runWeeklyDigests({ now: w4, send: fake, emailsFor, consoleUrl: BASE });
ok(r5.failed === 1 && r6.sent === 1, "ส่งล้มไม่ถูกนับว่าส่งแล้ว — รอบถัดไปในวันเดียวกันส่งได้");
const w5 = new Date(+now + 28 * 864e5);
const saved = { k: process.env.RESEND_API_KEY, f: process.env.DIGEST_FROM };
delete process.env.RESEND_API_KEY; delete process.env.DIGEST_FROM;
const r7 = await runWeeklyDigests({ now: w5, send: resendSender, emailsFor, consoleUrl: BASE });
ok(r7.notConfigured && r7.sent === 0 && r7.failed === 0, "ไม่ได้ตั้ง RESEND_API_KEY/DIGEST_FROM = ข้าม ไม่ล้ม");
const r8 = await runWeeklyDigests({ now: w5, send: fake, emailsFor, consoleUrl: BASE });
ok(r8.sent === 1, "ไม่ได้ตั้งค่าแล้วไม่บันทึกว่าส่ง — ตั้งค่าแล้วส่งได้ในวันเดียวกัน");
if (saved.k) process.env.RESEND_API_KEY = saved.k;
if (saved.f) process.env.DIGEST_FROM = saved.f;
const noMail = await runWeeklyDigests({ now: new Date(+now + 35 * 864e5), send: fake, emailsFor: async () => new Map(), consoleUrl: BASE });
ok(noMail.noEmail === 1 && noMail.sent === 0, "หาอีเมลของผู้ใช้ไม่พบ = ไม่ส่ง");

// ── ด่าน secret ของ cron ──
const savedSecret = process.env.CRON_SECRET;
process.env.CRON_SECRET = "digest-secret-for-verify";
const call = (auth?: string) => handleDigestCron(
  new Request("https://console.example/api/cron/digest", { headers: auth ? { authorization: auth } : {} }),
  { now: new Date(+now + 42 * 864e5), send: fake, emailsFor, consoleUrl: BASE });
const n4 = sent.length;
ok((await call()).status === 401, "ไม่มี Authorization = 401");
ok((await call("Bearer wrong-secret")).status === 401 && (await call("digest-secret-for-verify")).status === 401
  && (await call("Bearer digest-secret-for-veri")).status === 401, "secret ผิด · ส่งแค่บางส่วน · ไม่มี Bearer = 401");
ok(sent.length === n4, "คำขอที่ถูกปฏิเสธไม่ส่งอะไรเลย");
const good = await call("Bearer digest-secret-for-verify");
const body = (await good.json()) as { sent: number };
ok(good.status === 200 && body.sent === 1 && sent.length === n4 + 1, "secret ถูก = ทำงานและรายงานจำนวน (ไม่มีอีเมลในคำตอบ)");
delete process.env.CRON_SECRET;
ok(!cronAuthorized("Bearer ") && !cronAuthorized("Bearer undefined") && (await call("Bearer ")).status === 401,
  "ไม่ได้ตั้ง CRON_SECRET = ปฏิเสธทุกคำขอ (ไม่เปิดโล่ง)");
if (savedSecret) process.env.CRON_SECRET = savedSecret;

// ── ตัวสร้างอีเมลบริสุทธิ์ ──
const zero = Object.fromEntries(QUEUE_SECTIONS.map((s) => [s, 0])) as DigestCounts["queue"];
const e = buildDigest({ tenantName: "<script>x</script>", day: today, queue: zero, reviewsNotBlocking: 0, opportunities: { moved: 0, stuck: 0 },
  jobMovesThisWeek: 0, expiring: { due: 0, dueSoon: 0 }, requests: { open: 0, overdue: 0 } }, BASE + "/");
ok(!e.html.includes("<script>") && e.html.includes("&lt;script&gt;") && e.subject.includes("ไม่มีงานค้าง") && !e.text.includes("//app"),
  "HTML หนีอักขระของชื่อบัญชี · ไม่มีงาน = หัวเรื่องบอกว่าไม่มีงานค้าง");

// ── สายไฟ: route · cron ของ Vercel · ไม่มี dependency ใหม่ ──
const route = readFileSync("app/api/cron/digest/route.ts", "utf8");
ok(/export async function GET\(req: Request\)[\s\S]*handleDigestCron\(req\)/.test(route), "route GET ส่งต่อให้ด่านเดียวกับที่ชุดนี้ตรวจ");
const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons?: { path: string; schedule: string }[] };
ok(Boolean(vercel.crons?.some((c) => c.path === "/api/cron/digest" && c.schedule === "0 1 * * *")), "vercel.json ยิงวันละครั้ง 01:00 UTC (08:00 ไทย)");
const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { dependencies: Record<string, string> };
ok(!Object.keys(pkg.dependencies).some((k) => /resend|nodemailer|sendgrid|postmark/i.test(k)), "ส่งผ่าน fetch ไม่เพิ่ม dependency");

for (const line of out) console.log(line);
const failed = out.filter((l) => l.startsWith("FAIL"));
if (failed.length) {
  console.log(`\n=== FAIL ${failed.length} ข้อ ===`);
  process.exit(1);
}
console.log(`\n=== ผ่านทั้งหมด ${out.length} ข้อ ===`);
