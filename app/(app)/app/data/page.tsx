import Link from "next/link";
import { viewer } from "@/app/(app)/viewer";
import { leftCompanyAction, reaffirmAffiliationAction } from "@/app/(app)/account-actions";
import { dataHealth } from "@/lib/engine/data-health";
import { bangkokDay } from "@/lib/shared/format";
import { ActionForm } from "@/components/console/action-form";
import { PageHead, Panel, num } from "@/components/console/ui";

export const metadata = { title: "สุขภาพข้อมูล" };
export const dynamic = "force-dynamic";

/* ── สุขภาพข้อมูล (docs/crm-plan.md D1) ── รายการสิ่งที่ต้องแก้ ไม่ใช่คะแนน
   ความเสี่ยงต่องานขายขึ้นก่อน · สังกัดเก่าแก้ได้ในหน้านี้เลย (ยังอยู่ / ออกแล้ว) · ข้ออื่นพาไปหน้าที่แก้ */

export default async function DataHealthPage() {
  const v = await viewer();
  const checks = await dataHealth(v.tenantId, { id: v.actor, clearance: v.clearance });
  const open = checks.filter((c) => c.count > 0);
  const today = bangkokDay();

  return (
    <>
      <PageHead label="ข้อมูล" title="สุขภาพข้อมูล"
        lead="สิ่งที่ทำให้ข้อมูลใช้ขายไม่ได้ เรียงจากเสี่ยงที่สุด — กดชื่อเพื่อไปแก้"
        more="นับเฉพาะข้อมูลที่คุณเห็นได้"
        actions={<Link href="/app/data/update" className="c-btn c-btn-ghost">อัปเดตบริษัทจากไฟล์</Link>} />
      <Panel flat className="mb-5 flex flex-wrap gap-x-8 gap-y-3 p-5">
        {checks.map((c) => (
          <a key={c.key} href={`#${c.key}`} className="c-thai min-w-0 text-[0.84rem] hover:text-[var(--c-accent)]">
            <span className={`c-mono block text-[1.2rem] ${c.count ? (c.severity === "risk" ? "text-[var(--c-warn)]" : "text-[var(--c-text)]") : "text-[var(--c-good)]"}`}>{num(c.count)}</span>
            <span className="text-[var(--c-text-3)]">{c.title}</span>
          </a>
        ))}
      </Panel>
      {!open.length && <Panel className="p-5"><p className="c-thai text-[0.9rem] text-[var(--c-good)]">ไม่มีอะไรต้องแก้ตอนนี้</p></Panel>}
      <div className="grid gap-5">
        {open.map((c) => (
          <Panel key={c.key} className="scroll-mt-28 p-5" >
            <div id={c.key} className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="c-h2 text-[var(--c-text)]">
                {c.severity === "risk" && <span className="c-pill c-pill-warn mr-2 align-middle">เสี่ยง</span>}
                {c.title} <span className="text-[var(--c-text-4)]">({num(c.count)})</span>
              </h2>
              {c.action && <Link href={c.action.href} className="c-thai text-[0.82rem] text-[var(--c-accent)] hover:underline">{c.action.label} →</Link>}
            </div>
            <p className="c-thai mt-1 text-[0.84rem] text-[var(--c-text-3)]">{c.why}</p>
            {c.items.length > 0 && (
              <ul className="mt-3 divide-y divide-[var(--c-line)]">
                {c.items.map((it) => (
                  <li key={`${it.id}-${it.affiliationId ?? ""}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <span className="c-thai min-w-0">
                      <Link href={it.href} className="text-[var(--c-accent)] hover:underline">{it.name}</Link>
                      {it.detail && <span className="block text-[0.78rem] text-[var(--c-text-3)]">{it.detail}</span>}
                    </span>
                    {it.affiliationId && (
                      <span className="flex flex-wrap gap-2">
                        <ActionForm action={reaffirmAffiliationAction} fields={{ affiliationId: it.affiliationId }} label="ยังอยู่" pendingLabel="…" size="sm" />
                        <ActionForm action={leftCompanyAction} fields={{ affiliationId: it.affiliationId, endedOn: today, reason: "ตรวจจากหน้าสุขภาพข้อมูล — ไม่อยู่แล้ว" }}
                          label="ออกแล้ว" pendingLabel="…" size="sm" variant="ghost" confirm="กดอีกครั้ง — บันทึกว่าออกวันนี้" />
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {c.count > c.items.length && c.items.length > 0 && (
              <p className="c-thai mt-2 text-[0.78rem] text-[var(--c-text-4)]">แสดง {num(c.items.length)} จาก {num(c.count)} — แก้ชุดนี้แล้วรายการถัดไปจะขึ้นมาเอง</p>
            )}
          </Panel>
        ))}
      </div>
    </>
  );
}
