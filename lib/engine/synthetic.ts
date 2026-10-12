import { cache } from "react";
import { get } from "@/lib/engine/sql";

/* ── บัญชีนี้ยังมีข้อมูลตัวอย่างอยู่ไหม ──────────────────────────

   แถบ "เดโม · ข้อมูลสังเคราะห์" และคำเตือนบนหน้าผลที่วัดได้ เดิมขึ้นตามว่าเปิด
   เครื่องมือเดโมไว้หรือไม่ (ปิดบน production = ขึ้นทุกหน้า) ร้านที่ล้างข้อมูลตัวอย่าง
   แล้วนำเข้าไฟล์จริงจึงยังเห็นว่าตัวเลขของตัวเองเป็น "ข้อมูลที่สร้างขึ้น"

   ดูจากข้อมูลแทน: ลูกค้าตัวอย่างมีรหัสแบบ "<บัญชี>-c-00001" (lib/engine/seed.ts)
   ส่วนคนที่นำเข้าหรือเพิ่มเองมีรหัส "c-<กุญแจ>" เสมอ */
export const hasSyntheticData = cache(async (tenantId: string): Promise<boolean> => {
  const row = await get<{ x: number }>(
    "SELECT 1 AS x FROM customers WHERE tenant_id = ? AND id LIKE ? LIMIT 1",
    tenantId,
    `${tenantId}-c-%`,
  );
  return Boolean(row);
});
