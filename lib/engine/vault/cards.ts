import { createHash, randomUUID } from "node:crypto";
import { all, get, insertMany, tx } from "@/lib/engine/sql";
import { logActivity } from "@/lib/engine/db";
import { customerIdFor, sealRecord } from "@/lib/engine/pii";
import { judgeRow, withErasure, type ColumnPlan } from "@/lib/engine/vault/intake";
import { erasedKeys } from "@/lib/engine/vault/erasure";
import { resolveTenant, type ResolveStats } from "@/lib/engine/vault/resolve";
import { importBlockedReason } from "@/lib/engine/signup/gate";
import { CARD_BATCH_MAX, isDay } from "@/lib/shared/capture";
import { bangkokDay } from "@/lib/shared/format";
import { templateOf } from "@/lib/shared/purpose-templates";
import type { ImportRowStatus, VaultField } from "@/lib/shared/vault";

/* ── นามบัตร · กรอกมือ (docs/solo-plan.md S6 · 6a) ─────────────────────

   ยังไม่มี OCR (ผู้ให้บริการเป็นการตัดสินของเจ้าของ — solo-plan หัวข้อ 13) — ผู้ใช้พิมพ์ทีละใบ
   ชื่องานและวันที่ถามครั้งเดียวต่อชุด · ทั้งชุดเข้า Data Vault เป็นแหล่ง `namecard` ผูกวัตถุประสงค์จากแม่แบบ b2b_event_namecard
   ไม่มีวัตถุประสงค์ = เพิ่มไม่ได้ (กติกาเดิม "ไม่มีแหล่ง = อัปโหลดไม่ได้")

   แต่ละใบเป็นหนึ่งแถวใน import_rows (เข้ารหัสทั้งแถวเหมือนแถวจากไฟล์) แล้วผ่าน resolveTenant ตัวเดียวกับไฟล์:
   อีเมล/เบอร์เดียวกันและชื่อไม่ขัด = คนเดิม (ไม่สร้างใหม่) · ชื่อเดียวกันในบริษัทเดียวกัน หรือช่องทางเดียวกันแต่ชื่อต่าง = คิวตรวจ
   ระบบไม่สร้างคนซ้ำและไม่รวมคนเองเกินกฎเดิม · ชุดเดิมส่งซ้ำ (กดสองครั้ง) = ไม่บันทึกซ้ำ */

export const CARD_TEMPLATE = "b2b_event_namecard";
const FIELDS: VaultField[] = ["customer_name", "job_title", "company", "email", "phone", "program", "occurred_at"];
const COLUMNS: ColumnPlan[] = FIELDS.map((field, index) => ({ index, header: field, field, dropped: null }));

export type CardInput = { name?: string; title?: string; company?: string; email?: string; phone?: string };
export type CardOutcome = "new" | "existing" | "review" | "rejected" | "suspended";
export type CardResult = {
  line: number; outcome: CardOutcome; reason: string | null; personId: string | null;
};
export type CaptureResult =
  | { ok: true; batchId: string; sourceId: string; cards: CardResult[]; counts: Record<ImportRowStatus, number>;
      resolved: ResolveStats | null; resolveError?: string }
  | { ok: false; error: string };

/** วัตถุประสงค์ของนามบัตร — ต้องเลือกแม่แบบในหน้าวัตถุประสงค์ก่อน (สิทธิ์ policy) */
export async function cardPurpose(tenantId: string): Promise<{ id: string; name: string } | null> {
  return (await get<{ id: string; name: string }>(
    "SELECT id, name FROM purposes WHERE tenant_id = ? AND template_code = ? ORDER BY created_at LIMIT 1", tenantId, CARD_TEMPLATE)) ?? null;
}

/* แหล่ง namecard หนึ่งแหล่งต่อวัตถุประสงค์ — สร้างครั้งแรกที่บันทึกนามบัตร ใช้ซ้ำทุกชุด */
async function cardSource(tenantId: string, purposeId: string, actor: string): Promise<string> {
  const have = await get<{ id: string }>(
    "SELECT id FROM sources WHERE tenant_id = ? AND kind = 'namecard' AND purpose_id = ? AND status = 'active' ORDER BY registered_at LIMIT 1",
    tenantId, purposeId);
  if (have) return have.id;
  const id = randomUUID();
  const t = templateOf(CARD_TEMPLATE)!;
  await tx(async (q) => {
    await q.run(
      `INSERT INTO sources (id, tenant_id, name, kind, purpose_id, owner_id, scope_note, fields, acquisition_note, status, registered_by, registered_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      id, tenantId, "นามบัตร (กรอกมือ)", "namecard", purposeId, actor, "ชื่องานและวันที่บันทึกต่อชุดนามบัตร",
      JSON.stringify(FIELDS), `${t.mustConfirm} · กรอกจากนามบัตรด้วยมือ ไม่ได้ใช้ OCR`, "active", actor, new Date().toISOString(),
    );
    await logActivity(tenantId, actor, "source_registered", `${id} · namecard · ${FIELDS.length} fields`);
  });
  return id;
}

export async function captureCards(
  tenantId: string, input: { event: string; date: string; cards: CardInput[] }, actor: string,
): Promise<CaptureResult> {
  /* นามบัตรคือข้อมูลจริง — บัญชีสมัครเองติดด่านเดียวกับเพิ่มคนเอง (customers.ts) และนำเข้าไฟล์
     ถ่ายรูปได้ทีละหลายสิบใบแล้ว (แผน H §5) ช่องนี้จึงต้องไม่เป็นทางเลี่ยงด่าน */
  const blocked = await importBlockedReason(tenantId);
  if (blocked) return { ok: false, error: blocked };
  const purpose = await cardPurpose(tenantId);
  if (!purpose) {
    return { ok: false, error: "ยังไม่มีวัตถุประสงค์สำหรับนามบัตร — ให้เจ้าของบัญชีหรือผู้ดูแลข้อมูลเลือกแม่แบบ \"ติดต่อจากการแลกนามบัตรในงานธุรกิจ\" ที่หน้าวัตถุประสงค์ก่อน" };
  }
  const event = (input.event ?? "").replace(/\s+/g, " ").trim().slice(0, 160);
  if (event.length < 2) return { ok: false, error: "บอกว่าได้นามบัตรชุดนี้มาจากงานไหน" };
  const date = (input.date ?? "").trim();
  if (!isDay(date)) return { ok: false, error: "ระบุวันที่ของงาน" };
  if (date > bangkokDay()) return { ok: false, error: "วันที่ของงานอยู่ในอนาคต — นามบัตรได้มาแล้วเท่านั้น" };
  const cards = (input.cards ?? [])
    .map((c) => ({ name: c.name?.trim() ?? "", title: c.title?.trim() ?? "", company: c.company?.trim() ?? "", email: c.email?.trim() ?? "", phone: c.phone?.trim() ?? "" }))
    .filter((c) => Object.values(c).some(Boolean));
  if (!cards.length) return { ok: false, error: "เพิ่มนามบัตรอย่างน้อยหนึ่งใบ" };
  if (cards.length > CARD_BATCH_MAX) return { ok: false, error: `ชุดหนึ่งไม่เกิน ${CARD_BATCH_MAX} ใบ — แบ่งเป็นหลายชุด` };

  /* ลายนิ้วมือของชุด — กดบันทึกซ้ำ/ส่งซ้ำ = ชุดเดิม (ux_batches_sha) ไม่สร้างแถวซ้ำ */
  const canonical = JSON.stringify({ kind: "namecard", event, date, cards });
  const bytes = new TextEncoder().encode(canonical);
  const digest = createHash("sha256").update(canonical).digest("hex");
  const dup = await get<{ id: string }>("SELECT id FROM import_batches WHERE tenant_id = ? AND sha256 = ?", tenantId, digest);
  if (dup) return { ok: false, error: "ชุดนามบัตรนี้บันทึกแล้ว — ไม่บันทึกซ้ำ" };

  const sourceId = await cardSource(tenantId, purpose.id, actor);
  const batchId = randomUUID();
  const now = new Date().toISOString();
  const erased = await erasedKeys(tenantId);
  const counts: Record<ImportRowStatus, number> = { accepted: 0, rejected: 0, pending_review: 0, suspended: 0 };
  const judged = cards.map((c, i) => {
    const j = withErasure(tenantId, judgeRow([c.name, c.title, c.company, c.email, c.phone, event, date], COLUMNS), erased);
    counts[j.status]++;
    return { line: i + 1, ...j };
  });
  const label = `นามบัตร · ${event} · ${date}`;
  const rows = judged.map((j) => [
    tenantId, batchId, j.line, j.status, j.reason, `${label}#${j.line}`, null,
    /* ถูกปฏิเสธ หรือตรงกับคนที่ถูกลบ = ไม่เก็บค่า เหมือนแถวจากไฟล์ */
    j.status === "rejected" || j.erased ? null : sealRecord(tenantId, "import_row", JSON.stringify(j.values)), now,
  ]);
  await tx(async (q) => {
    await q.run(
      `INSERT INTO import_batches (id, tenant_id, source_id, filename, sha256, bytes, rows_total, status, uploaded_by, uploaded_at, finished_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      batchId, tenantId, sourceId, label.slice(0, 200), digest, bytes.byteLength, rows.length, "completed", actor, now, now,
    );
    await insertMany(q, "import_rows",
      ["tenant_id", "batch_id", "line", "status", "reason", "source_ref", "customer_id", "payload_enc", "recorded_at"], rows);
    await logActivity(tenantId, actor, "import_batch",
      `${batchId} · namecard · ${rows.length} cards · ${counts.pending_review} pending · ${counts.rejected} rejected`);
  });

  /* ตรวจตัวตนต่อทันที (เส้นเดียวกับไฟล์) — ล้มแล้วแถวยังรอตรวจ สั่งใหม่ได้จากหน้าคิวตรวจ */
  let resolved: ResolveStats | null = null, resolveError: string | undefined;
  try {
    resolved = await resolveTenant(tenantId, actor);
  } catch (err) {
    resolveError = err instanceof Error ? err.message : "ตรวจตัวตนไม่สำเร็จ";
  }
  return { ok: true, batchId, sourceId, cards: await outcomes(tenantId, batchId, judged), counts, resolved, resolveError };
}

/* ผลรายใบหลังตรวจตัวตน: คนใหม่ (รหัสจากแถวในชุดนี้) · คนเดิม · อยู่ในคิวตรวจ */
async function outcomes(
  tenantId: string, batchId: string, judged: { line: number; status: ImportRowStatus; reason: string | null }[],
): Promise<CardResult[]> {
  const rows = await all<{ line: number | string; status: ImportRowStatus; reason: string | null; customer_id: string | null }>(
    "SELECT line, status, reason, customer_id FROM import_rows WHERE tenant_id = ? AND batch_id = ? ORDER BY line", tenantId, batchId);
  const fresh = new Set(judged.map((j) => customerIdFor(tenantId, "row", `${batchId}#${j.line}`)));
  const open = await all<{ subject_ids: string }>(
    "SELECT subject_ids FROM review_items WHERE tenant_id = ? AND kind = 'person_pair' AND status = 'open'", tenantId);
  const inReview = new Set(open.flatMap((r) => JSON.parse(r.subject_ids) as string[]));
  return rows.map((r) => {
    const line = Number(r.line);
    if (r.status === "rejected") return { line, outcome: "rejected", reason: r.reason, personId: null };
    if (r.status === "suspended") return { line, outcome: "suspended", reason: r.reason, personId: null };
    const id = r.customer_id;
    if (!id) return { line, outcome: "review", reason: r.reason ?? "รอตรวจตัวตน", personId: null };
    const outcome: CardOutcome = inReview.has(id) ? "review" : fresh.has(id) ? "new" : "existing";
    return { line, outcome, reason: r.reason, personId: id };
  });
}
