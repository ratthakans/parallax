import { all, get } from "@/lib/engine/sql";
import { logActivity } from "@/lib/engine/db";
import { decide, type Decision } from "@/lib/engine/policy";
import { personIdsOf } from "@/lib/engine/vault/merge";
import { getDossier, type Viewer } from "@/lib/engine/accounts";
import { evidencePack, scopeOf, type EvidenceItem } from "@/lib/engine/accounts/brief";
import { writeOutreachDraft, type OutreachDraft } from "@/lib/engine/ai";
import { recordOutcome } from "@/lib/engine/campaigns";
import { canSee, type InteractionKind } from "@/lib/shared/accounts";
import { optOutLine } from "@/lib/shared/purpose-templates";
import { CHANNEL_TH, type Channel, type MessageKind, type OutreachDraftView, type TargetStatus } from "@/lib/shared/policy";
import type { Classification } from "@/lib/shared/vault";

/* ── ร่างข้อความหลังผ่านนโยบาย (docs/solo-plan.md S7) ─────────────────────

   1. ปุ่มร่างมีเฉพาะเป้าหมายที่ decide() ให้ Eligible ณ ตอนแสดง (draftableTargets) และตรวจซ้ำอีกครั้งตอนกดร่าง
      Review required · Suppressed · ช่องทางใช้ไม่ได้ · บริการนโยบายล่ม = ไม่มีร่าง
   2. หลักฐานมาจาก evidencePack() ของแฟ้มที่กรองตามระดับของผู้ร่างแล้ว แล้วคัดเหลือเฉพาะที่เกี่ยวกับผู้รับ
      ตัดช่องทางติดต่อ (อีเมล · เบอร์ · ลิงก์) ออกก่อนส่ง · ชื่อผู้รับส่งเป็น {{name}} แล้วแทนค่าในระบบ
   3. อ้างการแนะนำได้เฉพาะเมื่อมีความสัมพันธ์ "ได้รับการแนะนำโดย" ที่คนยืนยันแล้ว ยังไม่สิ้นสุด และผู้ร่างเห็นผู้แนะนำได้
      บรรทัดแนะนำระบบใส่เอง (ชื่อผู้แนะนำไม่ถึงโมเดล) · โมเดลเขียนเรื่องการแนะนำเอง = ทิ้งผลของโมเดล
   4. ข้อความการตลาดต่อท้ายวิธียกเลิกรับตามแม่แบบเสมอ (lib/shared/purpose-templates.ts)
   5. ไม่ส่งจากระบบ และไม่เก็บร่าง — "ส่งแล้ว" = recordOutcome() ซึ่งตรวจนโยบายซ้ำ ถอนระหว่างนั้น = บันทึกไม่ได้
   AI ปิด (ยังไม่ชำระ · สวิตช์ · ไม่มีคีย์) = ร่างจากแม่แบบด้วยหลักฐานชุดเดียวกัน */

/** สถานะที่ร่างได้ — มอบหมายแล้ว (ผ่านการตรวจตอนมอบหมาย) และยังไม่จบ */
const ACTIVE: TargetStatus[] = ["assigned", "contacted", "meeting", "proposal"];
const CONTACT = /[\w.+-]+@[\w-]+\.[\w.]+|(?:\+?66|0)[\s-]?\d{1,2}[\s-]?\d{3}[\s-]?\d{3,4}|https?:\/\/\S+|www\.\S+|\b\d{13}\b/gi;
const HAS_CONTACT = new RegExp(CONTACT.source, "i");
/** คำที่บอกว่ามีคนแนะนำ — โมเดลห้ามเขียนเอง (ระบบใส่เมื่อมีหลักฐาน) */
const INTRO = /แนะนำให้(?:ติดต่อ|รู้จัก|ผม|ดิฉัน|เรา|คุณ|มา)|ได้รับการแนะนำ|ฝากให้(?:ติดต่อ|มา)|ชี้ให้มาติดต่อ|introduc|referr|refer(?:red)?\s+by|recommended\s+(?:me|us|that)/i;
const TOUCH_TH: Partial<Record<InteractionKind, string>> = { meeting: "ประชุมกัน", call: "คุยโทรศัพท์กัน", email: "ติดต่อทางอีเมลกัน", event: "พบกันที่งาน" };
const scrub = (t: string) => t.replace(CONTACT, "[ตัดช่องทางติดต่อ]");

type CampaignBits = { name: string; offer: string | null; purpose_id: string; channel: Channel; message_kind: MessageKind; disclosure_purpose_id: string | null };
const loadCampaign = (tenantId: string, id: string) =>
  get<CampaignBits>("SELECT name, offer, purpose_id, channel, message_kind, disclosure_purpose_id FROM sales_campaigns WHERE tenant_id = ? AND id = ?", tenantId, id);
const decideFor = async (tenantId: string, c: CampaignBits, customerId: string): Promise<Decision> =>
  await decide(tenantId, { customerId, purposeId: c.purpose_id, channel: c.channel, messageKind: c.message_kind, disclosurePurposeId: c.disclosure_purpose_id });

/** เป้าหมายที่แสดงปุ่ม "ร่างข้อความ" ได้ ณ ตอนนี้ — ตรวจนโยบายสดทุกคน ไม่ใช้ผลที่เก็บไว้ */
export async function draftableTargets(
  tenantId: string, campaignId: string, targets: { id: string; customerId: string; status: TargetStatus }[],
): Promise<Set<string>> {
  const out = new Set<string>();
  const c = await loadCampaign(tenantId, campaignId);
  if (!c) return out;
  for (const t of targets) {
    if (!ACTIVE.includes(t.status)) continue;
    const d = await decideFor(tenantId, c, t.customerId);
    if (!d.failed && d.status === "eligible") out.add(t.id);
  }
  return out;
}

/** ผู้แนะนำที่มีหลักฐาน: ความสัมพันธ์ "ได้รับการแนะนำโดย" จากผู้รับ (รวมรหัสที่ถูกรวม) ที่ยืนยันแล้ว ยังไม่สิ้นสุด และผู้ร่างเห็นผู้แนะนำได้ */
export async function provenIntroducer(tenantId: string, customerId: string, clearance: Classification, at = new Date().toISOString()): Promise<string | null> {
  const ids = await personIdsOf(tenantId, customerId);
  const rows = await all<{ name: string; classification: string | null; lifecycle_state: string | null }>(
    `SELECT c.name, c.classification, c.lifecycle_state FROM relationship_assertions r
     JOIN customers c ON c.id = r.to_id AND c.tenant_id = r.tenant_id
     WHERE r.tenant_id = ? AND r.type = 'introduced_by' AND r.from_kind = 'person' AND r.to_kind = 'person'
       AND r.from_id IN (${ids.map(() => "?").join(",")})
       AND r.lifecycle_state = 'confirmed' AND r.confirmed_by IS NOT NULL
       AND (r.valid_to IS NULL OR r.valid_to > ?)
     ORDER BY r.confirmed_at DESC, r.recorded_at DESC`,
    tenantId, ...ids, at);
  const ok = rows.find((r) => canSee(clearance, (r.classification ?? "confidential") as Classification)
    && !["deleted", "anonymised", "restricted"].includes(r.lifecycle_state ?? ""));
  return ok?.name ?? null;
}

type Fail = { ok: false; error: string; reasons?: string[] };

/** ร่างข้อความถึงเป้าหมายหนึ่งคน — ไม่เก็บ ไม่ส่ง · ตรวจนโยบายซ้ำทุกครั้ง */
export async function draftForTarget(tenantId: string, targetId: string, viewer: Viewer): Promise<{ ok: true; draft: OutreachDraftView } | Fail> {
  const t = await get<{ campaign_id: string; customer_id: string; org_id: string | null; status: TargetStatus; name: string; classification: string | null }>(
    `SELECT t.campaign_id, t.customer_id, t.org_id, t.status, cu.name, cu.classification FROM campaign_targets t
     JOIN customers cu ON cu.id = t.customer_id AND cu.tenant_id = t.tenant_id WHERE t.tenant_id = ? AND t.id = ?`, tenantId, targetId);
  if (!t) return { ok: false, error: "ไม่พบเป้าหมายนี้" };
  if (t.status === "open") return { ok: false, error: "มอบหมายเป้าหมายนี้ก่อน แล้วค่อยร่างข้อความ" };
  if (!ACTIVE.includes(t.status)) return { ok: false, error: "เป้าหมายนี้จบแล้ว — ไม่ร่างข้อความ" };
  const c = (await loadCampaign(tenantId, t.campaign_id))!;

  /* ตรวจนโยบายซ้ำ ณ ตอนกด — ไม่อาศัยว่าหน้าจอแสดงปุ่ม (action ยิงตรงได้) */
  const d: Decision = await decideFor(tenantId, c, t.customer_id);
  if (d.failed) return { ok: false, error: "บริการนโยบายใช้ไม่ได้ — ยังไม่ร่าง (fail closed)" };
  if (d.status !== "eligible") return { ok: false, error: "นโยบายไม่อนุญาตให้ติดต่อคนนี้ในแคมเปญนี้ตอนนี้ — ไม่ร่างข้อความ", reasons: d.reasons };

  /* ผู้รับและบริษัทต้องอยู่ในระดับที่ผู้ร่างเปิดได้ */
  if (!canSee(viewer.clearance, (t.classification ?? "confidential") as Classification)) return { ok: false, error: "คนนี้อยู่ในระดับที่คุณไม่มีสิทธิ์เห็น — ไม่ร่างข้อความ" };
  const dossier = t.org_id ? await getDossier(tenantId, t.org_id, viewer) : null;
  if (t.org_id && (!dossier || dossier.masked)) return { ok: false, error: "บริษัทนี้อยู่ในระดับที่คุณไม่มีสิทธิ์เห็น — ไม่ร่างข้อความ" };

  const ids = new Set(await personIdsOf(tenantId, t.customer_id));
  const name = t.name;
  const pack = dossier ? evidencePack(dossier, scopeOf(viewer)) : [];
  /* คัดเฉพาะที่เกี่ยวกับผู้รับ · ไม่ส่งความสัมพันธ์ (การแนะนำระบบใส่เอง) · ไม่ส่งโดเมนอีเมลและรหัสเจ้าของบัญชี */
  const mine = (e: EvidenceItem): boolean => {
    if (!dossier) return false;
    switch (e.kind) {
      case "org": return !/^โดเมนอีเมลบริษัท|^เจ้าของบัญชีฝั่งเรา/.test(e.text);
      case "person": return dossier.people.some((p) => p.affiliationId === e.ref && ids.has(p.personId) && !p.masked);
      case "interaction": {
        const i = dossier.interactions.find((x) => x.id === e.ref);
        return Boolean(i) && (!i!.personId || ids.has(i!.personId));
      }
      case "participation": return dossier.participations.some((p) => p.id === e.ref && p.personName === name);
      case "opportunity": return true;
      default: return false;
    }
  };
  const evidence = pack.filter(mine).map((e) => ({ id: e.id, text: scrub(e.text).split(name).join("{{name}}") }));
  const org = dossier && !dossier.masked ? dossier.org.name : null;

  const fallback = (): OutreachDraft => templateDraft(c, org, dossier, ids, pack, evidence);
  const res = await writeOutreachDraft(tenantId, {
    campaign: c.name, offer: c.offer, org: org ?? "ไม่ระบุบริษัท", channel: c.channel, messageKind: c.message_kind, evidence,
  }, fallback);
  const known = new Set(evidence.map((e) => e.id));
  let draft = res.value;
  let generatedBy: "ai" | "fallback" = res.source === "fallback" ? "fallback" : "ai";
  let note = res.note;
  if (generatedBy === "ai") {
    const why = rejectReason(draft, known);
    if (why) { draft = fallback(); generatedBy = "fallback"; note = `ร่างจาก AI ใช้ไม่ได้ (${why}) — ใช้แม่แบบแทน`; }
  }

  /* ประกอบในระบบ: บรรทัดแนะนำ (มีหลักฐานเท่านั้น) · ชื่อผู้รับ · วิธียกเลิกรับ */
  const introducer = await provenIntroducer(tenantId, t.customer_id, viewer.clearance);
  const lines = draft.body.trim().split("\n");
  if (introducer) lines.splice(1, 0, "", `คุณ${introducer.replace(/^คุณ\s*/, "")} แนะนำให้ติดต่อคุณ`);
  let body = lines.join("\n").split("{{name}}").join(name);
  const optOut = c.message_kind === "marketing";
  if (optOut) body += `\n\n${optOutLine(c.channel)}`;
  const subject = draft.subject.split("{{name}}").join("").replace(/\s+/g, " ").trim().slice(0, 80);
  const cited = new Set(draft.cites ?? []);

  await logActivity(tenantId, viewer.id, "outreach_draft", `${targetId} · ${generatedBy}${introducer ? " · intro" : ""}`);
  return {
    ok: true,
    draft: {
      subject, body, channel: c.channel, messageKind: c.message_kind, generatedBy, note, introducedBy: introducer, optOut,
      evidence: evidence.filter((e) => cited.has(e.id)).map((e) => ({ id: e.id, text: e.text.split("{{name}}").join(name) })),
      policyVersion: d.policyVersion,
    },
  };
}

/* ผลของโมเดลต้องผ่านทุกข้อ ไม่งั้นใช้แม่แบบ — ไม่ซ่อมครึ่ง ๆ กลาง ๆ */
function rejectReason(d: OutreachDraft, known: Set<string>): string | null {
  const body = String(d?.body ?? ""), subject = String(d?.subject ?? "");
  if (!body.trim()) return "ว่าง";
  if (!body.includes("{{name}}") || (`${subject}${body}`.match(/\{\{\w+\}\}/g) ?? []).some((v) => v !== "{{name}}")) return "ตัวแปรไม่ถูกต้อง";
  if (HAS_CONTACT.test(subject) || HAS_CONTACT.test(body)) return "มีช่องทางติดต่อ";
  if (INTRO.test(subject) || INTRO.test(body)) return "อ้างการแนะนำเอง";
  if (!Array.isArray(d.cites) || d.cites.some((x) => !known.has(x))) return "อ้างหลักฐานที่ไม่มี";
  return null;
}

/** ร่างจากแม่แบบ — ไม่มี AI · ใช้เฉพาะข้อเท็จจริงจากหลักฐานชุดเดียวกัน */
function templateDraft(
  c: CampaignBits, org: string | null, d: Awaited<ReturnType<typeof getDossier>>, ids: Set<string>,
  pack: EvidenceItem[], evidence: { id: string; text: string }[],
): OutreachDraft {
  const known = new Set(evidence.map((e) => e.id));
  const cites: string[] = [];
  const topic = c.offer?.trim() || c.name;
  const lines = [`เรียนคุณ {{name}}`, ""];
  lines.push(`ขออนุญาตติดต่อมาเรื่อง ${topic}${org ? ` สำหรับ ${org}` : ""}`);
  /* อ้างการคุยครั้งล่าสุดหรือการร่วมงาน เฉพาะเมื่ออยู่ในชุดหลักฐาน — ไม่เดา */
  const idOf = (kind: EvidenceItem["kind"], ref: string) => pack.find((e) => e.kind === kind && e.ref === ref)?.id;
  /* โน้ตภายในไม่ใช่สิ่งที่ผู้รับรู้ด้วย — ไม่เอ่ยถึงในข้อความ */
  const last = d?.interactions.find((i) => !i.masked && i.kind !== "note" && (!i.personId || ids.has(i.personId)) && known.has(idOf("interaction", i.id) ?? ""));
  if (last) {
    lines.push(`ต่อจากที่เรา${TOUCH_TH[last.kind] ?? "ติดต่อกัน"}เมื่อ ${last.occurredAt.slice(0, 10)}`);
    cites.push(idOf("interaction", last.id)!);
  } else {
    const part = d?.participations.find((p) => !p.masked && known.has(idOf("participation", p.id) ?? ""));
    if (part) {
      lines.push(`ขอบคุณที่เคยร่วม ${part.program}${part.edition ? ` ${part.edition}` : ""} กับเรา`);
      cites.push(idOf("participation", part.id)!);
    }
  }
  lines.push(
    c.channel === "email" ? "หากสะดวก ขอนัดคุยสั้น ๆ สักครั้ง หรือตอบกลับอีเมลนี้ได้เลย" : "หากสะดวก ขอนัดคุยสั้น ๆ สักครั้ง",
    "", "ขอบคุณ",
  );
  return { subject: `${topic}${org ? ` — ${org}` : ""}`.slice(0, 80), body: lines.join("\n"), cites };
}

/** "ส่งแล้ว" — ผู้ใช้ส่งเองนอกระบบแล้ว · บันทึกผลผ่าน recordOutcome() ซึ่งตรวจนโยบายซ้ำ ณ ตอนกด
    ไม่ถอยสถานะ: ถ้าเป้าหมายไปถึงนัดประชุม/ส่งข้อเสนอแล้ว บันทึกเป็นปฏิสัมพันธ์ในสถานะเดิม */
export async function markDraftSent(tenantId: string, targetId: string, actor: string, isStaff = false) {
  const t = await get<{ campaign_id: string; status: TargetStatus }>("SELECT campaign_id, status FROM campaign_targets WHERE tenant_id = ? AND id = ?", tenantId, targetId);
  if (!t) return { ok: false as const, error: "ไม่พบเป้าหมายนี้" };
  const c = await loadCampaign(tenantId, t.campaign_id);
  const outcome: TargetStatus = (["contacted", "meeting", "proposal"] as TargetStatus[]).includes(t.status) ? t.status : "contacted";
  return recordOutcome(tenantId, targetId, {
    outcome, note: `ส่งข้อความตามร่างแล้ว (${c ? CHANNEL_TH[c.channel] : "ช่องทางของแคมเปญ"} · ส่งเองนอกระบบ)`,
  }, actor, isStaff);
}
