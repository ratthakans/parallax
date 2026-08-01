import { createHash, randomUUID } from "node:crypto";
import { db, logActivity } from "@/lib/engine/db";
import { playById } from "@/lib/shared/plays";
import { measureCampaign } from "@/lib/engine/proof";

/* ── ตัวควบคุมสำหรับเดโม ──────────────────────────────────────
   ปัญหาของการเดโมระบบวัดผล: แคมเปญที่อนุมัติเมื่อสิบวินาทีก่อน
   ยังไม่ครบ T+7 จึงขึ้นว่า "ยังไม่พอสรุป" ทั้งหมด — ซึ่งถูกต้อง
   ตามหลักสถิติ แต่ทำให้ลูกค้าไม่เห็นว่าชั้น Proof ทำอะไรได้

   "เดินเวลา" เลื่อนวันอนุมัติของแคมเปญย้อนหลังไป แล้ววัดผลใหม่
   ทุกอย่างที่เหลือ — holdout · arm · สูตรคำนวณ — เป็นของจริง
   ไม่มีการแก้ผลลัพธ์
   ───────────────────────────────────────────────────────────── */

export type TravelResult = {
  campaigns: number;
  measured: number;
  days: number;
};

/** เลื่อนวันของแคมเปญที่มีอยู่ย้อนหลัง โดยยังไม่วัดผล */
function shiftCampaigns(tenantId: string, days: number) {
  const d = db();
  const shiftMs = days * 86400000;

  const rows = d
    .prepare(
      "SELECT id, approved_at FROM campaigns WHERE tenant_id = ? AND dry_run = 0",
    )
    .all(tenantId) as { id: string; approved_at: string }[];

  d.exec("BEGIN");
  try {
    const upd = d.prepare("UPDATE campaigns SET approved_at = ? WHERE id = ?");
    const updMsg = d.prepare(
      "UPDATE messages SET sent_at = ? WHERE campaign_id = ? AND sent_at IS NOT NULL",
    );
    for (const r of rows) {
      const shifted = new Date(Date.parse(r.approved_at) - shiftMs).toISOString();
      upd.run(shifted, r.id);
      updMsg.run(shifted, r.id);
    }
    d.exec("COMMIT");
  } catch (err) {
    d.exec("ROLLBACK");
    throw err;
  }
  return rows.map((r) => r.id);
}

/** วัดผลทุกแคมเปญที่มี — ตัวที่ยังไม่ครบกำหนดจะได้ insufficient_data ตามปกติ */
function measureAll(tenantId: string, ids: string[]) {
  let measured = 0;
  for (const id of ids) {
    try {
      measureCampaign(id, { tenantId });
      measured++;
    } catch {
      // แคมเปญที่วัดไม่ได้ถูกข้ามไป ไม่ทำให้ทั้งชุดล้ม
    }
  }
  return measured;
}

export function travelForward(tenantId: string, days: number): TravelResult {
  const ids = shiftCampaigns(tenantId, days);
  const measured = measureAll(tenantId, ids);
  logActivity(tenantId, "demo", "travel_forward", `${days} days · ${measured} campaigns`);
  return { campaigns: ids.length, measured, days };
}

/* ── สร้างประวัติแคมเปญย้อนหลังสำหรับเดโม ─────────────────────
   ให้หน้า Proof มีอะไรให้ดูตั้งแต่เปิดครั้งแรก โดยที่ทุกแคมเปญ
   ยังผ่านเส้นทางเดิมทั้งหมด — แช่แข็งกลุ่ม แบ่ง arm ด้วย hash
   แล้วค่อยเลื่อนวันย้อนหลังและวัดผล
   ───────────────────────────────────────────────────────────── */

export async function seedCampaignHistory(tenantId: string) {
  const { runMatch } = await import("./match");
  const { approveCampaign, sendCampaign } = await import("./dispatch");
  const d = db();

  const existing = d
    .prepare(
      "SELECT COUNT(*) AS n FROM campaigns WHERE tenant_id = ? AND dry_run = 0",
    )
    .get(tenantId) as { n: number };
  if (existing.n > 0) return { created: 0 };

  /* ไม่แก้ quiet hours ของร้านแล้ว — ส่งผ่าน ignoreQuietHours แทน
     การแก้ค่าจริงแล้วคืนทีหลังมีความเสี่ยงว่าคืนไม่ครบถ้ามีอะไรทำงานคาบเกี่ยว
     แล้วร้านจะส่งได้ทุกชั่วโมงตลอดไป ซึ่งเป็นเบรกที่พังแบบเงียบที่สุด */
  let created = 0;
  /* อนุมัติสี่แคมเปญจากอันดับที่ระบบเสนอเอง แต่เลือกกลุ่มใหญ่ก่อน

       เหตุผล: กลุ่มต่ำกว่า 300 คนได้โหมด time_shifted ซึ่ง holdout_size = 0
       และ measureCampaign ต้องมี holdout ≥ 40 คนจึงจะสรุปได้ ถ้า seed
       ด้วยกลุ่มเล็ก ประวัติทั้งชุดจะขึ้น "ยังไม่พอสรุป" ทุกแถว —
       ถูกต้องตามหลักสถิติ แต่ไม่ได้แสดงว่าชั้น Proof ทำอะไรได้

       และแต่ละรอบต้องเลื่อนเวลาย้อนหลังก่อน ไม่ใช่อนุมัติติดกันรวดเดียว

       เพราะเบรกของระบบทำงานจริง: ล็อกหน้าต่างตอบสนอง 14 วันและล็อกกลุ่ม
       ควบคุมตลอด 90 วัน จะกันคนออกจนกลุ่มเหลือไม่ถึง 300 คน ซึ่งตกไปอยู่
       โหมด time_shifted ที่ไม่มี holdout เลย — ได้ประวัติแค่หนึ่งถึงสองแคมเปญ
       ซึ่งกลุ่มควบคุมรวมกันเล็กเกินกว่าจะสรุปอะไรได้

       ต้องใช้ travelForward ไม่ใช่ shiftCampaigns เปล่า ๆ เพราะล็อกกลุ่มควบคุม
       ผูกกับ status = 'measuring' ซึ่งเปลี่ยนเป็น complete ตอนวัดผลเท่านั้น
       ถ้าเลื่อนเวลาแต่ไม่วัด กลุ่มควบคุมจะถูกล็อกค้างไปตลอด กลุ่มเป้าหมาย
       จะหดลงทุกรอบ (418 → 358 → 314 → 265) แล้วตกใต้ 300 จนหมดสิทธิ์มี holdout

       เลื่อน 100 วันต่อรอบ ให้หน้าต่างวัดผล 90 วันของรอบก่อนปิดพอดี
     ประวัติจึงกระจายในปฏิทินเหมือนร้านที่ใช้งานมาปีกว่าจริง ๆ */
  for (let round = 0; round < 6 && created < 4; round++) {
    if (created > 0) travelForward(tenantId, 100);
    const { candidates } = runMatch(tenantId);
    const pick = candidates
      .filter(
        (c) =>
          !c.blocked &&
          c.play.engine === "keep" &&
          c.holdout_pct > 0 &&
          c.audience.length >= 300,
      )
      .sort((a, b) => b.audience.length - a.audience.length)[0];
    if (!pick) continue;
    const r = await approveCampaign(pick, {
      tenantId,
      playId: pick.play.id,
      approvedBy: "demo",
    });
    try {
      sendCampaign(r.campaignId, { ignoreQuietHours: true, tenantId });
    } catch {
      // เครดิตหมด — ข้ามการส่ง แต่ยังนับแคมเปญ
    }
    created++;
  }

  if (created > 0) {
    // เลื่อนอีก 95 วัน ให้ตัวที่ใหม่สุดก็ครบกำหนด T+90 แล้ว
    const ids = shiftCampaigns(tenantId, 95);
    injectCampaignEffect(tenantId);
    measureAll(tenantId, ids);
  }
  return { created };
}

/* ── ใส่ผลของแคมเปญลงในข้อมูลจริง ────────────────────────────────
   ชุดข้อมูลตัวอย่างถูกสร้างขึ้นก่อนที่จะมีแคมเปญ จึงไม่มีผลของแคมเปญ
   อยู่ในนั้นเลย ถ้าวัดตรง ๆ ส่วนต่างจะเป็นศูนย์โดยโครงสร้าง

   ทางที่ซื่อสัตย์คือทำให้โลกจำลอง "มีผลจริง" แล้วปล่อยให้เครื่องวัด
   ค้นหาผลนั้นเอง ไม่ใช่เขียนตัวเลขส่วนต่างลงไปตรง ๆ — ธุรกรรมที่ใส่
   เพิ่มคือแถวจริงในตาราง transactions ที่ estimator ต้องไปเจอด้วยตัวเอง
   ผ่าน holdout และการแบ่ง arm ตามปกติ ไม่มีทางลัด

   ใส่ให้เฉพาะคนในกลุ่มที่ได้รับข้อความ (treated) ที่ไม่มีการซื้อในหน้าต่าง
   เวลานั้นอยู่แล้ว — คือคนที่แคมเปญ "เปลี่ยนใจ" ได้จริง และเฉพาะคนที่
   เคยซื้อมาก่อน เพื่อไม่ให้จำนวนลูกค้าที่เคยซื้อของชุดข้อมูลเปลี่ยน
   ───────────────────────────────────────────────────────────── */

/* สัดส่วนคนที่ยังไม่ซื้อในหน้าต่างนั้น ที่แคมเปญเปลี่ยนใจได้

   ตั้งไว้ในช่วงที่พบจริง (แคมเปญดึงกลับที่เลือกคนดีและมีส่วนลด รายงานกัน
   ราว 8–16%) เพราะฐานตัวอย่างมีแค่ 1,240 คน ทำได้ราวสามแคมเปญที่ใหญ่พอ
   จะมี holdout รวมกันได้กลุ่มควบคุมเพียงร้อยกว่าคน — ที่ขนาดนั้น
   ผลขนาดเล็กจะไม่ผ่าน 95% ไม่ว่าจะจริงหรือไม่

   ค่านี้ทำให้ผลที่วัดได้ออกมาราว +30% พร้อมช่วงความเชื่อมั่นที่พ้นศูนย์
   มาไม่มาก ซึ่งเป็นหน้าตาของ pilot จริงในระยะแรก ไม่ใช่ตัวเลขสวยเกินจริง

   นี่เป็นข้อจำกัดของชุดข้อมูลเดโม ไม่ใช่ของเครื่องวัด: ร้านจริงที่ส่ง
   สัปดาห์ละครั้งตลอดปีจะมีกลุ่มควบคุมสะสมหลายพันคน และจับผลระดับ 3–5%
   ได้สบาย — หลักฐานสะสมตามเวลา ไม่ได้มาจากแคมเปญเดียว

   ตั้งเป็น "ส่วนต่างเชิงสัมพัทธ์" ไม่ใช่สัดส่วนคงที่ของคนที่ยังไม่จ่าย

   เพราะอัตราการกลับมาจ่ายในหน้าต่าง 90 วันของแต่ละธุรกิจต่างกันมาก
   สนามกอล์ฟที่คนออกรอบทุกสองสัปดาห์มีฐานสูง ส่วนแท็กซี่สนามบินที่คน
   ส่วนใหญ่เป็นนักท่องเที่ยวมีฐานต่ำมาก ถ้าแทรกที่สัดส่วนคงที่ 15%
   ของคนที่ยังไม่จ่าย ธุรกิจฐานต่ำจะได้ส่วนต่าง +94% ซึ่งไม่มีใครเชื่อ
   ส่วนธุรกิจฐานสูงจะได้ +10% ทั้งที่ตั้งค่าเดียวกัน

   คิดกลับจากเป้าหมายแทน: ถ้าอยากได้ส่วนต่างเชิงสัมพัทธ์ L บนฐาน p
   ต้องเปลี่ยนใจคนที่ยังไม่จ่ายในสัดส่วน  L · p / (1 − p) */
const RELATIVE_LIFT = 0.28;

export function injectCampaignEffect(tenantId: string) {
  const d = db();
  const camps = d
    .prepare(
      `SELECT id, play_id, approved_at FROM campaigns
       WHERE tenant_id = ? AND dry_run = 0`,
    )
    .all(tenantId) as { id: string; play_id: string; approved_at: string }[];

  const candidates = d.prepare(
    `SELECT ca.customer_id AS id
     FROM campaign_audience ca
     WHERE ca.campaign_id = ? AND ca.arm = 'treated'
       -- เคยจ่ายมาก่อน (คนของ keep engine)
       AND EXISTS (SELECT 1 FROM transactions t0 WHERE t0.customer_id = ca.customer_id)
       -- แต่ไม่มีรายการในหน้าต่างเวลาของแคมเปญนี้
       AND NOT EXISTS (
         SELECT 1 FROM transactions t1
         WHERE t1.customer_id = ca.customer_id
           AND t1.occurred_at >= ? AND t1.occurred_at < ?
       )`,
  );
  // ขนาดกลุ่มที่ได้รับข้อความ ใช้หาอัตราฐานของแคมเปญนี้
  const treatedCount = d.prepare(
    "SELECT COUNT(*) AS n FROM campaign_audience WHERE campaign_id = ? AND arm = 'treated'",
  );
  const insTxn = d.prepare(
    `INSERT INTO transactions (tenant_id, id, customer_id, occurred_at, total, discount_total, channel)
       VALUES (?,?,?,?,?,?,?)`,
  );

  let added = 0;
  d.exec("BEGIN");
  try {
    for (const c of camps) {
      const play = playById(c.play_id);
      const aov = play?.expected_order_value ?? 2000;
      const start = Date.parse(c.approved_at);
      const end = new Date(start + 90 * 86400000).toISOString();
      const rows = candidates.all(c.id, c.approved_at, end) as { id: string }[];

      /* อัตราฐาน = สัดส่วนคนในกลุ่มที่จ่ายอยู่แล้วโดยไม่ต้องมีข้อความ
         คำนวณจากข้อมูลของแคมเปญนั้นเอง ไม่ใช่ตั้งค่าไว้ต่อธุรกิจ */
      const nTreated = (treatedCount.get(c.id) as { n: number }).n;
      const nSilent = rows.length;
      const base = nTreated > 0 ? (nTreated - nSilent) / nTreated : 0;
      const uplift =
        base > 0 && base < 1
          ? Math.min(0.6, (RELATIVE_LIFT * base) / (1 - base))
          : 0;
      if (uplift <= 0) continue;

      for (const r of rows) {
        // ตัดสินด้วย hash จึงได้ผลเดิมทุกครั้งที่ reseed
        const h = createHash("sha256").update(`${c.id}:${r.id}:effect`).digest();
        if (h.readUInt16BE(0) / 65535 >= uplift) continue;
        const dayOffset = 1 + (h.readUInt16BE(2) % 75); // ซื้อภายใน 76 วันแรก
        const valueMul = 0.55 + (h.readUInt16BE(4) / 65535) * 0.9;
        insTxn.run(
          tenantId,
          randomUUID(),
          r.id,
          new Date(start + dayOffset * 86400000).toISOString(),
          Math.round(aov * valueMul),
          0,
          "campaign",
        );
        added++;
      }
    }
    d.exec("COMMIT");
  } catch (err) {
    d.exec("ROLLBACK");
    throw err;
  }

  logActivity(tenantId, "demo", "inject_campaign_effect", `${added} transactions`);
  return { added };
}

export function demoState(tenantId: string) {
  const d = db();
  const oldest = d
    .prepare(
      "SELECT MIN(approved_at) AS a FROM campaigns WHERE tenant_id = ? AND dry_run = 0",
    )
    .get(tenantId) as { a: string | null };
  const verdicts = d
    .prepare(
      `SELECT a.verdict, COUNT(*) AS n
       FROM attributions a JOIN campaigns c ON c.id = a.campaign_id
       WHERE c.tenant_id = ? AND a.horizon_days = 90
       GROUP BY a.verdict`,
    )
    .all(tenantId) as { verdict: string; n: number }[];
  return {
    oldestCampaignAt: oldest.a,
    verdicts,
  };
}
