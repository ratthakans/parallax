import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/app", "/console"],
    },
    sitemap: "https://parallax.co.th/sitemap.xml",
  };
}
