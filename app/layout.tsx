import type { Metadata, Viewport } from "next";
import { siteUrl } from "@/lib/shared/site-url";
import { Anuphan, IBM_Plex_Mono, Inter } from "next/font/google";
import "./globals.css";
import { OrganizationLd } from "@/components/json-ld";

/* ── Inter (ละติน · ตัวเลข) + Anuphan (ไทย) — แผน H §3.4 ──

   Inter ไม่มีอักษรไทย เบราว์เซอร์จึงใช้ Inter กับอักษรละตินแล้วตกไปใช้
   Anuphan กับอักษรไทยเองทีละตัว — ทรงเรขาคณิตไม่มีหัวของ Anuphan
   เข้ากับ Inter กว่า Plex Thai ที่มีหางแบบตัวพิมพ์

   ทั้งคู่เป็น variable font ไฟล์เดียวต่อชุดอักขระ ไม่ต้องเลือกน้ำหนัก */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const anuphan = Anuphan({
  variable: "--font-anuphan",
  subsets: ["thai", "latin"],
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
    default: "Parallax — เปลี่ยนข้อมูลลูกค้าเดิมให้เป็นยอดขายครั้งถัดไป",
    template: "%s · Parallax",
  },
  description:
    "ทุกเช้า Parallax สรุปสามงานที่ควรทำ พร้อมกลุ่มลูกค้า ข้อความ และวิธีวัดรายได้ส่วนเพิ่มจากลูกค้าที่กลับมาซื้อจริง",
  keywords: [
    "CRM",
    "lead generation",
    "agentic",
    "marketing",
    "รักษาลูกค้าเดิม",
    "POS",
    "LINE OA",
    "PDPA",
    "ธุรกิจไทย",
  ],
  openGraph: {
    type: "website",
    locale: "th_TH",
    siteName: "Parallax",
    title: "Parallax — เปลี่ยนข้อมูลลูกค้าเดิมให้เป็นยอดขายครั้งถัดไป",
    description:
      "ทุกเช้าได้สามงานที่ควรทำ พร้อมกลุ่มลูกค้า ข้อความ และวิธีวัดว่าคุ้มจริงไหม",
  },
  twitter: {
    card: "summary_large_image",
    title: "Parallax",
    description:
      "ทุกเช้าได้สามงานที่ควรทำ พร้อมกลุ่มลูกค้า ข้อความ และวิธีวัดว่าคุ้มจริงไหม",
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
      data-scroll-behavior="smooth"
      className={`${inter.variable} ${anuphan.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <OrganizationLd />
        {children}
      </body>
    </html>
  );
}
