import { all, get, run } from "@/lib/engine/sql";

/* ── ความยินยอมรับข่าวสาร แหล่งเดียว (docs/crm-plan.md G2) ───────────────────

   ที่จริง = preferences (บริการนโยบาย) ของวัตถุประสงค์ "ส่งข่าวสารและข้อเสนอ" (แม่แบบ b2b_marketing_consented)
   consents ('marketing') ของระบบค้าปลีกเดิม = สำเนาที่ตามที่จริงเสมอ — ผู้อ่านเดิม (คัดกลุ่ม play · ส่งแบบเดิม · ป้ายในรายชื่อ)
   จึงเห็นการถอน/คัดค้านทันที ไม่ว่าบันทึกจากทางไหน
   ทางเขียนเดิม (ช่องติ๊ก · เพิ่มคน · นำเข้า CSV) ส่งต่อเข้าที่จริงด้วย syncLegacyConsents
   ยังไม่มีวัตถุประสงค์นี้ = ยังไม่ย้าย: ทั้งสองระบบทำงานแยกแบบเดิม จนเจ้าของกดย้าย (ต้องยืนยันข้อเท็จจริงของแม่แบบเอง) */

export const MARKETING_TEMPLATE = "b2b_marketing_consented";
const LEGACY_EVIDENCE = "ย้ายจากระบบรับข่าวสารเดิม";

export async function marketingPurposeId(tenantId: string): Promise<string | null> {
  return (await get<{ id: string }>(
    "SELECT id FROM purposes WHERE tenant_id = ? AND template_code = ? ORDER BY created_at, id LIMIT 1", tenantId, MARKETING_TEMPLATE))?.id ?? null;
}

/** preferences → consents: เรียกหลังบันทึกความต้องการทุกครั้ง (recordPreference) */
export async function mirrorToLegacy(tenantId: string, customerId: string, kind: string, purposeId: string | null, effective: string): Promise<void> {
  const mp = await marketingPurposeId(tenantId);
  if (!mp) return;
  const stop = (kind === "withdrawal" && purposeId === mp) || kind === "objection" || (kind === "restriction" && (!purposeId || purposeId === mp));
  if (kind === "consent" && purposeId === mp) {
    await run(
      `INSERT INTO consents (tenant_id, customer_id, purpose, granted_at, revoked_at, source) VALUES (?, ?, 'marketing', ?, NULL, 'policy')
       ON CONFLICT (customer_id, purpose) DO UPDATE SET granted_at = excluded.granted_at, revoked_at = NULL, source = 'policy'`,
      tenantId, customerId, effective);
  } else if (stop) {
    await run(
      `INSERT INTO consents (tenant_id, customer_id, purpose, granted_at, revoked_at, source) VALUES (?, ?, 'marketing', NULL, ?, 'policy')
       ON CONFLICT (customer_id, purpose) DO UPDATE SET revoked_at = excluded.revoked_at, source = 'policy'`,
      tenantId, customerId, effective);
  }
}

type LegacyState = "granted" | "withdrawn" | "none";
const legacyState = (r: { granted_at: string | null; revoked_at: string | null }): LegacyState =>
  r.revoked_at ? "withdrawn" : r.granted_at ? "granted" : "none";

/** consents → preferences: ย้ายครั้งแรก (ไม่ส่ง customerIds) และหลังทางเขียนเดิม (ส่งคนที่เพิ่งเปลี่ยน) · ซ้ำได้ ไม่บันทึกซ้ำ */
export async function syncLegacyConsents(
  tenantId: string, actor: string, customerIds?: string[], limit = Infinity,
): Promise<{ consents: number; withdrawals: number; remaining: number }> {
  /* limit: ย้ายจากหน้าจอทีละชุด — บันทึกหนึ่งคนมีหลายคำสั่ง ย้ายทีเดียวหลายพันคนเกินเวลาของคำขอบนเซิร์ฟเวอร์ */
  const out = { consents: 0, withdrawals: 0, remaining: 0 };
  const mp = await marketingPurposeId(tenantId);
  if (!mp || (customerIds && !customerIds.length)) return out;
  const { recordPreference } = await import("@/lib/engine/policy/preferences");
  const rows: { customer_id: string; granted_at: string | null; revoked_at: string | null; source: string | null }[] = [];
  const base = "SELECT customer_id, granted_at, revoked_at, source FROM consents WHERE tenant_id = ? AND purpose = 'marketing'";
  if (customerIds) {
    for (let i = 0; i < customerIds.length; i += 500) {
      const c = customerIds.slice(i, i + 500);
      rows.push(...await all<(typeof rows)[number]>(`${base} AND customer_id IN (${c.map(() => "?").join(",")})`, tenantId, ...c));
    }
  } else rows.push(...await all<(typeof rows)[number]>(base, tenantId));
  for (const r of rows) {
    const state = legacyState(r);
    if (state === "none") continue;
    const latest = await get<{ kind: string }>(
      `SELECT kind FROM preferences WHERE tenant_id = ? AND customer_id = ? AND purpose_id = ? AND kind IN ('consent', 'withdrawal')
       ORDER BY effective_at DESC, recorded_at DESC LIMIT 1`, tenantId, r.customer_id, mp);
    const evidence = (at: string) => `${LEGACY_EVIDENCE} · ที่มา ${r.source ?? "ไม่ทราบ"} · ${at.slice(0, 10)}`;
    if (state === "granted" && latest?.kind !== "consent") {
      /* ยินยอมในระบบเดิม แต่ที่จริงมีถอนล่าสุดอยู่แล้ว = ที่จริงชนะ (ไม่ปลุกความยินยอมที่ถูกถอนกลับมา) */
      if (latest?.kind === "withdrawal") continue;
      if (out.consents + out.withdrawals >= limit) { out.remaining++; continue; }
      const res = await recordPreference(tenantId, r.customer_id, { kind: "consent", purposeId: mp, evidence: evidence(r.granted_at!), effectiveAt: r.granted_at! }, actor);
      if (res.ok) out.consents++;
    } else if (state === "withdrawn" && latest?.kind !== "withdrawal") {
      if (out.consents + out.withdrawals >= limit) { out.remaining++; continue; }
      const res = await recordPreference(tenantId, r.customer_id, { kind: "withdrawal", purposeId: mp, evidence: evidence(r.revoked_at!), effectiveAt: r.revoked_at! }, actor);
      if (res.ok) out.withdrawals++;
    }
  }
  /* ถอน/คัดค้านที่บันทึกไว้ก่อนมีสำเนา — ส่งต่อเข้า consents ด้วย (ไม่งั้นการส่งแบบเดิมยังเห็นว่ายินยอม) */
  const stops = await all<{ customer_id: string; kind: string; purpose_id: string | null; effective_at: string }>(
    `SELECT f.customer_id, f.kind, f.purpose_id, f.effective_at FROM preferences f
     WHERE f.tenant_id = ? AND f.kind IN ('objection', 'withdrawal', 'restriction')
       AND f.effective_at = (SELECT MAX(g.effective_at) FROM preferences g WHERE g.tenant_id = f.tenant_id AND g.customer_id = f.customer_id)`, tenantId);
  for (const s of stops) {
    if (customerIds && !customerIds.includes(s.customer_id)) continue;
    await mirrorToLegacy(tenantId, s.customer_id, s.kind, s.purpose_id, s.effective_at);
  }
  return out;
}

/** สถานะสำหรับหน้าวัตถุประสงค์ */
export async function legacyConsentStatus(tenantId: string): Promise<{ purposeId: string | null; granted: number; withdrawn: number; pending: number }> {
  const r = await get<{ g: number | string; w: number | string }>(
    `SELECT SUM(CASE WHEN revoked_at IS NULL AND granted_at IS NOT NULL THEN 1 ELSE 0 END) AS g,
            SUM(CASE WHEN revoked_at IS NOT NULL THEN 1 ELSE 0 END) AS w
     FROM consents WHERE tenant_id = ? AND purpose = 'marketing'`, tenantId);
  const purposeId = await marketingPurposeId(tenantId);
  /* ยังไม่ได้ย้าย = มีสถานะในระบบเดิม แต่ยังไม่มีบันทึกยินยอม/ถอนของวัตถุประสงค์นี้เลย (หน้าจอต้องไม่บอกว่าย้ายครบทั้งที่เพิ่งย้ายชุดแรก) */
  const pending = purposeId ? Number((await get<{ n: number | string }>(
    `SELECT COUNT(*) AS n FROM consents s WHERE s.tenant_id = ? AND s.purpose = 'marketing' AND (s.granted_at IS NOT NULL OR s.revoked_at IS NOT NULL)
       AND NOT EXISTS (SELECT 1 FROM preferences f WHERE f.tenant_id = s.tenant_id AND f.customer_id = s.customer_id AND f.purpose_id = ? AND f.kind IN ('consent', 'withdrawal'))`,
    tenantId, purposeId))?.n ?? 0) : Number(r?.g ?? 0) + Number(r?.w ?? 0);
  return { purposeId, granted: Number(r?.g ?? 0), withdrawn: Number(r?.w ?? 0), pending };
}
