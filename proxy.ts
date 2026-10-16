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

/* ── CSP ของคอนโซล (threat model G5) ──
   nonce ใหม่ทุกคำขอ — Next ใส่ให้สคริปต์และสไตล์ของตัวเองเอง (อ่านจาก header ของคำขอ) · ใช้ได้เฉพาะหน้าที่ render ตอนขอ
   คอนโซลและหน้าเข้าสู่ระบบ render ตอนขออยู่แล้ว · เว็บการตลาดเป็นหน้าคงที่ ใช้ nonce ไม่ได้ (ได้ CSP พื้นฐานจาก next.config.ts)
   style-src-attr 'unsafe-inline': React ใช้ style={{}} เป็น attribute ซึ่ง nonce คุมไม่ได้ — attribute ไม่รันสคริปต์
   img-src data: — QR ของยืนยันสองชั้นเป็น SVG data URL จาก Supabase */
function consoleCsp(nonce: string): string {
  const dev = process.env.NODE_ENV !== "production";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${dev ? " ws:" : ""}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export default async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isConsole = path === "/app" || path.startsWith("/app/") || path === "/login" || path.startsWith("/login/");
  const csp = isConsole ? consoleCsp(Buffer.from(crypto.randomUUID()).toString("base64")) : null;
  /* header ของคำขอที่ส่งต่อให้ Next — สร้างใหม่ทุกครั้งที่คุกกี้เปลี่ยน (ต่ออายุ session) ไม่ให้ CSP หาย */
  const forward = () => {
    const h = new Headers(req.headers);
    if (csp) h.set("content-security-policy", csp);
    return NextResponse.next({ request: { headers: h } });
  };
  const withCsp = (r: NextResponse) => {
    if (csp) r.headers.set("Content-Security-Policy", csp);
    return r;
  };
  let res = forward();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  /* ยังไม่ตั้งค่า Supabase — ปล่อยผ่านทั้งหมด ไม่ใช่ล็อกทุกคนออก
     เครื่องพัฒนาที่ยังไม่มีคีย์ต้องเปิดคอนโซลได้ตามเดิม */
  if (!url || !key) return withCsp(res);

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll(list) {
        for (const c of list) req.cookies.set(c.name, c.value);
        res = forward();
        for (const c of list) res.cookies.set(c.name, c.value, c.options);
      },
    },
  });

  /* เรียก getUser() เพื่อให้ไลบรารีต่ออายุ token ให้ ไม่ใช่เพื่อเอาผลไปใช้ */
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const needsAuth = path === "/app" || path.startsWith("/app/");

  /* ── เด้งไปล็อกอินเฉพาะคนที่ไม่มี session เลย ──

     เดิมเด้งทุกครั้งที่ getUser() ไม่ได้ผู้ใช้ แต่ตอน token ใกล้หมดอายุ เมนูของคอนโซล
     prefetch หลายหน้าพร้อมกัน ทุกคำขอพยายามต่ออายุด้วย refresh token ตัวเดียวกัน
     ตัวที่แพ้ได้ "ไม่มีผู้ใช้" แล้วถูกเด้งไปหน้าล็อกอินทั้งที่ยังล็อกอินอยู่ — เห็นจริง
     ระหว่างทดสอบ: ทุกหน้าในคอนโซลเด้งไปล็อกอินราวสองนาทีแล้วกลับมาเอง

     มีคุกกี้ session แต่ตรวจไม่ผ่าน (แพ้การต่ออายุ · Supabase ตอบช้า) ให้ผ่านไปก่อน
     ด่านจริงคือ activeTenantId (app/(app)/tenant.ts) ซึ่งเด้งไปล็อกอินเองเมื่อไม่มีผู้ใช้ */
  const hasSession = req.cookies.getAll().some((c) => /^sb-.+-auth-token/.test(c.name));
  if (needsAuth && !user && !hasSession) {
    const to = new URL("/login", req.nextUrl);
    /* จำไว้ว่าเขาจะไปไหน ล็อกอินเสร็จจะได้ไปต่อ ไม่ใช่โยนกลับหน้าแรก */
    to.searchParams.set("next", path);
    return NextResponse.redirect(to);
  }

  if (path === "/login" && user) {
    return NextResponse.redirect(new URL("/app", req.nextUrl));
  }

  return withCsp(res);
}

export const config = {
  /* ข้ามไฟล์นิ่งและ /deck เพื่อไม่ให้เสียเวลากับคำขอที่ไม่มีทางต้องล็อกอิน */
  matcher: ["/((?!_next/static|_next/image|deck|favicon|.*\\.(?:png|jpg|svg|woff2|xml|txt)$).*)"],
};
