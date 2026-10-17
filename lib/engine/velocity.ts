import { all } from "@/lib/engine/sql";
import { listDeals, type DealRow } from "@/lib/engine/deals";
import type { Viewer } from "@/lib/engine/accounts";
import { DEAL_STAGES, OPEN_STAGES, isDealStage, type DealStage } from "@/lib/shared/deals";

/* ── มิติเวลาของดีล (docs/crm-plan.md C3) ─────────────────────────────────

   ทุกการย้ายขั้นและแก้มูลค่าถูกเขียนใน record_versions อยู่แล้ว (U4) — ที่นี่แค่อ่านย้อน:
     ความเร็ว   แต่ละขั้นอยู่นานเฉลี่ยกี่วัน (เฉพาะช่วงที่ออกจากขั้นแล้ว) · ผ่านไปขั้นถัดไปกี่ % · ค้างนานเกิน 30 วันกี่ดีล
     ณ วันที่   ไปป์ไลน์หน้าตาเป็นอย่างไรเมื่อวันหนึ่งในอดีต (ขั้นและมูลค่า ณ สิ้นวันนั้น)
   ดีลของบริษัทที่เกินสิทธิ์ไม่ถูกนับ (มาจาก listDeals ด่านเดียวกับหน้าดีล) · ไม่มีการคาดการณ์ */

export type Step = { stage: string; at: string };
const DAY = 864e5;
const ORDER = new Map<string, number>(DEAL_STAGES.map((s, i) => [s, i]));

/** ลำดับขั้นของแต่ละดีล ตั้งแต่สร้าง — ดีลที่แคมเปญสร้าง (ไม่มีรุ่นตอนสร้าง) ใช้ขั้นเดิมของการย้ายครั้งแรกเป็นจุดเริ่ม */
export async function stageTimelines(tenantId: string, deals: Pick<DealRow, "id" | "stage" | "createdAt">[]): Promise<Map<string, Step[]>> {
  const out = new Map<string, Step[]>();
  const ids = deals.map((d) => d.id);
  const vers: { record_id: string; old_value: string | null; new_value: string | null; recorded_at: string }[] = [];
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    vers.push(...await all<{ record_id: string; old_value: string | null; new_value: string | null; recorded_at: string }>(
      `SELECT record_id, old_value, new_value, recorded_at FROM record_versions
       WHERE tenant_id = ? AND record_kind = 'opportunity' AND field = 'stage' AND record_id IN (${chunk.map(() => "?").join(",")})
       ORDER BY recorded_at, id`, tenantId, ...chunk));
  }
  const by = new Map<string, typeof vers>();
  for (const v of vers) by.set(v.record_id, [...(by.get(v.record_id) ?? []), v]);
  for (const d of deals) {
    const vs = by.get(d.id) ?? [];
    const steps: Step[] = [];
    if (!vs.length) steps.push({ stage: d.stage, at: d.createdAt });
    else {
      if (vs[0].old_value) steps.push({ stage: vs[0].old_value, at: d.createdAt });
      for (const v of vs) if (v.new_value) steps.push({ stage: v.new_value, at: v.recorded_at });
    }
    out.set(d.id, steps);
  }
  return out;
}

export type Velocity = {
  stages: { stage: DealStage; reached: number; advanced: number; avgDays: number | null; stuck: number }[];
  winRate: number | null; won: number; lost: number; avgCycleDays: number | null;
};

export async function velocity(tenantId: string, viewer: Viewer, now = new Date()): Promise<Velocity> {
  const deals = await listDeals(tenantId, { view: "all" }, viewer);
  const tl = await stageTimelines(tenantId, deals);
  const stays = new Map<string, number[]>();
  const reached = new Map<string, number>(), advanced = new Map<string, number>(), stuck = new Map<string, number>();
  const cycles: number[] = [];
  let won = 0, lost = 0;
  for (const d of deals) {
    const steps = tl.get(d.id) ?? [];
    for (let i = 0; i < steps.length - 1; i++) {
      const days = (Date.parse(steps[i + 1].at) - Date.parse(steps[i].at)) / DAY;
      if (days >= 0) stays.set(steps[i].stage, [...(stays.get(steps[i].stage) ?? []), days]);
    }
    /* ขั้นที่ "ถึง" = ขั้นที่เคยอยู่ + ขั้นก่อนหน้าทุกขั้นที่ข้ามมา (ข้ามขั้น = ผ่านขั้นนั้นไปแล้ว) */
    const maxOpen = Math.max(...steps.map((s) => (s.stage === "won" || s.stage === "lost" ? -1 : ORDER.get(s.stage) ?? -1)));
    const wonEver = steps.some((s) => s.stage === "won");
    const top = wonEver ? ORDER.get("won")! : maxOpen;
    for (const s of OPEN_STAGES) {
      const o = ORDER.get(s)!;
      if (o <= top) reached.set(s, (reached.get(s) ?? 0) + 1);
      if (o < top) advanced.set(s, (advanced.get(s) ?? 0) + 1);
    }
    const last = steps.at(-1);
    if (d.stage === "won") { won++; if (last) cycles.push((Date.parse(last.at) - Date.parse(d.createdAt)) / DAY); }
    if (d.stage === "lost") lost++;
    if (last && isDealStage(d.stage) && OPEN_STAGES.includes(d.stage) && (+now - Date.parse(last.at)) / DAY > 30) stuck.set(d.stage, (stuck.get(d.stage) ?? 0) + 1);
  }
  const avg = (xs: number[] | undefined) => (xs?.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
  return {
    stages: OPEN_STAGES.map((s) => ({ stage: s, reached: reached.get(s) ?? 0, advanced: advanced.get(s) ?? 0, avgDays: avg(stays.get(s)), stuck: stuck.get(s) ?? 0 })),
    winRate: won + lost ? won / (won + lost) : null, won, lost, avgCycleDays: avg(cycles),
  };
}

/** ไปป์ไลน์ ณ สิ้นวัน day (เวลาไทย) — ขั้นและมูลค่าตามที่บันทึกไว้ ณ ตอนนั้น */
export async function pipelineAsOf(tenantId: string, viewer: Viewer, day: string): Promise<{ stage: DealStage; count: number; value: number }[]> {
  const end = new Date(Date.parse(`${day}T00:00:00+07:00`) + DAY).toISOString();
  const deals = (await listDeals(tenantId, { view: "all" }, viewer)).filter((d) => d.createdAt < end);
  const tl = await stageTimelines(tenantId, deals);
  const ids = deals.map((d) => d.id);
  const valueVers: { record_id: string; old_value: string | null; recorded_at: string }[] = [];
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    valueVers.push(...await all<{ record_id: string; old_value: string | null; recorded_at: string }>(
      `SELECT record_id, old_value, recorded_at FROM record_versions
       WHERE tenant_id = ? AND record_kind = 'opportunity' AND field = 'value' AND recorded_at >= ? AND record_id IN (${chunk.map(() => "?").join(",")})
       ORDER BY recorded_at, id`, tenantId, end, ...chunk));
  }
  /* มูลค่า ณ วันนั้น = ค่าเดิมของการแก้ครั้งแรกหลังวันนั้น · ไม่มีการแก้หลังจากนั้น = ค่าปัจจุบัน */
  const firstAfter = new Map<string, string | null>();
  for (const v of valueVers) if (!firstAfter.has(v.record_id)) firstAfter.set(v.record_id, v.old_value);
  const out = OPEN_STAGES.map((stage) => ({ stage, count: 0, value: 0 }));
  for (const d of deals) {
    const st = (tl.get(d.id) ?? []).filter((s) => s.at < end).at(-1)?.stage;
    const row = out.find((o) => o.stage === st);
    if (!row) continue;
    const v = firstAfter.has(d.id) ? Number(firstAfter.get(d.id) ?? 0) : d.value ?? 0;
    row.count++;
    row.value += Number.isFinite(v) ? v : 0;
  }
  return out;
}

/** วันปิดจริง (เข้าขั้น won/lost ครั้งล่าสุด) */
export function closedAt(steps: Step[]): string | null {
  const last = steps.at(-1);
  return last && (last.stage === "won" || last.stage === "lost") ? last.at : null;
}

/** เหตุผลที่ได้/ไม่ได้ (docs/crm-plan.md E2) — ดีลที่ปิดตั้งแต่ since (วันปิดจริงจากประวัติขั้น) · ไม่มีเหตุผล = "ไม่ได้บันทึก" */
export async function closeReasons(tenantId: string, viewer: Viewer, since: string): Promise<{ stage: "won" | "lost"; reason: string; count: number; value: number }[]> {
  const closed = (await listDeals(tenantId, { view: "all", limit: 20000 }, viewer)).filter((d) => d.stage === "won" || d.stage === "lost");
  const tl = await stageTimelines(tenantId, closed);
  const deals = closed.filter((d) => (closedAt(tl.get(d.id) ?? []) ?? d.updatedAt) >= since);
  const reasons = new Map<string, string | null>();
  for (let i = 0; i < deals.length; i += 500) {
    const c = deals.slice(i, i + 500);
    for (const r of await all<{ id: string; close_reason: string | null }>(
      `SELECT id, close_reason FROM opportunities WHERE tenant_id = ? AND id IN (${c.map(() => "?").join(",")})`, tenantId, ...c.map((d) => d.id))) reasons.set(r.id, r.close_reason);
  }
  const by = new Map<string, { stage: "won" | "lost"; reason: string; count: number; value: number }>();
  for (const d of deals) {
    const reason = reasons.get(d.id) ?? "unrecorded";
    const k = `${d.stage}|${reason}`;
    const r = by.get(k) ?? { stage: d.stage as "won" | "lost", reason, count: 0, value: 0 };
    r.count++; r.value += d.value ?? 0;
    by.set(k, r);
  }
  return [...by.values()].sort((a, b) => b.count - a.count || b.value - a.value);
}
