import "server-only";
import { activeTenantId } from "@/app/(app)/tenant";
import { currentUser } from "@/lib/shared/session";
import { isStaffUser } from "@/lib/engine/campaigns";
import type { Classification } from "@/lib/shared/vault";

/* ── ผู้อ่านของคำขอนี้ ── บัญชี · ผู้กระทำ · ระดับสิทธิ์ · เป็นทีม PARALLAX ไหม
   ระดับสิทธิ์ยังเป็น "ลับ" สำหรับทุกคนในบัญชี จนกว่าบทบาทจะแยกใน B6 — แก้ที่นี่ที่เดียว
   ("จำกัดสูง" เห็นได้เฉพาะเจ้าของรายการ ไม่ว่าระดับจะเป็นอะไร)
   isStaff: ธง tenant_users.is_staff — กิจกรรมของทีม PARALLAX ไม่นับในหน้าทบทวน (plan หัวข้อ 3.3) */
export async function viewer(): Promise<{ tenantId: string; actor: string; clearance: Classification; isStaff: boolean }> {
  const tenantId = await activeTenantId();
  const user = await currentUser();
  return { tenantId, actor: user?.email || "owner", clearance: "confidential", isStaff: await isStaffUser(tenantId, user?.userId) };
}
