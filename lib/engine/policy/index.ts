import { randomUUID } from "node:crypto";
import { all, get, tx } from "@/lib/engine/sql";
import { logActivity } from "@/lib/engine/db";
import { personIdsOf } from "@/lib/engine/vault/merge";
import { CHANNEL_TH, LAWFUL_BASES, LAWFUL_BASIS_TH, MESSAGE_KINDS, CHANNELS, type Channel, type LawfulBasis, type MessageKind } from "@/lib/shared/policy";
import type { Eligibility } from "@/lib/shared/vault";

/* ── บริการนโยบาย (docs/plan.md หัวข้อ 6 · Blueprint 2.0 บท 5) ─────────────

   ผลตัดสินต่อ วัตถุประสงค์ × ช่องทาง × ชนิดข้อความ × เวลา — ไม่ใช่ช่อง consent ช่องเดียวครอบทุกกรณี
     eligible         ผ่านนโยบายสำหรับงานนี้ · แนบเหตุผลและรุ่นนโยบาย
     review_required  หลักฐานไม่พอ — ไม่ทราบ = พักไว้ ไม่ใช่ "น่าจะได้"
     suppressed       คัดค้าน · ถอนในขอบเขตนั้น · ขอจำกัด · ระเบียนถูกระงับ
     channel_invalid  ไม่มีช่องทางที่ใช้ได้ — ไม่ใช่ข้อสรุปเรื่องฐานทางกฎหมาย

   กติกาที่ verify:policy ตรวจ (plan หัวข้อ 6.3):
     ฐานสัญญา (ซื้อบัตร/ทำสัญญาออกบูธ) ครอบคลุมข้อความบริการ ไม่ครอบคลุมข้อเสนอ
     ยินยอมรับข่าวจากผู้จัดงาน ≠ อนุญาตเปิดเผยต่อสปอนเซอร์ — การเปิดเผยต้องมีความยินยอมของวัตถุประสงค์นั้นเอง
     ถอนความยินยอมมีผลในขอบเขตของมัน · คัดค้านการตลาด = หยุดใช้เพื่อการตลาดทุกวัตถุประสงค์
     ไม่เปลี่ยนฐานเพื่อหลบการถอน: ถอนแล้ว = ห้าม แม้วัตถุประสงค์จะเปลี่ยนไปใช้ฐานอื่นทีหลัง
     ไม่ส่งการขอความยินยอมแบบเหมารวมให้กลุ่มที่ไม่ทราบสถานะ
     ฐานที่จำกัดช่องทาง/ชนิดข้อความ (จากแม่แบบ) ไม่ครอบคลุมงานนอกขอบเขตนั้น
     ฐานที่ผูกกับบริษัท (employer_scoped) + คนย้ายบริษัทแล้ว = ต้องตรวจ จนกว่ามีหลักฐานใหม่ที่บริษัทใหม่
       (บันทึกการคุยกันที่บริษัทใหม่หลังวันที่ย้าย หรือความยินยอมของวัตถุประสงค์นี้หลังวันที่ย้าย) — docs/solo-plan.md S3/S4
   บริการใช้ไม่ได้ = หยุดงาน (fail closed) · ผลเก็บแค่สถานะ เหตุผล และรุ่น — ไม่คัดลอกข้อมูลส่วนบุคคล */

export const RULES_VERSION = "2026-10-15.1";
const STALE_DAYS = 3 * 365;

export type Decision = {
  status: Eligibility;
  reasons: string[];
  policyVersion: string;
  basis: LawfulBasis | null;
  /** บริการนโยบายทำงานไม่สำเร็จ — ผู้เรียกต้องหยุด ไม่ใช่ข้ามไป */
  failed?: boolean;
};

export type Ask = {
  customerId: string; purposeId: string; channel: Channel; messageKind: MessageKind;
  /** ส่ง/เปิดเผยรายชื่อให้บุคคลอื่น (เช่น สปอนเซอร์) — ต้องมีความยินยอมของวัตถุประสงค์การเปิดเผยนี้ */
  disclosurePurposeId?: string | null;
  at?: string;
};

type Pref = { kind: string; purpose_id: string | null; channel: string; effective_at: string; recorded_at: string };

export async function activeBasis(tenantId: string, purposeId: string, at = new Date().toISOString()) {
  return get<{ id: string; lawful_basis: LawfulBasis; version: number | string; lia_ref: string | null; code: string; name: string;
    employer_scoped: number | string | null; allowed_channels: string | null; allowed_message_kinds: string | null }>(
    `SELECT r.id, r.lawful_basis, r.version, r.lia_ref, p.code, p.name, r.employer_scoped, r.allowed_channels, r.allowed_message_kinds
     FROM processing_records r
     JOIN purposes p ON p.id = r.purpose_id AND p.tenant_id = r.tenant_id
     WHERE r.tenant_id = ? AND r.purpose_id = ? AND r.effective_from <= ? AND (r.effective_to IS NULL OR r.effective_to > ?)
     ORDER BY r.version DESC LIMIT 1`,
    tenantId, purposeId, at, at,
  );
}

/** ตัดสินหนึ่งคน — ไม่โยน error: ถ้าทำไม่สำเร็จคืน failed + review_required ให้ผู้เรียกหยุดงาน */
export async function decide(tenantId: string, ask: Ask): Promise<Decision> {
  try {
    if (process.env.PARALLAX_POLICY_FAULT === "1" && process.env.NODE_ENV !== "production") throw new Error("policy fault (test)");
    return await evaluate(tenantId, ask);
  } catch (err) {
    console.error("[policy]", err instanceof Error ? err.message : err);
    return { status: "review_required", reasons: ["บริการนโยบายใช้ไม่ได้ — หยุดงานไว้ก่อน (fail closed)"], policyVersion: `${RULES_VERSION} · ใช้ไม่ได้`, basis: null, failed: true };
  }
}

async function evaluate(tenantId: string, ask: Ask): Promise<Decision> {
  const at = ask.at ?? new Date().toISOString();
  const suppressed: string[] = [], review: string[] = [], ok: string[] = [];

  const person = await get<{ lifecycle_state: string | null; restriction_status: string | null }>(
    "SELECT lifecycle_state, restriction_status FROM customers WHERE tenant_id = ? AND id = ?", tenantId, ask.customerId);
  if (!person) return { status: "suppressed", reasons: ["ไม่พบบุคคลนี้ในบัญชี"], policyVersion: RULES_VERSION, basis: null };
  if (["deleted", "anonymised", "restricted"].includes(person.lifecycle_state ?? "")) suppressed.push("ระเบียนถูกจำกัดหรือลบแล้ว");
  if (person.restriction_status === "suppressed") suppressed.push("ระเบียนถูกตั้งเป็นห้ามติดต่อ");
  if (person.restriction_status === "restricted" || person.restriction_status === "review") review.push("ระเบียนมีข้อจำกัดที่ต้องตรวจก่อน");
  if (person.lifecycle_state === "pending_review") review.push("ตัวตนยังรอตรวจในคิว (อาจเป็นคนเดียวกับอีกระเบียน)");
  /* ข้อมูลที่ยืนยันแล้วกลับมาต้องทบทวน (หลักฐานขัดแย้ง · เปลี่ยนงาน · ขาดการยืนยัน — plan 5.2) */
  if (person.lifecycle_state === "needs_review") review.push("ระเบียนถูกส่งกลับมาให้ทบทวน — ยืนยันก่อนใช้");

  const basis = await activeBasis(tenantId, ask.purposeId, at);
  /* รุ่นที่อ่านได้: กติกา · วัตถุประสงค์ · รุ่นของฐาน — ไม่มีข้อมูลส่วนบุคคล */
  const policyVersion = basis ? `${RULES_VERSION} · ${basis.name} ฐานรุ่น ${basis.version}` : `${RULES_VERSION} · ไม่มีฐาน`;
  if (!basis) review.push("วัตถุประสงค์นี้ยังไม่มีฐานการประมวลผลที่อนุมัติ");

  // ── ความต้องการของเจ้าของข้อมูล (รวมรหัสที่ถูกรวมเข้ามา) ──
  const ids = await personIdsOf(tenantId, ask.customerId);
  const prefs = await all<Pref>(
    `SELECT kind, purpose_id, channel, effective_at, recorded_at FROM preferences
     WHERE tenant_id = ? AND customer_id IN (${ids.map(() => "?").join(",")}) AND effective_at <= ?
     ORDER BY effective_at, recorded_at`, tenantId, ...ids, at);
  const inScope = (p: Pref, purpose: string | null, exact = false) =>
    (exact ? p.purpose_id === purpose : p.purpose_id === null || p.purpose_id === purpose) && (p.channel === "any" || p.channel === ask.channel);
  const latest = (kinds: string[], purpose: string | null, exact = false) =>
    [...prefs].reverse().find((p) => kinds.includes(p.kind) && inScope(p, purpose, exact));

  if (prefs.some((p) => p.kind === "restriction" && inScope(p, ask.purposeId))) suppressed.push("เจ้าของข้อมูลขอจำกัดการใช้");
  const marketingish = ask.messageKind !== "service";
  if (marketingish) {
    /* คัดค้านการตลาด: ทุกวัตถุประสงค์ที่เป็นการตลาด จนกว่าเจ้าของข้อมูลจะให้ความยินยอมใหม่ภายหลัง */
    const obj = [...prefs].reverse().find((p) => (p.kind === "objection" || p.kind === "consent") && (p.channel === "any" || p.channel === ask.channel)
      && (p.kind === "objection" || p.purpose_id === ask.purposeId));
    if (obj?.kind === "objection") suppressed.push("เจ้าของข้อมูลคัดค้านการใช้เพื่อการตลาด");
  }
  /* ถอนในขอบเขตนี้ = ห้าม ไม่ว่าฐานปัจจุบันจะเป็นอะไร (ไม่เปลี่ยนฐานเพื่อหลบการถอน) */
  const cw = latest(["consent", "withdrawal"], ask.purposeId);
  if (cw?.kind === "withdrawal") suppressed.push("เจ้าของข้อมูลถอนความยินยอมสำหรับวัตถุประสงค์นี้");

  if (basis) {
    const b = basis.lawful_basis;
    if (b === "consent") {
      const own = latest(["consent", "withdrawal"], ask.purposeId, true);
      if (own?.kind === "consent") ok.push("มีความยินยอมสำหรับวัตถุประสงค์นี้");
      else if (!own) review.push("ไม่ทราบสถานะความยินยอมสำหรับวัตถุประสงค์นี้ — พักไว้");
    } else if (b === "legitimate_interest") {
      if (basis.lia_ref) ok.push(`ฐาน${LAWFUL_BASIS_TH.legitimate_interest.split(" (")[0]} (LIA: ${basis.lia_ref})`);
      else review.push("ฐานประโยชน์โดยชอบยังไม่มีผลประเมิน LIA");
    } else if (b === "contract" || b === "legal_obligation") {
      if (ask.messageKind === "service") ok.push(`ฐาน${LAWFUL_BASIS_TH[b].split(" (")[0]} ครอบคลุมข้อความบริการ`);
      else review.push(`ฐาน${LAWFUL_BASIS_TH[b].split(" (")[0]} ครอบคลุมเฉพาะข้อความบริการ ไม่ครอบคลุมข้อเสนอ`);
    } else {
      /* ฐานที่กติกานี้ไม่รู้จัก (เช่นเพิ่มใน LAWFUL_BASES แต่ยังไม่เขียนกติกา) ต้องไม่ตกเป็น "ใช้ได้" เงียบ ๆ */
      review.push("ฐานการประมวลผลนี้ยังไม่มีกติกาตรวจ — ต้องให้คนตัดสิน");
    }
  }
  if (ask.messageKind === "consent_request") review.push("ไม่ส่งการขอความยินยอมแบบเหมารวม — ต้องให้คนตัดสินรายคน");

  // ── ขอบเขตของฐาน (แม่แบบ S4) ──
  if (basis) {
    const list = (v: string | null) => (v ? (JSON.parse(v) as string[]) : null);
    const chans = list(basis.allowed_channels), kinds = list(basis.allowed_message_kinds);
    if (chans && !chans.includes(ask.channel)) review.push(`ช่องทาง${CHANNEL_TH[ask.channel] ?? ask.channel}อยู่นอกขอบเขตของฐานนี้`);
    if (kinds && !kinds.includes(ask.messageKind)) review.push("ชนิดข้อความนี้อยู่นอกขอบเขตของฐานนี้");
    if (Number(basis.employer_scoped)) {
      /* ย้ายบริษัท = มีสังกัดที่ปิดแล้วที่บริษัทอื่น และมีสังกัดปัจจุบัน · วันที่ย้าย = วันเริ่มสังกัดใหม่ (ไม่ทราบ = วันที่ออกจากที่เดิม) */
      const cur = await get<{ org_id: string; name: string; valid_from: string | null; left_at: string | null }>(
        `SELECT a.org_id, o.name, a.valid_from,
           (SELECT MAX(b.valid_to) FROM affiliations b WHERE b.tenant_id = a.tenant_id AND b.customer_id IN (${ids.map(() => "?").join(",")})
              AND b.org_id <> a.org_id AND b.valid_to IS NOT NULL AND b.valid_to <= ?) AS left_at
         FROM affiliations a JOIN orgs o ON o.id = a.org_id AND o.tenant_id = a.tenant_id
         WHERE a.tenant_id = ? AND a.customer_id IN (${ids.map(() => "?").join(",")}) AND (a.valid_to IS NULL OR a.valid_to > ?)
         ORDER BY a.valid_from DESC, a.org_id LIMIT 1`,
        ...ids, at, tenantId, ...ids, at);
      if (cur?.left_at) {
        const since = cur.valid_from ?? cur.left_at;
        const talked = await get(
          `SELECT 1 AS x FROM interactions WHERE tenant_id = ? AND customer_id IN (${ids.map(() => "?").join(",")}) AND org_id = ? AND occurred_at >= ? LIMIT 1`,
          tenantId, ...ids, cur.org_id, since);
        const consented = prefs.some((p) => p.kind === "consent" && p.purpose_id === ask.purposeId && p.effective_at >= since);
        if (talked || consented) ok.push(`ย้ายไป ${cur.name} แล้ว และมีหลักฐานใหม่หลังวันที่ย้าย (${talked ? "บันทึกการคุยกันที่บริษัทใหม่" : "ความยินยอม"})`);
        else review.push(`ย้ายไป ${cur.name} ตั้งแต่ ${since.slice(0, 10)} — ฐานนี้ผูกกับความสัมพันธ์ที่บริษัทเดิม ต้องมีหลักฐานใหม่ที่บริษัทใหม่ก่อน`);
      }
    }
  }

  if (ask.disclosurePurposeId) {
    const d = latest(["consent", "withdrawal"], ask.disclosurePurposeId, true);
    if (d?.kind === "withdrawal") suppressed.push("ถอนความยินยอมให้เปิดเผยต่อบุคคลอื่นแล้ว");
    else if (d?.kind !== "consent") review.push("ยังไม่มีความยินยอมให้เปิดเผยต่อบุคคลอื่น (ยินยอมรับข่าวจากผู้จัดงานไม่นับ)");
    else ok.push("มีความยินยอมให้เปิดเผยต่อบุคคลอื่น");
  }

  // ── อายุข้อมูล ──
  const fresh = await get<{ last: string | null }>(
    `SELECT MAX(t) AS last FROM (
       SELECT MAX(COALESCE(last_seen_at, valid_from)) AS t FROM affiliations WHERE tenant_id = ? AND customer_id = ?
       UNION ALL SELECT MAX(occurred_at) FROM interactions WHERE tenant_id = ? AND customer_id = ?
       UNION ALL SELECT MAX(recorded_at) FROM preferences WHERE tenant_id = ? AND customer_id = ?
       UNION ALL SELECT MAX(occurred_at) FROM transactions WHERE tenant_id = ? AND customer_id = ?) x`,
    /* การซื้อ (F5) = หลักฐานว่าความสัมพันธ์ยังอยู่ ไม่ต่างจากปฏิสัมพันธ์ — ลูกค้าบุคคลส่วนใหญ่มีแต่การซื้อ */
    tenantId, ask.customerId, tenantId, ask.customerId, tenantId, ask.customerId, tenantId, ask.customerId);
  if (!fresh?.last) review.push("ไม่ทราบว่าข้อมูลล่าสุดเมื่อไร");
  else if (Date.parse(at) - Date.parse(fresh.last) > STALE_DAYS * 864e5) review.push(`ข้อมูลล่าสุด ${fresh.last.slice(0, 10)} เก่ากว่า 3 ปี — ยืนยันก่อนใช้`);

  // ── ช่องทาง ──
  let channelOk = true;
  if (ask.channel !== "meeting") {
    const point = await get(
      `SELECT 1 AS x FROM contact_points WHERE tenant_id = ? AND customer_id IN (${ids.map(() => "?").join(",")}) AND kind = ?
       AND valid_to IS NULL AND COALESCE(verify_status, 'unverified') <> 'invalid' LIMIT 1`,
      tenantId, ...ids, ask.channel);
    if (!point) channelOk = false;
    else ok.push(ask.channel === "email" ? "มีอีเมลที่ใช้ได้" : "มีเบอร์ที่ใช้ได้");
  }

  const b = (basis?.lawful_basis ?? null) as LawfulBasis | null;
  if (suppressed.length) return { status: "suppressed", reasons: suppressed, policyVersion, basis: b };
  if (review.length) return { status: "review_required", reasons: [...review, ...(channelOk ? [] : ["ไม่มีช่องทางที่ใช้ได้"])], policyVersion, basis: b };
  if (!channelOk) return { status: "channel_invalid", reasons: [ask.channel === "email" ? "ไม่มีอีเมลที่ใช้ได้" : "ไม่มีเบอร์ที่ใช้ได้"], policyVersion, basis: b };
  return { status: "eligible", reasons: ok, policyVersion, basis: b };
}

/* ── ฐานการประมวลผลต่อวัตถุประสงค์ (เชื่อมทะเบียน ROPA ใน B6) — เก็บเป็นรุ่น ไม่เขียนทับ ── */

export type BasisScope = { employerScoped?: boolean; channels?: string[] | null; messageKinds?: string[] | null };

export async function setBasis(
  tenantId: string, purposeId: string, input: { lawfulBasis: string; liaRef?: string; dataScope?: string } & BasisScope, actor: string,
): Promise<{ ok: true; version: number } | { ok: false; error: string }> {
  if (input.channels?.some((c) => !(CHANNELS as readonly string[]).includes(c))) return { ok: false, error: "ช่องทางไม่ถูกต้อง" };
  if (input.messageKinds?.some((k) => !(MESSAGE_KINDS as readonly string[]).includes(k))) return { ok: false, error: "ชนิดข้อความไม่ถูกต้อง" };
  if (!(LAWFUL_BASES as readonly string[]).includes(input.lawfulBasis)) return { ok: false, error: "เลือกฐานการประมวลผล" };
  if (!(await get("SELECT 1 AS x FROM purposes WHERE tenant_id = ? AND id = ?", tenantId, purposeId))) return { ok: false, error: "ไม่พบวัตถุประสงค์นี้" };
  const lia = input.liaRef?.trim().slice(0, 200) || null;
  if (input.lawfulBasis === "legitimate_interest" && !lia) return { ok: false, error: "ฐานประโยชน์โดยชอบต้องอ้างผลประเมิน LIA (เลขที่หรือชื่อเอกสาร)" };
  const now = new Date().toISOString();
  /* อ่านรุ่นล่าสุดในธุรกรรมเดียวกับการเขียน — สองคนตั้งพร้อมกันต้องไม่ได้รุ่นเดียวกันสองแถวที่ยังมีผล */
  const version = await tx(async (q) => {
    const prev = await q.get<{ id: string; version: number | string; employer_scoped: number | string | null; allowed_channels: string | null; allowed_message_kinds: string | null }>(
      `SELECT id, version, employer_scoped, allowed_channels, allowed_message_kinds FROM processing_records
       WHERE tenant_id = ? AND purpose_id = ? AND effective_to IS NULL ORDER BY version DESC LIMIT 1`, tenantId, purposeId);
    const version = prev ? Number(prev.version) + 1 : 1;
    if (prev) await q.run("UPDATE processing_records SET effective_to = ? WHERE tenant_id = ? AND id = ?", now, tenantId, prev.id);
    /* ขอบเขตตามรุ่นก่อนหน้า ถ้าไม่ได้ระบุใหม่ — ตั้งฐานรุ่นใหม่จากหน้าจอต้องไม่ลบขอบเขตที่แม่แบบให้ไว้โดยไม่ตั้งใจ */
    const scoped = input.employerScoped ?? Boolean(Number(prev?.employer_scoped ?? 0));
    const chans = input.channels !== undefined ? (input.channels ? JSON.stringify(input.channels) : null) : prev?.allowed_channels ?? null;
    const kinds = input.messageKinds !== undefined ? (input.messageKinds ? JSON.stringify(input.messageKinds) : null) : prev?.allowed_message_kinds ?? null;
    await q.run(
      `INSERT INTO processing_records (id, tenant_id, purpose_id, lawful_basis, data_scope, approved_by, version, effective_from, effective_to, lia_ref, recorded_at,
         employer_scoped, allowed_channels, allowed_message_kinds)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      randomUUID(), tenantId, purposeId, input.lawfulBasis, input.dataScope?.trim().slice(0, 300) || null, actor, version, now, null, lia, now,
      scoped ? 1 : 0, chans, kinds,
    );
    return version;
  });
  await logActivity(tenantId, actor, "basis_set", `${purposeId} · ${input.lawfulBasis} · v${version}`);
  /* ฐานเปลี่ยน = ผลตัดสินของเป้าหมายที่ใช้วัตถุประสงค์นี้อาจเปลี่ยน — ตรวจซ้ำ ไม่รอจนถึงตอนติดต่อ
     (import ตอนเรียก: campaigns import ไฟล์นี้อยู่แล้ว) */
  const { recheckTargetsFor } = await import("@/lib/engine/campaigns");
  const people = await all<{ customer_id: string }>(
    `SELECT DISTINCT t.customer_id FROM campaign_targets t JOIN sales_campaigns c ON c.id = t.campaign_id AND c.tenant_id = t.tenant_id
     WHERE t.tenant_id = ? AND (c.purpose_id = ? OR c.disclosure_purpose_id = ?) AND t.status NOT IN ('won', 'lost', 'not_interested', 'cancelled')`,
    tenantId, purposeId, purposeId);
  for (const p of people) await recheckTargetsFor(tenantId, p.customer_id, actor);
  return { ok: true, version };
}

export async function listBases(tenantId: string) {
  return all<{ purpose_id: string; code: string; name: string; lawful_basis: string | null; version: number | null; lia_ref: string | null; approved_by: string | null; effective_from: string | null }>(
    `SELECT p.id AS purpose_id, p.code, p.name, r.lawful_basis, r.version, r.lia_ref, r.approved_by, r.effective_from
     FROM purposes p LEFT JOIN processing_records r ON r.purpose_id = p.id AND r.tenant_id = p.tenant_id AND r.effective_to IS NULL
     WHERE p.tenant_id = ? ORDER BY p.name`, tenantId);
}
