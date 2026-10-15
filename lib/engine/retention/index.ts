import { randomUUID } from "node:crypto";
import { all, get, run } from "@/lib/engine/sql";
import { logActivity } from "@/lib/engine/db";
import { canSee } from "@/lib/shared/accounts";
import type { Classification } from "@/lib/shared/vault";

/* ── อายุข้อมูล (docs/plan.md หัวข้อ 7.5 · B6 ส่วนแรก) ─────────────────────────

   ข้อมูลของคนหนึ่งคนอยู่ในระบบเพราะวัตถุประสงค์ของแหล่งที่มันมา (sources.purpose_id)
   แต่ละวัตถุประสงค์มีกฎอายุ (retention_rules.data_kind = 'purpose:<id>' — แม่แบบ S4 สร้างให้)
   วันครบอายุของวัตถุประสงค์ = วันเริ่มนับตามเหตุ (trigger) + ระยะเวลา
   วันครบอายุของคน = วันที่ช้าที่สุดในทุกวัตถุประสงค์ — ยังมีวัตถุประสงค์ที่ใช้ได้อยู่ = ยังเก็บได้

   - legal hold บนวัตถุประสงค์ใดก็ตามของคนนั้น = ไม่ครบอายุ
   - วัตถุประสงค์ที่ไม่มีกฎ = "ไม่มีกฎอายุ" (ไม่มีค่าตั้งต้น "เก็บตลอดไป" — plan 7.5) ไม่ใช่ "ยังไม่ครบ"
   - ฐานความยินยอมที่ยังไม่ถอน = ยังไม่ถึงเหตุเริ่มนับ
   - ระบบไม่ลบเอง: การลบย้อนไม่ได้ จึงขึ้นเป็นรายการให้คนตัดสิน (หน้า "วันนี้" · ปุ่มลบที่หน้าคน)
     งานลบตามไปถึง cache/สรุป AI และทะเบียนการลบหลังกู้คืน backup เป็นส่วนถัดไปของ B6 */

export type RetentionTrigger = "last_interaction" | "received" | "last_participation" | "withdrawal" | "referred";

export type PurposeRetention = {
  purposeId: string;
  purpose: string;
  trigger: string | null;
  days: number | null;
  legalHold: boolean;
  /** วันเริ่มนับ — null = ยังไม่ถึงเหตุ (เช่น ยังไม่ถอนความยินยอม) หรือไม่มีกฎ */
  anchor: string | null;
  dueAt: string | null;
};

export type PersonRetention = {
  customerId: string;
  name: string;
  visible: boolean;
  purposes: PurposeRetention[];
  /** วันครบอายุของคน — null เมื่อ: ไม่มีกฎ · legal hold · ยังมีวัตถุประสงค์ที่ยังไม่ถึงเหตุเริ่มนับ */
  dueAt: string | null;
  status: "no_rule" | "held" | "not_started" | "active" | "due_soon" | "due";
};

const addDays = (iso: string, days: number) => new Date(Date.parse(iso) + days * 864e5).toISOString();
const latest = (...xs: (string | null | undefined)[]) => xs.filter((x): x is string => Boolean(x)).sort().at(-1) ?? null;

export async function retentionForPeople(
  tenantId: string, viewer: { clearance: Classification }, now = new Date(), soonDays = 14,
): Promise<PersonRetention[]> {
  const [links, rules, interactions, parts, withdrawals] = await Promise.all([
    /* คน ↔ วัตถุประสงค์ ผ่านแถวที่นำเข้า (และแหล่งของคนที่เพิ่มเอง) พร้อมวันที่ได้รับข้อมูลล่าสุดภายใต้วัตถุประสงค์นั้น */
    all<{ customer_id: string; name: string; classification: string | null; purpose_id: string; purpose: string; received: string }>(
      `SELECT r.customer_id, c.name, c.classification, s.purpose_id, p.name AS purpose, MAX(b.uploaded_at) AS received
       FROM import_rows r
       JOIN import_batches b ON b.id = r.batch_id AND b.tenant_id = r.tenant_id
       JOIN sources s ON s.id = b.source_id AND s.tenant_id = b.tenant_id
       JOIN purposes p ON p.id = s.purpose_id AND p.tenant_id = s.tenant_id
       JOIN customers c ON c.id = r.customer_id AND c.tenant_id = r.tenant_id
       WHERE r.tenant_id = ? AND r.customer_id IS NOT NULL
       GROUP BY r.customer_id, c.name, c.classification, s.purpose_id, p.name
       UNION
       SELECT c.id, c.name, c.classification, s.purpose_id, p.name, COALESCE(c.recorded_at, c.created_at)
       FROM customers c JOIN sources s ON s.id = c.source_id AND s.tenant_id = c.tenant_id
       JOIN purposes p ON p.id = s.purpose_id AND p.tenant_id = s.tenant_id
       WHERE c.tenant_id = ? AND NOT EXISTS (SELECT 1 FROM import_rows r WHERE r.tenant_id = c.tenant_id AND r.customer_id = c.id)`,
      tenantId, tenantId),
    all<{ data_kind: string; trigger_event: string; period_days: number | string; legal_hold: number | string; created_at: string }>(
      "SELECT data_kind, trigger_event, period_days, legal_hold, created_at FROM retention_rules WHERE tenant_id = ? AND data_kind LIKE 'purpose:%' ORDER BY created_at",
      tenantId),
    all<{ customer_id: string; last_at: string }>(
      "SELECT customer_id, MAX(occurred_at) AS last_at FROM interactions WHERE tenant_id = ? AND customer_id IS NOT NULL GROUP BY customer_id", tenantId),
    all<{ customer_id: string; last_at: string }>(
      "SELECT customer_id, MAX(COALESCE(occurred_at, recorded_at)) AS last_at FROM participations WHERE tenant_id = ? GROUP BY customer_id", tenantId),
    /* ถอนในขอบเขตวัตถุประสงค์นั้น (หรือทุกวัตถุประสงค์) — ความยินยอมใหม่หลังถอนทำให้ยังไม่ถึงเหตุ */
    all<{ customer_id: string; purpose_id: string | null; kind: string; effective_at: string }>(
      "SELECT customer_id, purpose_id, kind, effective_at FROM preferences WHERE tenant_id = ? AND kind IN ('consent', 'withdrawal') ORDER BY effective_at",
      tenantId),
  ]);
  const ruleOf = new Map<string, (typeof rules)[number]>();
  for (const r of rules) ruleOf.set(r.data_kind.slice("purpose:".length), r); // กฎล่าสุดชนะ (เรียงตามเวลาสร้าง)
  const lastTouch = new Map(interactions.map((i) => [i.customer_id, i.last_at]));
  const lastPart = new Map(parts.map((p) => [p.customer_id, p.last_at]));

  const byPerson = new Map<string, PersonRetention>();
  const soon = addDays(now.toISOString(), soonDays), nowIso = now.toISOString();
  for (const l of links) {
    const p = byPerson.get(l.customer_id) ?? {
      customerId: l.customer_id, name: l.name, visible: canSee(viewer.clearance, (l.classification ?? "confidential") as Classification),
      purposes: [], dueAt: null, status: "no_rule" as const,
    };
    const rule = ruleOf.get(l.purpose_id);
    let anchor: string | null = null;
    if (rule) {
      switch (rule.trigger_event) {
        case "last_interaction": anchor = latest(lastTouch.get(l.customer_id), l.received); break;
        case "last_participation": anchor = latest(lastPart.get(l.customer_id), l.received); break;
        case "referred": anchor = latest(lastTouch.get(l.customer_id), l.received); break;
        case "withdrawal": {
          const last = [...withdrawals].reverse().find((w) => w.customer_id === l.customer_id && (w.purpose_id === l.purpose_id || (w.kind === "withdrawal" && w.purpose_id == null)));
          anchor = last?.kind === "withdrawal" ? last.effective_at : null;
          break;
        }
        default: anchor = l.received;
      }
    }
    p.purposes.push({
      purposeId: l.purpose_id, purpose: l.purpose, trigger: rule?.trigger_event ?? null, days: rule ? Number(rule.period_days) : null,
      legalHold: Boolean(Number(rule?.legal_hold ?? 0)), anchor, dueAt: rule && anchor ? addDays(anchor, Number(rule.period_days)) : null,
    });
    byPerson.set(l.customer_id, p);
  }
  for (const p of byPerson.values()) {
    if (p.purposes.some((x) => x.legalHold)) { p.status = "held"; continue; }
    if (p.purposes.some((x) => x.days == null)) { p.status = "no_rule"; continue; }
    if (p.purposes.some((x) => x.dueAt == null)) { p.status = "not_started"; continue; }
    p.dueAt = latest(...p.purposes.map((x) => x.dueAt));
    p.status = p.dueAt! <= nowIso ? "due" : p.dueAt! <= soon ? "due_soon" : "active";
  }
  return [...byPerson.values()].sort((a, b) => (a.dueAt ?? "9").localeCompare(b.dueAt ?? "9") || a.customerId.localeCompare(b.customerId));
}

/** สรุปต่อวัตถุประสงค์ — หน้าวัตถุประสงค์และฐาน */
export async function retentionSummary(tenantId: string, now = new Date()) {
  const people = await retentionForPeople(tenantId, { clearance: "restricted_high" }, now);
  const count = (s: PersonRetention["status"]) => people.filter((p) => p.status === s).length;
  return { people: people.length, due: count("due"), dueSoon: count("due_soon"), noRule: count("no_rule"), held: count("held"), notStarted: count("not_started") };
}

/* ── ตั้งกฎอายุของวัตถุประสงค์ ── เพิ่มแถวใหม่ทุกครั้ง (กฎล่าสุดชนะ · กฎเดิมอยู่ในประวัติ) · ไม่มีตัวเลือก "ตลอดไป"
   legal hold = หยุดนับชั่วคราวเพราะมีเหตุทางกฎหมาย ต้องมีเหตุผล */
export const RETENTION_TRIGGERS: RetentionTrigger[] = ["last_interaction", "received", "last_participation", "withdrawal", "referred"];

export async function setRetentionRule(
  tenantId: string, purposeId: string, input: { days: number; trigger: string; legalHold?: boolean; note?: string }, actor: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await get("SELECT 1 AS x FROM purposes WHERE tenant_id = ? AND id = ?", tenantId, purposeId))) return { ok: false, error: "ไม่พบวัตถุประสงค์นี้" };
  const days = Math.round(Number(input.days));
  if (!Number.isFinite(days) || days < 30 || days > 3650) return { ok: false, error: "ระยะเวลาต้องอยู่ระหว่าง 30 ถึง 3,650 วัน" };
  if (!(RETENTION_TRIGGERS as string[]).includes(input.trigger)) return { ok: false, error: "เลือกเหตุเริ่มนับ" };
  const note = (input.note ?? "").trim().slice(0, 300);
  if (input.legalHold && note.length < 5) return { ok: false, error: "legal hold ต้องมีเหตุผล (เช่น เลขคดี หรือคำสั่งที่เกี่ยวข้อง)" };
  await run(
    "INSERT INTO retention_rules (id, tenant_id, data_kind, trigger_event, period_days, review_owner_id, legal_hold, note, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
    randomUUID(), tenantId, `purpose:${purposeId}`, input.trigger, days, actor, input.legalHold ? 1 : 0, note || null, new Date().toISOString());
  await logActivity(tenantId, actor, "retention_rule_set", `${purposeId} · ${days}d · ${input.trigger}${input.legalHold ? " · legal hold" : ""}`);
  return { ok: true };
}

export async function retentionRules(tenantId: string) {
  const rows = await all<{ data_kind: string; trigger_event: string; period_days: number | string; legal_hold: number | string; note: string | null; created_at: string }>(
    "SELECT data_kind, trigger_event, period_days, legal_hold, note, created_at FROM retention_rules WHERE tenant_id = ? AND data_kind LIKE 'purpose:%' ORDER BY created_at", tenantId);
  const out = new Map<string, { trigger: string; days: number; legalHold: boolean; note: string | null; at: string }>();
  for (const r of rows) out.set(r.data_kind.slice("purpose:".length), { trigger: r.trigger_event, days: Number(r.period_days), legalHold: Boolean(Number(r.legal_hold)), note: r.note, at: r.created_at });
  return out;
}
