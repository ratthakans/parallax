import type { NextConfig } from "next";

/* ── ส่วนหัวความปลอดภัย ────────────────────────────────────────

   ตรวจ production แล้วมีแค่ HSTS ซึ่ง Vercel ใส่ให้เอง สี่ตัวข้างล่างนี้
   ไม่มีเลย ทั้งที่ราคาถูกและกันของที่เกิดจริงได้:

     nosniff        กัน browser เดาชนิดไฟล์เอง — สำคัญขึ้นมากเมื่อ
                    ระบบนำเข้าไฟล์จากผู้ใช้ (หน้า Import รับ CSV)
     Referrer       ตอนนี้ URL ของคอนโซลรั่วไปกับ referrer ทุกครั้งที่มี
                    ใครคลิกลิงก์ออกนอกเว็บ
     X-Frame        กัน clickjacking — คอนโซลมีปุ่มที่กดแล้วส่งข้อความจริง
     Permissions    ปิดกล้อง ไมค์ ตำแหน่ง ที่เว็บนี้ไม่เคยใช้

   CSP เต็ม (nonce) อยู่ที่ proxy.ts สำหรับคอนโซลและหน้าเข้าสู่ระบบ ซึ่ง render ตอนขอ
   เว็บการตลาดเป็นหน้าคงที่ ใส่ nonce ไม่ได้ จึงได้ชุดพื้นฐานที่ไม่ต้องรู้จักสคริปต์:
   ห้ามฝัง plugin · ห้ามเปลี่ยน <base> · ฟอร์มส่งได้แค่โดเมนตัวเอง · ห้ามถูกฝังใน iframe ของคนอื่น */
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

/* หน้าคอนโซลได้ CSP เต็มจาก proxy.ts แทน — ไม่ส่งชุดนี้ซ้อนไป (สอง CSP = เบราว์เซอร์บังคับทั้งคู่) */
const SITE_CSP = { key: "Content-Security-Policy", value: "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'" };

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // หน้านำเข้าข้อมูลส่งเนื้อไฟล์ CSV เข้า Server Action โดยตรง
      // ค่าเริ่มต้น 1MB น้อยเกินไปสำหรับ export จาก POS ที่มีหลายหมื่นบรรทัด
      bodySizeLimit: "6mb",
    },
  },
  /* ── /deck ให้เป็น URL ที่พิมพ์ได้ ────────────────────────────
     ไฟล์อยู่ที่ public/deck/index.html ซึ่ง Next เสิร์ฟที่ /deck/index.html
     เท่านั้น — ไม่มีการเติม index ให้อัตโนมัติเหมือนเว็บเซิร์ฟเวอร์ทั่วไป
     rewrite ทำให้ /deck ใช้ได้ โดยที่ URL บนแถบยังเป็น /deck (ต่างจาก
     redirect ที่จะเปลี่ยนแถบไปเป็น /deck/index.html ให้คนเห็น) */
  async rewrites() {
    return [{ source: "/deck", destination: "/deck/index.html" }];
  },

  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      { source: "/((?!app|login).*)", headers: [SITE_CSP] },
    ];
  },
};

export default nextConfig;
