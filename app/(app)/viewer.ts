import "server-only";
import { activeTenantId } from "@/app/(app)/tenant";
import { currentUser } from "@/lib/shared/session";
import { isStaffUser } from "@/lib/engine/campaigns";
import { tenantRole, type TenantRole } from "@/lib/engine/access";
import type { Classification } from "@/lib/shared/vault";

/* ── ผู้อ่านของคำขอนี้ ── บัญชี · ผู้กระทำ · ระดับสิทธิ์ · เป็นทีม PARALLAX ไหม
   ระดับสิทธิ์ยังเป็น "ลับ" สำหรับทุกคนในบัญชี จนกว่าบทบาทจะแยกใน B6 — แก้ที่นี่ที่เดียว
   ("จำกัดสูง" เห็นได้เฉพาะเจ้าของรายการ ไม่ว่าระดับจะเป็นอะไร)
   isStaff: ธง tenant_users.is_staff — กิจกรรมของทีม PARALLAX ไม่นับในหน้าทบทวน (plan หัวข้อ 3.3) */
export async function viewer(): Promise<{ tenantId: string; actor: string; clearance: Classification; isStaff: boolean; role: TenantRole }> {
  const tenantId = await activeTenantId();
  const user = await currentUser();
  const [isStaff, role] = await Promise.all([isStaffUser(tenantId, user?.userId), tenantRole(tenantId, user?.userId)]);
  return { tenantId, actor: user?.email || "owner", clearance: "confidential", isStaff, role };
}

/* ── ด่านบทบาทของ Server Action ── ยิงตรงได้โดยไม่ผ่านหน้าจอ จึงต้องตรวจที่นี่ ไม่ใช่แค่ซ่อนปุ่ม
   write   = owner · operator (viewer อ่านอย่างเดียว — ตรงกับ app.can_write ใน RLS)
   policy  = owner เท่านั้น: ตั้งฐานการประมวลผลคือการอนุมัติว่าใช้ข้อมูลได้ ไม่ใช่งานประจำของ BD (plan หัวข้อ 8)
   บทบาทแยก 6 แบบตามแผน B6 จะแทนที่สองระดับนี้ */
export function denied(v: { role: TenantRole }, need: "write" | "policy"): string | null {
  if (need === "policy") return v.role === "owner" ? null : "เฉพาะเจ้าของบัญชีเท่านั้นที่ตั้งฐานการประมวลผลได้";
  return v.role === "viewer" ? "บทบาทของคุณอ่านได้อย่างเดียว" : null;
}
