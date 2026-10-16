import { randomUUID } from "node:crypto";
import { get, tx } from "@/lib/engine/sql";
import { logActivity } from "@/lib/engine/db";
import { parseMeetingNote, type NoteParse } from "@/lib/engine/ai";
import { getDossier } from "@/lib/engine/accounts";
import { INTERACTION_KINDS, type InteractionKind } from "@/lib/shared/accounts";
import { CLASSIFICATIONS, type Classification } from "@/lib/shared/vault";
import { NOTE_MAX, isDay, redactContacts, type NoteDraft } from "@/lib/shared/capture";
import { bangkokDay } from "@/lib/shared/format";
import { compareNames, nameInfo } from "@/lib/shared/identity";

/* ── โน้ตหลังพบลูกค้า (docs/solo-plan.md S6 · 6b) ─────────────────────

   สองขั้น และไม่มีอะไรถูกเขียนจนกดยืนยัน:
     draftNote    แยกโน้ตเป็นร่าง (AI ถ้าบัญชีเปิดได้ · ไม่งั้นโน้ตดิบ) — อ่านอย่างเดียว ไม่แตะตารางธุรกิจ
     confirmNote  ผู้ใช้แก้แล้วกดยืนยัน → หลักฐาน (โน้ตต้นฉบับ) + ปฏิสัมพันธ์ + งานถัดไป ในธุรกรรมเดียว

   AI ไม่สร้างคน บริษัท หรือความสัมพันธ์ — ไม่มีโค้ดเส้นไหนในไฟล์นี้เขียน customers · orgs · affiliations · relationship_assertions
   ผู้เข้าร่วมต้องเป็นคนในแฟ้มบริษัทนี้ที่ผู้อ่านเห็นได้ · ชื่ออื่นเป็นแค่รายการ "คนที่ไม่รู้จัก" ให้ผู้ใช้ตัดสิน
   ผลของโมเดลถูกตรวจทุกช่องที่นี่ (ไม่เชื่อแค่ schema ฝั่ง API) และตรวจซ้ำตอนยืนยัน เพราะร่างผ่านเบราว์เซอร์มา */

type Viewer = { id: string; clearance: Classification };
export type DraftResult = { ok: true; draft: NoteDraft; note?: string } | { ok: false; error: string };

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const list = (v: unknown) => (Array.isArray(v) ? v : []);
const tomorrow = () => bangkokDay(Date.now() + 864e5);

/** คนในแฟ้มที่ผู้อ่านเห็นได้ — หนึ่งคนหนึ่งแถว (คนเดียวอาจมีหลายช่วงสังกัด) */
async function peopleOf(tenantId: string, orgId: string, viewer: Viewer) {
  const d = await getDossier(tenantId, orgId, viewer);
  if (!d) return { error: "ไม่พบบริษัทนี้" } as const;
  if (d.masked) return { error: "แฟ้มนี้อยู่ในระดับความลับที่สูงกว่าสิทธิ์ของคุณ" } as const;
  const seen = new Map<string, { personId: string; name: string; title: string | null }>();
  for (const p of d.people) if (!p.masked && !seen.has(p.personId)) seen.set(p.personId, { personId: p.personId, name: p.name, title: p.title });
  return { org: d.org.name, people: [...seen.values()] } as const;
}

/** ตรวจผลของโมเดล — ค่าที่ไม่ผ่านถูกทิ้งและนับ ไม่ถูกแก้ให้ "ดูถูก" */
export function checkParse(
  raw: Partial<NoteParse> | null | undefined, refs: Map<string, { personId: string; name: string }>, today: string,
): Omit<NoteDraft, "source"> {
  let dropped = 0;
  const r = raw && typeof raw === "object" ? raw : {};
  const kindRaw = str(r.kind, 20);
  const kind: InteractionKind = (INTERACTION_KINDS as readonly string[]).includes(kindRaw) ? (kindRaw as InteractionKind) : "note";
  if (kindRaw && kind !== kindRaw) dropped++;
  const dayRaw = str(r.occurred_on, 10);
  /* วันที่พบต้องเป็นอดีตหรือวันนี้ — ปฏิสัมพันธ์ที่ยังไม่เกิดเป็นงาน ไม่ใช่บันทึก */
  const occurredAt = isDay(dayRaw) && dayRaw <= tomorrow() ? dayRaw : today;
  if (dayRaw && occurredAt !== dayRaw) dropped++;

  const participants: NoteDraft["participants"] = [];
  for (const p of list(r.participants)) {
    const hit = typeof p === "string" ? refs.get(p.trim()) : undefined;
    if (!hit) { dropped++; continue; }
    if (!participants.some((x) => x.personId === hit.personId)) participants.push(hit);
  }
  /* ชื่อที่ไม่รู้จัก: ไม่ใช่ชื่อของคนในแฟ้ม (โมเดลอาจใส่ซ้ำ) · ไม่มีช่องทางติดต่อ · สั้น */
  const known = [...refs.values()].map((p) => nameInfo(p.name));
  const unknownPeople: string[] = [];
  for (const u of list(r.unknown_people)) {
    const name = redactContacts(str(u, 80));
    if (!name) continue;
    if (known.some((k) => compareNames(k, nameInfo(name)) === "same")) continue;
    if (!unknownPeople.includes(name) && unknownPeople.length < 10) unknownPeople.push(name);
  }
  const dueRaw = str(r.next_task_due, 10);
  const due = isDay(dueRaw) && dueRaw >= today ? dueRaw : "";
  if (dueRaw && !due) dropped++;
  return {
    kind, occurredAt, participants, unknownPeople,
    summary: redactContacts(str(r.summary, 2000)),
    outcome: redactContacts(str(r.outcome, 500)),
    task: { title: redactContacts(str(r.next_task, 200)), dueAt: due },
    interests: list(r.interests).map((x) => redactContacts(str(x, 80))).filter(Boolean).slice(0, 8),
    dropped,
  };
}

/** แยกโน้ตเป็นร่าง — ไม่เขียนอะไรลงตารางธุรกิจ (การเรียกโมเดลถูกนับใน ai_ledger เท่านั้น) */
export async function draftNote(tenantId: string, orgId: string, note: string, viewer: Viewer): Promise<DraftResult> {
  const text = (note ?? "").trim();
  if (!text) return { ok: false, error: "พิมพ์หรือวางโน้ตก่อน" };
  if (text.length > NOTE_MAX) return { ok: false, error: `โน้ตยาวเกิน ${NOTE_MAX.toLocaleString()} ตัวอักษร — แบ่งเป็นสองครั้ง` };
  const who = await peopleOf(tenantId, orgId, viewer);
  if ("error" in who) return { ok: false, error: who.error! };
  const today = bangkokDay();
  const refs = new Map(who.people.map((p, i) => [`P${i + 1}`, { personId: p.personId, name: p.name }]));
  /* AI ปิด/ล้ม = โน้ตดิบ: ชนิด "โน้ต" · วันนี้ · ข้อความเดิมทั้งหมดเป็นสรุป — บันทึกได้เหมือนกัน */
  const raw: NoteParse = {
    kind: "note", occurred_on: today, participants: [], unknown_people: [], summary: text.slice(0, 2000),
    outcome: "", next_task: "", next_task_due: "", interests: [],
  };
  const res = await parseMeetingNote(tenantId, {
    org: who.org, today,
    people: who.people.map((p, i) => ({ ref: `P${i + 1}`, name: p.name, title: p.title })),
    note: redactContacts(text),
  }, () => raw);
  if (res.source !== "ai") {
    return { ok: true, draft: { source: "fallback", note: res.note, ...checkParse(raw, refs, today), summary: raw.summary } };
  }
  const checked = checkParse(res.value, refs, today);
  /* โมเดลตอบสรุปว่าง = ใช้ข้อความเดิมเป็นสรุป (ไม่ทิ้งสิ่งที่ผู้ใช้จด) */
  if (!checked.summary) checked.summary = text.slice(0, 2000);
  return { ok: true, draft: { source: "ai", ...checked } };
}

export type ConfirmInput = {
  note: string; kind: string; occurredAt: string; personIds: string[]; summary: string; outcome?: string;
  taskTitle?: string; taskDue?: string; interests?: string[]; classification?: string;
};

/** บันทึกร่างที่ผู้ใช้ยืนยัน — ตรวจซ้ำทุกช่อง (ร่างผ่านเบราว์เซอร์มา แก้ได้ทุกค่า) */
export async function confirmNote(
  tenantId: string, orgId: string, input: ConfirmInput, viewer: Viewer,
): Promise<{ ok: true; interactionId: string; taskId: string | null; evidenceId: string } | { ok: false; error: string }> {
  const note = (input.note ?? "").trim();
  if (!note) return { ok: false, error: "ไม่มีโน้ตต้นฉบับ — เริ่มใหม่อีกครั้ง" };
  if (note.length > NOTE_MAX) return { ok: false, error: `โน้ตยาวเกิน ${NOTE_MAX.toLocaleString()} ตัวอักษร` };
  if (!(INTERACTION_KINDS as readonly string[]).includes(input.kind)) return { ok: false, error: "เลือกชนิดของการติดต่อ" };
  const day = str(input.occurredAt, 10);
  if (!isDay(day)) return { ok: false, error: "ระบุวันที่" };
  if (day > tomorrow()) return { ok: false, error: "บันทึกสิ่งที่เกิดขึ้นแล้ว — งานที่ยังไม่เกิดให้สร้างเป็นงาน" };
  const level = (input.classification || "confidential") as Classification;
  if (!(CLASSIFICATIONS as readonly string[]).includes(level)) return { ok: false, error: "ระดับความลับไม่ถูกต้อง" };
  const who = await peopleOf(tenantId, orgId, viewer);
  if ("error" in who) return { ok: false, error: who.error! };
  const byId = new Map(who.people.map((p) => [p.personId, p]));
  const ids = [...new Set((input.personIds ?? []).filter(Boolean))];
  /* คนที่ไม่อยู่ในแฟ้มนี้ (หรือผู้อ่านเห็นไม่ได้) = ปฏิเสธทั้งรายการ ไม่บันทึกครึ่งเดียว */
  if (ids.some((id) => !byId.has(id))) return { ok: false, error: "มีผู้เข้าร่วมที่ไม่ได้อยู่ในแฟ้มบริษัทนี้ — เพิ่มคนใหม่ผ่าน Data Vault ก่อน" };
  const summary = str(input.summary, 2000) || note.slice(0, 2000);
  const taskTitle = str(input.taskTitle, 200);
  const taskDue = str(input.taskDue, 10);
  if (taskDue && !isDay(taskDue)) return { ok: false, error: "กำหนดของงานถัดไปไม่ถูกรูปแบบ" };
  if (taskDue && !taskTitle) return { ok: false, error: "ใส่ชื่องานถัดไป หรือเว้นกำหนดว่าง" };
  const interests = (input.interests ?? []).map((x) => str(x, 80)).filter(Boolean).slice(0, 8);

  /* ปฏิสัมพันธ์มีคนหลักได้คนเดียว (interactions.customer_id) — คนอื่นที่ร่วมด้วยเขียนไว้ในสรุป */
  const [primary, ...others] = ids;
  const body = [
    summary,
    others.length ? `ร่วมด้วย: ${others.map((id) => byId.get(id)!.name).join(" · ")}` : "",
    interests.length ? `ความสนใจที่พูดถึง: ${interests.join(" · ")}` : "",
  ].filter(Boolean).join("\n");
  const interactionId = randomUUID(), evidenceId = randomUUID(), at = new Date().toISOString();
  const taskId = taskTitle ? randomUUID() : null;
  await tx(async (q) => {
    /* โน้ตต้นฉบับ = หลักฐานของปฏิสัมพันธ์ · ค่าที่แยกออกมาอ้างกลับมาที่นี่ได้ผ่าน ref */
    await q.run("INSERT INTO evidence (id, tenant_id, kind, ref, note, captured_by, captured_at) VALUES (?,?,?,?,?,?,?)",
      evidenceId, tenantId, "note", `interaction:${interactionId}`, note, viewer.id, at);
    await q.run(
      `INSERT INTO interactions (id, tenant_id, kind, occurred_at, org_id, customer_id, opportunity_id, summary, outcome, owner_id, source_id, classification, recorded_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      interactionId, tenantId, input.kind, day, orgId, primary ?? null, null, body, str(input.outcome, 500) || null, viewer.id, null, level, at,
    );
    if (taskId) {
      await q.run(
        `INSERT INTO tasks (id, tenant_id, title, status, due_at, owner_id, org_id, customer_id, opportunity_id, outcome, created_by, created_at, done_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        taskId, tenantId, taskTitle, "open", taskDue || null, viewer.id, orgId, primary ?? null, null, null, viewer.id, at, null,
      );
    }
    await q.run("DELETE FROM account_briefs WHERE tenant_id = ? AND org_id = ?", tenantId, orgId);
  });
  await logActivity(tenantId, viewer.id, "note_capture", `${orgId} · ${input.kind} · ${ids.length} people${taskId ? " · task" : ""}`);
  return { ok: true, interactionId, taskId, evidenceId };
}

/** โน้ตต้นฉบับของปฏิสัมพันธ์ — ผู้เรียกตรวจสิทธิ์ของปฏิสัมพันธ์แล้ว */
export async function noteOf(tenantId: string, interactionId: string): Promise<string | null> {
  const e = await get<{ note: string | null }>(
    "SELECT note FROM evidence WHERE tenant_id = ? AND kind = 'note' AND ref = ?", tenantId, `interaction:${interactionId}`);
  return e?.note ?? null;
}
