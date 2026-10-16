/* ── ทดสอบโหลดขนาด pilot (docs/plan.md B7 · เกณฑ์บริการ "ค้นทั่วไป p95 ≤ 2 วินาที") ─────────

   ข้อมูลสมมุติ 10,000 รายการต้นทาง (สามไฟล์เละ เหมือน pilot SETA) → นำเข้า → ตรวจตัวตน
   แล้ววัดการอ่านที่ผู้ใช้ทำทุกวัน หลายรอบด้วยค่าค้นต่างกัน: ค้นรายชื่อ · รายการบัญชีบริษัท · เปิดแฟ้มบริษัท · หน้าวันนี้
   ตกเมื่อ p95 ของการอ่านใดเกิน 2 วินาที · เวลานำเข้า/ตรวจตัวตน/สร้างรายชื่อแคมเปญรายงานไว้ แต่ไม่ใช่เกณฑ์

   ไม่มี DATABASE_URL = sqlite ชั่วคราว · มี = Postgres ในนามผู้ใช้จริง (RLS) — ใน CI รันหลัง verify:pg
   ⚠ ห้ามชี้ไปที่ production: สร้างบัญชีทดสอบและนำเข้าหมื่นแถว
   ปรับขนาด: LOAD_ROWS=100000 npm run verify:load */
import "./isolate.mts";
import { randomUUID } from "node:crypto";

const ROWS = Number(process.env.LOAD_ROWS ?? 10_000);
const RUNS = Number(process.env.LOAD_RUNS ?? 20);
const P95_MS = 2000;
const pg = Boolean(process.env.DATABASE_URL);

const { ensureReady } = await import("@/lib/engine/bootstrap");
const { all, run, withIdentity } = await import("@/lib/engine/sql");
const { registerSource } = await import("@/lib/engine/vault/sources");
const { analyseUpload, commitUpload } = await import("@/lib/engine/vault/intake");
const { resolveTenant } = await import("@/lib/engine/vault/resolve");
const { searchCustomers } = await import("@/lib/engine/customers");
const { listAccounts, getDossier } = await import("@/lib/engine/accounts");
const { todayQueue } = await import("@/lib/engine/today");
const { listContacts } = await import("@/lib/engine/accounts/contacts-list");
const { adoptTemplate } = await import("@/lib/engine/policy/templates");
const { createCampaign, buildTargets } = await import("@/lib/engine/campaigns");
const { fileBytes, generateSynthetic } = await import("@/lib/shared/synthetic-b2b");

await ensureReady();
const T = pg ? `load-${randomUUID().slice(0, 8)}` : "hongmove";
const uid = randomUUID();
const ME = `${uid}@load.example`;
const VIEWER = { id: ME, clearance: "confidential" as const };
if (pg) {
  const now = new Date().toISOString();
  await run("INSERT INTO tenants (id, name, cycle_shape, created_at) VALUES (?, ?, ?, ?)", T, "บัญชีทดสอบโหลด", "event", now);
  await run("INSERT INTO auth.users (id, email) VALUES (?, ?)", uid, ME);
  await run("INSERT INTO tenant_users (user_id, tenant_id, role) VALUES (?, ?, 'owner')", uid, T);
}
const as = <R,>(fn: () => Promise<R>) => (pg ? withIdentity(uid, fn) : fn());
const timed = async <R,>(fn: () => Promise<R>) => { const t = performance.now(); const r = await fn(); return { ms: performance.now() - t, r }; };

// ── เตรียมข้อมูล ──
const prep: string[] = [];
const sponsor = await as(() => adoptTemplate(T, "b2b_sponsor_offer", "ทดสอบโหลด (สมมุติ)", ME));
if (!sponsor.ok) throw new Error(sponsor.error);
const syn = generateSynthetic({ segment: "events", sourceRows: ROWS });
const src = await as(() => registerSource(T, {
  name: "ไฟล์ทดสอบโหลด (สมมุติ)", kind: "file", purposeId: sponsor.purposeId, acquisitionNote: "ข้อมูลสมมุติจากตัวสร้าง",
  fields: ["customer_name", "first_name", "last_name", "company", "job_title", "email", "phone", "occurred_at"],
}, ME));
if (!src.ok) throw new Error(src.error);
const imp = await timed(async () => {
  /* เพดานอัปโหลด 5MB ต่อไฟล์ — ขนาดใหญ่แบ่งเป็นหลายไฟล์เหมือนที่ผู้ใช้ต้องทำ */
  const parts = syn.files.flatMap((f) => Array.from({ length: Math.ceil(f.rows.length / 15_000) }, (_, k) =>
    ({ ...f, name: f.rows.length > 15_000 ? f.name.replace(/(\.\w+)$/, `-${k + 1}$1`) : f.name, rows: f.rows.slice(k * 15_000, (k + 1) * 15_000) })));
  for (const f of parts) {
    const bytes = fileBytes(f);
    const an = await as(() => analyseUpload(T, src.id, bytes, f.name, ME));
    if (!an.ok) throw new Error(`${f.name}: ${an.error}`);
    const done = await as(() => commitUpload(T, src.id, bytes, f.name, Object.fromEntries(an.columns.map((c) => [c.index, c.field])), an.sha256, ME));
    if (!done.ok) throw new Error(`${f.name}: ${done.error}`);
  }
});
prep.push(`นำเข้า ${syn.files.reduce((s, f) => s + f.rows.length, 0).toLocaleString()} แถว ${(imp.ms / 1000).toFixed(1)} วินาที`);
const res = await timed(() => as(() => resolveTenant(T, ME)));
prep.push(`ตรวจตัวตน ${(res.ms / 1000).toFixed(1)} วินาที → ${res.r.people.toLocaleString()} คน`);
const camp = await as(() => createCampaign(T, { name: "แคมเปญทดสอบโหลด", purposeId: sponsor.purposeId, channel: "email", messageKind: "marketing", criteria: { titleKeywords: ["ผู้จัดการ", "manager"] } }, ME));
if (camp.ok) {
  const bt = await timed(() => as(() => buildTargets(T, camp.id, ME)));
  prep.push(`สร้างรายชื่อแคมเปญ ${(bt.ms / 1000).toFixed(1)} วินาที`);
}

// ── วัดการอ่าน ──
const people = await all<{ name: string }>("SELECT name FROM customers WHERE tenant_id = ? ORDER BY id LIMIT 200", T);
const orgs = await all<{ id: string; name: string }>("SELECT id, name FROM orgs WHERE tenant_id = ? ORDER BY id LIMIT 200", T);
const pick = <X,>(xs: X[], i: number) => xs[(i * 37) % xs.length];
/* แต่ละการอ่านคืนจำนวนรายการที่ได้ — ได้ศูนย์ในรอบอุ่นเครื่อง = วัดของว่าง (เร็วเพราะไม่ได้ทำอะไร) ถือว่าตก */
const cases: { name: string; fn: (i: number) => Promise<number> }[] = [
  { name: "ค้นรายชื่อด้วยชื่อ", fn: async (i) => (await searchCustomers(T, { q: pick(people, i).name.split(" ")[0] })).rows.length },
  { name: "รายชื่อหน้าแรก (เรียงล่าสุด)", fn: async (i) => (await searchCustomers(T, { page: 1 + (i % 3) })).rows.length },
  { name: "ค้นบัญชีบริษัท", fn: async (i) => (await listAccounts(T, { q: pick(orgs, i).name.slice(0, 6), viewer: VIEWER })).rows.length },
  { name: "เปิดแฟ้มบริษัท", fn: async (i) => (await getDossier(T, pick(orgs, i).id, VIEWER))?.people.length ?? 0 },
  { name: "หน้าวันนี้", fn: async () => (await todayQueue(T, VIEWER)).sections.length },
  { name: "รายการผู้ติดต่อ เรียงตามบริษัท", fn: async (i) => (await listContacts(T, { sort: "org", page: 1 + (i % 3) }, VIEWER)).rows.length },
  { name: "รายการบริษัท มุมมองเงียบ", fn: async () => (await listAccounts(T, { view: "quiet", viewer: VIEWER })).rows.length },
];

const out: string[] = [];
let failed = 0;
for (const c of cases) {
  const ms: number[] = [];
  const warm = await as(() => c.fn(0)); // อุ่นเครื่อง
  if (!warm) { failed++; out.push(`FAIL  ${c.name}: ไม่ได้ข้อมูลเลย — วัดของว่าง`); continue; }
  for (let i = 0; i < RUNS; i++) ms.push((await timed(() => as(() => c.fn(i + 1)))).ms);
  ms.sort((a, b) => a - b);
  const p = (q: number) => ms[Math.min(ms.length - 1, Math.ceil(q * ms.length) - 1)];
  const pass = p(0.95) <= P95_MS;
  if (!pass) failed++;
  out.push(`${pass ? "PASS" : "FAIL"}  ${c.name}: p50 ${p(0.5).toFixed(0)} ms · p95 ${p(0.95).toFixed(0)} ms · สูงสุด ${ms.at(-1)!.toFixed(0)} ms`);
}

if (pg) {
  await run("DELETE FROM tenants WHERE id = ?", T);
  await run("DELETE FROM auth.users WHERE id = ?", uid);
}
console.log(`ฐาน: ${pg ? "Postgres (ในนามผู้ใช้ · RLS)" : "sqlite"} · ${RUNS} รอบต่อการอ่าน · เกณฑ์ p95 ≤ ${P95_MS} ms`);
for (const l of prep) console.log(`      ${l}`);
for (const l of out) console.log(l);
if (failed) {
  console.log(`\n=== FAIL ${failed} ข้อ ===`);
  process.exit(1);
}
console.log(`\n=== ผ่านทั้งหมด ${out.length} ข้อ ===`);
