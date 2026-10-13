/* ── ข้อมูลสมมุติ B2B (lib/shared/synthetic-b2b.ts) ──────────────────

   ตัวสร้างข้อมูลคือไม้บรรทัดของการรวมตัวตน (B3) — ถ้าไม้บรรทัดคด ผลวัดทุกอย่างหลังจากนี้คดตาม
   ตรวจว่า: ทำซ้ำได้ทุกไบต์ · เฉลยครบทุกแถว · ความยุ่งที่ตั้งใจใส่มีอยู่จริง · ไม่มีข้อมูลที่ชี้ไปหาใครจริง
   · ไฟล์ Windows-874 ถอดกลับได้ตรง · ตัวนำเข้าวันนี้อ่านไฟล์ทั้งหมดออก */
import { createHash } from "node:crypto";
import {
  encodeWindows874, fileBytes, generateSynthetic, taxIdChecksum, toCsv, type Segment,
} from "@/lib/shared/synthetic-b2b";
import { parseCsv } from "@/lib/engine/ingest";
import { mapColumnsHeuristic } from "@/lib/engine/ai";

const out: string[] = [];
const ok = (c: boolean, m: string) => out.push(`${c ? "PASS" : "FAIL"}  ${m}`);
const hash = (x: unknown) => createHash("sha256").update(JSON.stringify(x)).digest("hex");

for (const segment of ["events", "services"] as Segment[]) {
  const s = generateSynthetic({ segment });
  const tag = `[${segment}]`;

  ok(hash(s) === hash(generateSynthetic({ segment })), `${tag} seed เดียวกันได้ผลเดียวกันทุกไบต์`);
  ok(hash(s) !== hash(generateSynthetic({ segment, seed: 7 })), `${tag} seed ต่างกันได้ข้อมูลต่างกัน`);

  const rows = s.files.reduce((n, f) => n + f.rows.length, 0);
  ok(s.files.length === 3 && Math.abs(rows - 10_000) <= 100, `${tag} ขนาด pilot: 3 ไฟล์ ~10,000 แถว (ได้ ${rows})`);
  ok(s.files.some((f) => f.encoding === "windows-874"), `${tag} มีไฟล์ Windows-874 หนึ่งไฟล์`);
  ok(new Set(s.files.map((f) => f.headers.join("|"))).size === 3, `${tag} หัวคอลัมน์ต่างกันทุกไฟล์`);

  // เฉลย
  ok(s.truth.length === rows, `${tag} เฉลยครบทุกแถว`);
  const byLine = new Map(s.truth.map((t) => [`${t.file}:${t.line}`, t]));
  const dups = s.truth.filter((t) => t.duplicateOf);
  ok(dups.length > 0 && dups.every((d) => byLine.get(`${d.file}:${d.duplicateOf}`)?.personKey === d.personKey),
    `${tag} แถวซ้ำในไฟล์ชี้กลับแถวต้นทางที่เป็นคนเดียวกัน (${dups.length} แถว)`);
  const peopleSeen = new Set(s.truth.map((t) => t.personKey).filter(Boolean));
  ok(peopleSeen.size > 500 && rows / peopleSeen.size > 1.5, `${tag} คนเดียวโผล่หลายแถว (${peopleSeen.size} คน)`);

  // ความยุ่งที่ตั้งใจใส่
  const movers = new Set(s.affiliations.filter((a) => a.to).map((a) => a.personKey));
  ok(movers.size / s.people.length > 0.05, `${tag} คนย้ายงาน ${(100 * movers.size / s.people.length).toFixed(1)}%`);
  ok(s.orgs.some((o) => o.parentKey), `${tag} มีบริษัทในเครือ (คนละนิติบุคคลกับบริษัทแม่)`);
  const cells = s.files.flatMap((f) => f.rows.flat());
  ok(cells.some((c) => c.startsWith("info@")), `${tag} มีอีเมลกลางของบริษัท`);
  ok(cells.some((c) => c.endsWith("@mail.example")), `${tag} มีอีเมลส่วนตัว`);
  ok(cells.some((c) => /^\d{1,2}\/\d{1,2}\/25\d\d$/.test(c)) && cells.some((c) => /^20\d\d-\d\d-\d\d$/.test(c)), `${tag} มีวันที่ทั้ง พ.ศ. และ ค.ศ.`);
  ok(cells.some((c) => c.includes("Co., Ltd.")) && cells.some((c) => c.startsWith("บจก.")), `${tag} ชื่อบริษัทหลายรูปแบบ`);
  ok(s.truth.some((t) => !t.personKey), `${tag} มีแถวที่มีแต่บริษัท ไม่มีคน`);

  // ปลอดภัย
  const emails = cells.filter((c) => c.includes("@"));
  ok(emails.length > 0 && emails.every((e) => e.trim().endsWith(".example")), `${tag} อีเมลทุกตัวใช้โดเมน .example ที่สงวนไว้`);
  ok(s.orgs.every((o) => /^\d{13}$/.test(o.taxId) && Number(o.taxId[12]) === taxIdChecksum(o.taxId.slice(0, 12))), `${tag} เลขผู้เสียภาษีผ่าน checksum`);
  ok(new Set(s.orgs.map((o) => o.taxId)).size === s.orgs.length, `${tag} บริษัทในเครือไม่ใช้เลขผู้เสียภาษีของบริษัทแม่`);

  // ไฟล์และตัวนำเข้า
  for (const f of s.files) {
    const bytes = fileBytes(f);
    const text = f.encoding === "windows-874" ? new TextDecoder("windows-874").decode(bytes) : new TextDecoder().decode(bytes);
    ok(text.replace(/^﻿/, "") === toCsv(f), `${tag} ${f.name} ถอดกลับได้ตรง (${f.encoding})`);
    const parsed = parseCsv(text);
    const fields = new Set(mapColumnsHeuristic(parsed.headers).mappings.map((m) => m.field));
    ok(parsed.rows.length === f.rows.length && fields.has("email") && fields.has("phone") && fields.has("company"),
      `${tag} ${f.name} ตัวนำเข้าอ่านได้ครบ และจับอีเมล เบอร์ บริษัท ได้ (${[...fields].filter((x) => x !== "ignore").join(", ")})`);
  }
}

// ขนาดทดสอบ 100,000 แถว
const t0 = Date.now();
const big = generateSynthetic({ segment: "events", sourceRows: 100_000 });
const ms = Date.now() - t0;
ok(big.truth.length >= 99_000 && ms < 20_000, `ชุด 100,000 แถวสร้างได้ใน ${(ms / 1000).toFixed(1)} วินาที`);
ok(encodeWindows874("ก฿๛ A").length === 5, "ตัวเข้ารหัส Windows-874 ใช้หนึ่งไบต์ต่ออักษรไทย");

for (const line of out) console.log(line);
const failed = out.filter((l) => l.startsWith("FAIL"));
if (failed.length) {
  console.log(`\n=== FAIL ${failed.length} ข้อ ===`);
  process.exit(1);
}
console.log(`\n=== ผ่านทั้งหมด ${out.length} ข้อ ===`);
