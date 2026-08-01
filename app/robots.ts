import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/shared/site-url";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      /* /deck คือเด็คระดมทุน — เนื้อหาชุดเดียวกับ /investors ที่ปิดไว้แล้ว
         ลิงก์ใน footer ทำให้กดถึงได้ แต่ไม่ควรโผล่ตอนมีคนค้นชื่อบริษัท */
      disallow: ["/api/", "/app", "/console", "/investors", "/deck"],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
