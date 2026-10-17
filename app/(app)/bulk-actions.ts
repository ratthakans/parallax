"use server";

import { revalidatePath } from "next/cache";
import { denied, viewer } from "@/app/(app)/viewer";
import { bulkDeals, bulkOrgs, MAX_BULK, type BulkResult, type DealBulk, type OrgBulk } from "@/lib/engine/bulk";
import type { ActionState } from "@/lib/shared/action-state";

/* ── ทำทีละหลายรายการ (docs/crm-plan.md E3) ── สิทธิ์ write · ทุกแถวตรวจด่านบริษัทและเขียนประวัติเหมือนแก้ทีละแถว */

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");
const idsOf = (fd: FormData) => fd.getAll("ids").map(String).filter(Boolean);

function summary(r: BulkResult): ActionState {
  if (!r.done && r.skipped.length) return { error: `ไม่ได้เปลี่ยนเลย — ${r.skipped[0].reason}` };
  const reasons = [...new Set(r.skipped.map((s) => s.reason))].slice(0, 2).join(" · ");
  return { ok: `เปลี่ยนแล้ว ${r.done} รายการ${r.skipped.length ? ` · ข้าม ${r.skipped.length} (${reasons})` : ""}` };
}

export async function bulkOrgsAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "write");
  if (no) return { error: no };
  const ids = idsOf(fd);
  if (!ids.length) return { error: "ติ๊กเลือกบริษัทก่อน" };
  if (ids.length > MAX_BULK) return { error: `เลือกได้ครั้งละไม่เกิน ${MAX_BULK} รายการ` };
  const kind = str(fd, "op");
  const op: OrgBulk | null = kind === "owner" ? { kind, owner: str(fd, "owner") }
    : kind === "team" ? { kind, teamId: str(fd, "teamId") }
    : kind.startsWith("cf.") ? { kind: "field", fieldId: kind.slice(3), value: str(fd, "value") } : null;
  if (!op) return { error: "เลือกว่าจะเปลี่ยนอะไร" };
  const r = await bulkOrgs(v.tenantId, ids, op, { id: v.actor, clearance: v.clearance });
  revalidatePath("/app/accounts");
  return summary(r);
}

export async function bulkDealsAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "write");
  if (no) return { error: no };
  const ids = idsOf(fd);
  if (!ids.length) return { error: "ติ๊กเลือกดีลก่อน" };
  if (ids.length > MAX_BULK) return { error: `เลือกได้ครั้งละไม่เกิน ${MAX_BULK} รายการ` };
  const kind = str(fd, "op");
  const op: DealBulk | null = kind === "owner" ? { kind, owner: str(fd, "owner") }
    : kind === "stage" ? { kind, stage: str(fd, "stage") }
    : kind === "forecast" ? { kind, category: str(fd, "category") }
    : kind.startsWith("df.") ? { kind: "field", fieldId: kind.slice(3), value: str(fd, "value") } : null;
  if (!op) return { error: "เลือกว่าจะเปลี่ยนอะไร" };
  const r = await bulkDeals(v.tenantId, ids, op, { id: v.actor, clearance: v.clearance });
  revalidatePath("/app/deals");
  return summary(r);
}
