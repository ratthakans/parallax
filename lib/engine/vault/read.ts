import * as XLSX from "xlsx";

/* ── อ่านไฟล์เป็นตาราง ─────────────────────────────────────────

   CSV: เดารหัสอักษรจากไบต์ — UTF-16 ดูจาก BOM · UTF-8 แบบเข้มงวด · ไม่ใช่ทั้งสองคือ Windows-874
   (Excel บน Windows ภาษาไทยบันทึก CSV แบบนี้) — ย้ายมาทำฝั่งเซิร์ฟเวอร์ ไม่พึ่งเบราว์เซอร์

   xlsx: SheetJS CE 0.20.3 (ปักเวอร์ชันจาก cdn.sheetjs.com — เวอร์ชันบน npm ค้างที่ 0.18.5 ซึ่งมีช่องโหว่)
   อ่านค่าที่แสดงในเซลล์อย่างเดียว: ไม่คำนวณสูตร ไม่อ่าน HTML ไม่แตะมาโคร (scan.ts ปฏิเสธไฟล์ที่มีไปแล้ว)
   ใช้ชีตแรกที่มีข้อมูล และบอกชื่อชีตอื่นให้ผู้ใช้รู้ว่ามีอะไรที่ไม่ได้อ่าน */

export type ReadTable = {
  headers: string[];
  rows: string[][];
  /** บรรทัดในไฟล์ของแต่ละแถว (หัวคอลัมน์คือบรรทัดแรกที่มีข้อมูล) — ใช้อ้างกลับไฟล์ต้นทาง */
  lines: number[];
  /** ปัญหาระดับโครงสร้างของแถว เช่น จำนวนคอลัมน์ไม่ตรงหัว — แถวนั้นถูกปฏิเสธพร้อมเหตุผลนี้ */
  issues: (string | null)[];
  encoding: "utf-8" | "utf-16" | "windows-874" | "xlsx";
  sheet?: string;
  otherSheets?: string[];
};

/* ── เพดานขนาดตาราง ──
   ไฟล์ 5 MB ยังซ่อนตารางขนาดมหาศาลได้ (CSV บรรทัดว่างหลายล้านบรรทัด · xlsx ที่ประกาศช่วงชีตใหญ่)
   ซึ่งจะกินหน่วยความจำของ serverless function ก่อนจะถึงขั้นไหน — ตัดที่การอ่าน ไม่ใช่หลังอ่านเสร็จ
   pilot คือไม่เกิน 10,000 รายการต้นทาง (plan หัวข้อ 13) · เพดานนี้เผื่อไว้ห้าเท่า */
export const MAX_ROWS = 50_000;
export const MAX_COLUMNS = 200;
export class TableTooLarge extends Error {}

export function decodeText(bytes: Uint8Array): { text: string; encoding: ReadTable["encoding"] } {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { text: new TextDecoder("utf-16le").decode(bytes), encoding: "utf-16" };
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return { text: new TextDecoder("utf-16be").decode(bytes), encoding: "utf-16" };
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), encoding: "utf-8" };
  } catch {
    return { text: new TextDecoder("windows-874").decode(bytes), encoding: "windows-874" };
  }
}

export function readTable(bytes: Uint8Array, kind: "csv" | "xlsx"): ReadTable {
  if (kind === "csv") {
    const { text, encoding } = decodeText(bytes);
    const records = csvRecords(text);
    if (records.length > MAX_ROWS + 1) throw new TableTooLarge(`ไฟล์มีมากกว่า ${MAX_ROWS.toLocaleString("th-TH")} แถว — แบ่งไฟล์ก่อนนำเข้า`);
    if (records.some((r) => r.cells.length > MAX_COLUMNS)) throw new TableTooLarge(`ไฟล์มีมากกว่า ${MAX_COLUMNS} คอลัมน์ — ตรวจว่าเลือกไฟล์ถูก`);
    return { ...shapeRecords(records), encoding };
  }
  const wb = XLSX.read(bytes, {
    type: "array",
    /* อ่านไม่เกินเพดาน (+ หัว + หนึ่งแถวไว้รู้ว่าเกิน) — SheetJS หยุดสร้างเซลล์ที่นี่ ไม่ใช่สร้างครบแล้วตัด */
    sheetRows: MAX_ROWS + 2,
    cellFormula: false,
    cellHTML: false,
    cellStyles: false,
    bookVBA: false,
    dense: true,
  });
  const names = wb.SheetNames;
  const sheetName = names.find((n) => {
    const ref = wb.Sheets[n]?.["!ref"];
    return ref && XLSX.utils.decode_range(ref).e.r > 0;
  }) ?? names[0];
  /* ช่วงที่ชีตประกาศ (!fullref) คือขนาดจริงก่อนตัดด้วย sheetRows */
  const full = wb.Sheets[sheetName]?.["!fullref"] ?? wb.Sheets[sheetName]?.["!ref"];
  if (full) {
    const r = XLSX.utils.decode_range(full);
    if (r.e.r - r.s.r > MAX_ROWS) throw new TableTooLarge(`ชีต "${sheetName}" มีมากกว่า ${MAX_ROWS.toLocaleString("th-TH")} แถว — แบ่งไฟล์ก่อนนำเข้า`);
    if (r.e.c - r.s.c >= MAX_COLUMNS) throw new TableTooLarge(`ชีต "${sheetName}" มีมากกว่า ${MAX_COLUMNS} คอลัมน์ — ตรวจว่าเลือกไฟล์ถูก`);
  }
  const grid = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[sheetName], {
    header: 1,
    raw: false,
    defval: "",
    blankrows: true,
  });
  const records = grid.map((r, i) => ({ line: i + 1, cells: r.map((v) => String(v ?? "")) }));
  return {
    ...shapeRecords(records, true),
    encoding: "xlsx",
    sheet: sheetName,
    otherSheets: names.filter((n) => n !== sheetName),
  };
}

/* ── แยก CSV เป็นระเบียนโดยไม่ทิ้งแถวไหน ──

   ตัวแยกของตัวนำเข้ายุคค้าปลีก (parseCsv) ทิ้งแถวว่างและย้ายแถวที่คอลัมน์ไม่ครบไปไว้นอกตาราง
   ซึ่งดีสำหรับวิเคราะห์ยอดขาย แต่ทำให้ตรวจยอดของ Data Vault ไม่ได้ — แถวที่หายไปเงียบ ๆ
   คือสิ่งที่รายงานตรวจยอดมีไว้จับ ที่นี่จึงเก็บทุกระเบียนพร้อมบรรทัดจริงในไฟล์ (นับบรรทัดในช่องที่มีเครื่องหมายคำพูดด้วย) */
export function csvRecords(text: string): { line: number; endLine: number; cells: string[] }[] {
  const clean = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const out: { line: number; endLine: number; cells: string[] }[] = [];
  let field = "", row: string[] = [], inQuotes = false, line = 1, start = 1;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (ch === "\n") line++;
    if (inQuotes) {
      if (ch === '"' && clean[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === "," || ch === "\t") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); out.push({ line: start, endLine: line - 1, cells: row }); row = []; field = ""; start = line; }
    else field += ch;
  }
  /* จบไฟล์ขณะเครื่องหมายคำพูดยังเปิด: บรรทัดสุดท้ายคือบรรทัดที่มีข้อความ ไม่ใช่บรรทัดว่างหลังขึ้นบรรทัดใหม่ */
  if (field.length || row.length) { row.push(field); out.push({ line: start, endLine: clean.endsWith("\n") ? line - 1 : line, cells: row }); }
  return out;
}

/** หัวคอลัมน์ = ระเบียนแรกที่มีข้อมูล · ที่เหลือเป็นแถวทั้งหมด (รวมแถวว่าง) พร้อมปัญหาโครงสร้าง */
function shapeRecords(records: { line: number; endLine?: number; cells: string[] }[], lenient = false): Omit<ReadTable, "encoding"> {
  const h = records.findIndex((r) => r.cells.some((c) => c.trim()));
  if (h < 0) return { headers: [], rows: [], lines: [], issues: [] };
  const headers = records[h].cells.map((c) => c.trim());
  /* ตัดคอลัมน์ว่างท้ายหัว (Excel ชอบเติม) */
  while (headers.length && !headers[headers.length - 1]) headers.pop();
  const body = records.slice(h + 1);
  /* แถวว่างท้ายไฟล์ไม่ใช่ข้อมูล — เป็นแค่การขึ้นบรรทัดของโปรแกรมที่บันทึกไฟล์ */
  while (body.length && !body[body.length - 1].cells.some((c) => c.trim())) body.pop();
  const issues = body.map((r) => {
    const extra = r.cells.slice(headers.length).some((c) => c.trim());
    /* ระเบียนเดียวกินหลายบรรทัดและคอลัมน์ไม่ตรง = เครื่องหมายคำพูดเปิดค้าง (เช่น 12" monitor) กลืนบรรทัดถัดไป
       บรรทัดที่ถูกกลืนไม่ใช่แถวของตัวเอง ตรวจยอดจึงมองไม่เห็นว่าหาย — บอกช่วงบรรทัดให้ชัดในเหตุผลของแถวนี้ */
    const span = (r.endLine ?? r.line) - r.line;
    if (span > 0 && (extra || r.cells.length !== headers.length)) {
      return `เครื่องหมายคำพูดไม่ปิด — บรรทัด ${r.line}–${r.endLine} (${span + 1} บรรทัด) ถูกอ่านรวมเป็นแถวเดียว แก้ไฟล์แล้วนำเข้าใหม่`;
    }
    if (!lenient && r.cells.some((c) => c.trim()) && r.cells.length < headers.length) {
      return `คอลัมน์ไม่ครบ (${r.cells.length} จาก ${headers.length}) — แถวอาจถูกตัดหรือมีเครื่องหมายคำพูดไม่ปิด`;
    }
    return extra ? `มีค่าเกินจำนวนหัวคอลัมน์ (${r.cells.length} จาก ${headers.length})` : null;
  });
  return {
    headers,
    rows: body.map((r) => headers.map((_, i) => (r.cells[i] ?? "").trim())),
    lines: body.map((r) => r.line),
    issues,
  };
}
