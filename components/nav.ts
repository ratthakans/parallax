export type NavChild = {
  href: string;
  title: string;
  desc: string;
};

export type NavItem = {
  title: string;
  href?: string;
  children?: NavChild[];
};

/* ── ผังเมนู ────────────────────────────────────────────────────

   เดิม Platform กับ Product เป็นพี่น้องกันในเมนู ทั้งที่ตอบคำถาม
   เดียวกันคนละระดับ ("Five layers…" กับ "The product is one screen…")
   คนเพิ่งเข้ามาจึงต้องเดาว่าควรกดอันไหน และความไม่สมมาตร — Platform
   มีลูกห้าหน้า Product เป็นใบเดี่ยว — อ่านเหมือนหน้าหนึ่งสำคัญกว่า
   ทั้งที่มันซ้อนกัน ตอนนี้ Product เป็นประตูบานแรกของ Platform:
   สิ่งที่คุณได้ใช้ → เครื่องที่อยู่ข้างหลัง

   /problem เคยไม่อยู่ในเมนูและไม่มีหน้าไหนลิงก์ไปหาเลย เข้าได้ทางเดียว
   คือพิมพ์ URL เอง ทั้งที่อยู่ใน sitemap — Google เจอ แต่คนที่ยืนอยู่
   บนเว็บหาไม่เจอ

   Contact ไม่อยู่ในนี้แล้วเพราะเป็นปุ่มบนแถบหัวข้าง ๆ อยู่แล้ว
   ปุ่มเดียวกันสองที่ทำให้เมนูยาวขึ้นโดยไม่มีใครหาเจอง่ายขึ้น

   จำนวนลูกในแต่ละกลุ่มคือ 6 · 3 · 3 ซึ่งลงตัวพอดีกับกริดสามคอลัมน์
   ของ dropdown (ดู site-header.tsx) ถ้าเพิ่มหน้าใหม่ ให้คิดถึงเลขนี้ */
export const NAV: NavItem[] = [
  {
    title: "Platform",
    children: [
      {
        href: "/product",
        title: "What you get",
        desc: "One screen, and the engine that fills it",
      },
      {
        href: "/platform",
        title: "The five layers",
        desc: "From raw export to a proven difference",
      },
      {
        href: "/platform/keep",
        title: "Keep",
        desc: "Decide who returns, and when",
      },
      {
        href: "/platform/reach",
        title: "Reach",
        desc: "Your best customers train the next audience",
      },
      {
        href: "/platform/proof",
        title: "Proof",
        desc: "What would have happened anyway",
      },
      {
        href: "/platform/learning",
        title: "Shared intelligence",
        desc: "Why account 200 starts ahead of account 10",
      },
    ],
  },
  {
    title: "Evidence",
    children: [
      {
        href: "/problem",
        title: "The problem",
        desc: "Three ways a standing business still loses",
      },
      {
        href: "/customers",
        title: "Revenue cycles we take",
        desc: "Replenish · Recall · Expiry · Considered",
      },
      {
        href: "/playbook",
        title: "Validation — MST Golf",
        desc: "One file, 967 next-best actions",
      },
    ],
  },
  { title: "Pricing", href: "/pricing" },
  {
    title: "Company",
    children: [
      { href: "/company", title: "About", desc: "Brand, team and roadmap" },
      { href: "/investors", title: "Investors", desc: "Model, economics and risk" },
      {
        href: "/trust",
        title: "Privacy & governance",
        desc: "PDPA · consent · sending limits",
      },
    ],
  },
];
