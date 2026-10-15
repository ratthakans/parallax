import { viewer } from "@/app/(app)/viewer";
import { buildReport } from "@/lib/engine/dsar";

/* ── รายงานข้อมูลของผู้ขอ (คำขอเข้าถึง · โอนย้าย) ──
   JSON อ่านด้วยเครื่องได้ (ใช้ได้ทั้งสองสิทธิ) · มีช่องทางติดต่อแบบเต็ม จึงเป็นของเจ้าของบัญชีเท่านั้น
   และต้องยืนยันตัวตนผู้ขอแล้ว (engine ตรวจ) · ทุกครั้งที่สร้างถูกบันทึกว่าใครสร้าง ไม่บันทึกเนื้อหา */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await viewer();
  if (v.role !== "owner") return new Response("เฉพาะเจ้าของบัญชีเท่านั้นที่สร้างรายงานคำขอสิทธิได้", { status: 403 });
  const res = await buildReport(v.tenantId, id, v.actor);
  if (!res.ok) return new Response(res.error, { status: 409, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  // ชื่อไฟล์มีแค่เลขเรื่อง ไม่มีชื่อผู้ขอ
  return new Response(JSON.stringify(res.report, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${res.report.request.ref}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
