"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { analyseUploadAction, commitUploadAction, type CommitWithResolve } from "@/app/(app)/vault-actions";
import type { AnalyseOk } from "@/lib/engine/vault/intake";
import { IMPORT_ROW_TH, VAULT_FIELD_TH, type ImportRowStatus, type VaultField } from "@/lib/shared/vault";
import { Panel, num } from "./ui";

/* ── นำเข้าไฟล์เข้าแหล่งหนึ่งแหล่ง (docs/plan.md B2) ───────────────────

   เลือกไฟล์ → เซิร์ฟเวอร์ตรวจไฟล์และอ่านเป็นตาราง → เสนอการจับคู่ → ผู้ใช้ยืนยัน → บันทึกผลรายแถว
   ไฟล์อยู่ที่เบราว์เซอร์ระหว่างสองขั้นและถูกส่งซ้ำตอนยืนยัน — เซิร์ฟเวอร์ไม่เก็บอะไรจนกว่าจะกดยืนยัน */

const STATUS_ORDER: ImportRowStatus[] = ["pending_review", "rejected", "suspended", "accepted"];

export function VaultImporter({ sourceId, allowed }: { sourceId: string; allowed: VaultField[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<AnalyseOk | null>(null);
  const [mapping, setMapping] = useState<Record<number, string>>({});
  const [result, setResult] = useState<Extract<CommitWithResolve, { ok: true }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setFile(null);
    setAnalysis(null);
    setMapping({});
    setResult(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function analyse(f: File) {
    setError(null);
    setResult(null);
    setFile(f);
    const fd = new FormData();
    fd.set("sourceId", sourceId);
    fd.set("file", f);
    start(async () => {
      const res = await analyseUploadAction(fd);
      if (!res.ok) {
        setAnalysis(null);
        setError(res.error);
        return;
      }
      setAnalysis(res);
      setMapping(Object.fromEntries(res.columns.map((c) => [c.index, c.field])));
    });
  }

  function commit() {
    if (!file || !analysis) return;
    const fd = new FormData();
    fd.set("sourceId", sourceId);
    fd.set("file", file);
    fd.set("sha256", analysis.sha256);
    fd.set("mapping", JSON.stringify(mapping));
    start(async () => {
      const res = await commitUploadAction(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setResult(res);
      setAnalysis(null);
    });
  }

  if (result) {
    return (
      <Panel className="p-5 md:p-6">
        <h3 className="c-h2 text-[var(--c-text)]">บันทึกแล้ว {num(result.total)} แถว</h3>
        <ul className="c-thai mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[0.88rem] text-[var(--c-text-2)]">
          {STATUS_ORDER.filter((s) => result.counts[s]).map((s) => (
            <li key={s}>{IMPORT_ROW_TH[s]} <span className="c-mono">{num(result.counts[s])}</span></li>
          ))}
        </ul>
        {result.resolved ? (
          <p className="c-thai mt-3 text-[0.86rem] text-[var(--c-text-2)]">
            ตรวจตัวตนแล้ว: <span className="c-mono">{num(result.resolved.people)}</span> คน
            (ใหม่ <span className="c-mono">{num(result.resolved.newPeople)}</span> · ตรงกับคนเดิม <span className="c-mono">{num(result.resolved.matchedExisting)}</span>)
            · <span className="c-mono">{num(result.resolved.orgs)}</span> องค์กร
            {result.resolved.personPairs + result.resolved.orgGroups > 0 && (
              <> · เข้าคิวให้คนตรวจ <span className="c-mono">{num(result.resolved.personPairs)}</span> คู่
              {result.resolved.orgGroups > 0 && <> และ <span className="c-mono">{num(result.resolved.orgGroups)}</span> กลุ่มองค์กร</>}</>
            )}
          </p>
        ) : (
          <p className="c-thai mt-3 text-[0.82rem] text-[var(--c-bad)]">
            ตรวจตัวตนไม่สำเร็จ{result.resolveError ? ` (${result.resolveError})` : ""} — แถวยังรอตรวจ สั่งตรวจใหม่ได้ที่หน้าคิวตรวจตัวตน
          </p>
        )}
        <p className="c-thai mt-2 text-[0.8rem] text-[var(--c-text-4)]">
          ชื่อเหมือนหรือโดเมนเดียวกันไม่ถูกรวมเอง — ระบบส่งเข้าคิวให้คนตัดสิน และการรวมทุกครั้งย้อนได้
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={`/app/vault/batches/${result.batchId}`} className="c-btn c-btn-primary">ดูรายงานตรวจยอด</Link>
          {result.resolved && result.resolved.personPairs + result.resolved.orgGroups > 0 && (
            <Link href="/app/vault/review" className="c-btn c-btn-ghost">ไปที่คิวตรวจ</Link>
          )}
          <button type="button" onClick={reset} className="c-btn c-btn-ghost">นำเข้าไฟล์อื่น</button>
        </div>
      </Panel>
    );
  }

  return (
    <Panel className="p-5 md:p-6">
      <h3 className="c-h2 text-[var(--c-text)]">นำเข้าไฟล์</h3>
      <p className="c-thai mt-2 text-[0.84rem] text-[var(--c-text-3)]">
        รับ .xlsx หรือ .csv ไม่เกิน 5MB · ไฟล์ที่มีมาโครไม่รับ · ระบบตรวจไฟล์ก่อนอ่านเนื้อใน
      </p>
      <input
        ref={inputRef}
        type="file"
        aria-label="เลือกไฟล์ .xlsx หรือ .csv เพื่อนำเข้า"
        accept=".xlsx,.csv,.txt"
        className="c-thai mt-4 block text-[0.86rem] text-[var(--c-text-2)]"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) analyse(f);
        }}
        disabled={pending}
      />
      {pending && <p className="c-thai mt-3 text-[0.84rem] text-[var(--c-text-3)]" role="status">กำลังตรวจไฟล์…</p>}
      {error && <p className="c-thai mt-3 text-[0.86rem] text-[var(--c-bad)]" role="alert">{error}</p>}

      {analysis && (
        <div className="mt-5">
          <p className="c-thai text-[0.84rem] text-[var(--c-text-2)]">
            {analysis.filename} · {num(analysis.rows)} แถว · {analysis.encoding === "xlsx" ? `ชีต "${analysis.sheet}"` : analysis.encoding}
            {analysis.otherSheets?.length ? ` · ไม่ได้อ่านชีต ${analysis.otherSheets.join(", ")}` : ""}
          </p>
          <p className="c-thai mt-1 text-[0.78rem] text-[var(--c-text-4)]">
            {analysis.scanEngine === "clamav" ? "สแกนมัลแวร์ผ่าน" : analysis.scanNote}
            {analysis.mappingSource === "ai"
              ? " · การจับคู่เสนอโดย Claude (ส่งเฉพาะชื่อคอลัมน์และชนิดของค่า)"
              : " · จับคู่คอลัมน์ด้วยกฎของระบบ — ตรวจทุกคอลัมน์ก่อนยืนยัน"}
          </p>
          {analysis.duplicateOf && (
            <p className="c-thai mt-3 text-[0.86rem] text-[var(--c-warn)]" role="alert">
              ไฟล์นี้นำเข้าแล้ว — <Link href={`/app/vault/batches/${analysis.duplicateOf.batchId}`} className="underline">ดูผลของชุดเดิม</Link>
            </p>
          )}

          <div className="c-scroll mt-4">
            <table className="c-table min-w-[36rem]">
              <thead>
                <tr>
                  <th className="font-sans normal-case tracking-normal text-[0.75rem]">คอลัมน์ในไฟล์</th>
                  <th className="font-sans normal-case tracking-normal text-[0.75rem]">เก็บเป็น</th>
                </tr>
              </thead>
              <tbody>
                {analysis.columns.map((c) => (
                  <tr key={c.index}>
                    <td className="c-thai text-[0.86rem]">{c.header || <em className="text-[var(--c-text-4)]">ไม่มีชื่อคอลัมน์</em>}</td>
                    <td>
                      <select
                        className="c-select"
                        aria-label={`เก็บคอลัมน์ ${c.header} เป็น`}
                        value={mapping[c.index] ?? "ignore"}
                        disabled={Boolean(c.dropped && /PDPA/.test(c.dropped))}
                        onChange={(e) => setMapping({ ...mapping, [c.index]: e.target.value })}
                      >
                        <option value="ignore">ไม่เก็บ</option>
                        {allowed.map((f) => <option key={f} value={f}>{VAULT_FIELD_TH[f]}</option>)}
                      </select>
                      {c.dropped && <span className="c-thai mt-1 block text-[0.75rem] text-[var(--c-text-4)]">{c.dropped}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="c-thai mt-4 text-[0.84rem] text-[var(--c-text-2)]">
            ประมาณจากการจับคู่ที่เสนอ: รอตรวจ {num(analysis.estimate.pending_review)} · ถูกปฏิเสธ {num(analysis.estimate.rejected)}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="c-btn c-btn-primary" onClick={commit} disabled={pending || Boolean(analysis.duplicateOf)}>
              {pending ? "กำลังบันทึก…" : "ยืนยันและบันทึก"}
            </button>
            <button type="button" className="c-btn c-btn-ghost" onClick={reset} disabled={pending}>ยกเลิก</button>
          </div>
        </div>
      )}
    </Panel>
  );
}
