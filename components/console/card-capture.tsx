"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { captureCardsAction } from "@/app/(app)/capture-actions";
import type { CaptureResult, CardInput, CardOutcome } from "@/lib/engine/vault/cards";
import { CARD_BATCH_MAX } from "@/lib/shared/capture";
import { parseCardLines, type CardLine } from "@/lib/shared/card-parse";
import { num } from "./ui";

/* ── เพิ่มนามบัตรทีละชุด: ถ่าย · อัปโหลดหลายใบ · พิมพ์เอง (docs/brand-plan.md §5) ──────

   ชื่องานและวันที่ถามครั้งเดียวต่อชุด · แต่ละใบ: ชื่อ ตำแหน่ง บริษัท อีเมล เบอร์
   รูปถูกอ่านในเบราว์เซอร์นี้ (tesseract · ไฟล์จาก /ocr/ ของเราเอง) — รูปไม่ถูกอัปโหลด
   ไม่ถูกเก็บ และไม่ส่งให้ AI เพราะนามบัตรคือข้อมูลติดต่อ · ที่ส่งไปเซิร์ฟเวอร์มีแค่ข้อความ
   ในช่องที่ผู้ใช้เห็นและแก้ได้แล้ว
   กดบันทึก = ทั้งชุดเข้า Data Vault แล้วตรวจตัวตนทันที — ตรงกับคนเดิมไม่สร้างคนซ้ำ · ไม่แน่ใจ = รอตรวจ */

const LABEL = "c-thai flex min-w-0 flex-col gap-1 text-[0.8rem] text-[var(--c-text-3)]";
const FIELDS: { k: keyof CardInput; label: string; type?: string }[] = [
  { k: "name", label: "ชื่อ-นามสกุล" },
  { k: "title", label: "ตำแหน่ง" },
  { k: "company", label: "บริษัท" },
  { k: "email", label: "อีเมล", type: "email" },
  { k: "phone", label: "เบอร์", type: "tel" },
];
const OUTCOME_TH: Record<CardOutcome, string> = {
  new: "คนใหม่",
  existing: "ตรงกับคนเดิม — เพิ่มเข้าคนเดิม ไม่สร้างซ้ำ",
  review: "รอตรวจ — อาจเป็นคนเดิม ให้คนตัดสิน",
  rejected: "ไม่บันทึก",
  suspended: "พักไว้ — ตรงกับคนที่ถูกลบ",
};

type Row = {
  key: string;
  card: CardInput;
  /** blob: URL ของรูปย่อ — อยู่ในหน่วยความจำของแท็บนี้เท่านั้น */
  thumb?: string;
  status: "manual" | "reading" | "done" | "error";
  unsure: (keyof CardInput)[];
};

const blank = (): CardInput => ({ name: "", title: "", company: "", email: "", phone: "" });
const isBlank = (c: CardInput) => Object.values(c).every((v) => !v.trim());
let seq = 0;
const newKey = () => `r${++seq}`;

/* ── ตัวอ่านรูป — สร้างครั้งเดียวเมื่อมีรูปแรก ใช้ซ้ำทุกใบ ──
   workerBlobURL: false → new Worker("/ocr/worker.min.js") ตรง ๆ ไม่ใช่ blob:
   CSP ของหน้านี้จึงต้องการแค่ worker-src 'self' (proxy.ts) */
type OcrWorker = { recognize: (img: HTMLCanvasElement, o: object, out: object) => Promise<{ data: { blocks: { paragraphs: { lines: { text: string; confidence: number }[] }[] }[] | null; text: string } }>; terminate: () => Promise<unknown> };
let workerPromise: Promise<OcrWorker> | null = null;
function ocr(): Promise<OcrWorker> {
  workerPromise ??= import("tesseract.js").then(({ createWorker }) =>
    createWorker(["tha", "eng"], 1, {
      workerPath: "/ocr/worker.min.js",
      corePath: "/ocr",
      langPath: "/ocr",
      workerBlobURL: false,
      gzip: true,
    }) as unknown as Promise<OcrWorker>,
  );
  return workerPromise;
}

/* ย่อด้านยาวเหลือ 1600px · หมุนตาม EXIF · ขาวดำ + เพิ่มคอนทราสต์ — OCR อ่านตัวเล็กบนพื้นสีได้ดีขึ้น */
async function prepare(file: File): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  const ctx = c.getContext("2d")!;
  ctx.filter = "grayscale(1) contrast(1.35)";
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c;
}

async function readCard(file: File): Promise<{ card: CardInput; unsure: (keyof CardInput)[] }> {
  const [w, canvas] = await Promise.all([ocr(), prepare(file)]);
  const { data } = await w.recognize(canvas, {}, { text: true, blocks: true });
  const lines: CardLine[] = data.blocks
    ? data.blocks.flatMap((b) => b.paragraphs.flatMap((p) => p.lines.map((l) => ({ text: l.text, confidence: l.confidence }))))
    : data.text.split("\n").map((text) => ({ text }));
  return parseCardLines(lines);
}

export function CardCapture({ today }: { today: string }) {
  const [event, setEvent] = useState("");
  const [date, setDate] = useState(today);
  const [rows, setRows] = useState<Row[]>(() => [{ key: newKey(), card: blank(), status: "manual", unsure: [] }]);
  const [result, setResult] = useState<Extract<CaptureResult, { ok: true }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [pending, start] = useTransition();
  const queue = useRef<Promise<void>>(Promise.resolve());
  const thumbs = useRef(new Set<string>());

  /* ออกจากหน้า = ทิ้งรูปทั้งหมดและปิดตัวอ่าน */
  useEffect(() => () => {
    for (const u of thumbs.current) URL.revokeObjectURL(u);
    void workerPromise?.then((w) => w.terminate());
    workerPromise = null;
  }, []);

  const patch = (key: string, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const set = (key: string, k: keyof CardInput, v: string) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, card: { ...r.card, [k]: v }, unsure: r.unsure.filter((u) => u !== k) } : r)));
  const drop = (key: string) =>
    setRows((rs) => {
      const r = rs.find((x) => x.key === key);
      if (r?.thumb) { URL.revokeObjectURL(r.thumb); thumbs.current.delete(r.thumb); }
      const left = rs.filter((x) => x.key !== key);
      return left.length ? left : [{ key: newKey(), card: blank(), status: "manual", unsure: [] }];
    });

  function addFiles(list: FileList | File[] | null) {
    const files = [...(list ?? [])].filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    setResult(null);
    setError(null);
    const room = CARD_BATCH_MAX - rows.filter((r) => !(r.status === "manual" && isBlank(r.card))).length;
    if (files.length > room) setError(`ชุดหนึ่งได้ไม่เกิน ${num(CARD_BATCH_MAX)} ใบ — รับ ${num(Math.max(0, room))} ใบแรก ที่เหลือบันทึกเป็นชุดถัดไป`);
    const take = files.slice(0, Math.max(0, room));
    const added: Row[] = take.map((f) => {
      const thumb = URL.createObjectURL(f);
      thumbs.current.add(thumb);
      return { key: newKey(), card: blank(), thumb, status: "reading", unsure: [] };
    });
    /* แถวว่างที่ยังไม่ได้พิมพ์อะไรถูกแทนด้วยรูป ไม่ค้างเป็นใบเปล่า */
    setRows((rs) => [...rs.filter((r) => !(r.status === "manual" && isBlank(r.card))), ...added]);
    take.forEach((f, i) => {
      const key = added[i].key;
      /* ทีละใบตามคิว — ตัวอ่านตัวเดียว ไม่ให้มือถือร้อน */
      queue.current = queue.current.then(async () => {
        try {
          const { card, unsure } = await readCard(f);
          setRows((rs) => rs.map((r) => (r.key === key ? { ...r, card: { ...card, ...Object.fromEntries(Object.entries(r.card).filter(([, v]) => v)) }, unsure, status: "done" } : r)));
        } catch {
          patch(key, { status: "error", unsure: ["name", "company", "email", "phone"] });
        }
      });
    });
  }

  const reading = rows.filter((r) => r.status === "reading").length;
  const toSave = rows.filter((r) => !isBlank(r.card));

  function save() {
    setError(null);
    const fd = new FormData();
    fd.set("event", event);
    fd.set("date", date);
    fd.set("cards", JSON.stringify(toSave.map((r) => r.card)));
    start(async () => {
      const res = await captureCardsAction(fd);
      if (!res.ok) { setError(res.error); return; }
      setResult(res);
      for (const u of thumbs.current) URL.revokeObjectURL(u);
      thumbs.current.clear();
      setRows([{ key: newKey(), card: blank(), status: "manual", unsure: [] }]);
    });
  }

  return (
    <div className="grid gap-5">
      <div className="grid gap-3 md:grid-cols-3">
        <label className={`${LABEL} md:col-span-2`}>ได้นามบัตรชุดนี้จากงานไหน
          <input value={event} onChange={(e) => setEvent(e.target.value)} className="c-input" placeholder="เช่น งานแสดงสินค้าพลังงาน 2026" />
        </label>
        <label className={LABEL}>วันที่ของงาน
          <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className="c-input" />
        </label>
      </div>

      {/* ── ถ่าย / อัปโหลด ── */}
      <div
        className={`c-drop ${drag ? "c-drop--on" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
      >
        <div className="flex flex-wrap gap-2">
          <label className="c-btn c-btn-primary cursor-pointer">
            ถ่ายรูปนามบัตร
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
          </label>
          <label className="c-btn c-btn-ghost cursor-pointer">
            อัปโหลดรูป (หลายใบได้)
            <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
          </label>
        </div>
        <p className="c-thai mt-2 text-[0.8rem] text-[var(--c-text-4)]">
          หรือลากรูปมาวางตรงนี้ · ชุดละไม่เกิน {num(CARD_BATCH_MAX)} ใบ · <strong className="font-medium text-[var(--c-text-3)]">รูปอ่านในเครื่องนี้ ไม่ถูกอัปโหลดหรือเก็บไว้</strong>
        </p>
      </div>

      {/* ── ตรวจก่อนบันทึก ── */}
      <ol className="grid gap-3">
        {rows.map((r, i) => (
          <li key={r.key} className="c-cardrow">
            <div className="c-cardrow__thumb">
              {r.thumb
                ? <img src={r.thumb} alt={`รูปนามบัตรใบที่ ${i + 1}`} />
                : <span className="c-thai text-[0.72rem] text-[var(--c-text-4)]">พิมพ์เอง</span>}
            </div>
            <div className="min-w-0">
              <p className="c-thai mb-2 flex flex-wrap items-center gap-2 text-[0.78rem] text-[var(--c-text-4)]">
                ใบที่ {num(i + 1)}
                {r.status === "reading" && <span className="c-pill" aria-live="polite">กำลังอ่าน…</span>}
                {r.status === "done" && (r.unsure.length ? <span className="c-pill c-pill-warn">ตรวจช่องที่มีกรอบเหลือง</span> : <span className="c-pill c-pill-good">อ่านแล้ว</span>)}
                {r.status === "error" && <span className="c-pill c-pill-bad">อ่านรูปไม่ได้ — พิมพ์เอง</span>}
              </p>
              <fieldset className="grid gap-2 md:grid-cols-5" disabled={r.status === "reading"}>
                <legend className="sr-only">นามบัตรใบที่ {num(i + 1)}</legend>
                {FIELDS.map((f) => (
                  <label key={f.k} className={LABEL}>{f.label}
                    <input type={f.type ?? "text"} value={r.card[f.k]} onChange={(e) => set(r.key, f.k, e.target.value)}
                      className="c-input" data-unsure={r.unsure.includes(f.k) || undefined} aria-invalid={r.unsure.includes(f.k) || undefined} />
                  </label>
                ))}
              </fieldset>
            </div>
            <button type="button" className="c-btn c-btn-ghost c-btn-sm self-start" aria-label={`เอาใบที่ ${i + 1} ออก`} onClick={() => drop(r.key)}>เอาออก</button>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="c-btn c-btn-ghost" disabled={rows.length >= CARD_BATCH_MAX}
          onClick={() => setRows((rs) => [...rs, { key: newKey(), card: blank(), status: "manual", unsure: [] }])}>
          + พิมพ์เองอีกใบ
        </button>
        <button type="button" className="c-btn c-btn-primary" disabled={pending || !event.trim() || reading > 0 || !toSave.length} aria-busy={pending || undefined} onClick={save}>
          {pending ? "กำลังบันทึก…" : reading ? `รออ่านอีก ${num(reading)} ใบ` : `บันทึก ${num(toSave.length)} ใบ`}
        </button>
        {!event.trim() && toSave.length > 0 && <span className="c-thai text-[0.78rem] text-[var(--c-text-4)]">ใส่ชื่องานก่อนบันทึก</span>}
      </div>
      {error && <p role="alert" className="c-msg c-msg-err">{error}</p>}

      {result && (
        <div role="status" className="c-msg c-msg-ok">
          <p className="c-thai">
            บันทึกแล้ว {num(result.cards.length)} ใบ · คนใหม่ {num(result.cards.filter((c) => c.outcome === "new").length)}
            {" "}· ตรงกับคนเดิม {num(result.cards.filter((c) => c.outcome === "existing").length)}
            {" "}· รอตรวจ {num(result.cards.filter((c) => c.outcome === "review").length)}
          </p>
          <ul className="c-thai mt-1 text-[0.8rem]">
            {result.cards.map((c) => (
              <li key={c.line}>ใบที่ {num(c.line)}: {OUTCOME_TH[c.outcome]}{c.reason ? ` (${c.reason})` : ""}</li>
            ))}
          </ul>
          {result.resolveError && <p className="mt-1">ตรวจตัวตนไม่สำเร็จ: {result.resolveError} — สั่งตรวจใหม่ได้จากหน้าตรวจข้อมูลซ้ำ</p>}
          <p className="mt-1 text-[0.8rem]">
            <Link href={`/app/vault/batches/${result.batchId}`} className="underline">ดูผลรายใบ</Link>
            {" · "}<Link href="/app/vault/review" className="underline">ตรวจข้อมูลซ้ำ</Link>
          </p>
        </div>
      )}
    </div>
  );
}
