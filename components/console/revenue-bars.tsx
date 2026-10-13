import { baht } from "@/lib/shared/format";

/* ── ยอดซื้อรายเดือน — แท่งเดียวต่อเดือน สีเดียว ───────────────────

   ชุดข้อมูลเดียว จึงไม่มีกล่องคำอธิบายสี (หัวข้อบอกแล้วว่าคืออะไร) และใช้สีเน้น
   ของคอนโซลสีเดียว แท่งบาง ปลายมน 4px ติดฐาน ช่องว่างระหว่างแท่ง 2px
   ป้ายตัวเลขเฉพาะเดือนล่าสุดกับเดือนสูงสุด ไม่ใส่ทุกแท่ง
   ชี้ที่แท่งเพื่อดูยอดของเดือนนั้น และมีตารางให้อ่านแทนกราฟได้ */

const TH_MONTH = new Intl.DateTimeFormat("th-TH", { month: "short", timeZone: "UTC" });
const TH_MONTH_YEAR = new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric", timeZone: "UTC" });
const monthDate = (m: string) => new Date(`${m}-01T00:00:00Z`);

export function RevenueBars({ data, title }: { data: { month: string; revenue: number }[]; title: string }) {
  const W = 720, H = 200, padTop = 26, padBottom = 26, gap = 2;
  const max = Math.max(1, ...data.map((d) => d.revenue));
  const slot = W / Math.max(1, data.length);
  const bw = Math.max(6, Math.min(34, slot - gap * 2 - 14));
  const plotH = H - padTop - padBottom;
  const peak = data.reduce((a, d, i) => (d.revenue > data[a].revenue ? i : a), 0);
  const last = data.length - 1;

  return (
    <figure className="m-0">
      <figcaption className="c-h2 text-[var(--c-text)]">{title}</figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-4 block h-auto w-full"
        role="img"
        aria-label={`${title}: ${data.map((d) => `${TH_MONTH_YEAR.format(monthDate(d.month))} ${baht(d.revenue)}`).join(", ")}`}
      >
        {/* เส้นฐานอย่างเดียว ไม่มีเส้นกริด — ตัวเลขที่สำคัญมีป้ายอยู่แล้ว */}
        <line x1={0} x2={W} y1={H - padBottom} y2={H - padBottom} stroke="var(--c-line)" strokeWidth={1} />
        {data.map((d, i) => {
          const h = d.revenue > 0 ? Math.max(3, (d.revenue / max) * plotH) : 0;
          const x = i * slot + (slot - bw) / 2;
          const y = H - padBottom - h;
          const showValue = (i === last || i === peak) && d.revenue > 0;
          return (
            <g key={d.month} className="group">
              {/* พื้นที่ชี้กว้างกว่าแท่ง — ชี้โดนง่ายแม้แท่งเตี้ย */}
              <rect x={i * slot} y={padTop - 20} width={slot} height={plotH + 20} fill="transparent">
                <title>{`${TH_MONTH_YEAR.format(monthDate(d.month))} · ${baht(d.revenue)}`}</title>
              </rect>
              {h > 0 && (
                <path
                  d={`M${x},${H - padBottom} V${y + 4} a4,4 0 0 1 4,-4 h${bw - 8} a4,4 0 0 1 4,4 V${H - padBottom} Z`}
                  fill="var(--c-accent)"
                  opacity={i === last ? 1 : 0.72}
                  className="pointer-events-none transition-opacity group-hover:opacity-100"
                />
              )}
              {showValue && (
                <text x={x + bw / 2} y={y - 7} textAnchor="middle" fontSize={11} fill="var(--c-text-2)">
                  {baht(d.revenue)}
                </text>
              )}
              <text x={x + bw / 2} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--c-text-4)">
                {TH_MONTH.format(monthDate(d.month))}
              </text>
            </g>
          );
        })}
      </svg>
      {/* เดือนล่าสุดยังไม่จบ — แท่งสุดท้ายเตี้ยกว่าโดยธรรมชาติ ไม่ใช่ยอดตก */}
      {data.length > 0 && data[last].month === new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 7) && (
        <p className="c-thai mt-2 text-[0.78rem] text-[var(--c-text-4)]">
          {TH_MONTH_YEAR.format(monthDate(data[last].month))} นับถึงวันนี้ ยังไม่ครบเดือน
        </p>
      )}
      <details className="mt-3">
        <summary className="c-thai cursor-pointer text-[0.8rem] text-[var(--c-text-3)]">ดูเป็นตาราง</summary>
        <table className="c-table mt-3 max-w-md">
          <thead>
            <tr>
              <th>เดือน</th>
              <th className="text-right">ยอดซื้อ</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.month}>
                <td className="c-thai">{TH_MONTH_YEAR.format(monthDate(d.month))}</td>
                <td className="c-mono text-right">{baht(d.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
