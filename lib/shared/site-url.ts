/* ── ที่อยู่จริงของเว็บ ─────────────────────────────────────────

   parallax.co.th ถูกเขียนตายไว้ใน metadataBase · sitemap · robots
   ตั้งแต่ก่อนมีโดเมนจริง ตอนนี้โดเมนนั้นยังไม่ตอบสนอง (curl ได้ 000)
   ส่วนของจริงอยู่บน Vercel ผลคือ canonical กับ OG image ชี้ไปที่ที่
   ไม่มีอะไรอยู่ — แชร์ลิงก์แล้วรูปพรีวิวไม่ขึ้น และ Google เก็บ
   canonical ที่โหลดไม่ได้

   ลำดับการเลือก:
     NEXT_PUBLIC_SITE_URL   ตั้งเองเมื่อโดเมนพร้อมใช้
     VERCEL_PROJECT_PRODUCTION_URL  ที่อยู่ production ของโปรเจกต์
     localhost              ตอนพัฒนา

   พอโดเมนพร้อม ตั้งตัวแปรเดียวแล้วทุกที่ถูกพร้อมกัน ไม่ต้องไล่แก้โค้ด */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;

  return "http://localhost:3040";
}
