import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/shared/site-url";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      /* /deck คือเด็คระดมทุน — เนื้อหาชุดเดียวกับ /investors ที่ปิดไว้แล้ว
         ลิงก์ใน footer ทำให้กดถึงได้ แต่ไม่ควรโผล่ตอนมีคนค้นชื่อบริษัท

         /brand คือหน้ารวมไฟล์โลโก้ ให้คนที่ต้องการไฟล์กดถึงได้ แต่ไม่ควร
         แข่งกับหน้าจริงในผลค้นหา (ตัวหน้าเองก็ตั้ง noindex ไว้ด้วย) */
      disallow: ["/api/", "/app", "/console", "/investors", "/deck", "/brand"],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
