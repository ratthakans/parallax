import { createHash } from "node:crypto";
import { all, get, run, tx, type Param, type Sql } from "@/lib/engine/sql";
import { logActivity } from "@/lib/engine/db";
import { CLEARANCE_RANK } from "@/lib/shared/accounts";
import type { Classification } from "@/lib/shared/vault";

/* ── รวมและแยกตัวตน (Blueprint 2.0 บท 3: "การรวมต้องย้อนได้โดยไม่ทำให้ประวัติการติดต่อหาย") ─────

   รวมคน: ย้ายทุกอย่างของคนที่ถูกรวมไปที่คนที่คงอยู่ · เก็บภาพก่อนรวมไว้ใน merge_log.impact ครบพอจะคืนกลับ
   แยก (unmerge): สร้างคนที่ถูกรวมคืน ย้ายกลับเฉพาะแถวที่ย้ายตอนรวม และบันทึกว่า "ไม่ใช่คนเดียวกัน"
   ข้อจำกัดการติดต่อ: คนที่คงอยู่ได้ระดับที่เข้มกว่าของสองคน จนกว่าจะมีคนตรวจ
   ระบบไม่เรียกฟังก์ชันนี้เอง — เรียกจากการตัดสินของคนในคิวตรวจเท่านั้น */

type Moved = Record<string, (string | number)[][]>;
type PersonImpact = {
  kind: "person";
  drop: Record<string, Param>;
  dropProfile: Record<string, Param> | null;
  dropPoints: Record<string, Param>[];
  createdPointIds: string[];
  keepBefore: { lifecycle_state: string; restriction_status: string; profile: Record<string, Param> | null };
  moved: Moved;
  /** แถวของฝั่งที่ถูกรวมที่ชนกับแถวของฝั่งที่คงอยู่ (เป้าหมายแคมเปญเดียวกัน · โอกาสเดียวกัน) — เก็บทั้งแถวไว้คืนตอนแยก */
  parked?: Record<string, Record<string, Param>[]>;
  /** งานเปิดของเป้าหมายที่ถูกพัก ซึ่งย้ายไปผูกกับเป้าหมายของคนที่คงอยู่ — [task id, target เดิม] คืนตอนแยก */
  repointedTasks?: [string, string][];
  /** สถานะความยินยอมแบบเดิม (consents) ของทั้งสองฝั่งก่อนรวม — คืนตอนแยก */
  consents?: { drop: Record<string, Param>[]; keepBefore: Record<string, Param>[] };
};

/* ตารางที่หนึ่งคนมีได้หนึ่งแถวต่อขอบเขต — ถ้าทั้งสองฝั่งมีในขอบเขตเดียวกัน แถวของคนที่คงอยู่ชนะ
   แถวของฝั่งที่ถูกรวมถูกพักไว้ใน impact (ไม่ทิ้ง) แล้วคืนตอนแยก */
const PERSON_UNIQUE: { table: string; scope: string }[] = [
  { table: "campaign_targets", scope: "campaign_id" },
  { table: "opportunity_people", scope: "opportunity_id" },
];

/* ตารางที่ย้ายตามคน — กุญแจของแต่ละแถวที่ย้ายถูกจดไว้ เพื่อแยกคืนได้ตรงแถว */
const PERSON_MOVES: { table: string; key: string[]; column: string; where?: string }[] = [
  { table: "affiliations", key: ["id"], column: "customer_id" },
  { table: "participations", key: ["id"], column: "customer_id" },
  { table: "interactions", key: ["id"], column: "customer_id" },
  { table: "tasks", key: ["id"], column: "customer_id" },
  { table: "import_rows", key: ["batch_id", "line"], column: "customer_id" },
  { table: "sample_checks", key: ["id"], column: "customer_id" },
  { table: "opportunity_people", key: ["opportunity_id"], column: "customer_id" },
  /* ดีลลูกค้าบุคคล (F3) ย้ายตามคน — แยกคืนได้ตรงแถว */
  { table: "opportunities", key: ["id"], column: "customer_id", where: "org_id IS NULL" },
  { table: "campaign_targets", key: ["id"], column: "customer_id" },
  { table: "relationship_assertions", key: ["id"], column: "from_id", where: "from_kind = 'person'" },
  { table: "relationship_assertions", key: ["id"], column: "to_id", where: "to_kind = 'person'" },
];
/* preferences เป็นตารางเพิ่มอย่างเดียว (แก้/ลบไม่ได้ใน Postgres) จึงไม่ย้าย — คงอยู่ใต้รหัสเดิม
   และอ่านผ่าน personIdsOf() ซึ่งรวมรหัสที่ถูกรวมเข้ามาและยังไม่ถูกแยกคืน · แยกคืนจึงไม่ต้องแตะ preferences เลย */
/* ข้อมูลยุคค้าปลีก — ไม่ย้ายในการรวมของ Data Vault (ใช้หน้าลูกค้าเดิม)
   consents ไม่อยู่ในรายการนี้: ทุกคนที่เพิ่มด้วยมือมีแถว consents เสมอ ถ้าปฏิเสธเพราะมัน คนที่เพิ่มด้วยมือ
   จะรวมแบบย้อนได้ไม่ได้เลย — การรวมด้านล่างรวม consents แบบเดียวกับทางเดิม (ถอนล่าสุดชนะ) และเก็บไว้คืนตอนแยก */
export const RETAIL = ["transactions", "events", "memberships", "campaign_audience", "messages"];
const RESTRICTION_RANK: Record<string, number> = { none: 0, review: 1, restricted: 2, suppressed: 3 };
/* ระดับความลับที่สูงกว่าชนะเมื่อรวม — รวมแฟ้มจำกัดสูงเข้ากับแฟ้มทั่วไปต้องไม่ทำให้ข้อมูลจำกัดสูงเปิดให้ทุกคน */
const higher = (a: Param, b: Param): Classification =>
  [String(a ?? "confidential"), String(b ?? "confidential")]
    .sort((x, y) => (CLEARANCE_RANK[y as Classification] ?? 2) - (CLEARANCE_RANK[x as Classification] ?? 2))[0] as Classification;

const id24 = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 24);
const one = async <T,>(q: Sql, sql: string, ...p: Param[]) => (await q.get<T>(sql, ...p)) ?? null;

async function insertRow(q: Sql, table: string, row: Record<string, Param>) {
  const cols = Object.keys(row);
  await q.run(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`, ...cols.map((c) => row[c]));
}

export type MergeResult = { ok: true; mergeId: string } | { ok: false; error: string };

export async function mergePersons(
  tenantId: string, keepId: string, dropId: string, actor: string, rule: string, confidence: number | null,
): Promise<MergeResult> {
  if (keepId === dropId) return { ok: false, error: "เป็นคนเดียวกันอยู่แล้ว" };
  for (const t of RETAIL) {
    const has = await get<{ x: number }>(`SELECT 1 AS x FROM ${t} WHERE customer_id = ? LIMIT 1`, dropId);
    if (has) return { ok: false, error: "คนนี้มีข้อมูลจากระบบเดิม (ยอดซื้อ/แคมเปญ) — รวมจากหน้าลูกค้าเดิมแทน" };
  }
  const mergeId = `m-${id24(`${tenantId}|${keepId}|${dropId}|${Date.now()}`)}`;
  const done = await tx(async (q) => {
    const keep = await one<Record<string, Param>>(q, "SELECT * FROM customers WHERE tenant_id = ? AND id = ?", tenantId, keepId);
    const drop = await one<Record<string, Param>>(q, "SELECT * FROM customers WHERE tenant_id = ? AND id = ?", tenantId, dropId);
    if (!keep || !drop) return "ไม่พบคนใดคนหนึ่งในบัญชีนี้ — อาจถูกรวมหรือลบไปแล้ว";

    const keepProfile = await one<Record<string, Param>>(q, "SELECT * FROM contact_profiles WHERE customer_id = ?", keepId);
    const dropProfile = await one<Record<string, Param>>(q, "SELECT * FROM contact_profiles WHERE customer_id = ?", dropId);
    const dropPoints = await q.all<Record<string, Param>>("SELECT * FROM contact_points WHERE tenant_id = ? AND customer_id = ?", tenantId, dropId);
    const keepHmacs = new Set((await q.all<{ kind: string; value_hmac: string }>(
      "SELECT kind, value_hmac FROM contact_points WHERE tenant_id = ? AND customer_id = ?", tenantId, keepId,
    )).map((p) => `${p.kind}|${p.value_hmac}`));

    const parked: Record<string, Record<string, Param>[]> = {};
    const repointed: [string, string][] = [];
    for (const u of PERSON_UNIQUE) {
      const clash = await q.all<Record<string, Param>>(
        `SELECT * FROM ${u.table} d WHERE d.tenant_id = ? AND d.customer_id = ? AND EXISTS (
           SELECT 1 FROM ${u.table} k WHERE k.tenant_id = d.tenant_id AND k.customer_id = ? AND k.${u.scope} = d.${u.scope})`,
        tenantId, dropId, keepId,
      );
      if (!clash.length) continue;
      parked[u.table] = clash;
      /* งานเปิดของเป้าหมายที่ถูกพักจะย้ายตามคน (tasks) แต่ยังชี้ target ที่ถูกลบ — การถอน/คัดค้านทีหลังจึงยกเลิกมันไม่ได้
         ผูกใหม่กับเป้าหมายของคนที่คงอยู่ในแคมเปญเดียวกัน */
      if (u.table === "campaign_targets") {
        for (const r of clash) {
          const keepTarget = await one<{ id: string }>(q, "SELECT id FROM campaign_targets WHERE tenant_id = ? AND customer_id = ? AND campaign_id = ?", tenantId, keepId, r.campaign_id);
          const open = await q.all<{ id: string }>("SELECT id FROM tasks WHERE tenant_id = ? AND target_id = ? AND status = 'open'", tenantId, r.id);
          if (!keepTarget || !open.length) continue;
          for (const t of open) repointed.push([t.id, String(r.id)]);
          await q.run("UPDATE tasks SET target_id = ? WHERE tenant_id = ? AND target_id = ? AND status = 'open'", keepTarget.id, tenantId, r.id);
        }
      }
      for (const r of clash) await q.run(`DELETE FROM ${u.table} WHERE tenant_id = ? AND customer_id = ? AND ${u.scope} = ?`, tenantId, dropId, r[u.scope]);
    }

    // ย้ายแถวที่ผูกกับคน และจดกุญแจไว้
    const moved: Moved = {};
    for (const m of PERSON_MOVES) {
      const label = `${m.table}.${m.column}`;
      const rows = await q.all<Record<string, string | number>>(
        `SELECT ${m.key.join(", ")} FROM ${m.table} WHERE tenant_id = ? AND ${m.column} = ?${m.where ? ` AND ${m.where}` : ""}`,
        tenantId, dropId,
      );
      if (!rows.length) continue;
      moved[label] = rows.map((r) => m.key.map((k) => r[k]));
      await q.run(
        `UPDATE ${m.table} SET ${m.column} = ? WHERE tenant_id = ? AND ${m.column} = ?${m.where ? ` AND ${m.where}` : ""}`,
        keepId, tenantId, dropId,
      );
    }

    // ช่องทาง: ย้ายเป็นสำเนาของคนที่คงอยู่ (id ของช่องทางผูกกับรหัสคน)
    const createdPointIds: string[] = [];
    for (const p of dropPoints) {
      if (keepHmacs.has(`${p.kind}|${p.value_hmac}`)) continue;
      const newId = `${keepId}:${p.kind}:${String(p.value_hmac).slice(0, 16)}`;
      await insertRow(q, "contact_points", { ...p, id: newId, customer_id: keepId, is_primary: 0 });
      createdPointIds.push(newId);
    }
    await q.run("DELETE FROM contact_points WHERE tenant_id = ? AND customer_id = ?", tenantId, dropId);

    // โปรไฟล์: เติมช่องว่างของคนที่คงอยู่จากคนที่ถูกรวม
    if (dropProfile) {
      if (keepProfile) {
        const fill = Object.keys(dropProfile).filter((k) => !["customer_id", "tenant_id", "updated_at"].includes(k) && keepProfile[k] == null && dropProfile[k] != null);
        if (fill.length) {
          await q.run(`UPDATE contact_profiles SET ${fill.map((k) => `${k} = ?`).join(", ")} WHERE customer_id = ?`,
            ...fill.map((k) => dropProfile[k]), keepId);
        }
      } else {
        await insertRow(q, "contact_profiles", { ...dropProfile, customer_id: keepId });
      }
      await q.run("DELETE FROM contact_profiles WHERE customer_id = ?", dropId);
    }

    // ความยินยอมแบบเดิม: รวมต่อวัตถุประสงค์ — ให้ครั้งแรกสุด · ถอนครั้งล่าสุด (เหมือนทางเดิมใน customers.ts)
    const dropConsents = await q.all<Record<string, Param>>("SELECT * FROM consents WHERE tenant_id = ? AND customer_id = ?", tenantId, dropId);
    const keepConsents = await q.all<Record<string, Param>>("SELECT * FROM consents WHERE tenant_id = ? AND customer_id = ?", tenantId, keepId);
    for (const d of dropConsents) {
      const k = keepConsents.find((r) => r.purpose === d.purpose);
      const grants = [k?.granted_at, d.granted_at].filter(Boolean).map(String).sort();
      const revokes = [k?.revoked_at, d.revoked_at].filter(Boolean).map(String).sort();
      await q.run("DELETE FROM consents WHERE tenant_id = ? AND customer_id IN (?, ?) AND purpose = ?", tenantId, keepId, dropId, d.purpose);
      await insertRow(q, "consents", { ...(k ?? d), customer_id: keepId, granted_at: grants[0] ?? null, revoked_at: revokes.pop() ?? null, source: k ? "merge" : d.source });
    }

    // ข้อจำกัดที่เข้มกว่าชนะ · คนที่คนตรวจแล้วเป็น confirmed
    const strict = [String(keep.restriction_status ?? "none"), String(drop.restriction_status ?? "none")]
      .sort((a, b) => (RESTRICTION_RANK[b] ?? 0) - (RESTRICTION_RANK[a] ?? 0))[0];
    await q.run("UPDATE customers SET restriction_status = ?, classification = ? WHERE tenant_id = ? AND id = ?",
      strict, higher(keep.classification, drop.classification), tenantId, keepId);
    await q.run("DELETE FROM customers WHERE tenant_id = ? AND id = ?", tenantId, dropId);

    const impact: PersonImpact = {
      kind: "person", drop, dropProfile, dropPoints, createdPointIds,
      keepBefore: { lifecycle_state: String(keep.lifecycle_state), restriction_status: String(keep.restriction_status ?? "none"), profile: keepProfile },
      moved, parked,
      repointedTasks: repointed.length ? repointed : undefined,
      consents: dropConsents.length ? { drop: dropConsents, keepBefore: keepConsents.filter((k) => dropConsents.some((d) => d.purpose === k.purpose)) } : undefined,
    };
    await q.run(
      `INSERT INTO merge_log (id, tenant_id, survivor_id, merged_id, rule, confidence, decided_by, decided_at, impact)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      mergeId, tenantId, keepId, dropId, rule, confidence, actor, new Date().toISOString(), JSON.stringify(impact),
    );
    await upsertOverride(q, tenantId, "person", "same", keepId, dropId, actor);
    await repointReviews(q, tenantId, "person_pair", dropId, keepId);
    /* คนตรวจแล้ว = confirmed เว้นแต่ยังมีคู่อื่นค้างตรวจอยู่ */
    const still = await q.get<{ x: number }>(
      "SELECT 1 AS x FROM review_items WHERE tenant_id = ? AND kind = 'person_pair' AND status = 'open' AND subject_ids LIKE ? LIMIT 1", tenantId, `%"${keepId}"%`,
    );
    await q.run("UPDATE customers SET lifecycle_state = ? WHERE tenant_id = ? AND id = ?", still ? "pending_review" : "confirmed", tenantId, keepId);
    await logActivity(tenantId, actor, "merge_people", `${mergeId} · ${Object.values(moved).reduce((n, r) => n + r.length, 0)} rows moved`);
    return null;
  });
  if (done) return { ok: false, error: done };
  /* คำคัดค้าน/ข้อจำกัดของฝั่งที่ถูกรวมมีผลกับคนที่คงอยู่ทันที — งานแคมเปญที่ค้างต้องถูกตรวจซ้ำ (plan 6.2)
     import ตอนเรียก: campaigns import ไฟล์นี้อยู่แล้ว */
  const { recheckTargetsFor } = await import("@/lib/engine/campaigns");
  await recheckTargetsFor(tenantId, keepId, actor);
  return { ok: true, mergeId };
}

export async function unmerge(tenantId: string, mergeId: string, actor: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const err = await tx(async (q) => {
    const m = await one<{ survivor_id: string; merged_id: string; impact: string; undone_at: string | null; rule: string | null; decided_at: string }>(
      q, "SELECT survivor_id, merged_id, impact, undone_at, rule, decided_at FROM merge_log WHERE tenant_id = ? AND id = ?", tenantId, mergeId,
    );
    if (!m) return "ไม่พบรายการรวมนี้";
    if (m.undone_at) return "รายการนี้ถูกแยกคืนไปแล้ว";
    const impact = JSON.parse(m.impact) as PersonImpact | OrgImpact;
    if (impact.kind === "org") return unmergeOrg(q, tenantId, mergeId, m.survivor_id, m.merged_id, impact, actor);

    const keepId = m.survivor_id, dropId = m.merged_id;
    if (!(await one(q, "SELECT 1 AS x FROM customers WHERE tenant_id = ? AND id = ?", tenantId, keepId))) {
      return "คนที่คงอยู่ถูกรวมหรือลบไปแล้ว — แยกคืนจากรายการที่ใหม่กว่าก่อน";
    }
    await insertRow(q, "customers", impact.drop);
    if (impact.dropProfile) await insertRow(q, "contact_profiles", impact.dropProfile);
    for (const p of impact.dropPoints) await insertRow(q, "contact_points", p);
    for (const id of impact.createdPointIds) await q.run("DELETE FROM contact_points WHERE tenant_id = ? AND id = ?", tenantId, id);
    for (const mv of PERSON_MOVES) {
      for (const key of impact.moved[`${mv.table}.${mv.column}`] ?? []) {
        await q.run(
          `UPDATE ${mv.table} SET ${mv.column} = ? WHERE tenant_id = ? AND ${mv.key.map((k) => `${k} = ?`).join(" AND ")}${mv.table === "opportunity_people" ? ` AND ${mv.column} = ?` : ""}`,
          dropId, tenantId, ...key, ...(mv.table === "opportunity_people" ? [keepId] : []),
        );
      }
    }
    for (const [table, rows] of Object.entries(impact.parked ?? {})) for (const r of rows) await insertRow(q, table, r);
    if (impact.consents) {
      for (const d of impact.consents.drop) {
        await q.run("DELETE FROM consents WHERE tenant_id = ? AND customer_id = ? AND purpose = ?", tenantId, keepId, d.purpose);
        await insertRow(q, "consents", d);
      }
      for (const k of impact.consents.keepBefore) await insertRow(q, "consents", k);
    }
    if (impact.keepBefore.profile) {
      const p = impact.keepBefore.profile;
      const cols = Object.keys(p).filter((k) => k !== "customer_id");
      await q.run(`UPDATE contact_profiles SET ${cols.map((k) => `${k} = ?`).join(", ")} WHERE customer_id = ?`, ...cols.map((k) => p[k]), keepId);
    } else {
      await q.run("DELETE FROM contact_profiles WHERE customer_id = ?", keepId);
    }
    for (const [taskId, targetId] of impact.repointedTasks ?? []) {
      await q.run("UPDATE tasks SET target_id = ? WHERE tenant_id = ? AND id = ?", targetId, tenantId, taskId);
    }
    /* ── แยกคืนต้องไม่ทำให้ข้อจำกัดอ่อนลง ──
       ระหว่างที่รวมอยู่ ข้อจำกัดหรือคำคัดค้านที่บันทึกเข้ามาอยู่ใต้รหัสของคนที่คงอยู่ — ไม่รู้ว่าเป็นของใครในสองคน
       จึงให้ทั้งสองคนถือไว้ (ข้อจำกัดที่เข้มกว่าชนะจนคนตรวจ) · preferences เพิ่มอย่างเดียว จึงคัดลอกเป็นแถวใหม่ */
    const cur = await one<{ restriction_status: string | null }>(q, "SELECT restriction_status FROM customers WHERE tenant_id = ? AND id = ?", tenantId, keepId);
    const strictest = (...xs: (string | null | undefined)[]) =>
      xs.map((x) => String(x ?? "none")).sort((a, b) => (RESTRICTION_RANK[b] ?? 0) - (RESTRICTION_RANK[a] ?? 0))[0];
    await q.run("UPDATE customers SET lifecycle_state = ?, restriction_status = ? WHERE tenant_id = ? AND id = ?",
      impact.keepBefore.lifecycle_state, strictest(impact.keepBefore.restriction_status, cur?.restriction_status), tenantId, keepId);
    await q.run("UPDATE customers SET restriction_status = ? WHERE tenant_id = ? AND id = ?",
      strictest(String(impact.drop.restriction_status ?? "none"), cur?.restriction_status), tenantId, dropId);
    const during = await q.all<Record<string, Param>>(
      "SELECT * FROM preferences WHERE tenant_id = ? AND customer_id = ? AND recorded_at >= ?", tenantId, keepId, m.decided_at);
    for (const p of during) {
      await insertRow(q, "preferences", { ...p, id: `${p.id}:split:${dropId}`.slice(0, 120), customer_id: dropId, recorded_by: `unmerge:${actor}`, recorded_at: new Date().toISOString() });
    }
    await q.run("UPDATE merge_log SET undone_at = ?, undone_by = ? WHERE tenant_id = ? AND id = ?", new Date().toISOString(), actor, tenantId, mergeId);
    await upsertOverride(q, tenantId, "person", "different", keepId, dropId, actor);
    /* แยกคืน = คนตัดสินแล้วว่าต่างคน — ไม่ค้างในสถานะรอตรวจ เว้นแต่ยังมีคู่อื่นค้างอยู่ */
    for (const id of [keepId, dropId]) {
      const still = await q.get<{ x: number }>(
        "SELECT 1 AS x FROM review_items WHERE tenant_id = ? AND kind = 'person_pair' AND status = 'open' AND subject_ids LIKE ? LIMIT 1", tenantId, `%"${id}"%`,
      );
      if (!still) await q.run("UPDATE customers SET lifecycle_state = 'confirmed' WHERE tenant_id = ? AND id = ? AND lifecycle_state = 'pending_review'", tenantId, id);
    }
    await logActivity(tenantId, actor, "unmerge_people", mergeId);
    return null;
  });
  return err ? { ok: false, error: err } : { ok: true };
}

/* ── องค์กร ── */

type OrgImpact = { kind: "org"; drop: Record<string, Param>; aliasKey: string; keepLifecycle: string; repointedAliases: string[]; moved: Moved };
const ORG_MOVES: { table: string; key: string[]; column: string; where?: string }[] = [
  { table: "affiliations", key: ["id"], column: "org_id" },
  { table: "org_domains", key: ["domain"], column: "org_id" },
  { table: "opportunities", key: ["id"], column: "org_id" },
  { table: "interactions", key: ["id"], column: "org_id" },
  { table: "tasks", key: ["id"], column: "org_id" },
  { table: "participations", key: ["id"], column: "org_id" },
  { table: "campaign_targets", key: ["id"], column: "org_id" },
  { table: "orgs", key: ["id"], column: "parent_id" },
  { table: "relationship_assertions", key: ["id"], column: "from_id", where: "from_kind = 'org'" },
  { table: "relationship_assertions", key: ["id"], column: "to_id", where: "to_kind = 'org'" },
  /* ฟิลด์กำหนดเอง (C4) — ค่าเพิ่มอย่างเดียว ย้ายตามได้ไม่ชน · ค่าปัจจุบัน = แถวล่าสุดของทั้งสองฝั่ง */
  { table: "custom_values", key: ["id"], column: "record_id", where: "entity = 'org'" },
];

export async function mergeOrgs(tenantId: string, keepId: string, dropId: string, actor: string): Promise<MergeResult> {
  if (keepId === dropId) return { ok: false, error: "เป็นองค์กรเดียวกันอยู่แล้ว" };
  const mergeId = `m-${id24(`${tenantId}|${keepId}|${dropId}|${Date.now()}`)}`;
  const err = await tx(async (q) => {
    const keep = await one<Record<string, Param>>(q, "SELECT * FROM orgs WHERE tenant_id = ? AND id = ?", tenantId, keepId);
    const drop = await one<Record<string, Param>>(q, "SELECT * FROM orgs WHERE tenant_id = ? AND id = ?", tenantId, dropId);
    if (!keep || !drop) return "ไม่พบองค์กรใดองค์กรหนึ่ง — อาจถูกรวมไปแล้ว";
    /* เลขผู้เสียภาษีต่างกัน = คนละนิติบุคคล (บริษัทในเครือ) — เชื่อมด้วยบริษัทแม่ ไม่รวม (plan 4.4) */
    if (keep.tax_id && drop.tax_id && keep.tax_id !== drop.tax_id) {
      return "สององค์กรนี้มีเลขประจำตัวผู้เสียภาษีต่างกัน — เป็นคนละนิติบุคคล ให้เชื่อมเป็นบริษัทในเครือแทนการรวม";
    }
    const moved: Moved = {};
    for (const m of ORG_MOVES) {
      const rows = await q.all<Record<string, string | number>>(
        `SELECT ${m.key.join(", ")} FROM ${m.table} WHERE tenant_id = ? AND ${m.column} = ?${m.where ? ` AND ${m.where}` : ""}`, tenantId, dropId,
      );
      if (!rows.length) continue;
      moved[`${m.table}.${m.column}`] = rows.map((r) => m.key.map((k) => r[k]));
      await q.run(`UPDATE ${m.table} SET ${m.column} = ? WHERE tenant_id = ? AND ${m.column} = ?${m.where ? ` AND ${m.where}` : ""}`, keepId, tenantId, dropId);
    }
    /* ที่คงอยู่เคยเป็นบริษัทลูกของที่ถูกรวม → การย้าย parent_id ด้านบนทำให้เป็นแม่ของตัวเอง (แยกคืนแล้วได้ค่าเดิมกลับจาก moved) */
    await q.run("UPDATE orgs SET parent_id = NULL WHERE tenant_id = ? AND id = ? AND parent_id = ?", tenantId, keepId, keepId);
    /* สรุปแฟ้มของทั้งสองฝั่งสร้างจากหลักฐานชุดเดิม — ทิ้งให้สร้างใหม่ ไม่ย้าย */
    await q.run("DELETE FROM account_briefs WHERE tenant_id = ? AND org_id IN (?, ?)", tenantId, keepId, dropId);
    await q.run("DELETE FROM orgs WHERE tenant_id = ? AND id = ?", tenantId, dropId);
    const strictOrg = [String(keep.restriction_status ?? "none"), String(drop.restriction_status ?? "none")]
      .sort((a, b) => (RESTRICTION_RANK[b] ?? 0) - (RESTRICTION_RANK[a] ?? 0))[0];
    await q.run("UPDATE orgs SET lifecycle_state = 'confirmed', classification = ?, restriction_status = ? WHERE tenant_id = ? AND id = ?",
      higher(keep.classification, drop.classification), strictOrg, tenantId, keepId);
    /* ชื่อของที่ถูกรวม → ชี้ไปที่ที่คงอยู่ ไฟล์ที่นำเข้าทีหลังจะไม่สร้างองค์กรนี้ขึ้นมาใหม่ · alias เดิมที่ชี้ที่ถูกรวมย้ายตาม */
    const repointedAliases = (await q.all<{ id: string }>(
      "SELECT id FROM resolution_overrides WHERE tenant_id = ? AND kind = 'org_alias' AND b_id = ?", tenantId, dropId,
    )).map((r) => r.id);
    await q.run("UPDATE resolution_overrides SET b_id = ? WHERE tenant_id = ? AND kind = 'org_alias' AND b_id = ?", keepId, tenantId, dropId);
    await upsertOverride(q, tenantId, "org_alias", "alias", String(drop.name_norm), keepId, actor);
    const impact: OrgImpact = { kind: "org", drop, aliasKey: String(drop.name_norm), keepLifecycle: String(keep.lifecycle_state), repointedAliases, moved };
    await q.run(
      `INSERT INTO merge_log (id, tenant_id, survivor_id, merged_id, rule, confidence, decided_by, decided_at, impact)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      mergeId, tenantId, keepId, dropId, "org_group", null, actor, new Date().toISOString(), JSON.stringify(impact),
    );
    await repointReviews(q, tenantId, "org_group", dropId, keepId);
    await logActivity(tenantId, actor, "merge_orgs", mergeId);
    return null;
  });
  return err ? { ok: false, error: err } : { ok: true, mergeId };
}

async function unmergeOrg(q: Sql, tenantId: string, mergeId: string, keepId: string, dropId: string, impact: OrgImpact, actor: string) {
  await insertRow(q, "orgs", impact.drop);
  for (const mv of ORG_MOVES) {
    for (const key of impact.moved[`${mv.table}.${mv.column}`] ?? []) {
      await q.run(`UPDATE ${mv.table} SET ${mv.column} = ? WHERE tenant_id = ? AND ${mv.key.map((k) => `${k} = ?`).join(" AND ")}`, dropId, tenantId, ...key);
    }
  }
  await q.run("DELETE FROM resolution_overrides WHERE tenant_id = ? AND kind = 'org_alias' AND a_id = ? AND b_id = ?", tenantId, impact.aliasKey, keepId);
  await q.run("UPDATE orgs SET lifecycle_state = ? WHERE tenant_id = ? AND id = ?", impact.keepLifecycle, tenantId, keepId);
  for (const id of impact.repointedAliases ?? []) await q.run("UPDATE resolution_overrides SET b_id = ? WHERE tenant_id = ? AND id = ?", dropId, tenantId, id);
  await q.run("UPDATE merge_log SET undone_at = ?, undone_by = ? WHERE tenant_id = ? AND id = ?", new Date().toISOString(), actor, tenantId, mergeId);
  await upsertOverride(q, tenantId, "org", "different", keepId, dropId, actor);
  await logActivity(tenantId, actor, "unmerge_orgs", mergeId);
  return null;
}

/* ── สิ่งที่คนตัดสิน ── */

async function upsertOverride(q: Sql, tenantId: string, kind: string, verdict: string, a: string, b: string, actor: string) {
  const [x, y] = kind === "org_alias" ? [a, b] : [a, b].sort();
  await q.run("DELETE FROM resolution_overrides WHERE tenant_id = ? AND kind = ? AND a_id = ? AND b_id = ?", tenantId, kind, x, y);
  await q.run(
    "INSERT INTO resolution_overrides (id, tenant_id, kind, verdict, a_id, b_id, decided_by, decided_at) VALUES (?,?,?,?,?,?,?,?)",
    `ov-${id24(`${tenantId}|${kind}|${x}|${y}`)}`, tenantId, kind, verdict, x, y, actor, new Date().toISOString(),
  );
}

/* รายการอื่นในคิวที่อ้างถึงสิ่งที่ถูกรวม → ชี้ไปที่สิ่งที่คงอยู่ (รายการที่เหลือหนึ่งเดียวปิดไป) */
async function repointReviews(q: Sql, tenantId: string, kind: "person_pair" | "org_group", dropId: string, keepId: string) {
  const items = await q.all<{ id: string; subject_ids: string }>(
    "SELECT id, subject_ids FROM review_items WHERE tenant_id = ? AND kind = ? AND status = 'open' AND subject_ids LIKE ?",
    tenantId, kind, `%"${dropId}"%`,
  );
  for (const it of items) {
    const ids = [...new Set((JSON.parse(it.subject_ids) as string[]).map((x) => (x === dropId ? keepId : x)))].sort();
    if (ids.length < 2) {
      await q.run("UPDATE review_items SET status = 'merged', decided_at = ? WHERE id = ?", new Date().toISOString(), it.id);
      continue;
    }
    const clash = await q.get<{ id: string }>(
      "SELECT id FROM review_items WHERE tenant_id = ? AND kind = ? AND subject_ids = ? AND id <> ?", tenantId, kind, JSON.stringify(ids), it.id,
    );
    if (clash) await q.run("UPDATE review_items SET status = 'merged', decided_at = ? WHERE id = ?", new Date().toISOString(), it.id);
    else await q.run("UPDATE review_items SET subject_ids = ? WHERE id = ?", JSON.stringify(ids), it.id);
  }
}

export type Verdict = "same" | "different";

/* rule = ค่าที่บันทึกใน merge_log.rule — การรวมเป็นชุด (S5) ใส่รหัสกลุ่มของชุด เพื่อย้อนทั้งชุดได้ทีเดียว */
export async function decideReview(
  tenantId: string, reviewId: string, verdict: Verdict, actor: string, note?: string, rule = "review",
): Promise<{ ok: true; mergeIds: string[] } | { ok: false; error: string }> {
  const item = await get<{ kind: string; subject_ids: string; status: string; confidence: number }>(
    "SELECT kind, subject_ids, status, confidence FROM review_items WHERE tenant_id = ? AND id = ?", tenantId, reviewId,
  );
  if (!item) return { ok: false, error: "ไม่พบรายการนี้ในคิว" };
  if (item.status !== "open") return { ok: false, error: "รายการนี้ถูกตัดสินไปแล้ว" };
  const ids = JSON.parse(item.subject_ids) as string[];
  const now = new Date().toISOString();
  const mergeIds: string[] = [];

  if (verdict === "same") {
    // คนที่คงอยู่ = คนที่มีแถวต้นทางมากที่สุด (เท่ากันใช้ที่สร้างก่อน) — เก็บประวัติส่วนใหญ่ไว้ที่เดิม
    const table = item.kind === "person_pair" ? "import_rows" : "affiliations";
    const col = item.kind === "person_pair" ? "customer_id" : "org_id";
    const weights = await Promise.all(ids.map(async (id) => ({
      id, n: Number((await get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} WHERE tenant_id = ? AND ${col} = ?`, tenantId, id))?.n ?? 0),
    })));
    weights.sort((a, b) => b.n - a.n || (a.id < b.id ? -1 : 1));
    const keep = weights[0].id;
    /* ── กลุ่มสามรายการขึ้นไปต้องรวมครบหรือไม่รวมเลย ──
       ทุกการรวมอยู่ในธุรกรรมเดียว (tx ซ้อนใช้ธุรกรรมเดิม) · จองรายการก่อน — สองคนกดพร้อมกัน คนที่สองได้ "ตัดสินไปแล้ว"
       รวมไม่สำเร็จกลางทาง = โยนเพื่อย้อนทั้งหมด ไม่ค้างครึ่งกลุ่ม */
    class Abort extends Error {}
    try {
      await tx(async (q) => {
        const claimed = await q.run("UPDATE review_items SET status = 'merging' WHERE tenant_id = ? AND id = ? AND status = 'open'", tenantId, reviewId);
        if (!claimed.changes) throw new Abort("รายการนี้ถูกตัดสินไปแล้ว");
        for (const w of weights.slice(1)) {
          const r = item.kind === "person_pair"
            ? await mergePersons(tenantId, keep, w.id, actor, rule, Number(item.confidence))
            : await mergeOrgs(tenantId, keep, w.id, actor);
          if (!r.ok) throw new Abort(r.error);
          mergeIds.push(r.mergeId);
        }
        await q.run(
          "UPDATE review_items SET status = 'merged', decided_by = ?, decided_at = ?, decision_note = ? WHERE tenant_id = ? AND id = ?",
          actor, now, note ?? null, tenantId, reviewId,
        );
      });
    } catch (e) {
      if (e instanceof Abort) return { ok: false, error: e.message };
      throw e;
    }
  } else {
    await tx(async (q) => {
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
        await upsertOverride(q, tenantId, item.kind === "person_pair" ? "person" : "org", "different", ids[i], ids[j], actor);
      }
      await q.run(
        "UPDATE review_items SET status = 'kept_apart', decided_by = ?, decided_at = ?, decision_note = ? WHERE tenant_id = ? AND id = ? AND status = 'open'",
        actor, now, note ?? null, tenantId, reviewId,
      );
      /* คนที่ไม่มีคู่ค้างตรวจแล้ว = คนตรวจยืนยันแล้ว */
      if (item.kind === "person_pair") for (const id of ids) {
        const still = await q.get<{ x: number }>(
          "SELECT 1 AS x FROM review_items WHERE tenant_id = ? AND kind = 'person_pair' AND status = 'open' AND subject_ids LIKE ? LIMIT 1", tenantId, `%"${id}"%`,
        );
        if (!still) await q.run("UPDATE customers SET lifecycle_state = 'confirmed' WHERE tenant_id = ? AND id = ? AND lifecycle_state = 'pending_review'", tenantId, id);
      }
    });
  }
  await logActivity(tenantId, actor, verdict === "same" ? "review_same" : "review_different", reviewId);
  return { ok: true, mergeIds };
}

/** รหัสทั้งหมดที่เป็นคนนี้ — ใช้อ่านตารางเพิ่มอย่างเดียว (preferences) ที่ไม่ถูกย้ายตอนรวม */
export async function personIdsOf(tenantId: string, id: string): Promise<string[]> {
  const ids = [id];
  for (let i = 0; i < ids.length; i++) {
    const rows = await all<{ merged_id: string }>(
      "SELECT merged_id FROM merge_log WHERE tenant_id = ? AND survivor_id = ? AND undone_at IS NULL", tenantId, ids[i],
    );
    for (const r of rows) if (!ids.includes(r.merged_id)) ids.push(r.merged_id);
  }
  return ids;
}
