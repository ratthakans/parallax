import { randomUUID } from "node:crypto";
import { all, get, run } from "@/lib/engine/sql";
import { logActivity } from "@/lib/engine/db";
import { maskContact, normaliseContact, openRecord } from "@/lib/engine/pii";

/* ── สุ่มตรวจโดย data steward (docs/plan.md หัวข้อ 5.3 · Blueprint 2.0 บท 4) ─────

   "ความแม่นยำการรวมตัวตน วัดกับชุดตัวอย่างที่คนตรวจ — รายงานทั้งรวมผิดและพลาดซ้ำ
    สุ่มจริง ไม่เลือกเฉพาะผลดี · ความมั่นใจของโมเดลไม่ใช่ค่าความแม่นยำ"

   สองแบบ:
     merge  — สุ่มคนที่ระบบรวมจากหลายแถว → steward ดูทุกแถวว่าเป็นคนเดียวกันจริงไหม (วัดรวมผิด)
     missed — สุ่มคนใดก็ได้ → ดูคนที่ชื่อคล้ายกันที่ระบบไม่ได้รวมและไม่ได้ส่งเข้าคิว (วัดพลาดซ้ำ)
   ระบบเลือกให้ด้วย RANDOM() ผู้ตรวจเลือกเองไม่ได้ และคนที่ตรวจแล้วไม่ถูกสุ่มซ้ำ */

export type SampleMode = "merge" | "missed";
export const SAMPLE_VERDICTS = ["merge_ok", "merge_wrong", "no_missed", "missed"] as const;
export type SampleVerdict = (typeof SAMPLE_VERDICTS)[number];

export type SampleRow = { file: string; line: number; name: string; company: string; title: string; email: string; phone: string };
export type Sample = {
  mode: SampleMode; customerId: string; name: string; rows: SampleRow[];
  candidates: { id: string; name: string; company: string | null }[];
};

const mask = (kind: "email" | "phone", v?: string) => {
  const n = v ? normaliseContact(kind, v) : null;
  return n ? maskContact(kind, n) : "";
};

/** แถวต้นทางของคนหนึ่งคน (ช่องทางแบบปิดบาง) — ใช้ทั้งการสุ่มตรวจปกติและการสุ่มตรวจหลังรวมเป็นชุด (S5) */
export async function sampleRowsOf(tenantId: string, customerId: string): Promise<SampleRow[]> {
  const raw = await all<{ filename: string; line: number | string; payload_enc: string }>(
    `SELECT b.filename, r.line, r.payload_enc FROM import_rows r
     JOIN import_batches b ON b.id = r.batch_id AND b.tenant_id = r.tenant_id
     WHERE r.tenant_id = ? AND r.customer_id = ? AND r.payload_enc IS NOT NULL ORDER BY b.uploaded_at, r.line LIMIT 50`,
    tenantId, customerId,
  );
  return raw.map((r) => {
    const v = JSON.parse(openRecord(tenantId, "import_row", r.payload_enc)) as Record<string, string | undefined>;
    const name = v.customer_name || [v.first_name, v.last_name].filter(Boolean).join(" ");
    return {
      file: r.filename, line: Number(r.line), name, company: v.company ?? "", title: v.job_title ?? "",
      email: mask("email", v.email), phone: mask("phone", v.phone),
    };
  });
}

export async function drawSample(tenantId: string, mode: SampleMode): Promise<Sample | null> {
  /* merge: คนที่มีแถวต้นทาง ≥ 2 แถว (ระบบตัดสินรวม) · missed: คนที่มาจาก Data Vault คนใดก็ได้ */
  const pick = await get<{ id: string; name: string }>(
    `SELECT c.id, c.name FROM customers c
     WHERE c.tenant_id = ?
       AND (SELECT COUNT(*) FROM import_rows r WHERE r.tenant_id = c.tenant_id AND r.customer_id = c.id) >= ?
       AND NOT EXISTS (SELECT 1 FROM sample_checks s WHERE s.tenant_id = c.tenant_id AND s.customer_id = c.id
                       AND s.verdict IN (${mode === "merge" ? "'merge_ok','merge_wrong'" : "'no_missed','missed'"}))
     ORDER BY RANDOM() LIMIT 1`,
    tenantId, mode === "merge" ? 2 : 1,
  );
  if (!pick) return null;
  const rows = await sampleRowsOf(tenantId, pick.id);
  let candidates: Sample["candidates"] = [];
  if (mode === "missed") {
    /* ชื่อคล้าย: มีคำใดคำหนึ่งของชื่อ (ยาว ≥ 3) ร่วมกัน — ตัวช่วยให้ steward ไม่ใช่คำตัดสิน */
    const tokens = pick.name.split(/\s+/).filter((t) => t.length >= 3).slice(0, 3);
    if (tokens.length) {
      candidates = (await all<{ id: string; name: string; company: string | null }>(
        `SELECT c.id, c.name, p.company FROM customers c LEFT JOIN contact_profiles p ON p.customer_id = c.id
         WHERE c.tenant_id = ? AND c.id <> ? AND (${tokens.map(() => "c.name LIKE ?").join(" OR ")})
         ORDER BY c.name LIMIT 8`,
        tenantId, pick.id, ...tokens.map((t) => `%${t}%`),
      ));
    }
  }
  return { mode, customerId: pick.id, name: pick.name, rows, candidates };
}

export async function recordSample(tenantId: string, customerId: string, verdict: SampleVerdict, actor: string, note?: string) {
  if (!SAMPLE_VERDICTS.includes(verdict)) return { ok: false as const, error: "ผลตรวจไม่ถูกต้อง" };
  const c = await get("SELECT 1 AS x FROM customers WHERE tenant_id = ? AND id = ?", tenantId, customerId);
  if (!c) return { ok: false as const, error: "ไม่พบคนนี้ — อาจถูกรวมหรือลบไปแล้ว สุ่มใหม่" };
  await run(
    "INSERT INTO sample_checks (id, tenant_id, customer_id, verdict, checked_by, checked_at, note) VALUES (?,?,?,?,?,?,?)",
    randomUUID(), tenantId, customerId, verdict, actor, new Date().toISOString(), note?.slice(0, 500) ?? null,
  );
  await logActivity(tenantId, actor, "sample_check", `${customerId} · ${verdict}`);
  return { ok: true as const };
}

/** ผลที่วัดจากการสุ่มตรวจ — ตัวเลขจริง พร้อมขนาดตัวอย่าง ไม่ใช่ความมั่นใจของกฎ */
export async function sampleStats(tenantId: string) {
  const rows = await all<{ verdict: string; n: number | string }>(
    "SELECT verdict, COUNT(*) AS n FROM sample_checks WHERE tenant_id = ? GROUP BY verdict", tenantId,
  );
  const n = (v: SampleVerdict) => Number(rows.find((r) => r.verdict === v)?.n ?? 0);
  const merged = n("merge_ok") + n("merge_wrong");
  const missedN = n("no_missed") + n("missed");
  return {
    mergeChecked: merged, mergeWrong: n("merge_wrong"), precision: merged ? n("merge_ok") / merged : null,
    missedChecked: missedN, missed: n("missed"), missRate: missedN ? n("missed") / missedN : null,
  };
}
