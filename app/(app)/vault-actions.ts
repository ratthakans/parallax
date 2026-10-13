"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { activeTenantId } from "@/app/(app)/tenant";
import { currentUser } from "@/lib/shared/session";
import { registerSource } from "@/lib/engine/vault/sources";
import { analyseUpload, commitUpload, type AnalyseResult, type CommitResult } from "@/lib/engine/vault/intake";
import { MAX_UPLOAD_BYTES } from "@/lib/engine/vault/scan";
import { resolveTenant, type ResolveStats } from "@/lib/engine/vault/resolve";
import { decideReview, unmerge } from "@/lib/engine/vault/merge";
import { recordSample, type SampleVerdict } from "@/lib/engine/vault/sample";
import { messageOf, type ActionState } from "@/lib/shared/action-state";
import type { SourceKind } from "@/lib/shared/vault";

/* ── Data Vault (docs/plan.md B2) ─────────────────────────────────

   บัญชีมาจากฝั่งเซิร์ฟเวอร์เสมอ · ไฟล์ส่งมาเป็นไบต์ดิบ ไม่ถอดรหัสที่เบราว์เซอร์
   (เดาอักษร Windows-874 และอ่าน xlsx ที่เซิร์ฟเวอร์ ซึ่งตรวจไฟล์ก่อนแตะเนื้อในได้) */

async function scope(): Promise<{ tenantId: string; actor: string }> {
  const tenantId = await activeTenantId();
  const user = await currentUser();
  return { tenantId, actor: user?.email || "owner" };
}

export async function registerSourceAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { tenantId, actor } = await scope();
  const res = await registerSource(
    tenantId,
    {
      name: String(fd.get("name") ?? ""),
      kind: String(fd.get("kind") ?? "file") as SourceKind,
      purposeId: String(fd.get("purposeId") ?? "") || undefined,
      newPurpose: String(fd.get("newPurpose") ?? "") || undefined,
      scopeNote: String(fd.get("scopeNote") ?? ""),
      acquisitionNote: String(fd.get("acquisitionNote") ?? ""),
      fields: fd.getAll("fields").map(String),
    },
    actor,
  );
  if (!res.ok) return { error: res.error };
  revalidatePath("/app/vault");
  redirect(`/app/vault/sources/${res.id}`);
}

async function fileOf(fd: FormData): Promise<{ bytes: Uint8Array; name: string } | string> {
  const f = fd.get("file");
  if (!(f instanceof File)) return "ไม่พบไฟล์ — เลือกไฟล์ใหม่";
  if (f.size > MAX_UPLOAD_BYTES) return `ไฟล์ใหญ่เกิน ${MAX_UPLOAD_BYTES / 1_000_000}MB — แบ่งไฟล์แล้วนำเข้าทีละส่วน`;
  return { bytes: new Uint8Array(await f.arrayBuffer()), name: f.name };
}

export async function analyseUploadAction(fd: FormData): Promise<AnalyseResult> {
  const { tenantId, actor } = await scope();
  const file = await fileOf(fd);
  if (typeof file === "string") return { ok: false, error: file };
  return analyseUpload(tenantId, String(fd.get("sourceId") ?? ""), file.bytes, file.name, actor);
}

export type CommitWithResolve = CommitResult & { resolved?: ResolveStats | null; resolveError?: string };

export async function commitUploadAction(fd: FormData): Promise<CommitWithResolve> {
  const { tenantId, actor } = await scope();
  const file = await fileOf(fd);
  if (typeof file === "string") return { ok: false, error: file };
  let override: Record<number, string> = {};
  try {
    override = JSON.parse(String(fd.get("mapping") ?? "{}")) as Record<number, string>;
  } catch {
    return { ok: false, error: "การจับคู่คอลัมน์อ่านไม่ได้ — เริ่มใหม่อีกครั้ง" };
  }
  const res = await commitUpload(
    tenantId, String(fd.get("sourceId") ?? ""), file.bytes, file.name, override, String(fd.get("sha256") ?? ""), actor,
  );
  if (!res.ok) return res;
  /* ตรวจตัวตนต่อทันที — ถ้าล้ม แถวยังอยู่ในสถานะรอตรวจ และสั่งตรวจใหม่ได้จากหน้าคิวตรวจ */
  let resolved: ResolveStats | null = null, resolveError: string | undefined;
  try {
    resolved = await resolveTenant(tenantId, actor);
  } catch (err) {
    resolveError = messageOf(err);
  }
  revalidatePath("/app/vault");
  return { ...res, resolved, resolveError };
}

export async function resolveNowAction(_prev: ActionState): Promise<ActionState> {
  const { tenantId, actor } = await scope();
  try {
    const s = await resolveTenant(tenantId, actor);
    revalidatePath("/app/vault");
    return { ok: s.rows ? `ตรวจ ${s.rows.toLocaleString()} แถว → ${s.people.toLocaleString()} คน · เข้าคิว ${s.personPairs.toLocaleString()} คู่` : "ไม่มีแถวรอตรวจ" };
  } catch (err) {
    return { error: messageOf(err) };
  }
}

export async function decideReviewAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { tenantId, actor } = await scope();
  const verdict = String(fd.get("verdict") ?? "");
  if (verdict !== "same" && verdict !== "different") return { error: "คำตัดสินไม่ถูกต้อง" };
  const res = await decideReview(tenantId, String(fd.get("reviewId") ?? ""), verdict, actor, String(fd.get("note") ?? "") || undefined);
  if (!res.ok) return { error: res.error };
  revalidatePath("/app/vault/review");
  return { ok: verdict === "same" ? "รวมแล้ว — ย้อนได้จากประวัติการรวม" : "บันทึกว่าไม่ใช่คนเดียวกัน — จะไม่เสนอซ้ำ" };
}

export async function unmergeAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { tenantId, actor } = await scope();
  const res = await unmerge(tenantId, String(fd.get("mergeId") ?? ""), actor);
  if (!res.ok) return { error: res.error };
  revalidatePath("/app/vault/review");
  return { ok: "แยกคืนแล้ว — บันทึกว่าไม่ใช่คนเดียวกัน" };
}

export async function recordSampleAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { tenantId, actor } = await scope();
  const res = await recordSample(
    tenantId, String(fd.get("customerId") ?? ""), String(fd.get("verdict") ?? "") as SampleVerdict, actor,
    String(fd.get("note") ?? "") || undefined,
  );
  if (!res.ok) return { error: res.error };
  revalidatePath("/app/vault/review");
  return { ok: "บันทึกผลตรวจแล้ว" };
}
