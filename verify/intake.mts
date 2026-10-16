/* ── Data Vault: รับไฟล์เข้า (docs/plan.md B2 · Blueprint 2.0 บท 4) ─────────

   ตรวจสิ่งที่ถ้าพังจะไม่มีใครเห็นจากหน้าจอ:
   1. ไม่มีแหล่งที่ลงทะเบียน = อัปโหลดไม่ได้ · แหล่งต้องบอกที่มาและวัตถุประสงค์
   2. ไฟล์อันตรายถูกปฏิเสธก่อนอ่านเนื้อใน และไม่มีอะไรถูกเก็บ · ระบบจริงที่ไม่มีตัวสแกน = ปฏิเสธ
   3. ตรวจยอดครบ: แถวในไฟล์ = ผลรวมทุกสถานะที่บันทึก · นำเข้าไฟล์เดิมซ้ำไม่ได้
   4. เก็บเฉพาะฟิลด์ที่แหล่งเลือก · คอลัมน์อ่อนไหวไม่ลงฐานเลย · แถวดิบเข้ารหัส (ค้นทั้งไฟล์ฐานข้อมูลไม่เจอ)
   5. Windows-874 และ xlsx อ่านได้ถูกตัวอักษร */
import "./isolate.mts";
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { ensureReady } from "@/lib/engine/bootstrap";
import { all, get } from "@/lib/engine/sql";
import { openRecord } from "@/lib/engine/pii";
import { registerSource, getSource } from "@/lib/engine/vault/sources";
import { analyseUpload, commitUpload } from "@/lib/engine/vault/intake";
import { scanFile } from "@/lib/engine/vault/scan";
import { getBatchReport } from "@/lib/engine/vault/batches";
import { fileBytes, generateSynthetic } from "@/lib/shared/synthetic-b2b";

const out: string[] = [];
const ok = (c: boolean, m: string) => out.push(`${c ? "PASS" : "FAIL"}  ${m}`);
const enc = (s: string) => new TextEncoder().encode(s);

await ensureReady();
const A = "mst-golf";
const ACTOR = "verify";

// ── 1 · แหล่งข้อมูล ──
const noSrc = await analyseUpload(A, "ไม่มีแหล่งนี้", enc("ชื่อ,อีเมล\nก,a@b.example\n"), "x.csv", ACTOR);
ok(!noSrc.ok, "ไม่มีแหล่งที่ลงทะเบียน = อัปโหลดไม่ได้");
const card = await registerSource(A, { name: "นามบัตร", kind: "namecard", newPurpose: "ขาย", acquisitionNote: "สแกนจากงานแสดงสินค้า", fields: ["email"] }, ACTOR);
ok(!card.ok, "ลงทะเบียนแหล่งนามบัตรเองจากฟอร์มไม่ได้ — ต้องผ่านหน้ากรอกนามบัตรที่ผูกวัตถุประสงค์นามบัตร (verify:capture)");
const noWhy = await registerSource(A, { name: "ไฟล์", kind: "file", newPurpose: "ขาย", acquisitionNote: "", fields: ["email"] }, ACTOR);
ok(!noWhy.ok, "ไม่บอกที่มาของข้อมูล = ลงทะเบียนไม่ได้");

const src = await registerSource(A, {
  name: "รายชื่อผู้ลงทะเบียนงาน (สมมุติ)", kind: "file", newPurpose: "ขายสปอนเซอร์งานปีหน้า",
  acquisitionNote: "แบบฟอร์มลงทะเบียนเข้างาน มีประกาศความเป็นส่วนตัวในฟอร์ม",
  fields: ["customer_name", "first_name", "last_name", "company", "job_title", "email", "phone"],
}, ACTOR);
ok(src.ok, "ลงทะเบียนแหล่งได้เมื่อบอกที่มา วัตถุประสงค์ และฟิลด์");
const SID = src.ok ? src.id : "";

// ── 2 · ไฟล์อันตราย ──
const before = Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM import_batches WHERE tenant_id = ?", A))!.n);
const EICAR = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";
const eicar = await analyseUpload(A, SID, enc(`ชื่อ,อีเมล\n${EICAR},x@y.example\n`), "list.csv", ACTOR);
ok(!eicar.ok && /EICAR/.test(eicar.error), "ไฟล์ทดสอบไวรัส EICAR ถูกปฏิเสธ");
ok(!(await analyseUpload(A, SID, enc("x"), "list.xlsm", ACTOR)).ok, "ไฟล์ .xlsm (มาโคร) ถูกปฏิเสธ");
ok(!(await analyseUpload(A, SID, new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03]), "list.csv", ACTOR)).ok, "ไฟล์โปรแกรม (MZ) ที่ตั้งชื่อเป็น .csv ถูกปฏิเสธ");
const fakeMacro = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...enc("....xl/vbaProject.bin....")]);
ok(!(await analyseUpload(A, SID, fakeMacro, "list.xlsx", ACTOR)).ok, "xlsx ที่มีมาโคร (vbaProject.bin) ถูกปฏิเสธ");
const after = Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM import_batches WHERE tenant_id = ?", A))!.n);
ok(after === before, "ไฟล์ที่ถูกปฏิเสธไม่สร้างชุดนำเข้าหรือแถวใด");
const blocked = await get<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log WHERE tenant_id = ? AND action = 'upload_blocked'", A);
ok(Number(blocked!.n) >= 2, "ไฟล์อันตรายถูกบันทึกในสาย audit");
const prod = await scanFile(enc("ชื่อ\nก\n"), "a.csv", { production: true });
ok(!prod.ok && /สแกน/.test(prod.reason), "ระบบจริงที่ยังไม่ได้ตั้งตัวสแกน = ไม่รับไฟล์ (fail closed)");

// ── 3–4 · ไฟล์ปกติ (UTF-8) + คอลัมน์อ่อนไหว ──
const syn = generateSynthetic({ segment: "events" });
const reg = syn.files[0]; // registrations — UTF-8
const SECRET_FOOD = "ฮาลาล-มาร์คเกอร์-7731";
const SECRET_ID = "3101700123456";
const headers = [...reg.headers, "ข้อจำกัดด้านอาหาร", "เลขบัตรประชาชน"];
const rows = reg.rows.slice(0, 400).map((r, i) => [...r, i === 3 ? SECRET_FOOD : "", i === 5 ? SECRET_ID : ""]);
rows.push(headers.map(() => "")); // แถวว่าง
rows.push(["999", "", "", "", "", "", "ผู้เข้าชม", "งาน", "2020-01-01", "", ""]); // ไม่มีตัวระบุ
const csv = "﻿" + [headers, ...rows].map((r) => r.map((v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(",")).join("\r\n");
const bytes = enc(csv);

const an = await analyseUpload(A, SID, bytes, "registrations.csv", ACTOR);
ok(an.ok, "ไฟล์ปกติผ่านการตรวจและอ่านได้");
if (an.ok) {
  ok(an.rows === rows.length, `อ่านได้ครบ ${an.rows} แถว`);
  const food = an.columns.find((c) => c.header === "ข้อจำกัดด้านอาหาร")!;
  const idc = an.columns.find((c) => c.header === "เลขบัตรประชาชน")!;
  ok(food.field === "ignore" && /PDPA/.test(food.dropped ?? "") && idc.field === "ignore", "คอลัมน์อาหารและเลขบัตรประชาชนถูกตัดเสมอ");
  const typeCol = an.columns.find((c) => c.header === "ประเภทผู้ร่วมงาน")!;
  ok(typeCol.field === "ignore", "คอลัมน์ที่ไม่ใช่ฟิลด์ของแหล่งไม่ถูกเก็บ");

  // ผู้ใช้พยายามบังคับเก็บคอลัมน์อ่อนไหว และฟิลด์นอกแหล่ง (หมายเหตุ) — ต้องไม่สำเร็จ
  const override = Object.fromEntries(an.columns.map((c) => [c.index, c.field]));
  override[food.index] = "note";
  override[an.columns.find((c) => c.header === "งาน")!.index] = "note";
  const bad = await commitUpload(A, SID, bytes, "registrations.csv", override, "0".repeat(64), ACTOR);
  ok(!bad.ok, "ไฟล์ที่ส่งตอนยืนยันต้องเป็นไฟล์เดียวกับที่ตรวจ (sha256)");
  const done = await commitUpload(A, SID, bytes, "registrations.csv", override, an.sha256, ACTOR);
  ok(done.ok, "ยืนยันแล้วบันทึกได้");
  if (done.ok) {
    ok(!done.storedFields.includes("note"), "บังคับเก็บฟิลด์นอกแหล่งไม่สำเร็จ");
    const rep = (await getBatchReport(A, done.batchId))!;
    ok(rep.balanced && rep.recorded === rows.length, `ตรวจยอดครบ: ${rep.recorded} = ${rows.length}`);
    ok(done.counts.pending_review === an.estimate.pending_review && done.counts.rejected === an.estimate.rejected, "ตัวเลขประมาณตอนตรวจตรงกับผลจริง");
    ok(rep.reasons.some((g) => g.reason === "แถวว่าง") && rep.reasons.some((g) => /ชี้ไปหาใครไม่ได้/.test(g.reason)), "แถวว่างและแถวไม่มีตัวระบุถูกปฏิเสธพร้อมเหตุผล");
    ok(rep.reasons.some((g) => /อีเมลกลาง/.test(g.reason)), "อีเมลกลาง (info@) ถูกหมายเหตุว่าผูกกับองค์กร ไม่ใช่คน");

    const dup = await commitUpload(A, SID, bytes, "registrations-again.csv", override, an.sha256, ACTOR);
    ok(!dup.ok, "นำเข้าไฟล์เดิมซ้ำไม่ได้");
    const re = await analyseUpload(A, SID, bytes, "registrations-again.csv", ACTOR);
    ok(re.ok && re.duplicateOf?.batchId === done.batchId, "ตอนตรวจไฟล์ซ้ำ บอกชุดเดิมให้เห็น");

    const sample = await all<{ payload_enc: string }>(
      "SELECT payload_enc FROM import_rows WHERE tenant_id = ? AND batch_id = ? AND payload_enc IS NOT NULL LIMIT 50", A, done.batchId);
    const allowed = new Set(getSource ? (await getSource(A, SID))!.fields : []);
    const keys = new Set(sample.flatMap((r) => Object.keys(JSON.parse(openRecord(A, "import_row", r.payload_enc)))));
    ok(keys.size > 0 && [...keys].every((k) => allowed.has(k as never)), `แถวที่เก็บมีเฉพาะฟิลด์ของแหล่ง (${[...keys].join(", ")})`);
    let wrongTenant = false;
    try { openRecord("hongmove", "import_row", sample[0].payload_enc); } catch { wrongTenant = true; }
    ok(wrongTenant, "แถวดิบของบัญชีหนึ่งถอดด้วยบัญชีอื่นไม่ได้");
  }

  const raw = readFileSync(process.env.PARALLAX_DB_PATH!);
  const someEmail = reg.rows.slice(0, 400).map((r) => r[4]).find((e) => e && !e.startsWith("info@"))!;
  ok(!raw.includes(Buffer.from(SECRET_FOOD)) && !raw.includes(Buffer.from(SECRET_ID)), "ค่าในคอลัมน์อ่อนไหวไม่อยู่ในไฟล์ฐานข้อมูลเลย");
  ok(!raw.includes(Buffer.from(someEmail)), "อีเมลจากไฟล์ไม่อยู่ในไฟล์ฐานข้อมูลแบบอ่านได้ (เข้ารหัสทั้งแถว)");
}

// แถวที่คอลัมน์ไม่ครบ (เช่นเครื่องหมายคำพูดไม่ปิด) ต้องไม่หายเงียบ ๆ — ถูกปฏิเสธพร้อมเหตุผลและอยู่ในตรวจยอด
const shortCsv = enc("ชื่อ,บริษัท,อีเมล\nสมชาย ทดสอบ,บจก. ตัวอย่าง,somchai.t@sample.example\nแถวขาด,บจก. ตัวอย่าง\n\nวิไล ทดสอบ,บจก. ตัวอย่าง,wilai.t@sample.example\n\n");
const as = await analyseUpload(A, SID, shortCsv, "short.csv", ACTOR);
if (as.ok) {
  const cs = await commitUpload(A, SID, shortCsv, "short.csv", Object.fromEntries(as.columns.map((c) => [c.index, c.field])), as.sha256, ACTOR);
  const rs = cs.ok ? (await getBatchReport(A, cs.batchId))! : null;
  ok(Boolean(rs && rs.rowsTotal === 4 && rs.balanced), `แถวคอลัมน์ไม่ครบและแถวว่างกลางไฟล์ถูกนับในตรวจยอด (${rs?.rowsTotal} แถว · แถวว่างท้ายไฟล์ไม่นับ)`);
  ok(Boolean(rs?.reasons.some((g) => /คอลัมน์ไม่ครบ/.test(g.reason) && g.lines[0] === 3)), "แถวคอลัมน์ไม่ครบถูกปฏิเสธพร้อมบรรทัดจริงในไฟล์ (บรรทัด 3)");
} else ok(false, `ไฟล์ทดสอบแถวขาดอ่านไม่ได้: ${as.error}`);

// เครื่องหมายคำพูดเปิดค้าง (12" monitor) กลืนบรรทัดถัดไปเป็นแถวเดียว — ต้องบอกช่วงบรรทัดที่หาย ไม่ใช่แค่ "คอลัมน์ไม่ครบ"
const quoteCsv = enc('ชื่อ,บริษัท,อีเมล\nจอ 12" ทดสอบ,บจก. ตัวอย่าง,screen@sample.example\nมานี ทดสอบ,บจก. ตัวอย่าง,manee@sample.example\nมานะ ทดสอบ,บจก. ตัวอย่าง,mana@sample.example\n');
const aq = await analyseUpload(A, SID, quoteCsv, "quote.csv", ACTOR);
if (aq.ok) {
  const cq = await commitUpload(A, SID, quoteCsv, "quote.csv", Object.fromEntries(aq.columns.map((c) => [c.index, c.field])), aq.sha256, ACTOR);
  const rq = cq.ok ? (await getBatchReport(A, cq.batchId))! : null;
  ok(Boolean(rq?.reasons.some((g) => /เครื่องหมายคำพูดไม่ปิด — บรรทัด 2–4/.test(g.reason))),
    `เครื่องหมายคำพูดเปิดค้าง: รายงานบอกช่วงบรรทัดที่ถูกกลืน (${rq?.reasons.map((g) => g.reason).join(" | ")})`);
} else ok(false, `ไฟล์ทดสอบเครื่องหมายคำพูดอ่านไม่ได้: ${aq.error}`);

// ไฟล์เล็กที่ซ่อนตารางใหญ่ — ปฏิเสธที่การอ่าน ก่อนกินหน่วยความจำ
const tall = enc("ชื่อ,อีเมล\n" + "ก,\n".repeat(50_001));
const at = await analyseUpload(A, SID, tall, "tall.csv", ACTOR);
ok(!at.ok && /มากกว่า 50,000 แถว/.test(at.ok ? "" : at.error), "CSV เกิน 50,000 แถว ถูกปฏิเสธพร้อมเหตุผล");
const bigWs = XLSX.utils.aoa_to_sheet([["ชื่อ"], ...Array.from({ length: 50_001 }, () => ["ก"])]);
const bigWb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(bigWb, bigWs, "ใหญ่");
const bigX = new Uint8Array(XLSX.write(bigWb, { type: "array", bookType: "xlsx" }));
const abig = await analyseUpload(A, SID, bigX, "big.xlsx", ACTOR);
ok(!abig.ok && /มากกว่า 50,000 แถว/.test(abig.ok ? "" : abig.error), `xlsx เกิน 50,000 แถว ถูกปฏิเสธโดยไม่อ่านทั้งชีต (${abig.ok ? "อ่านผ่าน" : abig.error})`);

// ── 5 · Windows-874 และ xlsx ──
const sponsors = syn.files[1];
const w874 = fileBytes(sponsors);
const a874 = await analyseUpload(A, SID, w874, sponsors.name, ACTOR);
ok(a874.ok && a874.encoding === "windows-874" && a874.rows === sponsors.rows.length, "ไฟล์ Windows-874 อ่านได้ครบและรู้ว่าเป็นรหัสอักษรไหน");
if (a874.ok) {
  const c874 = await commitUpload(A, SID, w874, sponsors.name, Object.fromEntries(a874.columns.map((c) => [c.index, c.field])), a874.sha256, ACTOR);
  if (c874.ok) {
    const first = sponsors.rows.findIndex((r) => r[1] && /[฀-๿]/.test(r[1]));
    const row = await get<{ payload_enc: string }>("SELECT payload_enc FROM import_rows WHERE batch_id = ? AND line = ?", c874.batchId, first + 2);
    const v = JSON.parse(openRecord(A, "import_row", row!.payload_enc)) as Record<string, string>;
    ok(v.first_name === sponsors.rows[first][1].trim() || v.customer_name === sponsors.rows[first][1].trim(), `ชื่อไทยจากไฟล์ Windows-874 ถอดกลับได้ถูกตัว (${sponsors.rows[first][1]})`);
  } else ok(false, `บันทึกไฟล์ Windows-874 ไม่ได้: ${c874.error}`);
}

const cards = syn.files[2];
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([cards.headers, ...cards.rows]), "Cards");
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["note"], ["ไม่เกี่ยว"]]), "Notes");
const xlsx = new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
const ax = await analyseUpload(A, SID, xlsx, "namecards.xlsx", ACTOR);
ok(ax.ok && ax.kind === "xlsx" && ax.rows === cards.rows.length && ax.sheet === "Cards", "xlsx อ่านชีตแรกที่มีข้อมูลได้ครบ");
ok(ax.ok && (ax.otherSheets ?? []).includes("Notes"), "บอกชีตที่ไม่ได้อ่าน");

for (const line of out) console.log(line);
const failed = out.filter((l) => l.startsWith("FAIL"));
if (failed.length) {
  console.log(`\n=== FAIL ${failed.length} ข้อ ===`);
  process.exit(1);
}
console.log(`\n=== ผ่านทั้งหมด ${out.length} ข้อ ===`);
