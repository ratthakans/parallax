import { get, run } from "@/lib/engine/sql";
import "./isolate.mts";

import { ensureReady } from "@/lib/engine/bootstrap";
import { runMatch } from "@/lib/engine/match";
import { roiSummary } from "@/lib/engine/proof";
import { approveCampaign, sendCampaign } from "@/lib/engine/dispatch";
import { TENANT_PROFILES } from "@/lib/shared/tenants";
import {
  billingPeriod,
  buyCredits,
  changePlan,
  contactCapBlockedReason,
  identifiedCount,
  planForBaseSize,
  reachBlockedReason,
  usageFor,
} from "@/lib/engine/billing";
import {
  CREDIT_PACKS,
  MESSAGE_COST_BAHT,
  PLANS,
  PLAN_ORDER,
  perMessage,
  priceForMessages,
} from "@/lib/shared/plans";

/* ── ชุดตรวจชั้นราคา ──────────────────────────────────────────
   เพดานทุกข้อที่หน้า /pricing ประกาศ ต้องมีบรรทัดที่นี่ที่พิสูจน์ว่า
   ระบบปฏิเสธจริงเมื่อถูกละเมิด — ไม่ใช่แค่มีฟังก์ชันที่คืนข้อความไว้

   ที่ผ่านมาหน้าราคาประกาศเพดาน "ถึง 500 คน" และ "ข้อความรวมในแพ็ก"
   โดยไม่มีบรรทัดใดในระบบอ่านค่านั้น ชุดนี้มีไว้เพื่อให้เรื่องนั้น
   เกิดซ้ำไม่ได้: ถ้าใครลบการบังคับใช้ออก ชุดนี้ต้อง FAIL
   ───────────────────────────────────────────────────────────── */

await ensureReady();
const out: string[] = [];
const ok = (c: boolean, m: string) => out.push(`${c ? "PASS" : "FAIL"}  ${m}`);
const th = (n: number) => n.toLocaleString("th-TH");

/* ── 1 · ข้อมูลแผนต้องสมเหตุสมผลในตัวเอง ─────────────────────── */

let capsAscend = true;
let prevCap = -1;
for (const id of PLAN_ORDER) {
  const cap = PLANS[id].contactCap;
  if (cap == null) break; // ชั้นสุดท้ายไม่มีเพดานตัวเลข
  if (cap <= prevCap) capsAscend = false;
  prevCap = cap;
}
ok(capsAscend, "เพดานจำนวนคนเพิ่มขึ้นตามชั้นเสมอ");

let priceAscend = true;
let prevPrice = -1;
for (const id of PLAN_ORDER) {
  const p = PLANS[id].monthlyBaht;
  if (p == null) break;
  if (p < prevPrice) priceAscend = false;
  prevPrice = p;
}
ok(priceAscend, "ราคาเพิ่มขึ้นตามชั้นเสมอ");

/* แพ็กใหญ่ต้องถูกกว่าต่อข้อความ ไม่งั้นส่วนลดปริมาณเป็นการลงโทษ */
let packsDescend = true;
for (let i = 1; i < CREDIT_PACKS.length; i++) {
  if (CREDIT_PACKS[i].messages <= CREDIT_PACKS[i - 1].messages) packsDescend = false;
  if (perMessage(CREDIT_PACKS[i]) >= perMessage(CREDIT_PACKS[i - 1])) packsDescend = false;
}
ok(packsDescend, "แพ็กใหญ่ขึ้นแล้วราคาต่อข้อความถูกลงทุกขั้น");

/* ทุกแพ็กต้องขายเหนือต้นทุน — ถ้าไม่ ยิ่งขายยิ่งขาดทุน */
const belowCost = CREDIT_PACKS.filter((p) => perMessage(p) <= MESSAGE_COST_BAHT);
ok(
  belowCost.length === 0,
  `ทุกแพ็กราคาเหนือต้นทุน ฿${MESSAGE_COST_BAHT}` +
    (belowCost.length ? ` — ขาดทุน ${belowCost.map((p) => p.messages).join(", ")}` : ""),
);

ok(
  priceForMessages(CREDIT_PACKS[0].messages) === CREDIT_PACKS[0].baht,
  `priceForMessages ตรงกับราคาแพ็กเล็ก (${priceForMessages(CREDIT_PACKS[0].messages)})`,
);

/* Free ต้องส่งไม่ได้ ไม่งั้นตรรกะทั้งหน้าราคาพัง */
ok(PLANS.free.caps.reach.kind !== "yes", "แผน Free ปิด Reach ในข้อมูลแผน");
ok(PLANS.free.welcomeCredits === 0, "แผน Free ไม่ได้เครดิตแรกเข้า");

/* ── 2 · แผนของแต่ละบัญชีต้องรับฐานของตัวเองได้ ───────────────── */

for (const p of TENANT_PROFILES) {
  const plan = PLANS[p.tier];
  const fits = plan.contactCap == null || p.scale.people <= plan.contactCap;
  ok(
    fits,
    `${p.name}: ฐาน ${th(p.scale.people)} อยู่ในเพดานแผน ${plan.name}` +
      (plan.contactCap ? ` (${th(plan.contactCap)})` : " (ไม่มีเพดาน)"),
  );
  ok(
    plan.caps.reach.kind === "yes",
    `${p.name}: แผน ${plan.name} เปิด Reach จึงส่งได้จริง`,
  );
}

/* ── 3 · รอบบิลต้องต่อกันสนิท ─────────────────────────────────
   ขอบรอบบิลคือที่ที่ยอดใช้งานหายไปเงียบ ๆ ได้ง่ายที่สุด */

let periodsSane = true;
for (const day of [1, 15, 28]) {
  for (const iso of [
    "2026-01-01T00:00:00.000Z",
    "2026-02-28T23:00:00.000Z",
    "2026-03-15T12:00:00.000Z",
    "2026-12-31T23:59:00.000Z",
  ]) {
    const now = new Date(iso);
    const p = billingPeriod(day, now);
    if (!(p.start <= now && now < p.end)) periodsSane = false;
    if (p.start.getDate() !== day) periodsSane = false;
    if (p.daysLeft < 0 || p.daysLeft > 31) periodsSane = false;
  }
}
ok(periodsSane, "รอบบิลครอบเวลาปัจจุบันเสมอ ทุกวันตัดรอบและทุกเดือน");

/* วันตัดรอบที่มากกว่า 28 ต้องถูกบีบ ไม่ใช่ข้ามเดือนกุมภาพันธ์ */
const feb = billingPeriod(31, new Date("2026-02-10T00:00:00.000Z"));
ok(feb.start.getDate() === 28, `วันตัดรอบ 31 ถูกบีบเป็น ${feb.start.getDate()}`);

/* ── 4 · เพดานจำนวนคนต้องปฏิเสธจริง ─────────────────────────── */

const T = TENANT_PROFILES[0].id;
const identified = await identifiedCount(T);
ok(identified > 0, `นับคนที่ระบุตัวตนได้ ${th(identified)} คน`);

await changePlan(T, "free"); // เพดาน 500
const capBlock = await contactCapBlockedReason(T, 0);
ok(
  capBlock != null,
  `แผน Free ปฏิเสธฐาน ${th(identified)} คนที่เกินเพดาน 500 — ${capBlock ? "มีเหตุผลแจ้ง" : "ไม่ปฏิเสธ"}`,
);

/* แทนที่ทั้งฐานต้องนับจากศูนย์ ไม่ใช่บวกทับ ไม่งั้นร้านที่ใกล้เพดาน
   จะแก้ไขข้อมูลตัวเองไม่ได้เลย */
const replaceSmall = await contactCapBlockedReason(T, 100, { replacing: true });
ok(replaceSmall == null, "แทนที่ทั้งฐานด้วยไฟล์ 100 คน ผ่านเพดาน Free ได้");
const replaceBig = await contactCapBlockedReason(T, 900, { replacing: true });
ok(replaceBig != null, "แทนที่ทั้งฐานด้วยไฟล์ 900 คน ยังถูกปฏิเสธ");

/* ── 5 · Reach ต้องถูกบังคับที่ชั้น dispatch ไม่ใช่ที่หน้าจอ ──── */

ok(await reachBlockedReason(T) != null, "แผน Free รายงานว่าส่งไม่ได้");

const { candidates } = await runMatch(T);
const target = candidates.find((c) => !c.blocked);
let threw = false;
let message = "";
if (target) {
  try {
    await approveCampaign(target, {
      tenantId: T,
      playId: target.play.id,
      approvedBy: "test",
    });
  } catch (err) {
    threw = true;
    message = err instanceof Error ? err.message : String(err);
  }
}
ok(
  target != null && threw,
  `approveCampaign ปฏิเสธแผน Free ตรง ๆ — ${threw ? message.slice(0, 60) : "ไม่ปฏิเสธ"}`,
);

const leaked = (
  await get<{ n: number }>("SELECT COUNT(*) n FROM campaigns WHERE tenant_id=? AND approved_by='test'", T)
)!.n;
ok(leaked === 0, `ไม่มีแคมเปญหลุดเข้าฐานตอนถูกปฏิเสธ (พบ ${leaked})`);

await changePlan(T, TENANT_PROFILES[0].tier); // คืนแผนเดิม
ok(await reachBlockedReason(T) == null, "คืนแผนเดิมแล้วส่งได้ตามปกติ");

/* ── 6 · บัญชีเครดิตต้องกระทบยอดได้ ──────────────────────────── */

const before = await usageFor(T);
const packBaht = await buyCredits(T, CREDIT_PACKS[0].messages);
const after = await usageFor(T);

ok(
  after.creditsLeft === before.creditsLeft + CREDIT_PACKS[0].messages,
  `ซื้อเครดิต ${th(CREDIT_PACKS[0].messages)} แล้วยอดเพิ่มตรง (${th(before.creditsLeft)} → ${th(after.creditsLeft)})`,
);
ok(
  packBaht === CREDIT_PACKS[0].baht,
  `คิดเงินตรงราคาแพ็ก ฿${th(packBaht)}`,
);
ok(
  after.creditSpendThisPeriod === before.creditSpendThisPeriod + packBaht,
  "ยอดเครดิตที่ซื้อในรอบนี้เพิ่มตามที่จ่าย",
);
ok(
  after.invoiceThisPeriod ===
    (after.plan.monthlyBaht ?? 0) + after.creditSpendThisPeriod,
  `ใบแจ้งค่าใช้จ่าย = ค่าสมาชิก + เครดิต (฿${th(after.invoiceThisPeriod)})`,
);

/* เครดิตแรกเข้าต้องไม่คิดเงิน — ไม่งั้นคำว่า "แรกเข้า" ไม่มีความหมาย */
const freeBaht = await buyCredits(T, 100, "welcome");
ok(freeBaht === 0, "เครดิตแรกเข้าไม่คิดเงิน");

/* ── 7 · ทุกยอดเครดิตที่ซื้อ ต้องอธิบายยอดที่ใช้ได้ ────────────
   คงเหลือ + ที่ส่งไปแล้ว ต้องเท่ากับที่ซื้อมาทั้งหมด ถ้าไม่เท่า
   แปลว่าเครดิตหายหรือถูกแจกฟรีที่ไหนที่ไม่มีใครบันทึก */

for (const p of TENANT_PROFILES) {
  const bought = (
    await get<{ n: number }>("SELECT COALESCE(SUM(messages),0) n FROM credit_purchases WHERE tenant_id=?", p.id)
  )!.n;
  const u = await usageFor(p.id);
  const used = u.messagesAllTime;
  ok(
    u.creditsLeft + used === bought,
    `${p.name}: คงเหลือ ${th(u.creditsLeft)} + ส่งแล้ว ${th(used)} = ซื้อมา ${th(bought)}`,
  );
}

/* ── 8 · เครดิตหมดต้องหยุดส่ง ไม่ใช่ติดลบ ─────────────────────── */

const T2 = TENANT_PROFILES[1].id;
const { candidates: c2 } = await runMatch(T2);
const big = [...c2].filter((c) => !c.blocked).sort((a, b) => b.audience.length - a.audience.length)[0];
if (big) {
  const r = await approveCampaign(big, {
    tenantId: T2,
    playId: big.play.id,
    approvedBy: "test",
  });
  // เหลือเครดิตน้อยกว่าคนที่ต้องส่งอย่างจงใจ
  await run("UPDATE tenants SET message_credits = ?, quiet_hours_start=0, quiet_hours_end=0 WHERE id=?", Math.max(1, Math.floor(r.treated / 3)), T2);
  const allowance = (
    await get<{
      c: number;
    }>("SELECT message_credits c FROM tenants WHERE id=?", T2)
  )!.c;
  const send = await sendCampaign(r.campaignId);
  const left = (
    await get<{
      c: number;
    }>("SELECT message_credits c FROM tenants WHERE id=?", T2)
  )!.c;
  ok(send.sent === allowance, `ส่งได้เท่าเครดิตที่มี ${send.sent}/${allowance}`);
  ok(
    send.skippedNoCredit === r.treated - send.sent,
    `รายงานคนที่ยังไม่ได้รับตรงจำนวน ${send.skippedNoCredit}`,
  );
  ok(left >= 0, `เครดิตไม่ติดลบหลังส่งเกิน (${left})`);
} else {
  ok(false, "หาแคมเปญมาทดสอบเครดิตหมดไม่ได้");
}

/* ── 9 · ตัวหารของ ROI ต้องครอบแคมเปญชุดเดียวกับตัวตั้ง ─────────

   นี่คือบั๊กที่ทำให้หน้าค่าใช้จ่ายรายงาน "จ่าย 1 บาท ได้กลับ 455 บาท":
   ตัวตั้งรวมทุกแคมเปญที่วัดได้ ส่วนตัวหารเก็บส่วนลดเฉพาะแคมเปญที่มีแถว
   T+90 ที่สรุปได้ แคมเปญที่วัดได้แต่คร่อมศูนย์จึงเอายอดเพิ่มเข้าตัวตั้ง
   โดยไม่เอาส่วนลดเข้าตัวหาร

   ตรวจแบบไม่ผูกกับวิธีคำนวณ: ถ้าในแคมเปญที่วัดได้มีตัวใดให้ส่วนลด
   ตัวหารต้องมากกว่าค่าส่งข้อความล้วน ๆ อย่างมีนัย */
for (const p of TENANT_PROFILES) {
  const roi = await roiSummary(p.id);
  if (roi.measured === 0) continue;

  const discountful = (
    await get<{ n: number }>(`SELECT COUNT(*) n FROM campaigns c
         JOIN attributions a ON a.campaign_id = c.id
         WHERE c.tenant_id = ? AND c.dry_run = 0 AND a.matured = 1
           AND CAST(json_extract(c.offer_snapshot,'$.discount_pct') AS REAL) > 0`, p.id)
  )!.n;

  const msgOnly = (
    await get<{ c: number }>(`SELECT COALESCE(SUM(m.cost),0) c FROM messages m
         JOIN campaigns c2 ON c2.id = m.campaign_id
         JOIN attributions a ON a.campaign_id = c2.id AND a.matured = 1
         WHERE c2.tenant_id = ?`, p.id)
  )!.c;

  if (discountful > 0) {
    ok(
      roi.spendBaht > msgOnly,
      `${p.name}: ตัวหารรวมส่วนลด — ฿${th(roi.spendBaht)} > ค่าส่งล้วน ฿${th(Math.round(msgOnly))}`,
    );
  } else {
    ok(
      roi.spendBaht > 0,
      `${p.name}: ไม่มีแคมเปญที่ให้ส่วนลด ตัวหารจึงเป็นค่าส่งล้วน ฿${th(roi.spendBaht)}`,
    );
  }
}

/* ── 10 · แผนที่ควรอยู่ ต้องแนะนำจากขนาดฐานได้ ────────────────── */

ok(planForBaseSize(300) === "free", "ฐาน 300 คน → Free");
ok(planForBaseSize(4000) === "growth", "ฐาน 4,000 คน → Growth");
ok(planForBaseSize(20000) === "multi", "ฐาน 20,000 คน → Multi");
ok(planForBaseSize(80000) === "chain", "ฐาน 80,000 คน → Chain");

console.log(out.join("\n"));
console.log(
  out.some((l) => l.startsWith("FAIL")) ? "\n=== มี FAIL ===" : "\n=== ผ่านทั้งหมด ===",
);
