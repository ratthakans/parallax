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
    return { ...shapeRecords(csvRecords(text)), encoding };
  }
  const wb = XLSX.read(bytes, {
    type: "array",
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
export function csvRecords(text: string): { line: number; cells: string[] }[] {
  const clean = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const out: { line: number; cells: string[] }[] = [];
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
    else if (ch === "\n") { row.push(field); out.push({ line: start, cells: row }); row = []; field = ""; start = line; }
    else field += ch;
  }
  if (field.length || row.length) { row.push(field); out.push({ line: start, cells: row }); }
  return out;
}

/** หัวคอลัมน์ = ระเบียนแรกที่มีข้อมูล · ที่เหลือเป็นแถวทั้งหมด (รวมแถวว่าง) พร้อมปัญหาโครงสร้าง */
function shapeRecords(records: { line: number; cells: string[] }[], lenient = false): Omit<ReadTable, "encoding"> {
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
