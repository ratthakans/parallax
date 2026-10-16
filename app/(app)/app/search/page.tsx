import Link from "next/link";
import { viewer } from "@/app/(app)/viewer";
import { searchEverything } from "@/lib/engine/search";
import { PageHead, Panel } from "@/components/console/ui";
import { stageTh } from "@/lib/shared/deals";

export const dynamic = "force-dynamic";

/* ── ผลค้นหารวม (docs/ux-plan.md U1) ── ช่องค้นหาอยู่ที่แถบบนทุกหน้า */

const STATUS_TH: Record<string, string> = { draft: "ร่าง", active: "กำลังทำ", closed: "ปิดแล้ว" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const v = await viewer();
  const q = ((await searchParams).q ?? "").trim();
  const r = await searchEverything(v.tenantId, q, { id: v.actor, clearance: v.clearance });
  const total = r.orgs.length + r.people.length + r.deals.length + r.campaigns.length;

  return (
    <>
      <PageHead label="ค้นหา" title={q ? `ผลการค้นหา “${q}”` : "ค้นหา"} />
      {q.length < 2 ? (
        <p className="c-thai text-[0.9rem] text-[var(--c-text-3)]">พิมพ์อย่างน้อย 2 ตัวอักษรในช่องค้นหาด้านบน</p>
      ) : total === 0 ? (
        <p className="c-thai text-[0.9rem] text-[var(--c-text-3)]">
          ไม่พบ — ชื่อค้นได้บางส่วน แต่อีเมลและเบอร์ต้องพิมพ์ครบ เพราะเก็บแบบเข้ารหัส
        </p>
      ) : (
        <div className="grid gap-5">
          {r.orgs.length > 0 && (
            <Panel className="p-5">
              <h2 className="c-h2 text-[var(--c-text)]">บริษัท <span className="text-[var(--c-text-4)]">({r.orgs.length})</span></h2>
              <ul className="mt-2 divide-y divide-[var(--c-line)]">
                {r.orgs.map((o) => (
                  <li key={o.id} className="flex items-baseline justify-between gap-3 py-2.5">
                    <Link href={`/app/accounts/${o.id}`} className="text-[var(--c-accent)] hover:underline">{o.name}</Link>
                    <span className="c-thai text-[0.8rem] text-[var(--c-text-4)]">{o.domain ?? ""} · คนปัจจุบัน {o.people}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          {r.people.length > 0 && (
            <Panel className="p-5">
              <h2 className="c-h2 text-[var(--c-text)]">ผู้ติดต่อ <span className="text-[var(--c-text-4)]">({r.people.length})</span></h2>
              <ul className="mt-2 divide-y divide-[var(--c-line)]">
                {r.people.map((p) => (
                  <li key={p.id} className="flex items-baseline justify-between gap-3 py-2.5">
                    {p.visible
                      ? <Link href={`/app/customers/${p.id}`} className="text-[var(--c-accent)] hover:underline">{p.name}</Link>
                      : <span className="text-[var(--c-text-3)]">{p.name}</span>}
                    <span className="c-thai text-[0.8rem] text-[var(--c-text-4)]">{[p.title, p.org].filter(Boolean).join(" · ")}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          {r.deals.length > 0 && (
            <Panel className="p-5">
              <h2 className="c-h2 text-[var(--c-text)]">ดีล <span className="text-[var(--c-text-4)]">({r.deals.length})</span></h2>
              <ul className="mt-2 divide-y divide-[var(--c-line)]">
                {r.deals.map((d) => (
                  <li key={d.id} className="flex items-baseline justify-between gap-3 py-2.5">
                    <Link href={`/app/deals/${d.id}`} className="text-[var(--c-accent)] hover:underline">{d.name}</Link>
                    <span className="c-thai text-[0.8rem] text-[var(--c-text-4)]">{d.org} · {stageTh(d.stage)}{d.value != null ? ` · ฿${d.value.toLocaleString("th-TH")}` : ""}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          {r.campaigns.length > 0 && (
            <Panel className="p-5">
              <h2 className="c-h2 text-[var(--c-text)]">แคมเปญ <span className="text-[var(--c-text-4)]">({r.campaigns.length})</span></h2>
              <ul className="mt-2 divide-y divide-[var(--c-line)]">
                {r.campaigns.map((c) => (
                  <li key={c.id} className="flex items-baseline justify-between gap-3 py-2.5">
                    <Link href={`/app/sales/${c.id}`} className="text-[var(--c-accent)] hover:underline">{c.name}</Link>
                    <span className="c-pill">{STATUS_TH[c.status] ?? c.status}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      )}
    </>
  );
}
