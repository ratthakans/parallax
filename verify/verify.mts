import "./isolate.mts";

import { runMatch } from "@/lib/match";
import { approveCampaign, sendCampaign, armFor } from "@/lib/dispatch";
import { measureCampaign, roiSummary } from "@/lib/proof";
import { db } from "@/lib/db";
import { TENANT_ID } from "@/lib/seed";
import { ensureReady } from "@/lib/bootstrap";

await ensureReady();
const T = TENANT_ID;
const out: string[] = [];
const ok = (c: boolean, m: string) => out.push(`${c ? "PASS" : "FAIL"}  ${m}`);

// เลือก candidate ที่ใหญ่พอจะมี holdout จริง
const { candidates } = runMatch(T);
const c = candidates.find((x) => !x.blocked && x.audience.length >= 300);
if (!c) throw new Error("no candidate with holdout");
out.push(`play=${c.play.id} size=${c.audience.length} holdout=${c.holdout_pct}% mode=${c.measurement}`);

// ── H1 แช่แข็ง audience ──
const r = await approveCampaign(c, { tenantId: T, playId: c.play.id, approvedBy: "test" });
const frozen = db().prepare("SELECT COUNT(*) n FROM campaign_audience WHERE campaign_id=?").get(r.campaignId) as {n:number};
ok(frozen.n === c.audience.length, `H1 audience แช่แข็งครบ ${frozen.n}/${c.audience.length}`);
ok(r.treated + r.holdout === c.audience.length, `H1 treated+holdout = กลุ่มทั้งหมด (${r.treated}+${r.holdout})`);
ok(r.holdout > 0, `H1 มี holdout จริง ${r.holdout} คน`);

// ── H2 hash split ทำซ้ำได้ ──
const rows = db().prepare("SELECT customer_id, arm FROM campaign_audience WHERE campaign_id=?").all(r.campaignId) as {customer_id:string;arm:string}[];
const mismatches = rows.filter((x) => armFor(x.customer_id, r.campaignId, c.holdout_pct) !== x.arm);
ok(mismatches.length === 0, `H2 คำนวณ arm ซ้ำตรงกันทุกแถว (ไม่ตรง ${mismatches.length})`);
const share = (rows.filter(x=>x.arm==="holdout").length / rows.length) * 100;
ok(Math.abs(share - c.holdout_pct) < 5, `H2 สัดส่วน holdout ${share.toFixed(1)}% ใกล้เป้า ${c.holdout_pct}%`);

// ── F12 idempotency ──
const s1 = sendCampaign(r.campaignId);
const s2 = sendCampaign(r.campaignId);
const s3 = sendCampaign(r.campaignId);
const msgs = db().prepare("SELECT COUNT(*) n FROM messages WHERE campaign_id=?").get(r.campaignId) as {n:number};
if (s1.skippedQuietHours) {
  ok(msgs.n === 0, "F10 ช่วงเวลาห้ามส่ง — ไม่ส่งเลย ถูกต้อง");
} else {
  ok(s1.sent === r.treated, `F12 ครั้งแรกส่ง ${s1.sent} = treated ${r.treated}`);
  ok(s2.sent === 0 && s3.sent === 0, `F12 เรียกซ้ำส่งเพิ่ม 0 (${s2.sent}, ${s3.sent})`);
  ok(msgs.n === r.treated, `F12 แถว messages = ${msgs.n} ไม่เกิน treated`);
}

// ── holdout ไม่ได้รับข้อความเด็ดขาด ──
const leak = db().prepare(`SELECT COUNT(*) n FROM messages m JOIN campaign_audience a
  ON a.campaign_id=m.campaign_id AND a.customer_id=m.customer_id
  WHERE m.campaign_id=? AND a.arm='holdout'`).get(r.campaignId) as {n:number};
ok(leak.n === 0, `holdout ไม่ได้รับข้อความ (รั่ว ${leak.n})`);

// ── B8 ความยินยอมถูกกรองที่ชั้น dispatch ──
const noConsent = db().prepare(`SELECT COUNT(*) n FROM campaign_audience a
  JOIN customer_features f ON f.customer_id=a.customer_id
  WHERE a.campaign_id=? AND json_extract(f.payload,'$.consent_marketing')=0`).get(r.campaignId) as {n:number};
ok(noConsent.n === 0, `B8 ไม่มีคนที่ไม่ยินยอมอยู่ในทุก play (พบ ${noConsent.n})`);

// ── H3 กติกาการวัดตามขนาด + verdict สามค่า ──
const attrs = measureCampaign(r.campaignId);
ok(attrs.length === 3, `H6 วัดครบ T+7 / T+30 / T+90 (${attrs.length})`);
const v = attrs.map(a=>a.verdict);
ok(v.every(x=>["positive","no_effect","insufficient_data"].includes(x)), `H5 verdict อยู่ในสามค่า: ${v.join(", ")}`);
ok(attrs.every(a=>a.ci_low <= a.ci_high), "H4 ช่วงความเชื่อมั่นถูกต้อง low <= high");
ok(v.includes("insufficient_data"), "H5 แสดง insufficient_data ตรง ๆ เมื่อยังไม่ครบกำหนด");

// ── F9 เพดานความถี่ข้ามแคมเปญ ──
const after = runMatch(T);
// หลังอนุมัติแคมเปญเดียว เพดาน 2/สัปดาห์ยังไม่เข้าเงื่อนไข
// สิ่งที่ต้องเห็นคือล็อกหน้าต่างตอบสนอง และล็อกกลุ่มควบคุม
const reasons = new Set(after.candidates.flatMap(x=>x.filtered.map(f=>f.reason)));
ok([...reasons].some(r=>r.includes("Messaged within")), "F9 ล็อกหน้าต่างตอบสนองทำงานข้าม play");
ok([...reasons].some(r=>r.includes("control group")), "H1 ล็อกกลุ่มควบคุมไม่ให้ถูกดึงซ้ำ");

const roi = roiSummary(T);
out.push(`ROI: campaigns=${roi.campaigns} measured=${roi.measured} verdictMix=${JSON.stringify(roi.verdictMix)}`);

console.log(out.join("\n"));
console.log(out.some(l=>l.startsWith("FAIL")) ? "\n=== มี FAIL ===" : "\n=== ผ่านทั้งหมด ===");
