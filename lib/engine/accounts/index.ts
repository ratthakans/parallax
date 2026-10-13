import { all, get } from "@/lib/engine/sql";
import { rowFactsFor } from "@/lib/engine/vault/evidence";
import { orgIdFor } from "@/lib/engine/vault/resolve";
import { orgInfo } from "@/lib/shared/identity";
import { canSee, type InteractionKind, type RelationshipType } from "@/lib/shared/accounts";
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

const LIST_SQL = `SELECT o.id, o.name, o.primary_domain, o.lifecycle_state, o.account_owner_id, o.classification,
    (SELECT COUNT(DISTINCT a.customer_id) FROM affiliations a WHERE a.tenant_id = o.tenant_id AND a.org_id = o.id) AS people,
    (SELECT COUNT(DISTINCT a.customer_id) FROM affiliations a WHERE a.tenant_id = o.tenant_id AND a.org_id = o.id AND a.valid_to IS NULL) AS cur,
    (SELECT MAX(i.occurred_at) FROM interactions i WHERE i.tenant_id = o.tenant_id AND i.org_id = o.id) AS last_at
  FROM orgs o WHERE o.tenant_id = ?`;

export async function listAccounts(
  tenantId: string, opts: { q?: string; mine?: string; limit?: number; offset?: number } = {},
): Promise<{ rows: AccountRow[]; total: number }> {
  const where: string[] = [];
  const params: (string | number)[] = [tenantId];
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
  }>(`${LIST_SQL}${extra} ORDER BY cur DESC, o.name LIMIT ? OFFSET ?`, ...params, opts.limit ?? 50, opts.offset ?? 0);
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
  }[];
  relationships: {
    id: string; type: RelationshipType; fromKind: string; fromId: string; fromName: string; toKind: string; toId: string; toName: string;
    context: string | null; confirmedBy: string | null; confirmedAt: string | null; validFrom: string | null; validTo: string | null;
    lifecycle: string; evidenceNote: string | null;
  }[];
  interactions: {
    id: string; kind: InteractionKind; occurredAt: string; personId: string | null; personName: string | null;
    summary: string | null; outcome: string | null; owner: string | null; classification: Classification; masked: boolean; recordedAt: string;
  }[];
  participations: { id: string; personName: string | null; program: string; edition: string | null; role: string; occurredAt: string | null }[];
  opportunities: { id: string; name: string; stage: string; owner: string | null; expectedClose: string | null }[];
  versions: Record<string, Version[]>;
};

export async function getDossier(tenantId: string, orgId: string, viewer: Viewer): Promise<Dossier | null> {
  const o = await get<Record<string, string | null>>("SELECT * FROM orgs WHERE tenant_id = ? AND id = ?", tenantId, orgId);
  if (!o) return null;
  const classification = (o.classification ?? "confidential") as Classification;
  const owners = [o.account_owner_id, o.data_owner_id].filter(Boolean);
  const masked = !canSee(viewer.clearance, classification) && !owners.includes(viewer.id);
  const org: Dossier["org"] = {
    id: o.id!, name: o.name!, nameEn: o.name_en, nameNorm: o.name_norm!, taxId: o.tax_id, branchCode: o.branch_code,
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
      valid_to: string | null; confirmed_by: string | null; recorded_at: string }>(
      `SELECT a.id, a.customer_id, c.name, a.title, a.department, a.valid_from, a.valid_to, a.confirmed_by, a.recorded_at
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
      `SELECT i.*, c.name AS person_name FROM interactions i LEFT JOIN customers c ON c.id = i.customer_id AND c.tenant_id = i.tenant_id
       WHERE i.tenant_id = ? AND i.org_id = ? ORDER BY i.occurred_at DESC, i.recorded_at DESC LIMIT 200`, tenantId, orgId),
    all<Record<string, string | null>>(
      `SELECT p.id, p.program, p.edition, p.role, p.occurred_at, c.name AS person_name FROM participations p
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

  const peopleById = new Map(affs.map((a) => [a.customer_id, a.name]));
  const nameOf = async (kind: string | null, id: string | null): Promise<string> => {
    if (!kind || !id) return "ไม่ทราบ";
    if (kind === "org") return id === orgId ? o.name! : (await get<{ name: string }>("SELECT name FROM orgs WHERE tenant_id = ? AND id = ?", tenantId, id))?.name ?? "ไม่ทราบ";
    return peopleById.get(id) ?? (await get<{ name: string }>("SELECT name FROM customers WHERE tenant_id = ? AND id = ?", tenantId, id))?.name ?? "ไม่ทราบ";
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
    people: affs.map((a) => ({
      affiliationId: a.id, personId: a.customer_id, name: a.name, title: a.title, department: a.department,
      from: a.valid_from, to: a.valid_to, current: a.valid_to == null, confirmedBy: a.confirmed_by, recordedAt: a.recorded_at,
      rows: rowsByPerson.get(a.customer_id) ?? [],
    })),
    relationships: await Promise.all(rels.map(async (r) => ({
      id: r.id!, type: r.type as RelationshipType, fromKind: r.from_kind!, fromId: r.from_id!, fromName: await nameOf(r.from_kind, r.from_id),
      toKind: r.to_kind!, toId: r.to_id!, toName: await nameOf(r.to_kind, r.to_id), context: r.context, confirmedBy: r.confirmed_by,
      confirmedAt: r.confirmed_at, validFrom: r.valid_from, validTo: r.valid_to, lifecycle: r.lifecycle_state ?? "pending_review",
      evidenceNote: r.evidence_note,
    }))),
    interactions: inter.map((i) => {
      const c = (i.classification ?? "confidential") as Classification;
      const hidden = !canSee(viewer.clearance, c) && i.owner_id !== viewer.id;
      return {
        id: i.id!, kind: i.kind as InteractionKind, occurredAt: i.occurred_at!, personId: i.customer_id, personName: i.person_name,
        summary: hidden ? null : i.summary, outcome: hidden ? null : i.outcome, owner: i.owner_id, classification: c, masked: hidden,
        recordedAt: i.recorded_at!,
      };
    }),
    participations: parts.map((p) => ({ id: p.id!, personName: p.person_name, program: p.program!, edition: p.edition, role: p.role!, occurredAt: p.occurred_at })),
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
