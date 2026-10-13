import { createHash, randomUUID } from "node:crypto";
import { get, insertMany, tx } from "@/lib/engine/sql";
import { logActivity } from "@/lib/engine/db";
import { mapColumns, type AiSource } from "@/lib/engine/ai";
import { sealRecord } from "@/lib/engine/pii";
import { scanFile } from "@/lib/engine/vault/scan";
import { TableTooLarge, readTable } from "@/lib/engine/vault/read";
import { getSource, type Source } from "@/lib/engine/vault/sources";
import {
  IDENTIFYING_FIELDS, VAULT_FIELDS, sensitiveReason, type ImportRowStatus, type VaultField,
} from "@/lib/shared/vault";

/* ── รับไฟล์เข้า Data Vault (Blueprint บท 4 ขั้น 2–5) ──────────────────

   สองขั้น และไม่มีอะไรถูกเก็บจนกว่าผู้ใช้ยืนยัน:
     analyse  ตรวจไฟล์ → อ่านเป็นตาราง → เสนอการจับคู่คอลัมน์ → นับว่าจะได้กี่แถวแต่ละสถานะ
     commit   ตรวจไฟล์ซ้ำ (ไฟล์ถูกส่งมาใหม่ ไม่เก็บไว้ระหว่างขั้น) → เก็บเฉพาะฟิลด์ที่แหล่งอนุญาต
              → เข้ารหัสทั้งแถว → บันทึกผลรายแถวทุกแถว → รายงานตรวจยอด

   ผลรายแถว: rejected (ชี้ไปหาใครไม่ได้ · แถวว่าง) · pending_review (รอตรวจตัวตนใน B3)
   ยังไม่มีแถวใดเป็น accepted ในขั้นนี้ — "ยอมรับ" หมายถึงผ่านการตรวจตัวตนแล้ว ซึ่งเป็นงานของ B3 */

export type ColumnPlan = {
  index: number;
  header: string;
  field: VaultField | "ignore";
  /** เหตุผลที่คอลัมน์นี้ไม่ถูกเก็บ ถ้ามี */
  dropped: string | null;
};

export type AnalyseOk = {
  ok: true;
  filename: string;
  sha256: string;
  bytes: number;
  kind: "csv" | "xlsx";
  encoding: string;
  sheet?: string;
  otherSheets?: string[];
  scanEngine: "basic" | "clamav";
  scanNote?: string;
  columns: ColumnPlan[];
  mappingSource: AiSource;
  mappingNote?: string;
  rows: number;
  estimate: Record<ImportRowStatus, number>;
  duplicateOf: { batchId: string; at: string } | null;
};
export type AnalyseResult = AnalyseOk | { ok: false; error: string };

const isVaultField = (f: string): f is VaultField => (VAULT_FIELDS as readonly string[]).includes(f);
const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function loadSource(tenantId: string, sourceId: string): Promise<Source | string> {
  const s = await getSource(tenantId, sourceId);
  if (!s) return "ไม่พบแหล่งข้อมูลนี้ — ลงทะเบียนแหล่งก่อนอัปโหลด";
  if (s.status !== "active") return "แหล่งข้อมูลนี้ถูกปิดแล้ว";
  return s;
}

/** คอลัมน์ไหนเก็บเป็นฟิลด์อะไร — ตัดคอลัมน์อ่อนไหวและฟิลด์ที่แหล่งไม่ได้เลือกออกเสมอ */
export function planColumns(
  headers: string[], suggested: Map<number, string>, allowed: VaultField[], override?: Record<number, string>,
): ColumnPlan[] {
  const used = new Set<string>();
  return headers.map((header, index) => {
    const sensitive = sensitiveReason(header);
    if (sensitive) return { index, header, field: "ignore", dropped: sensitive };
    const want = override?.[index] ?? suggested.get(index) ?? "ignore";
    if (want === "ignore") return { index, header, field: "ignore", dropped: null };
    if (!isVaultField(want)) return { index, header, field: "ignore", dropped: "ฟิลด์นี้ไม่ได้ใช้ใน Data Vault" };
    if (!allowed.includes(want)) {
      return { index, header, field: "ignore", dropped: "อยู่นอกฟิลด์ที่แหล่งข้อมูลนี้เลือกไว้ — ไม่เก็บ" };
    }
    if (used.has(want)) return { index, header, field: "ignore", dropped: "มีคอลัมน์อื่นเป็นฟิลด์นี้แล้ว" };
    used.add(want);
    return { index, header, field: want, dropped: null };
  });
}

/** ตัดสินสถานะของหนึ่งแถว — ใช้ทั้งตอนประมาณใน analyse และตอนเก็บจริง */
export function judgeRow(cells: string[], columns: ColumnPlan[], issue: string | null = null): {
  status: ImportRowStatus; reason: string | null; values: Partial<Record<VaultField, string>>;
} {
  if (cells.every((c) => !c.trim())) return { status: "rejected", reason: "แถวว่าง", values: {} };
  if (issue) return { status: "rejected", reason: issue, values: {} };
  const values: Partial<Record<VaultField, string>> = {};
  for (const c of columns) {
    if (c.field === "ignore") continue;
    const v = (cells[c.index] ?? "").trim();
    if (v) values[c.field] = v;
  }
  const notes: string[] = [];
  if (values.email && !EMAIL.test(values.email)) {
    notes.push("อีเมลรูปแบบผิด");
    delete values.email;
  }
  if (!IDENTIFYING_FIELDS.some((f) => values[f])) {
    return {
      status: "rejected",
      reason: notes.length ? `${notes.join(" · ")} และไม่มีชื่อหรือเบอร์ — ชี้ไปหาใครไม่ได้` : "ไม่มีชื่อ อีเมล หรือเบอร์ — ชี้ไปหาใครไม่ได้",
      values: {},
    };
  }
  if (values.email && /^(info|sales|contact|admin|hello|office|marketing|hr|support)@/i.test(values.email)) {
    notes.push("อีเมลกลางของบริษัท — ผูกกับองค์กร ไม่ใช่คน");
  }
  return { status: "pending_review", reason: notes.length ? notes.join(" · ") : null, values };
}

type ScanRead =
  | { error: string; threat: boolean }
  | { scan: Extract<Awaited<ReturnType<typeof scanFile>>, { ok: true }>; table: ReturnType<typeof readTable> };

async function scanAndRead(bytes: Uint8Array, filename: string): Promise<ScanRead> {
  const scan = await scanFile(bytes, filename);
  if (!scan.ok) return { error: scan.reason, threat: scan.threat ?? false };
  let table;
  try {
    table = readTable(bytes, scan.kind);
  } catch (e) {
    if (e instanceof TableTooLarge) return { error: e.message, threat: false };
    return { error: "อ่านไฟล์ไม่ได้ — ไฟล์อาจเสียหรือถูกป้องกันด้วยรหัสผ่าน", threat: false };
  }
  if (!table.headers.some((h) => h.trim())) return { error: "ไม่พบแถวหัวคอลัมน์ในไฟล์", threat: false };
  if (!table.rows.length) return { error: "เจอหัวคอลัมน์ แต่ไม่มีข้อมูลสักแถว", threat: false };
  return { scan, table };
}

export async function analyseUpload(
  tenantId: string, sourceId: string, bytes: Uint8Array, filename: string, actor: string,
): Promise<AnalyseResult> {
  const source = await loadSource(tenantId, sourceId);
  if (typeof source === "string") return { ok: false, error: source };
  const read = await scanAndRead(bytes, filename);
  if ("error" in read) {
    if (read.threat) await logActivity(tenantId, actor, "upload_blocked", `${sourceId} · ${sha256(bytes).slice(0, 16)}`);
    return { ok: false, error: read.error };
  }
  const { scan, table } = read;
  const digest = sha256(bytes);
  const dup = await get<{ id: string; uploaded_at: string }>(
    "SELECT id, uploaded_at FROM import_batches WHERE tenant_id = ? AND sha256 = ?", tenantId, digest,
  );

  const mapped = await mapColumns(tenantId, table.headers, table.rows.slice(0, 3));
  const suggested = new Map<number, string>();
  mapped.value.mappings.forEach((m) => {
    const i = table.headers.indexOf(m.column);
    if (i >= 0) suggested.set(i, m.field);
  });
  const columns = planColumns(table.headers, suggested, source.fields);
  const estimate: Record<ImportRowStatus, number> = { accepted: 0, rejected: 0, pending_review: 0, suspended: 0 };
  table.rows.forEach((r, i) => estimate[judgeRow(r, columns, table.issues[i]).status]++);

  return {
    ok: true, filename, sha256: digest, bytes: bytes.byteLength, kind: scan.kind, encoding: table.encoding,
    sheet: table.sheet, otherSheets: table.otherSheets, scanEngine: scan.engine, scanNote: scan.note,
    columns, mappingSource: mapped.source, mappingNote: mapped.note, rows: table.rows.length, estimate,
    duplicateOf: dup ? { batchId: dup.id, at: dup.uploaded_at } : null,
  };
}

export type CommitResult =
  | { ok: true; batchId: string; total: number; counts: Record<ImportRowStatus, number>; storedFields: VaultField[] }
  | { ok: false; error: string };

export async function commitUpload(
  tenantId: string, sourceId: string, bytes: Uint8Array, filename: string,
  override: Record<number, string>, expectedSha: string, actor: string,
): Promise<CommitResult> {
  const source = await loadSource(tenantId, sourceId);
  if (typeof source === "string") return { ok: false, error: source };
  const digest = sha256(bytes);
  if (digest !== expectedSha) return { ok: false, error: "ไฟล์ที่ส่งมาไม่ใช่ไฟล์เดียวกับที่ตรวจไว้ — เริ่มใหม่อีกครั้ง" };
  const read = await scanAndRead(bytes, filename);
  if ("error" in read) return { ok: false, error: read.error };
  const { scan, table } = read;
  const dup = await get<{ id: string }>("SELECT id FROM import_batches WHERE tenant_id = ? AND sha256 = ?", tenantId, digest);
  if (dup) return { ok: false, error: "ไฟล์นี้นำเข้าแล้ว — การนำเข้าซ้ำจะไม่สร้างข้อมูลซ้ำ ดูผลของชุดเดิมได้" };

  const columns = planColumns(table.headers, new Map(), source.fields, override);
  const storedFields = columns.filter((c) => c.field !== "ignore").map((c) => c.field as VaultField);
  if (!storedFields.some((f) => IDENTIFYING_FIELDS.includes(f))) {
    return { ok: false, error: "ยังไม่มีคอลัมน์ไหนเป็นชื่อ อีเมล หรือเบอร์ — ทุกแถวจะถูกปฏิเสธ จับคู่คอลัมน์ก่อน" };
  }

  const batchId = randomUUID();
  const now = new Date().toISOString();
  const counts: Record<ImportRowStatus, number> = { accepted: 0, rejected: 0, pending_review: 0, suspended: 0 };
  const rows = table.rows.map((cells, i) => {
    const line = table.lines[i]; // บรรทัดจริงในไฟล์ (หรือแถวในชีต)
    const j = judgeRow(cells, columns, table.issues[i]);
    counts[j.status]++;
    const payload = j.status === "rejected" ? null : sealRecord(tenantId, "import_row", JSON.stringify(j.values));
    return [tenantId, batchId, line, j.status, j.reason, `${filename}#${line}`, null, payload, now];
  });

  await tx(async (q) => {
    await q.run(
      `INSERT INTO import_batches (id, tenant_id, source_id, filename, sha256, bytes, rows_total, status, uploaded_by, uploaded_at, finished_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      batchId, tenantId, sourceId, filename.slice(0, 200), digest, bytes.byteLength, rows.length, "completed", actor, now, now,
    );
    await insertMany(q, "import_rows",
      ["tenant_id", "batch_id", "line", "status", "reason", "source_ref", "customer_id", "payload_enc", "recorded_at"], rows);
    await logActivity(tenantId, actor, "import_batch",
      `${batchId} · ${rows.length} rows · ${counts.pending_review} pending · ${counts.rejected} rejected · scan ${scan.engine}`);
  });
  return { ok: true, batchId, total: rows.length, counts, storedFields };
}
