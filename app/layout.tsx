import type { Metadata, Viewport } from "next";
import { siteUrl } from "@/lib/shared/site-url";
import { IBM_Plex_Sans_Thai, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { OrganizationLd } from "@/components/json-ld";

const plexThai = IBM_Plex_Sans_Thai({
  variable: "--font-plex-thai",
  subsets: ["thai", "latin"],
  /* ── สามน้ำหนัก ไม่ใช่หก ────────────────────────────────────

     ไล่ทุกทางที่โค้ดสั่งน้ำหนักฟอนต์ได้ — คลาส font-*, font-weight ใน CSS,
     และ style ใน JSX — เจอที่ใช้จริงแค่ 300 (t-numeral · font-light),
     400 (body) และ 500 (t-label · font-medium 21 จุด)

     น้ำหนัก 600 ที่เห็นในโค้ดอยู่ใน app/opengraph-image.tsx ซึ่งตั้งใจ
     ไม่ส่งไฟล์ฟอนต์เข้า OG renderer อยู่แล้ว จึงไม่ต้องการมันจาก webfont
     ส่วน 200 กับ 700 ไม่มีใครเรียกเลย

     แต่ละน้ำหนักคูณสองชุดอักขระ (thai + latin) = ไฟล์ woff2 คนละไฟล์
     หกน้ำหนักจึงเป็นสิบสองไฟล์ต่อการโหลดหนึ่งครั้ง */
  weight: ["300", "400", "500"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: "PARALLAX — We measure cost per returning customer",
    template: "%s · PARALLAX",
  },
  description:
    "Everyone measures cost per lead. We measure cost per returning customer — an agentic revenue OS that finds new customers and earns from existing ones, each side training the other.",
  keywords: [
    "CRM",
    "lead generation",
    "agentic",
    "marketing",
    "customer retention",
    "POS",
    "LINE OA",
    "PDPA",
    "Thai SME",
  ],
  openGraph: {
    type: "website",
    locale: "th_TH",
    siteName: "PARALLAX",
    title: "PARALLAX — We measure cost per returning customer",
    description:
      "Everyone measures cost per lead. We measure cost per returning customer.",
  },
  twitter: {
    card: "summary_large_image",
    title: "PARALLAX",
    description:
      "Everyone measures cost per lead. We measure cost per returning customer.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="th"
      className={`${plexThai.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <OrganizationLd />
        {children}
      </body>
    </html>
  );
}
