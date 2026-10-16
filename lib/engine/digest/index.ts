import { createHash, timingSafeEqual } from "node:crypto";
import { all, asSystem, get, run, usingPostgres, withIdentity } from "@/lib/engine/sql";
import { ensureSchema } from "@/lib/engine/db";
import type { Viewer } from "@/lib/engine/accounts";
import { loadPathGraph } from "@/lib/engine/accounts/paths";
import { todayQueue } from "@/lib/engine/today";
import { jobMoves } from "@/lib/engine/today/moves";
import { retentionSummary } from "@/lib/engine/retention";
import { listRequests } from "@/lib/engine/dsar";
import { weeklyReview } from "@/lib/engine/campaigns";
import { getTenant } from "@/lib/engine/match";
import {
  DEFAULT_DIGEST_WEEKDAY, DIGEST_STUCK_DAYS, bangkokWeekday, buildDigest, isDigestWeekday,
  type DigestCounts, type DigestWeekday,
} from "@/lib/shared/digest";
import { QUEUE_SECTIONS, type QueueSection } from "@/lib/shared/today";
import { bangkokDay } from "@/lib/shared/format";
import { profileFor } from "@/lib/shared/tenants";
import { siteUrl } from "@/lib/shared/site-url";

/* ── สรุปรายสัปดาห์ถึงตัวเอง (docs/solo-plan.md S8) ─────────────────────

   cron ของ Vercel ยิง /api/cron/digest วันละครั้ง (01:00 UTC = 08:00 ไทย) → ส่งให้ผู้ใช้ที่เปิดไว้และเลือกวันนี้
   - ผู้รับคือผู้ใช้เอง (อีเมลที่ใช้ล็อกอิน) ไม่ใช่คนในฐาน — ไม่ขัดกติกา "ไม่ส่งอีเมลจากระบบถึงคนในฐาน"
   - เนื้อหามีแค่จำนวน + ลิงก์ (lib/shared/digest.ts รับแค่ DigestCounts)
   - หนึ่งอีเมลต่อ (บัญชี, ผู้ใช้) — นับในนามผู้ใช้คนนั้น (withIdentity → RLS บน Postgres) ทีละบัญชี ไม่รวมข้ามบัญชี
   - ส่งซ้ำในวันเดียวกันไม่ได้: จองวันก่อนส่ง (UPDATE … WHERE last_sent_day <> วันนี้) ส่งไม่สำเร็จคืนค่าเดิม
   - เปิดใช้เอง (ไม่มีแถว = ไม่ส่ง) — ผู้ให้บริการอีเมลเห็นอีเมลของผู้ใช้ จึงต้องเป็นสิ่งที่ผู้ใช้เลือก */

export type DigestPrefs = { enabled: boolean; weekday: DigestWeekday; lastSentAt: string | null };

export async function digestPrefs(tenantId: string, userId: string): Promise<DigestPrefs> {
  const r = await get<{ enabled: number | boolean; weekday: number | string; last_sent_at: string | null }>(
    "SELECT enabled, weekday, last_sent_at FROM digest_prefs WHERE tenant_id = ? AND user_id = ?", tenantId, userId);
  const wd = Number(r?.weekday);
  return { enabled: Boolean(Number(r?.enabled ?? 0)), weekday: isDigestWeekday(wd) ? wd : DEFAULT_DIGEST_WEEKDAY, lastSentAt: r?.last_sent_at ?? null };
}

export async function setDigestPrefs(
  tenantId: string, userId: string, input: { enabled: boolean; weekday: number }, now = new Date(),
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isDigestWeekday(input.weekday)) return { ok: false, error: "เลือกวันในสัปดาห์" };
  /* ตั้งได้เฉพาะบัญชีที่เป็นสมาชิก — บน Postgres RLS กันอีกชั้น (ผู้ใช้เขียนได้แค่แถวของตัวเอง) */
  if (!(await get("SELECT 1 AS x FROM tenant_users WHERE tenant_id = ? AND user_id = ?", tenantId, userId))) {
    return { ok: false, error: "ผู้ใช้นี้ไม่ได้เป็นสมาชิกของบัญชีนี้" };
  }
  await run(
    `INSERT INTO digest_prefs (tenant_id, user_id, enabled, weekday, updated_at) VALUES (?,?,?,?,?)
     ON CONFLICT (tenant_id, user_id) DO UPDATE SET enabled = excluded.enabled, weekday = excluded.weekday, updated_at = excluded.updated_at`,
    tenantId, userId, input.enabled ? 1 : 0, input.weekday, now.toISOString());
  return { ok: true };
}

/* ── นับ ── อ่านจากเครื่องคิดเดิมทั้งหมด (คิววันนี้ · คนย้ายบริษัท · อายุข้อมูล · คำขอสิทธิ · ทบทวนรายสัปดาห์)
   ใช้แค่ความยาวของผล — ชื่อที่อยู่ในผลไม่ถูกส่งต่อ */
export async function digestCounts(tenantId: string, viewer: Viewer, now = new Date()): Promise<DigestCounts> {
  const weekAgo = new Date(+now - 7 * 864e5);
  const stuckBefore = new Date(+now - DIGEST_STUCK_DAYS * 864e5).toISOString();
  const [q, review, stuck, graph, retention, requests, tenant] = await Promise.all([
    todayQueue(tenantId, viewer, now),
    weeklyReview(tenantId, weekAgo.toISOString()),
    get<{ n: number | string }>(
      "SELECT COUNT(*) AS n FROM opportunities WHERE tenant_id = ? AND stage NOT IN ('won', 'lost') AND updated_at < ?", tenantId, stuckBefore),
    loadPathGraph(tenantId, viewer.clearance, now.toISOString()),
    retentionSummary(tenantId, now),
    listRequests(tenantId, now),
    getTenant(tenantId),
  ]);
  const moves = await jobMoves(tenantId, viewer, graph, now);
  const weekStart = bangkokDay(weekAgo);
  const open = requests.filter((r) => r.status === "open");
  const queue = Object.fromEntries(QUEUE_SECTIONS.map((s) => {
    const sec = q.sections.find((x) => x.section === s);
    return [s, sec ? sec.items.length + sec.more : 0];
  })) as Record<QueueSection, number>;
  return {
    tenantName: tenant?.name ?? profileFor(tenantId).name,
    day: bangkokDay(now),
    queue,
    reviewsNotBlocking: q.reviewsNotBlocking,
    opportunities: { moved: review.opportunities.length, stuck: Number(stuck?.n ?? 0) },
    jobMovesThisWeek: moves.filter((m) => m.since != null && m.since.slice(0, 10) >= weekStart).length,
    expiring: { due: retention.due, dueSoon: retention.dueSoon },
    requests: { open: open.length, overdue: open.filter((r) => r.daysLeft < 0).length },
  };
}

/* ── ส่ง ── Resend ผ่าน HTTP (ไม่เพิ่ม dependency) · ไม่ได้ตั้งค่า = ข้าม ไม่ล้ม
   ผู้ให้บริการช่วงตัวนี้อยู่ในทะเบียน docs/plan.md 7.3 (เมื่อเปิดใช้) — เห็นอีเมลผู้ใช้และจำนวน ไม่เห็นข้อมูลคนในฐาน */
export type DigestMessage = { to: string; subject: string; text: string; html: string };
export type SendResult = { status: "sent"; id?: string } | { status: "not_configured" } | { status: "failed"; error: string };
export type Sender = (m: DigestMessage) => Promise<SendResult>;

export const resendSender: Sender = async (m) => {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.DIGEST_FROM;
  if (!key || !from) return { status: "not_configured" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [m.to], subject: m.subject, text: m.text, html: m.html }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { status: "failed", error: `Resend ตอบ ${res.status}` };
    const body = (await res.json().catch(() => ({}))) as { id?: string };
    return { status: "sent", id: body.id };
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err.name : "ส่งไม่สำเร็จ" };
  }
};

/** อีเมลที่ใช้ล็อกอินของผู้ใช้ — อยู่ใน auth.users ของ Supabase จึงมีเฉพาะบน Postgres */
async function authEmails(userIds: string[]): Promise<Map<string, string>> {
  if (!usingPostgres() || !userIds.length) return new Map();
  const rows = await asSystem(() => all<{ id: string; email: string | null }>(
    `SELECT id::text AS id, email FROM auth.users WHERE id::text IN (${userIds.map(() => "?").join(",")})`, ...userIds));
  return new Map(rows.filter((r) => r.email).map((r) => [r.id, r.email!]));
}

export type DigestRun = {
  day: string; weekday: DigestWeekday;
  due: number; sent: number; already: number; noEmail: number; failed: number; notConfigured: boolean;
};

export async function runWeeklyDigests(opts: {
  now?: Date; send?: Sender; emailsFor?: (userIds: string[]) => Promise<Map<string, string>>; consoleUrl?: string;
} = {}): Promise<DigestRun> {
  const now = opts.now ?? new Date();
  const send = opts.send ?? resendSender;
  const day = bangkokDay(now);
  const weekday = bangkokWeekday(now);
  const out: DigestRun = { day, weekday, due: 0, sent: 0, already: 0, noEmail: 0, failed: 0, notConfigured: false };

  /* อ่านข้ามบัญชีโดยตั้งใจ (งานเบื้องหลังไม่มีผู้ใช้) — เฉพาะตารางความชอบ ไม่ใช่ข้อมูลคนในฐาน
     ต้องยังเป็นสมาชิกอยู่ (JOIN tenant_users): ถูกถอดออกจากบัญชีแล้วต้องหยุดได้รับทันที */
  const rows = await asSystem(() => all<{ tenant_id: string; user_id: string; last_sent_day: string | null }>(
    `SELECT p.tenant_id, p.user_id, p.last_sent_day FROM digest_prefs p
     JOIN tenant_users t ON t.tenant_id = p.tenant_id AND t.user_id = p.user_id
     WHERE p.enabled = 1 AND p.weekday = ? AND (p.last_sent_day IS NULL OR p.last_sent_day <> ?)
     ORDER BY p.tenant_id, p.user_id`, weekday, day));
  out.due = rows.length;
  if (!rows.length) return out;
  const emails = await (opts.emailsFor ?? authEmails)([...new Set(rows.map((r) => String(r.user_id)))]);
  const base = opts.consoleUrl ?? siteUrl();

  for (const r of rows) {
    const userId = String(r.user_id);
    const to = emails.get(userId);
    if (!to) { out.noEmail++; continue; }
    /* จองวันนี้ก่อนส่ง — cron สองรอบที่ซ้อนกันจะมีรอบเดียวที่ได้แถวนี้ */
    const claim = await asSystem(() => run(
      `UPDATE digest_prefs SET last_sent_day = ? WHERE tenant_id = ? AND user_id = ? AND enabled = 1
         AND (last_sent_day IS NULL OR last_sent_day <> ?)`, day, r.tenant_id, userId, day));
    if (claim.changes !== 1) { out.already++; continue; }
    const release = () => asSystem(() => run(
      "UPDATE digest_prefs SET last_sent_day = ? WHERE tenant_id = ? AND user_id = ? AND last_sent_day = ?", r.last_sent_day, r.tenant_id, userId, day));

    let result: SendResult;
    try {
      /* นับในนามผู้ใช้คนนี้ในบัญชีนี้เท่านั้น · ระดับสิทธิ์เดียวกับ app/(app)/viewer.ts · ตัวระบุในคิว = อีเมล (เหมือน viewer().actor) */
      const counts = await withIdentity(userId, () => digestCounts(r.tenant_id, { id: to, clearance: "confidential" }, now));
      result = await send({ to, ...buildDigest(counts, base) });
    } catch (err) {
      result = { status: "failed", error: err instanceof Error ? err.message : "สร้างสรุปไม่สำเร็จ" };
    }
    if (result.status === "sent") {
      await asSystem(() => run("UPDATE digest_prefs SET last_sent_at = ? WHERE tenant_id = ? AND user_id = ?", now.toISOString(), r.tenant_id, userId));
      out.sent++;
      continue;
    }
    await release();
    if (result.status === "not_configured") {
      /* ยังไม่ได้ตั้งผู้ให้บริการอีเมล — ทุกแถวที่เหลือจะได้ผลเดียวกัน ไม่ต้องนับต่อ */
      out.notConfigured = true;
      console.log("[digest] not configured — ตั้ง RESEND_API_KEY และ DIGEST_FROM เพื่อส่งสรุปรายสัปดาห์ · ไม่ได้ส่งอะไร");
      break;
    }
    out.failed++;
    console.warn(`[digest] ส่งไม่สำเร็จ (${r.tenant_id}): ${result.error}`);
  }
  return out;
}

/* ── ด่านของ cron ── Vercel ส่ง Authorization: Bearer <CRON_SECRET>
   ไม่ได้ตั้ง CRON_SECRET = ปฏิเสธทุกคำขอ (ไม่เปิดโล่ง) · เทียบ hash เวลาคงที่ จึงไม่รั่วความยาวหรือตัวอักษรที่ตรง */
export function cronAuthorized(header: string | null, secret = process.env.CRON_SECRET): boolean {
  if (!secret || !header) return false;
  const a = createHash("sha256").update(header).digest();
  const b = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(a, b);
}

export async function handleDigestCron(req: Request, opts: Parameters<typeof runWeeklyDigests>[0] = {}): Promise<Response> {
  if (!cronAuthorized(req.headers.get("authorization"))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  await ensureSchema();
  return Response.json(await runWeeklyDigests(opts));
}
