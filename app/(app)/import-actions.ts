"use server";

import { revalidatePath } from "next/cache";
import { mapColumns, type AiSource } from "@/lib/engine/ai";
import { buildPreview, commitImport, parseCsv } from "@/lib/engine/ingest";
import type {
  ColumnMapping,
  ImportField,
  ImportPreview,
  ImportResult,
} from "@/lib/shared/ingest-types";
import { getActiveTenantId } from "@/lib/shared/active-tenant";

/* ── Server Actions ของหน้านำเข้าข้อมูล ─────────────────────────
   แยกไฟล์จาก actions.ts เพราะรับ payload ใหญ่ (เนื้อไฟล์ CSV)
   ───────────────────────────────────────────────────────────── */

const MAX_CHARS = 4_000_000; // ~4MB ของข้อความ

export type AnalyseResult = {
  ok: true;
  headers: string[];
  sample: string[][];
  mapping: ColumnMapping;
  mappingSource: AiSource;
  mappingNote?: string;
  preview: ImportPreview;
} | { ok: false; error: string };

export async function analyseCsv(csvText: string): Promise<AnalyseResult> {
  if (!csvText || csvText.trim().length === 0) {
    return { ok: false, error: "The file is empty" };
  }
  if (csvText.length > MAX_CHARS) {
    return {
      ok: false,
      error: `File is over ${Math.round(MAX_CHARS / 1_000_000)}MB — split it and import in parts`,
    };
  }

  const parsed = parseCsv(csvText);
  if (!parsed.headers.length) {
    return { ok: false, error: "Could not read the header row — check this is really a CSV" };
  }
  if (!parsed.rows.length) {
    return { ok: false, error: "Headers found, but no data rows" };
  }

  const mapped = await mapColumns(parsed.headers, parsed.rows.slice(0, 3));
  const preview = buildPreview(parsed, mapped.value);

  return {
    ok: true,
    headers: parsed.headers,
    sample: parsed.rows.slice(0, 5),
    mapping: mapped.value,
    mappingSource: mapped.source,
    mappingNote: mapped.note,
    preview,
  };
}

/** ผู้ใช้แก้การแม็ปเองแล้วดูผลใหม่ ไม่เรียก AI ซ้ำ */
export async function repreview(
  csvText: string,
  mapping: ColumnMapping,
): Promise<ImportPreview> {
  const parsed = parseCsv(csvText);
  return buildPreview(parsed, mapping);
}

export type CommitOutcome =
  | { ok: true; result: ImportResult }
  | { ok: false; error: string };

export async function commitCsv(
  csvText: string,
  mapping: ColumnMapping,
  replace: boolean,
): Promise<CommitOutcome> {
  try {
    const parsed = parseCsv(csvText);
    const result = await commitImport(await getActiveTenantId(), parsed, mapping, { replace });
    for (const p of [
      "/app", "/app/plays", "/app/campaigns", "/app/proof",
      "/app/customers", "/app/import",
    ]) {
      revalidatePath(p);
    }
    return { ok: true, result };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Import failed",
    };
  }
}

export type { ImportField, ColumnMapping };
