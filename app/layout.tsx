import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Thai, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const plexThai = IBM_Plex_Sans_Thai({
  variable: "--font-plex-thai",
  subsets: ["thai", "latin"],
  weight: ["200", "300", "400", "500", "600", "700"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://parallax.co.th"),
  title: {
    default: "PARALLAX — Agentic Lead Generation & CRM Platform",
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
    title: "PARALLAX — Agentic Lead Generation & CRM Platform",
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
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
