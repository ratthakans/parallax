"use server";

import { revalidatePath } from "next/cache";
import { denied, viewer } from "@/app/(app)/viewer";
import {
  addMemberLink, addRelationship, confirmAffiliation, endAffiliation, endRelationship, logInteraction, setAccountOwner,
  setClassification, setParent, updateOrgField, verifyOrg,
} from "@/lib/engine/accounts/edit";
import { generateBrief } from "@/lib/engine/accounts/brief";
import { orgAccess } from "@/lib/engine/accounts";
import type { ActionState } from "@/lib/shared/action-state";
import type { Classification } from "@/lib/shared/vault";

/* ── Account Workspace (docs/plan.md B4) ─────────────────────────
   บัญชี ผู้กระทำ และระดับสิทธิ์มาจากฝั่งเซิร์ฟเวอร์เสมอ (viewer.ts) */

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");
/* ผู้อ่านในรูปที่ engine ใช้เทียบเจ้าของบัญชี — owner เก็บเป็น actor (อีเมล) */
const who = (v: { actor: string; clearance: Classification }) => ({ id: v.actor, clearance: v.clearance });
const done = (orgId: string, ok: string, res: { ok: true } | { ok: false; error: string }): ActionState => {
  if (!res.ok) return { error: res.error };
  revalidatePath(`/app/accounts/${orgId}`);
  return { ok };
};

export async function updateOrgFieldAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "write");
  if (no) return { error: no };
  const orgId = str(fd, "orgId");
  const gate = await orgAccess(v.tenantId, orgId, who(v));
  if (!gate.ok) return { error: gate.error };
  return done(orgId, "บันทึกแล้ว — ค่าเดิมอยู่ในประวัติรุ่น", await updateOrgField(v.tenantId, orgId, str(fd, "field"), str(fd, "value"), str(fd, "reason"), v.actor));
}

export async function setParentAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "write");
  if (no) return { error: no };
  const orgId = str(fd, "orgId");
  const gate = await orgAccess(v.tenantId, orgId, who(v));
  if (!gate.ok) return { error: gate.error };
  return done(orgId, "บันทึกบริษัทแม่แล้ว", await setParent(v.tenantId, orgId, str(fd, "parentId") || null, str(fd, "reason"), v.actor));
}

export async function setClassificationAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "write");
  if (no) return { error: no };
  const orgId = str(fd, "orgId");
  const gate = await orgAccess(v.tenantId, orgId, who(v));
  if (!gate.ok) return { error: gate.error };
  return done(orgId, "เปลี่ยนระดับความลับแล้ว — สรุปเดิมถูกล้าง", await setClassification(v.tenantId, orgId, str(fd, "level"), v.actor));
}

export async function verifyOrgAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "write");
  if (no) return { error: no };
  const orgId = str(fd, "orgId");
  const gate = await orgAccess(v.tenantId, orgId, who(v));
  if (!gate.ok) return { error: gate.error };
  return done(orgId, "บันทึกการตรวจแล้ว", await verifyOrg(v.tenantId, orgId, v.actor));
}

export async function claimAccountAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "write");
  if (no) return { error: no };
  const orgId = str(fd, "orgId");
  const release = str(fd, "release") === "1";
  const gate = await orgAccess(v.tenantId, orgId, who(v), release ? "edit" : "claim");
  if (!gate.ok) return { error: gate.error };
  return done(orgId, release ? "ปล่อยบัญชีแล้ว" : "คุณเป็นเจ้าของบัญชีนี้แล้ว", await setAccountOwner(v.tenantId, orgId, release ? null : v.actor, v.actor));
}

export async function confirmAffiliationAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "write");
  if (no) return { error: no };
  return done(str(fd, "orgId"), "ยืนยันสังกัดแล้ว", await confirmAffiliation(v.tenantId, str(fd, "affiliationId"), v.actor));
}

export async function endAffiliationAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "write");
  if (no) return { error: no };
  return done(str(fd, "orgId"), "ปิดช่วงสังกัดแล้ว — ประวัติยังอยู่", await endAffiliation(v.tenantId, str(fd, "affiliationId"), str(fd, "endedOn"), str(fd, "reason"), v.actor));
}

export async function addRelationshipAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "write");
  if (no) return { error: no };
  const orgId = str(fd, "orgId");
  /* ปลายทางมาในรูป "kind:id" จากตัวเลือกเดียว */
  const [fromKind, ...f] = str(fd, "from").split(":");
  const [toKind, ...t] = str(fd, "to").split(":");
  const res = await addRelationship(v.tenantId, {
    type: str(fd, "type"), fromKind, fromId: f.join(":"), toKind, toId: t.join(":"),
    context: str(fd, "context"), evidence: str(fd, "evidence"), validFrom: str(fd, "validFrom"),
  }, v.actor);
  return done(orgId, "บันทึกความสัมพันธ์แล้ว พร้อมหลักฐานและผู้ยืนยัน", res.ok ? { ok: true } : res);
}

export async function endRelationshipAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "write");
  if (no) return { error: no };
  return done(str(fd, "orgId"), "ปิดความสัมพันธ์แล้ว", await endRelationship(v.tenantId, str(fd, "relationshipId"), str(fd, "endedOn"), str(fd, "reason"), v.actor));
}

export async function logInteractionAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "write");
  if (no) return { error: no };
  const orgId = str(fd, "orgId");
  const gate = await orgAccess(v.tenantId, orgId, who(v));
  if (!gate.ok) return { error: gate.error };
  const res = await logInteraction(v.tenantId, orgId, {
    kind: str(fd, "kind"), occurredAt: str(fd, "occurredAt"), personId: str(fd, "personId"),
    summary: str(fd, "summary"), outcome: str(fd, "outcome"), classification: str(fd, "classification"),
  }, v.actor);
  return done(orgId, "บันทึกการติดต่อแล้ว", res.ok ? { ok: true } : res);
}

export async function generateBriefAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "write");
  if (no) return { error: no };
  const orgId = str(fd, "orgId");
  const gate = await orgAccess(v.tenantId, orgId, who(v));
  if (!gate.ok) return { error: gate.error };
  const res = await generateBrief(v.tenantId, orgId, who(v), v.actor);
  if ("error" in res) return { error: res.error };
  revalidatePath(`/app/accounts/${orgId}`);
  return {
    ok: res.generatedBy === "ai"
      ? `สร้างสรุปแล้ว ${res.sentences.length} ประโยค${res.dropped ? ` · ทิ้ง ${res.dropped} ประโยคที่ไม่มีหลักฐาน` : ""}`
      : `AI ไม่ได้ใช้ — ${res.note ?? "แสดงสรุปจากสูตร"}`,
  };
}

/* "ฉันรู้จักคนนี้" — ผู้บันทึกคือปลายต้นทางเสมอ (ไม่มีช่องให้เลือกว่าใครรู้จัก) */
export async function addMemberLinkAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "write");
  if (no) return { error: no };
  const orgId = str(fd, "orgId");
  const access = await orgAccess(v.tenantId, orgId, who(v));
  if (!access.ok) return { error: access.error };
  const res = await addMemberLink(v.tenantId, { personId: str(fd, "personId"), type: str(fd, "type"), context: str(fd, "context"), validFrom: str(fd, "validFrom") }, who(v));
  if (!res.ok) return { error: res.error };
  revalidatePath(`/app/accounts/${orgId}`);
  return { ok: res.existed ? "บันทึกไว้แล้วก่อนหน้านี้" : "บันทึกแล้ว — คุณเป็นเส้นทางเข้าถึงคนนี้ของทีม" };
}
