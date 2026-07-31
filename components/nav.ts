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

export const NAV: NavItem[] = [
  {
    title: "Platform",
    children: [
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
  { title: "Product", href: "/product" },
  {
    title: "Customers",
    children: [
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
      { href: "/contact", title: "Contact", desc: "Start a pilot or talk partnership" },
    ],
  },
];
