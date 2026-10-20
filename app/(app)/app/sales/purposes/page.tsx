import Link from "next/link";
import { viewer } from "@/app/(app)/viewer";
import { adoptTemplateAction, migrateLegacyConsentsAction, setBasisAction, setRetentionRuleAction } from "@/app/(app)/sales-actions";
import { legacyConsentStatus } from "@/lib/engine/policy/marketing";
import { num } from "@/lib/shared/format";
import { RETENTION_TRIGGERS, retentionRules, retentionSummary } from "@/lib/engine/retention";
import { listBases, RULES_VERSION } from "@/lib/engine/policy";
import { listTemplates } from "@/lib/engine/policy/templates";
import { CHANNEL_TH, LAWFUL_BASES, LAWFUL_BASIS_TH, type LawfulBasis } from "@/lib/shared/policy";
import { thaiDateTime } from "@/lib/shared/format";
import { can, deniedTh } from "@/lib/shared/roles";
import { ActionForm } from "@/components/console/action-form";
import { PageHead, Panel } from "@/components/console/ui";

export const metadata = { title: "วัตถุประสงค์และอายุข้อมูล" };
export const dynamic = "force-dynamic";

/* ── วัตถุประสงค์และฐานการประมวลผล (docs/plan.md หัวข้อ 6 · ROPA เต็มใน B6) ─────
   ฐานเก็บเป็นรุ่น ไม่เขียนทับ — ผลตัดสินนโยบายทุกครั้งอ้างรุ่นที่ใช้ · เปลี่ยนฐานไม่ล้างการถอนหรือคัดค้านที่มีอยู่
   การเลือกฐานเป็นการตัดสินทางกฎหมายของผู้ควบคุมข้อมูล (DPO/นักกฎหมาย — plan O3) ระบบไม่เดาให้ */

const LABEL = "c-thai flex min-w-0 flex-col gap-1 text-[0.8rem] text-[var(--c-text-3)]";

export default async function PurposesPage() {
  const v = await viewer();
  const [bases, templates, rules, ret, legacy] = await Promise.all([listBases(v.tenantId), listTemplates(v.tenantId), retentionRules(v.tenantId), retentionSummary(v.tenantId), legacyConsentStatus(v.tenantId)]);
  const TRIGGER_TH: Record<string, string> = {
    last_interaction: "ติดต่อล่าสุด", received: "วันที่ได้รับข้อมูล", last_participation: "ร่วมงานล่าสุด", withdrawal: "วันที่ถอนความยินยอม", referred: "ได้รับการแนะนำหรือคุยล่าสุด",
  };
  const KIND_TH: Record<string, string> = { service: "ข้อความบริการ", marketing: "ข้อเสนอ/การตลาด", consent_request: "ขอความยินยอม" };
  return (
    <>
      <Link href="/app/sales" className="c-thai inline-block py-2 text-[0.85rem] text-[var(--c-text-3)] hover:text-[var(--c-text)]">← แคมเปญขาย</Link>
      <PageHead
        label="แคมเปญ"
        title="วัตถุประสงค์และอายุข้อมูล"
        lead="แต่ละวัตถุประสงค์ต้องมีฐานการประมวลผลที่ผู้ควบคุมข้อมูลอนุมัติ ก่อนใครในรายชื่อจะ “ใช้ได้ตามนโยบาย” · ฐานเก็บเป็นรุ่น และการเปลี่ยนฐานไม่ล้างการถอนหรือคัดค้านที่มีอยู่"
      />
      {/* ── อายุข้อมูล (B6) ── */}
      <Panel flat className="mb-6 p-5">
        <p className="c-thai text-[0.86rem] text-[var(--c-text-2)]">
          อายุข้อมูล: ครบอายุแล้ว <b>{ret.due}</b> คน · จะครบใน 14 วัน <b>{ret.dueSoon}</b> คน · ยังไม่มีกฎอายุ <b className={ret.noRule ? "text-[var(--c-warn)]" : ""}>{ret.noRule}</b> คน · legal hold {ret.held} คน
          <span className="text-[var(--c-text-4)]"> — ระบบไม่ลบเอง รายการที่ครบอายุขึ้นในหน้า <Link href="/app/today" className="underline">วันนี้</Link></span>
        </p>
      </Panel>

      {/* ── ความยินยอมรับข่าวสารเดิม (docs/crm-plan.md G2) ── มีเฉพาะบัญชีที่มีข้อมูลระบบเดิม */}
      {(legacy.granted > 0 || legacy.withdrawn > 0) && (
        <Panel className="mb-6 p-5 md:p-6">
          <h2 className="c-h2 text-[var(--c-text)]">ความยินยอมรับข่าวสารจากระบบเดิม</h2>
          <p className="c-thai mt-1 text-[0.84rem] text-[var(--c-text-3)]">
            ระบบเดิม: ยินยอม {num(legacy.granted)} คน · ถอนแล้ว {num(legacy.withdrawn)} คน —{" "}
            {!legacy.purposeId
              ? "ยังแยกจากบริการนโยบาย: ถอนในหน้าความยินยอมใหม่ ระบบเดิมยังไม่รู้ และกลับกัน"
              : legacy.pending
                ? <span className="text-[var(--c-warn)]">ย้ายไปบางส่วนแล้ว — เหลืออีก {num(legacy.pending)} คน กดย้ายต่อ (ทีละ 300 คน)</span>
                : "ย้ายครบแล้ว · บันทึกที่ไหนก็ตรงกันทั้งสองระบบ"}
          </p>
          {can(v.role, "policy") ? (
            <ActionForm action={migrateLegacyConsentsAction} label={!legacy.purposeId ? "ย้ายเข้าบริการนโยบาย" : legacy.pending ? "ย้ายต่อ" : "ตรวจและย้ายส่วนที่ยังไม่ตรงอีกครั้ง"} pendingLabel="กำลังย้าย…" size="sm" className="mt-3 grid max-w-2xl gap-2">
              {!legacy.purposeId && (
                <label className={LABEL}>ยืนยันข้อเท็จจริง: มีหลักฐานความยินยอมรายคนจริง (เช่น ช่องติ๊กในแบบฟอร์มสมาชิก · ข้อความตอบรับ) — พิมพ์ว่าได้มาอย่างไร
                  <input name="confirmation" className="c-input" minLength={10} required placeholder="เช่น ลูกค้าติ๊กรับข่าวสารในใบสมัครสมาชิกหน้าร้าน" />
                </label>
              )}
            </ActionForm>
          ) : <p className="c-thai mt-3 text-[0.8rem] text-[var(--c-text-4)]">{deniedTh("policy")}</p>}
        </Panel>
      )}

      {/* ── เริ่มจากแม่แบบ (docs/solo-plan.md S4) ── */}
      <Panel className="mb-6 p-5 md:p-6">
        <h2 className="c-h2 text-[var(--c-text)]">เริ่มจากแม่แบบ</h2>
        <p className="c-thai mt-1 text-[0.82rem] text-[var(--c-text-3)]">
          แม่แบบตั้งฐาน ช่องทาง ชนิดข้อความ และอายุข้อมูลให้ — แก้เป็นรุ่นใหม่ได้ภายหลัง · แม่แบบเป็นจุดเริ่มต้น ไม่ใช่คำแนะนำทางกฎหมายสำหรับกรณีของคุณ
        </p>
        <ul className="mt-4 grid gap-0">
          {templates.map((t) => (
            <li key={t.code} className="border-t border-[var(--c-line)] py-4 first:border-t-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="c-thai text-[0.94rem] text-[var(--c-text)]">
                  {t.name}
                  {t.draft && <span className="c-pill c-pill-warn ml-2">ร่าง — รอนักกฎหมายตรวจ</span>}
                  {t.adopted && <span className="c-pill c-pill-good ml-2">ใช้อยู่ (รุ่น {t.adopted.version})</span>}
                  {t.newer && <span className="c-pill ml-2">มีรุ่นใหม่ {t.version}</span>}
                </p>
                <p className="c-thai text-[0.78rem] text-[var(--c-text-3)]">{LAWFUL_BASIS_TH[t.lawfulBasis].split(" (")[0]}</p>
              </div>
              <p className="c-thai mt-1 text-[0.82rem] text-[var(--c-text-3)]">{t.description}</p>
              <p className="c-thai mt-1 text-[0.78rem] text-[var(--c-text-4)]">
                ช่องทาง {t.channels.map((c) => CHANNEL_TH[c]).join(" · ")} · {t.messageKinds.map((k) => KIND_TH[k] ?? k).join(" · ")} · เก็บ {t.retention.note}
                {t.employerScoped ? " · ผูกกับบริษัท: ย้ายบริษัทแล้วต้องมีหลักฐานใหม่" : ""}
              </p>
              {!t.adopted && can(v.role, "policy") && (
                <details className="mt-2">
                  <summary className="c-btn c-btn-ghost c-btn-sm inline-flex cursor-pointer">ใช้แม่แบบนี้</summary>
                  <ActionForm action={adoptTemplateAction} fields={{ code: t.code }} label="สร้างวัตถุประสงค์" pendingLabel="กำลังสร้าง…" size="sm" className="mt-3 grid gap-3">
                    {t.lia && <p className="c-thai text-[0.78rem] text-[var(--c-text-3)]">{t.lia}</p>}
                    <label className={LABEL}>ยืนยันข้อเท็จจริง: {t.mustConfirm}
                      <input name="confirmation" className="c-input" placeholder="เขียนสั้น ๆ ว่าจริงอย่างไร เช่น ลูกค้าในไฟล์ซื้อบริการปี 2567–2568" required />
                    </label>
                  </ActionForm>
                </details>
              )}
            </li>
          ))}
        </ul>
        {!can(v.role, "policy") && <p className="c-thai mt-3 text-[0.78rem] text-[var(--c-text-4)]">{deniedTh("policy")}</p>}
      </Panel>

      <p className="c-thai mb-4 text-[0.78rem] text-[var(--c-text-4)]">กติกานโยบายรุ่น <span className="c-mono">{RULES_VERSION}</span> · วัตถุประสงค์ใหม่สร้างได้ตอนลงทะเบียนแหล่งข้อมูล</p>
      {bases.length ? (
        <div className="grid gap-4">
          {bases.map((b) => (
            <Panel key={b.purpose_id} className="p-5 md:p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="c-h2 text-[var(--c-text)]">{b.name}</h2>
                <p className="c-thai text-[0.82rem] text-[var(--c-text-3)]">
                  {b.lawful_basis
                    ? <>ฐาน: {LAWFUL_BASIS_TH[b.lawful_basis as LawfulBasis].split(" (")[0]} · รุ่น {b.version}{b.lia_ref ? ` · LIA ${b.lia_ref}` : ""} · อนุมัติโดย {b.approved_by} {thaiDateTime(b.effective_from)}</>
                    : <span className="text-[var(--c-warn)]">ยังไม่มีฐาน — ทุกคนในแคมเปญของวัตถุประสงค์นี้เป็น “ต้องตรวจก่อน”</span>}
                </p>
              </div>
              <details className="mt-3">
                <summary className="c-btn c-btn-ghost c-btn-sm inline-flex cursor-pointer">{b.lawful_basis ? "ตั้งฐานรุ่นใหม่" : "ตั้งฐาน"}</summary>
                <ActionForm action={setBasisAction} fields={{ purposeId: b.purpose_id }} label="บันทึกฐาน" pendingLabel="กำลังบันทึก…" size="sm" className="mt-3 grid gap-3 md:grid-cols-3">
                  <label className={LABEL}>ฐานการประมวลผล
                    <select name="lawfulBasis" className="c-select" defaultValue={b.lawful_basis ?? ""} required>
                      <option value="" disabled>เลือก</option>
                      {LAWFUL_BASES.map((x) => <option key={x} value={x}>{LAWFUL_BASIS_TH[x]}</option>)}
                    </select>
                  </label>
                  <label className={LABEL}>อ้างอิงผลประเมิน LIA (ฐานประโยชน์โดยชอบ)<input name="liaRef" defaultValue={b.lia_ref ?? ""} className="c-input" placeholder="เช่น LIA-2026-01" /></label>
                  <label className={LABEL}>ขอบเขตข้อมูล<input name="dataScope" className="c-input" placeholder="เช่น ชื่อ ตำแหน่ง อีเมลบริษัท" /></label>
                </ActionForm>
              </details>
              {(() => {
                const r = rules.get(b.purpose_id);
                return (
                  <div className="mt-3">
                    <p className="c-thai text-[0.82rem] text-[var(--c-text-3)]">
                      {r
                        ? <>อายุข้อมูล: เก็บ {r.days} วัน นับจาก{TRIGGER_TH[r.trigger] ?? r.trigger}{r.legalHold ? <span className="text-[var(--c-warn)]"> · legal hold ({r.note})</span> : ""}</>
                        : <span className="text-[var(--c-warn)]">ยังไม่มีกฎอายุข้อมูล — ข้อมูลของวัตถุประสงค์นี้ไม่มีวันครบอายุจนกว่าจะตั้ง</span>}
                    </p>
                    {can(v.role, "policy") && (
                      <details className="mt-2">
                        <summary className="c-btn c-btn-ghost c-btn-sm inline-flex cursor-pointer">{r ? "แก้กฎอายุ" : "ตั้งกฎอายุ"}</summary>
                        <ActionForm action={setRetentionRuleAction} fields={{ purposeId: b.purpose_id }} label="บันทึกกฎอายุ" pendingLabel="กำลังบันทึก…" size="sm" className="mt-3 grid gap-3 md:grid-cols-3">
                          <label className={LABEL}>เก็บกี่วัน (30–3,650)<input type="number" name="days" min={30} max={3650} defaultValue={r?.days ?? 730} className="c-input" required /></label>
                          <label className={LABEL}>นับจาก
                            <select name="trigger" className="c-select" defaultValue={r?.trigger ?? "last_interaction"}>
                              {RETENTION_TRIGGERS.map((t) => <option key={t} value={t}>{TRIGGER_TH[t]}</option>)}
                            </select>
                          </label>
                          <label className="c-thai flex items-center gap-2 self-end text-[0.84rem] text-[var(--c-text-2)]">
                            <input type="checkbox" name="legalHold" value="1" defaultChecked={r?.legalHold} className="h-5 w-5" /> legal hold (หยุดนับ)
                          </label>
                          <label className={`${LABEL} md:col-span-3`}>เหตุผล (บังคับเมื่อ legal hold)<input name="note" defaultValue={r?.legalHold ? r.note ?? "" : ""} className="c-input" /></label>
                        </ActionForm>
                      </details>
                    )}
                  </div>
                );
              })()}
            </Panel>
          ))}
        </div>
      ) : (
        <Panel className="p-5 md:p-6"><p className="c-thai text-[0.88rem] text-[var(--c-text-3)]">ยังไม่มีวัตถุประสงค์ — สร้างตอน<Link href="/app/vault/sources/new" className="underline">ลงทะเบียนแหล่งข้อมูล</Link></p></Panel>
      )}
    </>
  );
}
