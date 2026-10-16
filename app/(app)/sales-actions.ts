"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { denied, viewer } from "@/app/(app)/viewer";
import { assignTarget, buildTargets, createCampaign, recordOutcome, updateCriteria } from "@/lib/engine/campaigns";
import { setBasis } from "@/lib/engine/policy";
import { adoptTemplate } from "@/lib/engine/policy/templates";
import { setRetentionRule } from "@/lib/engine/retention";
import { recordPreference } from "@/lib/engine/policy/preferences";
import type { ActionState } from "@/lib/shared/action-state";
import { draftForTarget, markDraftSent } from "@/lib/engine/campaigns/draft";
import type { Criteria, DraftState } from "@/lib/shared/policy";

/* ── Campaign Workspace (docs/plan.md B5) ─────────────────────────
   บัญชี ผู้กระทำ และธงทีม PARALLAX มาจากฝั่งเซิร์ฟเวอร์เสมอ (viewer.ts) */

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");
const words = (v: string) => v.split(/[,，·\n]/).map((x) => x.trim()).filter(Boolean);

function criteriaOf(fd: FormData): Criteria {
  return {
    titleKeywords: words(str(fd, "titleKeywords")),
    program: str(fd, "program"),
    roles: words(str(fd, "roles")),
    sinceEdition: str(fd, "sinceEdition"),
    industry: str(fd, "industry"),
    excludeOpenOpportunities: fd.get("excludeOpenOpportunities") === "1",
    maxPerOrg: Number(str(fd, "maxPerOrg")) || 2,
    warmPath: (["direct", "any"] as const).find((w) => w === str(fd, "warmPath")),
    interactedWithinDays: Number(str(fd, "interactedWithinDays")) || undefined,
    quietForDays: Number(str(fd, "quietForDays")) || undefined,
  };
}

export async function createCampaignAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "campaign");
  if (no) return { error: no };
  const res = await createCampaign(v.tenantId, {
    name: str(fd, "name"), offer: str(fd, "offer"), purposeId: str(fd, "purposeId"), channel: str(fd, "channel"),
    messageKind: str(fd, "messageKind"), disclosurePurposeId: str(fd, "disclosurePurposeId") || undefined,
    criteria: criteriaOf(fd), startsAt: str(fd, "startsAt"), endsAt: str(fd, "endsAt"),
  }, v.actor);
  if (!res.ok) return { error: res.error };
  revalidatePath("/app/sales");
  redirect(`/app/sales/${res.id}`);
}

export async function updateCriteriaAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "campaign");
  if (no) return { error: no };
  const id = str(fd, "campaignId");
  const res = await updateCriteria(v.tenantId, id, criteriaOf(fd), v.actor);
  if (!res.ok) return { error: res.error };
  revalidatePath(`/app/sales/${id}`);
  return { ok: "บันทึกเกณฑ์แล้ว — กด “สร้างรายชื่อ” เพื่อใช้เกณฑ์ใหม่" };
}

export async function buildTargetsAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "campaign");
  if (no) return { error: no };
  const id = str(fd, "campaignId");
  const res = await buildTargets(v.tenantId, id, v.actor);
  if (!res.ok) return { error: res.error };
  revalidatePath(`/app/sales/${id}`);
  return {
    ok: `${res.people} คน จาก ${res.orgs} บริษัท · ใช้ได้ ${res.eligible} · ต้องตรวจก่อน ${res.review} · ห้ามติดต่อ ${res.suppressed} · ช่องทางใช้ไม่ได้ ${res.channelInvalid}`
      + (res.orgsOverCap ? ` · เกินเพดาน pilot ${res.orgsOverCap} บริษัท (ไม่ได้ใส่)` : ""),
  };
}

export async function assignTargetAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "campaign");
  if (no) return { error: no };
  const res = await assignTarget(v.tenantId, str(fd, "targetId"), str(fd, "assignee") || v.actor, str(fd, "dueOn"), v.actor, v.isStaff);
  if (!res.ok) return { error: res.reasons?.length ? `${res.error}: ${res.reasons.join(" · ")}` : res.error };
  revalidatePath(`/app/sales/${str(fd, "campaignId")}`);
  return { ok: "มอบหมายแล้ว — นโยบายตรวจซ้ำแล้ว ณ ตอนนี้" };
}

/* ── มอบหมายหลายคนทีเดียว (docs/ux-plan.md U5) ── ทีละคนผ่าน assignTarget เดิม (ตรวจนโยบายซ้ำทุกคน)
   คนที่นโยบายไม่ผ่านแล้วถูกข้ามพร้อมบอกจำนวน — ไม่ล้มทั้งชุด */
export async function bulkAssignAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "campaign");
  if (no) return { error: no };
  const ids = [...new Set(fd.getAll("targetIds").map(String))].slice(0, 200);
  if (!ids.length) return { error: "เลือกเป้าหมายอย่างน้อยหนึ่งคน" };
  const assignee = str(fd, "assignee").trim() || v.actor;
  let done = 0;
  const refused: string[] = [];
  for (const id of ids) {
    const res = await assignTarget(v.tenantId, id, assignee, str(fd, "dueOn"), v.actor, v.isStaff);
    if (res.ok) done++;
    else refused.push(res.error);
  }
  revalidatePath(`/app/sales/${str(fd, "campaignId")}`);
  if (!done) return { error: `มอบหมายไม่ได้: ${refused[0] ?? "ไม่ทราบสาเหตุ"}` };
  return { ok: `มอบหมายให้ ${assignee} แล้ว ${done} คน${refused.length ? ` · ข้าม ${refused.length} คน (นโยบายไม่ผ่านหรือปิดไปแล้ว)` : ""}` };
}

export async function recordOutcomeAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "write");
  if (no) return { error: no };
  const value = Number(str(fd, "value").replace(/[^\d.]/g, ""));
  const res = await recordOutcome(v.tenantId, str(fd, "targetId"), {
    outcome: str(fd, "outcome"), note: str(fd, "note"), nextStep: str(fd, "nextStep"), nextDue: str(fd, "nextDue"),
    value: Number.isFinite(value) && value > 0 ? value : undefined,
  }, v.actor, v.isStaff);
  if (!res.ok) return { error: res.reasons?.length ? `${res.error}: ${res.reasons.join(" · ")}` : res.error };
  revalidatePath(`/app/sales/${str(fd, "campaignId")}`);
  revalidatePath("/app/tasks");
  revalidatePath("/app/today");
  return { ok: "บันทึกผลแล้ว — ลงไทม์ไลน์ของบริษัทด้วย" };
}

/* ── ร่างข้อความหลังผ่านนโยบาย (docs/solo-plan.md S7) ──
   ร่างไม่ถูกเก็บและไม่ส่งจากระบบ · ทั้งตอนร่างและตอนกด "ส่งแล้ว" ตรวจนโยบายซ้ำในเครื่องยนต์ (draft.ts) */
export async function draftMessageAction(_p: DraftState, fd: FormData): Promise<DraftState> {
  const v = await viewer();
  const no = denied(v, "write");
  if (no) return { error: no };
  const res = await draftForTarget(v.tenantId, str(fd, "targetId"), { id: v.actor, clearance: v.clearance });
  if (!res.ok) return { error: res.reasons?.length ? `${res.error}: ${res.reasons.join(" · ")}` : res.error };
  return {
    ok: res.draft.generatedBy === "ai" ? "ร่างด้วย AI จากหลักฐานที่คุณเห็นได้ — อ่านและแก้ก่อนส่ง" : "ร่างจากแม่แบบ — อ่านและแก้ก่อนส่ง",
    draft: res.draft,
  };
}

export async function markDraftSentAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "write");
  if (no) return { error: no };
  const res = await markDraftSent(v.tenantId, str(fd, "targetId"), v.actor, v.isStaff);
  if (!res.ok) return { error: res.reasons?.length ? `${res.error}: ${res.reasons.join(" · ")}` : res.error };
  revalidatePath(`/app/sales/${str(fd, "campaignId")}`);
  return { ok: "บันทึกว่าส่งแล้ว — นโยบายตรวจซ้ำแล้ว ณ ตอนนี้ และลงไทม์ไลน์ของบริษัท" };
}

export async function recordPreferenceAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  /* ถอน · คัดค้าน · ขอจำกัด เป็นการปกป้องเจ้าของข้อมูล — ใครในบัญชีก็บันทึกได้
     ความยินยอมทำให้คนที่ "ต้องตรวจก่อน" กลายเป็น "ใช้ได้" จึงต้องเป็นบทบาทที่เขียนได้ */
  const no = str(fd, "kind") === "consent" ? denied(v, "write") : null;
  if (no) return { error: no };
  const res = await recordPreference(v.tenantId, str(fd, "customerId"), {
    kind: str(fd, "kind"), purposeId: str(fd, "purposeId") || null, channel: str(fd, "channel") || "any", evidence: str(fd, "evidence"),
  }, v.actor);
  if (!res.ok) return { error: res.error };
  const back = str(fd, "back");
  if (back.startsWith("/app/")) revalidatePath(back);
  return { ok: res.cancelled ? `บันทึกแล้ว — ยกเลิกเป้าหมายแคมเปญและงานที่ค้าง ${res.cancelled} รายการตามนโยบาย` : "บันทึกแล้ว" };
}

export async function setBasisAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "policy");
  if (no) return { error: no };
  const res = await setBasis(v.tenantId, str(fd, "purposeId"), { lawfulBasis: str(fd, "lawfulBasis"), liaRef: str(fd, "liaRef"), dataScope: str(fd, "dataScope") }, v.actor);
  if (!res.ok) return { error: res.error };
  revalidatePath("/app/sales/purposes");
  return { ok: `บันทึกฐานรุ่น ${res.version} แล้ว — รุ่นเดิมยังอยู่ในประวัติ` };
}

/* แม่แบบวัตถุประสงค์ (docs/solo-plan.md S4) — การเลือกฐานเป็นการตัดสินของเจ้าของบัญชีเหมือนตั้งฐานเอง */
export async function adoptTemplateAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "policy");
  if (no) return { error: no };
  const res = await adoptTemplate(v.tenantId, str(fd, "code"), str(fd, "confirmation"), v.actor);
  if (!res.ok) return { error: res.error };
  revalidatePath("/app/sales/purposes");
  return { ok: res.existed ? "บัญชีนี้ใช้แม่แบบนี้อยู่แล้ว" : "สร้างวัตถุประสงค์และฐานรุ่น 1 จากแม่แบบแล้ว" };
}

/* กฎอายุข้อมูลต่อวัตถุประสงค์ (B6) — การตัดสินของเจ้าของบัญชีเหมือนการตั้งฐาน */
export async function setRetentionRuleAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "policy");
  if (no) return { error: no };
  const res = await setRetentionRule(v.tenantId, str(fd, "purposeId"), {
    days: Number(str(fd, "days")), trigger: str(fd, "trigger"), legalHold: fd.get("legalHold") === "1", note: str(fd, "note"),
  }, v.actor);
  if (!res.ok) return { error: res.error };
  revalidatePath("/app/sales/purposes");
  revalidatePath("/app/today");
  return { ok: "บันทึกกฎอายุข้อมูลแล้ว — กฎเดิมยังอยู่ในประวัติ" };
}
