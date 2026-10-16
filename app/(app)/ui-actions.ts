"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

/* ── ธีมของคอนโซล (docs/ux-plan.md U1) ── ความชอบของเบราว์เซอร์นี้ ไม่ใช่ข้อมูลของบัญชี
   อ่านฝั่งเซิร์ฟเวอร์ใน layout จึงไม่กะพริบเป็นธีมผิดก่อนโหลด · ค่าที่ไม่รู้จัก = สว่าง */
export async function setThemeAction(fd: FormData) {
  const theme = fd.get("theme") === "dark" ? "dark" : "light";
  (await cookies()).set("parallax_theme", theme, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365, secure: process.env.NODE_ENV === "production" });
  revalidatePath("/app", "layout");
}
