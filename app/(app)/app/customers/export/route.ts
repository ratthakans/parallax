import { viewer } from "@/app/(app)/viewer";
import { downloadExport } from "@/lib/engine/exports";

/* ── ดาวน์โหลดไฟล์ส่งออกที่อนุมัติแล้ว ──

   ไม่มีการส่งออกทันทีอีกต่อไป: ต้องมีคำขอที่อนุมัติแล้ว (/app/exports) · ผู้ขอเท่านั้น · ครั้งเดียว · ภายในเวลาที่กำหนด
   บัญชีมาจากฝั่งเซิร์ฟเวอร์ และต้องเป็นเจ้าของบัญชี — ไฟล์มีเบอร์และอีเมลแบบอ่านได้ ออกไปแล้วตามคืนไม่ได้ */
export async function GET(req: Request) {
  const v = await viewer();
  if (v.role !== "owner") return new Response("เฉพาะเจ้าของบัญชีเท่านั้นที่ส่งออกรายชื่อได้", { status: 403 });
  const id = new URL(req.url).searchParams.get("request") ?? "";
  const res = await downloadExport(v.tenantId, id, v.actor);
  if (!res.ok) return new Response(res.error, { status: 409, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  // ชื่อไฟล์มีแค่บัญชีกับวันที่ ไม่มีคำค้น — คำค้นอาจเป็นเบอร์หรือชื่อคน
  const day = new Date().toISOString().slice(0, 10);
  return new Response(res.csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${v.tenantId}-customers-${day}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
