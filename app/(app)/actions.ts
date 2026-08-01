"use server";

import { all, get, run } from "@/lib/engine/sql";
import { logActivity } from "@/lib/engine/db";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { deriveFeatures } from "@/lib/engine/derive";
import { approveCampaign, sendCampaign } from "@/lib/engine/dispatch";
import { runMatch, getTenant } from "@/lib/engine/match";
import { measureCampaign } from "@/lib/engine/proof";
import { seed } from "@/lib/engine/seed";
import { resetReady } from "@/lib/engine/bootstrap";
import { travelForward } from "@/lib/engine/demo";
import { clearAiCache } from "@/lib/engine/ai";
import { isKnownTenant } from "@/lib/shared/tenants";
import { buyCredits, changePlan, reachBlockedReason } from "@/lib/engine/billing";
import { CREDIT_PACKS, PLANS, isPlanId } from "@/lib/shared/plans";
import {
  getActiveTenantId,
  TENANT_COOKIE,
  TENANT_COOKIE_OPTIONS,
} from "@/lib/shared/active-tenant";
import { messageOf, type ActionState } from "@/lib/shared/action-state";
import { num } from "@/lib/shared/format";
import {
  DEMO_TOOLS_OFF_REASON,
  demoToolsEnabled,
} from "@/lib/shared/demo-tools";

/* ── Server Actions ────────────────────────────────────────────
   Console นี้ยังไม่มีระบบล็อกอิน — บัญชีที่เปิดอยู่มาจาก cookie
   และบันทึกผู้กระทำเป็น owner ตรงนี้คือจุดที่ต้องใส่การตรวจสิทธิ์
   ก่อนเปิดใช้จริง

   assertTenant ตรวจแค่ว่าเป็นบัญชีที่มีอยู่ในทะเบียน ไม่ใช่ตรวจว่า
   ผู้เรียกมีสิทธิ์ในบัญชีนั้น — ป้องกันค่าที่ไม่รู้จักหลุดลงคำสั่ง SQL
   ได้ แต่ยังไม่ใช่การแยกผู้เช่า ต้องเปลี่ยนเป็นตรวจกับ session จริง

   ทุก action คืน ActionState แทนการ throw สำหรับความล้มเหลวที่คาดไว้
   เหตุผลอยู่ใน lib/shared/action-state.ts
   ───────────────────────────────────────────────────────────── */

const ACTOR = "owner";

function assertTenant(tenantId: string) {
  if (!isKnownTenant(tenantId)) throw new Error("No such account");
}

/* ── บัญชีที่ทำงานด้วย มาจากฝั่งเซิร์ฟเวอร์เท่านั้น ──

   เดิมทุก action อ่าน tenantId จาก FormData แล้วตรวจแค่ว่ามีบัญชีนี้อยู่
   จริงในทะเบียน แปลว่าใครก็ยิง POST ตรงมาที่ Server Action พร้อม
   tenantId ของบัญชีอื่นได้ แล้วอนุมัติแคมเปญ · ส่งข้อความ · ล้างข้อมูล
   ของบัญชีนั้นได้ทันที ช่องนี้มองไม่เห็นจากหน้าจอเพราะทุกฟอร์มส่ง
   ค่าที่ถูกอยู่แล้ว — แต่ hidden input ไม่ใช่การควบคุมสิทธิ์

   ตอนนี้อ่านจาก cookie ฝั่งเซิร์ฟเวอร์ ค่าที่ส่งมาในฟอร์มถูกใช้เป็นแค่
   การตรวจว่าหน้าจอที่กดมากับบัญชีเดียวกันจริง ไม่ใช่แหล่งความจริง

   นี่ยังไม่ใช่ auth — cookie แก้ได้ ต้องเปลี่ยนมาอ่านจาก session
   ของผู้ใช้ที่ล็อกอินแล้ว และตรวจว่าคนนี้มีสิทธิ์ในบัญชีนี้จริง
   แต่จุดที่ต้องแก้เหลือฟังก์ชันเดียวคือฟังก์ชันนี้ */
async function currentTenant(formData?: FormData): Promise<string> {
  const tenantId = await getActiveTenantId();
  const claimed = formData ? String(formData.get("tenantId") ?? "") : "";
  if (claimed && claimed !== tenantId) {
    throw new Error(
      "This screen is open on a different account — reload before acting",
    );
  }
  return tenantId;
}

/** สลับบัญชีที่กำลังดู — ของเดโม ไม่ใช่การควบคุมสิทธิ์ */
export async function switchTenantAction(formData: FormData) {
  const tenantId = String(formData.get("tenantId") ?? "");
  assertTenant(tenantId);
  const store = await cookies();
  store.set(TENANT_COOKIE, tenantId, TENANT_COOKIE_OPTIONS);
  revalidateConsole();

  /* ── สลับบัญชีแล้วต้องพาไปหน้าบรีฟของบัญชีนั้น ──

     เดิมสลับแล้วอยู่หน้าเดิม ซึ่งใช้ได้กับหน้ารายการ แต่พังกับหน้าที่ผูก
     กับของชิ้นเดียว: อยู่ที่ /app/campaigns/<id> ของ MST แล้วสลับไป
     HONG MOVE จะค้างอยู่ที่แคมเปญที่ไม่ใช่ของบัญชีนั้นอีกต่อไป

     "สลับบัญชี" แปลว่า "ขอดูบัญชีนี้" และหน้าแรกของบัญชีคือบรีฟ
     redirect ต้องอยู่นอก try/catch เพราะทำงานด้วยการ throw */
  redirect("/app");
}

/* ── ล้างแคชทั้ง segment ไม่ใช่ไล่รายชื่อเส้นทาง ──────────────

   เดิมเป็นรายการแปดเส้นทางที่เขียนมือ ซึ่งตกหน้ารายละเอียดแคมเปญ
   (/app/campaigns/[id]) ไปเงียบ ๆ ผลคือสลับบัญชีขณะเปิดแคมเปญอยู่
   แล้วหน้าจอยังโชว์แคมเปญของบัญชีเดิม — ทั้งที่แคมเปญนั้นไม่ใช่ของ
   บัญชีที่กำลังเปิดแล้ว

   คู่มือ revalidatePath ระบุว่า type: "layout" ล้าง layout ที่ segment
   นั้น รวมถึง layout ที่ซ้อนอยู่ข้างใน และทุกหน้าที่อยู่ใต้มันทั้งหมด
   จึงครอบทุกเส้นทางของคอนโซลด้วยบรรทัดเดียว และไม่มีทางตกหล่นอีก
   เมื่อมีคนเพิ่มหน้าใหม่ */
function revalidateConsole() {
  revalidatePath("/app", "layout");
}

/* ── อนุมัติ ────────────────────────────────────────────────── */

export async function approveAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tenantId = await currentTenant(formData);
  const playId = String(formData.get("playId") ?? "");
  const tone = String(formData.get("tone") ?? "") || undefined;
  const dryRun = formData.get("dryRun") === "1";
  const holdoutRaw = formData.get("holdoutPct");
  const holdoutPct =
    holdoutRaw != null && String(holdoutRaw) !== "" ? Number(holdoutRaw) : undefined;

  const planBlock = await reachBlockedReason(tenantId);
  const { candidates } = await runMatch(tenantId);
  const candidate = candidates.find((c) => c.play.id === playId);

  if (!candidate) {
    return {
      error:
        "That play is no longer in today's brief — reload the page to see the current three.",
    };
  }
  if (candidate.blocked) {
    return { error: `Cannot approve — ${candidate.blocked}` };
  }
  if (planBlock && candidate.play.engine === "reach") {
    return { error: planBlock };
  }

  let campaignId: string;
  try {
    const res = await approveCampaign(candidate, {
      tenantId,
      playId,
      approvedBy: ACTOR,
      tone,
      dryRun,
      holdoutPct,
    });
    campaignId = res.campaignId;
  } catch (err) {
    return { error: messageOf(err) };
  }

  revalidateConsole();

  /* พาไปหน้าแคมเปญที่เพิ่งสร้างเลย ไม่ใช่ปล่อยไว้ที่บรีฟ

     ก่อนหน้านี้กดอนุมัติแล้วหน้าเดิม re-render เฉย ๆ การ์ดที่กดไปกลายเป็น
     "ยังส่งไม่ได้ — ติด cooldown" โดยไม่มีอะไรบอกว่าเป็นผลจากการกดของตัวเอง
     แล้วผู้ใช้ต้องเดาเองว่าต้องไปหน้าแคมเปญ · หาแถวที่ถูก · กดเปิด · แล้วจึงกดส่ง
     รวมสี่ขั้นเพื่อจบงานเดียว

     หน้ารายละเอียดแคมเปญทำหน้าที่เป็นทั้งใบยืนยันและที่อยู่ของปุ่มถัดไป
     redirect ต้องอยู่นอก try/catch เพราะทำงานด้วยการ throw */
  redirect(`/app/campaigns/${campaignId}`);
}

/* ── ส่ง ─────────────────────────────────────────────────────

   sendCampaign คืนรายงานละเอียดอยู่แล้ว — ส่งไปกี่คน · ติดช่วงห้ามส่งไหม ·
   เครดิตหมดกลางทางกี่คน · เหลือเครดิตเท่าไร — แต่เดิมค่านั้นถูกทิ้งทั้งก้อน
   การส่งที่ส่งไม่ออกสักคนเพราะติดเวลา หน้าตาจึงเหมือนการส่งที่สำเร็จ */

export async function sendAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tenantId = await currentTenant(formData);
  const campaignId = String(formData.get("campaignId") ?? "");

  let res;
  try {
    res = await sendCampaign(campaignId, { tenantId });
  } catch (err) {
    return { error: messageOf(err) };
  }

  revalidateConsole();
  revalidatePath(`/app/campaigns/${campaignId}`);

  if (res.skippedQuietHours) {
    const t = await getTenant(tenantId);
    return {
      error:
        `Quiet hours ${t?.quiet_hours_start ?? 21}:00–${t?.quiet_hours_end ?? 9}:00 — ` +
        `nothing was sent to any of the ${num(res.attempted)} recipients. ` +
        `The frozen list is untouched; press send again outside the window.`,
    };
  }

  if (res.sent === 0 && res.skippedNoCredit > 0) {
    return {
      error:
        `Out of message credits — nothing sent, ${num(res.skippedNoCredit)} still waiting. ` +
        `Buy credits on the billing page and press send again.`,
    };
  }

  if (res.sent === 0 && res.skippedAlreadySent > 0) {
    return {
      ok: `Everyone already had this message — ${num(res.skippedAlreadySent)} recipients, nothing sent twice.`,
    };
  }

  const parts = [`Sent ${num(res.sent)}`];
  if (res.skippedAlreadySent > 0) {
    parts.push(`${num(res.skippedAlreadySent)} already had it`);
  }
  parts.push(`${num(res.creditsLeft)} credits left`);

  return {
    ok: parts.join(" · "),
    error:
      res.skippedNoCredit > 0
        ? `Credits ran out partway — ${num(res.skippedNoCredit)} recipients did not get it. Buy credits and press send again.`
        : undefined,
  };
}

/* ── วัดผล ───────────────────────────────────────────────────── */

export async function measureAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tenantId = await currentTenant(formData);
  const campaignId = String(formData.get("campaignId") ?? "");

  let rows;
  try {
    rows = await measureCampaign(campaignId, { tenantId });
  } catch (err) {
    return { error: messageOf(err) };
  }

  revalidateConsole();
  revalidatePath(`/app/campaigns/${campaignId}`);

  if (rows.length === 0) {
    return {
      ok: "Nothing to conclude yet — the first horizon is T+7, so come back after a week.",
    };
  }
  const matured = rows.filter((r) => r.matured).length;
  return {
    ok:
      `Measured ${rows.length} horizon(s)` +
      (matured > 0 ? ` · ${matured} now mature` : " · none mature yet"),
  };
}

export async function measureAllAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tenantId = await currentTenant(formData);
  const rows = await all<{ id: string }>("SELECT id FROM campaigns WHERE tenant_id = ? AND dry_run = 0 AND status != 'complete'", tenantId);

  let horizons = 0;
  for (const r of rows) horizons += (await measureCampaign(r.id, { tenantId })).length;
  revalidateConsole();

  if (rows.length === 0) {
    return {
      ok: "Nothing was due — every campaign here is already concluded.",
    };
  }
  return {
    ok: `Re-measured ${num(rows.length)} campaign(s) · ${num(horizons)} horizon(s) updated.`,
  };
}

/* ── play ────────────────────────────────────────────────────── */

export async function togglePlayAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tenantId = await currentTenant(formData);
  const playId = String(formData.get("playId") ?? "");
  const enabled = formData.get("enabled") === "1";
  await run(`INSERT INTO tenant_plays (tenant_id, play_id, enabled) VALUES (?,?,?)
       ON CONFLICT(tenant_id, play_id) DO UPDATE SET enabled = excluded.enabled`, tenantId, playId, enabled ? 1 : 0);
  await logActivity(tenantId, ACTOR, enabled ? "enable_play" : "disable_play", playId);
  revalidateConsole();
  return {
    ok: enabled
      ? "Turned on — it can appear in tomorrow's brief."
      : "Turned off — it will not be proposed again until you turn it back on.",
  };
}

export async function updateGuardsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tenantId = await currentTenant(formData);
  const playId = String(formData.get("playId") ?? "");
  const readNum = (k: string) => {
    const v = formData.get(k);
    if (v == null || String(v) === "") return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
  };
  await run(`INSERT INTO tenant_plays (tenant_id, play_id, enabled, min_audience, cooldown_days, max_discount_pct)
       VALUES (?,?,1,?,?,?)
       ON CONFLICT(tenant_id, play_id) DO UPDATE SET
         min_audience = excluded.min_audience,
         cooldown_days = excluded.cooldown_days,
         max_discount_pct = excluded.max_discount_pct`, tenantId,
      playId,
      readNum("minAudience"),
      readNum("cooldownDays"),
      readNum("maxDiscountPct"));
  await logActivity(tenantId, ACTOR, "update_guards", playId);
  revalidateConsole();
  return { ok: "Saved — it takes effect on the next brief." };
}

/* ── งานระบบ ─────────────────────────────────────────────────── */

export async function deriveAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tenantId = await currentTenant(formData);
  await deriveFeatures(tenantId);
  const n = (await get<{ n: number }>("SELECT COUNT(*) AS n FROM customer_features WHERE tenant_id = ?", tenantId))!;
  await logActivity(tenantId, ACTOR, "derive_features");
  revalidateConsole();
  return { ok: `Recomputed — ${num(n.n)} rows in the feature table.` };
}

export async function reseedAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tenantId = await currentTenant(formData);
  /* ตรวจที่นี่ ไม่ใช่แค่ซ่อนปุ่ม — การซ่อนปุ่มไม่ใช่การป้องกัน
     Server Action ยิงตรงได้โดยไม่ผ่านหน้าจอ */
  if (!demoToolsEnabled()) return { error: DEMO_TOOLS_OFF_REASON };
  // เฉพาะบัญชีที่เปิดอยู่ — ไม่ล้างอีกสามบัญชีที่ผู้ใช้ไม่ได้สั่ง
  seed({ force: true, only: tenantId });
  await deriveFeatures(tenantId);
  resetReady();
  revalidateConsole();
  return { ok: "Rebuilt — campaigns and results for this account are gone." };
}

export async function travelAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tenantId = await currentTenant(formData);
  if (!demoToolsEnabled()) return { error: DEMO_TOOLS_OFF_REASON };
  const raw = Number(formData.get("days") ?? 0);
  const days = Number.isFinite(raw) ? Math.min(365, Math.max(1, Math.floor(raw))) : 30;
  const res = await travelForward(tenantId, days);
  revalidateConsole();
  if (res.campaigns === 0) {
    return {
      ok: "No campaigns to move — approve and send one first, then travel forward.",
    };
  }
  return {
    ok: `Moved ${days} days back in time · ${num(res.campaigns)} campaign(s) shifted · ${num(res.measured)} re-measured.`,
  };
}

export async function clearAiCacheAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tenantId = await currentTenant(formData);
  clearAiCache();
  await logActivity(tenantId, ACTOR, "clear_ai_cache");
  revalidateConsole();
  return { ok: "Cleared — the next brief writes its sentences from scratch." };
}

export async function updateLimitsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tenantId = await currentTenant(formData);
  const readInt = (k: string, lo: number, hi: number, dflt: number) => {
    const n = Number(formData.get(k));
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.floor(n))) : dflt;
  };
  const weeklyCap = readInt("weeklyCap", 1, 14, 2);
  const quietStart = readInt("quietStart", 0, 23, 21);
  const quietEnd = readInt("quietEnd", 0, 23, 9);
  const maxDiscount = readInt("maxDiscount", 0, 100, 20);
  await run(`UPDATE tenants SET max_messages_per_week = ?, quiet_hours_start = ?,
         quiet_hours_end = ?, max_discount_pct = ? WHERE id = ?`, weeklyCap, quietStart, quietEnd, maxDiscount, tenantId);
  await logActivity(tenantId, ACTOR, "update_limits");
  revalidateConsole();

  /* ตั้งเวลาเริ่มเท่ากับเวลาจบ = ไม่มีช่วงห้ามส่งเลย ต้องบอกให้ชัด
     ไม่ใช่ปล่อยให้เข้าใจว่าตั้งได้แล้วแต่จริง ๆ ปิดกั้นไม่ทำงาน */
  return {
    ok:
      quietStart === quietEnd
        ? `Saved — quiet hours are now off entirely, so messages can go out at any hour. Cap ${weeklyCap}/week · discount ceiling ${maxDiscount}%.`
        : `Saved — quiet hours ${quietStart}:00–${quietEnd}:00 · cap ${weeklyCap}/week · discount ceiling ${maxDiscount}%.`,
  };
}

/* ── ค่าใช้จ่ายและแผน ──────────────────────────────────────────── */

export async function buyCreditsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tenantId = await currentTenant(formData);
  const messages = Number(formData.get("messages") ?? 0);
  /* รับเฉพาะขนาดแพ็กที่มีขายจริง ไม่ใช่เลขอะไรก็ได้ที่ส่งมาในฟอร์ม —
     ไม่งั้นยิงค่าลบมาก็หักเครดิตติดลบได้ และยิงเลขใหญ่มาก็ได้เครดิตฟรี */
  const pack = CREDIT_PACKS.find((p) => p.messages === messages);
  if (!pack) return { error: "No credit pack of that size." };
  const total = await buyCredits(tenantId, pack.messages, "pack");
  revalidateConsole();
  return {
    ok: `Added ${num(pack.messages)} credits · ${num(total)} available now.`,
  };
}

/** เปลี่ยนแผน — ของเดโม ระบบจริงต้องผ่านการชำระเงินและสัญญา */
export async function changePlanAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tenantId = await currentTenant(formData);
  const plan = String(formData.get("plan") ?? "");
  if (!isPlanId(plan)) return { error: "No such plan." };
  await changePlan(tenantId, plan);
  revalidateConsole();
  return { ok: `Now on ${PLANS[plan].name}. Caps and limits changed immediately.` };
}
