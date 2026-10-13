/* ── ความแม่นของการรวมตัวตน บนข้อมูลสมมุติที่มีเฉลย (docs/plan.md B3) ─────────

   นำเข้าไฟล์สามไฟล์ของแต่ละกลุ่มผ่านเส้นทางจริง (ลงทะเบียนแหล่ง → ตรวจไฟล์ → ยืนยัน) แล้วตรวจตัวตน
   จากนั้นเทียบกับเฉลยแบบคู่แถว:
     precision = คู่แถวที่ระบบรวมเป็นคนเดียวกัน และเฉลยบอกว่าคนเดียวกันจริง ÷ คู่ที่ระบบรวม
     recall    = คู่ที่รวมถูก ÷ คู่ที่เฉลยบอกว่าเป็นคนเดียวกัน
   รายงานสองแบบ: รวมเองอย่างเดียว · และถ้า data steward ยอมรับทุกคู่ในคิว (บอกว่าคิวมีประโยชน์แค่ไหน)

   ⚠ นี่คือไม้บรรทัดบนข้อมูลสมมุติ ไม่ใช่ความแม่นบนข้อมูลลูกค้า (Blueprint บท 4: ต้องวัดกับตัวอย่างที่คนตรวจ)
   เกณฑ์ (plan หัวข้อ 4.4 / B3): precision ของการรวมเอง ≥ 98% · recall ≥ 90% เมื่อรวมคิวที่คนยอมรับ */
import "./isolate.mts";
import { ensureReady } from "@/lib/engine/bootstrap";
import { all, get } from "@/lib/engine/sql";
import { registerSource } from "@/lib/engine/vault/sources";
import { analyseUpload, commitUpload } from "@/lib/engine/vault/intake";
import { resolveTenant } from "@/lib/engine/vault/resolve";
import { fileBytes, generateSynthetic, type Segment } from "@/lib/shared/synthetic-b2b";

const out: string[] = [];
const ok = (c: boolean, m: string) => out.push(`${c ? "PASS" : "FAIL"}  ${m}`);
const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
const c2 = (n: number) => (n * (n - 1)) / 2;

await ensureReady();

const TENANT: Record<Segment, string> = { events: "mst-golf", services: "hongmove" };
for (const segment of ["events", "services"] as Segment[]) {
  const T = TENANT[segment];
  const syn = generateSynthetic({ segment });
  const src = await registerSource(T, {
    name: `ไฟล์สมมุติ ${segment}`, kind: "file", newPurpose: "ทดสอบความแม่น",
    acquisitionNote: "ข้อมูลสมมุติจากตัวสร้าง ไม่ใช่ข้อมูลของใคร",
    fields: ["customer_name", "first_name", "last_name", "company", "job_title", "email", "phone", "occurred_at"],
  }, "verify");
  if (!src.ok) { ok(false, `[${segment}] ลงทะเบียนแหล่งไม่ได้: ${src.error}`); continue; }

  const batchOf = new Map<string, string>();
  for (const f of syn.files) {
    const bytes = fileBytes(f);
    const an = await analyseUpload(T, src.id, bytes, f.name, "verify");
    if (!an.ok) { ok(false, `[${segment}] ${f.name}: ${an.error}`); continue; }
    const done = await commitUpload(T, src.id, bytes, f.name, Object.fromEntries(an.columns.map((c) => [c.index, c.field])), an.sha256, "verify");
    if (done.ok) batchOf.set(done.batchId, f.name);
  }
  const t0 = Date.now();
  const stats = await resolveTenant(T, "verify");
  const secs = (Date.now() - t0) / 1000;
  ok(stats.rows > 9000, `[${segment}] ตรวจตัวตน ${stats.rows} แถวใน ${secs.toFixed(1)} วินาที → ${stats.people} คน · ${stats.orgs} องค์กร · คิว ${stats.personPairs} คู่ / ${stats.orgGroups} กลุ่มองค์กร`);

  // ── เทียบเฉลย ──
  const rows = await all<{ batch_id: string; line: number | string; customer_id: string | null; status: string }>(
    `SELECT batch_id, line, customer_id, status FROM import_rows WHERE tenant_id = ? AND batch_id IN (${[...batchOf.keys()].map(() => "?").join(",")})`,
    T, ...batchOf.keys(),
  );
  const truth = new Map(syn.truth.map((t) => [`${t.file}#${t.line + 1}`, t])); // บรรทัดในไฟล์ = แถวข้อมูล + 1 (หัวคอลัมน์)
  const pred = new Map<string, number>(), real = new Map<string, number>(), both = new Map<string, number>();
  let rowsWithPerson = 0, pendingLeft = 0;
  for (const r of rows) {
    if (r.status === "pending_review") pendingLeft++;
    const t = truth.get(`${batchOf.get(r.batch_id)}#${Number(r.line)}`);
    if (!t?.personKey || !r.customer_id) continue;
    rowsWithPerson++;
    pred.set(r.customer_id, (pred.get(r.customer_id) ?? 0) + 1);
    real.set(t.personKey, (real.get(t.personKey) ?? 0) + 1);
    const k = `${r.customer_id}|${t.personKey}`;
    both.set(k, (both.get(k) ?? 0) + 1);
  }
  const sum = (m: Map<string, number>) => [...m.values()].reduce((a, n) => a + c2(n), 0);
  const tp = sum(both), pp = sum(pred), rp = sum(real);
  const precision = pp ? tp / pp : 1, recall = rp ? tp / rp : 1;
  ok(pendingLeft === 0, `[${segment}] ไม่มีแถวค้างรอตรวจหลังตรวจตัวตน`);
  ok(precision >= 0.98, `[${segment}] precision ของการรวมเอง ${pct(precision)} (เกณฑ์ ≥ 98%)`);

  // ถ้า steward ยอมรับทุกคู่ในคิว: รวมกลุ่มตามคู่ แล้ววัดใหม่
  const pairs = await all<{ subject_ids: string }>("SELECT subject_ids FROM review_items WHERE tenant_id = ? AND kind = 'person_pair'", T);
  const parent = new Map<string, string>();
  const find = (x: string): string => { while (parent.has(x) && parent.get(x) !== x) x = parent.get(x)!; return x; };
  for (const p of pairs) { const [a, b] = JSON.parse(p.subject_ids) as string[]; const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb); }
  const pred2 = new Map<string, number>(), both2 = new Map<string, number>();
  for (const [k, n] of both) {
    const [cid, pk] = k.split("|");
    const g = find(cid);
    both2.set(`${g}|${pk}`, (both2.get(`${g}|${pk}`) ?? 0) + n);
  }
  for (const [cid, n] of pred) pred2.set(find(cid), (pred2.get(find(cid)) ?? 0) + n);
  const tp2 = sum(both2), pp2 = sum(pred2);
  const recall2 = rp ? tp2 / rp : 1, precision2 = pp2 ? tp2 / pp2 : 1;
  ok(recall2 >= 0.9, `[${segment}] recall เมื่อ steward ยอมรับคู่ในคิว ${pct(recall2)} (เกณฑ์ ≥ 90%) · precision ${pct(precision2)} · รวมเองอย่างเดียว recall ${pct(recall)}`);
  ok(pairs.length > 0 && pairs.length < stats.people, `[${segment}] คิวมีขนาดที่คนตรวจไหว (${pairs.length} คู่ จาก ${stats.people} คน)`);

  // ── กติกา Blueprint ──
  const subsidiaries = syn.orgs.filter((o) => o.parentKey);
  const merged = await get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM orgs WHERE tenant_id = ? AND lifecycle_state = 'confirmed'", T,
  );
  ok(Number(merged!.n) === 0, `[${segment}] ระบบไม่ยืนยันองค์กรเอง — ทุกองค์กรรอคนตรวจหรืออยู่ในสถานะรับเข้า`);
  ok(subsidiaries.length > 0, `[${segment}] ข้อมูลมีบริษัทในเครือ ${subsidiaries.length} ราย (แยกนิติบุคคล — ไม่มีกฎรวมจากความเป็นเครือ)`);
  const genericPeople = await get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM contact_points WHERE tenant_id = ? AND kind = 'email' AND value_masked LIKE 'i%@%' AND source LIKE 'vault:%'", T,
  );
  ok(Number(genericPeople!.n) === 0, `[${segment}] อีเมลกลาง (info@) ไม่ถูกเก็บเป็นช่องทางของคน`);

  // ── ทำซ้ำได้ ──
  const before = await get<{ n: number }>("SELECT COUNT(*) AS n FROM customers WHERE tenant_id = ?", T);
  const again = await resolveTenant(T, "verify");
  const after = await get<{ n: number }>("SELECT COUNT(*) AS n FROM customers WHERE tenant_id = ?", T);
  ok(again.rows === 0 && Number(before!.n) === Number(after!.n), `[${segment}] ตรวจตัวตนซ้ำไม่สร้างคนเพิ่ม`);
}

for (const line of out) console.log(line);
const failed = out.filter((l) => l.startsWith("FAIL"));
if (failed.length) {
  console.log(`\n=== FAIL ${failed.length} ข้อ ===`);
  process.exit(1);
}
console.log(`\n=== ผ่านทั้งหมด ${out.length} ข้อ ===`);
