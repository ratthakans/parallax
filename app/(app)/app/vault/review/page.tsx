import Link from "next/link";
import { activeTenantId } from "@/app/(app)/tenant";
import {
  aiAssistAction, confirmBatchAction, decideReviewAction, dismissBatchAction, recordBatchSampleAction, recordSampleAction, resolveNowAction,
  undoBatchAction, unmergeAction,
} from "@/app/(app)/vault-actions";
import { drawSample, sampleStats, type Sample, type SampleRow } from "@/lib/engine/vault/sample";
import {
  BATCH_RULE_TH, BATCH_STATUS_TH, SAMPLE_FROM, batchHistory, batchOverview, dueBatchSamples, examplesOf,
  type BatchRecord, type BatchSample, type ContactRel, type PairFacts, type ProposedBatch,
} from "@/lib/engine/vault/review-batches";
import { listOpenReviews, mergeHistory, reviewCounts, SIGNAL_TH, type OrgSide, type PersonSide, type ReviewItem } from "@/lib/engine/vault/review";
import { vaultOverview } from "@/lib/engine/vault";
import { LIFECYCLE_TH, type LifecycleState } from "@/lib/shared/vault";
import { thaiDate, thaiDateTime } from "@/lib/shared/format";
import { ActionForm } from "@/components/console/action-form";
import { Metric, PageHead, Panel, num, pct } from "@/components/console/ui";

export const dynamic = "force-dynamic";

/* ── คิวตรวจตัวตน (docs/plan.md B3 · Blueprint 2.0 บท 3) ─────────────

   ระบบรวมเองเฉพาะหลักฐานแน่น ที่เหลือมาที่นี่: ชื่อเหมือนในบริษัทเดียวกัน · อีเมล/เบอร์เดียวกันแต่ชื่อต่าง
   · ชื่อบริษัทต่างกันแต่โดเมนเดียวกัน — คนตัดสิน เห็นผลกระทบก่อนกด และย้อนได้จากประวัติด้านล่าง
   ค่าอีเมล/เบอร์แสดงแบบปิดบางเท่านั้น */

const PAGE = 8;
const KIND_TH = { email: "อีเมล", phone: "เบอร์" } as Record<string, string>;
const RESTRICTION_TH: Record<string, string> = { none: "ไม่มีข้อจำกัด", review: "รอตรวจข้อจำกัด", restricted: "จำกัดการใช้", suppressed: "ห้ามติดต่อ" };

function Person({ p, shared }: { p: PersonSide; shared: Set<string> }) {
  return (
    <div className="min-w-0 border border-[var(--c-line)] p-4">
      <p className="c-thai break-words text-[1rem] text-[var(--c-text)]">{p.name}</p>
      <p className="c-thai mt-1 text-[0.75rem] text-[var(--c-text-4)]">
        {LIFECYCLE_TH[p.lifecycle as LifecycleState] ?? p.lifecycle} · เห็นครั้งแรก {thaiDate(p.createdAt)}
        {p.restriction !== "none" && <> · <span className="text-[var(--c-bad)]">{RESTRICTION_TH[p.restriction] ?? p.restriction}</span></>}
      </p>
      <dl className="c-thai mt-3 grid gap-2 text-[0.82rem]">
        <div>
          <dt className="text-[var(--c-text-4)]">ช่องทาง</dt>
          <dd className="mt-0.5">
            {p.contacts.length ? p.contacts.map((c) => (
              <span key={c.hmac} className={`mr-3 inline-block c-mono text-[0.8rem] ${shared.has(c.masked) ? "text-[var(--c-accent)]" : "text-[var(--c-text-2)]"}`}>
                {KIND_TH[c.kind] ?? c.kind} {c.masked}{shared.has(c.masked) ? " ●" : ""}
              </span>
            )) : <span className="text-[var(--c-text-4)]">—</span>}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--c-text-4)]">สังกัด</dt>
          <dd className="mt-0.5 text-[var(--c-text-2)]">
            {p.affiliations.length ? p.affiliations.map((a, i) => (
              <span key={i} className="block">
                {a.org}{a.title ? ` · ${a.title}` : ""}
                <span className="text-[var(--c-text-4)]"> ({thaiDate(a.from)}{a.to ? ` – ${thaiDate(a.to)}` : " – ปัจจุบัน"})</span>
              </span>
            )) : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--c-text-4)]">ที่มา</dt>
          <dd className="mt-0.5 text-[var(--c-text-2)]">
            {p.sources.join(" · ") || "—"} · <span className="c-mono">{num(p.rows)}</span> แถวต้นทาง
            {p.interactions > 0 && <> · ปฏิสัมพันธ์ <span className="c-mono">{num(p.interactions)}</span></>}
            {p.participations > 0 && <> · ร่วมงาน <span className="c-mono">{num(p.participations)}</span></>}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function Org({ o, shared }: { o: OrgSide; shared: Set<string> }) {
  return (
    <div className="min-w-0 border border-[var(--c-line)] p-4">
      <p className="c-thai break-words text-[1rem] text-[var(--c-text)]">{o.name}</p>
      <p className="c-thai mt-2 text-[0.82rem] text-[var(--c-text-2)]">
        โดเมน: {o.domains.length ? o.domains.map((d) => (
          <span key={d} className={`mr-2 c-mono text-[0.8rem] ${shared.has(d) ? "text-[var(--c-accent)]" : ""}`}>{d}</span>
        )) : "—"}
      </p>
      <p className="c-thai mt-1 text-[0.82rem] text-[var(--c-text-3)]">
        คนที่สังกัด <span className="c-mono">{num(o.people)}</span>{o.taxId ? <> · เลขผู้เสียภาษี <span className="c-mono">{o.taxId}</span></> : ""}
      </p>
    </div>
  );
}

function Impact({ item }: { item: ReviewItem }) {
  if (item.kind === "person_pair") {
    const [a, b] = item.people;
    if (!a || !b) return null;
    const keep = a.rows >= b.rows ? a : b;
    const strict = [a.restriction, b.restriction].includes("suppressed") ? "suppressed"
      : [a.restriction, b.restriction].includes("restricted") ? "restricted" : null;
    return (
      <p className="c-thai text-[0.8rem] text-[var(--c-text-3)]">
        ถ้ารวม: เก็บไว้ที่ “{keep.name}” · ย้าย {num(a.rows + b.rows - keep.rows)} แถวต้นทาง
        และช่องทางที่ไม่ซ้ำมาไว้ที่เดียว
        {strict && <> · ข้อจำกัดที่เข้มกว่า ({RESTRICTION_TH[strict]}) มีผลกับคนที่รวมแล้ว</>}
        {" "}· ย้อนได้จากประวัติการรวม
      </p>
    );
  }
  const keep = [...item.orgs].sort((x, y) => y.people - x.people)[0];
  return (
    <p className="c-thai text-[0.8rem] text-[var(--c-text-3)]">
      ถ้ารวม: เก็บเป็น “{keep?.name}” · ย้ายคนที่สังกัด {num(item.orgs.reduce((n, o) => n + o.people, 0) - (keep?.people ?? 0))} คน
      · ไฟล์ที่นำเข้าทีหลังด้วยชื่ออื่นจะชี้มาที่นี่ · บริษัทในเครือที่เป็นนิติบุคคลแยกกัน ให้กด “คนละองค์กร”
    </p>
  );
}

const TH_CELL = "font-sans normal-case tracking-normal text-[0.75rem]";

function SourceRows({ rows, label }: { rows: SampleRow[]; label: string }) {
  return (
    <div className="c-scroll mt-4" tabIndex={0} role="region" aria-label={label}>
      <table className="c-table min-w-[48rem]">
        <thead>
          <tr>{["ไฟล์ · บรรทัด", "ชื่อตามไฟล์", "บริษัท", "ตำแหน่ง", "อีเมล", "เบอร์"].map((h) => <th key={h} className={TH_CELL}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.file}#${r.line}`}>
              <td className="c-mono text-[0.78rem] text-[var(--c-text-3)]">{r.file} · {num(r.line)}</td>
              <td className="c-thai text-[0.84rem]">{r.name || "—"}</td>
              <td className="c-thai text-[0.84rem]">{r.company || "—"}</td>
              <td className="c-thai text-[0.84rem]">{r.title || "—"}</td>
              <td className="c-mono text-[0.8rem]">{r.email || "—"}</td>
              <td className="c-mono text-[0.8rem]">{r.phone || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── ชุดที่ระบบเสนอ (docs/solo-plan.md S5) ─────────────────────
   เหตุผลของชุด · ขนาด · ตัวอย่างสุ่ม 5 คู่ (สุ่มใหม่ได้) · ดูทุกคู่และเอาบางคู่ออกได้ก่อนยืนยัน
   ช่องทางแสดงเป็น "ตรงกัน/ไม่ตรง/ไม่มี" — หน้านี้ไม่ต้องเห็นค่าเพื่อยืนยันทั้งชุด (ค่าปิดบางอยู่ในคิวทีละคู่ด้านล่าง) */
const REL_TH: Record<ContactRel, string> = { match: "ตรงกัน", conflict: "ไม่ตรง", none: "ไม่มี" };
const AI_TH = { same: "AI: คนเดียวกัน", different: "AI: คนละคน", unsure: "AI: ไม่แน่ใจ" } as const;

function Side({ name, title, org }: { name: string; title: string | null; org: string | null }) {
  return (
    <td className="c-thai text-[0.84rem]">
      {name}
      <span className="block text-[0.75rem] text-[var(--c-text-4)]">{[title, org].filter(Boolean).join(" · ") || "—"}</span>
    </td>
  );
}

function PairRows({ pairs, selectable }: { pairs: PairFacts[]; selectable: boolean }) {
  return (
    <div className="c-scroll mt-4" tabIndex={0} role="region" aria-label="คู่ในชุด">
      <table className="c-table min-w-[44rem]">
        <thead>
          <tr>
            {selectable && <th className={TH_CELL}>เอาออก</th>}
            {["ฝั่งหนึ่ง", "อีกฝั่ง", "ช่องทาง"].map((h) => <th key={h} className={TH_CELL}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {pairs.map((f) => (
            <tr key={f.itemId}>
              {selectable && (
                <td>
                  <input type="checkbox" name="exclude" value={f.itemId} aria-label={`เอาคู่ ${f.a.name} – ${f.b.name} ออกจากชุด`} />
                </td>
              )}
              <Side name={f.a.name} title={f.titleA} org={f.orgA} />
              <Side name={f.b.name} title={f.titleB} org={f.orgB} />
              <td className="c-thai text-[0.78rem] text-[var(--c-text-3)]">
                อีเมล {REL_TH[f.email]} · เบอร์ {REL_TH[f.phone]}
                {f.ai && <span className="block">{AI_TH[f.ai.v]}{f.ai.r ? ` — ${f.ai.r}` : ""}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BatchPanel({ b, full }: { b: ProposedBatch; full: boolean }) {
  const n = b.pairs.length;
  const shown = full ? b.pairs : examplesOf(b.pairs, 5);
  return (
    <Panel className="p-5 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="c-thai text-[0.9rem] text-[var(--c-text)]">{BATCH_RULE_TH[b.rule]}</p>
        <p className="c-thai text-[0.8rem] text-[var(--c-text-3)]">
          <span className="c-mono">{num(n)}</span> คู่{b.aiAssisted && " · AI ช่วยตัดสินชื่อ — คุณยืนยันเอง"}
        </p>
      </div>
      <p className="c-thai mt-2 text-[0.78rem] text-[var(--c-text-4)]">
        {full ? "ทุกคู่ในชุด — ติ๊กคู่ที่อยากตรวจทีละคู่ แล้วยืนยันส่วนที่เหลือ" : `ตัวอย่างสุ่ม ${num(shown.length)} คู่จาก ${num(n)} — ทุกคู่ในชุดมีเหตุผลครบทุกข้อด้านบน`}
        {n >= SAMPLE_FROM && ` · ชุดตั้งแต่ ${SAMPLE_FROM} คู่ ระบบสุ่ม 3 คู่ให้ตรวจซ้ำหลัง 7 วัน ถ้าพบผิด ชุดทั้งชุดถูกส่งกลับไปตรวจทีละคู่`}
      </p>
      <ActionForm
        action={confirmBatchAction}
        fields={{ key: b.key, items: JSON.stringify(b.pairs.map((p) => p.itemId)) }}
        label={full ? "ยืนยันคู่ที่ไม่ได้ติ๊กออก — รวมในครั้งเดียว" : `ยืนยันทั้งชุด — รวม ${num(n)} คู่`}
        confirm={full ? "ยืนยัน — รวมคู่ที่เหลือ (ย้อนได้ทั้งชุด)" : `ยืนยันรวม ${num(n)} คู่ (ย้อนได้ทั้งชุด)`}
        pendingLabel="กำลังรวม…"
        variant="primary"
        buttonClassName="mt-4"
      >
        <PairRows pairs={shown} selectable={full} />
      </ActionForm>
      <div className="c-thai mt-3 flex flex-wrap gap-2 text-[0.86rem]">
        {full ? (
          <Link href="/app/vault/review" className="c-btn c-btn-ghost">กลับไปดูทุกชุด</Link>
        ) : (
          <>
            <Link href={`/app/vault/review?batch=${encodeURIComponent(b.key)}`} className="c-btn c-btn-ghost">ดูทุกคู่ / เอาบางคู่ออก</Link>
            <Link href={`/app/vault/review?r=${Date.now()}`} className="c-btn c-btn-ghost">สุ่มตัวอย่างใหม่</Link>
          </>
        )}
        {b.batchId && <ActionForm action={dismissBatchAction} fields={{ batchId: b.batchId }} label="ไม่ใช้ข้อเสนอของ AI" pendingLabel="กำลังบันทึก…" />}
      </div>
    </Panel>
  );
}

function BatchSamplePanel({ samples }: { samples: BatchSample[] }) {
  return (
    <Panel className="p-5 md:p-6">
      <h2 className="c-h2 text-[var(--c-text)]">สุ่มตรวจหลังรวมเป็นชุด</h2>
      <p className="c-thai mt-2 text-[0.82rem] text-[var(--c-text-3)]">
        ระบบสุ่มไว้ตอนยืนยันชุดตั้งแต่ {SAMPLE_FROM} คู่ และครบ 7 วันแล้ว — ทุกแถวเป็นคนเดียวกันจริงไหม · ถ้าพบผิดแม้คนเดียว ชุดทั้งชุดถูกย้อนและส่งกลับไปตรวจทีละคู่
      </p>
      {samples.map((s) => (
        <div key={s.id} className="mt-5 border-t border-[var(--c-line)] pt-4">
          <p className="c-thai text-[1rem] text-[var(--c-text)]">{s.name}</p>
          <p className="c-thai text-[0.75rem] text-[var(--c-text-4)]">จากชุด: {BATCH_RULE_TH[s.rule]}</p>
          <SourceRows rows={s.rows} label={`แถวต้นทางของ ${s.name}`} />
          <div className="mt-3 flex flex-wrap gap-2">
            <ActionForm action={recordBatchSampleAction} fields={{ sampleId: s.id, verdict: "merge_ok" }} label="ถูก — ทุกแถวเป็นคนนี้" pendingLabel="กำลังบันทึก…" variant="primary" />
            <ActionForm action={recordBatchSampleAction} fields={{ sampleId: s.id, verdict: "merge_wrong" }} label="ผิด — มีแถวของคนอื่นปน" confirm="ยืนยัน — ย้อนทั้งชุด" pendingLabel="กำลังส่งชุดกลับ…" />
          </div>
        </div>
      ))}
    </Panel>
  );
}

function BatchHistory({ rows }: { rows: BatchRecord[] }) {
  return (
    <Panel className="mt-8 p-5 md:p-6">
      <h2 className="c-h2 text-[var(--c-text)]">ประวัติชุด</h2>
      <p className="c-thai mt-2 text-[0.82rem] text-[var(--c-text-3)]">
        ย้อนทั้งชุดได้ในกดเดียว: ทุกคู่ในชุดถูกแยกคืน (ช่องทาง · consents · ข้อจำกัด · แถวต้นทาง) แล้วกลับเข้าคิวให้ตรวจทีละคู่
      </p>
      <div className="c-scroll mt-4" tabIndex={0} role="region" aria-label="ตารางประวัติชุด">
        <table className="c-table min-w-[48rem]">
          <thead>
            <tr>{["เหตุผล", "คู่", "สถานะ", "ตัดสินโดย", "เมื่อ", "สุ่มตรวจ", ""].map((h, i) => <th key={i} className={TH_CELL}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="c-thai text-[0.8rem]">{BATCH_RULE_TH[r.rule] ?? r.rule}</td>
                <td className="c-mono text-[0.84rem]">{num(r.size)}</td>
                <td className="c-thai text-[0.8rem]">{BATCH_STATUS_TH[r.status] ?? r.status}</td>
                <td className="c-thai text-[0.8rem]">{r.decidedBy ?? "—"}</td>
                <td className="c-thai text-[0.8rem]">{r.decidedAt ? thaiDateTime(r.decidedAt) : "—"}</td>
                <td className="c-thai text-[0.78rem] text-[var(--c-text-3)]">
                  {r.samplesPending + r.samplesOk + r.samplesWrong ? `ถูก ${r.samplesOk} · ผิด ${r.samplesWrong} · รอ ${r.samplesPending}` : "—"}
                </td>
                <td>
                  {r.status === "confirmed" ? (
                    <ActionForm action={undoBatchAction} fields={{ batchId: r.id }} label="ย้อนทั้งชุด" confirm={`ยืนยันแยกคืน ${num(r.size)} คู่`} pendingLabel="กำลังย้อน…" size="sm" />
                  ) : r.undoneAt ? (
                    <span className="c-thai text-[0.78rem] text-[var(--c-text-4)]">{thaiDateTime(r.undoneAt)}</span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function SamplePanel({ sample, mode }: { sample: Sample | null; mode: "merge" | "missed" }) {
  if (!sample) {
    return (
      <Panel className="p-5 md:p-6">
        <p className="c-thai text-[0.9rem] text-[var(--c-text-3)]">
          {mode === "merge" ? "ไม่มีคนที่รวมจากหลายแถวเหลือให้สุ่มตรวจ" : "ไม่มีคนเหลือให้สุ่มตรวจ"}
        </p>
      </Panel>
    );
  }
  const fields = { customerId: sample.customerId };
  return (
    <Panel className="p-5 md:p-6">
      <p className="c-thai text-[0.8rem] text-[var(--c-text-4)]">ระบบสุ่มให้ — เลือกเองไม่ได้ และคนที่ตรวจแล้วไม่ถูกสุ่มซ้ำ</p>
      <h2 className="c-h2 mt-2 break-words text-[var(--c-text)]">{sample.name}</h2>
      <p className="c-thai mt-2 text-[0.86rem] text-[var(--c-text-2)]">
        {mode === "merge"
          ? `ระบบรวม ${num(sample.rows.length)} แถวนี้เป็นคนเดียวกัน — ทุกแถวเป็นคนนี้จริงไหม`
          : "คนด้านล่างที่ชื่อคล้ายกัน มีใครเป็นคนนี้ซึ่งระบบไม่ได้รวมและไม่ได้ส่งเข้าคิวไหม"}
      </p>
      <SourceRows rows={sample.rows} label="แถวต้นทางของคนที่สุ่มได้" />
      {mode === "missed" && (
        <div className="mt-5">
          <h3 className="c-thai text-[0.86rem] text-[var(--c-text-3)]">ชื่อคล้ายกันในฐาน</h3>
          {sample.candidates.length ? (
            <ul className="c-thai mt-2 grid gap-1 text-[0.86rem] text-[var(--c-text-2)]">
              {sample.candidates.map((c) => <li key={c.id}>{c.name}{c.company ? <span className="text-[var(--c-text-4)]"> · {c.company}</span> : null}</li>)}
            </ul>
          ) : (
            <p className="c-thai mt-2 text-[0.86rem] text-[var(--c-text-4)]">ไม่มีชื่อคล้ายกัน</p>
          )}
        </div>
      )}
      <div className="mt-5 flex flex-wrap gap-2">
        {mode === "merge" ? (
          <>
            <ActionForm action={recordSampleAction} fields={{ ...fields, verdict: "merge_ok" }} label="ถูก — ทุกแถวเป็นคนนี้" pendingLabel="กำลังบันทึก…" variant="primary" />
            <ActionForm action={recordSampleAction} fields={{ ...fields, verdict: "merge_wrong" }} label="ผิด — มีแถวของคนอื่นปน" pendingLabel="กำลังบันทึก…" />
          </>
        ) : (
          <>
            <ActionForm action={recordSampleAction} fields={{ ...fields, verdict: "no_missed" }} label="ไม่มีซ้ำที่หลุด" pendingLabel="กำลังบันทึก…" variant="primary" />
            <ActionForm action={recordSampleAction} fields={{ ...fields, verdict: "missed" }} label="มีคนเดียวกันที่ระบบพลาด" pendingLabel="กำลังบันทึก…" />
          </>
        )}
        <Link href={`/app/vault/review?kind=sample&mode=${mode}&r=${Date.now()}`} className="c-btn c-btn-ghost">ข้ามคนนี้</Link>
      </div>
    </Panel>
  );
}

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ kind?: string; page?: string; mode?: string; batch?: string }> }) {
  const sp = await searchParams;
  const sampling = sp.kind === "sample";
  const mode = sp.mode === "missed" ? "missed" : "merge";
  const kind = sp.kind === "org" ? "org_group" : "person_pair";
  const page = Math.max(1, Number(sp.page) || 1);
  const tenantId = await activeTenantId();
  /* ชุดแสดงเฉพาะแท็บคู่คน หน้าแรก — หน้าถัดไปของคิวทีละคู่ไม่ต้องคำนวณชุดซ้ำ */
  const showBatches = !sampling && kind === "person_pair" && page === 1;
  const [counts, items, history, overview, stats, sample, batchInfo, dueSamples, batches] = await Promise.all([
    reviewCounts(tenantId),
    sampling ? Promise.resolve([]) : listOpenReviews(tenantId, kind, PAGE, (page - 1) * PAGE),
    mergeHistory(tenantId),
    vaultOverview(tenantId),
    sampleStats(tenantId),
    sampling ? drawSample(tenantId, mode) : Promise.resolve(null),
    showBatches ? batchOverview(tenantId) : Promise.resolve(null),
    showBatches ? dueBatchSamples(tenantId) : Promise.resolve([]),
    batchHistory(tenantId),
  ]);
  const focus = sp.batch ? batchInfo?.batches.find((b) => b.key === sp.batch) : undefined;
  const open = kind === "person_pair" ? counts.personOpen : counts.orgOpen;
  const pages = Math.max(1, Math.ceil(open / PAGE));
  const tab = (k: "person" | "org" | "sample", label: string, n: number | null) => {
    const active = sampling ? k === "sample" : k === "sample" ? false : (k === "org") === (kind === "org_group");
    return (
      <Link href={`/app/vault/review${k === "person" ? "" : `?kind=${k}`}`} aria-current={active ? "page" : undefined}
        className={`c-thai inline-block border-b-2 px-1 py-2.5 text-[0.9rem] ${active ? "border-[var(--c-accent)] text-[var(--c-text)]" : "border-transparent text-[var(--c-text-3)] hover:text-[var(--c-text)]"}`}>
        {label}{n != null && <> <span className="c-mono">{num(n)}</span></>}
      </Link>
    );
  };

  return (
    <>
      <PageHead
        label="ข้อมูล"
        title="ตรวจข้อมูลซ้ำ"
        lead="ระบบรวมเองเฉพาะหลักฐานแน่น (อีเมลหรือเบอร์เดียวกันและชื่อไม่ขัดกัน) — ชื่อเหมือนกัน โดเมนเดียวกัน หรือบริษัทในเครือ มาให้คนตัดสินที่นี่ และการรวมทุกครั้งย้อนได้"
        actions={overview.pendingReview > 0 ? (
          <ActionForm action={resolveNowAction} label={`ตรวจตัวตน ${num(overview.pendingReview)} แถวที่รออยู่`} pendingLabel="กำลังตรวจ…" variant="primary" />
        ) : undefined}
      />

      <Panel flat className="mb-6 grid grid-cols-2 gap-x-6 gap-y-7 p-5 md:grid-cols-4 md:p-6">
        <Metric label="คู่คนรอตรวจ" value={num(counts.personOpen)} tone={counts.personOpen ? "plain" : "muted"} />
        <Metric label="กลุ่มองค์กรรอตรวจ" value={num(counts.orgOpen)} tone={counts.orgOpen ? "plain" : "muted"} />
        <Metric
          label="รวมผิด (จากการสุ่มตรวจ)"
          value={stats.precision == null ? "ยังไม่ได้วัด" : pct((1 - stats.precision) * 100)}
          sub={`ตรวจแล้ว ${num(stats.mergeChecked)} คน${stats.mergeChecked && stats.mergeChecked < 30 ? " · ตัวอย่างยังน้อย" : ""}`}
          tone={stats.precision == null ? "muted" : "plain"}
          size={stats.precision == null ? "sm" : "md"}
        />
        <Metric
          label="ซ้ำที่หลุด (จากการสุ่มตรวจ)"
          value={stats.missRate == null ? "ยังไม่ได้วัด" : pct(stats.missRate * 100)}
          sub={`ตรวจแล้ว ${num(stats.missedChecked)} คน${stats.missedChecked && stats.missedChecked < 30 ? " · ตัวอย่างยังน้อย" : ""}`}
          tone={stats.missRate == null ? "muted" : "plain"}
          size={stats.missRate == null ? "sm" : "md"}
        />
      </Panel>

      <nav className="mb-5 flex gap-6 border-b border-[var(--c-line)]" aria-label="ประเภทคิว">
        {tab("person", "คู่คนที่อาจเป็นคนเดียวกัน", counts.personOpen)}
        {tab("org", "ชื่อองค์กรที่อาจเป็นที่เดียวกัน", counts.orgOpen)}
        {tab("sample", "สุ่มตรวจ", null)}
      </nav>

      {sampling ? (
        <>
          <nav className="c-thai mb-4 flex flex-wrap gap-2 text-[0.86rem]" aria-label="แบบการสุ่มตรวจ">
            <Link href="/app/vault/review?kind=sample&mode=merge" aria-current={mode === "merge" ? "page" : undefined}
              className={`c-btn ${mode === "merge" ? "c-btn-primary" : "c-btn-ghost"}`}>ตรวจการรวม (รวมผิดไหม)</Link>
            <Link href="/app/vault/review?kind=sample&mode=missed" aria-current={mode === "missed" ? "page" : undefined}
              className={`c-btn ${mode === "missed" ? "c-btn-primary" : "c-btn-ghost"}`}>ตรวจซ้ำที่หลุด</Link>
          </nav>
          <SamplePanel sample={sample} mode={mode} />
        </>
      ) : null}

      {batchInfo && (dueSamples.length > 0 || batchInfo.batches.length > 0 || batchInfo.aiCandidates > 0) && (
        <section className="mb-8 grid gap-5 [&>*]:min-w-0" aria-label="ชุดที่ระบบเสนอ">
          {dueSamples.length > 0 && <BatchSamplePanel samples={dueSamples} />}
          {batchInfo.batches.length > 0 && (
            <div>
              <h2 className="c-h2 text-[var(--c-text)]">ยืนยันเป็นชุด</h2>
              <p className="c-thai mt-1 text-[0.82rem] text-[var(--c-text-3)]">
                คู่ที่มีเหตุผลเดียวกันครบทุกข้อ จัดเป็นชุดให้ยืนยันทีเดียว · ชื่อเหมือน + โดเมนเดียวกันอย่างเดียวไม่ถูกจัดเป็นชุด ต้องตรวจทีละคู่ด้านล่าง
              </p>
            </div>
          )}
          {focus ? <BatchPanel b={focus} full /> : batchInfo.batches.map((b) => <BatchPanel key={b.key} b={b} full={false} />)}
          {batchInfo.aiCandidates > 0 && (
            <Panel flat className="p-5 md:p-6">
              {batchInfo.ai.allowed ? (
                <ActionForm
                  action={aiAssistAction}
                  label={`ให้ AI ช่วยดู ${num(batchInfo.aiCandidates)} คู่ที่ชื่อสะกดต่างหรือตำแหน่งเขียนต่าง`}
                  pendingLabel="AI กำลังดู…"
                  note={
                    <p className="c-thai text-[0.78rem] text-[var(--c-text-4)]">
                      ส่งให้ AI เฉพาะชื่อ ตำแหน่ง ชื่อบริษัท และ “ตรงกัน/ไม่ตรง/ไม่มี” ของอีเมลและเบอร์ — ไม่ส่งอีเมลหรือเบอร์จริง · AI เสนอเป็นชุดได้อย่างเดียว คุณยืนยันเอง
                    </p>
                  }
                />
              ) : (
                <p className="c-thai text-[0.86rem] text-[var(--c-text-3)]">
                  {batchInfo.ai.reason} — {num(batchInfo.aiCandidates)} คู่ที่ชื่อสะกดต่างต้องตรวจทีละคู่ด้านล่าง
                </p>
              )}
            </Panel>
          )}
          <h2 className="c-h2 text-[var(--c-text)]">ตรวจทีละคู่</h2>
        </section>
      )}

      {sampling ? null : items.length ? (
        <div className="grid gap-5">
          {items.map((it) => {
            const shared = new Set(it.shared);
            const isPerson = it.kind === "person_pair";
            return (
              <Panel key={it.id} className="p-5 md:p-6">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <p className="c-thai text-[0.86rem] text-[var(--c-text-2)]">
                    {it.signals.map((s) => SIGNAL_TH[s] ?? s).join(" · ")}
                  </p>
                  <p className="c-thai text-[0.75rem] text-[var(--c-text-4)]">
                    ความมั่นใจของกฎ <span className="c-mono">{Math.round(it.confidence * 100)}%</span> — ไม่ใช่ความแม่นที่วัดแล้ว
                  </p>
                </div>
                <div className={`mt-4 grid gap-3 ${isPerson ? "md:grid-cols-2" : "md:grid-cols-2 xl:grid-cols-3"}`}>
                  {isPerson
                    ? it.people.map((p) => <Person key={p.id} p={p} shared={shared} />)
                    : it.orgs.map((o) => <Org key={o.id} o={o} shared={shared} />)}
                </div>
                <div className="mt-4"><Impact item={it} /></div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <ActionForm action={decideReviewAction} fields={{ reviewId: it.id, verdict: "same" }}
                    label={isPerson ? "คนเดียวกัน — รวม" : "ที่เดียวกัน — รวม"} pendingLabel="กำลังรวม…" variant="primary" />
                  <ActionForm action={decideReviewAction} fields={{ reviewId: it.id, verdict: "different" }}
                    label={isPerson ? "คนละคน" : "คนละองค์กร"} pendingLabel="กำลังบันทึก…" />
                </div>
              </Panel>
            );
          })}
          {pages > 1 && (
            <nav className="c-thai flex items-center gap-4 text-[0.86rem]" aria-label="หน้าของคิว">
              {page > 1 && <Link className="c-btn c-btn-ghost" href={`/app/vault/review?${kind === "org_group" ? "kind=org&" : ""}page=${page - 1}`}>ก่อนหน้า</Link>}
              <span className="text-[var(--c-text-3)]">หน้า {num(page)} / {num(pages)}</span>
              {page < pages && <Link className="c-btn c-btn-ghost" href={`/app/vault/review?${kind === "org_group" ? "kind=org&" : ""}page=${page + 1}`}>ถัดไป</Link>}
            </nav>
          )}
        </div>
      ) : (
        <Panel className="p-5 md:p-6">
          <p className="c-thai text-[0.9rem] text-[var(--c-text-3)]">
            {open ? "ไม่มีรายการในหน้านี้" : "ไม่มีรายการรอตรวจ — นำเข้าไฟล์ที่หน้าแหล่งข้อมูล แล้วระบบจะเสนอคู่ที่ต้องให้คนตัดสินที่นี่"}
          </p>
        </Panel>
      )}

      <Panel className="mt-8 p-5 md:p-6">
        <h2 className="c-h2 text-[var(--c-text)]">ประวัติการรวม</h2>
        <p className="c-thai mt-2 text-[0.82rem] text-[var(--c-text-3)]">
          แยกคืนได้ทุกรายการ: สร้างฝั่งที่ถูกรวมกลับมา ย้ายแถวที่ย้ายตอนรวมกลับไป และจำไว้ว่าไม่ใช่คนเดียวกัน
        </p>
        {history.length ? (
          <div className="c-scroll mt-4" tabIndex={0} role="region" aria-label="ตารางประวัติการรวม">
            <table className="c-table min-w-[44rem]">
              <thead>
                <tr>
                  {["รวมเข้า", "ที่ถูกรวม", "ย้าย", "ตัดสินโดย", "เมื่อ", ""].map((h, i) => (
                    <th key={i} className="font-sans normal-case tracking-normal text-[0.75rem]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((m) => (
                  <tr key={m.id}>
                    <td className="c-thai text-[0.84rem]">{m.survivorName}</td>
                    <td className="c-thai text-[0.84rem]">{m.mergedName}</td>
                    <td className="c-mono text-[0.84rem]">{num(m.moved)}</td>
                    <td className="c-thai text-[0.8rem]">{m.decidedBy}</td>
                    <td className="c-thai text-[0.8rem]">{thaiDateTime(m.decidedAt)}</td>
                    <td>
                      {m.undoneAt ? (
                        <span className="c-thai text-[0.78rem] text-[var(--c-text-4)]">แยกคืนแล้ว {thaiDateTime(m.undoneAt)}</span>
                      ) : (
                        <ActionForm action={unmergeAction} fields={{ mergeId: m.id }} label="แยกคืน" confirm="ยืนยันแยกคืน" pendingLabel="กำลังแยก…" size="sm" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="c-thai mt-4 text-[0.86rem] text-[var(--c-text-3)]">ยังไม่มีการรวม</p>
        )}
      </Panel>

      {batches.length > 0 && <BatchHistory rows={batches} />}
    </>
  );
}
