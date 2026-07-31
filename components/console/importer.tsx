"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { analyseCsv, commitCsv, repreview } from "@/app/(app)/import-actions";
import type { AnalyseResult } from "@/app/(app)/import-actions";
import type { ColumnMapping, ImportField, ImportPreview } from "@/lib/shared/ingest-types";
import { FIELD_LABEL, IMPORT_FIELDS } from "@/lib/shared/ingest-types";
import { Panel, num } from "./ui";

/* ลากไฟล์วาง → AI แม็ปคอลัมน์ → ยืนยัน → เห็น insight
   ขั้นตอนถูกย่อให้เหลือสามช่อง เพราะเจ้าของร้านต้องทำได้เองโดย
   ไม่มีคนสอน (I6) */

type Step = "drop" | "review" | "done";

export function Importer() {
  const [step, setStep] = useState<Step>("drop");
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [analysis, setAnalysis] = useState<Extract<AnalyseResult, { ok: true }> | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ customers: number; transactions: number; products: number; rejected: number } | null>(null);
  const [replace, setReplace] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    if (file.size > 4_000_000) {
      setError("File is over 4MB — split it and import in parts");
      return;
    }
    const text = await file.text();
    setCsv(text);
    setFileName(file.name);
    start(async () => {
      const res = await analyseCsv(text);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setAnalysis(res);
      setMapping(res.mapping);
      setPreview(res.preview);
      setStep("review");
    });
  }

  function changeField(column: string, field: ImportField) {
    if (!mapping) return;
    const next: ColumnMapping = {
      mappings: mapping.mappings.map((m) =>
        m.column === column ? { ...m, field, confidence: 1, why: "Set by hand" } : m,
      ),
    };
    setMapping(next);
    start(async () => setPreview(await repreview(csv, next)));
  }

  function doCommit() {
    if (!mapping) return;
    setError(null);
    start(async () => {
      const res = await commitCsv(csv, mapping, replace);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setResult(res.result);
      setStep("done");
    });
  }

  function reset() {
    setStep("drop");
    setCsv("");
    setFileName("");
    setAnalysis(null);
    setPreview(null);
    setMapping(null);
    setResult(null);
    setError(null);
  }

  /* ── ขั้นที่ 3 — เสร็จแล้ว ── */
  if (step === "done" && result) {
    return (
      <Panel className="p-6 md:p-8">
        <p className="c-label text-[var(--c-good)]">import complete</p>
        <h2 className="c-h1 mt-3 text-[var(--c-text)]">Ready to use</h2>
        <div className="mt-7 grid grid-cols-2 gap-x-6 gap-y-7 md:grid-cols-4">
          {[
            ["Customers", num(result.customers)],
            ["Transactions", num(result.transactions)],
            ["Products", num(result.products)],
            ["Unusable rows", num(result.rejected)],
          ].map(([k, v]) => (
            <div key={k}>
              <p className="c-label">{k}</p>
              <p className="c-num mt-2 text-[1.7rem] text-[var(--c-text)]">{v}</p>
            </div>
          ))}
        </div>
        <p className="c-thai mt-7 text-[0.85rem] text-[var(--c-text-3)]">
          Each customer's cycle has been computed. Open the Morning Brief to see who to contact first.
        </p>
        <p className="c-thai mt-3 text-[0.8rem] text-[var(--c-warn)]">
          A POS export carries no consent data, so every imported customer starts as
            “no consent” — they will not be messaged or exported until real consent is
            captured. That is a safe default, not a defect.
        </p>
        <div className="mt-8 flex flex-wrap gap-2.5">
          <Link href="/app" className="c-btn c-btn-primary">
            Open the Morning Brief
          </Link>
          <Link href="/app/customers" className="c-btn c-btn-ghost">
            View the base
          </Link>
          <button type="button" onClick={reset} className="c-btn c-btn-ghost">
            Import another file
          </button>
        </div>
      </Panel>
    );
  }

  /* ── ขั้นที่ 2 — ตรวจการแม็ป ── */
  if (step === "review" && analysis && mapping && preview) {
    const blocking = preview.missing.length > 0;
    return (
      <div className="flex flex-col gap-5">
        <Panel className="p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="c-label">step 2 of 3 · review before importing</p>
              <h2 className="c-h2 mt-2.5 text-[var(--c-text)]">{fileName}</h2>
              <p className="c-thai mt-1.5 text-[0.85rem] text-[var(--c-text-3)]">
                {analysis.mappingSource === "fallback"
                  ? `Guessed from header names — ${analysis.mappingNote ?? ""}`
                  : "AI read the headers and sample rows to infer the meaning"}
              </p>
            </div>
            <span
              className={`c-pill ${analysis.mappingSource === "ai" ? "c-pill-good" : analysis.mappingSource === "cache" ? "c-pill-keep" : "c-pill-warn"}`}
            >
              {analysis.mappingSource === "ai"
                ? "Mapped by AI"
                : analysis.mappingSource === "cache"
                  ? "Mapped by AI (cached)"
                  : "Mapped by pattern matching"}
            </span>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-7 md:grid-cols-4">
            {[
              ["Customers found", num(preview.customers)],
              ["Usable rows", `${num(preview.usableRows)}/${num(preview.totalRows)}`],
              ["Products", num(preview.products.length)],
              [
                "Date range",
                preview.dateRange
                  ? `${preview.dateRange.from} → ${preview.dateRange.to}`
                  : "—",
              ],
            ].map(([k, v]) => (
              <div key={k}>
                <p className="c-label">{k}</p>
                <p className="c-num mt-2 text-[1.35rem] text-[var(--c-text)]">{v}</p>
              </div>
            ))}
          </div>

          {blocking && (
            <p className="c-thai mt-6 border-l-2 border-[var(--c-bad)] pl-4 text-[0.85rem] text-[var(--c-bad)]">
              Cannot import yet — a column is still needed for{" "}
              {preview.missing.map((f) => FIELD_LABEL[f]).join(" · ")}
            </p>
          )}
          {!blocking && preview.discountRowShare === 0 && (
            <p className="c-thai mt-6 border-l-2 border-[var(--c-warn)] pl-4 text-[0.85rem] text-[var(--c-warn)]">
              No list-price column found — everything still works, but we cannot tell who
              pays full price and who waits for a discount, which is what REACH uses to
              find new customers.
            </p>
          )}
        </Panel>

        <Panel className="p-5 md:p-6">
          <h3 className="c-h2 text-[var(--c-text)]">Columns in the file</h3>
          <p className="c-thai mt-1.5 text-[0.82rem] text-[var(--c-text-3)]">
            Correct anything it got wrong — the figures above update immediately
          </p>
          <div className="c-scroll mt-5">
            <table className="c-table min-w-[52rem]">
              <thead>
                <tr>
                  <th>Column</th>
                  <th>Sample</th>
                  <th>Mapped to</th>
                  <th>Why</th>
                </tr>
              </thead>
              <tbody>
                {mapping.mappings.map((m) => {
                  const idx = analysis.headers.indexOf(m.column);
                  const samples = analysis.sample
                    .map((r) => r[idx])
                    .filter((v) => v && v.length)
                    .slice(0, 2);
                  return (
                    <tr key={m.column}>
                      <td className="c-mono text-[var(--c-text)]">{m.column}</td>
                      <td className="c-mono text-[0.76rem] text-[var(--c-text-4)]">
                        {samples.length ? samples.join(" · ") : "—"}
                      </td>
                      <td>
                        <select
                          className="c-select"
                          value={m.field}
                          onChange={(e) => changeField(m.column, e.target.value as ImportField)}
                        >
                          {IMPORT_FIELDS.map((f) => (
                            <option key={f} value={f}>
                              {FIELD_LABEL[f]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="c-thai text-[0.78rem]">{m.why}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        {preview.rejected.length > 0 && (
          <Panel className="p-5 md:p-6">
            <h3 className="c-h2 text-[var(--c-text)]">
              Unusable rows ({num(preview.rejected.length)})
            </h3>
            <p className="c-thai mt-1.5 text-[0.82rem] text-[var(--c-text-3)]">
              These rows are skipped with a reason rather than guessed at
            </p>
            <ul className="mt-4 flex flex-col gap-1.5">
              {preview.rejected.slice(0, 10).map((r) => (
                <li key={r.line} className="c-mono text-[0.76rem] text-[var(--c-text-3)]">
                  Line {r.line} — {r.reason}
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {error && (
          <p className="c-thai border-l-2 border-[var(--c-bad)] pl-4 text-[0.85rem] text-[var(--c-bad)]">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={doCommit}
            disabled={pending || blocking}
            className="c-btn c-btn-primary"
          >
            {pending ? "Importing…" : "Import"}
          </button>
          <button type="button" onClick={reset} className="c-btn c-btn-ghost">
            Start over
          </button>
          <label className="c-thai flex items-center gap-2 text-[0.82rem] text-[var(--c-text-2)]">
            <input
              type="checkbox"
              checked={replace}
              onChange={(e) => setReplace(e.target.checked)}
            />
            Replace all existing data
          </label>
        </div>
      </div>
    );
  }

  /* ── ขั้นที่ 1 — ลากไฟล์วาง ── */
  return (
    <div className="flex flex-col gap-5">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f) void handleFile(f);
        }}
        className={`flex flex-col items-center justify-center border-2 border-dashed px-6 py-16 text-center transition-colors ${
          dragging
            ? "border-[var(--c-cyan)] bg-[rgba(53,200,255,0.07)]"
            : "border-[var(--c-line-2)] bg-[rgba(8,16,31,0.5)]"
        }`}
      >
        <p className="c-label">step 1 of 3</p>
        <p className="c-h1 mt-4 text-[var(--c-text)]">Drop your POS export here</p>
        <p className="c-thai mt-3 max-w-lg text-[0.88rem] text-[var(--c-text-3)]">
          CSV from any POS. No column tidying, no deleting blank rows — the headers
            are read and mapped for you.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={pending}
            className="c-btn c-btn-primary"
          >
            {pending ? "Reading…" : "Choose a file"}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.tsv,.txt,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
          />
        </div>
        <p className="c-mono mt-6 text-[0.72rem] text-[var(--c-text-4)]">
          CSV · TSV · up to 4MB
        </p>
      </div>

      {error && (
        <p className="c-thai border-l-2 border-[var(--c-bad)] pl-4 text-[0.85rem] text-[var(--c-bad)]">
          {error}
        </p>
      )}

      <Panel flat className="p-5 md:p-6">
        <p className="c-label">three required columns</p>
        <ul className="mt-4 flex flex-col gap-2.5">
          {[
            ["Customer identifier", "Phone, email or member ID — any one will do"],
            ["Purchase date", "Both Gregorian and Buddhist years are accepted"],
            ["Amount paid", "A list price alongside it is ideal — that reveals who waits for discounts"],
          ].map(([k, v]) => (
            <li key={k} className="c-thai text-[0.84rem] text-[var(--c-text-2)]">
              <span className="text-[var(--c-cyan)]">{k}</span>
              <span className="text-[var(--c-text-4)]"> — {v}</span>
            </li>
          ))}
        </ul>
        <p className="c-thai mt-5 text-[0.8rem] text-[var(--c-text-4)]">
          At least six months of history is required before each customer's cycle can be computed
        </p>
      </Panel>
    </div>
  );
}
