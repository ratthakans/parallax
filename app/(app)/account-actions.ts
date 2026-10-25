"use server";

import { revalidatePath } from "next/cache";
import { denied, viewer } from "@/app/(app)/viewer";
import {
  addMemberLink, addRelationship, confirmAffiliation, endAffiliation, endRelationship, logInteraction, reaffirmAffiliation, setAccountOwner,
  setClassification, setParent, updateOrgField, verifyOrg,
} from "@/lib/engine/accounts/edit";
import { generateBrief } from "@/lib/engine/accounts/brief";
import { orgAccess } from "@/lib/engine/accounts";
import { get } from "@/lib/engine/sql";
import { createTask } from "@/lib/engine/tasks";
import { mergeOrgs } from "@/lib/engine/vault/merge";
import { createOrg, orgByName } from "@/lib/engine/accounts/edit";
import { similarOrgs } from "@/lib/engine/duplicates";
import { setCustomerMode } from "@/lib/engine/tenant-mode";
import { CUSTOMER_MODE_TH, isCustomerMode } from "@/lib/shared/tenants";
import { redirect } from "next/navigation";
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
  if (!res.ok) return { error: res.error };
  /* งานถัดไป (E1) */
  const next = str(fd, "nextTitle").trim();
  if (next) {
    const t = await createTask(v.tenantId, { title: next, due: str(fd, "nextDue"), orgId, personId: str(fd, "personId") || undefined }, who(v));
    revalidatePath("/app/tasks");
    if (!t.ok) return done(orgId, `บันทึกการติดต่อแล้ว แต่สร้างงานถัดไปไม่ได้: ${t.error}`, { ok: true });
    return done(orgId, "บันทึกการติดต่อและงานถัดไปแล้ว", { ok: true });
  }
  return done(orgId, "บันทึกการติดต่อแล้ว", { ok: true });
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
      : `AI ไม่ได้ใช้ — ${res.note ?? "แสดงสรุปอัตโนมัติ"}`,
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
  return { ok: res.existed ? "บันทึกไว้แล้วก่อนหน้านี้" : "บันทึกแล้ว — ทีมจะเห็นว่าคุณรู้จักคนนี้" };
}

/* ── สังกัดเก่าจากหน้าสุขภาพข้อมูล (docs/crm-plan.md D1) ── ยังอยู่ / ออกแล้ว · ตรวจสิทธิ์บริษัทของสังกัดก่อน */
async function affOrg(tenantId: string, affiliationId: string) {
  return (await get<{ org_id: string; customer_id: string }>("SELECT org_id, customer_id FROM affiliations WHERE tenant_id = ? AND id = ?", tenantId, affiliationId)) ?? null;
}

export async function reaffirmAffiliationAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "write");
  if (no) return { error: no };
  const a = await affOrg(v.tenantId, str(fd, "affiliationId"));
  if (!a) return { error: "ไม่พบสังกัดนี้" };
  const access = await orgAccess(v.tenantId, a.org_id, who(v));
  if (!access.ok) return { error: access.error };
  const res = await reaffirmAffiliation(v.tenantId, str(fd, "affiliationId"), v.actor);
  if (!res.ok) return { error: res.error };
  revalidatePath("/app/data");
  revalidatePath(`/app/accounts/${a.org_id}`);
  return { ok: "ยืนยันว่ายังอยู่แล้ว" };
}

export async function leftCompanyAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "write");
  if (no) return { error: no };
  const a = await affOrg(v.tenantId, str(fd, "affiliationId"));
  if (!a) return { error: "ไม่พบสังกัดนี้" };
  const access = await orgAccess(v.tenantId, a.org_id, who(v));
  if (!access.ok) return { error: access.error };
  const res = await endAffiliation(v.tenantId, str(fd, "affiliationId"), str(fd, "endedOn"), str(fd, "reason") || "ตรวจจากหน้าสุขภาพข้อมูล", v.actor);
  if (!res.ok) return { error: res.error };
  revalidatePath("/app/data");
  revalidatePath(`/app/accounts/${a.org_id}`);
  return { ok: "บันทึกว่าออกแล้ว — ประวัติยังอยู่" };
}

/* ── รวมบริษัทซ้ำจากหน้าบริษัท ── ใช้การรวมเดียวกับคิวตรวจ (ย้อนได้ที่ประวัติการรวม) · สิทธิ์ review · ต้องเห็นทั้งสองฝั่ง */
export async function mergeOrgHereAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "review");
  if (no) return { error: no };
  const keep = str(fd, "orgId");
  const drop = str(fd, "dropId") || (str(fd, "dropName").trim() ? (await orgByName(v.tenantId, str(fd, "dropName"))) ?? "" : "");
  if (!drop) return { error: "เลือกบริษัทที่จะรวมเข้ามา" };
  if (drop === keep) return { error: "เป็นบริษัทเดียวกันอยู่แล้ว" };
  for (const id of [keep, drop]) {
    const gate = await orgAccess(v.tenantId, id, who(v));
    if (!gate.ok) return { error: gate.error };
  }
  const r = await mergeOrgs(v.tenantId, keep, drop, v.actor);
  if (!r.ok) return { error: r.error };
  revalidatePath("/app/accounts");
  revalidatePath("/app/data");
  redirect(`/app/accounts/${keep}?tab=details&merged=1`);
}

/* ── สร้างบริษัทด้วยมือ (BUG-21) ── เตือนบริษัทที่อาจซ้ำก่อน · ยืนยันแล้วสร้างได้ */
export async function createOrgAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "write");
  if (no) return { error: no };
  /* ชื่อเดียวกันเมื่อตัดคำนิติบุคคล = บริษัทเดิมแน่นอน — เปิดแฟ้มเดิมเลย ไม่ต้องถาม */
  const same = await orgByName(v.tenantId, str(fd, "name"));
  if (same) redirect(`/app/accounts/${same}?existed=1`);
  if (str(fd, "confirmDup") !== "1") {
    const like = await similarOrgs(v.tenantId, { name: str(fd, "name"), email: str(fd, "domain") ? `x@${str(fd, "domain").replace(/^https?:\/\//, "").replace(/^www\./, "")}` : "" }, who(v));
    if (like.length) return { error: `บริษัทนี้อาจมีอยู่แล้ว: ${like.slice(0, 3).map((x) => `${x.name} (${x.why})`).join(" · ")} — ถ้าเป็นบริษัทใหม่จริง ติ๊ก "ตรวจแล้ว ไม่ใช่รายเดิม" แล้วกดอีกครั้ง` };
  }
  const r = await createOrg(v.tenantId, {
    name: str(fd, "name"), industry: str(fd, "industry"), domain: str(fd, "domain"), taxId: str(fd, "taxId"),
    owner: str(fd, "mine") === "1" ? v.actor : null,
  }, v.actor);
  if (!r.ok) return { error: r.error };
  revalidatePath("/app/accounts");
  redirect(`/app/accounts/${r.id}${r.existed ? "?existed=1" : ""}`);
}

/* ── โหมดลูกค้าของบัญชี (docs/crm-plan.md F1) ── เจ้าของบัญชีเท่านั้น */
export async function setCustomerModeAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const v = await viewer();
  const no = denied(v, "account_admin");
  if (no) return { error: no };
  const mode = str(fd, "mode");
  const r = await setCustomerMode(v.tenantId, mode, v.actor);
  if (!r.ok) return { error: r.error };
  revalidatePath("/app", "layout");
  return { ok: `ใช้แบบ "${isCustomerMode(mode) ? CUSTOMER_MODE_TH[mode].label : mode}" แล้ว — เมนูและฟอร์มเปลี่ยนตาม` };
}
