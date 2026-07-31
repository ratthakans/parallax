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

   ยังไม่ใส่ CSP เต็ม เพราะต้องไล่ inline style ของ Next กับฟอนต์ให้ครบ
   ก่อน ไม่งั้นจะได้ CSP ที่ปิดหน้าเว็บตัวเอง — เป็นงานแยกที่ต้องวัดจริง */
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // หน้านำเข้าข้อมูลส่งเนื้อไฟล์ CSV เข้า Server Action โดยตรง
      // ค่าเริ่มต้น 1MB น้อยเกินไปสำหรับ export จาก POS ที่มีหลายหมื่นบรรทัด
      bodySizeLimit: "6mb",
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
