import { randomUUID } from "node:crypto";
import { get, tx, type Sql } from "@/lib/engine/sql";
import { logActivity } from "@/lib/engine/db";
import {
  INTERACTION_KINDS, MEMBER_RELATIONSHIP_TYPES, ORG_EDITABLE, RELATIONSHIP_ENDS, RELATIONSHIP_TYPES, canSee,
  type InteractionKind, type MemberRelationshipType, type OrgEditable, type RelationshipType,
} from "@/lib/shared/accounts";
import { CLASSIFICATIONS, type Classification } from "@/lib/shared/vault";

/* ── แก้แฟ้มบริษัท (docs/plan.md B4) ─────────────────────────────

   ทุกการเปลี่ยนค่าเขียนรุ่นใน record_versions (ค่าเดิม · ค่าใหม่ · เหตุผล · ผู้แก้) ก่อนเปลี่ยนจริง ในธุรกรรมเดียว
   ความสัมพันธ์ที่บันทึกจากที่นี่คือคำยืนยันของคน: มีผู้ยืนยัน เวลา และหลักฐาน (evidence) เสมอ
   ไม่มีทางสร้างความสัมพันธ์ "ที่ระบบเดา" จากหน้านี้ */

export type EditResult = { ok: true } | { ok: false; error: string };
const now = () => new Date().toISOString();
const clean = (v: unknown, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");

async function version(q: Sql, tenantId: string, kind: "org" | "person" | "affiliation" | "relationship", id: string,
  field: string, oldValue: string | null, newValue: string | null, reason: string, actor: string) {
  await q.run(
    `INSERT INTO record_versions (tenant_id, record_kind, record_id, field, old_value, new_value, reason, changed_by, valid_from, recorded_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    tenantId, kind, id, field, oldValue, newValue, reason, actor, null, now(),
  );
}

async function orgExists(tenantId: string, orgId: string) {
  return get<Record<string, string | null>>("SELECT * FROM orgs WHERE tenant_id = ? AND id = ?", tenantId, orgId);
}

/* ค่าที่ขัดกับแหล่งข้อมูลต้องมีเหตุผล — ไม่บังคับยาว แต่ต้องมี */
export async function updateOrgField(
  tenantId: string, orgId: string, field: string, value: string, reason: string, actor: string,
): Promise<EditResult> {
  if (!(ORG_EDITABLE as readonly string[]).includes(field)) return { ok: false, error: "แก้ฟิลด์นี้จากแฟ้มไม่ได้" };
  const why = clean(reason, 200);
  if (!why) return { ok: false, error: "บอกเหตุผลหรือที่มาของค่านี้ (เช่น \"จากเว็บไซต์บริษัท\" หรือ \"ลูกค้าแจ้งในที่ประชุม\")" };
  const org = await orgExists(tenantId, orgId);
  if (!org) return { ok: false, error: "ไม่พบบริษัทนี้" };
  let next: string | null = clean(value, 200) || null;
  if (field === "tax_id" && next) {
    next = next.replace(/\D/g, "");
    if (next.length !== 13) return { ok: false, error: "เลขประจำตัวผู้เสียภาษีมี 13 หลัก" };
  }
  if (field === "primary_domain" && next) {
    next = next.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(next)) return { ok: false, error: "โดเมนไม่ถูกรูปแบบ เช่น example.co.th" };
  }
  const prev = org[field as OrgEditable] ?? null;
  if (prev === next) return { ok: true };
  await tx(async (q) => {
    await version(q, tenantId, "org", orgId, field, prev, next, why, actor);
    await q.run(`UPDATE orgs SET ${field} = ?, recorded_at = ? WHERE tenant_id = ? AND id = ?`, next, now(), tenantId, orgId);
  });
  await logActivity(tenantId, actor, "org_update", `${orgId} · ${field}`);
  return { ok: true };
}

export async function setParent(tenantId: string, orgId: string, parentId: string | null, reason: string, actor: string): Promise<EditResult> {
  const org = await orgExists(tenantId, orgId);
  if (!org) return { ok: false, error: "ไม่พบบริษัทนี้" };
  if (parentId) {
    if (parentId === orgId) return { ok: false, error: "บริษัทเป็นบริษัทแม่ของตัวเองไม่ได้" };
    if (!(await orgExists(tenantId, parentId))) return { ok: false, error: "ไม่พบบริษัทแม่ที่เลือก" };
    // กันวง: เดินขึ้นจากบริษัทแม่ที่เลือก ถ้าเจอตัวเองแปลว่าเป็นวง
    let cur: string | null = parentId;
    for (let i = 0; cur && i < 20; i++) {
      if (cur === orgId) return { ok: false, error: "เลือกแล้วจะเป็นวง (บริษัทลูกกลายเป็นบริษัทแม่ของตัวเอง)" };
      cur = (await get<{ parent_id: string | null }>("SELECT parent_id FROM orgs WHERE tenant_id = ? AND id = ?", tenantId, cur))?.parent_id ?? null;
    }
  }
  const why = clean(reason, 200);
  if (!why) return { ok: false, error: "บอกที่มาของความเป็นบริษัทในเครือ" };
  await tx(async (q) => {
    await version(q, tenantId, "org", orgId, "parent_id", org.parent_id, parentId, why, actor);
    await q.run("UPDATE orgs SET parent_id = ?, recorded_at = ? WHERE tenant_id = ? AND id = ?", parentId, now(), tenantId, orgId);
  });
  await logActivity(tenantId, actor, "org_parent", orgId);
  return { ok: true };
}

export async function setClassification(tenantId: string, orgId: string, level: string, actor: string): Promise<EditResult> {
  if (!(CLASSIFICATIONS as readonly string[]).includes(level)) return { ok: false, error: "ระดับความลับไม่ถูกต้อง" };
  const org = await orgExists(tenantId, orgId);
  if (!org) return { ok: false, error: "ไม่พบบริษัทนี้" };
  if (org.classification === level) return { ok: true };
  await tx(async (q) => {
    await version(q, tenantId, "org", orgId, "classification", org.classification, level, "เปลี่ยนระดับความลับ", actor);
    await q.run("UPDATE orgs SET classification = ? WHERE tenant_id = ? AND id = ?", level, tenantId, orgId);
    /* สรุปที่สร้างภายใต้ระดับเดิมไม่ใช้ต่อ (plan 9.2 ข้อ 2: เปลี่ยนสิทธิ์ = ล้าง cache ที่เกี่ยวข้อง) */
    await q.run("DELETE FROM account_briefs WHERE tenant_id = ? AND org_id = ?", tenantId, orgId);
  });
  await logActivity(tenantId, actor, "org_classification", `${orgId} · ${level}`);
  return { ok: true };
}

/** ยืนยันว่าข้อมูลบริษัทถูกต้อง ณ วันนี้ — บันทึกเวลาตรวจล่าสุด ไม่เปลี่ยนค่า */
export async function verifyOrg(tenantId: string, orgId: string, actor: string): Promise<EditResult> {
  const org = await orgExists(tenantId, orgId);
  if (!org) return { ok: false, error: "ไม่พบบริษัทนี้" };
  await tx(async (q) => {
    await version(q, tenantId, "org", orgId, "last_verified_at", org.last_verified_at, now(), "ยืนยันข้อมูลบริษัท", actor);
    await q.run("UPDATE orgs SET last_verified_at = ?, lifecycle_state = 'confirmed' WHERE tenant_id = ? AND id = ?", now(), tenantId, orgId);
  });
  await logActivity(tenantId, actor, "org_verify", orgId);
  return { ok: true };
}

export async function setAccountOwner(tenantId: string, orgId: string, owner: string | null, actor: string): Promise<EditResult> {
  const org = await orgExists(tenantId, orgId);
  if (!org) return { ok: false, error: "ไม่พบบริษัทนี้" };
  if (org.account_owner_id === owner) return { ok: true };
  await tx(async (q) => {
    await version(q, tenantId, "org", orgId, "account_owner_id", org.account_owner_id, owner, owner ? "รับเป็นเจ้าของบัญชี" : "ปล่อยบัญชี", actor);
    await q.run("UPDATE orgs SET account_owner_id = ? WHERE tenant_id = ? AND id = ?", owner, tenantId, orgId);
  });
  await logActivity(tenantId, actor, owner ? "account_claim" : "account_release", orgId);
  return { ok: true };
}

/* ── สังกัด ── */

export async function confirmAffiliation(tenantId: string, affiliationId: string, actor: string): Promise<EditResult> {
  const a = await get<{ confirmed_by: string | null }>("SELECT confirmed_by FROM affiliations WHERE tenant_id = ? AND id = ?", tenantId, affiliationId);
  if (!a) return { ok: false, error: "ไม่พบสังกัดนี้" };
  await tx(async (q) => {
    await version(q, tenantId, "affiliation", affiliationId, "confirmed_by", a.confirmed_by, actor, "ยืนยันสังกัด", actor);
    await q.run("UPDATE affiliations SET confirmed_by = ?, recorded_at = ? WHERE tenant_id = ? AND id = ?", actor, now(), tenantId, affiliationId);
  });
  await logActivity(tenantId, actor, "affiliation_confirm", affiliationId);
  return { ok: true };
}

/** คนนี้ไม่อยู่ที่นี่แล้ว — ปิดช่วงสังกัด ไม่ลบ (ประวัติตามเวลายังอยู่) */
export async function endAffiliation(tenantId: string, affiliationId: string, endedOn: string, reason: string, actor: string): Promise<EditResult> {
  const a = await get<{ valid_from: string | null; valid_to: string | null }>(
    "SELECT valid_from, valid_to FROM affiliations WHERE tenant_id = ? AND id = ?", tenantId, affiliationId);
  if (!a) return { ok: false, error: "ไม่พบสังกัดนี้" };
  const day = clean(endedOn, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { ok: false, error: "ระบุวันที่ออก" };
  if (a.valid_from && day < a.valid_from.slice(0, 10)) return { ok: false, error: "วันที่ออกอยู่ก่อนวันที่เริ่มสังกัด" };
  const why = clean(reason, 200);
  if (!why) return { ok: false, error: "บอกที่มา (เช่น \"แจ้งเปลี่ยนงานทางอีเมล\")" };
  await tx(async (q) => {
    await version(q, tenantId, "affiliation", affiliationId, "valid_to", a.valid_to, day, why, actor);
    await q.run("UPDATE affiliations SET valid_to = ?, confirmed_by = ?, recorded_at = ? WHERE tenant_id = ? AND id = ?", day, actor, now(), tenantId, affiliationId);
  });
  await logActivity(tenantId, actor, "affiliation_end", affiliationId);
  return { ok: true };
}

/* ── ความสัมพันธ์ (มีหลักฐานและผู้ยืนยันเสมอ) ── */

export async function addRelationship(
  tenantId: string,
  input: { type: string; fromKind: string; fromId: string; toKind: string; toId: string; context?: string; evidence: string; validFrom?: string },
  actor: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!(RELATIONSHIP_TYPES as readonly string[]).includes(input.type)) return { ok: false, error: "เลือกชนิดความสัมพันธ์" };
  const type = input.type as RelationshipType;
  const [fk, tk] = RELATIONSHIP_ENDS[type];
  if (fk === "member") return { ok: false, error: "ความรู้จักของคนในทีมบันทึกได้โดยเจ้าตัวเท่านั้น (ปุ่ม \"ฉันรู้จักคนนี้\")" };
  if (input.fromKind !== fk || input.toKind !== tk) return { ok: false, error: "ชนิดความสัมพันธ์นี้ใช้กับคู่ปลายทางแบบนี้ไม่ได้" };
  if (!input.fromId || !input.toId) return { ok: false, error: "เลือกทั้งสองฝั่งของความสัมพันธ์" };
  if (input.fromKind === input.toKind && input.fromId === input.toId) return { ok: false, error: "ความสัมพันธ์กับตัวเองไม่ได้" };
  const table = (k: string) => (k === "org" ? "orgs" : "customers");
  for (const [k, id] of [[input.fromKind, input.fromId], [input.toKind, input.toId]]) {
    if (!(await get(`SELECT 1 AS x FROM ${table(k)} WHERE tenant_id = ? AND id = ?`, tenantId, id))) return { ok: false, error: "ไม่พบอีกฝั่งของความสัมพันธ์ในบัญชีนี้" };
  }
  const note = clean(input.evidence, 500);
  if (note.length < 5) return { ok: false, error: "บอกหลักฐาน: รู้ได้อย่างไร จากใคร เมื่อไร" };
  const validFrom = clean(input.validFrom, 10) || null;
  if (validFrom && !/^\d{4}-\d{2}-\d{2}$/.test(validFrom)) return { ok: false, error: "วันที่เริ่มไม่ถูกรูปแบบ" };
  const id = randomUUID(), evidenceId = randomUUID(), at = now();
  await tx(async (q) => {
    await q.run("INSERT INTO evidence (id, tenant_id, kind, ref, note, captured_by, captured_at) VALUES (?,?,?,?,?,?,?)",
      evidenceId, tenantId, "statement", `relationship:${id}`, note, actor, at);
    await q.run(
      `INSERT INTO relationship_assertions (id, tenant_id, from_kind, from_id, to_kind, to_id, type, context, evidence_id,
         confirmed_by, confirmed_at, valid_from, valid_to, source_id, lifecycle_state, recorded_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id, tenantId, input.fromKind, input.fromId, input.toKind, input.toId, type, clean(input.context, 200) || null, evidenceId,
      actor, at, validFrom, null, null, "confirmed", at,
    );
    await clearBriefsFor(q, tenantId, [input.fromKind, input.fromId], [input.toKind, input.toId]);
  });
  await logActivity(tenantId, actor, "relationship_add", `${id} · ${type}`);
  return { ok: true, id };
}

/* ── "ฉันรู้จักคนนี้" (docs/solo-plan.md S2) ──
   ปลายต้นทางคือผู้บันทึกเองเสมอ — ไม่มีทางบันทึกว่าคนอื่นในทีมรู้จักใคร
   บริบท (พบที่ไหน เมื่อไร) เป็นหลักฐาน · คนที่ระดับความลับเกินสิทธิ์ผู้บันทึกบันทึกไม่ได้ (ไม่เป็นทางยืนยันว่ามีคนนี้อยู่)
   ซ้ำ = ไม่สร้างใหม่ (ความสัมพันธ์ชนิดเดียวกันที่ยังไม่สิ้นสุด) */
export async function addMemberLink(
  tenantId: string,
  input: { personId: string; type: string; context: string; validFrom?: string },
  member: { id: string; clearance: Classification },
): Promise<{ ok: true; id: string; existed: boolean } | { ok: false; error: string }> {
  if (!(MEMBER_RELATIONSHIP_TYPES as readonly string[]).includes(input.type)) return { ok: false, error: "เลือก: รู้จัก หรือ เคยร่วมงาน" };
  const type = input.type as MemberRelationshipType;
  if (!member.id) return { ok: false, error: "ไม่รู้ว่าใครกำลังบันทึก" };
  const person = await get<{ classification: string | null }>("SELECT classification FROM customers WHERE tenant_id = ? AND id = ?", tenantId, input.personId);
  if (!person || !canSee(member.clearance, (person.classification ?? "confidential") as Classification)) return { ok: false, error: "ไม่พบบุคคลนี้" };
  const note = clean(input.context, 300);
  if (note.length < 5) return { ok: false, error: "บอกว่ารู้จักจากที่ไหน เมื่อไร (เช่น \"ประชุมสมาคม ต.ค. 2568\")" };
  const validFrom = clean(input.validFrom, 10) || null;
  if (validFrom && !/^\d{4}-\d{2}-\d{2}$/.test(validFrom)) return { ok: false, error: "วันที่เริ่มไม่ถูกรูปแบบ" };
  const dup = await get<{ id: string }>(
    `SELECT id FROM relationship_assertions WHERE tenant_id = ? AND from_kind = 'member' AND from_id = ? AND to_kind = 'person' AND to_id = ?
       AND type = ? AND valid_to IS NULL`, tenantId, member.id, input.personId, type);
  if (dup) return { ok: true, id: dup.id, existed: true };
  const id = randomUUID(), evidenceId = randomUUID(), at = now();
  await tx(async (q) => {
    await q.run("INSERT INTO evidence (id, tenant_id, kind, ref, note, captured_by, captured_at) VALUES (?,?,?,?,?,?,?)",
      evidenceId, tenantId, "self_attestation", `relationship:${id}`, note, member.id, at);
    await q.run(
      `INSERT INTO relationship_assertions (id, tenant_id, from_kind, from_id, to_kind, to_id, type, context, evidence_id,
         confirmed_by, confirmed_at, valid_from, valid_to, source_id, lifecycle_state, recorded_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id, tenantId, "member", member.id, "person", input.personId, type, note, evidenceId,
      member.id, at, validFrom, null, null, "confirmed", at,
    );
    await clearBriefsFor(q, tenantId, ["person", input.personId]);
  });
  await logActivity(tenantId, member.id, "relationship_add", `${id} · ${type}`);
  return { ok: true, id, existed: false };
}

export async function endRelationship(tenantId: string, id: string, endedOn: string, reason: string, actor: string): Promise<EditResult> {
  const r = await get<{ valid_to: string | null; from_kind: string; from_id: string; to_kind: string; to_id: string }>(
    "SELECT valid_to, from_kind, from_id, to_kind, to_id FROM relationship_assertions WHERE tenant_id = ? AND id = ?", tenantId, id);
  if (!r) return { ok: false, error: "ไม่พบความสัมพันธ์นี้" };
  const day = clean(endedOn, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { ok: false, error: "ระบุวันที่สิ้นสุด" };
  const why = clean(reason, 200);
  if (!why) return { ok: false, error: "บอกที่มาว่าทำไมสิ้นสุด" };
  await tx(async (q) => {
    await version(q, tenantId, "relationship", id, "valid_to", r.valid_to, day, why, actor);
    await q.run("UPDATE relationship_assertions SET valid_to = ? WHERE tenant_id = ? AND id = ?", day, tenantId, id);
    await clearBriefsFor(q, tenantId, [r.from_kind, r.from_id], [r.to_kind, r.to_id]);
  });
  await logActivity(tenantId, actor, "relationship_end", id);
  return { ok: true };
}

/* สรุปของบริษัทที่เกี่ยวข้องล้าสมัยทันทีที่ความสัมพันธ์เปลี่ยน */
async function clearBriefsFor(q: Sql, tenantId: string, ...ends: [string, string][]) {
  for (const [kind, id] of ends) {
    if (kind === "org") await q.run("DELETE FROM account_briefs WHERE tenant_id = ? AND org_id = ?", tenantId, id);
    else await q.run("DELETE FROM account_briefs WHERE tenant_id = ? AND org_id IN (SELECT org_id FROM affiliations WHERE tenant_id = ? AND customer_id = ?)", tenantId, tenantId, id);
  }
}

/* ── ปฏิสัมพันธ์ ── บันทึกหลังพบลูกค้า (plan หัวข้อ 3.3) */

export async function logInteraction(
  tenantId: string, orgId: string,
  input: { kind: string; occurredAt: string; personId?: string; summary: string; outcome?: string; classification?: string },
  actor: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!(INTERACTION_KINDS as readonly string[]).includes(input.kind)) return { ok: false, error: "เลือกชนิดของการติดต่อ" };
  if (!(await orgExists(tenantId, orgId))) return { ok: false, error: "ไม่พบบริษัทนี้" };
  const day = clean(input.occurredAt, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { ok: false, error: "ระบุวันที่" };
  if (day > new Date(Date.now() + 864e5).toISOString().slice(0, 10)) return { ok: false, error: "บันทึกสิ่งที่เกิดขึ้นแล้ว — งานที่ยังไม่เกิดให้สร้างเป็นงาน" };
  const summary = clean(input.summary, 2000);
  if (!summary) return { ok: false, error: "สรุปสั้น ๆ ว่าคุยอะไร" };
  const level = (input.classification || "confidential") as Classification;
  if (!(CLASSIFICATIONS as readonly string[]).includes(level)) return { ok: false, error: "ระดับความลับไม่ถูกต้อง" };
  const person = input.personId || null;
  if (person && !(await get("SELECT 1 AS x FROM affiliations WHERE tenant_id = ? AND org_id = ? AND customer_id = ?", tenantId, orgId, person))) {
    return { ok: false, error: "คนที่เลือกไม่ได้สังกัดบริษัทนี้" };
  }
  const id = randomUUID();
  await tx(async (q) => {
    await q.run(
      `INSERT INTO interactions (id, tenant_id, kind, occurred_at, org_id, customer_id, opportunity_id, summary, outcome, owner_id, source_id, classification, recorded_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id, tenantId, input.kind as InteractionKind, day, orgId, person, null, summary, clean(input.outcome, 500) || null, actor, null, level, now(),
    );
    await q.run("DELETE FROM account_briefs WHERE tenant_id = ? AND org_id = ?", tenantId, orgId);
  });
  await logActivity(tenantId, actor, "interaction_log", `${orgId} · ${input.kind}`);
  return { ok: true, id };
}
