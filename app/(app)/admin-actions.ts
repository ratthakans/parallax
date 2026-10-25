"use server";

import { currentUser } from "@/lib/shared/session";
import { isAdmin } from "@/lib/engine/admin";
import type { ActionState } from "@/lib/shared/action-state";

/* ── การกระทำของผู้ดูแลระบบ — ตัวอย่างหน้าจอ (mockup) ───────────────

   การเพิ่มร้านและเชิญผู้ใช้ยังทำจริงไม่ได้: ร้านทั้งสี่ถูกกำหนดไว้ในโค้ด
   (lib/shared/tenants.ts) และผู้ใช้ต้องสร้างใน Supabase Auth ก่อนผูกกับร้าน
   ปุ่มเหล่านี้จึงตรวจข้อมูลที่กรอกและบอกตรง ๆ ว่าระบบจริงจะทำอะไร —
   ไม่สร้างอะไรและไม่บอกว่าสำเร็จ */

const field = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

async function guard(): Promise<ActionState | null> {
  const user = await currentUser();
  return isAdmin(user?.email) ? null : { error: "เฉพาะทีมผู้ดูแลระบบ Parallax" };
}

export async function mockCreateShopAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const denied = await guard();
  if (denied) return denied;
  const name = field(fd, "name");
  const owner = field(fd, "ownerEmail");
  if (!name) return { error: "ใส่ชื่อร้าน" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(owner)) return { error: "ใส่อีเมลเจ้าของร้านให้ถูกต้อง" };
  return {
    ok:
      `ตัวอย่าง — ยังไม่ได้สร้างจริง ระบบจริงจะ: สร้างร้าน "${name}" (แผน ${field(fd, "plan") || "Pilot"}) ` +
      `· สร้างบัญชีให้ ${owner} และส่งอีเมลเชิญตั้งรหัสผ่าน · ผูกเป็นเจ้าของร้าน · เปิดบรีฟว่างที่รอนำเข้าไฟล์`,
  };
}

export async function mockInviteUserAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const denied = await guard();
  if (denied) return denied;
  const email = field(fd, "email");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "ใส่อีเมลให้ถูกต้อง" };
  const role = field(fd, "role") === "owner" ? "เจ้าของ" : field(fd, "role") === "exec" ? "ผู้บริหาร (ดูอย่างเดียว)" : "ทีมงาน";
  return {
    ok: `ตัวอย่าง — ยังไม่ได้เชิญจริง ระบบจริงจะส่งอีเมลเชิญ ${email} เข้าร้าน ${field(fd, "shop")} ในบทบาท ${role}`,
  };
}
