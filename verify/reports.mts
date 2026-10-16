/* ── รายงาน 4 กราฟ (docs/ux-plan.md U6) ── ตัวเลขตรงกับข้อมูล · ดีลของบริษัทเกินสิทธิ์ไม่ถูกนับ · สัปดาห์เรียงต่อกัน 12 ช่อง */
import "./isolate.mts";
import { randomUUID } from "node:crypto";
import { ensureReady } from "@/lib/engine/bootstrap";
import { run } from "@/lib/engine/sql";
import { createDeal, moveDeal } from "@/lib/engine/deals";
import { reports } from "@/lib/engine/reports";

const out: string[] = [];
const ok = (c: boolean, m: string) => out.push(`${c ? "PASS" : "FAIL"}  ${m}`);
const T = "hongmove";
const ME = { id: "bd@verify", clearance: "confidential" as const };
await ensureReady();
const now = new Date().toISOString();
const org = async (cls: string) => {
  const id = `o-${randomUUID().slice(0, 8)}`;
  await run("INSERT INTO orgs (id, tenant_id, name, name_norm, classification, lifecycle_state, recorded_at, created_at) VALUES (?,?,?,?,?,?,?,?)", id, T, id, id, cls, "confirmed", now, now);
  return id;
};
const A = await org("confidential"), S = await org("restricted_high");
const d1 = await createDeal(T, { orgId: A, name: "ดีลหนึ่ง (สมมุติ)", value: "100000" }, ME);
const d2 = await createDeal(T, { orgId: A, name: "ดีลสอง (สมมุติ)", value: "50000" }, ME);
if (d2.ok) await moveDeal(T, d2.id, "proposal", ME);
const d3 = await createDeal(T, { orgId: A, name: "ดีลสาม (สมมุติ)", value: "70000" }, ME);
if (d3.ok) await moveDeal(T, d3.id, "won", ME);
await run("INSERT INTO opportunities (id, tenant_id, org_id, name, stage, value, owner_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)", randomUUID(), T, S, "ดีลลับ", "open", 999999, "boss", now, now);
await run("INSERT INTO interactions (id, tenant_id, kind, occurred_at, org_id, summary, recorded_at) VALUES (?,?,?,?,?,?,?)", randomUUID(), T, "meeting", now, A, "ประชุม (สมมุติ)", now);
await run("INSERT INTO interactions (id, tenant_id, kind, occurred_at, org_id, summary, recorded_at) VALUES (?,?,?,?,?,?,?)", randomUUID(), T, "call", now, A, "โทร (สมมุติ)", now);

const r = await reports(T, ME);
const st = (s: string) => r.pipeline.find((p) => p.stage === s)!;
ok(d1.ok && st("open").count === 1 && st("open").value === 100000 && st("proposal").count === 1 && st("proposal").value === 50000, "ไปป์ไลน์นับจำนวนและมูลค่าต่อขั้นถูก");
ok(!r.pipeline.some((p) => p.value >= 999999), "ดีลของบริษัทเกินสิทธิ์ไม่ถูกนับ");
ok(r.wonThisQuarter.count === 1 && r.wonThisQuarter.value === 70000, "ปิดได้ไตรมาสนี้ถูก");
ok(r.activity.length === 12 && r.activity.every((w, i) => i === 0 || w.week > r.activity[i - 1].week), "12 สัปดาห์เรียงต่อกัน");
const last = r.activity.at(-1)!;
ok(last.meeting === 1 && last.call === 1, "กิจกรรมสัปดาห์นี้แยกชนิดถูก");
ok(r.funnel.length === 6 && r.funnel.every((s, i) => i === 0 || s.count <= r.funnel[0].count), "กรวยแคมเปญ 6 ขั้น ไม่มีขั้นไหนเกินจำนวนเป้าหมาย");
ok(r.quality.length === 4 && r.quality.every((q) => q.of === 0 || q.count <= q.of), "คุณภาพข้อมูลไม่มีตัวเลขเกินฐาน");

for (const line of out) console.log(line);
const failed = out.filter((l) => l.startsWith("FAIL"));
if (failed.length) { console.log(`\n=== FAIL ${failed.length} ข้อ ===`); process.exit(1); }
console.log(`\n=== ผ่านทั้งหมด ${out.length} ข้อ ===`);
