import { handleDigestCron } from "@/lib/engine/digest";

/* ── สรุปรายสัปดาห์ถึงตัวเอง (docs/solo-plan.md S8) ──
   Vercel Cron ยิง GET ที่นี่วันละครั้งตาม vercel.json พร้อม Authorization: Bearer <CRON_SECRET>
   ด่าน secret · การเลือกผู้รับ · การส่ง อยู่ใน lib/engine/digest ทั้งหมด (verify:digest ตรวจตรงนั้น) */
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  return handleDigestCron(req);
}
