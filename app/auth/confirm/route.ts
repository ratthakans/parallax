import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/shared/supabase";

/* ── ลิงก์ยืนยันอีเมลหลังสมัคร (S9) ──
   รับได้สองรูปแบบที่ Supabase ส่งมา: token_hash + type (แม่แบบอีเมลแบบ server-side) หรือ code (PKCE)
   ชนิดของ OTP ตายตัวเป็น "email" (ยืนยันอีเมล/สมัคร) — ไม่อ่าน type จาก URL มาตัดสิน (CodeQL js/user-controlled-bypass)
   ลิงก์ชนิดอื่น (รีเซ็ตรหัสผ่าน · เปลี่ยนอีเมล) จึงยืนยันที่นี่ไม่ได้ ซึ่งตั้งใจ เพราะยังไม่มีหน้ารองรับ
   สำเร็จ → /onboarding (ตั้งชื่อบัญชี) · ไม่สำเร็จ → หน้าเข้าสู่ระบบ โดยไม่บอกเหตุผล */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const tokenHash = url.searchParams.get("token_hash") ?? "";
  const code = url.searchParams.get("code") ?? "";
  const sb = await supabaseServer();
  /* ผลตัดสินมาจาก Supabase เท่านั้น — ค่าใน URL เป็นแค่ token ที่ส่งต่อไปตรวจ
     ไม่มีเงื่อนไขจากค่าใน URL: ลองแบบ token_hash ก่อน ไม่ผ่านจึงลอง code (ค่าว่าง = Supabase ปฏิเสธเอง) */
  const viaOtp = await sb.auth.verifyOtp({ type: "email", token_hash: tokenHash });
  const res = viaOtp.error ? await sb.auth.exchangeCodeForSession(code) : viaOtp;
  const ok = !res.error && Boolean(res.data.session);
  return NextResponse.redirect(new URL(ok ? "/onboarding" : "/login", url));
}
