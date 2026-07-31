import { siteUrl } from "@/lib/shared/site-url";

/* ── ข้อมูลโครงสร้างสำหรับเครื่องอ่าน ────────────────────────────

   ทั้งเว็บมี JSON-LD ศูนย์บล็อก ซึ่งแปลว่า Google กับตัวสรุปด้วย AI
   ต้องเดาเอาเองว่าองค์กรนี้ชื่ออะไร ทำอะไร ราคาเท่าไร จากตัวหนังสือล้วน

   สำคัญเป็นพิเศษกับบริษัทที่ยังไม่มีใครรู้จัก — ยิ่งไม่มีสัญญาณจากที่อื่น
   สิ่งที่เว็บบอกเกี่ยวกับตัวเองยิ่งมีน้ำหนัก

   .replace(/</g, "\\u003c") ตามที่คู่มือ Next ระบุ: JSON.stringify
   ไม่ได้ล้างสตริงที่ใช้ฉีด XSS ให้ ต้องแทนอักขระ < เอง */

function Ld({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}

/** องค์กร + เว็บไซต์ — วางในเลย์เอาต์ราก จึงอยู่ทุกหน้า */
export function OrganizationLd() {
  const url = siteUrl();
  return (
    <>
      <Ld
        data={{
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "PARALLAX",
          url,
          description:
            "Everyone measures cost per lead. We measure cost per returning customer — an agentic revenue OS for businesses with a repeat purchase cycle.",
          logo: `${url}/icon.svg`,
          areaServed: "TH",
        }}
      />
      <Ld
        data={{
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "PARALLAX",
          url,
        }}
      />
    </>
  );
}

/* ── ราคา ────────────────────────────────────────────────────
   ดึงจาก lib/shared/plans.ts ซึ่งเป็นแหล่งเดียวที่หน้า /pricing กับ
   /app/billing อ่านตรงกัน — ถ้าราคาเปลี่ยน structured data เปลี่ยนตาม
   ไม่ต้องมีใครจำว่าต้องมาแก้ที่นี่ด้วย */
export function PricingLd({
  offers,
}: {
  offers: { name: string; monthlyBaht: number | null; from?: boolean }[];
}) {
  const url = siteUrl();
  return (
    <Ld
      data={{
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: "PARALLAX",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        url: `${url}/pricing`,
        /* ── ราคาที่นี่ต้องไม่พูดเกินกว่าที่หน้าเว็บพูด ──

           ชั้น Chain เขียนบนหน้าว่า "฿15,000 and up" การใส่ price: 15000
           เฉย ๆ คือการประกาศราคาตายตัวที่เว็บไม่ได้ประกาศ — ใช้ minPrice
           แทน เพื่อให้ structured data ตรงกับข้อความที่คนอ่านเห็น */
        offers: offers.map((o) => {
          if (o.monthlyBaht == null) {
            return { "@type": "Offer", name: o.name, priceCurrency: "THB" };
          }
          const spec = o.from
            ? {
                "@type": "UnitPriceSpecification",
                minPrice: o.monthlyBaht,
                priceCurrency: "THB",
                unitText: "MONTH",
              }
            : {
                "@type": "UnitPriceSpecification",
                price: o.monthlyBaht,
                priceCurrency: "THB",
                unitText: "MONTH",
              };
          return {
            "@type": "Offer",
            name: o.name,
            priceCurrency: "THB",
            ...(o.from ? {} : { price: o.monthlyBaht }),
            priceSpecification: spec,
          };
        }),
      }}
    />
  );
}
