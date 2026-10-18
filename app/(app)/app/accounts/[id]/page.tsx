import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { viewer } from "@/app/(app)/viewer";
import {
  addMemberLinkAction, addRelationshipAction, claimAccountAction, confirmAffiliationAction, endAffiliationAction, endRelationshipAction,
  generateBriefAction, logInteractionAction, mergeOrgHereAction, setClassificationAction, setParentAction, updateOrgFieldAction, verifyOrgAction,
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
import { RecordHeader, RecordTabs, pickTab } from "@/components/console/record";
import { stageTh } from "@/lib/shared/deals";
import { orgGroup } from "@/lib/engine/accounts/group";
import { listFields, valuesFor } from "@/lib/engine/custom-fields";
import { orgEditions } from "@/lib/engine/editions";
import { CustomFieldsPanel } from "@/components/console/custom-fields";
import { listTeams } from "@/lib/engine/forecast";
import { listTasks } from "@/lib/engine/tasks";
import { teamMembers } from "@/lib/engine/team";
import { NewTaskForm, TaskList } from "@/components/console/tasks";
import { trashOrgAction } from "@/app/(app)/bulk-actions";
import { orgIsEmpty } from "@/lib/engine/trash";
import { similarOrgs } from "@/lib/engine/duplicates";
import { OrgPicker } from "@/components/console/org-picker";
import { setOrgTeamAction } from "@/app/(app)/field-actions";
import { get as getRow } from "@/lib/engine/sql";

const baht = (n: number) => `฿${n.toLocaleString("th-TH", { maximumFractionDigits: 0 })}`;

export const metadata = { title: "บริษัท" };
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

export default async function AccountPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; asof?: string; merged?: string; existed?: string }> }) {
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

  const [brief, others, graph, suggested, group] = await Promise.all([
    currentBrief(v.tenantId, id, who), orgOptions(v.tenantId, id), loadPathGraph(v.tenantId, v.clearance), suggestKnows(v.tenantId, who, id),
    orgGroup(v.tenantId, id, who),
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

  /* sort = วันที่เกิด (ตัดเหลือวัน) แล้วตามเวลาที่บันทึก — การติดต่อเก็บวันที่อย่างเดียว ถ้าเรียงสตริงตรง ๆ
     "2026-10-16" จะน้อยกว่า "2026-10-16T…" แล้วของที่เพิ่งบันทึกตกไปอยู่กลางรายการ */
  const dealName = new Map(d.opportunities.map((x) => [x.id, x.name]));
  type Ev = { at: string; sort?: string; title: string; body?: ReactNode; who?: string | null };
  const sortKey = (e: Ev) => `${e.at.slice(0, 10)}|${e.sort ?? e.at}`;
  const timeline: Ev[] = [
    ...d.interactions.map((i) => ({
      at: i.occurredAt, sort: i.recordedAt,
      title: `${INTERACTION_TH[i.kind] ?? i.kind}${i.personName ? ` · ${i.personName}` : ""}${i.dealId && dealName.get(i.dealId) ? ` · ดีล ${dealName.get(i.dealId)}` : ""}`,
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
  ].filter((e) => e.at).sort((a, b) => (sortKey(a) < sortKey(b) ? 1 : -1));

  const inGroup = Boolean(group && group.members.length + group.hidden > 1);
  const [cFields, cValues, editions, teams, teamRow] = await Promise.all([
    listFields(v.tenantId, "org"), valuesFor(v.tenantId, "org", [id]), orgEditions(v.tenantId, id), listTeams(v.tenantId),
    getRow<{ team_id: string | null }>("SELECT team_id FROM orgs WHERE tenant_id = ? AND id = ?", v.tenantId, id),
  ]);
  const team = teams.find((t) => t.id === teamRow?.team_id) ?? null;
  const [orgTasks, teamList, notEmpty, dupes] = await Promise.all([
    listTasks(v.tenantId, "open", who, new Date(), { orgId: id }), teamMembers(v.tenantId, v.actor), orgIsEmpty(v.tenantId, id),
    (await searchParams).tab === "details" ? similarOrgs(v.tenantId, { orgId: id }, who) : Promise.resolve([]),
  ]);
  const TABS = ["overview", "details", "people", "deals", "events", "group", "relationships"] as const;
  const sp = await searchParams;
  const tab = pickTab(TABS, sp.tab);
  /* ณ วันที่ (C3): ใครสังกัดบริษัทนี้ในวันนั้น — ช่วงเวลาจากสังกัดตามเวลา */
  const asof = /^\d{4}-\d{2}-\d{2}$/.test(sp.asof ?? "") ? sp.asof! : null;
  const atDate = asof ? d.people.filter((p) => (!p.from || p.from.slice(0, 10) <= asof) && (!p.to || p.to.slice(0, 10) > asof)) : null;
  const base = `/app/accounts/${o.id}`;
  const lastTouch = d.interactions.map((i) => i.occurredAt).sort().at(-1);

  return (
    <>
      {/* หลังรวมบริษัท — บอกผลและทางย้อน (docs/qa-plan.md BUG-14) */}
      {sp.existed === "1" && (
        <p role="status" className="c-msg c-msg-ok mt-4">มีบริษัทนี้อยู่แล้ว — เปิดแฟ้มเดิมให้แทนการสร้างซ้ำ</p>
      )}
      {sp.merged === "1" && (
        <p role="status" className="c-msg c-msg-ok mb-4">
          รวมบริษัทเข้าแฟ้มนี้แล้ว — คน ดีล กิจกรรม และงานย้ายมาที่นี่ · รวมผิดย้อนได้ที่ <Link href="/app/vault/review" className="underline">ตรวจข้อมูลซ้ำ › ประวัติการรวม › แยกคืน</Link>
        </p>
      )}
      <RecordHeader
        back={{ href: "/app/accounts", label: "บริษัททั้งหมด" }}
        kind="บริษัท"
        title={o.name}
        badges={<>
          <span className="c-pill">{LIFECYCLE_TH[o.lifecycle as LifecycleState] ?? o.lifecycle}</span>
          <span className="c-pill">{CLASSIFICATION_TH[o.classification]}</span>
          {o.lastVerifiedAt ? <span className="c-pill c-pill-good">ตรวจแล้ว {thaiDate(o.lastVerifiedAt)}</span> : <span className="c-pill">ยังไม่เคยตรวจ</span>}
        </>}
        highlights={[
          { label: "อุตสาหกรรม", value: o.industry ?? UNKNOWN },
          { label: "เจ้าของบัญชี", value: o.accountOwner ?? "ยังไม่มี" },
          { label: "คนปัจจุบัน", value: num(current.length) },
          { label: "ติดต่อล่าสุด", value: lastTouch ? thaiDate(lastTouch) : "ยังไม่เคย" },
          { label: "ดีลที่เปิด", value: num(d.opportunities.filter((x) => !["won", "lost"].includes(x.stage)).length) },
          { label: "โดเมน", value: o.primaryDomain ?? UNKNOWN },
        ]}
        actions={<>
          <ActionForm action={claimAccountAction} fields={{ orgId: o.id, release: mineAccount ? "1" : "0" }} size="sm"
            label={mineAccount ? "ปล่อยบัญชี" : o.accountOwner ? "รับเป็นเจ้าของแทน" : "รับเป็นเจ้าของบัญชี"} pendingLabel="กำลังบันทึก…"
            confirm={o.accountOwner && !mineAccount ? `ยืนยันรับแทน ${o.accountOwner}` : undefined} />
          <ActionForm action={verifyOrgAction} fields={{ orgId: o.id }} label="ยืนยันว่าข้อมูลถูกต้อง" pendingLabel="กำลังบันทึก…" size="sm" />
          <Link href={`/app/deals/new?org=${o.id}`} className="c-btn c-btn-primary c-btn-sm">+ ดีล</Link>
          <Link href={`/app/customers/new?org=${o.id}`} className="c-btn c-btn-ghost c-btn-sm">+ ผู้ติดต่อ</Link>
          {/* มือถือ: ช่องบันทึกกิจกรรมอยู่ท้ายหน้า — ปุ่มนี้พาไปทันที (docs/ux-plan.md U7) */}
          <a href="#activity" className="c-btn c-btn-ghost c-btn-sm xl:hidden">บันทึกกิจกรรม</a>
        </>}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <RecordTabs base={base} active={tab} tabs={[
            { key: "overview", label: "ภาพรวม" },
            { key: "details", label: "รายละเอียด" },
            { key: "people", label: "คน", count: current.length },
            { key: "deals", label: "ดีล", count: d.opportunities.length },
            ...(editions.length ? [{ key: "events", label: "งานที่ร่วม", count: editions.reduce((t, p) => t + p.editions.length, 0) }] : []),
            ...(inGroup ? [{ key: "group", label: "บริษัทในเครือ", count: group!.members.length }] : []),
            { key: "relationships", label: "ความสัมพันธ์", count: d.relationships.length },
          ]} />
          <div className="grid min-w-0 content-start gap-5">
            {tab === "overview" && <>
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
                        <summary className="inline-block cursor-pointer py-0.5 hover:text-[var(--c-text-2)]">ที่มา ({s.cites.length})</summary>
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

          <Panel className="p-5 md:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="c-h2 text-[var(--c-text)]">คนสำคัญ</h2>
              <Link href={`/app/accounts/${o.id}?tab=people`} scroll={false} className="c-thai text-[0.82rem] text-[var(--c-accent)] hover:underline">ดูทั้งหมด {num(d.people.length)} คน →</Link>
            </div>
            {current.length ? (
              <ul className="mt-3 divide-y divide-[var(--c-line)]">
                {current.slice(0, 5).map((p) => (
                  <li key={p.affiliationId} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
                    <Link href={`/app/customers/${p.personId}`} className="c-thai text-[0.92rem] text-[var(--c-accent)] hover:underline">{p.name}</Link>
                    <span className="c-thai text-[0.8rem] text-[var(--c-text-3)]">{p.title ?? "ไม่ทราบตำแหน่ง"}{p.confirmedBy ? " · ยืนยันแล้ว" : ""}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="c-thai mt-3 text-[0.88rem] text-[var(--c-text-3)]">ยังไม่มีคนที่สังกัดอยู่ตอนนี้</p>
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

          {d.opportunities.length > 0 && (
            <Panel className="p-5 md:p-6">
              <h2 className="c-h2 text-[var(--c-text)]">โอกาสขาย</h2>
              <ul className="c-thai mt-3 grid gap-1 text-[0.86rem] text-[var(--c-text-2)]">
                {d.opportunities.map((x) => <li key={x.id}><Link href={`/app/deals/${x.id}`} className="text-[var(--c-accent)] hover:underline">{x.name}</Link> · {stageTh(x.stage)}{x.expectedClose ? ` · ปิด ${thaiDate(x.expectedClose)}` : ""}</li>)}
              </ul>
            </Panel>
          )}
          <Panel className="p-5 md:p-6">
            <h2 className="c-h2 text-[var(--c-text)]">ยังไม่ทราบ</h2>
            {unknowns.length ? (
              <ul className="c-thai mt-3 grid gap-1 text-[0.86rem] text-[var(--c-text-3)]">{unknowns.map((u) => <li key={u}>· {u}</li>)}</ul>
            ) : (
              <p className="c-thai mt-3 text-[0.86rem] text-[var(--c-text-3)]">ทุกช่องหลักมีหลักฐานแล้ว</p>
            )}
            <p className="c-thai mt-3 text-[0.76rem] text-[var(--c-text-4)]">ระบบไม่เติมช่องเหล่านี้ด้วยการเดาหรือคะแนน</p>
          </Panel>

            </>}
            {tab === "details" && <>
          <Panel className="p-5 md:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="c-h2 text-[var(--c-text)]">ฟิลด์ของบัญชี</h2>
              <Link href="/app/settings/fields" className="c-thai text-[0.8rem] text-[var(--c-accent)] hover:underline">จัดการฟิลด์</Link>
            </div>
            <div className="mt-3"><CustomFieldsPanel entity="org" recordId={o.id} fields={cFields} values={cValues.get(o.id)} /></div>
            {teams.length > 0 && (
              <div className="c-thai mt-4 border-t border-[var(--c-line)] pt-3 text-[0.9rem]">
                <p className="text-[0.75rem] text-[var(--c-text-4)]">ทีมที่ดูแล</p>
                <p>{team?.name ?? "ยังไม่ระบุ"}</p>
                <ActionForm action={setOrgTeamAction} fields={{ orgId: o.id }} label="บันทึก" pendingLabel="…" size="sm" className="mt-1 flex flex-wrap items-end gap-2">
                  <select name="teamId" defaultValue={team?.id ?? ""} className="c-select max-w-[14rem]" aria-label="ทีมที่ดูแล">
                    <option value="">ไม่ระบุ</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </ActionForm>
              </div>
            )}
          </Panel>
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
          {/* ── บริษัทที่อาจซ้ำ · รวมเข้าบริษัทนี้ ── */}
          <Panel className="scroll-mt-28 p-5 md:p-6">
            <h2 id="merge" className="c-h2 text-[var(--c-text)]">บริษัทที่อาจซ้ำกับบริษัทนี้</h2>
            <p className="c-thai mt-1 text-[0.82rem] text-[var(--c-text-3)]">รวมแล้วคน ดีล กิจกรรม และงานของอีกแฟ้มย้ายมาที่นี่ · ย้อนได้ที่ ตรวจข้อมูลซ้ำ › ประวัติการรวม · เลขนิติบุคคลต่างกันรวมไม่ได้</p>
            {dupes.length ? (
              <ul className="mt-3 divide-y divide-[var(--c-line)]">
                {dupes.map((x) => (
                  <li key={x.id} className="c-thai flex flex-wrap items-center justify-between gap-2 py-2 text-[0.88rem]">
                    <span><Link href={`/app/accounts/${x.id}`} className="text-[var(--c-accent)] hover:underline">{x.name}</Link> <span className="text-[0.76rem] text-[var(--c-text-3)]">· {x.why}</span></span>
                    <ActionForm action={mergeOrgHereAction} fields={{ orgId: o.id, dropId: x.id }} label="รวมเข้าบริษัทนี้" pendingLabel="กำลังรวม…" size="sm" variant="ghost"
                      confirm={`กดอีกครั้ง — รวม "${x.name}" เข้า "${o.name}"`} />
                  </li>
                ))}
              </ul>
            ) : <p className="c-thai mt-3 text-[0.86rem] text-[var(--c-text-3)]">ไม่พบบริษัทที่น่าจะซ้ำ</p>}
            <details className="mt-3">
              <summary className="c-thai cursor-pointer text-[0.82rem] text-[var(--c-accent)]">รวมบริษัทอื่นที่ไม่อยู่ในรายการ</summary>
              <ActionForm action={mergeOrgHereAction} fields={{ orgId: o.id }} label="รวมเข้าบริษัทนี้" pendingLabel="กำลังรวม…" size="sm" className="mt-2 grid max-w-md gap-2"
                confirm="กดอีกครั้ง — รวมบริษัทที่เลือกเข้าบริษัทนี้">
                <OrgPicker id="merge-org" name="dropName" names={others.map((x) => x.name)} placeholder="พิมพ์ชื่อบริษัทที่จะรวมเข้ามา" required />
              </ActionForm>
            </details>
          </Panel>
          {!notEmpty && (
            <Panel className="p-5 md:p-6">
              <p className="c-thai text-[0.86rem] text-[var(--c-text-3)]">แฟ้มนี้ว่าง (ไม่มีคน ดีล หรือกิจกรรม) — ถ้าสร้างผิด ลบได้ และกู้คืนได้ 30 วัน</p>
              <ActionForm action={trashOrgAction} fields={{ orgId: o.id }} label="ลบแฟ้มว่างนี้" pendingLabel="…" size="sm" variant="ghost" className="mt-2"
                confirm="กดอีกครั้ง — ย้ายแฟ้มไปถังขยะ" />
            </Panel>
          )}

            </>}
            {tab === "people" && <>
          {/* ── คนในบริษัทตามเวลา ── */}
          <Panel className="p-5 md:p-6">
            <h2 className="c-h2 text-[var(--c-text)]">คนในบริษัท</h2>
            <p className="c-thai mt-1 text-[0.82rem] text-[var(--c-text-3)]">
              {atDate ? `สังกัด ณ ${thaiDate(asof!)} ${num(atDate.length)} คน` : `ยังสังกัด ${num(current.length)} คน · เคยสังกัด ${num(former.length)} คน`} — ช่วงเวลามาจากวันที่ในไฟล์หรือที่คนแก้
            </p>
            <form className="c-thai mt-2 flex flex-wrap items-end gap-2 text-[0.8rem] text-[var(--c-text-3)]" action={base}>
              <input type="hidden" name="tab" value="people" />
              <label className="flex flex-col gap-1">ดูว่าใครอยู่ ณ วันที่<input type="date" name="asof" defaultValue={asof ?? ""} className="c-input min-h-9 py-1" /></label>
              <button type="submit" className="c-btn c-btn-ghost c-btn-sm">ดู</button>
              {asof && <Link href={`${base}?tab=people`} className="c-btn c-btn-ghost c-btn-sm">ทุกช่วงเวลา</Link>}
            </form>
            {(atDate ?? d.people).length ? (
              <ul className="mt-4 grid gap-0">
                {(atDate ?? [...current, ...former]).map((p) => (
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

            </>}
            {tab === "deals" && (
              <Panel className="p-0">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--c-line)] px-5 py-3">
                  <p className="c-thai text-[0.84rem] text-[var(--c-text-3)]">
                    {num(d.opportunities.length)} ดีล · เปิดอยู่ {baht(d.opportunities.filter((x) => !["won", "lost"].includes(x.stage)).reduce((t, x) => t + (x.value ?? 0), 0))}
                  </p>
                  <Link href={`/app/deals/new?org=${o.id}`} className="c-btn c-btn-primary c-btn-sm">+ ดีล</Link>
                </div>
                {d.opportunities.length ? (
                  <div className="c-scroll px-5 pb-2" tabIndex={0} role="region" aria-label="ดีลของบริษัทนี้">
                    <table className="c-table min-w-[36rem]">
                      <thead><tr><th>ดีล</th><th>ขั้น</th><th className="text-right">มูลค่า</th><th>ปิดคาด</th><th>เจ้าของ</th></tr></thead>
                      <tbody>
                        {d.opportunities.map((x) => (
                          <tr key={x.id}>
                            <td><Link href={`/app/deals/${x.id}`} className="c-thai text-[var(--c-accent)] hover:underline">{x.name}</Link></td>
                            <td className="c-thai text-[0.84rem]">{stageTh(x.stage)}</td>
                            <td className="c-mono text-right">{x.value != null ? baht(x.value) : "—"}</td>
                            <td className="c-thai text-[0.84rem]">{x.expectedClose ? thaiDate(x.expectedClose) : "—"}</td>
                            <td className="c-thai text-[0.84rem]">{x.owner ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <p className="c-thai px-5 py-5 text-[0.88rem] text-[var(--c-text-3)]">ยังไม่มีดีลกับบริษัทนี้</p>}
              </Panel>
            )}

            {tab === "events" && (
              <Panel className="p-5 md:p-6">
                <h2 className="c-h2 text-[var(--c-text)]">งานที่ร่วม</h2>
                <p className="c-thai mt-1 text-[0.82rem] text-[var(--c-text-3)]">จากไฟล์ที่นำเข้า (ชื่องาน · ครั้ง/ปี · บทบาท) — เห็นว่ามาปีไหน ในบทบาทอะไร และหลุดไปตั้งแต่เมื่อไร</p>
                {editions.length ? (
                  <div className="mt-4 grid gap-5">
                    {editions.map((p) => (
                      <div key={p.program}>
                        <h3 className="c-thai text-[0.92rem] font-semibold text-[var(--c-text)]">{p.program}</h3>
                        <ol className="mt-2 flex flex-wrap gap-2">
                          {p.editions.map((e) => (
                            <li key={e.edition} className="c-panel px-3 py-2 text-[0.82rem]">
                              <p className="c-mono font-semibold">{e.edition}</p>
                              <p className="c-thai text-[var(--c-text-3)]">{e.roles.join(" · ")} · {num(e.people)} คน</p>
                            </li>
                          ))}
                        </ol>
                      </div>
                    ))}
                  </div>
                ) : <p className="c-thai mt-3 text-[0.88rem] text-[var(--c-text-3)]">ยังไม่มีข้อมูลการร่วมงาน</p>}
              </Panel>
            )}

            {tab === "group" && (inGroup && group ? <>
              <Panel flat className="grid grid-cols-2 gap-x-6 gap-y-5 p-5 md:grid-cols-4">
                <div><p className="c-thai text-[0.75rem] text-[var(--c-text-4)]">บริษัทในกลุ่ม</p><p className="c-mono text-[1.2rem]">{num(group.totals.orgs)}{group.hidden ? <span className="c-thai text-[0.75rem] text-[var(--c-text-4)]"> +{group.hidden} จำกัดสิทธิ์</span> : null}</p></div>
                <div><p className="c-thai text-[0.75rem] text-[var(--c-text-4)]">คนปัจจุบันทั้งกลุ่ม</p><p className="c-mono text-[1.2rem]">{num(group.totals.current)}</p></div>
                <div><p className="c-thai text-[0.75rem] text-[var(--c-text-4)]">ดีลเปิดทั้งกลุ่ม</p><p className="c-mono text-[1.2rem]">{num(group.totals.openDeals)} · {baht(group.totals.openValue)}</p></div>
                <div><p className="c-thai text-[0.75rem] text-[var(--c-text-4)]">ติดต่อล่าสุดในกลุ่ม</p><p className="c-thai text-[1rem]">{group.totals.lastAt ? thaiDate(group.totals.lastAt) : "ยังไม่เคย"}</p></div>
              </Panel>
              <Panel className="p-0">
                <div className="c-scroll px-5 pb-2" tabIndex={0} role="region" aria-label="บริษัทในเครือ">
                  <table className="c-table min-w-[40rem]">
                    <thead><tr><th>บริษัท</th><th className="text-right">คนปัจจุบัน</th><th className="text-right">ดีลเปิด</th><th className="text-right">มูลค่าเปิด</th><th>ติดต่อล่าสุด</th></tr></thead>
                    <tbody>
                      {group.members.map((m) => (
                        <tr key={m.id}>
                          <td style={{ paddingLeft: `${m.depth * 1.25}rem` }}>
                            {m.depth > 0 && <span aria-hidden className="text-[var(--c-text-4)]">└ </span>}
                            {m.self ? <span className="c-thai font-semibold">{m.name} (บริษัทนี้)</span>
                              : <Link href={`/app/accounts/${m.id}?tab=group`} className="c-thai text-[var(--c-accent)] hover:underline">{m.name}</Link>}
                          </td>
                          <td className="c-mono text-right">{num(m.current)}</td>
                          <td className="c-mono text-right">{num(m.openDeals)}</td>
                          <td className="c-mono text-right">{m.openValue ? baht(m.openValue) : "—"}</td>
                          <td className="c-thai text-[0.84rem]">{m.lastAt ? thaiDate(m.lastAt) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
              <Panel className="p-5 md:p-6">
                <h2 className="c-h2 text-[var(--c-text)]">ใครในทีมรู้จักใครในเครือ</h2>
                {group.knows.length ? (
                  <ul className="c-thai mt-3 grid gap-1.5 text-[0.88rem] text-[var(--c-text-2)]">
                    {group.knows.map((k, i) => (
                      <li key={i}>{k.member} รู้จัก <Link href={`/app/customers/${k.personId}`} className="text-[var(--c-accent)] hover:underline">{k.person}</Link> · <Link href={`/app/accounts/${k.orgId}`} className="hover:text-[var(--c-accent)]">{k.org}</Link></li>
                    ))}
                  </ul>
                ) : <p className="c-thai mt-3 text-[0.88rem] text-[var(--c-text-3)]">ยังไม่มีใครในทีมบันทึกว่ารู้จักคนในเครือนี้</p>}
              </Panel>
            </> : (
              <Panel className="p-5"><p className="c-thai text-[0.88rem] text-[var(--c-text-3)]">บริษัทนี้ยังไม่อยู่ในกลุ่ม — ตั้งบริษัทแม่ได้ในแท็บรายละเอียด</p></Panel>
            ))}

            {tab === "relationships" && <>
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

            </>}
          </div>
        </div>

        {/* ── กิจกรรม: จดโน้ต · บันทึกแบบฟอร์ม · ไทม์ไลน์ (ช่องบันทึกด้านขวาแบบ Salesforce) ── */}
        <aside id="activity" className="grid min-w-0 scroll-mt-28 content-start gap-5">
          {/* ── งานเปิดของบริษัทนี้ (E1) ── */}
          <Panel className="p-4 md:p-5">
            <h2 className="c-h2 text-[var(--c-text)]">งาน <span className="text-[var(--c-text-4)]">({orgTasks.length})</span></h2>
            <div className="mt-3"><TaskList tasks={orgTasks} link={{ orgId: o.id }} showRecord /></div>
            <details className="mt-3">
              <summary className="c-btn c-btn-ghost c-btn-sm inline-flex cursor-pointer list-none">+ งาน</summary>
              <div className="mt-3"><NewTaskForm link={{ orgId: o.id }} team={teamList} people={current.map((p) => ({ id: p.personId, name: p.name }))} compact /></div>
            </details>
          </Panel>
          {/* ── ไทม์ไลน์ ── */}
          <Panel className="p-4 md:p-5">
            <h2 className="c-h2 text-[var(--c-text)]">กิจกรรม</h2>
            <div className="mt-3">
              <div>
                <NoteCapture orgId={o.id} people={d.people.filter((p) => !p.masked).map((p) => ({ personId: p.personId, name: p.name }))
                  .filter((p, i, xs) => xs.findIndex((x) => x.personId === p.personId) === i)} />
              </div>
            </div>
            <details className="mt-3">
              <summary className="c-btn c-btn-ghost inline-flex cursor-pointer">บันทึกการติดต่อแบบฟอร์ม</summary>
              <ActionForm action={logInteractionAction} fields={{ orgId: o.id }} label="บันทึก" pendingLabel="กำลังบันทึก…" variant="primary" className="mt-4 grid gap-3">
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
                <label className={`${LABEL}`}>คุยอะไร
                  <textarea name="summary" rows={3} className="c-input" required />
                </label>
                <label className={`${LABEL}`}>ผล<input name="outcome" className="c-input" /></label>
                <label className={`${LABEL}`}>งานถัดไป (ไม่บังคับ — สร้างเป็นงานให้)<input name="nextTitle" className="c-input" placeholder="เช่น โทรตามผลสัปดาห์หน้า" /></label>
                <label className={`${LABEL}`}>ครบกำหนดงานถัดไป<input type="date" name="nextDue" className="c-input" /></label>
                <label className={LABEL}>ระดับความลับ
                  <select name="classification" className="c-select" defaultValue="confidential">
                    {CLASSIFICATIONS.map((c) => <option key={c} value={c}>{CLASSIFICATION_TH[c]}{c === "restricted_high" ? " (เห็นเฉพาะคุณ · ไม่ส่งให้ AI)" : ""}</option>)}
                  </select>
                </label>
              </ActionForm>
            </details>
            {timeline.length ? (
              <ol className="mt-5 grid gap-0">
                {timeline.slice(0, 30).map((e, i) => (
                  <li key={i} className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 border-t border-[var(--c-line)] py-3 first:border-t-0">
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
        </aside>
      </div>
    </>
  );
}
