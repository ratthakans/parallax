import Link from "next/link";
import { viewer } from "@/app/(app)/viewer";
import { setStageRuleAction } from "@/app/(app)/field-actions";
import { REQUIREMENTS, REQUIREMENT_TH, stageRules } from "@/lib/engine/stage-rules";
import { DEAL_STAGE_TH, type DealStage } from "@/lib/shared/deals";
import { can } from "@/lib/shared/roles";
import { ActionForm } from "@/components/console/action-form";
import { PageHead, Panel } from "@/components/console/ui";

export const metadata = { title: "กฎขั้นของดีล" };
export const dynamic = "force-dynamic";

/* ── กฎขั้นของดีล (docs/crm-plan.md D4) ── ดีลต้องมีอะไรก่อนเข้าขั้นไหน · ตรวจทุกครั้งที่ย้ายขั้นด้วยมือ (Path · ลาก · หลายรายการ · ปิดดีล) */

const STAGES: DealStage[] = ["qualified", "proposal", "negotiation", "won"];

export default async function StageRulesPage() {
  const v = await viewer();
  const rules = await stageRules(v.tenantId);
  const manage = can(v.role, "fields");
  return (
    <>
      <Link href="/app/settings" className="c-thai text-[0.8rem] text-[var(--c-text-3)] hover:text-[var(--c-accent)]">← ตั้งค่า</Link>
      <PageHead label="ตั้งค่า" title="กฎขั้นของดีล"
        lead="กันดีลเดินหน้าทั้งที่ข้อมูลยังไม่ครบ"
        more="ย้ายข้ามขั้นต้องผ่านกฎของทุกขั้นที่ข้าม · ถอยหลังและดีลจากแคมเปญไม่ตรวจ" />
      <Panel className="max-w-4xl p-0">
        <div className="c-scroll px-5 py-3" tabIndex={0} role="region" aria-label="กฎขั้นของดีล">
          <table className="c-table min-w-[40rem]">
            <thead><tr><th>ก่อนเข้าขั้น</th>{REQUIREMENTS.map((r) => <th key={r} className="text-center font-sans text-[0.72rem] normal-case tracking-normal">{REQUIREMENT_TH[r]}</th>)}</tr></thead>
            <tbody>
              {STAGES.map((s) => (
                <tr key={s}>
                  <td className="c-thai font-semibold">{DEAL_STAGE_TH[s]}</td>
                  {REQUIREMENTS.map((r) => {
                    const on = rules.get(s)?.includes(r) ?? false;
                    return (
                      <td key={r} className="text-center">
                        {manage ? (
                          <ActionForm action={setStageRuleAction} fields={{ stage: s, requirement: r, on: on ? "0" : "1" }} size="sm" variant={on ? "primary" : "ghost"}
                            label={on ? "✓ ต้องมี" : "+ ตั้ง"} pendingLabel="…"
                            ariaLabel={`${on ? "เลิกบังคับ" : "บังคับ"}ให้${REQUIREMENT_TH[r]} ก่อนเข้าขั้น ${DEAL_STAGE_TH[s]}`} />
                        ) : <span className="c-thai text-[0.82rem]">{on ? "✓ ต้องมี" : "—"}</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      {!manage && <p className="c-thai mt-4 text-[0.84rem] text-[var(--c-text-3)]">ตั้งกฎได้เฉพาะ Data steward หัวหน้าทีม หรือเจ้าของบัญชี</p>}
    </>
  );
}
