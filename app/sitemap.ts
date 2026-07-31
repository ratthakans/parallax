import type { MetadataRoute } from "next";

const BASE = "https://parallax.co.th";

const ROUTES: { path: string; priority: number }[] = [
  { path: "/", priority: 1 },
  { path: "/problem", priority: 0.8 },
  { path: "/platform", priority: 0.9 },
  { path: "/platform/keep", priority: 0.8 },
  { path: "/platform/reach", priority: 0.8 },
  { path: "/platform/proof", priority: 0.8 },
  { path: "/platform/learning", priority: 0.8 },
  { path: "/product", priority: 0.9 },
  { path: "/customers", priority: 0.8 },
  { path: "/playbook", priority: 0.8 },
  { path: "/pricing", priority: 0.9 },
  { path: "/company", priority: 0.7 },
  { path: "/investors", priority: 0.7 },
  { path: "/trust", priority: 0.6 },
  { path: "/contact", priority: 0.7 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return ROUTES.map((r) => ({
    url: `${BASE}${r.path}`,
    lastModified,
    changeFrequency: "monthly",
    priority: r.priority,
  }));
}
