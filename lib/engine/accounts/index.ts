import { all, get } from "@/lib/engine/sql";
import { rowFactsFor } from "@/lib/engine/vault/evidence";
import { orgIdFor } from "@/lib/engine/vault/resolve";
import { orgInfo } from "@/lib/shared/identity";
import { CLEARANCE_RANK, canSee, type InteractionKind, type RelationshipType } from "@/lib/shared/accounts";
import type { Classification } from "@/lib/shared/vault";

/* ── แฟ้มบริษัท (docs/plan.md B4 · Blueprint 2.0 บท 2–3) ─────────────────

   "แฟ้มบริษัทตามเวลา — คนในบริษัท บทบาท ช่วงเวลา และความสัมพันธ์ที่ยืนยันพร้อมผู้ยืนยัน
    ช่องที่ไม่ทราบแสดงว่าไม่ทราบ" · "หลักฐานทุกค่า — กดค่าใดก็ได้ เห็นแหล่ง (ไฟล์ แถว) เวลาที่บันทึก
    เวลาตรวจล่าสุด และประวัติรุ่น" (plan หัวข้อ 3.5 ข้อ 1–2)

   หลักฐานของค่าที่มาจากไฟล์ = แถวต้นทางที่ชื่อบริษัทในแถวชี้มาที่องค์กรนี้ (ผ่านกุญแจเดียวกับตอนตรวจตัวตน)
   ค่าที่คนแก้ = รุ่นใน record_versions พร้อมผู้แก้และเหตุผล · ไม่มีหลักฐาน = แสดงว่าไม่ทราบ ไม่เติมเอง
   ช่องทางติดต่อไม่ออกจากหน้านี้ในรูปเต็ม · รายการที่ระดับเกินสิทธิ์ผู้อ่านถูกปิดบัง */

export type Viewer = { id: string; clearance: Classification };

export type RowRef = { batchId: string; file: string; line: number; source: string | null; recordedAt: string; asWritten: string };
export type Version = { field: string; oldValue: string | null; newValue: string | null; reason: string; by: string; at: string };

export type AccountRow = {
  id: string; name: string; domain: string | null; people: number; current: number; lifecycle: string;
  owner: string | null; lastInteraction: string | null; classification: Classification;
};

/* ยอดต่อบริษัทรวมครั้งเดียวทั้งบัญชี (GROUP BY) แล้ว join — เดิมเป็น subquery ต่อแถว ซึ่งการเรียงตามจำนวนคน
   บังคับให้คำนวณทุกบริษัทที่ตรงคำค้น: ค้น "บริษัท" ที่ข้อมูล 100,000 แถวใช้ 18–79 วินาที (verify:load) · พารามิเตอร์: tenant × 3 */
const LIST_SQL = `SELECT o.id, o.name, o.primary_domain, o.lifecycle_state, o.account_owner_id, o.classification,
    COALESCE(a.people, 0) AS people, COALESCE(a.cur, 0) AS cur, i.last_at
  FROM orgs o
  LEFT JOIN (SELECT org_id, COUNT(DISTINCT customer_id) AS people,
      COUNT(DISTINCT CASE WHEN valid_to IS NULL THEN customer_id END) AS cur
    FROM affiliations WHERE tenant_id = ? GROUP BY org_id) a ON a.org_id = o.id
  LEFT JOIN (SELECT org_id, MAX(occurred_at) AS last_at FROM interactions WHERE tenant_id = ? AND org_id IS NOT NULL GROUP BY org_id) i ON i.org_id = o.id
  WHERE o.tenant_id = ?`;

/* ชื่อแทนคนที่ระดับความลับเกินสิทธิ์ผู้อ่าน — ไม่แสดงชื่อ ตำแหน่ง หรือแถวต้นทาง และไม่ส่งให้ AI */
export const MASKED_PERSON = "บุคคลที่จำกัดการเข้าถึง";
export const MASKED_ORG = "บริษัทที่จำกัดการเข้าถึง";

/* ระดับที่ผู้อ่านเห็นได้ — ใช้กรองใน SQL ให้ทั้งรายการและตัวนับไม่เผยว่ามีบริษัทที่ถูกจำกัด (plan 9.1) */
const visibleLevels = (clearance: Classification) =>
  (Object.keys(CLEARANCE_RANK) as Classification[]).filter((c) => canSee(clearance, c));

export async function listAccounts(
  tenantId: string, opts: { q?: string; mine?: string; limit?: number; offset?: number; viewer?: Viewer } = {},
): Promise<{ rows: AccountRow[]; total: number }> {
  const where: string[] = [];
  const params: (string | number)[] = [tenantId];
  if (opts.viewer) {
    const levels = visibleLevels(opts.viewer.clearance);
    where.push(`(COALESCE(o.classification, 'confidential') IN (${levels.map(() => "?").join(",")}) OR o.account_owner_id = ? OR o.data_owner_id = ?)`);
    params.push(...levels, opts.viewer.id, opts.viewer.id);
  }
  if (opts.q?.trim()) {
    where.push("(o.name LIKE ? OR o.name_en LIKE ? OR o.primary_domain LIKE ?)");
    const like = `%${opts.q.trim()}%`;
    params.push(like, like, like);
  }
  if (opts.mine) { where.push("o.account_owner_id = ?"); params.push(opts.mine); }
  const extra = where.length ? ` AND ${where.join(" AND ")}` : "";
  const total = await get<{ n: number | string }>(`SELECT COUNT(*) AS n FROM orgs o WHERE o.tenant_id = ?${extra}`, ...params);
  const rows = await all<{
    id: string; name: string; primary_domain: string | null; lifecycle_state: string; account_owner_id: string | null;
    classification: Classification; people: number | string; cur: number | string; last_at: string | null;
  }>(`${LIST_SQL}${extra} ORDER BY cur DESC, o.name LIMIT ? OFFSET ?`, tenantId, tenantId, ...params, opts.limit ?? 50, opts.offset ?? 0);
  return {
    total: Number(total?.n ?? 0),
    rows: rows.map((r) => ({
      id: r.id, name: r.name, domain: r.primary_domain, people: Number(r.people), current: Number(r.cur),
      lifecycle: r.lifecycle_state, owner: r.account_owner_id, lastInteraction: r.last_at, classification: r.classification,
    })),
  };
}

export type Dossier = {
  org: {
    id: string; name: string; nameEn: string | null; nameNorm: string; taxId: string | null; branchCode: string | null;
    industry: string | null; primaryDomain: string | null; classification: Classification; lifecycle: string;
    accountOwner: string | null; dataOwner: string | null; createdAt: string; recordedAt: string | null; lastVerifiedAt: string | null;
  };
  /** ระดับของบริษัทเกินสิทธิ์ผู้อ่าน — เห็นแค่ชื่อและเหตุผลที่ปิด */
  masked: boolean;
  parent: { id: string; name: string } | null;
  subsidiaries: { id: string; name: string }[];
  domains: { domain: string; rows: RowRef[] }[];
  /** ชื่อตามที่เขียนในไฟล์ ต่างกันได้ (ไทย/อังกฤษ/ตัวย่อ) — หลักฐานของชื่อ */
  namesAsWritten: { name: string; rows: RowRef[] }[];
  people: {
    affiliationId: string; personId: string; name: string; title: string | null; department: string | null;
    from: string | null; to: string | null; current: boolean; confirmedBy: string | null; recordedAt: string; rows: RowRef[];
    /** ระดับของคนเกินสิทธิ์ผู้อ่าน — ชื่อ ตำแหน่ง และแถวต้นทางถูกซ่อน */
    masked: boolean;
  }[];
  relationships: {
    id: string; type: RelationshipType; fromKind: string; fromId: string; fromName: string; toKind: string; toId: string; toName: string;
    context: string | null; confirmedBy: string | null; confirmedAt: string | null; validFrom: string | null; validTo: string | null;
    lifecycle: string; evidenceNote: string | null;
    /** ปลายด้านใดด้านหนึ่งเกินสิทธิ์ผู้อ่าน */
    masked: boolean;
  }[];
  interactions: {
    id: string; kind: InteractionKind; occurredAt: string; personId: string | null; personName: string | null; personMasked: boolean;
    summary: string | null; outcome: string | null; owner: string | null; classification: Classification; masked: boolean; recordedAt: string;
  }[];
  participations: { id: string; personName: string | null; program: string; edition: string | null; role: string; occurredAt: string | null; masked: boolean }[];
  opportunities: { id: string; name: string; stage: string; owner: string | null; expectedClose: string | null }[];
  versions: Record<string, Version[]>;
};

/* ── ใครแก้แฟ้มบริษัทนี้ได้ ──
   กติกาเดียวกับการเปิดแฟ้ม (getDossier): ระดับสิทธิ์ถึง หรือเป็นเจ้าของบัญชี/เจ้าของข้อมูล
   ยกเว้น "รับเป็นเจ้าของ" ซึ่งต้องมีระดับสิทธิ์ถึงจริง — ไม่งั้นการรับเป็นเจ้าของคือทางลัดเปิดแฟ้มที่ถูกปิดบัง
   ตรวจทุก action ที่แก้แฟ้ม เพราะ Server Action ยิงตรงได้โดยไม่ผ่านหน้าจอ */
export async function orgAccess(
  tenantId: string, orgId: string, viewer: Viewer, intent: "edit" | "claim" = "edit",
): Promise<{ ok: true } | { ok: false; error: string }> {
  const o = await get<{ classification: string | null; account_owner_id: string | null; data_owner_id: string | null }>(
    "SELECT classification, account_owner_id, data_owner_id FROM orgs WHERE tenant_id = ? AND id = ?", tenantId, orgId);
  if (!o) return { ok: false, error: "ไม่พบบริษัทนี้" };
  if (canSee(viewer.clearance, (o.classification ?? "confidential") as Classification)) return { ok: true };
  const owner = [o.account_owner_id, o.data_owner_id].includes(viewer.id);
  if (intent === "edit" && owner) return { ok: true };
  return { ok: false, error: "แฟ้มนี้อยู่ในระดับความลับที่สูงกว่าสิทธิ์ของคุณ — ขอให้เจ้าของบัญชีหรือผู้ดูแลมอบหมาย" };
}

export async function getDossier(tenantId: string, orgId: string, viewer: Viewer): Promise<Dossier | null> {
  const o = await get<Record<string, string | null>>("SELECT * FROM orgs WHERE tenant_id = ? AND id = ?", tenantId, orgId);
  if (!o) return null;
  const classification = (o.classification ?? "confidential") as Classification;
  const owners = [o.account_owner_id, o.data_owner_id].filter(Boolean);
  const masked = !canSee(viewer.clearance, classification) && !owners.includes(viewer.id);
  const org: Dossier["org"] = {
    id: o.id!, name: masked ? MASKED_ORG : o.name!, nameEn: masked ? null : o.name_en, nameNorm: o.name_norm!, taxId: o.tax_id, branchCode: o.branch_code,
    industry: o.industry, primaryDomain: o.primary_domain, classification, lifecycle: o.lifecycle_state ?? "received",
    accountOwner: o.account_owner_id, dataOwner: o.data_owner_id, createdAt: o.created_at!, recordedAt: o.recorded_at,
    lastVerifiedAt: o.last_verified_at,
  };
  const empty: Dossier = {
    org, masked, parent: null, subsidiaries: [], domains: [], namesAsWritten: [], people: [], relationships: [],
    interactions: [], participations: [], opportunities: [], versions: {},
  };
  if (masked) return empty;

  const [parent, subs, domains, affs, rels, inter, parts, opps, versions, aliases] = await Promise.all([
    o.parent_id ? get<{ id: string; name: string }>("SELECT id, name FROM orgs WHERE tenant_id = ? AND id = ?", tenantId, o.parent_id) : null,
    all<{ id: string; name: string }>("SELECT id, name FROM orgs WHERE tenant_id = ? AND parent_id = ? ORDER BY name", tenantId, orgId),
    all<{ domain: string }>("SELECT domain FROM org_domains WHERE tenant_id = ? AND org_id = ? ORDER BY domain", tenantId, orgId),
    all<{ id: string; customer_id: string; name: string; title: string | null; department: string | null; valid_from: string | null;
      valid_to: string | null; confirmed_by: string | null; recorded_at: string; person_class: Classification | null }>(
      `SELECT a.id, a.customer_id, c.name, c.classification AS person_class, a.title, a.department, a.valid_from, a.valid_to, a.confirmed_by, a.recorded_at
       FROM affiliations a JOIN customers c ON c.id = a.customer_id AND c.tenant_id = a.tenant_id
       WHERE a.tenant_id = ? AND a.org_id = ? ORDER BY (a.valid_to IS NULL) DESC, a.valid_from DESC, c.name`, tenantId, orgId),
    all<Record<string, string | null>>(
      `SELECT r.*, e.note AS evidence_note FROM relationship_assertions r LEFT JOIN evidence e ON e.id = r.evidence_id AND e.tenant_id = r.tenant_id
       WHERE r.tenant_id = ? AND (
         (r.from_kind = 'org' AND r.from_id = ?) OR (r.to_kind = 'org' AND r.to_id = ?)
         OR (r.from_kind = 'person' AND r.from_id IN (SELECT customer_id FROM affiliations WHERE tenant_id = ? AND org_id = ?))
         OR (r.to_kind = 'person' AND r.to_id IN (SELECT customer_id FROM affiliations WHERE tenant_id = ? AND org_id = ?)))
       ORDER BY r.recorded_at DESC`, tenantId, orgId, orgId, tenantId, orgId, tenantId, orgId),
    all<Record<string, string | null>>(
      `SELECT i.*, c.name AS person_name, c.classification AS person_class FROM interactions i LEFT JOIN customers c ON c.id = i.customer_id AND c.tenant_id = i.tenant_id
       WHERE i.tenant_id = ? AND i.org_id = ? ORDER BY i.occurred_at DESC, i.recorded_at DESC LIMIT 200`, tenantId, orgId),
    all<Record<string, string | null>>(
      `SELECT p.id, p.program, p.edition, p.role, p.occurred_at, c.name AS person_name, c.classification AS person_class FROM participations p
       LEFT JOIN customers c ON c.id = p.customer_id AND c.tenant_id = p.tenant_id
       WHERE p.tenant_id = ? AND p.org_id = ? ORDER BY p.occurred_at DESC`, tenantId, orgId),
    all<Record<string, string | null>>(
      "SELECT id, name, stage, owner_id, expected_close FROM opportunities WHERE tenant_id = ? AND org_id = ? ORDER BY updated_at DESC", tenantId, orgId),
    all<{ field: string; old_value: string | null; new_value: string | null; reason: string; changed_by: string; recorded_at: string }>(
      `SELECT field, old_value, new_value, reason, changed_by, recorded_at FROM record_versions
       WHERE tenant_id = ? AND record_kind = 'org' AND record_id = ? ORDER BY recorded_at DESC, id DESC`, tenantId, orgId),
    all<{ a_id: string }>("SELECT a_id FROM resolution_overrides WHERE tenant_id = ? AND kind = 'org_alias' AND b_id = ?", tenantId, orgId),
  ]);

  // ── หลักฐานจากแถวต้นทาง ──
  const personIds = [...new Set(affs.map((a) => a.customer_id))];
  const keys = new Set([o.name_norm!, ...aliases.map((a) => a.a_id)]);
  const matchesOrg = (company?: string) => {
    const k = orgInfo(company).key;
    return Boolean(k) && (keys.has(k) || orgIdFor(tenantId, k) === orgId);
  };
  const rowsByPerson = new Map<string, RowRef[]>();
  const nameRows = new Map<string, RowRef[]>();
  const domainRows = new Map<string, RowRef[]>();
  for (const r of await rowFactsFor(tenantId, personIds)) {
    if (!matchesOrg(r.company)) continue;
    const ref: RowRef = { batchId: r.batchId, file: r.file, line: r.line, source: r.source, recordedAt: r.recordedAt, asWritten: r.company };
    rowsByPerson.set(r.customerId, [...(rowsByPerson.get(r.customerId) ?? []), { ...ref, asWritten: r.title }]);
    nameRows.set(ref.asWritten, [...(nameRows.get(ref.asWritten) ?? []), ref]);
    if (r.domain) domainRows.set(r.domain, [...(domainRows.get(r.domain) ?? []), { ...ref, asWritten: r.domain }]);
  }

  /* คนก็มีระดับความลับของตัวเอง — แฟ้มบริษัทระดับลับที่มีคนระดับจำกัดสูงต้องไม่เผยชื่อเขา */
  const hiddenPerson = (c: string | null | undefined) => !canSee(viewer.clearance, (c ?? "confidential") as Classification);
  const peopleById = new Map(affs.map((a) => [a.customer_id, hiddenPerson(a.person_class) ? MASKED_PERSON : a.name]));
  const nameOf = async (kind: string | null, id: string | null): Promise<string> => {
    if (!kind || !id) return "ไม่ทราบ";
    if (kind === "member") return id; // สมาชิกทีม — รหัสเดียวกับเจ้าของบัญชีและผู้รับผิดชอบงาน
    if (kind === "org") {
      if (id === orgId) return o.name!;
      const other = await get<{ name: string; classification: string | null }>("SELECT name, classification FROM orgs WHERE tenant_id = ? AND id = ?", tenantId, id);
      return !other ? "ไม่ทราบ" : canSee(viewer.clearance, (other.classification ?? "confidential") as Classification) ? other.name : MASKED_ORG;
    }
    if (peopleById.has(id)) return peopleById.get(id)!;
    const c = await get<{ name: string; classification: string | null }>("SELECT name, classification FROM customers WHERE tenant_id = ? AND id = ?", tenantId, id);
    return !c ? "ไม่ทราบ" : hiddenPerson(c.classification) ? MASKED_PERSON : c.name;
  };
  const groupedVersions: Record<string, Version[]> = {};
  for (const v of versions) {
    (groupedVersions[v.field] ??= []).push({ field: v.field, oldValue: v.old_value, newValue: v.new_value, reason: v.reason, by: v.changed_by, at: v.recorded_at });
  }

  return {
    org, masked,
    parent: parent ?? null,
    subsidiaries: subs,
    domains: domains.map((d) => ({ domain: d.domain, rows: domainRows.get(d.domain) ?? [] })),
    namesAsWritten: [...nameRows].sort((a, b) => b[1].length - a[1].length).map(([name, rows]) => ({ name, rows })),
    people: affs.map((a) => {
      const hidden = hiddenPerson(a.person_class);
      return {
        affiliationId: a.id, personId: a.customer_id, name: hidden ? MASKED_PERSON : a.name, title: hidden ? null : a.title,
        department: hidden ? null : a.department, from: a.valid_from, to: a.valid_to, current: a.valid_to == null,
        confirmedBy: a.confirmed_by, recordedAt: a.recorded_at, rows: hidden ? [] : rowsByPerson.get(a.customer_id) ?? [], masked: hidden,
      };
    }),
    relationships: await Promise.all(rels.map(async (r) => ({
      id: r.id!, type: r.type as RelationshipType, fromKind: r.from_kind!, fromId: r.from_id!, fromName: await nameOf(r.from_kind, r.from_id),
      toKind: r.to_kind!, toId: r.to_id!, toName: await nameOf(r.to_kind, r.to_id), context: r.context, confirmedBy: r.confirmed_by,
      confirmedAt: r.confirmed_at, validFrom: r.valid_from, validTo: r.valid_to, lifecycle: r.lifecycle_state ?? "pending_review",
      evidenceNote: r.evidence_note,
    }))).then((rs) => rs.map((r) => ({ ...r, masked: r.fromName === MASKED_PERSON || r.toName === MASKED_PERSON || r.fromName === MASKED_ORG || r.toName === MASKED_ORG }))),
    interactions: inter.map((i) => {
      const c = (i.classification ?? "confidential") as Classification;
      const hidden = !canSee(viewer.clearance, c) && i.owner_id !== viewer.id;
      const personHidden = Boolean(i.customer_id) && hiddenPerson(i.person_class);
      return {
        id: i.id!, kind: i.kind as InteractionKind, occurredAt: i.occurred_at!, personId: i.customer_id,
        personName: personHidden ? MASKED_PERSON : i.person_name, personMasked: personHidden,
        summary: hidden ? null : i.summary, outcome: hidden ? null : i.outcome, owner: i.owner_id, classification: c, masked: hidden,
        recordedAt: i.recorded_at!,
      };
    }),
    participations: parts.map((p) => {
      const hidden = hiddenPerson(p.person_class);
      return { id: p.id!, personName: hidden ? MASKED_PERSON : p.person_name, program: p.program!, edition: p.edition, role: p.role!, occurredAt: p.occurred_at, masked: hidden };
    }),
    opportunities: opps.map((p) => ({ id: p.id!, name: p.name!, stage: p.stage!, owner: p.owner_id, expectedClose: p.expected_close })),
    versions: groupedVersions,
  };
}

/** ช่องที่ไม่ทราบ — แสดงตามจริง ไม่เติมด้วยคะแนนหรือการเดา */
export function unknownsOf(d: Dossier): string[] {
  const out: string[] = [];
  if (!d.org.industry) out.push("อุตสาหกรรม");
  if (!d.org.taxId) out.push("เลขประจำตัวผู้เสียภาษี");
  if (!d.org.primaryDomain && !d.domains.length) out.push("โดเมนอีเมล");
  if (!d.org.accountOwner) out.push("เจ้าของบัญชี");
  if (!d.people.some((p) => p.current)) out.push("คนที่ยังสังกัดอยู่");
  if (d.people.some((p) => p.current && !p.title)) out.push("ตำแหน่งของบางคน");
  if (!d.relationships.some((r) => r.confirmedBy)) out.push("ผู้ตัดสินใจและความสัมพันธ์ที่ยืนยันแล้ว");
  if (!d.interactions.length) out.push("ประวัติการติดต่อ");
  if (!d.opportunities.length) out.push("โอกาสขายที่เปิดอยู่");
  return out;
}

/** ตัวเลือกบริษัทอื่นสำหรับฟอร์ม (บริษัทแม่ · ความสัมพันธ์ระหว่างบริษัท) — จำกัดจำนวนเพื่อไม่ให้หน้าหนัก */
export async function orgOptions(tenantId: string, excludeId: string, limit = 500) {
  return all<{ id: string; name: string }>(
    "SELECT id, name FROM orgs WHERE tenant_id = ? AND id <> ? ORDER BY name LIMIT ?", tenantId, excludeId, limit,
  );
}
