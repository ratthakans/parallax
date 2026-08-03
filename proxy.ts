import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/* ── ด่านหน้า ─────────────────────────────────────────────────

   ไฟล์นี้ชื่อ proxy.ts ไม่ใช่ middleware.ts — Next เวอร์ชันนี้เปลี่ยน
   ชื่อไปแล้ว (ดู node_modules/next/dist/docs/01-app/02-guides/authentication.md)

   หน้าที่มีสองอย่างเท่านั้น:

   1. ต่ออายุ session — Server Component เขียนคุกกี้ไม่ได้ ที่นี่เขียนได้
      ถ้าไม่มีขั้นนี้ token จะหมดอายุแล้วผู้ใช้หลุดกลางทาง

   2. เด้งคนที่ยังไม่ล็อกอินออกจาก /app

   ── สิ่งที่ห้ามทำที่นี่ ──

   ห้ามตรวจสิทธิ์จริงหรือแตะฐานข้อมูล เพราะไฟล์นี้วิ่งบนทุกเส้นทาง
   รวมถึงเส้นที่เบราว์เซอร์ prefetch ไว้เงียบ ๆ การตรวจจริงอยู่ที่
   lib/shared/session.ts ซึ่งวิ่งตอนดึงข้อมูลจริงเท่านั้น

   ที่นี่คือการตรวจแบบมองโลกในแง่ดี ไม่ใช่ประตูที่ล็อกได้จริง
   ───────────────────────────────────────────────────────────── */

export default async function proxy(req: NextRequest) {
  let res = NextResponse.next({ request: req });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  /* ยังไม่ตั้งค่า Supabase — ปล่อยผ่านทั้งหมด ไม่ใช่ล็อกทุกคนออก
     เครื่องพัฒนาที่ยังไม่มีคีย์ต้องเปิดคอนโซลได้ตามเดิม */
  if (!url || !key) return res;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll(list) {
        for (const c of list) req.cookies.set(c.name, c.value);
        res = NextResponse.next({ request: req });
        for (const c of list) res.cookies.set(c.name, c.value, c.options);
      },
    },
  });

  /* เรียก getUser() เพื่อให้ไลบรารีต่ออายุ token ให้ ไม่ใช่เพื่อเอาผลไปใช้ */
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = req.nextUrl.pathname;
  const needsAuth = path === "/app" || path.startsWith("/app/");

  if (needsAuth && !user) {
    const to = new URL("/login", req.nextUrl);
    /* จำไว้ว่าเขาจะไปไหน ล็อกอินเสร็จจะได้ไปต่อ ไม่ใช่โยนกลับหน้าแรก */
    to.searchParams.set("next", path);
    return NextResponse.redirect(to);
  }

  if (path === "/login" && user) {
    return NextResponse.redirect(new URL("/app", req.nextUrl));
  }

  return res;
}

export const config = {
  /* ข้ามไฟล์นิ่งและ /deck เพื่อไม่ให้เสียเวลากับคำขอที่ไม่มีทางต้องล็อกอิน */
  matcher: ["/((?!_next/static|_next/image|deck|favicon|.*\\.(?:png|jpg|svg|woff2|xml|txt)$).*)"],
};
