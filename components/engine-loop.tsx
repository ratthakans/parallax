import Link from "next/link";

const NODES = [
  {
    href: "/platform/keep",
    name: "Keep",
    role: "Who returns",
    lines: [
      "Cohorts from each customer's own cycle",
      "Offers matched to what already responded",
      "Draft → approve → send",
    ],
  },
  {
    href: "/platform/reach",
    name: "Reach",
    role: "Who we choose",
    lines: [
      "Signature from full-price repeat buyers",
      "Audience synced encrypted, consented only",
      "New leads flow straight back into Keep",
    ],
  },
  {
    href: "/platform/proof",
    name: "Proof",
    role: "The difference",
    lines: [
      "Holdout sized by the cohort, not by ambition",
      "The difference, never the total",
      "90-day rolling average with a confidence interval",
    ],
  },
];

function Arrow({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 8"
      className={`h-2 w-10 shrink-0 text-cyan/40 ${className}`}
      fill="none"
      aria-hidden
    >
      <path d="M0 4h35" stroke="currentColor" strokeWidth="1" strokeDasharray="2 3" />
      <path
        d="M31 1l4 3-4 3"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function EngineLoop() {
  return (
    <div>
      <div className="grid gap-6 lg:grid-cols-[1fr_auto_1fr_auto_1fr] lg:items-stretch lg:gap-4">
        {NODES.map((n, i) => (
          <div key={n.name} className="contents">
            <Link
              href={n.href}
              className="card-dark group flex flex-col justify-between p-7 md:p-8"
            >
              <div>
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="t-h3 font-medium text-frost">{n.name}</h3>
                  <span className="marker-num text-frost/58">
                    0{i + 1}
                  </span>
                </div>
                <p className="t-small t-thai mt-4 text-cyan/70">{n.role}</p>
              </div>
              <ul className="mt-8 flex flex-col gap-3 border-t border-cyan/12 pt-6">
                {n.lines.map((l) => (
                  <li key={l} className="t-small t-thai flex gap-3 text-frost/66">
                    <span
                      className="mt-[0.6em] h-px w-3 shrink-0 bg-cyan/35"
                      aria-hidden
                    />
                    {l}
                  </li>
                ))}
              </ul>
            </Link>
            {i < NODES.length - 1 && (
              <div className="hidden items-center justify-center lg:flex">
                <Arrow />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-center gap-4 border-t border-cyan/12 pt-6">
        <Arrow className="rotate-180" />
        <p className="t-small t-thai text-frost/58">
          Then back to the top — what PROOF measures becomes the rule KEEP
          selects on next cycle, and the signature REACH expands from
        </p>
      </div>
    </div>
  );
}
