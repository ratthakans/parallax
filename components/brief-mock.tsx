import { Mark } from "./ui";

type Item = {
  n: string;
  who: string;
  why: string;
  action: string;
  value: string;
  tag: string;
};

const ITEMS: Item[] = [
  {
    n: "01",
    who: "165",
    why: "Repeat window closes in 10 days · avg basket ฿4,200",
    action: "Reactivation offer built from what they already bought",
    value: "฿693,000",
    tag: "repeat-window move",
  },
  {
    n: "02",
    who: "119",
    why: "Top cohort · always full price, never waits for a discount",
    action: "Private preview + advisor follow-up",
    value: "฿786,800",
    tag: "high-value return",
  },
  {
    n: "03",
    who: "98",
    why: "Bought the driver, never bought balls",
    action: "Attach the ball model this cohort buys next",
    value: "฿147,000",
    tag: "churn risk",
  },
];

export function BriefMock({ compact = false }: { compact?: boolean }) {
  return (
    <div className="specimen relative w-full p-1.5 backdrop-blur-md">
      <div className="bg-paper">
        {/* head */}
        <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4 md:px-7">
          <div className="flex items-center gap-2.5 text-ink">
            <Mark className="h-4 w-4" />
            <span className="t-label">morning brief</span>
          </div>
          <span className="t-label text-ink-4">08:12 · 03 moves ready</span>
        </div>

        {/* items */}
        <ul>
          {ITEMS.map((it) => (
            <li
              key={it.n}
              className="group border-b border-line px-5 py-6 transition-colors duration-300 last:border-b-0 hover:bg-white md:px-7"
            >
              <div className="flex items-start justify-between gap-5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="marker-num">{it.n}</span>
                    <span className="t-numeral text-[1.65rem] text-ink">
                      {it.who}
                    </span>
                    <span className="t-small text-ink-4">customers</span>
                    <span className="t-label rounded-full border border-line px-2.5 py-1 text-ink-4">
                      {it.tag}
                    </span>
                  </div>
                  <p className="t-small t-thai mt-2.5 text-ink-3">{it.why}</p>
                  <p className="t-body t-thai pretty mt-3 text-ink">{it.action}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="t-label text-ink-4">expected value</p>
                  <p className="t-numeral mt-2.5 text-[1.35rem] text-signal">
                    {it.value}
                  </p>
                </div>
              </div>

              {!compact && (
                <div className="mt-5 flex flex-wrap items-center gap-2.5">
                  <span className="inline-flex h-8 items-center rounded-full bg-signal px-4 text-[0.78rem] font-medium text-white">
                    Approve
                  </span>
                  <span className="inline-flex h-8 items-center rounded-full border border-line px-4 text-[0.78rem] text-ink-2">
                    Why?
                  </span>
                  <span className="inline-flex h-8 items-center rounded-full border border-line px-4 text-[0.78rem] text-ink-2">
                    Snooze
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>

        {/* foot */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4 md:px-7">
          <span className="t-small text-ink-3">
            Three moves. Ten seconds. Then back to work.
          </span>
          <span className="t-label text-ink-4">
            90-day rolling δ · +7.4% ± 2.1
          </span>
        </div>
      </div>
    </div>
  );
}
