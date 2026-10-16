import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/shared/supabase";

/* ── ลิงก์ยืนยันอีเมลหลังสมัคร (S9) ──
   รับได้สองรูปแบบที่ Supabase ส่งมา: token_hash + type (แม่แบบอีเมลแบบ server-side) หรือ code (PKCE)
   ยอมรับเฉพาะ type ของการสมัคร/ยืนยันอีเมล — ลิงก์ชนิดอื่น (รีเซ็ตรหัสผ่าน · เปลี่ยนอีเมล) ยังไม่มีหน้ารองรับ
   สำเร็จ → /onboarding (ตั้งชื่อบัญชี) · ไม่สำเร็จ → หน้าเข้าสู่ระบบ โดยไม่บอกเหตุผล */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const code = url.searchParams.get("code");
  const sb = await supabaseServer();
  let ok = false;
  if (tokenHash && (type === "signup" || type === "email")) {
    ok = !(await sb.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  } else if (code) {
    ok = !(await sb.auth.exchangeCodeForSession(code)).error;
  }
  return NextResponse.redirect(new URL(ok ? "/onboarding" : "/login", url));
}
