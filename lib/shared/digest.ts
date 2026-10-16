/* ── สรุปรายสัปดาห์ถึงตัวเอง (docs/solo-plan.md S8) ─────────────────────

   อีเมลออกนอกระบบได้ ข้อมูลส่วนบุคคลไม่ควรตามไป — ตัวสร้างอีเมลจึงรับแค่ "จำนวน" (DigestCounts)
   ไม่มีช่องให้ส่งชื่อ อีเมล เบอร์ หรือชื่อบริษัทของคนในฐานเข้ามาเลย ถ้าวันหนึ่งมีคนอยากใส่ชื่อ
   ต้องแก้ชนิดข้อมูลที่นี่ก่อน ซึ่ง verify:digest จะจับได้

   ชื่อบัญชี (tenantName) คือชื่อธุรกิจของผู้ใช้เอง ไม่ใช่คนในฐาน — มีไว้แยกอีเมลเมื่อผู้ใช้อยู่หลายบัญชี
   ไฟล์นี้บริสุทธิ์: ไม่แตะฐาน ไม่แตะเครือข่าย (ส่งจริงอยู่ที่ lib/engine/digest) */

import { QUEUE_SECTIONS, QUEUE_SECTION_TH, type QueueSection } from "@/lib/shared/today";
import { thaiDate } from "@/lib/shared/format";

/** วันในสัปดาห์แบบ ISO: 1 = จันทร์ … 7 = อาทิตย์ (ค่าตั้งต้น = จันทร์ ตามสเปก) */
export const DIGEST_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export type DigestWeekday = (typeof DIGEST_WEEKDAYS)[number];
export const DEFAULT_DIGEST_WEEKDAY: DigestWeekday = 1;

export const WEEKDAY_TH: Record<DigestWeekday, string> = {
  1: "วันจันทร์", 2: "วันอังคาร", 3: "วันพุธ", 4: "วันพฤหัสบดี", 5: "วันศุกร์", 6: "วันเสาร์", 7: "วันอาทิตย์",
};

/** วันในสัปดาห์ตามเวลาไทย (UTC+7 ไม่มีเวลาออมแสง) — cron ยิงตอน 01:00 UTC = 08:00 ไทย */
export function bangkokWeekday(t: number | Date = Date.now()): DigestWeekday {
  const d = new Date(+t + 7 * 3600_000).getUTCDay();
  return (d === 0 ? 7 : d) as DigestWeekday;
}

export const isDigestWeekday = (n: number): n is DigestWeekday => Number.isInteger(n) && n >= 1 && n <= 7;

/** โอกาสขายที่ไม่ขยับนานเกินนี้นับว่า "ค้าง" */
export const DIGEST_STUCK_DAYS = 14;

export type DigestCounts = {
  tenantName: string;
  /** วันที่ส่ง (เวลาไทย YYYY-MM-DD) */
  day: string;
  /** จำนวนต่อหมวดของหน้า "วันนี้" (S1) — นับทั้งหมด ไม่ใช่แค่ที่แสดง */
  queue: Record<QueueSection, number>;
  reviewsNotBlocking: number;
  opportunities: { moved: number; stuck: number };
  /** คนที่รู้จักย้ายบริษัท (S3) ที่เริ่มที่ใหม่ใน 7 วัน */
  jobMovesThisWeek: number;
  expiring: { due: number; dueSoon: number };
  requests: { open: number; overdue: number };
};

export type DigestEmail = { subject: string; text: string; html: string };

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** ประกอบอีเมลจากจำนวนล้วน · consoleUrl = ที่อยู่เว็บ (ไม่มี / ท้าย) */
export function buildDigest(c: DigestCounts, consoleUrl: string): DigestEmail {
  const base = consoleUrl.replace(/\/$/, "");
  const waiting = QUEUE_SECTIONS.reduce((s, k) => s + c.queue[k], 0);
  const subject = `PARALLAX · สรุปสัปดาห์ · ${c.tenantName} — ${waiting ? `${waiting} รายการรอคุณ` : "ไม่มีงานค้าง"}`;

  const groups: { title: string; href: string; rows: [string, number][] }[] = [
    {
      title: "หน้า \"วันนี้\"", href: `${base}/app/today`,
      rows: [
        ...QUEUE_SECTIONS.map((k) => [QUEUE_SECTION_TH[k].title, c.queue[k]] as [string, number]),
        ["รอตรวจที่ไม่กระทบงาน", c.reviewsNotBlocking],
      ],
    },
    {
      title: "โอกาสขาย", href: `${base}/app/sales/weekly`,
      rows: [["ขยับใน 7 วันที่ผ่านมา", c.opportunities.moved], [`ค้าง (ไม่ขยับเกิน ${DIGEST_STUCK_DAYS} วัน)`, c.opportunities.stuck]],
    },
    {
      title: "คนที่รู้จักย้ายบริษัท", href: `${base}/app/today`,
      rows: [["เริ่มที่ใหม่ใน 7 วันที่ผ่านมา", c.jobMovesThisWeek]],
    },
    {
      title: "ข้อมูลใกล้หมดอายุ", href: `${base}/app/today`,
      rows: [["ครบอายุแล้ว", c.expiring.due], ["จะครบอายุใน 14 วัน", c.expiring.dueSoon]],
    },
    {
      title: "คำขอสิทธิของเจ้าของข้อมูล", href: `${base}/app/requests`,
      rows: [["เปิดอยู่", c.requests.open], ["เลยกำหนด 30 วัน", c.requests.overdue]],
    },
  ];

  const note = "อีเมลนี้มีแค่จำนวน ไม่มีชื่อหรือข้อมูลติดต่อของคนในฐาน — ดูรายละเอียดในระบบ";
  const off = `ปิดหรือเปลี่ยนวันได้ที่ ${base}/app/settings`;

  const text = [
    `สรุปรายสัปดาห์ · ${c.tenantName} · ${thaiDate(c.day)}`,
    "",
    ...groups.flatMap((g) => [g.title, ...g.rows.map(([k, n]) => `- ${k}: ${n}`), `  ${g.href}`, ""]),
    note,
    off,
  ].join("\n");

  const html = `<!doctype html><html lang="th"><body style="font-family:sans-serif;color:#1a1a1a;max-width:560px">
<p style="font-size:13px;color:#666">สรุปรายสัปดาห์ · ${esc(c.tenantName)} · ${esc(thaiDate(c.day))}</p>
${groups.map((g) => `<h3 style="margin:20px 0 6px;font-size:15px"><a href="${esc(g.href)}" style="color:#1a1a1a">${esc(g.title)}</a></h3>
<table style="border-collapse:collapse;font-size:14px">${g.rows.map(([k, n]) => `<tr><td style="padding:2px 16px 2px 0">${esc(k)}</td><td style="text-align:right;font-weight:600">${n}</td></tr>`).join("")}</table>`).join("\n")}
<p style="margin-top:24px"><a href="${esc(`${base}/app/today`)}">เปิดคอนโซล</a></p>
<p style="font-size:12px;color:#666">${esc(note)}<br><a href="${esc(`${base}/app/settings`)}" style="color:#666">ปิดหรือเปลี่ยนวัน</a></p>
</body></html>`;

  return { subject, text, html };
}
