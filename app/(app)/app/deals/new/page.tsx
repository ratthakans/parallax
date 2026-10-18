import Link from "next/link";
import { viewer } from "@/app/(app)/viewer";
import { createDealAction } from "@/app/(app)/deal-actions";
import { listAccounts } from "@/lib/engine/accounts";
import { DEAL_STAGE_TH, OPEN_STAGES } from "@/lib/shared/deals";
import { ActionForm } from "@/components/console/action-form";
import { PageHead, Panel } from "@/components/console/ui";
import { OrgPicker } from "@/components/console/org-picker";

export const metadata = { title: "สร้างดีล" };
export const dynamic = "force-dynamic";

/* ── สร้างดีล (docs/ux-plan.md U4 · 5.4) ── ช่องบังคับสองช่อง (บริษัท · ชื่อ) ที่เหลือเติมทีหลังในหน้าดีล */

const LABEL = "c-thai flex min-w-0 flex-col gap-1 text-[0.8rem] text-[var(--c-text-3)]";

export default async function NewDealPage({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  const { org } = await searchParams;
  const v = await viewer();
  const { rows } = await listAccounts(v.tenantId, { sort: "name", limit: 1000, viewer: { id: v.actor, clearance: v.clearance } });

  const pre = rows.find((r) => r.id === org);

  return (
    <>
      <Link href="/app/deals" className="c-thai text-[0.8rem] text-[var(--c-text-3)] hover:text-[var(--c-accent)]">← ดีลทั้งหมด</Link>
      <PageHead label="ดีล" title="สร้างดีล" />
      <Panel className="max-w-2xl p-5 md:p-6">
        <ActionForm action={createDealAction} label="สร้างดีล" pendingLabel="กำลังสร้าง…" variant="primary" className="grid gap-4 sm:grid-cols-2">
          <label className={`${LABEL} sm:col-span-2`}>บริษัท *
            <OrgPicker id="deal-org" name="orgName" names={rows.map((r) => r.name)} defaultValue={pre?.name} required />
            {pre && <><input type="hidden" name="prefillOrgId" value={pre.id} /><input type="hidden" name="prefillOrgName" value={pre.name} /></>}
          </label>
          <label className={`${LABEL} sm:col-span-2`}>ชื่อดีล *
            <input name="name" className="c-input" maxLength={160} placeholder="เช่น สปอนเซอร์ Gold งาน 2027" required />
          </label>
          <label className={LABEL}>มูลค่า (บาท)
            <input name="value" inputMode="numeric" className="c-input" placeholder="เช่น 250000" />
          </label>
          <label className={LABEL}>ปิดคาด
            <input type="date" name="expectedClose" className="c-input" />
          </label>
          <label className={LABEL}>ขั้น
            <select name="stage" className="c-select" defaultValue="open">
              {OPEN_STAGES.map((s) => <option key={s} value={s}>{DEAL_STAGE_TH[s]}</option>)}
            </select>
          </label>
        </ActionForm>
      </Panel>
    </>
  );
}
