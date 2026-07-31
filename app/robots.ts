import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/shared/site-url";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/app", "/console", "/investors"],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
