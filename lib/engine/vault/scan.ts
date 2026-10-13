/* ── ตรวจไฟล์ก่อนแตะเนื้อใน (Blueprint บท 4 ขั้น 2 · บท 8) ──────────────

   ลำดับ: ขนาด → นามสกุล → ลายเซ็นไบต์ต้นไฟล์ → มาโคร → ตัวสแกนมัลแวร์
   ไฟล์ที่ไม่ผ่านไม่ถูกแยกวิเคราะห์ และไม่มีอะไรถูกเก็บ นอกจากบันทึกตรวจสอบว่าถูกปฏิเสธ

   ตัวสแกน (ตัดสินใจ T4 ใน docs/plan.md): ClamAV ในคอนเทนเนอร์ภูมิภาคสิงคโปร์ เรียกผ่าน CLAMAV_URL
   ยังไม่ได้ตั้ง (รออนุมัติค่าใช้จ่าย O6) — บนเครื่องพัฒนาใช้การตรวจพื้นฐานด้านล่างพร้อมบอกตรง ๆ
   บน production ถ้าไม่มี CLAMAV_URL = ปฏิเสธ (fail closed) ไม่ใช่ปล่อยผ่านเงียบ ๆ
   ห้ามส่งไฟล์ลูกค้าไปบริการสแกนสาธารณะ */

export const MAX_UPLOAD_BYTES = 5_000_000;

export type ScanResult =
  | { ok: true; kind: "csv" | "xlsx"; engine: "basic" | "clamav"; note?: string }
  | { ok: false; reason: string; threat?: boolean };

const EICAR = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

function startsWith(bytes: Uint8Array, sig: number[]): boolean {
  return sig.every((b, i) => bytes[i] === b);
}

function containsAscii(bytes: Uint8Array, needle: string): boolean {
  const n = Buffer.from(needle, "latin1");
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).indexOf(n) !== -1;
}

const isProduction = () => Boolean(process.env.VERCEL) || process.env.NODE_ENV === "production";

export async function scanFile(
  bytes: Uint8Array,
  filename: string,
  opts: { production?: boolean } = {},
): Promise<ScanResult> {
  if (bytes.byteLength === 0) return { ok: false, reason: "ไฟล์ว่างเปล่า" };
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    return { ok: false, reason: `ไฟล์ใหญ่เกิน ${MAX_UPLOAD_BYTES / 1_000_000}MB — แบ่งไฟล์แล้วนำเข้าทีละส่วน` };
  }

  const ext = (filename.toLowerCase().match(/\.([a-z0-9]+)$/) ?? [])[1] ?? "";
  if (["xlsm", "xlsb", "xls", "xltm"].includes(ext)) {
    return { ok: false, reason: "ไฟล์ Excel ชนิดนี้มีมาโครหรือเป็นรูปแบบเก่า — บันทึกเป็น .xlsx หรือ .csv ก่อนนำเข้า" };
  }
  if (!["csv", "txt", "xlsx"].includes(ext)) {
    return { ok: false, reason: "รับเฉพาะไฟล์ .xlsx หรือ .csv" };
  }

  /* ลายเซ็นไบต์ต้นไฟล์ — นามสกุลเปลี่ยนได้ ไบต์ต้นไฟล์ปลอมยากกว่า */
  const zip = startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]);
  const executable =
    startsWith(bytes, [0x4d, 0x5a]) || // MZ (Windows)
    startsWith(bytes, [0x7f, 0x45, 0x4c, 0x46]) || // ELF
    startsWith(bytes, [0xcf, 0xfa, 0xed, 0xfe]) || startsWith(bytes, [0xfe, 0xed, 0xfa, 0xcf]) || // Mach-O
    startsWith(bytes, [0x25, 0x50, 0x44, 0x46]) || // %PDF
    startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0]); // OLE (xls/doc เก่า มักมีมาโคร)
  if (executable) return { ok: false, reason: "เนื้อไฟล์ไม่ใช่ตารางข้อมูล — ไม่นำเข้า", threat: true };
  if (ext === "xlsx" && !zip) return { ok: false, reason: "ไฟล์ .xlsx นี้เปิดไม่ได้ (ไม่ใช่รูปแบบ Excel ที่ถูกต้อง)" };
  if (ext !== "xlsx" && zip) return { ok: false, reason: "ไฟล์นี้เป็นไฟล์บีบอัด ไม่ใช่ CSV — ตั้งนามสกุลให้ตรงชนิดไฟล์" };
  /* ชื่อไฟล์มาโครอยู่ในสารบัญ zip แบบไม่บีบอัด จึงค้นเจอในไบต์ดิบได้ */
  if (zip && containsAscii(bytes, "vbaProject.bin")) {
    return { ok: false, reason: "ไฟล์มีมาโคร (VBA) — ไม่นำเข้า บันทึกเป็น .xlsx ที่ไม่มีมาโครก่อน", threat: true };
  }
  if (containsAscii(bytes, EICAR)) return { ok: false, reason: "ตรวจพบไฟล์ทดสอบไวรัส (EICAR) — ไม่นำเข้า", threat: true };

  const kind = zip ? "xlsx" : "csv";
  const url = process.env.CLAMAV_URL;
  if (url) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/octet-stream", ...(process.env.CLAMAV_TOKEN ? { authorization: `Bearer ${process.env.CLAMAV_TOKEN}` } : {}) },
        body: Buffer.from(bytes),
        signal: AbortSignal.timeout(20_000),
      });
      const body = (await res.json()) as { clean?: boolean; signature?: string };
      if (!res.ok || typeof body.clean !== "boolean") return { ok: false, reason: "บริการสแกนตอบผิดรูปแบบ — หยุดไว้ก่อน" };
      if (!body.clean) return { ok: false, reason: `ตรวจพบภัยคุกคาม (${body.signature ?? "ไม่ระบุชื่อ"}) — ไม่นำเข้า`, threat: true };
      return { ok: true, kind, engine: "clamav" };
    } catch {
      return { ok: false, reason: "ติดต่อบริการสแกนไม่ได้ — หยุดนำเข้าไว้ก่อน ลองใหม่ภายหลัง" };
    }
  }
  if (opts.production ?? isProduction()) {
    return { ok: false, reason: "ยังไม่ได้ตั้งบริการสแกนมัลแวร์บนระบบจริง — ระบบไม่รับไฟล์จนกว่าจะตั้ง" };
  }
  return { ok: true, kind, engine: "basic", note: "ตรวจแบบพื้นฐาน (ชนิดไฟล์ · มาโคร · ไฟล์ทดสอบ) — ยังไม่ได้ต่อ ClamAV" };
}
