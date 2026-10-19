import { randomUUID } from "node:crypto";
import { all, get, run, tx } from "@/lib/engine/sql";
import { logActivity } from "@/lib/engine/db";
import { dealPartyAccess, orgAccess, type Viewer } from "@/lib/engine/accounts";
import { listDeals } from "@/lib/engine/deals";
import { closedAt, stageTimelines } from "@/lib/engine/velocity";
import { effectiveForecast, isForecast, quarterOf, quarterRange, type ForecastCategory } from "@/lib/shared/deals";

/* ── พยากรณ์ · เป้า · ทีม (docs/crm-plan.md C6) ────────────────────────────

   พยากรณ์ = ผลรวมของสิ่งที่คนขายบอก ไม่ใช่การเดาของระบบ:
     ปิดได้แล้ว   ดีลที่เข้าขั้น "ปิดได้" ในไตรมาส (วันจริงจากประวัติขั้น)
     แน่นอน/น่าจะได้/มีโอกาส  ดีลเปิดที่ปิดคาดในไตรมาส ตามหมวดที่คนขายตั้ง (ไม่ตั้ง = ตามขั้น)
     เป้า       ตั้งต่อคนต่อไตรมาส (หัวหน้าทีม/เจ้าของ)
   ทีม = มิติของรายงานและตัวกรอง ไม่ใช่ด่านสิทธิ์ */

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const PERIOD_RE = /^\d{4}-Q[1-4]$/;

export async function setForecast(tenantId: string, dealId: string, category: string, viewer: Viewer): Promise<Result> {
  const next = category === "" ? null : category;
  if (next !== null && !isForecast(next)) return { ok: false, error: "เลือกหมวดพยากรณ์" };
  const d = await get<{ org_id: string | null; customer_id: string | null; forecast_category: string | null }>("SELECT org_id, customer_id, forecast_category FROM opportunities WHERE tenant_id = ? AND id = ?", tenantId, dealId);
  if (!d) return { ok: false, error: "ไม่พบดีลนี้" };
  const access = await dealPartyAccess(tenantId, d, viewer);
  if (!access.ok) return access;
  if ((d.forecast_category ?? null) === next) return { ok: true };
  const at = new Date().toISOString();
  await tx(async (q) => {
    await q.run(
      "INSERT INTO record_versions (tenant_id, record_kind, record_id, field, old_value, new_value, reason, changed_by, valid_from, recorded_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
      tenantId, "opportunity", dealId, "forecast", d.forecast_category, next, "ตั้งหมวดพยากรณ์", viewer.id, null, at);
    await q.run("UPDATE opportunities SET forecast_category = ?, updated_at = ? WHERE tenant_id = ? AND id = ?", next, at, tenantId, dealId);
  });
  return { ok: true };
}

export async function setQuota(tenantId: string, owner: string, period: string, amount: string, actor: string): Promise<Result> {
  const who = owner.trim().slice(0, 120);
  if (!who) return { ok: false, error: "เลือกคน" };
  if (!PERIOD_RE.test(period)) return { ok: false, error: "เลือกไตรมาส" };
  const n = amount.trim() === "" ? null : Number(amount.replace(/[,฿\s]/g, ""));
  if (n != null && (!Number.isFinite(n) || n < 0 || n > 1e12)) return { ok: false, error: "เป้าต้องเป็นตัวเลขบาท" };
  if (n == null) await run("DELETE FROM quotas WHERE tenant_id = ? AND owner_id = ? AND period = ?", tenantId, who, period);
  else await run(
    `INSERT INTO quotas (tenant_id, owner_id, period, amount, set_by, set_at) VALUES (?,?,?,?,?,?)
     ON CONFLICT(tenant_id, owner_id, period) DO UPDATE SET amount = excluded.amount, set_by = excluded.set_by, set_at = excluded.set_at`,
    tenantId, who, period, n, actor, new Date().toISOString());
  await logActivity(tenantId, actor, "quota_set", `${who} · ${period}`);
  return { ok: true };
}

// ── ทีม ──
export type Team = { id: string; name: string; members: string[]; orgs: number };

export async function listTeams(tenantId: string): Promise<Team[]> {
  const [teams, members, orgs] = await Promise.all([
    all<{ id: string; name: string }>("SELECT id, name FROM teams WHERE tenant_id = ? ORDER BY name", tenantId),
    all<{ team_id: string; member_id: string }>("SELECT team_id, member_id FROM team_members WHERE tenant_id = ? ORDER BY member_id", tenantId),
    all<{ team_id: string; n: number | string }>("SELECT team_id, COUNT(*) AS n FROM orgs WHERE tenant_id = ? AND team_id IS NOT NULL GROUP BY team_id", tenantId),
  ]);
  return teams.map((t) => ({
    id: t.id, name: t.name, members: members.filter((m) => m.team_id === t.id).map((m) => m.member_id),
    orgs: Number(orgs.find((o) => o.team_id === t.id)?.n ?? 0),
  }));
}

export async function createTeam(tenantId: string, name: string, actor: string): Promise<Result<{ id: string }>> {
  const n = name.trim().slice(0, 60);
  if (n.length < 2) return { ok: false, error: "ตั้งชื่อทีม เช่น \"ทีมภาคตะวันออก\"" };
  if (await get("SELECT 1 AS x FROM teams WHERE tenant_id = ? AND name = ?", tenantId, n)) return { ok: false, error: "มีทีมชื่อนี้แล้ว" };
  const id = `tm-${randomUUID()}`;
  await run("INSERT INTO teams (id, tenant_id, name, created_at) VALUES (?,?,?,?)", id, tenantId, n, new Date().toISOString());
  await logActivity(tenantId, actor, "team_create", n);
  return { ok: true, id };
}

export async function setTeamMember(tenantId: string, teamId: string, member: string, add: boolean, actor: string): Promise<Result> {
  const who = member.trim().slice(0, 120);
  if (!who) return { ok: false, error: "ใส่คนในทีม" };
  if (!(await get("SELECT 1 AS x FROM teams WHERE tenant_id = ? AND id = ?", tenantId, teamId))) return { ok: false, error: "ไม่พบทีมนี้" };
  if (add) await run("INSERT INTO team_members (tenant_id, team_id, member_id) VALUES (?,?,?) ON CONFLICT DO NOTHING", tenantId, teamId, who);
  else await run("DELETE FROM team_members WHERE tenant_id = ? AND team_id = ? AND member_id = ?", tenantId, teamId, who);
  await logActivity(tenantId, actor, add ? "team_member_add" : "team_member_remove", `${teamId} · ${who}`);
  return { ok: true };
}

/** ทีมของบริษัท (เขตการขาย) — แก้ได้ด้วยสิทธิ์ write + ด่านบริษัทเดียวกับการแก้แฟ้ม · มีรุ่นในประวัติ */
export async function setOrgTeam(tenantId: string, orgId: string, teamId: string, viewer: Viewer): Promise<Result> {
  const access = await orgAccess(tenantId, orgId, viewer);
  if (!access.ok) return access;
  const next = teamId || null;
  if (next && !(await get("SELECT 1 AS x FROM teams WHERE tenant_id = ? AND id = ?", tenantId, next))) return { ok: false, error: "ไม่พบทีมนี้" };
  const o = await get<{ team_id: string | null }>("SELECT team_id FROM orgs WHERE tenant_id = ? AND id = ?", tenantId, orgId);
  if ((o?.team_id ?? null) === next) return { ok: true };
  const at = new Date().toISOString();
  await tx(async (q) => {
    await q.run(
      "INSERT INTO record_versions (tenant_id, record_kind, record_id, field, old_value, new_value, reason, changed_by, valid_from, recorded_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
      tenantId, "org", orgId, "team_id", o?.team_id ?? null, next, "ตั้งทีมที่ดูแล", viewer.id, null, at);
    await q.run("UPDATE orgs SET team_id = ?, recorded_at = ? WHERE tenant_id = ? AND id = ?", next, at, tenantId, orgId);
  });
  return { ok: true };
}

// ── รายงานพยากรณ์ ──
export type ForecastRow = { owner: string; team: string | null; quota: number | null; won: number; commit: number; best_case: number; pipeline: number };

export async function forecastReport(tenantId: string, viewer: Viewer, period: string): Promise<{ rows: ForecastRow[]; teams: { team: string; rows: ForecastRow[] }[] }> {
  if (!PERIOD_RE.test(period)) return { rows: [], teams: [] };
  const { from, to } = quarterRange(period);
  const deals = await listDeals(tenantId, { view: "all", limit: 20000 }, viewer);
  const fc = await all<{ id: string; forecast_category: string | null }>(
    "SELECT id, forecast_category FROM opportunities WHERE tenant_id = ? AND forecast_category IS NOT NULL", tenantId);
  const set = new Map(fc.map((r) => [r.id, r.forecast_category]));
  const won = deals.filter((d) => d.stage === "won");
  const tl = await stageTimelines(tenantId, won);
  const [quotas, members, teams] = await Promise.all([
    all<{ owner_id: string; amount: number | string }>("SELECT owner_id, amount FROM quotas WHERE tenant_id = ? AND period = ?", tenantId, period),
    all<{ team_id: string; member_id: string }>("SELECT team_id, member_id FROM team_members WHERE tenant_id = ?", tenantId),
    all<{ id: string; name: string }>("SELECT id, name FROM teams WHERE tenant_id = ?", tenantId),
  ]);
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const teamOf = new Map(members.map((m) => [m.member_id, teamName.get(m.team_id) ?? null]));
  const by = new Map<string, ForecastRow>();
  const row = (owner: string) => {
    if (!by.has(owner)) by.set(owner, { owner, team: teamOf.get(owner) ?? null, quota: null, won: 0, commit: 0, best_case: 0, pipeline: 0 });
    return by.get(owner)!;
  };
  for (const q of quotas) row(q.owner_id).quota = Number(q.amount);
  for (const d of won) {
    const at = closedAt(tl.get(d.id) ?? []) ?? d.updatedAt;
    if (quarterOf(at) === period) row(d.owner ?? "— ไม่มีเจ้าของ —").won += d.value ?? 0;
  }
  for (const d of deals) {
    const cat = effectiveForecast(d.stage, set.get(d.id) ?? null);
    if (!cat || cat === "omitted" || !d.expectedClose || d.expectedClose < from || d.expectedClose > to) continue;
    row(d.owner ?? "— ไม่มีเจ้าของ —")[cat as Exclude<ForecastCategory, "omitted">] += d.value ?? 0;
  }
  const rows = [...by.values()].sort((a, b) => (b.won + b.commit) - (a.won + a.commit) || a.owner.localeCompare(b.owner));
  const groups = new Map<string, ForecastRow[]>();
  for (const r of rows) groups.set(r.team ?? "ไม่อยู่ในทีม", [...(groups.get(r.team ?? "ไม่อยู่ในทีม") ?? []), r]);
  return { rows, teams: [...groups].map(([team, rs]) => ({ team, rows: rs })) };
}

/** ไตรมาสที่เลือกได้: ไตรมาสนี้ ± 3 */
export function nearbyQuarters(now = new Date()): string[] {
  const cur = quarterOf(now.toISOString());
  const [y, q] = [Number(cur.slice(0, 4)), Number(cur.slice(6))];
  return Array.from({ length: 7 }, (_, i) => {
    const k = y * 4 + (q - 1) + (i - 3);
    return `${Math.floor(k / 4)}-Q${(k % 4) + 1}`;
  });
}
