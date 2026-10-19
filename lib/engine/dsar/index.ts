import { randomUUID } from "node:crypto";
import { all, get, run } from "@/lib/engine/sql";
import { logActivity } from "@/lib/engine/db";
import { decryptContact, type ContactKind } from "@/lib/engine/pii";
import { findCustomersByContact } from "@/lib/engine/contacts";
import { deleteCustomer } from "@/lib/engine/customers";
import { recordPreference, preferencesOf } from "@/lib/engine/policy/preferences";
import { personIdsOf } from "@/lib/engine/vault/merge";
import { retentionForPeople } from "@/lib/engine/retention";
import { storedBriefsAbout } from "@/lib/engine/accounts/brief";
import { bangkokDay } from "@/lib/shared/format";
import {
  DSAR_CHANNELS, DSAR_DUE_DAYS, DSAR_KINDS, DSAR_KIND_TH,
  type DsarChannel, type DsarKind, type DsarRequest, type DsarStatus,
} from "@/lib/shared/dsar";

/* ── คำขอสิทธิของเจ้าของข้อมูล (DSAR · docs/plan.md หัวข้อ 7.4 · B6) ─────────────

   รับคำขอ → ยืนยันตัวตน → ทำตามชนิด → ปิด (ทำแล้ว · ปฏิเสธพร้อมเหตุผล) ภายใน 30 วันนับจากวันที่ได้รับ
   - คำขอผูกกับรหัสคน (subject_id) ไม่เก็บชื่อหรือค่าติดต่อของผู้ขอ — หาคนจากอีเมล/เบอร์ด้วย HMAC
     ไม่พบในระบบก็ยังเป็นคำขอที่ต้องตอบ (ตอบว่าไม่มีข้อมูล) จึงเปิดได้โดยไม่มีคน
   - ปิดคำขอลบ/ถอน/คัดค้าน/ขอจำกัด = ทำการนั้นจริงในคำขอเดียวกัน ไม่ใช่แค่เปลี่ยนสถานะ
   - คำขอเข้าถึง/โอน ต้องสร้างรายงานก่อนปิด · รายงานรวมข้อมูลที่ AI สร้าง และบอกจุดที่ต้องตรวจข้อมูลของคนอื่นก่อนส่ง
   - ยืนยันตัวตนก่อนทำอะไรที่เปิดเผยหรือลบข้อมูล — ปฏิเสธได้โดยไม่ต้องยืนยัน (เช่น ยืนยันตัวตนไม่ได้)
   - แถวคำขออยู่ต่อหลังลบคน (หลักฐานว่าทำตามแล้ว) — มีแค่รหัส ไม่มีชื่อ */

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

type Row = {
  id: string; ref: string; kind: DsarKind; subject_id: string | null; channel: DsarChannel; received_at: string; due_at: string;
  status: DsarStatus; owner_id: string; verified_at: string | null; verified_by: string | null; verification_note: string | null;
  report_at: string | null; outcome_note: string | null; closed_at: string | null; closed_by: string | null;
  created_by: string; created_at: string; subject_name: string | null;
};

const COLS = `d.id, d.ref, d.kind, d.subject_id, d.channel, d.received_at, d.due_at, d.status, d.owner_id, d.verified_at, d.verified_by,
  d.verification_note, d.report_at, d.outcome_note, d.closed_at, d.closed_by, d.created_by, d.created_at, c.name AS subject_name`;
const FROM = "FROM dsar_requests d LEFT JOIN customers c ON c.id = d.subject_id AND c.tenant_id = d.tenant_id";

/** วันที่ (YYYY-MM-DD) + n วัน */
const plusDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 864e5);

function toRequest(r: Row, now: Date): DsarRequest {
  return {
    id: r.id, ref: r.ref, kind: r.kind, subjectId: r.subject_id, subjectName: r.subject_name,
    subjectGone: Boolean(r.subject_id && r.subject_name == null),
    channel: r.channel, receivedAt: r.received_at, dueAt: r.due_at, daysLeft: daysBetween(bangkokDay(now), r.due_at),
    status: r.status, ownerId: r.owner_id, verifiedAt: r.verified_at, verifiedBy: r.verified_by, verificationNote: r.verification_note,
    reportAt: r.report_at, outcomeNote: r.outcome_note, closedAt: r.closed_at, closedBy: r.closed_by, createdBy: r.created_by, createdAt: r.created_at,
  };
}

export async function listRequests(tenantId: string, now = new Date()): Promise<DsarRequest[]> {
  const rows = await all<Row>(`SELECT ${COLS} ${FROM} WHERE d.tenant_id = ? ORDER BY CASE WHEN d.status = 'open' THEN 0 ELSE 1 END, d.due_at, d.ref`, tenantId);
  return rows.map((r) => toRequest(r, now));
}

export async function getRequest(tenantId: string, id: string, now = new Date()): Promise<DsarRequest | null> {
  const r = await get<Row>(`SELECT ${COLS} ${FROM} WHERE d.tenant_id = ? AND d.id = ?`, tenantId, id);
  return r ? toRequest(r, now) : null;
}

/** คำขอของคนหนึ่งคน (รวมรหัสที่ถูกรวมเข้ามา) — หน้าคน */
export async function requestsFor(tenantId: string, customerId: string, now = new Date()): Promise<DsarRequest[]> {
  const ids = await personIdsOf(tenantId, customerId);
  const rows = await all<Row>(
    `SELECT ${COLS} ${FROM} WHERE d.tenant_id = ? AND d.subject_id IN (${ids.map(() => "?").join(",")}) ORDER BY d.received_at DESC`,
    tenantId, ...ids);
  return rows.map((r) => toRequest(r, now));
}

/* ── เปิดคำขอ ── */
export async function openRequest(
  tenantId: string,
  input: { kind: string; channel: string; receivedAt: string; subjectId?: string; contactKind?: string; contactValue?: string },
  actor: string, now = new Date(),
): Promise<Result<{ id: string; ref: string; found: boolean }>> {
  if (!(DSAR_KINDS as readonly string[]).includes(input.kind)) return { ok: false, error: "เลือกชนิดคำขอ" };
  if (!(DSAR_CHANNELS as readonly string[]).includes(input.channel)) return { ok: false, error: "เลือกช่องทางที่ได้รับคำขอ" };
  const received = /^\d{4}-\d{2}-\d{2}$/.test(input.receivedAt ?? "") ? input.receivedAt : "";
  if (!received || Number.isNaN(Date.parse(received))) return { ok: false, error: "ใส่วันที่ได้รับคำขอ" };
  const today = bangkokDay(now);
  if (received > today) return { ok: false, error: "วันที่ได้รับคำขออยู่ในอนาคต" };
  /* ย้อนหลังได้ (คำขอทางจดหมายมาถึงก่อนบันทึก) แต่วันครบกำหนดนับจากวันที่ได้รับจริงเสมอ — ไม่นับจากวันที่บันทึก */
  if (daysBetween(received, today) > 365) return { ok: false, error: "วันที่ได้รับคำขอเก่ากว่าหนึ่งปี — ตรวจวันที่อีกครั้ง" };

  let subject: string | null = null;
  if (input.subjectId) {
    if (!(await get("SELECT 1 AS x FROM customers WHERE tenant_id = ? AND id = ?", tenantId, input.subjectId))) return { ok: false, error: "ไม่พบบุคคลนี้" };
    subject = input.subjectId;
  } else if (input.contactValue?.trim()) {
    const kind = input.contactKind === "phone" ? "phone" : "email";
    const ids = await findCustomersByContact(tenantId, kind, input.contactValue);
    if (ids.length > 1) return { ok: false, error: `ช่องทางนี้ตรงกับ ${ids.length} คน — เปิดคำขอจากหน้าของคนที่ถูกต้องแทน` };
    subject = ids[0] ?? null;
  } else {
    return { ok: false, error: "ระบุผู้ขอ: อีเมลหรือเบอร์ที่ผู้ขอใช้ติดต่อ" };
  }

  const year = received.slice(0, 4);
  const id = randomUUID();
  /* เลขเรื่องเรียงต่อปี — ชนกันเมื่อเปิดพร้อมกัน (ดัชนี unique) จึงลองเลขถัดไป */
  for (let attempt = 0; attempt < 5; attempt++) {
    const n = Number((await get<{ n: number | string }>("SELECT COUNT(*) AS n FROM dsar_requests WHERE tenant_id = ? AND ref LIKE ?", tenantId, `DSAR-${year}-%`))?.n ?? 0);
    const ref = `DSAR-${year}-${String(n + 1 + attempt).padStart(3, "0")}`;
    try {
      await run(
        `INSERT INTO dsar_requests (id, tenant_id, ref, kind, subject_id, channel, received_at, due_at, status, owner_id, created_by, created_at)
         VALUES (?,?,?,?,?,?,?,?,'open',?,?,?)`,
        id, tenantId, ref, input.kind, subject, input.channel, received, plusDays(received, DSAR_DUE_DAYS), actor, actor, now.toISOString());
      await logActivity(tenantId, actor, "dsar_open", `${ref} · ${input.kind}${subject ? ` · ${subject}` : " · ไม่พบในระบบ"}`);
      return { ok: true, id, ref, found: subject != null };
    } catch (e) {
      if (!/unique|duplicate/i.test(String(e))) throw e;
    }
  }
  return { ok: false, error: "เปิดคำขอไม่สำเร็จ ลองอีกครั้ง" };
}

/* ── ยืนยันตัวตน ── เท่าที่จำเป็น: บันทึกว่ายืนยันด้วยอะไร ไม่เก็บสำเนาเอกสาร */
export async function verifyIdentity(tenantId: string, id: string, note: string, actor: string, now = new Date()): Promise<Result> {
  const r = await getRequest(tenantId, id, now);
  if (!r) return { ok: false, error: "ไม่พบคำขอนี้" };
  if (r.status !== "open") return { ok: false, error: "คำขอนี้ปิดแล้ว" };
  const n = note.trim().slice(0, 300);
  if (n.length < 5) return { ok: false, error: "บอกวิธีที่ยืนยัน เช่น ตอบกลับจากอีเมลที่อยู่ในระบบ (ไม่ต้องแนบสำเนาบัตร)" };
  await run("UPDATE dsar_requests SET verified_at = ?, verified_by = ?, verification_note = ? WHERE tenant_id = ? AND id = ?",
    now.toISOString(), actor, n, tenantId, id);
  await logActivity(tenantId, actor, "dsar_verify", r.ref);
  return { ok: true };
}

/* ── รายงานข้อมูลของผู้ขอ (เข้าถึง · โอน) ─────────────────────────────

   ทุกที่ที่ข้อมูลของคนนี้อยู่ รวมรหัสที่ถูกรวมเข้ามา: ข้อมูลตัวคน · ช่องทาง (ค่าเต็ม) · สังกัด · การร่วมงาน · ปฏิสัมพันธ์
   · ความสัมพันธ์ · ความยินยอม/คัดค้าน · วัตถุประสงค์และฐาน · แหล่งที่มา · แคมเปญ · งาน · โอกาสขาย · ประวัติการแก้ค่า
   · ข้อมูลที่ AI สร้าง · ใครเปิดดูช่องทางติดต่อ · อายุข้อมูล
   ชื่อบุคคลอื่น (ปลายอีกข้างของความสัมพันธ์) ถูกแทนด้วย "บุคคลอื่น" · ข้อความอิสระ (บันทึกปฏิสัมพันธ์ · งาน) อาจมีข้อมูลของคนอื่น
   จึงอยู่ในรายการ "ต้องตรวจก่อนส่ง" — ระบบไม่ตัดข้อความให้เอง */

export type SubjectReport = {
  request: { ref: string; kind: string; receivedAt: string; dueAt: string };
  generatedAt: string;
  generatedBy: string;
  person: Record<string, unknown>;
  mergedIds: string[];
  profile: Record<string, string>;
  contacts: { kind: string; value: string; label: string | null; source: string; since: string; validTo: string | null }[];
  affiliations: Record<string, unknown>[];
  participations: Record<string, unknown>[];
  interactions: Record<string, unknown>[];
  relationships: Record<string, unknown>[];
  preferences: Record<string, unknown>[];
  purposes: Record<string, unknown>[];
  sources: Record<string, unknown>[];
  campaigns: Record<string, unknown>[];
  tasks: Record<string, unknown>[];
  opportunities: Record<string, unknown>[];
  fieldHistory: Record<string, unknown>[];
  /** ข้อมูลยุคค้าปลีก (บัญชีร้านค้า): การซื้อ · เหตุการณ์ · ความยินยอมแบบเดิม · สมาชิก · ข้อความที่ส่ง */
  retail: { purchases: Record<string, unknown>[]; events: Record<string, unknown>[]; consents: Record<string, unknown>[];
    memberships: Record<string, unknown>[]; messages: Record<string, unknown>[] };
  aiGenerated: { org: string; source: string; model: string | null; createdAt: string; sentences: string[] }[];
  accessLog: { action: string; by: string; at: string }[];
  retention: Record<string, unknown> | null;
  reviewBeforeSending: string[];
};

const inList = (n: number) => Array.from({ length: n }, () => "?").join(",");
const clean = <T extends Record<string, unknown>>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== "")) as T;

export async function buildReport(tenantId: string, id: string, actor: string, now = new Date()): Promise<Result<{ report: SubjectReport }>> {
  const r = await getRequest(tenantId, id, now);
  if (!r) return { ok: false, error: "ไม่พบคำขอนี้" };
  if (r.kind !== "access" && r.kind !== "portability") return { ok: false, error: "รายงานใช้กับคำขอเข้าถึงหรือโอนย้ายข้อมูล" };
  if (!r.verifiedAt) return { ok: false, error: "ยืนยันตัวตนผู้ขอก่อนสร้างรายงาน — รายงานมีข้อมูลเต็ม" };
  if (!r.subjectId || r.subjectGone) return { ok: false, error: "ไม่มีข้อมูลของผู้ขอในระบบ — ปิดคำขอโดยบันทึกว่าไม่พบข้อมูล" };

  const T = tenantId, sid = r.subjectId;
  const ids = await personIdsOf(T, sid);
  const IN = inList(ids.length);
  const person = (await get<Record<string, unknown>>(
    "SELECT id, name, classification, lifecycle_state, restriction_status, created_at, recorded_at, last_verified_at FROM customers WHERE tenant_id = ? AND id = ?", T, sid))!;
  const profileRows = await all<Record<string, string | null>>(
    `SELECT first_name, last_name, nickname, gender, birthday, company, job_title, subdistrict, district, province, postcode, note FROM contact_profiles WHERE tenant_id = ? AND customer_id IN (${IN})`, T, ...ids);
  const profile: Record<string, string> = {};
  for (const p of profileRows) for (const [k, v] of Object.entries(p)) if (v && !profile[k]) profile[k] = v;

  const points = await all<{ kind: ContactKind; value_enc: string; label: string | null; source: string; created_at: string; valid_to: string | null }>(
    `SELECT kind, value_enc, label, source, created_at, valid_to FROM contact_points WHERE tenant_id = ? AND customer_id IN (${IN}) ORDER BY kind, created_at`, T, ...ids);
  const contacts = points.map((p) => ({ kind: p.kind, value: decryptContact(T, p.kind, p.value_enc), label: p.label, source: p.source, since: p.created_at, validTo: p.valid_to }));

  const affiliations = await all<Record<string, unknown> & { org_id: string; id: string }>(
    `SELECT a.id, a.org_id, o.name AS org, a.title, a.department, a.valid_from, a.valid_to, s.name AS source, a.confirmed_by, a.recorded_at
     FROM affiliations a LEFT JOIN orgs o ON o.id = a.org_id AND o.tenant_id = a.tenant_id LEFT JOIN sources s ON s.id = a.source_id AND s.tenant_id = a.tenant_id
     WHERE a.tenant_id = ? AND a.customer_id IN (${IN}) ORDER BY a.valid_from`, T, ...ids);
  const participations = await all<Record<string, unknown> & { id: string; org_id: string | null }>(
    `SELECT p.id, p.org_id, o.name AS org, p.program, p.edition, p.role, p.occurred_at, p.recorded_at
     FROM participations p LEFT JOIN orgs o ON o.id = p.org_id AND o.tenant_id = p.tenant_id
     WHERE p.tenant_id = ? AND p.customer_id IN (${IN}) ORDER BY p.occurred_at`, T, ...ids);
  const interactions = await all<Record<string, unknown> & { id: string; org_id: string | null; summary: string | null }>(
    `SELECT i.id, i.org_id, o.name AS org, i.kind, i.occurred_at, i.summary, i.outcome, i.owner_id, i.recorded_at
     FROM interactions i LEFT JOIN orgs o ON o.id = i.org_id AND o.tenant_id = i.tenant_id
     WHERE i.tenant_id = ? AND i.customer_id IN (${IN}) ORDER BY i.occurred_at`, T, ...ids);
  const relRows = await all<{ id: string; type: string; context: string | null; from_kind: string; from_id: string; to_kind: string; to_id: string;
    valid_from: string | null; valid_to: string | null; lifecycle_state: string; confirmed_by: string | null; org_name: string | null; mine_from: number | string }>(
    `SELECT r.id, r.type, r.context, r.from_kind, r.from_id, r.to_kind, r.to_id, r.valid_from, r.valid_to, r.lifecycle_state, r.confirmed_by,
       o.name AS org_name, CASE WHEN r.from_kind = 'person' AND r.from_id IN (${IN}) THEN 1 ELSE 0 END AS mine_from
     FROM relationship_assertions r
     LEFT JOIN orgs o ON o.tenant_id = r.tenant_id AND ((r.from_kind = 'org' AND o.id = r.from_id) OR (r.to_kind = 'org' AND o.id = r.to_id))
     WHERE r.tenant_id = ? AND ((r.from_kind = 'person' AND r.from_id IN (${IN})) OR (r.to_kind = 'person' AND r.to_id IN (${IN})))
     ORDER BY r.recorded_at`, ...ids, T, ...ids, ...ids);
  const relationships = relRows.map((x) => {
    const otherKind = Number(x.mine_from) ? x.to_kind : x.from_kind;
    const otherId = Number(x.mine_from) ? x.to_id : x.from_id;
    const otherIsSelf = otherKind === "person" && ids.includes(otherId);
    return clean({
      type: x.type, direction: Number(x.mine_from) ? "ผู้ขอ → อีกฝ่าย" : "อีกฝ่าย → ผู้ขอ",
      other: otherKind === "org" ? x.org_name : otherIsSelf ? "ผู้ขอ" : otherKind === "member" ? `ผู้ใช้ระบบ ${otherId}` : "บุคคลอื่น",
      context: x.context, validFrom: x.valid_from, validTo: x.valid_to, state: x.lifecycle_state, confirmedBy: x.confirmed_by,
    });
  });
  const preferences = (await preferencesOf(T, sid)).map((p) => clean({ ...p }));

  const purposes = await all<Record<string, unknown>>(
    `SELECT DISTINCT p.name AS purpose, pr.lawful_basis, pr.version, pr.effective_from
     FROM purposes p
     LEFT JOIN processing_records pr ON pr.purpose_id = p.id AND pr.tenant_id = p.tenant_id AND pr.effective_to IS NULL
     WHERE p.tenant_id = ? AND p.id IN (
       SELECT s.purpose_id FROM import_rows r JOIN import_batches b ON b.id = r.batch_id AND b.tenant_id = r.tenant_id
         JOIN sources s ON s.id = b.source_id AND s.tenant_id = b.tenant_id WHERE r.tenant_id = ? AND r.customer_id IN (${IN})
       UNION SELECT s.purpose_id FROM customers c JOIN sources s ON s.id = c.source_id AND s.tenant_id = c.tenant_id WHERE c.tenant_id = ? AND c.id IN (${IN})
       UNION SELECT sc.purpose_id FROM campaign_targets t JOIN sales_campaigns sc ON sc.id = t.campaign_id AND sc.tenant_id = t.tenant_id WHERE t.tenant_id = ? AND t.customer_id IN (${IN}))
     ORDER BY 1`, T, T, ...ids, T, ...ids, T, ...ids);
  const sources = await all<Record<string, unknown>>(
    `SELECT s.name AS source, s.kind, s.acquisition_note, b.filename, r.line, b.uploaded_at, r.status
     FROM import_rows r JOIN import_batches b ON b.id = r.batch_id AND b.tenant_id = r.tenant_id
     JOIN sources s ON s.id = b.source_id AND s.tenant_id = b.tenant_id
     WHERE r.tenant_id = ? AND r.customer_id IN (${IN}) ORDER BY b.uploaded_at, r.line`, T, ...ids);
  const campaigns = await all<Record<string, unknown>>(
    `SELECT sc.name AS campaign, p.name AS purpose, sc.channel, t.eligibility, t.status, t.outcome, t.created_at
     FROM campaign_targets t JOIN sales_campaigns sc ON sc.id = t.campaign_id AND sc.tenant_id = t.tenant_id
     LEFT JOIN purposes p ON p.id = sc.purpose_id AND p.tenant_id = sc.tenant_id
     WHERE t.tenant_id = ? AND t.customer_id IN (${IN}) ORDER BY t.created_at`, T, ...ids);
  const tasks = await all<Record<string, unknown>>(
    `SELECT title, status, due_at, owner_id, outcome, created_at, done_at FROM tasks WHERE tenant_id = ? AND customer_id IN (${IN}) ORDER BY created_at`, T, ...ids);
  const opportunities = await all<Record<string, unknown>>(
    `SELECT o.name AS opportunity, o.stage, op.role, o.created_at FROM opportunity_people op
     JOIN opportunities o ON o.id = op.opportunity_id AND o.tenant_id = op.tenant_id
     WHERE op.tenant_id = ? AND op.customer_id IN (${IN})
     UNION
     SELECT o.name AS opportunity, o.stage, 'customer' AS role, o.created_at FROM opportunities o
     WHERE o.tenant_id = ? AND o.org_id IS NULL AND o.customer_id IN (${IN})
     ORDER BY created_at`, T, ...ids, T, ...ids);
  const fieldHistory = await all<Record<string, unknown>>(
    `SELECT field, old_value, new_value, reason, changed_by, valid_from, recorded_at FROM record_versions
     WHERE tenant_id = ? AND record_kind = 'person' AND record_id IN (${IN}) ORDER BY recorded_at`, T, ...ids);

  const retail = {
    purchases: await all<Record<string, unknown>>(
      `SELECT t.occurred_at, t.total, t.discount_total, t.channel, (SELECT COUNT(*) FROM line_items l WHERE l.tenant_id = t.tenant_id AND l.txn_id = t.id) AS items
       FROM transactions t WHERE t.tenant_id = ? AND t.customer_id IN (${IN}) ORDER BY t.occurred_at`, T, ...ids),
    events: await all<Record<string, unknown>>(`SELECT type, occurred_at FROM events WHERE tenant_id = ? AND customer_id IN (${IN}) ORDER BY occurred_at`, T, ...ids),
    consents: await all<Record<string, unknown>>(`SELECT purpose, granted_at, revoked_at, source FROM consents WHERE tenant_id = ? AND customer_id IN (${IN})`, T, ...ids),
    memberships: await all<Record<string, unknown>>(`SELECT kind, started_at, expires_at FROM memberships WHERE tenant_id = ? AND customer_id IN (${IN})`, T, ...ids),
    messages: await all<Record<string, unknown>>(
      `SELECT c.play_id AS campaign, m.channel, m.status, m.sent_at FROM messages m LEFT JOIN campaigns c ON c.id = m.campaign_id AND c.tenant_id = m.tenant_id
       WHERE m.tenant_id = ? AND m.customer_id IN (${IN}) ORDER BY m.sent_at`, T, ...ids),
  };

  /* ข้อมูลที่ AI สร้าง: สรุปแฟ้มของบริษัทที่คนนี้เกี่ยวข้อง — เฉพาะประโยคที่อ้างหลักฐานของคนนี้หรือเอ่ยชื่อ */
  const orgIds = [...affiliations.map((a) => a.org_id), ...participations.map((p) => p.org_id), ...interactions.map((i) => i.org_id)]
    .filter((x): x is string => Boolean(x));
  const refs = new Set<string>([...affiliations.map((a) => a.id), ...participations.map((p) => p.id), ...interactions.map((i) => i.id), ...relRows.map((x) => x.id)]);
  const orgName = new Map<string, string>();
  for (const a of [...affiliations, ...participations, ...interactions]) if (a.org_id && a.org) orgName.set(String(a.org_id), String(a.org));
  const aiGenerated = (await storedBriefsAbout(T, orgIds, refs, String(person.name ?? "")))
    .map((b) => ({ org: orgName.get(b.orgId) ?? b.orgId, source: b.source === "ai" ? "AI" : "สูตร (ไม่ใช้ AI)", model: b.model, createdAt: b.createdAt, sentences: b.sentences }));

  /* ใครเปิดดูช่องทางติดต่อ/ทำอะไรกับคนนี้ — activity_log เก็บรหัสคนในรายละเอียด */
  const accessLog = (await all<{ action: string; actor: string; at: string }>(
    `SELECT action, actor, at FROM activity_log WHERE tenant_id = ? AND (${ids.map(() => "detail LIKE ?").join(" OR ")}) ORDER BY at`,
    T, ...ids.map((i) => `%${i}%`))).map((a) => ({ action: a.action, by: a.actor, at: a.at }));

  const ret = (await retentionForPeople(T, { clearance: "restricted_high" }, now)).find((p) => ids.includes(p.customerId));

  const reviewBeforeSending = [
    interactions.some((i) => i.summary) ? `บันทึกปฏิสัมพันธ์ ${interactions.filter((i) => i.summary).length} รายการเป็นข้อความอิสระ — อาจมีชื่อหรือข้อมูลของคนอื่น` : "",
    tasks.length ? `งาน ${tasks.length} รายการเป็นข้อความอิสระ — ตรวจชื่อคนอื่นในหัวข้อและผลงาน` : "",
    relationships.some((x) => x.other === "บุคคลอื่น") ? "ความสัมพันธ์กับบุคคลอื่นถูกแทนชื่อแล้ว — ตรวจว่าบริบท (context) ไม่ระบุตัวเขา" : "",
    aiGenerated.length ? "ประโยคจากสรุป AI อาจเอ่ยถึงคนอื่นในบริษัทเดียวกัน — ตัดส่วนที่ไม่ใช่ข้อมูลของผู้ขอ" : "",
    "ข้อมูลภายในที่เปิดเผยแล้วกระทบสิทธิของผู้อื่นหรือความลับทางการค้า ปฏิเสธเฉพาะส่วนได้ — บันทึกเหตุผลตอนปิดคำขอ",
  ].filter(Boolean);

  const report: SubjectReport = {
    request: { ref: r.ref, kind: DSAR_KIND_TH[r.kind], receivedAt: r.receivedAt, dueAt: r.dueAt },
    generatedAt: now.toISOString(), generatedBy: actor,
    person: clean(person), mergedIds: ids.slice(1), profile, contacts,
    affiliations: affiliations.map(({ id: _i, org_id: _o, ...a }) => clean(a)),
    participations: participations.map(({ id: _i, org_id: _o, ...p }) => clean(p)),
    interactions: interactions.map(({ id: _i, org_id: _o, ...x }) => clean(x)),
    relationships, preferences, purposes: purposes.map(clean), sources: sources.map(clean), campaigns: campaigns.map(clean),
    tasks: tasks.map(clean), opportunities: opportunities.map(clean), fieldHistory: fieldHistory.map(clean),
    retail: { purchases: retail.purchases.map(clean), events: retail.events.map(clean), consents: retail.consents.map(clean),
      memberships: retail.memberships.map(clean), messages: retail.messages.map(clean) },
    aiGenerated, accessLog,
    retention: ret ? clean({ status: ret.status, dueAt: ret.dueAt, purposes: ret.purposes.map((p) => clean({ purpose: p.purpose, days: p.days, trigger: p.trigger, dueAt: p.dueAt, legalHold: p.legalHold || null })) }) : null,
    reviewBeforeSending,
  };
  await run("UPDATE dsar_requests SET report_at = ? WHERE tenant_id = ? AND id = ?", now.toISOString(), T, id);
  // บันทึกว่าสร้างรายงาน ไม่บันทึกเนื้อหา — log ที่มีข้อมูลของผู้ขออยู่ข้างในคือการรั่วอีกทาง
  await logActivity(T, actor, "dsar_report", `${r.ref} · ${sid}`);
  return { ok: true, report };
}

/* ── ปิดคำขอ ─────────────────────────────────────────────────────

   done: ทำตามชนิดจริงในคำขอเดียวกัน
     erase → deleteCustomer (เหตุ "ตามคำขอ" + เลขเรื่อง → ทะเบียนการลบ)
     withdraw/object/restrict → บันทึกความต้องการ (ยกเลิกงานติดต่อที่ค้างทันที)
     access/portability → ต้องสร้างรายงานแล้ว · rectify → บันทึกว่าแก้อะไร
     ไม่พบผู้ขอในระบบ → ปิดได้เลยพร้อมบันทึกว่าแจ้งผู้ขอแล้วว่าไม่มีข้อมูล
   rejected: ต้องมีเหตุผล (เช่น ยืนยันตัวตนไม่ได้ · มีหน้าที่ตามกฎหมายต้องเก็บ) */
export async function closeRequest(
  tenantId: string, id: string,
  input: { outcome: string; note: string; purposeId?: string | null },
  actor: string, now = new Date(),
): Promise<Result<{ effect: string }>> {
  const r = await getRequest(tenantId, id, now);
  if (!r) return { ok: false, error: "ไม่พบคำขอนี้" };
  if (r.status !== "open") return { ok: false, error: "คำขอนี้ปิดแล้ว" };
  const note = input.note.trim().slice(0, 1000);
  if (input.outcome !== "done" && input.outcome !== "rejected") return { ok: false, error: "เลือกผล: ดำเนินการแล้ว หรือ ปฏิเสธ" };

  let effect = "";
  if (input.outcome === "rejected") {
    if (note.length < 10) return { ok: false, error: "ปฏิเสธต้องมีเหตุผลที่แจ้งผู้ขอได้ (อย่างน้อย 10 ตัวอักษร)" };
    effect = "ปฏิเสธ";
  } else if (!r.subjectId || r.subjectGone) {
    if (note.length < 5) return { ok: false, error: "บันทึกว่าแจ้งผู้ขออย่างไร (เช่น ตอบอีเมลว่าไม่มีข้อมูลในระบบ)" };
    effect = r.subjectGone ? "ไม่มีข้อมูลเหลือในระบบแล้ว" : "ไม่พบข้อมูลของผู้ขอในระบบ";
  } else {
    if (!r.verifiedAt) return { ok: false, error: "ยืนยันตัวตนผู้ขอก่อน — ทำตามคำขอโดยไม่ยืนยันอาจเปิดเผยหรือลบข้อมูลของคนผิด" };
    switch (r.kind) {
      case "access":
      case "portability":
        if (!r.reportAt) return { ok: false, error: "สร้างรายงานข้อมูลของผู้ขอก่อนปิดคำขอ" };
        if (note.length < 5) return { ok: false, error: "บันทึกว่าส่งรายงานให้ผู้ขอทางไหน เมื่อไร" };
        effect = "ส่งรายงานแล้ว";
        break;
      case "rectify":
        if (note.length < 5) return { ok: false, error: "บันทึกว่าแก้อะไร (ค่าเดิม → ค่าใหม่ ไม่ต้องใส่เบอร์หรืออีเมลเต็ม)" };
        effect = "แก้ไขแล้ว";
        break;
      case "withdraw":
      case "object":
      case "restrict": {
        const kind = r.kind === "withdraw" ? "withdrawal" : r.kind === "object" ? "objection" : "restriction";
        const res = await recordPreference(tenantId, r.subjectId,
          { kind, purposeId: input.purposeId || null, evidence: `คำขอสิทธิ ${r.ref} รับเมื่อ ${r.receivedAt}${note ? ` · ${note.slice(0, 200)}` : ""}` }, actor);
        if (!res.ok) return { ok: false, error: res.error };
        effect = `บันทึก${DSAR_KIND_TH[r.kind]}แล้ว · ยกเลิกงานติดต่อที่ค้าง ${res.cancelled} รายการ`;
        break;
      }
      case "erase": {
        const res = await deleteCustomer(tenantId, r.subjectId, actor, { reason: "request", requestRef: r.ref });
        if (!res.ok) return { ok: false, error: res.error };
        effect = "ลบข้อมูลแล้ว · อีเมล/เบอร์อยู่ในทะเบียนการลบ";
        break;
      }
    }
  }
  await run("UPDATE dsar_requests SET status = ?, outcome_note = ?, closed_at = ?, closed_by = ? WHERE tenant_id = ? AND id = ? AND status = 'open'",
    input.outcome, [effect, note].filter(Boolean).join(" — ").slice(0, 1200), now.toISOString(), actor, tenantId, id);
  await logActivity(tenantId, actor, `dsar_${input.outcome}`, `${r.ref} · ${r.kind}`);
  return { ok: true, effect };
}
