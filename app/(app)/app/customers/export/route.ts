import { activeTenantId } from "@/app/(app)/tenant";
import { currentUser } from "@/lib/shared/session";
import { membershipEnforced } from "@/lib/engine/access";
import { get } from "@/lib/engine/sql";
import {
  CUSTOMER_FILTERS,
  CUSTOMER_SORTS,
  exportCustomersCsv,
  type CustomerFilter,
  type CustomerSort,
} from "@/lib/engine/customers";

/* ── ส่งออกรายชื่อตามที่กรองอยู่บนหน้าจอ ──

   ใช้ GET เพราะเป็นการดาวน์โหลดธรรมดา แต่สิทธิ์ตรวจที่นี่ทุกครั้ง: บัญชีมาจาก
   ฝั่งเซิร์ฟเวอร์ (activeTenantId) และบน Postgres ต้องเป็นเจ้าของบัญชี — ไฟล์นี้
   มีเบอร์และอีเมลแบบอ่านได้ ซึ่งออกไปจากระบบแล้วตามคืนไม่ได้ */
export async function GET(req: Request) {
  const tenantId = await activeTenantId();
  const user = await currentUser();
  if (membershipEnforced()) {
    const role = user
      ? (await get<{ role: string }>(
          "SELECT role FROM tenant_users WHERE user_id = ? AND tenant_id = ?",
          user.userId,
          tenantId,
        ))?.role
      : undefined;
    if (role !== "owner") {
      return new Response("เฉพาะเจ้าของบัญชีเท่านั้นที่ส่งออกรายชื่อได้", { status: 403 });
    }
  }

  const sp = new URL(req.url).searchParams;
  const filter = sp.get("filter") as CustomerFilter | null;
  const sort = sp.get("sort") as CustomerSort | null;
  const { csv } = await exportCustomersCsv(
    tenantId,
    {
      q: sp.get("q")?.slice(0, 120) ?? undefined,
      filter: filter && CUSTOMER_FILTERS.includes(filter) ? filter : "all",
      sort: sort && CUSTOMER_SORTS.includes(sort) ? sort : "last",
    },
    user?.email || "owner",
  );

  // ชื่อไฟล์มีแค่บัญชีกับวันที่ ไม่มีคำค้น — คำค้นอาจเป็นเบอร์หรือชื่อคน
  const day = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${tenantId}-customers-${day}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
