import Link from "next/link";
import { viewer } from "@/app/(app)/viewer";
import { acknowledgeAction, snoozeAction } from "@/app/(app)/today-actions";
import { todayQueue } from "@/lib/engine/today";
import { MAX_SNOOZES, QUEUE_SECTION_TH, type QueueItem, type QueueSection } from "@/lib/shared/today";
import type { Eligibility } from "@/lib/shared/vault";
import { num } from "@/lib/shared/format";
import { ActionForm } from "@/components/console/action-form";
import { EligibilityPill } from "@/components/console/eligibility";
import { PageHead, Panel } from "@/components/console/ui";

export const dynamic = "force-dynamic";

/* ── วันนี้ (docs/solo-plan.md S1) ───────────────────────────────

   คนที่ถือหลายบทบาท (BD · ผู้ตรวจข้อมูล · หัวหน้าทีม) เริ่มวันที่นี่ แทนการเปิดห้าหน้าเพื่อรู้ว่าต้องทำอะไร
   ลำดับเป็นหมวดตายตัว ไม่ใช่คะแนน — หัวหมวดบอกเหตุผลที่รายการอยู่ตรงนั้น
   งานติดต่อแสดงสถานะนโยบาย ณ ตอนเปิดหน้า ถ้าไม่ใช่ "ติดต่อได้" ให้ตรวจก่อนติดต่อ */

const MORE_HREF: Partial<Record<QueueSection, string>> = {
  overdue: "/app/sales/weekly",
  review: "/app/vault/review",
  quiet: "/app/accounts",
};

function Item({ it, canWrite }: { it: QueueItem; canWrite: boolean }) {
  const contactBlocked = it.eligibility && it.eligibility.status !== "eligible";
  return (
    <li className="border-t border-[var(--c-line)] py-4 first:border-t-0 first:pt-1">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="c-thai text-[0.92rem] text-[var(--c-text)]">
            {it.href ? <Link href={it.href} className="hover:text-[var(--c-accent)]">{it.title}</Link> : it.title}
          </p>
          <p className="c-thai mt-1 text-[0.8rem] text-[var(--c-text-3)]">{it.detail.join(" · ")}</p>
          {it.eligibility && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <EligibilityPill status={it.eligibility.status as Eligibility} />
              {contactBlocked && (
                <span className="c-thai text-[0.78rem] text-[var(--c-text-3)]">
                  ยังไม่ควรติดต่อ{it.eligibility.reasons.length ? ` — ${it.eligibility.reasons.join(" · ")}` : ""}
                </span>
              )}
            </div>
          )}
        </div>
        {canWrite && (
          <div className="flex flex-wrap gap-2">
            {it.ackable && <ActionForm action={acknowledgeAction} label="รับทราบ" size="sm" fields={{ kind: it.kind, id: it.id }} />}
            {it.snoozable && it.snoozes < MAX_SNOOZES && (
              <>
                <ActionForm action={snoozeAction} label="พรุ่งนี้" size="sm" fields={{ kind: it.kind, id: it.id, days: 1 }} />
                <ActionForm action={snoozeAction} label="อีก 7 วัน" size="sm" fields={{ kind: it.kind, id: it.id, days: 7 }} />
              </>
            )}
            {it.snoozable && it.snoozes >= MAX_SNOOZES && (
              <span className="c-thai self-center text-[0.76rem] text-[var(--c-text-4)]">เลื่อนครบ {MAX_SNOOZES} ครั้งแล้ว — ทำหรือยกเลิก</span>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

export default async function TodayPage() {
  const v = await viewer();
  const q = await todayQueue(v.tenantId, { id: v.actor, clearance: v.clearance });
  const canWrite = v.role !== "viewer";
  const total = q.sections.reduce((n, s) => n + s.items.length + s.more, 0);

  return (
    <>
      <PageHead
        label="งานของฉัน"
        title="วันนี้"
        lead="เรียงตามหมวดที่ตายตัว ไม่ใช่คะแนน: สิ่งที่ต้องหยุดก่อน แล้วงานที่ครบกำหนด เลยกำหนด รอตรวจที่กระทบงาน และบัญชีที่เงียบ — งานติดต่อตรวจนโยบายใหม่ทุกครั้งที่เปิดหน้า"
      />

      {total === 0 && (
        <Panel flat className="mb-6 p-6">
          <p className="c-h2 text-[var(--c-text)]">วันนี้ไม่มีงานค้าง</p>
          <p className="c-thai mt-2 text-[0.86rem] text-[var(--c-text-3)]">ไม่มีอะไรต้องหยุด ไม่มีงานครบกำหนด และไม่มีรอตรวจที่กระทบงาน</p>
        </Panel>
      )}

      <div className="grid gap-6">
        {q.sections.filter((s) => s.items.length || s.more).map((s) => (
          <Panel key={s.section} className="p-5 md:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="c-h2 text-[var(--c-text)]">
                {QUEUE_SECTION_TH[s.section].title} <span className="c-mono text-[var(--c-text-3)]">{num(s.items.length + s.more)}</span>
              </h2>
              <p className="c-thai text-[0.78rem] text-[var(--c-text-4)]">{QUEUE_SECTION_TH[s.section].hint}</p>
            </div>
            <ul className="mt-3">
              {s.items.map((it) => <Item key={`${it.kind}:${it.id}`} it={it} canWrite={canWrite} />)}
            </ul>
            {s.more > 0 && (
              <p className="c-thai mt-2 text-[0.82rem] text-[var(--c-text-3)]">
                และอีก {num(s.more)} รายการ
                {MORE_HREF[s.section] && <> — <Link href={MORE_HREF[s.section]!} className="underline">ดูทั้งหมด</Link></>}
              </p>
            )}
          </Panel>
        ))}
      </div>

      {q.reviewsNotBlocking > 0 && (
        <p className="c-thai mt-6 text-[0.82rem] text-[var(--c-text-3)]">
          รอตรวจอีก {num(q.reviewsNotBlocking)} รายการที่ยังไม่กระทบงาน —{" "}
          <Link href="/app/vault/review" className="underline">เปิดคิวตรวจตัวตน</Link> เมื่อมีเวลา
        </p>
      )}
    </>
  );
}
