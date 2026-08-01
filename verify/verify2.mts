import { all, get, run } from "@/lib/engine/sql";
import "./isolate.mts";

import { runMatch } from "@/lib/engine/match";
import { approveCampaign, sendCampaign } from "@/lib/engine/dispatch";
import { measureCampaign } from "@/lib/engine/proof";
import { TENANT_ID } from "@/lib/engine/seed";
import { ensureReady } from "@/lib/engine/bootstrap";

await ensureReady();
const T = TENANT_ID;
const out: string[] = [];
const ok = (c: boolean, m: string) => out.push(`${c ? "PASS" : "FAIL"}  ${m}`);

/* ปิดช่วงเวลาห้ามส่งแบบที่ชนนาฬิกาไม่ได้

   เดิมตั้ง 23→0 โดยตั้งใจให้เป็น "หน้าต่างที่แคบจนไม่น่าโดน" แต่มันคือ
   หน้าต่างจริงหนึ่งชั่วโมง ชุดตรวจจึงล้มเองวันละหนึ่งชั่วโมงตอน 23:xx
   (เจอจริงตอน 23:02) การทดสอบที่ล้มตามเวลาที่รันแย่กว่าไม่มีการทดสอบ

   ตรรกะใน sendCampaign คือ
     qs > qe ? (hour >= qs || hour < qe) : (hour >= qs && hour < qe)
   ตั้ง qs = qe = 0 จะเข้ากิ่งหลังเสมอ แล้วได้ hour >= 0 && hour < 0
   ซึ่งเป็นเท็จทุกชั่วโมง — ปิดได้จริงโดยไม่ขึ้นกับนาฬิกา */
await run("UPDATE tenants SET quiet_hours_start=0, quiet_hours_end=0 WHERE id=?", T);

// ── อนุมัติหลายแคมเปญเพื่อให้เพดานความถี่ได้ทำงาน (cap = 2/สัปดาห์) ──
const approved: string[] = [];
for (let round = 0; round < 8; round++) {
  const { candidates } = await runMatch(T);
  const c = candidates.find((x) => !x.blocked && x.play.engine === "keep" && x.audience.length >= 40);
  if (!c) break;
  const r = await approveCampaign(c, { tenantId: T, playId: c.play.id, approvedBy: "test" });
  approved.push(r.campaignId);
  out.push(`  อนุมัติ ${c.play.id} · ${r.audienceSize} คน · treated ${r.treated} · holdout ${r.holdout}`);
}
ok(approved.length >= 3, `อนุมัติได้ ${approved.length} แคมเปญติดกัน`);

// ── F12 idempotency บนแคมเปญแรก ──
const first = approved[0];
const treated = (await get<{t:number}>("SELECT treated_size t FROM campaigns WHERE id=?", first))!.t;
const s1 = await sendCampaign(first);
const s2 = await sendCampaign(first);
const msgs = (await get<{n:number}>("SELECT COUNT(*) n FROM messages WHERE campaign_id=?", first))!.n;
ok(!s1.skippedQuietHours, "F10 ออกจากช่วงห้ามส่งแล้ว ส่งได้");
ok(s1.sent === treated, `F12 ครั้งแรกส่ง ${s1.sent} = treated ${treated}`);
ok(s2.sent === 0, `F12 เรียกซ้ำส่งเพิ่ม ${s2.sent} แถว`);
ok(msgs === treated, `F12 messages ทั้งหมด ${msgs} ไม่เกิน treated`);

// ── F9 เพดานความถี่ข้ามทุกแคมเปญ ──
const { candidates: after } = await runMatch(T);
const capMsgs = after.flatMap(c => c.filtered).filter(f => f.reason.includes("cap") || f.reason.includes("Messaged within") || f.reason.includes("control group"));
const capTotal = capMsgs.reduce((s,f)=>s+f.count,0);
ok(capTotal > 0, `F9 มีคนถูกตัดออกเพราะเบรกความถี่/กลุ่มควบคุม ${capTotal} ราย ใน ${capMsgs.length} play`);
out.push("  เหตุผลที่ตัดออก: " + [...new Set(capMsgs.map(f=>f.reason))].join(" | "));

// ── คนหนึ่งคนไม่ได้รับเกินเพดานใน 7 วัน ──
// เพดานเป็น "ต่อสัปดาห์" จึงต้องนับในหน้าต่าง 7 วันเท่านั้น
// ประวัติที่ seed ไว้มีอายุ 95-215 วัน การนับตลอดชีพจะฟ้องผิด
const since7 = new Date(Date.now() - 7*86400000).toISOString();
const worst = await get<{customer_id:string;n:number}>(`SELECT ca.customer_id, COUNT(*) n
  FROM campaign_audience ca JOIN campaigns c ON c.id=ca.campaign_id
  WHERE c.tenant_id=? AND c.dry_run=0 AND ca.arm='treated' AND c.approved_at >= ?
  GROUP BY ca.customer_id ORDER BY n DESC LIMIT 1`, T, since7);
ok((worst?.n ?? 0) <= 2, `F9 คนที่ถูกติดต่อมากสุดได้ ${worst?.n ?? 0} ครั้ง ครั้งใน 7 วัน ไม่เกินเพดาน 2`);

// ── กลุ่มที่เปิดค้างไม่ถูกดึงซ้ำ ──
const overlap = (await get<{n:number}>(`SELECT COUNT(*) n FROM (
  SELECT ca.customer_id FROM campaign_audience ca JOIN campaigns c ON c.id=ca.campaign_id
  WHERE c.tenant_id=? AND c.status='measuring' GROUP BY ca.customer_id HAVING COUNT(DISTINCT c.id) > 2)`, T))!;
ok(overlap.n === 0, `ไม่มีใครอยู่ในแคมเปญที่กำลังวัดเกิน 2 ตัวพร้อมกัน (พบ ${overlap.n})`);

// ── verdict ──
for (const id of approved) await measureCampaign(id);
const verdicts = await all<{verdict:string;n:number}>(`SELECT verdict, COUNT(*) n FROM attributions a
  JOIN campaigns c ON c.id=a.campaign_id WHERE c.tenant_id=? GROUP BY verdict`, T);
out.push(`  verdict: ${verdicts.map(v=>`${v.verdict}=${v.n}`).join(" ")}`);
ok(verdicts.every(v=>["positive","no_effect","insufficient_data"].includes(v.verdict)), "H5 verdict อยู่ในสามค่าเท่านั้น");

/* ── เครดิตข้อความห้ามติดลบ ──
   เพดานที่ไม่บังคับใช้ไม่ใช่เพดาน เครดิตเป็นทรัพยากรที่จ่ายเงินซื้อ */
const neg = await all<{id:string;c:number}>("SELECT id, message_credits c FROM tenants WHERE message_credits < 0");
ok(neg.length === 0, `เครดิตไม่ติดลบทุกบัญชี${neg.length ? " — " + neg.map(t=>`${t.id}=${t.c}`).join(", ") : ""}`);

console.log(out.join("\n"));
console.log(out.some(l=>l.startsWith("FAIL")) ? "\n=== มี FAIL ===" : "\n=== ผ่านทั้งหมด ===");
