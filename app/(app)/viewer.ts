import "server-only";
import { activeTenantId } from "@/app/(app)/tenant";
import { currentUser, type Session } from "@/lib/shared/session";
import { isStaffUser } from "@/lib/engine/campaigns";
import { membershipEnforced, tenantRole, type TenantRole } from "@/lib/engine/access";
import type { Classification } from "@/lib/shared/vault";
import { gate, type Capability } from "@/lib/shared/roles";

/* ── ผู้อ่านของคำขอนี้ ── บัญชี · ผู้กระทำ · ระดับสิทธิ์ · เป็นทีม PARALLAX ไหม
   ระดับสิทธิ์ยังเป็น "ลับ" สำหรับทุกบทบาท (บทบาทแยกสิทธิ์การกระทำ ไม่ใช่ระดับความลับ) — แก้ที่นี่ที่เดียว
   ("จำกัดสูง" เห็นได้เฉพาะเจ้าของรายการ ไม่ว่าระดับจะเป็นอะไร)
   isStaff: ธง tenant_users.is_staff — กิจกรรมของทีม PARALLAX ไม่นับในหน้าทบทวน (plan หัวข้อ 3.3) */
export type Viewer = { tenantId: string; actor: string; clearance: Classification; isStaff: boolean; role: TenantRole; mfa: Session["mfa"] };

export async function viewer(): Promise<Viewer> {
  const tenantId = await activeTenantId();
  const user = await currentUser();
  const [isStaff, role] = await Promise.all([isStaffUser(tenantId, user?.userId), tenantRole(tenantId, user?.userId)]);
  /* โหมดเดโม (ไม่มีการล็อกอิน) ไม่มีอะไรให้ยืนยันสองชั้น — ข้อมูลเป็นของสมมุติทั้งก้อน */
  const mfa = membershipEnforced() ? (user?.mfa ?? "none") : "verified";
  return { tenantId, actor: user?.email || "owner", clearance: "confidential", isStaff, role, mfa };
}

/* ── ด่านบทบาทของ Server Action ── ยิงตรงได้โดยไม่ผ่านหน้าจอ จึงต้องตรวจที่นี่ ไม่ใช่แค่ซ่อนปุ่ม
   ตารางว่าบทบาทไหนทำอะไรได้อยู่ที่ lib/shared/roles.ts ที่เดียว · คืนข้อความเมื่อไม่มีสิทธิ์ · null = ทำได้ */
export function denied(v: { role: TenantRole; mfa: Session["mfa"] }, need: Capability): string | null {
  return gate(v.role, v.mfa, need);
}
