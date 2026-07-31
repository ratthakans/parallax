import { createHash, randomUUID } from "node:crypto";
import { db, logActivity } from "./db";
import { effectiveGuards, getTenant, getTenantPlays, pickMeasurement } from "./match";
import { writeCopy, writeCopyFallback, type AiSource, type CopySet, type VocabCtx } from "./ai";
import { profileFor } from "./tenants";
import { MESSAGE_COST_BAHT } from "./plans";
import { reachBlockedReason } from "./billing";
import type { Candidate, Play } from "./types";

/* ── DISPATCH ──────────────────────────────────────────────────
   สี่อย่างในไฟล์นี้ไม่มีหน้าจอ และลูกค้าไม่มีวันเห็น —
   แต่ถ้าไม่ได้ทำตั้งแต่วันแรก อีกร้อยฟีเจอร์จะพังทีหลังพร้อมกัน

   H1  แช่แข็ง audience ตอนอนุมัติ — คำนวณใหม่ตอนส่งเมื่อไร
       holdout เป็นโมฆะเมื่อนั้น และเราจะไม่รู้ตัว
   H2  แบ่ง arm ด้วย hash(customer_id + campaign_id) — ทำซ้ำได้
       ตรวจสอบได้ ไม่ต้องเก็บ seed
   F12 idempotency key ระดับ (campaign_id, customer_id) — retry
       แล้วไม่ส่งซ้ำ
   F3  เขียนข้อความระดับกลุ่มครั้งเดียวต่อแคมเปญ แล้วแทนค่า
       รายบุคคล — ตัวกำหนดว่ามาร์จิ้นจะเป็น 70% หรือ 40%
   ───────────────────────────────────────────────────────────── */

/** H2 — แบ่ง arm แบบทำซ้ำได้ ไม่เก็บ seed */
export function armFor(
  customerId: string,
  campaignId: string,
  holdoutPct: number,
): "treated" | "holdout" {
  if (holdoutPct <= 0) return "treated";
  const h = createHash("sha256").update(`${customerId}:${campaignId}`).digest();
  // 4 ไบต์แรกพอสำหรับการกระจายที่สม่ำเสมอ
  const bucket = h.readUInt32BE(0) % 100;
  return bucket < holdoutPct ? "holdout" : "treated";
}

/* ── F3 — copy ระดับกลุ่ม ─────────────────────────────────────
   เรียก AI เขียนหนึ่งชุดต่อแคมเปญ ไม่ใช่ต่อคน แล้วแทนค่าตัวแปร
   รายบุคคลตอนส่ง ดู lib/ai.ts — ถ้าไม่มี API key จะใช้สูตรสำเร็จ
   ที่ deterministic แทน โดยรูปทรงของสัญญาไม่เปลี่ยน */

export type { CopySet } from "./ai";

/** ใช้ตอนแสดงตัวอย่างในหน้าจอ — ไม่เรียก AI เพื่อไม่ให้เสียเงินตอนเลื่อนดู */
export function vocabFor(tenantId: string): VocabCtx {
  const v = profileFor(tenantId).vocab;
  return {
    person: v.person,
    purchase: v.purchase,
    item: v.item,
    orgKind: v.orgKind,
  };
}

export function previewCopy(
  play: Play,
  discountPct: number,
  tenantId?: string,
): CopySet {
  return writeCopyFallback(
    play,
    discountPct,
    tenantId ? vocabFor(tenantId) : undefined,
  );
}

/** แทนค่าตัวแปรรายบุคคล — ไม่เรียก LLM ต่อคน */
export function renderForCustomer(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
}

/* ── อนุมัติ = แช่แข็ง + เขียนลงฐานข้อมูล ────────────────────── */

export type ApproveInput = {
  tenantId: string;
  playId: string;
  approvedBy: string;
  tone?: string;
  dryRun?: boolean;
  /** ให้ผู้ใช้ทับ holdout ที่ระบบแนะนำได้ แต่ยังบังคับกติกาตามขนาด */
  holdoutPct?: number;
};

export type ApproveResult = {
  campaignId: string;
  audienceSize: number;
  treated: number;
  holdout: number;
  measurement: string;
  dryRun: boolean;
  note: string;
  copySource: AiSource;
  copyNote?: string;
};

export async function approveCampaign(
  candidate: Candidate,
  input: ApproveInput,
): Promise<ApproveResult> {
  const d = db();
  const tenant = getTenant(input.tenantId);
  if (!tenant) throw new Error("Account not found");

  /* เพดานของแผนต้องบังคับที่นี่ ไม่ใช่ที่หน้าจอ — หน้าจอที่ซ่อนปุ่มไว้
     ไม่ได้ป้องกันการยิง Server Action ตรง ๆ และ Free tier ที่ส่งได้
     คือรายได้ที่หายไปเงียบ ๆ ไม่ใช่แค่ UI ที่ไม่ตรง */
  const planBlock = reachBlockedReason(input.tenantId);
  if (planBlock) throw new Error(planBlock);

  const cfg = getTenantPlays(input.tenantId).get(candidate.play.id);
  const guards = effectiveGuards(candidate.play, cfg);

  // เพดานส่วนลดของร้านทับเพดานของ play เสมอ (F11)
  const discountPct = Math.min(guards.max_discount_pct, tenant.max_discount_pct);

  const size = candidate.audience.length;
  const rule = pickMeasurement(size);
  const holdoutPct =
    input.holdoutPct != null
      ? Math.min(input.holdoutPct, rule.holdout_pct === 0 ? 0 : 30)
      : rule.holdout_pct;

  const campaignId = randomUUID();

  /* F3 — เรียกเขียนข้อความหนึ่งครั้งต่อแคมเปญ ไม่ใช่ต่อคน
     ผลถูก cache ด้วย hash ของ (play, ส่วนลด, ขนาดกลุ่ม) */
  const copyResult = await writeCopy(candidate.play, {
    discountPct,
    audienceSize: candidate.audience.length,
    businessName: tenant.name,
    vocab: vocabFor(input.tenantId),
  });
  const copy = copyResult.value;
  const chosen = copy.find((c) => c.tone === input.tone) ?? copy[0];

  const dryRun = Boolean(input.dryRun);

  d.exec("BEGIN");
  try {
    /* H1 — audience ถูกแช่แข็งที่นี่ ตอนอนุมัติ
       ตั้งแต่บรรทัดนี้ไป ไม่มีการคำนวณ audience ใหม่อีก */
    const arms = candidate.audience.map((cid) => ({
      cid,
      arm: armFor(cid, campaignId, holdoutPct),
    }));
    const treated = arms.filter((a) => a.arm === "treated").length;
    const holdout = arms.length - treated;

    d.prepare(
      `INSERT INTO campaigns
        (id, tenant_id, play_id, status, approved_by, approved_at, copy_snapshot,
         offer_snapshot, holdout_pct, measurement, audience_size, treated_size,
         holdout_size, dry_run, est_cost)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      campaignId,
      input.tenantId,
      candidate.play.id,
      dryRun ? "dry_run" : "measuring",
      input.approvedBy,
      new Date().toISOString(),
      JSON.stringify({
        tone: chosen.tone,
        body: chosen.body,
        all: copy,
        source: copyResult.source,
        note: copyResult.note,
      }),
      JSON.stringify({ ...candidate.play.offer, discount_pct: discountPct }),
      holdoutPct,
      rule.measurement,
      arms.length,
      treated,
      holdout,
      dryRun ? 1 : 0,
      candidate.estimated_cost,
    );

    const insAudience = d.prepare(
      "INSERT INTO campaign_audience (campaign_id, customer_id, arm) VALUES (?,?,?)",
    );
    for (const a of arms) insAudience.run(campaignId, a.cid, a.arm);

    d.exec("COMMIT");
  } catch (err) {
    d.exec("ROLLBACK");
    throw err;
  }

  logActivity(
    input.tenantId,
    input.approvedBy,
    dryRun ? "dry_run" : "approve_campaign",
    `${candidate.play.id} · ${size} people · holdout ${holdoutPct}%`,
  );

  const treatedRow = d
    .prepare(
      "SELECT treated_size AS t, holdout_size AS h FROM campaigns WHERE id = ?",
    )
    .get(campaignId) as { t: number; h: number };

  return {
    campaignId,
    audienceSize: size,
    treated: treatedRow.t,
    holdout: treatedRow.h,
    measurement: rule.measurement,
    dryRun,
    note: rule.note,
    copySource: copyResult.source,
    copyNote: copyResult.note,
  };
}

/* ── ส่งจริง — idempotent ───────────────────────────────────── */

export type SendResult = {
  attempted: number;
  sent: number;
  skippedAlreadySent: number;
  skippedQuietHours: boolean;
  /** ถูกข้ามเพราะเครดิตข้อความไม่พอ */
  skippedNoCredit: number;
  creditsLeft: number;
};

/* opts.ignoreQuietHours มีไว้ให้ตัวสร้างประวัติเดโมเท่านั้น (lib/demo.ts)
   ทางเลือกอื่นคือให้ตัวสร้างไปแก้ quiet hours ของร้านชั่วคราวแล้วคืนค่าทีหลัง
   ซึ่งอันตราย: ถ้ามีสองคำสั่งทำงานคาบเกี่ยวกัน ค่าที่คืนกลับจะเป็นค่าที่ถูก
   แก้ไว้ ทำให้ร้านส่งได้ทุกชั่วโมงตลอดไปโดยไม่มีใครรู้ — เบรกด้านการปฏิบัติตาม
   กฎต้องไม่มีทางพังจากการตั้งค่าชั่วคราวของโค้ดเดโม */
/* opts.tenantId คือการผูกคำสั่งนี้กับบัญชีที่เรียก

   เดิม sendAction ตรวจว่า cookie เป็นบัญชีไหนอย่างถูกต้อง แล้วส่ง
   campaignId ต่อมาดิบ ๆ ส่วนที่นี่ค้นด้วย WHERE id = ? อย่างเดียว
   ยิง POST พร้อม id ของบัญชีอื่นจึงสั่งส่งข้อความและตัดเครดิตของบัญชีนั้นได้
   เป็นช่องเดียวกับที่เคยแก้ไปแล้วใน commitImport แต่ตกหล่นสองจุดนี้ */
export function sendCampaign(
  campaignId: string,
  opts: { ignoreQuietHours?: boolean; tenantId?: string } = {},
): SendResult {
  const d = db();
  const camp = (
    opts.tenantId
      ? d
          .prepare("SELECT * FROM campaigns WHERE id = ? AND tenant_id = ?")
          .get(campaignId, opts.tenantId)
      : d.prepare("SELECT * FROM campaigns WHERE id = ?").get(campaignId)
  ) as
    | {
        id: string;
        tenant_id: string;
        play_id: string;
        status: string;
        dry_run: number;
      }
    | undefined;
  if (!camp) throw new Error("Campaign not found");
  if (camp.dry_run) throw new Error("A dry run does not send");

  const tenant = getTenant(camp.tenant_id);
  if (!tenant) throw new Error("Account not found");

  // ช่วงเวลาห้ามส่ง (F10)
  const hour = new Date().getHours();
  const { quiet_hours_start: qs, quiet_hours_end: qe } = tenant;
  const inQuiet =
    !opts.ignoreQuietHours &&
    (qs > qe ? hour >= qs || hour < qe : hour >= qs && hour < qe);

  const targets = d
    .prepare(
      `SELECT customer_id FROM campaign_audience
       WHERE campaign_id = ? AND arm = 'treated'`,
    )
    .all(campaignId) as { customer_id: string }[];

  if (inQuiet) {
    return {
      attempted: targets.length,
      sent: 0,
      skippedAlreadySent: 0,
      skippedQuietHours: true,
      skippedNoCredit: 0,
      creditsLeft: tenant.message_credits,
    };
  }

  /* ── เครดิตข้อความคือทรัพยากรที่จ่ายเงินซื้อ ห้ามติดลบ ──

     เดิมหักเครดิตโดยไม่ตรวจยอดคงเหลือเลย ร้านจึงส่งเกินที่จ่ายไว้ได้
     ไม่จำกัดและยอดกลายเป็นลบเงียบ ๆ (พบตอนเพิ่มบัญชีที่ฐานใหญ่กว่า
     เครดิตที่ให้มา: −538 และ −674) เพดานที่ไม่บังคับใช้ไม่ใช่เพดาน

     ส่งเท่าที่เครดิตพอ แล้วรายงานส่วนที่เหลือออกมาตรง ๆ ดีกว่าปฏิเสธ
     ทั้งแคมเปญ เพราะคนที่ส่งไปแล้วก็ยังได้ประโยชน์จริง */
  const allowance = Math.max(0, Math.floor(tenant.message_credits));

  /* F12 — idempotency key คือ PRIMARY KEY (campaign_id, customer_id)
     เรียกซ้ำกี่ครั้งก็ส่งคนละหนึ่งข้อความเท่านั้น */
  const insMessage = d.prepare(
    `INSERT INTO messages (campaign_id, customer_id, channel, status, cost, sent_at)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT(campaign_id, customer_id) DO NOTHING`,
  );

  let sent = 0;
  let skipped = 0;
  const nowIso = new Date().toISOString();

  let noCredit = 0;

  d.exec("BEGIN");
  try {
    for (const t of targets) {
      if (sent >= allowance) {
        /* ยังต้องนับคนที่เคยส่งแล้วให้ถูก ไม่ใช่เหมาเป็น "เครดิตไม่พอ"
           เพราะคนกลุ่มนั้นไม่ได้ใช้เครดิตเพิ่มอยู่แล้ว */
        const already = d
          .prepare(
            "SELECT 1 AS x FROM messages WHERE campaign_id = ? AND customer_id = ?",
          )
          .get(campaignId, t.customer_id) as { x: number } | undefined;
        if (already) skipped++;
        else noCredit++;
        continue;
      }
      const res = insMessage.run(
        campaignId,
        t.customer_id,
        "line",
        "sent",
        MESSAGE_COST_BAHT,
        nowIso,
      );
      if (Number(res.changes) > 0) sent++;
      else skipped++;
    }
    d.prepare("UPDATE tenants SET message_credits = message_credits - ? WHERE id = ?").run(
      sent,
      camp.tenant_id,
    );
    d.prepare("UPDATE campaigns SET status = 'measuring' WHERE id = ?").run(campaignId);
    d.exec("COMMIT");
  } catch (err) {
    d.exec("ROLLBACK");
    throw err;
  }

  logActivity(
    camp.tenant_id,
    "system",
    "send_campaign",
    `${camp.play_id} · sent ${sent} · skipped ${skipped}` +
      (noCredit ? ` · out of credit ${noCredit}` : ""),
  );

  const left = (getTenant(camp.tenant_id)?.message_credits ?? 0);
  return {
    attempted: targets.length,
    sent,
    skippedAlreadySent: skipped,
    skippedNoCredit: noCredit,
    skippedQuietHours: false,
    creditsLeft: left,
  };
}
