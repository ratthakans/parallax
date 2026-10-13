import { createHash, randomUUID } from "node:crypto";
import { all, get, run, tx } from "@/lib/engine/sql";
import { logActivity } from "@/lib/engine/db";
import { writeAccountBrief, type AiSource, type BriefDraft, type BriefEvidence } from "@/lib/engine/ai";
import { getDossier, unknownsOf, type Dossier, type Viewer } from "@/lib/engine/accounts";
import { CLEARANCE_RANK, INTERACTION_TH, RELATIONSHIP_TH } from "@/lib/shared/accounts";
import type { Classification } from "@/lib/shared/vault";

/* ── สรุปแฟ้มบริษัทพร้อมแหล่งอ้างอิง (docs/plan.md หัวข้อ 9.2 · B4) ─────────

   1. กรองสิทธิ์ก่อนส่ง: หลักฐานมาจากแฟ้มที่ผ่านการกรองตามระดับของผู้อ่านแล้ว และ "จำกัดสูง" ไม่ส่งเลย
      ไม่ว่าผู้อ่านจะเห็นได้หรือไม่ (plan ข้อ 3) · ไม่ส่งช่องทางติดต่อ — แฟ้มไม่มีค่าเต็มตั้งแต่ต้น
   2. ทุกประโยคชี้หลักฐาน: ประโยคที่ไม่มี cites หรืออ้างรหัสนอกชุด ถูกทิ้งและนับไว้
   3. ผูกสิทธิ์: เก็บแยกต่อ (บริษัท · ระดับสิทธิ์) พร้อม hash ของชุดหลักฐาน — หลักฐานเปลี่ยนหรือถูกลบ
      = hash ไม่ตรง = ไม่แสดงและลบทิ้ง ผู้อ่านระดับต่ำกว่าไม่มีทางได้สรุปที่สร้างจากหลักฐานระดับสูงกว่า
   4. AI ปิด (ยังไม่ชำระ · สวิตช์ · ไม่มีคีย์) = สรุปจากสูตรที่อ้างหลักฐานแบบเดียวกัน งานขายทำต่อได้ */

/* ระดับสูงสุดที่ส่งให้โมเดลได้ — "จำกัดสูง" ไม่ออกจากระบบ */
const AI_CEILING: Classification = "confidential";
const scopeOf = (viewer: Viewer): Classification =>
  CLEARANCE_RANK[viewer.clearance] < CLEARANCE_RANK[AI_CEILING] ? viewer.clearance : AI_CEILING;

const thaiDay = (iso: string | null) => (iso ? iso.slice(0, 10) : "ไม่ทราบวัน");

export type EvidenceItem = BriefEvidence & { kind: "org" | "person" | "relationship" | "interaction" | "participation" | "opportunity"; ref: string };

/** ชุดหลักฐานที่ส่งให้โมเดลได้ — เรียงแน่นอน เพื่อให้ hash คงที่เมื่อข้อมูลไม่เปลี่ยน */
export function evidencePack(d: Dossier, scope: Classification): EvidenceItem[] {
  const out: Omit<EvidenceItem, "id">[] = [];
  if (CLEARANCE_RANK[d.org.classification] > CLEARANCE_RANK[scope]) return [];
  out.push({ kind: "org", ref: d.org.id, text: `ชื่อบริษัท: ${d.org.name}${d.org.nameEn ? ` (${d.org.nameEn})` : ""}` });
  const others = d.namesAsWritten.map((n) => n.name).filter((n) => n && n !== d.org.name).slice(0, 5);
  if (others.length) out.push({ kind: "org", ref: d.org.id, text: `ชื่อที่เขียนต่างกันในไฟล์: ${others.join(" · ")}` });
  if (d.org.industry) out.push({ kind: "org", ref: d.org.id, text: `อุตสาหกรรม: ${d.org.industry}` });
  const domains = [...new Set([d.org.primaryDomain, ...d.domains.map((x) => x.domain)].filter(Boolean))];
  if (domains.length) out.push({ kind: "org", ref: d.org.id, text: `โดเมนอีเมลบริษัท: ${domains.join(", ")}` });
  if (d.parent) out.push({ kind: "org", ref: d.parent.id, text: `เป็นบริษัทในเครือของ ${d.parent.name} (คนละนิติบุคคล)` });
  for (const s of d.subsidiaries) out.push({ kind: "org", ref: s.id, text: `มีบริษัทในเครือ: ${s.name} (คนละนิติบุคคล)` });
  if (d.org.accountOwner) out.push({ kind: "org", ref: d.org.id, text: `เจ้าของบัญชีฝั่งเรา: ${d.org.accountOwner}` });
  for (const p of d.people.slice(0, 40)) {
    const period = p.current ? `ตั้งแต่ ${thaiDay(p.from)} ถึงปัจจุบัน` : `${thaiDay(p.from)} ถึง ${thaiDay(p.to)} (ออกแล้ว)`;
    out.push({ kind: "person", ref: p.affiliationId, text: `${p.name} — ${p.title ?? "ไม่ทราบตำแหน่ง"} · ${period}${p.confirmedBy ? " · คนยืนยันแล้ว" : ""}` });
  }
  for (const r of d.relationships.filter((x) => x.confirmedBy && x.lifecycle === "confirmed")) {
    out.push({
      kind: "relationship", ref: r.id,
      text: `${r.fromName} ${RELATIONSHIP_TH[r.type] ?? r.type} ${r.toName}${r.context ? ` (${r.context})` : ""}${r.validTo ? ` · สิ้นสุด ${thaiDay(r.validTo)}` : ""} · ยืนยันโดย ${r.confirmedBy}`,
    });
  }
  for (const i of d.interactions.filter((x) => !x.masked && CLEARANCE_RANK[x.classification] <= CLEARANCE_RANK[scope]).slice(0, 25)) {
    out.push({
      kind: "interaction", ref: i.id,
      text: `${thaiDay(i.occurredAt)} ${INTERACTION_TH[i.kind] ?? i.kind}${i.personName ? ` กับ ${i.personName}` : ""}: ${i.summary ?? ""}${i.outcome ? ` · ผล: ${i.outcome}` : ""}`,
    });
  }
  for (const p of d.participations.slice(0, 20)) {
    out.push({ kind: "participation", ref: p.id, text: `${p.personName ?? "ไม่ทราบชื่อ"} ร่วม ${p.program}${p.edition ? ` ${p.edition}` : ""} ในบทบาท ${p.role}` });
  }
  for (const o of d.opportunities) out.push({ kind: "opportunity", ref: o.id, text: `โอกาสขาย: ${o.name} · ขั้น ${o.stage}` });
  return out.map((e, i) => ({ ...e, id: `E${i + 1}` }));
}

/** สรุปจากสูตร — ประโยคมาจากหลักฐานตรง ๆ และอ้างรหัสของตัวเอง */
export function fallbackBrief(d: Dossier, pack: EvidenceItem[]): BriefDraft {
  const by = (k: EvidenceItem["kind"]) => pack.filter((e) => e.kind === k);
  const out: BriefDraft["sentences"] = [];
  const current = d.people.filter((p) => p.current);
  const people = by("person").filter((e) => current.some((p) => p.affiliationId === e.ref));
  if (people.length) {
    out.push({
      text: `มีคนที่ยังสังกัด ${d.org.name} ในฐาน ${current.length} คน เช่น ${current.slice(0, 3).map((p) => `${p.name} (${p.title ?? "ไม่ทราบตำแหน่ง"})`).join(", ")}`,
      cites: people.slice(0, 3).map((e) => e.id),
    });
  }
  const rel = by("relationship");
  if (rel.length) out.push({ text: `ความสัมพันธ์ที่คนยืนยันแล้ว ${rel.length} รายการ เช่น ${rel[0].text}`, cites: [rel[0].id] });
  const inter = by("interaction");
  if (inter.length) out.push({ text: `ติดต่อครั้งล่าสุด: ${inter[0].text}`, cites: [inter[0].id] });
  const part = by("participation");
  if (part.length) out.push({ text: `เคยร่วมงาน/กิจกรรม ${part.length} ครั้ง เช่น ${part[0].text}`, cites: [part[0].id] });
  const opp = by("opportunity");
  if (opp.length) out.push({ text: opp.map((e) => e.text).join(" · "), cites: opp.map((e) => e.id) });
  const unknown = unknownsOf(d);
  if (unknown.length) out.push({ text: `ไม่ทราบ: ${unknown.join(" · ")}`, cites: ["U"] });
  return { sentences: out };
}

export type Brief = {
  source: AiSource | "stored";
  generatedBy: "ai" | "fallback";
  scope: Classification;
  sentences: { text: string; cites: EvidenceItem[]; unknown: boolean }[];
  dropped: number;
  createdAt: string | null;
  note?: string;
  evidence: EvidenceItem[];
};

const hashOf = (pack: EvidenceItem[], unknowns: string[]) =>
  createHash("sha256").update(JSON.stringify([pack.map((e) => [e.id, e.ref, e.text]), unknowns])).digest("hex").slice(0, 32);

/* ตรวจผลของโมเดล: ทุกประโยคต้องอ้างรหัสที่มีจริงในชุด (หรือ U สำหรับสิ่งที่ไม่ทราบ) */
function validate(draft: BriefDraft, pack: EvidenceItem[]) {
  const ids = new Map(pack.map((e) => [e.id, e]));
  let dropped = 0;
  const kept: Brief["sentences"] = [];
  for (const s of draft.sentences ?? []) {
    const cites = [...new Set(s.cites ?? [])];
    const text = String(s.text ?? "").trim();
    const known = cites.every((c) => c === "U" || ids.has(c));
    /* ห้ามช่องทางติดต่อหลุดในข้อความ แม้หลักฐานไม่มีให้ — กันโมเดลแต่งขึ้นเอง */
    const contact = /[\w.+-]+@[\w-]+\.[\w.]+|(?:\+?66|0)[\s-]?\d{1,2}[\s-]?\d{3}[\s-]?\d{3,4}/.test(text);
    if (!text || !cites.length || !known || contact) { dropped++; continue; }
    kept.push({ text, cites: cites.filter((c) => c !== "U").map((c) => ids.get(c)!), unknown: cites.includes("U") });
  }
  return { kept, dropped };
}

/** สรุปที่แสดงได้ตอนนี้: ที่เก็บไว้ (ถ้าหลักฐานยังตรง) หรือสูตรสำเร็จ — ไม่เรียก AI */
export async function currentBrief(tenantId: string, orgId: string, viewer: Viewer): Promise<Brief | null> {
  const d = await getDossier(tenantId, orgId, viewer);
  if (!d || d.masked) return null;
  const scope = scopeOf(viewer);
  const pack = evidencePack(d, scope);
  if (!pack.length) return null;
  const hash = hashOf(pack, unknownsOf(d));
  const stored = await get<{ evidence_hash: string; sentences: string; dropped: number | string; created_at: string; source: string }>(
    "SELECT evidence_hash, sentences, dropped, created_at, source FROM account_briefs WHERE tenant_id = ? AND org_id = ? AND clearance = ?",
    tenantId, orgId, scope,
  );
  if (stored && stored.evidence_hash === hash) {
    const v = validate({ sentences: JSON.parse(stored.sentences) }, pack);
    return { source: "stored", generatedBy: stored.source === "ai" ? "ai" : "fallback", scope, sentences: v.kept, dropped: Number(stored.dropped), createdAt: stored.created_at, evidence: pack };
  }
  /* หลักฐานเปลี่ยนแล้ว — สรุปเก่าอาจเอ่ยถึงสิ่งที่ถูกลบหรือถูกปิด จึงลบ ไม่แสดงแบบ "เก่าไปหน่อย" */
  if (stored) await run("DELETE FROM account_briefs WHERE tenant_id = ? AND org_id = ? AND clearance = ?", tenantId, orgId, scope);
  const v = validate(fallbackBrief(d, pack), pack);
  return { source: "fallback", generatedBy: "fallback", scope, sentences: v.kept, dropped: 0, createdAt: null, evidence: pack };
}

/** สร้างสรุปใหม่ด้วย AI (ผู้ใช้กด) — ผลเก็บใน account_briefs ไม่ใช่ ai_cache เพื่อให้ลบตามหลักฐานได้ */
export async function generateBrief(tenantId: string, orgId: string, viewer: Viewer, actor: string): Promise<Brief | { error: string }> {
  const d = await getDossier(tenantId, orgId, viewer);
  if (!d) return { error: "ไม่พบบริษัทนี้" };
  if (d.masked) return { error: "บริษัทนี้อยู่ในระดับที่คุณไม่มีสิทธิ์เห็น" };
  const scope = scopeOf(viewer);
  const pack = evidencePack(d, scope);
  if (!pack.length) return { error: "บริษัทระดับจำกัดสูง — ไม่ส่งข้อมูลให้ AI" };
  const unknowns = unknownsOf(d);
  const res = await writeAccountBrief(
    tenantId,
    { org: d.org.name, evidence: pack.map(({ id, text }) => ({ id, text })), unknowns, scope },
    () => fallbackBrief(d, pack),
  );
  const v = validate(res.value, pack);
  /* โมเดลตอบแต่ไม่มีประโยคที่ผ่านการตรวจเลย — ใช้สูตรแทน ไม่แสดงสรุปว่าง */
  const usedAi = res.source === "ai" && v.kept.length > 0;
  const final = usedAi ? v : validate(fallbackBrief(d, pack), pack);
  const at = new Date().toISOString();
  await tx(async (q) => {
    await q.run("DELETE FROM account_briefs WHERE tenant_id = ? AND org_id = ? AND clearance = ?", tenantId, orgId, scope);
    await q.run(
      `INSERT INTO account_briefs (id, tenant_id, org_id, clearance, evidence_hash, source, model, sentences, unknowns, evidence, dropped, created_by, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      randomUUID(), tenantId, orgId, scope, hashOf(pack, unknowns), usedAi ? "ai" : "fallback", usedAi ? "claude-opus-5-5" : null,
      JSON.stringify(final.kept.map((s) => ({ text: s.text, cites: [...s.cites.map((c) => c.id), ...(s.unknown ? ["U"] : [])] }))),
      JSON.stringify(unknowns), JSON.stringify(pack.map((e) => e.id)), v.dropped, actor, at,
    );
  });
  await logActivity(tenantId, actor, "account_brief", `${orgId} · ${usedAi ? "ai" : "fallback"} · ${final.kept.length} sentences · ${v.dropped} dropped`);
  return {
    source: res.source, generatedBy: usedAi ? "ai" : "fallback", scope, sentences: final.kept, dropped: v.dropped, createdAt: at,
    note: res.note ?? (res.source === "ai" && !usedAi ? "AI ตอบแต่ไม่มีประโยคที่มีหลักฐานครบ — ใช้สรุปจากสูตรแทน" : undefined), evidence: pack,
  };
}

export async function briefCount(tenantId: string) {
  const r = await all<{ source: string; n: number | string }>("SELECT source, COUNT(*) AS n FROM account_briefs WHERE tenant_id = ? GROUP BY source", tenantId);
  return Object.fromEntries(r.map((x) => [x.source, Number(x.n)]));
}
