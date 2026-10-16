"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { analyseCsv, commitCsv, repreview } from "@/app/(app)/import-actions";
import type { AnalyseResult } from "@/app/(app)/import-actions";
import type { ColumnMapping, ImportField, ImportPreview } from "@/lib/shared/ingest-types";
import { FIELD_LABEL, IMPORT_FIELD_GROUPS } from "@/lib/shared/ingest-types";
import { Panel, num } from "./ui";
import { thaiDate } from "@/lib/shared/format";

/* ลากไฟล์วาง → AI แม็ปคอลัมน์ → ยืนยัน → เห็น insight
   ขั้นตอนถูกย่อให้เหลือสามช่อง เพราะเจ้าของร้านต้องทำได้เองโดย
   ไม่มีคนสอน (I6) */

type Step = "drop" | "review" | "done";

/* ── อ่านไฟล์ให้ถูกรหัสอักษร ──
   Excel บน Windows ภาษาไทยบันทึก CSV เป็น Windows-874 (TIS-620) ไม่ใช่ UTF-8
   file.text() อ่านเป็น UTF-8 เสมอ ชื่อลูกค้าทั้งไฟล์จึงกลายเป็น "�����"
   และ "Unicode Text" ของ Excel คือ UTF-16 — ดูจาก BOM แล้วถอดให้ถูกตัว */
async function readText(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder("utf-16le").decode(buf);
  if (buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder("utf-16be").decode(buf);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("windows-874").decode(buf);
  }
}

export function Importer() {
  const [step, setStep] = useState<Step>("drop");
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [analysis, setAnalysis] = useState<Extract<AnalyseResult, { ok: true }> | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ customers: number; transactions: number; contactPoints: number; products: number; rejected: number; consented?: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [consentAll, setConsentAll] = useState(false);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    if (file.size > 4_000_000) {
      setError("ไฟล์มีขนาดเกิน 4MB กรุณาแบ่งไฟล์แล้วนำเข้าทีละส่วน");
      return;
    }
    const text = await readText(file);
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
        m.column === column ? { ...m, field, confidence: 1, why: "เลือกด้วยตนเอง" } : m,
      ),
    };
    setMapping(next);
    start(async () => setPreview(await repreview(csv, next)));
  }

  function doCommit() {
    if (!mapping) return;
    setError(null);
    start(async () => {
      const res = await commitCsv(csv, mapping, { consentAll });
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
        <p className="c-label-th text-[var(--c-good)]">นำเข้าเสร็จแล้ว</p>
        <h2 className="c-h1 mt-3 text-[var(--c-text)]">พร้อมใช้งาน</h2>
        <div className="mt-7 grid grid-cols-2 gap-x-6 gap-y-7 md:grid-cols-4">
          {[
            ["ลูกค้า", num(result.customers)],
            ["ช่องทางติดต่อ", num(result.contactPoints)],
            ["รายการซื้อ", num(result.transactions)],
            ["สินค้า", num(result.products)],
            ["แถวที่ใช้ไม่ได้", num(result.rejected)],
          ].map(([k, v]) => (
            <div key={k}>
              <p className="c-label">{k}</p>
              <p className="c-num mt-2 text-[1.7rem] text-[var(--c-text)]">{v}</p>
            </div>
          ))}
        </div>
        <p className="c-thai mt-7 text-[0.85rem] text-[var(--c-text-3)]">
          ระบบคำนวณวงจรของลูกค้าแต่ละคนแล้ว เปิดบรีฟเช้าเพื่อดูว่าควรติดต่อลูกค้าคนใดก่อน
        </p>
        {!(result.consented ?? 0) && (
          <p className="c-thai mt-3 text-[0.8rem] text-[var(--c-warn)]">
            ไฟล์จาก POS ไม่มีข้อมูลความยินยอม ลูกค้าที่นำเข้าจึงเริ่มต้นด้วยสถานะ
            “ยังไม่ได้ให้ความยินยอม” และจะไม่ถูกส่งข้อความหรือส่งออกจากระบบ
            จนกว่าจะบันทึกความยินยอมจริง นี่คือค่าเริ่มต้นเพื่อความปลอดภัย
          </p>
        )}
        {(result.consented ?? 0) > 0 && (
          <p className="c-thai mt-3 text-[0.85rem] text-[var(--c-good)]">
            บันทึกความยินยอมจากไฟล์นี้ {num(result.consented ?? 0)} คน — คนเหล่านี้เข้าเกณฑ์ของบรีฟแล้ว
          </p>
        )}
        <div className="mt-8 flex flex-wrap gap-2.5">
          <Link href="/app" className="c-btn c-btn-primary">
            เปิดบรีฟเช้า
          </Link>
          <Link href="/app/customers" className="c-btn c-btn-ghost">
            ดูฐานลูกค้า
          </Link>
          <button type="button" onClick={reset} className="c-btn c-btn-ghost">
            นำเข้าไฟล์อื่น
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
              <p className="c-label-th">ขั้นที่ 2 จาก 3 · ตรวจสอบก่อนนำเข้า</p>
              <h2 className="c-h2 mt-2.5 text-[var(--c-text)]">{fileName}</h2>
              <p className="c-thai mt-1.5 text-[0.85rem] text-[var(--c-text-3)]">
                {analysis.mappingSource === "fallback"
                  ? `คาดเดาจากชื่อหัวคอลัมน์ — ${analysis.mappingNote ?? ""}`
                  : "AI อ่านหัวคอลัมน์และแถวตัวอย่างเพื่อทำความเข้าใจข้อมูล"}
              </p>
            </div>
            <span
              className={`c-pill ${analysis.mappingSource === "ai" ? "c-pill-good" : analysis.mappingSource === "cache" ? "c-pill-keep" : "c-pill-warn"}`}
            >
              {analysis.mappingSource === "ai"
                ? "จับคู่ด้วย AI"
                : analysis.mappingSource === "cache"
                  ? "จับคู่ด้วย AI (จากแคช)"
                  : "จับคู่จากรูปแบบข้อมูล"}
            </span>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-7 md:grid-cols-4">
            {[
              ["ลูกค้าที่พบ", num(preview.customers)],
              ["ช่องทางติดต่อ", num(preview.contactPoints)],
              ["แถวที่ใช้ได้", `${num(preview.usableRows)}/${num(preview.totalRows)}`],
              ["สินค้า", num(preview.products.length)],
              [
                "ช่วงวันที่",
                preview.dateRange
                  ? `${thaiDate(preview.dateRange.from)} → ${thaiDate(preview.dateRange.to)}`
                  : "—",
              ],
            ].map(([k, v]) => (
              <div key={k}>
                <p className="c-label">{k}</p>
                <p className="c-num mt-2 text-[1.35rem] text-[var(--c-text)]">{v}</p>
              </div>
            ))}
          </div>

          {/* ── สิ่งที่ระบบจะทำกับไฟล์นี้ ก่อนกดนำเข้า ── */}
          {preview.transactions > 0 && (
            <p className="c-thai mt-6 text-[0.86rem] text-[var(--c-text-2)]">
              นับเป็นการซื้อ {num(preview.transactions)} ครั้ง จาก {num(preview.usableRows)} แถว —
              {mapping.mappings.some((m) => m.field === "order_id")
                ? " หลายแถวที่เลขบิลเดียวกันนับเป็นการซื้อครั้งเดียว"
                : " ไม่มีคอลัมน์เลขที่บิล หลายแถวของคนเดียวกันในวันเดียวกันจึงนับเป็นการซื้อครั้งเดียว"}
              {preview.dateOrder === "mdy" && " · วันที่ในไฟล์นี้เขียนแบบ เดือน/วัน/ปี (Excel ภาษาอังกฤษ)"}
            </p>
          )}
          {preview.cancelledRows > 0 && (
            <p className="c-thai mt-2 text-[0.86rem] text-[var(--c-text-2)]">
              ข้าม {num(preview.cancelledRows)} แถวที่ถูกยกเลิกหรือคืนเงิน — ไม่นับเป็นยอดขาย
            </p>
          )}
          {preview.rejectedRows > 0 && (
            <details className="mt-2">
              <summary className="c-thai cursor-pointer text-[0.86rem] text-[var(--c-warn)]">
                ใช้ไม่ได้ {num(preview.rejectedRows)} แถว — ดูเหตุผล
              </summary>
              <ul className="c-thai mt-2 flex flex-col gap-1 text-[0.8rem] text-[var(--c-text-3)]">
                {preview.rejected.map((r) => (
                  <li key={r.line}>แถว {num(r.line)}: {r.reason}</li>
                ))}
              </ul>
            </details>
          )}

          <div className="mt-6 border-l-2 border-[var(--c-line-2)] pl-4">
            <p className="c-thai text-[0.86rem] text-[var(--c-text-2)]">
              {preview.consent.yes + preview.consent.no > 0
                ? `คอลัมน์ความยินยอม: ยินยอม ${num(preview.consent.yes)} คน · ไม่ยินยอม ${num(preview.consent.no)} คน — คนที่ไม่ระบุยังถือว่าไม่ยินยอม`
                : "ไฟล์นี้ไม่มีคอลัมน์ความยินยอม ทุกคนจะเริ่มที่ \"ยังไม่ยินยอม\" และระบบจะไม่เสนอให้ส่งข้อความหา"}
            </p>
            <label className="c-thai mt-3 flex items-start gap-2.5 text-[0.86rem] text-[var(--c-text)]">
              <input
                type="checkbox"
                checked={consentAll}
                onChange={(e) => setConsentAll(e.target.checked)}
                className="mt-1"
              />
              <span>
                ทุกคนในไฟล์นี้ให้ความยินยอมรับข่าวสารจากร้านแล้ว
                <span className="block text-[0.78rem] text-[var(--c-text-4)]">
                  เช่น รายชื่อสมาชิกที่สมัครผ่านฟอร์มที่มีข้อความขอความยินยอม — ระบบบันทึกว่าคุณเป็นคนยืนยัน
                  และไม่ทับคนที่เคยถอนความยินยอมไว้แล้ว
                </span>
              </span>
            </label>
          </div>

          {blocking && (
            <p className="c-thai mt-6 border-l-2 border-[var(--c-bad)] pl-4 text-[0.85rem] text-[var(--c-bad)]">
              ยังนำเข้าไม่ได้ — ต้องระบุคอลัมน์สำหรับ{" "}
              {preview.missing.map((f) => FIELD_LABEL[f]).join(" · ")}
            </p>
          )}
          {!blocking && preview.discountRowShare === 0 && (
            <p className="c-thai mt-6 border-l-2 border-[var(--c-warn)] pl-4 text-[0.85rem] text-[var(--c-warn)]">
              ไม่พบคอลัมน์ราคาเต็ม ระบบส่วนอื่นยังทำงานได้ แต่จะยังแยกไม่ได้ว่าใคร
              ซื้อราคาเต็มและใครรอส่วนลด ซึ่งเป็นข้อมูลที่ใช้หากลุ่มลูกค้าใหม่
            </p>
          )}
        </Panel>

        <Panel className="p-5 md:p-6">
          <h3 className="c-h2 text-[var(--c-text)]">คอลัมน์ในไฟล์</h3>
          <p className="c-thai mt-1.5 text-[0.82rem] text-[var(--c-text-3)]">
            แก้จุดที่จับคู่ไม่ถูกต้องได้ทันที ตัวเลขด้านบนจะอัปเดตตาม
          </p>
          <div className="c-scroll mt-5">
            <table className="c-table min-w-[52rem]">
              <thead>
                <tr>
                  <th>คอลัมน์</th>
                  <th>ตัวอย่าง</th>
                  <th>จับคู่กับ</th>
                  <th>เหตุผล</th>
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
                          <option value="ignore">{FIELD_LABEL.ignore}</option>
                          {IMPORT_FIELD_GROUPS.map((g) => (
                            <optgroup key={g.label} label={g.label}>
                              {g.fields.map((f) => (
                                <option key={f} value={f}>
                                  {FIELD_LABEL[f]}
                                </option>
                              ))}
                            </optgroup>
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
              แถวที่ใช้ไม่ได้ ({num(preview.rejected.length)})
            </h3>
            <p className="c-thai mt-1.5 text-[0.82rem] text-[var(--c-text-3)]">
              ระบบข้ามแถวเหล่านี้พร้อมบอกเหตุผล แทนการเดาข้อมูล
            </p>
            <ul className="mt-4 flex flex-col gap-1.5">
              {preview.rejected.slice(0, 10).map((r) => (
                <li key={r.line} className="c-mono text-[0.76rem] text-[var(--c-text-3)]">
                  บรรทัด {r.line} — {r.reason}
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
            {pending ? "กำลังนำเข้า…" : "นำเข้า"}
          </button>
          <button type="button" onClick={reset} className="c-btn c-btn-ghost">
            เริ่มใหม่
          </button>
          {/* ไม่มีช่อง "แทนที่ข้อมูลเดิม" แล้ว — ติ๊กครั้งเดียวเคยลบลูกค้าทั้งบัญชี
              การล้างทั้งบัญชีย้ายไปเป็นปุ่มที่ต้องพิมพ์ชื่อร้านในหน้าตั้งค่า */}
          <span className="c-thai text-[0.78rem] text-[var(--c-text-4)]">
            นำเข้าซ้ำได้เสมอ — คนเดิมไม่ซ้ำ และช่องที่ว่างในไฟล์ไม่ลบข้อมูลเดิม
          </span>
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
            ? "border-[var(--c-cyan)] bg-[var(--c-hover)]"
            : "border-[var(--c-line-2)] bg-[var(--c-panel-2)]"
        }`}
      >
        <p className="c-label-th">ขั้นที่ 1 จาก 3</p>
        <p className="c-h1 mt-4 text-[var(--c-text)]">ลากไฟล์จาก POS มาวางที่นี่</p>
        <p className="c-thai mt-3 max-w-lg text-[0.88rem] text-[var(--c-text-3)]">
          ใช้ CSV จาก POS ใดก็ได้ ไม่ต้องจัดคอลัมน์หรือลบแถวว่าง
          ระบบจะอ่านหัวตารางและจับคู่ข้อมูลให้
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={pending}
            className="c-btn c-btn-primary"
          >
            {pending ? "กำลังอ่าน…" : "เลือกไฟล์"}
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
        <p className="c-mono mt-6 text-[0.75rem] text-[var(--c-text-4)]">
          CSV · TSV · ขนาดไม่เกิน 4MB
        </p>
      </div>

      {error && (
        <p className="c-thai border-l-2 border-[var(--c-bad)] pl-4 text-[0.85rem] text-[var(--c-bad)]">
          {error}
        </p>
      )}

      <Panel flat className="p-5 md:p-6">
        {/* เดิมบอกว่าต้องมีสามคอลัมน์และประวัติหกเดือน ซึ่งไม่จริงแล้วตั้งแต่ไฟล์
            รายชื่ออย่างเดียวนำเข้าได้ — ข้อความที่บอกว่าทำไม่ได้ ทำให้คนไม่ลองทำ */}
        <p className="c-label-th">ขาดไม่ได้แค่อย่างเดียว</p>
        <p className="c-thai mt-2.5 text-[0.86rem] text-[var(--c-text-2)]">
          รหัสลูกค้า เบอร์โทร อีเมล หรือ LINE อย่างใดอย่างหนึ่ง เพื่อให้ระบบรู้ว่าเป็นใคร
          ที่เหลือมีคอลัมน์ไหนก็นำเข้าคอลัมน์นั้น
        </p>
        <ul className="mt-4 flex flex-col gap-2.5">
          {[
            ["รายชื่อลูกค้า", "ชื่อ เบอร์ อีเมล LINE โซเชียล ที่อยู่ วันเกิด บริษัท — ไม่ต้องมียอดขาย"],
            ["ยอดขายจาก POS", "เพิ่มวันที่ซื้อและยอดที่จ่าย · รองรับทั้งปี พ.ศ. และ ค.ศ."],
          ].map(([k, v]) => (
            <li key={k} className="c-thai text-[0.84rem] text-[var(--c-text-2)]">
              <span className="text-[var(--c-cyan)]">{k}</span>
              <span className="text-[var(--c-text-4)]"> — {v}</span>
            </li>
          ))}
        </ul>
        <p className="c-thai mt-5 text-[0.8rem] text-[var(--c-text-4)]">
          เบอร์ อีเมล และที่อยู่ถูกเข้ารหัสก่อนเก็บ · ยิ่งมีประวัติการซื้อนาน
          ระบบยิ่งคำนวณรอบการกลับมาของแต่ละคนได้แม่น
        </p>
      </Panel>
    </div>
  );
}
