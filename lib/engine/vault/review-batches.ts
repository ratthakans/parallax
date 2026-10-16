import { createHash, randomInt } from "node:crypto";
import { all, get, tx, type Param } from "@/lib/engine/sql";
import { logActivity } from "@/lib/engine/db";
import { decideReview, unmerge } from "@/lib/engine/vault/merge";
import { personSides, type PersonSide } from "@/lib/engine/vault/review";
import { sampleRowsOf, type SampleRow } from "@/lib/engine/vault/sample";
import { judgeNamePairs, type ContactFlag, type NamePairField, type NamePairInput } from "@/lib/engine/ai";
import { aiPolicy } from "@/lib/engine/ai/policy";
import { compareNames, emailInfo, nameInfo, translitMatch } from "@/lib/shared/identity";

/* ── ยืนยันการรวมตัวตนเป็นชุด (docs/solo-plan.md S5) ─────────────────

   ปัญหา: ฐาน 2,000 คนจากหลายไฟล์สร้างคิวหลายร้อยคู่ คนเดียวตรวจไม่ทัน
   ทางแก้: จัดคู่ที่มี "เหตุผลเดียวกันทุกข้อ" เป็นชุด ให้คนดูตัวอย่างแล้วยืนยันทั้งชุดทีเดียว — แต่ไม่ลดเกณฑ์
     ข้อ 4: ชุดที่เหตุผลมีแค่ "ชื่อเหมือน + โดเมนเดียวกัน" ไม่ถูกเสนอ ต้องตรวจทีละคู่ตามกติกา 4.4
     ข้อ 5: precision ต้องไม่ต่ำกว่ากติกาเดิม (verify:batch-merge วัดบนข้อมูลสมมุติพร้อมเฉลย)

   เหตุผลของคู่คำนวณใหม่จากข้อมูลจริงของสองฝั่งทุกครั้ง ไม่ใช่จากสัญญาณที่บันทึกตอนเข้าคิว:
     ชื่อ    same (เหมือนหลังปรับรูป) · translit (ไทย↔อังกฤษทับศัพท์ตรง) · unsure · different
     อีเมล/เบอร์  match (มีค่าเดียวกัน — เทียบ HMAC) · conflict (มีทั้งสองฝั่งแต่ไม่มีค่าใดตรง) · none
              อีเมล "ขัดกัน" = มีอีเมลโดเมนบริษัทเดียวกันทั้งสองฝั่งแต่คนละที่อยู่ (อีเมลส่วนตัวกับอีเมลงานไม่ขัดกัน)
     บริษัท   same (องค์กรเดียวกันในฐาน) · domain (โดเมนบริษัทเดียวกัน) · different · none
     ตำแหน่ง  same · different · none
     แยกเดี่ยว ทั้งสองคนไม่อยู่ในคู่อื่นที่ค้างตรวจ — คนที่มีหลายคู่ต้องตรวจทีละคู่ (รวมคู่หนึ่งเปลี่ยนอีกคู่)

   ชุดตามกติกา (ไม่ใช้ AI):
     xscript_email_org   ชื่อไทย↔อังกฤษทับศัพท์ตรง + อีเมลเดียวกัน + บริษัท/โดเมนเดียวกัน + ไม่มีเบอร์/ตำแหน่งขัดกัน
     same_name_org_title ชื่อเดียวกัน + องค์กรเดียวกัน + ตำแหน่งเดียวกัน + ไม่มีเบอร์/อีเมลขัดกัน
   ชุดที่ AI ช่วย (ai_name_match): คู่ที่มีอีเมลหรือเบอร์เดียวกัน + บริษัทเดียวกัน + ไม่มีช่องทางขัดกัน
     แต่ชื่อ/ตำแหน่งกติกาตัดสินไม่ได้ → AI ตอบ same/different/unsure · same เท่านั้นเข้าชุดที่ "เสนอ"
     AI ปิด (aiPolicy) → ไม่มีชุดที่พึ่ง AI · คู่เหล่านี้อยู่ในคิวทีละคู่ตามเดิม

   ยืนยันทั้งชุด (เอาบางคู่ออกได้) = ธุรกรรมเดียว: ทุกคู่ผ่าน decideReview เดิม (การรวมที่ย้อนได้ของ B3/B5.5)
   ด้วย merge_log.rule = merge_group_id ของชุด → ย้อนทั้งชุด = แยกคืนทุกการรวมในกลุ่ม แล้วเปิดคู่กลับเข้าคิว
   ชุด ≥ 20 คู่: สุ่ม 3 คู่เข้า sample_checks ตรวจได้เมื่อครบ 7 วัน · ผิด ≥ 1 → ชุดถูกส่งกลับไปตรวจทีละคู่ */

export const BATCH_RULES = ["xscript_email_org", "same_name_org_title", "ai_name_match"] as const;
export type BatchRule = (typeof BATCH_RULES)[number];
export const BATCH_RULE_TH: Record<BatchRule, string> = {
  xscript_email_org: "ชื่อไทยกับชื่ออังกฤษทับศัพท์ตรงกัน + อีเมลเดียวกัน + บริษัทเดียวกัน + ไม่มีเบอร์หรือตำแหน่งขัดกัน",
  same_name_org_title: "ชื่อเดียวกัน + บริษัทเดียวกัน + ตำแหน่งเดียวกัน + ไม่มีเบอร์หรืออีเมลขัดกัน",
  ai_name_match: "AI เห็นว่าชื่อเป็นคนเดียวกัน (ทับศัพท์/ตำแหน่งเขียนต่าง) + อีเมลหรือเบอร์เดียวกัน + บริษัทเดียวกัน + ไม่มีช่องทางขัดกัน",
};
export const BATCH_STATUS_TH: Record<string, string> = {
  proposed: "AI เสนอ รอยืนยัน", confirmed: "ยืนยันแล้ว", undone: "ย้อนทั้งชุดแล้ว", returned: "ส่งกลับตรวจทีละคู่ (สุ่มตรวจพบผิด)", dismissed: "ไม่ใช้ข้อเสนอนี้",
};
/** ชุดเล็กกว่านี้ไม่คุ้มที่จะเป็นชุด — ตรวจทีละคู่ได้เร็วกว่า */
export const MIN_BATCH = 2;
/** ชุดตั้งแต่ขนาดนี้ถูกสุ่มตรวจหลังรวม (ข้อ 5) */
export const SAMPLE_FROM = 20;
export const SAMPLE_PAIRS = 3;
export const SAMPLE_DELAY_DAYS = 7;
/** คู่ต่อการเรียก AI หนึ่งครั้ง */
const AI_CHUNK = 40;

export type ContactRel = "match" | "conflict" | "none";
export type AiVerdict = { v: "same" | "different" | "unsure"; f: NamePairField[]; r: string };
export type PairFacts = {
  itemId: string; batchId: string | null; ai: AiVerdict | null;
  a: PersonSide; b: PersonSide; orgA: string | null; orgB: string | null; titleA: string | null; titleB: string | null;
  name: "same" | "translit" | "unsure" | "different";
  email: ContactRel; phone: ContactRel;
  org: "same" | "domain" | "different" | "none";
  title: "same" | "different" | "none";
  isolated: boolean;
};

const id24 = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 24);
const inList = (xs: unknown[]) => xs.map(() => "?").join(",");
const RESTRICTION_RANK: Record<string, number> = { none: 0, review: 1, restricted: 2, suppressed: 3 };
const strictest = (...xs: string[]) => [...xs].sort((a, b) => (RESTRICTION_RANK[b] ?? 0) - (RESTRICTION_RANK[a] ?? 0))[0];
const norm = (t: string | null | undefined) => (t ?? "").normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();

/** กติกาที่คู่นี้เข้าได้ — null = ไม่มีกติกาที่แน่นพอ (ต้องตรวจทีละคู่ หรือให้ AI ช่วย) */
export function ruleOf(f: PairFacts): Exclude<BatchRule, "ai_name_match"> | null {
  if (!f.isolated || f.phone === "conflict") return null;
  if (f.name === "translit" && f.email === "match" && (f.org === "same" || f.org === "domain") && f.title !== "different") return "xscript_email_org";
  if (f.name === "same" && f.org === "same" && f.title === "same" && f.email !== "conflict") return "same_name_org_title";
  return null;
}

/** คู่ที่ให้ AI ช่วยได้ — หลักฐานช่องทางแน่นแล้ว เหลือแค่ชื่อ/ตำแหน่งที่กติกาตัดสินไม่ได้ */
export function aiCandidate(f: PairFacts): boolean {
  if (!f.isolated || ruleOf(f) || f.phone === "conflict" || f.email === "conflict") return false;
  if (f.email !== "match" && f.phone !== "match") return false;
  if (f.org !== "same" && f.org !== "domain") return false;
  return f.name === "unsure" || f.name === "different" || (f.name === "translit" && f.title === "different") || (f.name === "same" && f.title !== "same");
}

const flagOf = (r: ContactRel): ContactFlag => (r === "match" ? "ตรงกัน" : r === "conflict" ? "ไม่ตรง" : "ไม่มี");

/* ── ข้อเท็จจริงของทุกคู่คนที่ค้างตรวจ ── อ่านรวดเดียว (ไม่ hydrate ทีละคู่) */
export async function pairFacts(tenantId: string): Promise<PairFacts[]> {
  const items = await all<{ id: string; subject_ids: string; batch_id: string | null; ai_verdict: string | null }>(
    "SELECT id, subject_ids, batch_id, ai_verdict FROM review_items WHERE tenant_id = ? AND kind = 'person_pair' AND status = 'open' ORDER BY confidence DESC, created_at, id",
    tenantId,
  );
  if (!items.length) return [];
  const parsed = items.map((it) => ({ ...it, ids: JSON.parse(it.subject_ids) as string[] }));
  const seen = new Map<string, number>();
  for (const it of parsed) for (const id of it.ids) seen.set(id, (seen.get(id) ?? 0) + 1);
  const ids = [...seen.keys()];
  const sides = new Map((await personSides(tenantId, ids)).map((p) => [p.id, p]));
  const affs = await all<{ customer_id: string; org_id: string; org: string; title: string | null }>(
    `SELECT a.customer_id, a.org_id, o.name AS org, a.title FROM affiliations a
     JOIN orgs o ON o.id = a.org_id AND o.tenant_id = a.tenant_id
     WHERE a.tenant_id = ? AND a.customer_id IN (${inList(ids)}) ORDER BY a.valid_to IS NOT NULL, a.valid_from DESC`,
    tenantId, ...ids,
  );
  const orgIds = [...new Set(affs.map((a) => a.org_id))];
  const domains = orgIds.length
    ? await all<{ org_id: string; domain: string }>(`SELECT org_id, domain FROM org_domains WHERE tenant_id = ? AND org_id IN (${inList(orgIds)})`, tenantId, ...orgIds)
    : [];
  const domOfOrg = new Map<string, Set<string>>();
  for (const d of domains) domOfOrg.set(d.org_id, (domOfOrg.get(d.org_id) ?? new Set()).add(d.domain));
  const affOf = new Map<string, typeof affs>();
  for (const a of affs) affOf.set(a.customer_id, [...(affOf.get(a.customer_id) ?? []), a]);

  const contactRel = (a: PersonSide, b: PersonSide, kind: "email" | "phone"): ContactRel => {
    const x = a.contacts.filter((c) => c.kind === kind), y = b.contacts.filter((c) => c.kind === kind);
    if (!x.length || !y.length) return "none";
    if (x.some((c) => y.some((d) => d.hmac === c.hmac))) return "match";
    if (kind === "phone") return "conflict";
    /* อีเมล: ขัดกันเฉพาะเมื่อมีอีเมลโดเมนบริษัทเดียวกันทั้งสองฝั่ง (คนละคนในบริษัทเดียวกัน) — ค่าปิดบางยังเห็นโดเมน */
    const corp = (p: typeof x) => new Set(p.map((c) => c.masked.split("@")[1] ?? "").filter((d) => d && !emailInfo(`x@${d}`)?.free));
    const cx = corp(x), cy = corp(y);
    return [...cx].some((d) => cy.has(d)) ? "conflict" : "none";
  };

  const out: PairFacts[] = [];
  for (const it of parsed) {
    if (it.ids.length !== 2) continue;
    const a = sides.get(it.ids[0]), b = sides.get(it.ids[1]);
    if (!a || !b) continue;
    const na = nameInfo(a.name), nb = nameInfo(b.name);
    const cmp = compareNames(na, nb);
    const name = cmp === "same" ? "same" : cmp === "different" ? "different" : translitMatch(na, nb) ? "translit" : "unsure";
    const fa = affOf.get(a.id) ?? [], fb = affOf.get(b.id) ?? [];
    const oa = new Set(fa.map((x) => x.org_id)), ob = new Set(fb.map((x) => x.org_id));
    const domA = new Set([...oa].flatMap((o) => [...(domOfOrg.get(o) ?? [])]));
    const domB = new Set([...ob].flatMap((o) => [...(domOfOrg.get(o) ?? [])]));
    const org = [...oa].some((o) => ob.has(o)) ? "same" : [...domA].some((d) => domB.has(d)) ? "domain" : oa.size && ob.size ? "different" : "none";
    const ta = new Set(fa.map((x) => norm(x.title)).filter(Boolean)), tb = new Set(fb.map((x) => norm(x.title)).filter(Boolean));
    const title = [...ta].some((t) => tb.has(t)) ? "same" : ta.size && tb.size ? "different" : "none";
    let ai: AiVerdict | null = null;
    try { ai = it.ai_verdict ? (JSON.parse(it.ai_verdict) as AiVerdict) : null; } catch { ai = null; }
    out.push({
      itemId: it.id, batchId: it.batch_id, ai, a, b,
      orgA: fa[0]?.org ?? null, orgB: fb[0]?.org ?? null, titleA: fa.find((x) => x.title)?.title ?? null, titleB: fb.find((x) => x.title)?.title ?? null,
      name, email: contactRel(a, b, "email"), phone: contactRel(a, b, "phone"), org, title,
      isolated: seen.get(a.id) === 1 && seen.get(b.id) === 1,
    });
  }
  return out;
}

export type ProposedBatch = {
  /** กุญแจของชุด: รหัสชุดที่ AI เสนอ หรือชื่อกติกา (ชุดตามกติกาคำนวณสด ยังไม่มีแถวในฐานจนยืนยัน) */
  key: string; batchId: string | null; rule: BatchRule; aiAssisted: boolean; pairs: PairFacts[];
};

/** ชุดที่เสนอได้ตอนนี้ — ใหญ่ก่อน · ชุดที่พึ่ง AI แสดงเฉพาะเมื่อบัญชีนี้ยังใช้ AI ได้ */
export async function proposeBatches(tenantId: string, facts?: PairFacts[]): Promise<ProposedBatch[]> {
  const fs = facts ?? (await pairFacts(tenantId));
  const byRule = new Map<BatchRule, PairFacts[]>();
  for (const f of fs) {
    if (f.batchId) continue;
    const r = ruleOf(f);
    if (r) byRule.set(r, [...(byRule.get(r) ?? []), f]);
  }
  const out: ProposedBatch[] = [...byRule].filter(([, ps]) => ps.length >= MIN_BATCH)
    .map(([rule, pairs]) => ({ key: rule, batchId: null, rule, aiAssisted: false, pairs }));
  if ((await aiPolicy(tenantId)).allowed) {
    const proposed = await all<{ id: string }>(
      "SELECT id FROM review_batches WHERE tenant_id = ? AND status = 'proposed' AND ai_assisted = 1 ORDER BY created_at", tenantId,
    );
    for (const b of proposed) {
      /* ตรวจซ้ำตอนแสดง: ข้อมูลเปลี่ยนหลัง AI ตอบ (ช่องทางขัดกันเพิ่ม · คนเข้าคู่อื่น) = หลุดจากชุด */
      const pairs = fs.filter((f) => f.batchId === b.id && f.ai?.v === "same" && aiCandidate(f));
      if (pairs.length) out.push({ key: b.id, batchId: b.id, rule: "ai_name_match", aiAssisted: true, pairs });
    }
  }
  return out.sort((x, y) => y.pairs.length - x.pairs.length);
}

/** สุ่มตัวอย่าง n คู่ให้ดู (ข้อ 1: "พร้อมตัวอย่าง 5 คู่ + สุ่มให้ดู") */
export function examplesOf<T>(xs: T[], n = 5): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}

/** คู่ที่ AI ช่วยได้และยังไม่เคยถาม — ให้หน้าจอบอกว่ามีกี่คู่ */
export async function aiCandidates(tenantId: string, facts?: PairFacts[]): Promise<PairFacts[]> {
  return (facts ?? (await pairFacts(tenantId))).filter((f) => !f.batchId && !f.ai && aiCandidate(f));
}

/** ภาพรวมสำหรับหน้าคิวตรวจ: ชุดที่เสนอ · คู่ที่ AI ช่วยได้ · AI เปิดอยู่ไหม (และเพราะอะไรถ้าปิด) */
export async function batchOverview(tenantId: string) {
  const facts = await pairFacts(tenantId);
  const [batches, ai, cands] = await Promise.all([proposeBatches(tenantId, facts), aiPolicy(tenantId), aiCandidates(tenantId, facts)]);
  return { batches, aiCandidates: cands.length, ai };
}

class Abort extends Error {}
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/* ── ให้ AI ช่วยคู่ที่กติกาตัดสินไม่ได้ ── คำตอบ same → ชุดที่ "เสนอ" (คนยังต้องยืนยัน) · อื่น ๆ อยู่ในคิวทีละคู่ */
export async function aiAssist(tenantId: string, actor: string): Promise<Result<{ asked: number; same: number; different: number; unsure: number; batchId: string | null }>> {
  const policy = await aiPolicy(tenantId);
  if (!policy.allowed) return { ok: false, error: `${policy.reason} — คู่ที่ต้องให้ AI ช่วยยังตรวจทีละคู่ได้ตามเดิม` };
  const cands = (await aiCandidates(tenantId)).slice(0, AI_CHUNK * 5);
  if (!cands.length) return { ok: false, error: "ไม่มีคู่ที่ต้องให้ AI ช่วย" };
  let same = 0, different = 0, unsure = 0, asked = 0, batchId: string | null = null;
  for (let i = 0; i < cands.length; i += AI_CHUNK) {
    const chunk = cands.slice(i, i + AI_CHUNK);
    /* ส่งเฉพาะชื่อ · ตำแหน่ง · ชื่อบริษัท · ธง "ตรงกัน/ไม่ตรง/ไม่มี" — ไม่มีช่องให้ค่าติดต่อจริง */
    const input: NamePairInput[] = chunk.map((f, n) => ({
      ref: `P${n + 1}`,
      a: { name: f.a.name, title: f.titleA, org: f.orgA },
      b: { name: f.b.name, title: f.titleB, org: f.orgB },
      email: flagOf(f.email), phone: flagOf(f.phone),
    }));
    const res = await judgeNamePairs(tenantId, input);
    /* ตกไปสูตรสำรอง = ทุกคู่ "ไม่แน่ใจ" ซึ่งไม่ใช่คำตอบของ AI — ไม่บันทึก จะได้ถามใหม่ได้เมื่อ AI กลับมา */
    if (res.source === "fallback") {
      if (!asked) return { ok: false, error: res.note ?? "AI ใช้ไม่ได้ตอนนี้ — คู่เหล่านี้ตรวจทีละคู่ได้ตามเดิม" };
      break;
    }
    asked += chunk.length;
    await tx(async (q) => {
      for (const [n, f] of chunk.entries()) {
        const v = res.value[n];
        const verdict: AiVerdict = { v: v?.verdict ?? "unsure", f: v?.fields ?? [], r: v?.reason ?? "" };
        if (verdict.v === "same") same++; else if (verdict.v === "different") different++; else unsure++;
        if (verdict.v === "same" && !batchId) {
          const open = await q.get<{ id: string }>(
            "SELECT id FROM review_batches WHERE tenant_id = ? AND status = 'proposed' AND ai_assisted = 1 ORDER BY created_at LIMIT 1", tenantId,
          );
          batchId = open?.id ?? `rb-${id24(`${tenantId}|ai|${Date.now()}|${f.itemId}`)}`;
          if (!open) {
            await q.run(
              "INSERT INTO review_batches (id, tenant_id, rule, ai_assisted, size, status, created_at) VALUES (?,?,?,?,?,?,?)",
              batchId, tenantId, "ai_name_match", 1, 0, "proposed", new Date().toISOString(),
            );
          }
        }
        await q.run(
          "UPDATE review_items SET ai_verdict = ?, batch_id = ? WHERE tenant_id = ? AND id = ? AND status = 'open'",
          JSON.stringify(verdict), verdict.v === "same" ? batchId : null, tenantId, f.itemId,
        );
      }
      if (batchId) {
        await q.run(
          "UPDATE review_batches SET size = (SELECT COUNT(*) FROM review_items WHERE tenant_id = ? AND batch_id = ? AND status = 'open') WHERE tenant_id = ? AND id = ?",
          tenantId, batchId, tenantId, batchId,
        );
      }
    });
  }
  await logActivity(tenantId, actor, "batch_ai_assist", `${asked} pairs · same ${same} · different ${different} · unsure ${unsure}`);
  return { ok: true, asked, same, different, unsure, batchId };
}

/** ไม่ใช้ข้อเสนอของ AI — คู่ในชุดกลับไปอยู่ในคิวทีละคู่ (ไม่ถูกเสนอเป็นชุดซ้ำ) */
export async function dismissBatch(tenantId: string, batchId: string, actor: string): Promise<Result> {
  const r = await tx(async (q) =>
    q.run("UPDATE review_batches SET status = 'dismissed', decided_by = ?, decided_at = ? WHERE tenant_id = ? AND id = ? AND status = 'proposed'",
      actor, new Date().toISOString(), tenantId, batchId));
  if (!r.changes) return { ok: false, error: "ไม่พบข้อเสนอนี้ หรือถูกตัดสินไปแล้ว" };
  await logActivity(tenantId, actor, "batch_dismiss", batchId);
  return { ok: true };
}

/* ── ยืนยันทั้งชุด ── ธุรกรรมเดียว: รวมครบทุกคู่ที่เลือก หรือไม่รวมเลย */
export async function confirmBatch(
  tenantId: string,
  input: { key: string; itemIds: string[]; exclude?: string[] },
  actor: string,
): Promise<Result<{ batchId: string; merged: number; dropped: number; excluded: number; sampled: number }>> {
  const batch = (await proposeBatches(tenantId)).find((b) => b.key === input.key);
  if (!batch) return { ok: false, error: "ชุดนี้ไม่มีแล้ว — ข้อมูลเปลี่ยนหรือถูกตัดสินไปแล้ว โหลดหน้าใหม่" };
  /* ยืนยันได้เฉพาะคู่ที่ผู้ใช้เห็นตอนเปิดหน้า และยังอยู่ในชุดตอนกด — คู่ที่เข้าชุดทีหลังไม่ถูกรวมโดยไม่มีใครเห็น
     และคู่ที่ส่งมาเองแต่ไม่อยู่ในชุด (ยิง action ตรง) ไม่ถูกรวม */
  const inBatch = new Set(batch.pairs.map((p) => p.itemId));
  const exclude = new Set((input.exclude ?? []).filter((id) => inBatch.has(id)));
  const shown = [...new Set(input.itemIds)];
  const chosen = shown.filter((id) => inBatch.has(id) && !exclude.has(id));
  const dropped = shown.filter((id) => !inBatch.has(id)).length;
  if (!chosen.length) return { ok: false, error: "ไม่มีคู่เหลือให้รวมในชุดนี้" };

  const batchId = batch.batchId ?? `rb-${id24(`${tenantId}|${batch.rule}|${Date.now()}|${chosen.join(",")}`)}`;
  const group = `batch:${batchId}`;
  const now = new Date();
  let sampled = 0;
  try {
    await tx(async (q) => {
      if (batch.batchId) {
        const r = await q.run(
          "UPDATE review_batches SET status = 'confirmed', size = ?, decided_by = ?, decided_at = ?, merge_group_id = ? WHERE tenant_id = ? AND id = ? AND status = 'proposed'",
          chosen.length, actor, now.toISOString(), group, tenantId, batchId,
        );
        if (!r.changes) throw new Abort("ข้อเสนอนี้ถูกตัดสินไปแล้ว");
      } else {
        await q.run(
          `INSERT INTO review_batches (id, tenant_id, rule, ai_assisted, size, status, decided_by, decided_at, merge_group_id, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
          batchId, tenantId, batch.rule, 0, chosen.length, "confirmed", actor, now.toISOString(), group, now.toISOString(),
        );
      }
      /* คู่ที่เอาออกผูกกับชุดไว้ด้วย — อยู่ในคิวทีละคู่ และไม่ถูกเสนอเป็นชุดซ้ำ */
      const marked = [...chosen, ...exclude];
      await q.run(`UPDATE review_items SET batch_id = ? WHERE tenant_id = ? AND id IN (${inList(marked)})`, batchId, tenantId, ...marked);
      const mergeOf = new Map<string, string>();
      for (const id of chosen) {
        const r = await decideReview(tenantId, id, "same", actor, `ยืนยันเป็นชุด ${batchId}`, group);
        if (!r.ok) throw new Abort(r.error);
        if (r.mergeIds[0]) mergeOf.set(id, r.mergeIds[0]);
      }
      if (chosen.length >= SAMPLE_FROM) {
        const due = new Date(+now + SAMPLE_DELAY_DAYS * 864e5).toISOString();
        for (const id of examplesOf(chosen, SAMPLE_PAIRS)) {
          const m = await q.get<{ survivor_id: string }>("SELECT survivor_id FROM merge_log WHERE tenant_id = ? AND id = ?", tenantId, mergeOf.get(id) ?? "");
          if (!m) continue;
          /* แถวรอตรวจ: verdict 'pending' · checked_at = เวลาที่สุ่ม · due_at = ตรวจได้ตั้งแต่ */
          await q.run(
            "INSERT INTO sample_checks (id, tenant_id, customer_id, verdict, checked_by, checked_at, note, batch_id, due_at) VALUES (?,?,?,?,?,?,?,?,?)",
            `sc-${id24(`${batchId}|${id}`)}`, tenantId, m.survivor_id, "pending", "system:batch", now.toISOString(), null, batchId, due,
          );
          sampled++;
        }
      }
      await logActivity(tenantId, actor, "batch_confirm", `${batchId} · ${batch.rule} · ${chosen.length} pairs · excluded ${exclude.size}`);
    });
  } catch (e) {
    if (e instanceof Abort) return { ok: false, error: `${e.message} — ไม่มีคู่ใดในชุดถูกรวม` };
    throw e;
  }
  return { ok: true, batchId, merged: chosen.length, dropped, excluded: exclude.size, sampled };
}

/* ── ย้อนทั้งชุด ── ธุรกรรมเดียว: แยกคืนทุกการรวมในกลุ่ม (รวม consents และข้อจำกัด — unmerge เดิม)
   แล้วคืนคู่กลับเข้าคิวตามที่เป็นก่อนยืนยัน — ไม่บันทึกว่า "ต่างคน" เพราะไม่มีใครตัดสินแบบนั้น */
export async function undoBatch(tenantId: string, batchId: string, actor: string, why: "undo" | "sample_failed" = "undo"): Promise<Result<{ restored: number }>> {
  let restored = 0;
  try {
    await tx(async (q) => {
      const b = await q.get<{ status: string; merge_group_id: string | null }>(
        "SELECT status, merge_group_id FROM review_batches WHERE tenant_id = ? AND id = ?", tenantId, batchId,
      );
      if (!b) throw new Abort("ไม่พบชุดนี้");
      if (b.status !== "confirmed" || !b.merge_group_id) throw new Abort("ชุดนี้ยังไม่ได้ยืนยัน หรือถูกย้อนไปแล้ว");
      const merges = await q.all<{ id: string; survivor_id: string; merged_id: string; impact: string; decided_at: string }>(
        "SELECT id, survivor_id, merged_id, impact, decided_at FROM merge_log WHERE tenant_id = ? AND rule = ? AND undone_at IS NULL ORDER BY decided_at DESC, id DESC",
        tenantId, b.merge_group_id,
      );
      for (const m of merges) {
        /* ── ข้อจำกัดต้องกลับเป็นของเดิม ไม่ใช่ "เข้มกว่าชนะ" ──
           unmerge ปกติ (คนตัดสินว่าต่างคน) ให้ทั้งสองคนถือข้อจำกัดที่เข้มกว่า เพราะไม่รู้ว่าข้อจำกัดที่บันทึกระหว่างรวมเป็นของใคร
           ย้อนชุดคือ "ยกเลิกการยืนยัน" ไม่ใช่คำตัดสินใหม่ — ถ้าระหว่างรวมไม่มีอะไรเปลี่ยน (ข้อจำกัดยังเท่าที่ตั้งตอนรวม
           และไม่มี preference ใหม่) จึงคืนค่าเดิมของแต่ละคนได้ตรง ๆ · ถ้ามีอะไรเปลี่ยน ใช้กติกาของ unmerge (ไม่อ่อนลง) */
        const impact = JSON.parse(m.impact) as { keepBefore?: { restriction_status?: string }; drop?: { restriction_status?: string | null } };
        const keepWas = String(impact.keepBefore?.restriction_status ?? "none"), dropWas = String(impact.drop?.restriction_status ?? "none");
        const cur = await q.get<{ restriction_status: string | null }>("SELECT restriction_status FROM customers WHERE tenant_id = ? AND id = ?", tenantId, m.survivor_id);
        const changed = await q.get<{ x: number }>(
          "SELECT 1 AS x FROM preferences WHERE tenant_id = ? AND customer_id IN (?, ?) AND recorded_at >= ? LIMIT 1", tenantId, m.survivor_id, m.merged_id, m.decided_at,
        );
        const untouched = !changed && String(cur?.restriction_status ?? "none") === strictest(keepWas, dropWas);
        const r = await unmerge(tenantId, m.id, actor);
        if (!r.ok) throw new Abort(r.error);
        if (untouched) {
          await q.run("UPDATE customers SET restriction_status = ? WHERE tenant_id = ? AND id = ?", keepWas, tenantId, m.survivor_id);
          await q.run("UPDATE customers SET restriction_status = ? WHERE tenant_id = ? AND id = ?", dropWas, tenantId, m.merged_id);
        }
        const [x, y] = [m.survivor_id, m.merged_id].sort();
        await q.run("DELETE FROM resolution_overrides WHERE tenant_id = ? AND kind = 'person' AND a_id = ? AND b_id = ?", tenantId, x, y);
      }
      const items = await q.all<{ id: string; subject_ids: string }>(
        "SELECT id, subject_ids FROM review_items WHERE tenant_id = ? AND batch_id = ? AND status = 'merged'", tenantId, batchId,
      );
      for (const it of items) {
        await q.run("UPDATE review_items SET status = 'open', decided_by = NULL, decided_at = NULL, decision_note = NULL WHERE tenant_id = ? AND id = ?", tenantId, it.id);
        const ids = JSON.parse(it.subject_ids) as string[];
        /* คนที่มีคู่ค้างตรวจอยู่ในสถานะรอตรวจเสมอ (resolve.ts) — unmerge ตั้งเป็น confirmed เพราะตอนนั้นคู่ยังปิดอยู่ */
        await q.run(`UPDATE customers SET lifecycle_state = 'pending_review' WHERE tenant_id = ? AND id IN (${inList(ids)})`, tenantId, ...ids);
      }
      restored = items.length;
      await q.run("DELETE FROM sample_checks WHERE tenant_id = ? AND batch_id = ? AND verdict = 'pending'", tenantId, batchId);
      await q.run("UPDATE review_batches SET status = ?, undone_by = ?, undone_at = ? WHERE tenant_id = ? AND id = ?",
        why === "undo" ? "undone" : "returned", actor, new Date().toISOString(), tenantId, batchId);
      await logActivity(tenantId, actor, why === "undo" ? "batch_undo" : "batch_returned", `${batchId} · ${restored} pairs`);
    });
  } catch (e) {
    if (e instanceof Abort) return { ok: false, error: `${e.message} — ไม่มีคู่ใดถูกแยกคืน` };
    throw e;
  }
  return { ok: true, restored };
}

/* ── ประวัติชุด ── */
export type BatchRecord = {
  id: string; rule: BatchRule; aiAssisted: boolean; size: number; status: string; decidedBy: string | null; decidedAt: string | null;
  undoneAt: string | null; samplesPending: number; samplesOk: number; samplesWrong: number;
};
export async function batchHistory(tenantId: string, limit = 20): Promise<BatchRecord[]> {
  const rows = await all<{ id: string; rule: string; ai_assisted: number | boolean; size: number | string; status: string; decided_by: string | null; decided_at: string | null; undone_at: string | null }>(
    "SELECT id, rule, ai_assisted, size, status, decided_by, decided_at, undone_at FROM review_batches WHERE tenant_id = ? AND status <> 'proposed' ORDER BY COALESCE(decided_at, created_at) DESC LIMIT ?",
    tenantId, limit,
  );
  if (!rows.length) return [];
  const s = await all<{ batch_id: string; verdict: string; n: number | string }>(
    `SELECT batch_id, verdict, COUNT(*) AS n FROM sample_checks WHERE tenant_id = ? AND batch_id IN (${inList(rows)}) GROUP BY batch_id, verdict`,
    tenantId, ...rows.map((r) => r.id),
  );
  const n = (id: string, v: string) => Number(s.find((x) => x.batch_id === id && x.verdict === v)?.n ?? 0);
  return rows.map((r) => ({
    id: r.id, rule: r.rule as BatchRule, aiAssisted: Boolean(Number(r.ai_assisted)), size: Number(r.size), status: r.status,
    decidedBy: r.decided_by, decidedAt: r.decided_at, undoneAt: r.undone_at,
    samplesPending: n(r.id, "pending"), samplesOk: n(r.id, "merge_ok"), samplesWrong: n(r.id, "merge_wrong"),
  }));
}

/* ── สุ่มตรวจหลังรวมเป็นชุด (ข้อ 5) ── */
export type BatchSample = { id: string; batchId: string; rule: BatchRule; customerId: string; name: string; dueAt: string; rows: SampleRow[] };

/** รายการที่ครบกำหนดตรวจแล้ว (ระบบสุ่มไว้ตอนยืนยัน ผู้ตรวจเลือกเองไม่ได้) */
export async function dueBatchSamples(tenantId: string, now = new Date(), limit = 3): Promise<BatchSample[]> {
  const rows = await all<{ id: string; batch_id: string; rule: string; customer_id: string; name: string; due_at: string }>(
    `SELECT s.id, s.batch_id, b.rule, s.customer_id, c.name, s.due_at FROM sample_checks s
     JOIN review_batches b ON b.id = s.batch_id AND b.tenant_id = s.tenant_id AND b.status = 'confirmed'
     JOIN customers c ON c.id = s.customer_id AND c.tenant_id = s.tenant_id
     WHERE s.tenant_id = ? AND s.verdict = 'pending' AND s.due_at <= ? ORDER BY s.due_at, s.id LIMIT ?`,
    tenantId, now.toISOString(), limit,
  );
  return Promise.all(rows.map(async (r) => ({
    id: r.id, batchId: r.batch_id, rule: r.rule as BatchRule, customerId: r.customer_id, name: r.name, dueAt: r.due_at,
    rows: await sampleRowsOf(tenantId, r.customer_id),
  })));
}

/** บันทึกผลสุ่มตรวจของชุด — ผิด ≥ 1 ใน 3 → ชุดถูกย้อนทั้งชุดและส่งกลับไปตรวจทีละคู่ */
export async function recordBatchSample(
  tenantId: string, sampleId: string, verdict: "merge_ok" | "merge_wrong", actor: string, now = new Date(),
): Promise<Result<{ returned: boolean }>> {
  if (verdict !== "merge_ok" && verdict !== "merge_wrong") return { ok: false, error: "ผลตรวจไม่ถูกต้อง" };
  const s = await get<{ batch_id: string; due_at: string | null }>(
    "SELECT batch_id, due_at FROM sample_checks WHERE tenant_id = ? AND id = ? AND verdict = 'pending'", tenantId, sampleId,
  );
  if (!s) return { ok: false, error: "ไม่พบรายการสุ่มตรวจนี้ หรือตรวจไปแล้ว" };
  if (s.due_at && s.due_at > now.toISOString()) return { ok: false, error: "ยังไม่ครบ 7 วันหลังรวม — ตรวจได้เมื่อครบกำหนด" };
  const params: Param[] = [verdict, actor, now.toISOString(), tenantId, sampleId];
  await tx((q) => q.run("UPDATE sample_checks SET verdict = ?, checked_by = ?, checked_at = ? WHERE tenant_id = ? AND id = ? AND verdict = 'pending'", ...params));
  await logActivity(tenantId, actor, "batch_sample_check", `${s.batch_id} · ${verdict}`);
  if (verdict === "merge_wrong") {
    const r = await undoBatch(tenantId, s.batch_id, actor, "sample_failed");
    if (!r.ok) return { ok: false, error: `บันทึกว่าผิดแล้ว แต่ส่งชุดกลับไม่ได้: ${r.error}` };
    return { ok: true, returned: true };
  }
  return { ok: true, returned: false };
}
