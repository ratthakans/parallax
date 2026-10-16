import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { viewer } from "@/app/(app)/viewer";
import {
  addMemberLinkAction, addRelationshipAction, claimAccountAction, confirmAffiliationAction, endAffiliationAction, endRelationshipAction,
  generateBriefAction, logInteractionAction, setClassificationAction, setParentAction, updateOrgFieldAction, verifyOrgAction,
} from "@/app/(app)/account-actions";
import { getDossier, orgOptions, unknownsOf, type Dossier, type RowRef, type Version } from "@/lib/engine/accounts";
import { currentBrief } from "@/lib/engine/accounts/brief";
import { loadPathGraph, pathsToOrg, suggestKnows } from "@/lib/engine/accounts/paths";
import {
  INTERACTION_KINDS, INTERACTION_TH, MEMBER_RELATIONSHIP_TYPES, ORG_FIELD_TH, RELATIONSHIP_ENDS, RELATIONSHIP_TH, RELATIONSHIP_TYPES,
  type OrgEditable,
} from "@/lib/shared/accounts";
import { CLASSIFICATIONS, CLASSIFICATION_TH, LIFECYCLE_TH, type LifecycleState } from "@/lib/shared/vault";
import { thaiDate, thaiDateTime } from "@/lib/shared/format";
import { ActionForm } from "@/components/console/action-form";
import { NoteCapture } from "@/components/console/note-capture";
import { Panel, num } from "@/components/console/ui";

export const dynamic = "force-dynamic";

/* ── แฟ้มบริษัท (docs/plan.md B4 · หัวข้อ 3.5 ข้อ 1–2) ─────────────────

   ทุกค่ามี "ที่มา" กดเปิดได้: แถวในไฟล์ · เวลาที่บันทึก · ตรวจล่าสุด · ประวัติรุ่น
   ค่าที่ไม่มีหลักฐานเขียนว่า "ไม่ทราบ" · ช่องทางติดต่อไม่แสดงที่นี่ (ดูแบบปิดบางในหน้าคน)
   รายการที่ระดับเกินสิทธิ์ถูกปิดบัง — เห็นว่ามี แต่ไม่เห็นเนื้อหา */

const LABEL = "c-thai flex min-w-0 flex-col gap-1 text-[0.8rem] text-[var(--c-text-3)]";
const UNKNOWN = <span className="text-[var(--c-text-4)]">ไม่ทราบ</span>;
const today = () => new Date().toISOString().slice(0, 10);

function Evidence({ rows, versions, recorded, verified, label = "ที่มา", children }: {
  rows?: RowRef[]; versions?: Version[]; recorded?: string | null; verified?: string | null; label?: string; children?: ReactNode;
}) {
  const n = (rows?.length ?? 0) + (versions?.length ?? 0);
  return (
    <details className="c-thai mt-1 text-[0.78rem] text-[var(--c-text-3)]">
      <summary className="inline-block cursor-pointer py-1 text-[var(--c-text-4)] hover:text-[var(--c-text-2)]">
        {label}{n ? ` (${num(n)})` : ""}
      </summary>
      <div className="mt-1 grid gap-1.5 border-l border-[var(--c-line)] pl-3">
        {rows?.slice(0, 12).map((r) => (
          <p key={`${r.batchId}#${r.line}`}>
            <Link href={`/app/vault/batches/${r.batchId}`} className="c-mono underline decoration-[var(--c-line-2)]">{r.file} · บรรทัด {num(r.line)}</Link>
            {r.source ? ` · ${r.source}` : ""}{r.asWritten ? ` · “${r.asWritten}”` : ""} · บันทึก {thaiDateTime(r.recordedAt)}
          </p>
        ))}
        {rows && rows.length > 12 && <p>และอีก {num(rows.length - 12)} แถว</p>}
        {versions?.map((v, i) => (
          <p key={i}>
            {thaiDateTime(v.at)} · {v.by}: {v.oldValue ?? "ว่าง"} → {v.newValue ?? "ว่าง"} <span className="text-[var(--c-text-4)]">({v.reason})</span>
          </p>
        ))}
        {!n && <p>ไม่มีแถวต้นทางหรือการแก้ไขที่บันทึกไว้</p>}
        {(recorded !== undefined || verified !== undefined) && (
          <p className="text-[var(--c-text-4)]">บันทึกล่าสุด {thaiDateTime(recorded)} · ตรวจล่าสุด {verified ? thaiDateTime(verified) : "ยังไม่เคยตรวจ"}</p>
        )}
        {children}
      </div>
    </details>
  );
}

function Fact({ d, field, value }: { d: Dossier; field: OrgEditable; value: string | null }) {
  return (
    <div className="border-t border-[var(--c-line)] py-3 first:border-t-0">
      <p className="c-thai text-[0.75rem] text-[var(--c-text-4)]">{ORG_FIELD_TH[field]}</p>
      <p className="c-thai mt-0.5 break-words text-[0.92rem] text-[var(--c-text)]">{value ?? UNKNOWN}</p>
      <Evidence versions={d.versions[field]} label="ที่มา · แก้ค่า">
        <ActionForm action={updateOrgFieldAction} fields={{ orgId: d.org.id, field }} label="บันทึกค่า" pendingLabel="กำลังบันทึก…" size="sm" className="mt-1 grid gap-2">
          <label className={LABEL}>ค่าใหม่ (เว้นว่าง = ไม่ทราบ)<input name="value" defaultValue={value ?? ""} className="c-input" /></label>
          <label className={LABEL}>ที่มาของค่านี้<input name="reason" className="c-input" placeholder="เช่น จากเว็บไซต์บริษัท" required /></label>
        </ActionForm>
      </Evidence>
    </div>
  );
}

export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await viewer();
  const who = { id: v.actor, clearance: v.clearance };
  const d = await getDossier(v.tenantId, id, who);
  if (!d) notFound();
  const o = d.org;

  if (d.masked) {
    return (
      <>
        <Link href="/app/accounts" className="c-thai inline-block py-2 text-[0.85rem] text-[var(--c-text-3)] hover:text-[var(--c-text)]">← บริษัททั้งหมด</Link>
        <h1 className="c-h1 mt-4 text-[var(--c-text)]">{o.name}</h1>
        <Panel className="mt-6 p-5 md:p-6">
          <p className="c-thai text-[0.9rem] text-[var(--c-text-2)]">
            บริษัทนี้อยู่ในระดับ “{CLASSIFICATION_TH[o.classification]}” — เห็นได้เฉพาะเจ้าของบัญชีและเจ้าของข้อมูล
          </p>
        </Panel>
      </>
    );
  }

  const [brief, others, graph, suggested] = await Promise.all([
    currentBrief(v.tenantId, id, who), orgOptions(v.tenantId, id), loadPathGraph(v.tenantId, v.clearance), suggestKnows(v.tenantId, who, id),
  ]);
  const paths = pathsToOrg(graph, id);
  const knownByMe = new Set(paths.filter((p) => p.hops === 1 && p.member === v.actor).map((p) => p.person.id));
  const unknowns = unknownsOf(d);
  const current = d.people.filter((p) => p.current);
  const former = d.people.filter((p) => !p.current);
  const mineAccount = o.accountOwner === v.actor;
  const ends = [
    ...d.people.filter((p) => p.current).map((p) => ({ v: `person:${p.personId}`, label: p.name })),
    { v: `org:${o.id}`, label: `${o.name} (บริษัทนี้)` },
  ];
  const otherEnds = [...ends, ...others.map((x) => ({ v: `org:${x.id}`, label: x.name }))];

  type Ev = { at: string; title: string; body?: ReactNode; who?: string | null };
  const timeline: Ev[] = [
    ...d.interactions.map((i) => ({
      at: i.occurredAt,
      title: `${INTERACTION_TH[i.kind] ?? i.kind}${i.personName ? ` · ${i.personName}` : ""}`,
      body: i.masked
        ? <span className="text-[var(--c-text-4)]">บันทึกระดับ “{CLASSIFICATION_TH[i.classification]}” — เห็นเฉพาะผู้บันทึก</span>
        : <>
            <span className="whitespace-pre-line">{i.summary}</span>
            {i.outcome && <span className="block text-[var(--c-text-3)]">ผล: {i.outcome}</span>}
            {i.note && (
              <details className="mt-1 text-[0.78rem] text-[var(--c-text-3)]">
                <summary className="inline-block cursor-pointer py-1 text-[var(--c-text-4)] hover:text-[var(--c-text-2)]">โน้ตต้นฉบับ</summary>
                <p className="whitespace-pre-line border-l border-[var(--c-line)] pl-3">{i.note}</p>
              </details>
            )}
          </>,
      who: i.owner,
    })),
    ...d.participations.map((p) => ({ at: p.occurredAt ?? "", title: `ร่วม ${p.program}${p.edition ? ` ${p.edition}` : ""}`, body: <>{p.personName ?? "ไม่ทราบชื่อ"} · {p.role}</> })),
    ...d.people.flatMap((p) => [
      ...(p.from ? [{ at: p.from, title: `${p.name} เริ่มสังกัด`, body: p.title ?? undefined }] : []),
      ...(p.to ? [{ at: p.to, title: `${p.name} ออก`, body: p.title ?? undefined }] : []),
    ]),
    ...d.relationships.filter((r) => r.confirmedAt).map((r) => ({
      at: r.confirmedAt!, title: "บันทึกความสัมพันธ์", body: <>{r.fromName} {RELATIONSHIP_TH[r.type]} {r.toName}</>, who: r.confirmedBy,
    })),
  ].filter((e) => e.at).sort((a, b) => (a.at < b.at ? 1 : -1));

  return (
    <>
      <Link href="/app/accounts" className="c-thai inline-block py-2 text-[0.85rem] text-[var(--c-text-3)] hover:text-[var(--c-text)]">← บริษัททั้งหมด</Link>

      <header className="mt-4 mb-6 flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0">
          <p className="c-label-th">บริษัท</p>
          <h1 className="c-h1 mt-3 break-words text-[var(--c-text)]">{o.name}</h1>
          <p className="c-thai mt-2 flex flex-wrap items-center gap-2 text-[0.84rem] text-[var(--c-text-3)]">
            <span className="c-pill">{LIFECYCLE_TH[o.lifecycle as LifecycleState] ?? o.lifecycle}</span>
            <span className="c-pill">{CLASSIFICATION_TH[o.classification]}</span>
            <span>เจ้าของบัญชี: {o.accountOwner ?? "ยังไม่มี"}</span>
            <span>· ตรวจล่าสุด {o.lastVerifiedAt ? thaiDate(o.lastVerifiedAt) : "ยังไม่เคยตรวจ"}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionForm action={claimAccountAction} fields={{ orgId: o.id, release: mineAccount ? "1" : "0" }}
            label={mineAccount ? "ปล่อยบัญชี" : o.accountOwner ? "รับเป็นเจ้าของแทน" : "รับเป็นเจ้าของบัญชี"} pendingLabel="กำลังบันทึก…"
            confirm={o.accountOwner && !mineAccount ? `ยืนยันรับแทน ${o.accountOwner}` : undefined} />
          <ActionForm action={verifyOrgAction} fields={{ orgId: o.id }} label="ยืนยันว่าข้อมูลถูกต้อง" pendingLabel="กำลังบันทึก…" />
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 content-start gap-6">
          {/* ── สรุปก่อนพบลูกค้า ── */}
          <Panel className="p-5 md:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="c-h2 text-[var(--c-text)]">สรุปก่อนพบลูกค้า</h2>
              <p className="c-thai text-[0.75rem] text-[var(--c-text-4)]">
                {brief?.generatedBy === "ai" ? `เขียนโดย AI (Claude Opus 5.5) ${thaiDateTime(brief.createdAt)}` : "จากสูตร — ประโยคมาจากหลักฐานตรง ๆ"}
                {brief ? ` · ใช้หลักฐานระดับไม่เกิน “${CLASSIFICATION_TH[brief.scope]}”` : ""}
              </p>
            </div>
            {brief ? (
              <ol className="c-thai mt-4 grid gap-3 text-[0.92rem] leading-relaxed text-[var(--c-text-2)]">
                {brief.sentences.map((s, i) => (
                  <li key={i}>
                    {s.text}
                    {s.cites.length > 0 && (
                      <details className="mt-0.5 text-[0.76rem] text-[var(--c-text-4)]">
                        <summary className="inline-block cursor-pointer py-0.5 hover:text-[var(--c-text-2)]">หลักฐาน {s.cites.map((c) => c.id).join(" ")}</summary>
                        <ul className="mt-1 grid gap-1 border-l border-[var(--c-line)] pl-3">
                          {s.cites.map((c) => <li key={c.id}><span className="c-mono">{c.id}</span> {c.text}</li>)}
                        </ul>
                      </details>
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="c-thai mt-4 text-[0.88rem] text-[var(--c-text-3)]">บริษัทนี้ยังไม่มีหลักฐานพอให้สรุป</p>
            )}
            {brief && brief.dropped > 0 && (
              <p className="c-thai mt-3 text-[0.78rem] text-[var(--c-text-4)]">ทิ้ง {num(brief.dropped)} ประโยคที่ไม่มีหลักฐาน</p>
            )}
            <ActionForm action={generateBriefAction} fields={{ orgId: o.id }} className="mt-4"
              label={brief?.generatedBy === "ai" ? "สร้างสรุปใหม่ด้วย AI" : "สร้างสรุปด้วย AI"} pendingLabel="AI กำลังอ่านหลักฐาน…"
              note={<p className="c-thai text-[0.76rem] text-[var(--c-text-4)]">ส่งเฉพาะหลักฐานในแฟ้มนี้ ไม่ส่งอีเมล/เบอร์ และไม่ส่งรายการระดับจำกัดสูง · บัญชีที่ยังไม่ชำระได้สรุปจากสูตร</p>} />
          </Panel>

          {/* ── คนในบริษัทตามเวลา ── */}
          <Panel className="p-5 md:p-6">
            <h2 className="c-h2 text-[var(--c-text)]">คนในบริษัท</h2>
            <p className="c-thai mt-1 text-[0.82rem] text-[var(--c-text-3)]">ยังสังกัด {num(current.length)} คน · เคยสังกัด {num(former.length)} คน — ช่วงเวลามาจากวันที่ในไฟล์หรือที่คนแก้</p>
            {d.people.length ? (
              <ul className="mt-4 grid gap-0">
                {[...current, ...former].map((p) => (
                  <li key={p.affiliationId} className="border-t border-[var(--c-line)] py-3 first:border-t-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="c-thai min-w-0 text-[0.94rem]">
                        <Link href={`/app/customers/${p.personId}`} className="text-[var(--c-text)] hover:text-[var(--c-accent)]">{p.name}</Link>
                        <span className="text-[var(--c-text-3)]"> · {p.title ?? "ไม่ทราบตำแหน่ง"}</span>
                        {!p.current && <span className="c-pill ml-2">ออกแล้ว</span>}
                      </p>
                      <p className="c-thai text-[0.78rem] text-[var(--c-text-3)]">
                        {p.from ? thaiDate(p.from) : "ไม่ทราบวันเริ่ม"} – {p.to ? thaiDate(p.to) : "ปัจจุบัน"}
                        {p.confirmedBy ? <span className="text-[var(--c-good)]"> · ยืนยันโดย {p.confirmedBy}</span> : <span className="text-[var(--c-text-4)]"> · ยังไม่มีคนยืนยัน</span>}
                      </p>
                    </div>
                    <Evidence rows={p.rows} recorded={p.recordedAt} label="ที่มา · ยืนยัน/ปิดช่วง">
                      <div className="mt-1 flex flex-wrap gap-2">
                        {!p.confirmedBy && <ActionForm action={confirmAffiliationAction} fields={{ orgId: o.id, affiliationId: p.affiliationId }} label="ยืนยันสังกัด" pendingLabel="กำลังบันทึก…" size="sm" />}
                      </div>
                      {p.current && (
                        <ActionForm action={endAffiliationAction} fields={{ orgId: o.id, affiliationId: p.affiliationId }} label="บันทึกว่าออกแล้ว" pendingLabel="กำลังบันทึก…" size="sm" className="mt-2 grid gap-2 sm:grid-cols-2">
                          <label className={LABEL}>วันที่ออก<input type="date" name="endedOn" defaultValue={today()} className="c-input" required /></label>
                          <label className={LABEL}>ที่มา<input name="reason" className="c-input" placeholder="เช่น แจ้งเปลี่ยนงานทางอีเมล" required /></label>
                        </ActionForm>
                      )}
                    </Evidence>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="c-thai mt-4 text-[0.88rem] text-[var(--c-text-3)]">ไม่ทราบ — ยังไม่มีคนที่สังกัดบริษัทนี้ในฐาน</p>
            )}
          </Panel>

          {/* ── เส้นทางเข้าถึง (docs/solo-plan.md S2) ── */}
          <Panel className="p-5 md:p-6">
            <h2 className="c-h2 text-[var(--c-text)]">เส้นทางเข้าถึง</h2>
            <p className="c-thai mt-1 text-[0.82rem] text-[var(--c-text-3)]">ใครในทีมรู้จักคนที่อยู่บริษัทนี้ตอนนี้ — ไม่เกินสองทอด ทุกทอดยืนยันแล้ว ไม่มีคะแนน · ไม่ผ่านคนที่คัดค้านหรือเกินสิทธิ์ของคุณ</p>
            {paths.length ? (
              <ul className="c-thai mt-4 grid gap-2 text-[0.88rem] text-[var(--c-text-2)]">
                {paths.slice(0, 12).map((p) => (
                  <li key={`${p.member}|${p.via?.id ?? ""}|${p.person.id}`}>
                    <span className={`c-pill mr-2 ${p.hops === 1 ? "c-pill-good" : ""}`}>{p.hops === 1 ? "ตรง" : "สองทอด"}</span>{p.text}
                  </li>
                ))}
                {paths.length > 12 && <li className="text-[var(--c-text-4)]">และอีก {num(paths.length - 12)} เส้นทาง</li>}
              </ul>
            ) : (
              <p className="c-thai mt-4 text-[0.88rem] text-[var(--c-text-3)]">ไม่ทราบ — ยังไม่มีใครในทีมบันทึกว่ารู้จักคนในบริษัทนี้</p>
            )}
            {suggested.filter((s) => !knownByMe.has(s.personId)).length > 0 && (
              <p className="c-thai mt-4 text-[0.82rem] text-[var(--c-text-3)]">
                คุณคุยกับ {suggested.filter((s) => !knownByMe.has(s.personId)).slice(0, 3).map((s) => `${s.name} (${num(s.interactions)} ครั้ง)`).join(" · ")} แล้ว — ถ้ารู้จักจริง บันทึกไว้ด้านล่าง
              </p>
            )}
            {current.some((p) => !p.masked && !knownByMe.has(p.personId)) && (
              <details className="mt-4">
                <summary className="c-btn c-btn-ghost inline-flex cursor-pointer">ฉันรู้จักคนในบริษัทนี้</summary>
                <ActionForm action={addMemberLinkAction} fields={{ orgId: o.id }} label="บันทึก" pendingLabel="กำลังบันทึก…" variant="primary" className="mt-4 grid gap-3 md:grid-cols-3">
                  <label className={LABEL}>คน
                    <select name="personId" className="c-select" required defaultValue={suggested.find((s) => !knownByMe.has(s.personId))?.personId ?? ""}>
                      <option value="" disabled>เลือก</option>
                      {current.filter((p) => !p.masked && !knownByMe.has(p.personId)).map((p) => <option key={p.personId} value={p.personId}>{p.name}</option>)}
                    </select>
                  </label>
                  <label className={LABEL}>แบบไหน
                    <select name="type" className="c-select" defaultValue="knows">
                      {MEMBER_RELATIONSHIP_TYPES.map((t) => <option key={t} value={t}>{RELATIONSHIP_TH[t]}</option>)}
                    </select>
                  </label>
                  <label className={LABEL}>ตั้งแต่ (ถ้าทราบ)<input type="date" name="validFrom" className="c-input" /></label>
                  <label className={`${LABEL} md:col-span-3`}>รู้จักจากที่ไหน เมื่อไร (เป็นหลักฐาน)
                    <input name="context" className="c-input" placeholder="เช่น ประชุมสมาคม ต.ค. 2568 · เคยทำโครงการด้วยกันปี 2566" required />
                  </label>
                </ActionForm>
              </details>
            )}
          </Panel>

          {/* ── ความสัมพันธ์ที่ยืนยัน ── */}
          <Panel className="p-5 md:p-6">
            <h2 className="c-h2 text-[var(--c-text)]">ความสัมพันธ์</h2>
            <p className="c-thai mt-1 text-[0.82rem] text-[var(--c-text-3)]">บันทึกได้เฉพาะสิ่งที่รู้จริง พร้อมหลักฐานและผู้ยืนยัน — ระบบไม่สร้างความสัมพันธ์จากการเดา</p>
            {d.relationships.length ? (
              <ul className="mt-4 grid gap-0">
                {d.relationships.map((r) => (
                  <li key={r.id} className="border-t border-[var(--c-line)] py-3 first:border-t-0">
                    <p className="c-thai text-[0.9rem] text-[var(--c-text)]">
                      {r.fromName} <span className="text-[var(--c-text-3)]">{RELATIONSHIP_TH[r.type] ?? r.type}</span> {r.toName}
                      {r.validTo && <span className="c-pill ml-2">สิ้นสุด {thaiDate(r.validTo)}</span>}
                    </p>
                    <p className="c-thai mt-0.5 text-[0.78rem] text-[var(--c-text-3)]">
                      {r.confirmedBy ? `ยืนยันโดย ${r.confirmedBy} ${thaiDateTime(r.confirmedAt)}` : "ยังไม่มีผู้ยืนยัน"}
                      {r.context ? ` · ${r.context}` : ""}{r.validFrom ? ` · ตั้งแต่ ${thaiDate(r.validFrom)}` : ""}
                    </p>
                    <Evidence label="หลักฐาน">
                      <p>หลักฐาน: {r.evidenceNote ?? "ไม่มีบันทึก"}</p>
                      {!r.validTo && (
                        <ActionForm action={endRelationshipAction} fields={{ orgId: o.id, relationshipId: r.id }} label="บันทึกว่าสิ้นสุดแล้ว" pendingLabel="กำลังบันทึก…" size="sm" className="mt-2 grid gap-2 sm:grid-cols-2">
                          <label className={LABEL}>วันที่สิ้นสุด<input type="date" name="endedOn" defaultValue={today()} className="c-input" required /></label>
                          <label className={LABEL}>ที่มา<input name="reason" className="c-input" required /></label>
                        </ActionForm>
                      )}
                    </Evidence>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="c-thai mt-4 text-[0.88rem] text-[var(--c-text-3)]">ไม่ทราบ — ยังไม่มีความสัมพันธ์ที่มีผู้ยืนยัน</p>
            )}
            <details className="mt-4">
              <summary className="c-btn c-btn-ghost inline-flex cursor-pointer">บันทึกความสัมพันธ์</summary>
              <ActionForm action={addRelationshipAction} fields={{ orgId: o.id }} label="บันทึก" pendingLabel="กำลังบันทึก…" variant="primary" className="mt-4 grid gap-3 md:grid-cols-3">
                <label className={LABEL}>จาก
                  <select name="from" className="c-select" required defaultValue="">
                    <option value="" disabled>เลือก</option>
                    {ends.map((e) => <option key={e.v} value={e.v}>{e.label}</option>)}
                  </select>
                </label>
                <label className={LABEL}>ความสัมพันธ์
                  <select name="type" className="c-select" required defaultValue="">
                    <option value="" disabled>เลือก</option>
                    {RELATIONSHIP_TYPES.filter((t) => RELATIONSHIP_ENDS[t][0] !== "member").map((t) => (
                      <option key={t} value={t}>{RELATIONSHIP_TH[t]} ({RELATIONSHIP_ENDS[t].map((k) => (k === "org" ? "บริษัท" : "คน")).join("→")})</option>
                    ))}
                  </select>
                </label>
                <label className={LABEL}>ถึง
                  <select name="to" className="c-select" required defaultValue="">
                    <option value="" disabled>เลือก</option>
                    {otherEnds.map((e) => <option key={e.v} value={e.v}>{e.label}</option>)}
                  </select>
                </label>
                <label className={`${LABEL} md:col-span-2`}>หลักฐาน — รู้ได้อย่างไร จากใคร เมื่อไร
                  <input name="evidence" className="c-input" placeholder="เช่น คุณวิภาแจ้งในที่ประชุม 3 พ.ย. ว่าคุณสมชายเป็นผู้อนุมัติงบ" required />
                </label>
                <label className={LABEL}>ตั้งแต่ (ถ้าทราบ)<input type="date" name="validFrom" className="c-input" /></label>
                <label className={`${LABEL} md:col-span-3`}>บริบท (ไม่บังคับ)<input name="context" className="c-input" placeholder="เช่น งบสปอนเซอร์ปี 2027" /></label>
              </ActionForm>
            </details>
          </Panel>

          {/* ── ไทม์ไลน์ ── */}
          <Panel className="p-5 md:p-6">
            <h2 className="c-h2 text-[var(--c-text)]">ไทม์ไลน์</h2>
            <details className="mt-3">
              <summary className="c-btn c-btn-primary inline-flex cursor-pointer">จดโน้ตหลังพบลูกค้า</summary>
              <div className="mt-4">
                <NoteCapture orgId={o.id} people={d.people.filter((p) => !p.masked).map((p) => ({ personId: p.personId, name: p.name }))
                  .filter((p, i, xs) => xs.findIndex((x) => x.personId === p.personId) === i)} />
              </div>
            </details>
            <details className="mt-3">
              <summary className="c-btn c-btn-ghost inline-flex cursor-pointer">บันทึกการติดต่อแบบฟอร์ม</summary>
              <ActionForm action={logInteractionAction} fields={{ orgId: o.id }} label="บันทึก" pendingLabel="กำลังบันทึก…" variant="primary" className="mt-4 grid gap-3 md:grid-cols-3">
                <label className={LABEL}>ชนิด
                  <select name="kind" className="c-select" defaultValue="meeting">
                    {INTERACTION_KINDS.map((k) => <option key={k} value={k}>{INTERACTION_TH[k]}</option>)}
                  </select>
                </label>
                <label className={LABEL}>วันที่<input type="date" name="occurredAt" defaultValue={today()} className="c-input" required /></label>
                <label className={LABEL}>กับใคร (ไม่บังคับ)
                  <select name="personId" className="c-select" defaultValue="">
                    <option value="">ไม่ระบุคน</option>
                    {current.map((p) => <option key={p.personId} value={p.personId}>{p.name}</option>)}
                  </select>
                </label>
                <label className={`${LABEL} md:col-span-3`}>คุยอะไร
                  <textarea name="summary" rows={3} className="c-input" required />
                </label>
                <label className={`${LABEL} md:col-span-2`}>ผลและขั้นตอนถัดไป<input name="outcome" className="c-input" /></label>
                <label className={LABEL}>ระดับความลับ
                  <select name="classification" className="c-select" defaultValue="confidential">
                    {CLASSIFICATIONS.map((c) => <option key={c} value={c}>{CLASSIFICATION_TH[c]}{c === "restricted_high" ? " (เห็นเฉพาะคุณ · ไม่ส่งให้ AI)" : ""}</option>)}
                  </select>
                </label>
              </ActionForm>
            </details>
            {timeline.length ? (
              <ol className="mt-5 grid gap-0">
                {timeline.slice(0, 60).map((e, i) => (
                  <li key={i} className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 border-t border-[var(--c-line)] py-3 first:border-t-0">
                    <span className="c-thai text-[0.78rem] text-[var(--c-text-3)]">{thaiDate(e.at)}</span>
                    <div className="c-thai min-w-0 text-[0.88rem] text-[var(--c-text-2)]">
                      <p className="text-[var(--c-text)]">{e.title}</p>
                      {e.body && <div className="mt-0.5 break-words">{e.body}</div>}
                      {e.who && <p className="mt-0.5 text-[0.76rem] text-[var(--c-text-4)]">บันทึกโดย {e.who}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="c-thai mt-4 text-[0.88rem] text-[var(--c-text-3)]">ยังไม่มีประวัติ</p>
            )}
          </Panel>
        </div>

        {/* ── ข้อเท็จจริงของบริษัท ── */}
        <div className="grid min-w-0 content-start gap-6">
          <Panel className="p-5 md:p-6">
            <h2 className="c-h2 text-[var(--c-text)]">ข้อมูลบริษัท</h2>
            <div className="mt-3">
              <div className="py-3">
                <p className="c-thai text-[0.75rem] text-[var(--c-text-4)]">{ORG_FIELD_TH.name}</p>
                <p className="c-thai mt-0.5 break-words text-[0.92rem] text-[var(--c-text)]">{o.name}</p>
                <Evidence rows={d.namesAsWritten.flatMap((n) => n.rows)} recorded={o.recordedAt} verified={o.lastVerifiedAt} />
              </div>
              <Fact d={d} field="name_en" value={o.nameEn} />
              <Fact d={d} field="industry" value={o.industry} />
              <Fact d={d} field="tax_id" value={o.taxId} />
              <Fact d={d} field="branch_code" value={o.branchCode} />
              <Fact d={d} field="primary_domain" value={o.primaryDomain} />
              <div className="border-t border-[var(--c-line)] py-3">
                <p className="c-thai text-[0.75rem] text-[var(--c-text-4)]">โดเมนที่พบในอีเมล</p>
                {d.domains.length ? d.domains.map((x) => (
                  <div key={x.domain}>
                    <p className="c-mono mt-0.5 text-[0.86rem] text-[var(--c-text)]">{x.domain}</p>
                    <Evidence rows={x.rows} />
                  </div>
                )) : <p className="c-thai mt-0.5 text-[0.92rem]">{UNKNOWN}</p>}
              </div>
              <div className="border-t border-[var(--c-line)] py-3">
                <p className="c-thai text-[0.75rem] text-[var(--c-text-4)]">ชื่อที่เขียนในไฟล์</p>
                {d.namesAsWritten.length ? (
                  <ul className="c-thai mt-0.5 grid gap-0.5 text-[0.86rem] text-[var(--c-text-2)]">
                    {d.namesAsWritten.map((n) => <li key={n.name}>{n.name} <span className="text-[var(--c-text-4)]">· {num(n.rows.length)} แถว</span></li>)}
                  </ul>
                ) : <p className="c-thai mt-0.5 text-[0.92rem]">{UNKNOWN}</p>}
              </div>
              <div className="border-t border-[var(--c-line)] py-3">
                <p className="c-thai text-[0.75rem] text-[var(--c-text-4)]">{ORG_FIELD_TH.parent_id}</p>
                <p className="c-thai mt-0.5 text-[0.92rem]">
                  {d.parent ? <Link href={`/app/accounts/${d.parent.id}`} className="text-[var(--c-text)] hover:text-[var(--c-accent)]">{d.parent.name}</Link> : UNKNOWN}
                </p>
                {d.subsidiaries.length > 0 && (
                  <p className="c-thai mt-1 text-[0.82rem] text-[var(--c-text-3)]">
                    บริษัทในเครือ: {d.subsidiaries.map((s, i) => <span key={s.id}>{i ? " · " : ""}<Link href={`/app/accounts/${s.id}`} className="underline">{s.name}</Link></span>)}
                  </p>
                )}
                <Evidence versions={d.versions.parent_id} label="ที่มา · แก้ค่า">
                  <ActionForm action={setParentAction} fields={{ orgId: o.id }} label="บันทึก" pendingLabel="กำลังบันทึก…" size="sm" className="mt-1 grid gap-2">
                    <label className={LABEL}>บริษัทแม่ (คนละนิติบุคคล — ไม่รวมข้อมูล)
                      <select name="parentId" className="c-select" defaultValue={d.parent?.id ?? ""}>
                        <option value="">ไม่มี / ไม่ทราบ</option>
                        {others.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                      </select>
                    </label>
                    <label className={LABEL}>ที่มา<input name="reason" className="c-input" required /></label>
                  </ActionForm>
                </Evidence>
              </div>
              <div className="border-t border-[var(--c-line)] py-3">
                <p className="c-thai text-[0.75rem] text-[var(--c-text-4)]">{ORG_FIELD_TH.classification}</p>
                <p className="c-thai mt-0.5 text-[0.92rem] text-[var(--c-text)]">{CLASSIFICATION_TH[o.classification]}</p>
                <Evidence versions={d.versions.classification} label="ประวัติ · เปลี่ยนระดับ">
                  <ActionForm action={setClassificationAction} fields={{ orgId: o.id }} label="เปลี่ยนระดับ" pendingLabel="กำลังบันทึก…" size="sm" className="mt-1 grid gap-2">
                    <label className={LABEL}>ระดับ
                      <select name="level" className="c-select" defaultValue={o.classification}>
                        {CLASSIFICATIONS.map((c) => <option key={c} value={c}>{CLASSIFICATION_TH[c]}</option>)}
                      </select>
                    </label>
                  </ActionForm>
                </Evidence>
              </div>
            </div>
          </Panel>

          <Panel className="p-5 md:p-6">
            <h2 className="c-h2 text-[var(--c-text)]">ยังไม่ทราบ</h2>
            {unknowns.length ? (
              <ul className="c-thai mt-3 grid gap-1 text-[0.86rem] text-[var(--c-text-3)]">{unknowns.map((u) => <li key={u}>· {u}</li>)}</ul>
            ) : (
              <p className="c-thai mt-3 text-[0.86rem] text-[var(--c-text-3)]">ทุกช่องหลักมีหลักฐานแล้ว</p>
            )}
            <p className="c-thai mt-3 text-[0.76rem] text-[var(--c-text-4)]">ระบบไม่เติมช่องเหล่านี้ด้วยการเดาหรือคะแนน</p>
          </Panel>

          {d.opportunities.length > 0 && (
            <Panel className="p-5 md:p-6">
              <h2 className="c-h2 text-[var(--c-text)]">โอกาสขาย</h2>
              <ul className="c-thai mt-3 grid gap-1 text-[0.86rem] text-[var(--c-text-2)]">
                {d.opportunities.map((x) => <li key={x.id}>{x.name} · {x.stage}{x.expectedClose ? ` · ปิด ${thaiDate(x.expectedClose)}` : ""}</li>)}
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
