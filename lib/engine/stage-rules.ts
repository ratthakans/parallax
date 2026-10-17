import { all, get, run } from "@/lib/engine/sql";
import { logActivity } from "@/lib/engine/db";
import { DEAL_STAGES, isDealStage, type DealStage } from "@/lib/shared/deals";

/* ── กฎขั้นของดีล (docs/crm-plan.md D4) ─────────────────────────────────────

   บัญชีตั้งได้ว่าดีลต้องมีอะไรก่อนเข้าขั้นไหน เช่น ต้องมีมูลค่าก่อน "เสนอราคา" · ต้องรู้ผู้ตัดสินใจก่อน "ต่อรอง"
   ตรวจที่ moveDeal (ทุกทางที่ย้ายขั้นด้วยมือ: Path · ลาก · ทำหลายรายการ · ปิดดีล) — บอกครบทุกข้อที่ขาดในครั้งเดียว
   ไม่ตรวจกับดีลที่แคมเปญสร้าง/ย้ายเอง (แคมเปญมีการตรวจนโยบายของตัวเองตอนบันทึกผล)
   ย้ายถอยหลังไม่ตรวจ — กฎมีไว้กันข้อมูลขาดตอนเดินหน้า ไม่ใช่กันการแก้ไข */

export const REQUIREMENTS = ["value", "close_date", "contact", "decision_maker", "package", "open_task"] as const;
export type Requirement = (typeof REQUIREMENTS)[number];
export const REQUIREMENT_TH: Record<Requirement, string> = {
  value: "มีมูลค่า", close_date: "มีวันปิดคาด", contact: "มีคนในดีลอย่างน้อยหนึ่งคน", decision_maker: "รู้ว่าใครเป็นผู้ตัดสินใจ",
  package: "มีแพ็กเกจในดีล", open_task: "มีงานถัดไปที่ยังเปิดอยู่",
};
const isReq = (r: string): r is Requirement => (REQUIREMENTS as readonly string[]).includes(r);
const ORDER = new Map<string, number>(DEAL_STAGES.map((s, i) => [s, i]));

export async function stageRules(tenantId: string): Promise<Map<DealStage, Requirement[]>> {
  const out = new Map<DealStage, Requirement[]>();
  for (const r of await all<{ stage: string; requirement: string }>("SELECT stage, requirement FROM stage_rules WHERE tenant_id = ?", tenantId)) {
    if (isDealStage(r.stage) && isReq(r.requirement)) out.set(r.stage, [...(out.get(r.stage) ?? []), r.requirement]);
  }
  return out;
}

export async function setStageRule(tenantId: string, stage: string, requirement: string, on: boolean, actor: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isDealStage(stage) || stage === "open" || stage === "lost") return { ok: false, error: "ตั้งกฎได้กับขั้นหลังเริ่มคุย และขั้นปิดได้" };
  if (!isReq(requirement)) return { ok: false, error: "ไม่รู้จักเงื่อนไขนี้" };
  if (on) await run("INSERT INTO stage_rules (tenant_id, stage, requirement, created_by, created_at) VALUES (?,?,?,?,?) ON CONFLICT DO NOTHING",
    tenantId, stage, requirement, actor, new Date().toISOString());
  else await run("DELETE FROM stage_rules WHERE tenant_id = ? AND stage = ? AND requirement = ?", tenantId, stage, requirement);
  await logActivity(tenantId, actor, on ? "stage_rule_add" : "stage_rule_remove", `${stage} · ${requirement}`);
  return { ok: true };
}

/** สิ่งที่ดีลยังขาดก่อนเข้าขั้น to — รวมกฎของทุกขั้นที่ข้ามไปด้วย (ข้ามจากเริ่มคุยไปต่อรอง = ต้องผ่านกฎของเสนอราคาด้วย) */
export async function stageBlockers(tenantId: string, dealId: string, from: string, to: string): Promise<string[]> {
  if (to === "lost") return [];
  const a = ORDER.get(from) ?? 0, b = ORDER.get(to) ?? 0;
  if (b <= a) return [];
  const rules = await stageRules(tenantId);
  const needed = new Set<Requirement>();
  for (const [stage, reqs] of rules) { const o = ORDER.get(stage)!; if (o > a && o <= b) reqs.forEach((r) => needed.add(r)); }
  if (!needed.size) return [];
  const d = await get<{ value: number | string | null; expected_close: string | null }>("SELECT value, expected_close FROM opportunities WHERE tenant_id = ? AND id = ?", tenantId, dealId);
  if (!d) return [];
  const missing: Requirement[] = [];
  for (const r of needed) {
    const has = r === "value" ? d.value != null && Number(d.value) > 0
      : r === "close_date" ? Boolean(d.expected_close)
      : r === "contact" ? Boolean(await get("SELECT 1 AS x FROM opportunity_people WHERE tenant_id = ? AND opportunity_id = ?", tenantId, dealId))
      : r === "decision_maker" ? Boolean(await get("SELECT 1 AS x FROM opportunity_people WHERE tenant_id = ? AND opportunity_id = ? AND role = 'decision_maker'", tenantId, dealId))
      : r === "package" ? Boolean(await get("SELECT 1 AS x FROM deal_items WHERE tenant_id = ? AND opportunity_id = ?", tenantId, dealId))
      : Boolean(await get("SELECT 1 AS x FROM tasks WHERE tenant_id = ? AND opportunity_id = ? AND status = 'open'", tenantId, dealId));
    if (!has) missing.push(r);
  }
  return REQUIREMENTS.filter((r) => missing.includes(r)).map((r) => REQUIREMENT_TH[r]);
}
