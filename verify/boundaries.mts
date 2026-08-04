/* ── เส้นแบ่งที่เครื่องตรวจให้ ไม่ใช่ที่คนจำ ────────────────────

   โครงของโปรเจกต์นี้มีสามชั้น:

     lib/shared/   ข้อมูลและตัวช่วยบริสุทธิ์ ใครก็ import ได้
     lib/engine/   ตรรกะโดเมน — แตะฐานข้อมูลลูกค้า
     app/(site)    เว็บการตลาด สาธารณะ ไม่มีข้อมูลลูกค้าเลย
     app/(app)     คอนโซล ต้องล็อกอิน อ่าน/เขียนผ่าน RLS

   ตอนนี้เส้นเหล่านี้สะอาด แต่มันสะอาดเพราะเราระวัง ไม่ใช่เพราะมีอะไรบังคับ
   เส้น "AND tenant_id = ?" ก็เคยสะอาดด้วยเหตุผลเดียวกัน แล้วมันหลุดสองครั้ง
   (commitImport ลบข้ามบัญชี · sendCampaign สั่งงานแคมเปญของบัญชีอื่น)

   กฎที่เครื่องตรวจให้เท่านั้นที่จะยังอยู่ในอีกหกเดือน
   ───────────────────────────────────────────────────────────── */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const fails: string[] = [];
const checks: string[] = [];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === ".git") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mts)$/.test(full)) out.push(full);
  }
  return out;
}

const files = walk(ROOT);
const read = (f: string) => readFileSync(f, "utf8");
const importsOf = (src: string) => [...src.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
const rel = (f: string) => relative(ROOT, f);

/* ── 1 · เว็บการตลาดห้ามแตะเครื่องยนต์ ──

   หน้าเหล่านี้ถูก prerender เป็นไฟล์นิ่งและเปิดสาธารณะ ถ้าวันหนึ่งมีใคร
   import lib/engine เข้ามา หน้านั้นจะกลายเป็น dynamic เงียบ ๆ ลากไดรเวอร์
   ฐานข้อมูลเข้าไปในกราฟของหน้าที่ไม่ควรรู้จักข้อมูลลูกค้าเลย */
{
  const bad: string[] = [];
  for (const f of files.filter((f) => rel(f).startsWith("app/(site)"))) {
    for (const i of importsOf(read(f))) {
      if (i.startsWith("@/lib/engine")) bad.push(`${rel(f)} → ${i}`);
    }
  }
  checks.push(`เว็บการตลาดไม่แตะ lib/engine (ตรวจ ${files.filter((f) => rel(f).startsWith("app/(site)")).length} ไฟล์)`);
  if (bad.length) fails.push("เว็บการตลาด import เครื่องยนต์:\n    " + bad.join("\n    "));
}

/* ── 2 · lib/shared ต้องบริสุทธิ์จริง ──

   ถ้า shared ดึง engine เข้ามาแม้แต่ตัวเดียว กฎข้อ 1 จะถูกข้ามได้ทันที
   ผ่านทางอ้อม โดยที่ข้อ 1 ยังรายงานว่าผ่าน */
{
  const bad: string[] = [];
  for (const f of files.filter((f) => rel(f).startsWith("lib/shared"))) {
    for (const i of importsOf(read(f))) {
      if (i.startsWith("@/lib/engine")) bad.push(`${rel(f)} → ${i}`);
    }
  }
  checks.push("lib/shared ไม่ดึง lib/engine");
  if (bad.length) fails.push("shared ดึง engine:\n    " + bad.join("\n    "));
}

/* ── 3 · ทางเข้าฐานข้อมูลมีทางเดียว ──

   ทุกอย่างต้องผ่าน lib/engine/db.ts หรือ lib/engine/sql.ts เพื่อให้
   วันที่ย้ายไป Supabase มีจุดที่ต้องแก้จุดเดียวจริง */
{
  const bad: string[] = [];
  for (const f of files) {
    const r = rel(f);
    /* db.ts กับ sql.ts เป็นเจ้าของไดรเวอร์ตามนิยามของกฎข้อนี้

       schema-parity เป็นข้อยกเว้นเดียว และเป็นข้อยกเว้นที่จำเป็น:
       หน้าที่ของมันคือเทียบสคีมาสองฝั่ง จึงต้องเปิดทั้งสองตัวขับพร้อมกัน
       ผ่าน adapter ไม่ได้ เพราะ adapter เลือกตัวขับให้ตัวเดียวเสมอ

       มันเป็นสคริปต์ตรวจ ไม่ใช่โค้ดที่ผู้ใช้เรียก จึงไม่ทำให้เหตุผลของ
       กฎข้อนี้ (จุดเปลี่ยนฐานข้อมูลต้องมีที่เดียว) เสียไป */
    if (
      r === "lib/engine/db.ts" ||
      r === "lib/engine/sql.ts" ||
      r === "verify/schema-parity.mts"
    )
      continue;
    if (importsOf(read(f)).some((i) => i === "node:sqlite" || i === "postgres")) {
      bad.push(r);
    }
  }
  checks.push("ไดรเวอร์ฐานข้อมูลถูก import ที่ db.ts กับ sql.ts เท่านั้น");
  if (bad.length) fails.push("import ไดรเวอร์ตรง:\n    " + bad.join("\n    "));
}

/* ── 3.5 · "use server" / "use client" ต้องอยู่บรรทัดแรก ──

   Next ปฏิเสธไฟล์ที่มี directive อยู่ใต้ import ("The 'use server'
   directive must be at the top of the file") ซึ่งพังตอน build เท่านั้น
   ไม่พังตอน typecheck

   มันหลุดมาสองครั้งจากสคริปต์ที่เติม import ด้วยการต่อข้างหน้าไฟล์ —
   ซึ่งดันบรรทัดแรกลงไปโดยไม่มีอะไรทัก */
{
  const bad: string[] = [];
  const DIRECTIVES = new Set(['"use server";', '"use client";']);
  for (const f of files) {
    const lines = read(f).split("\n");
    /* ดูเป็นบรรทัด ไม่ใช่ค้นข้อความ — ไม่งั้นกฎจับไฟล์ตัวเองที่มีสตริงนี้
       อยู่ในโค้ดของกฎ และจับสตริงที่บังเอิญโผล่ในคอมเมนต์ด้วย */
    const at = lines.findIndex((l) => DIRECTIVES.has(l.trim()));
    if (at <= 0) continue;
    const before = lines.slice(0, at).join("\n").trim();
    if (before) bad.push(rel(f));
  }
  checks.push("directive อยู่บรรทัดแรกของไฟล์");
  if (bad.length)
    fails.push("directive ไม่ได้อยู่บนสุด:\n    " + [...new Set(bad)].join("\n    "));
}

/* ── 4 · คอนโซลห้ามดึงไลบรารีคอมโพเนนต์ของฝั่งการตลาด ──

   components/ui.tsx เป็นของเว็บการตลาด (PageHero · Quote · CTA ·
   SignalField) เคยมีเส้นเดียวที่ลากผิด: console/nav.tsx ดึงทั้งโมดูล
   เข้ามาเพื่อเอาโลโก้ตัวเดียว ตอนนี้โลโก้อยู่ที่ components/brand.tsx */
{
  const bad: string[] = [];
  for (const f of files.filter((f) => rel(f).startsWith("app/(app)") || rel(f).startsWith("components/console"))) {
    for (const i of importsOf(read(f))) {
      if (i === "@/components/ui" || i === "../ui" || i === "@/components/site-header") {
        bad.push(`${rel(f)} → ${i}`);
      }
    }
  }
  checks.push("คอนโซลไม่ดึง components/ui.tsx ของฝั่งการตลาด");
  if (bad.length) fails.push("คอนโซลดึงคอมโพเนนต์ฝั่งการตลาด:\n    " + bad.join("\n    "));
}

/* ── 4.5 · ห้ามปล่อย promise ลอย ──────────────────────────────

   ฟังก์ชันใน lib/ ที่เป็น async เกือบทั้งหมดเปิดธุรกรรม เรียกมันโดยไม่ await
   แปลว่าธุรกรรมนั้นยังเปิดค้างอยู่ตอนบรรทัดถัดไปเริ่มทำงาน บนไฟล์ sqlite
   ที่มีคอนเนกชันเดียวจะได้ "cannot start a transaction within a transaction"
   ส่วนบน Postgres จะได้ผลลัพธ์ที่ขึ้นกับจังหวะ ซึ่งแย่กว่าเพราะไม่มีใครฟ้อง

   มันเคยหลุดสองจุดพร้อมกัน — travelForward ใน seedCampaignHistory และ seed
   ใน reseedAction — และไม่มีอะไรจับได้เลยจนกระทั่งโค้ดข้าง ๆ เปลี่ยนไปวิ่ง
   ขนาน แล้วจังหวะที่บังเอิญพอดีก็หายไป typecheck มองไม่เห็นเพราะการทิ้ง
   promise เป็นโค้ดที่ถูกต้องตามชนิดข้อมูลทุกประการ */
{
  const asyncNames = new Set<string>();
  for (const f of files.filter((f) => rel(f).startsWith("lib/"))) {
    for (const m of read(f).matchAll(/^export async function (\w+)/gm)) {
      asyncNames.add(m[1]);
    }
  }

  const bad: string[] = [];
  for (const f of files.filter(
    (f) => rel(f).startsWith("lib/") || rel(f).startsWith("app/"),
  )) {
    const src = read(f);
    for (const name of asyncNames) {
      /* ต้องเป็นตำแหน่งของ "คำสั่ง" ไม่ใช่ตำแหน่งของ "ค่า" — ตัวอักษร
         ก่อนหน้าจึงต้องเป็นต้นบรรทัด, ; , { , } หรือ ) ของ if/else
         ไม่ใช่ = , . , ( หรือ , ซึ่งแปลว่าค่านั้นถูกส่งต่อไปที่อื่นแล้ว */
      const call = new RegExp(`(^|[;{}\\n)])(\\s*)${name}\\s*\\(`, "g");
      for (const m of src.matchAll(call)) {
        const open = m.index + m[0].length - 1;
        // นับวงเล็บจนปิดครบ เพื่อให้การเรียกที่กินหลายบรรทัดถูกอ่านถูกต้อง
        let depth = 0;
        let i = open;
        for (; i < src.length; i++) {
          if (src[i] === "(") depth++;
          else if (src[i] === ")" && --depth === 0) break;
        }
        /* ปิดท้ายด้วย ; = เป็นคำสั่งเดี่ยว ๆ ไม่มีใครรับค่าไปทำอะไรต่อ
           ถ้าปิดท้ายด้วย , หรือ ) แปลว่ามันอยู่ใน Promise.all หรือถูกส่ง
           เป็นอาร์กิวเมนต์ ซึ่งมีคนรออยู่แล้ว */
        if (src.slice(i + 1).trimStart()[0] !== ";") continue;
        const line = src.slice(0, m.index).split("\n").length;
        bad.push(`${rel(f)}:${line}  ${name}(…)`);
      }
    }
  }
  checks.push(`ไม่มี promise ลอย (ตรวจ ${asyncNames.size} ฟังก์ชัน async ของ lib/)`);
  if (bad.length)
    fails.push("เรียกฟังก์ชัน async โดยไม่ await:\n    " + bad.join("\n    "));
}

/* ── 5 · ไม่มีไฟล์ตกค้างใน lib/ ชั้นบนสุด ──
   ไฟล์ที่ไม่ได้อยู่ใน shared หรือ engine คือไฟล์ที่ยังไม่มีใครตัดสินว่า
   มันแตะข้อมูลลูกค้าหรือเปล่า ซึ่งเป็นสถานะที่ไม่ควรมี */
{
  const loose = readdirSync(join(ROOT, "lib")).filter((n) => n.endsWith(".ts"));
  checks.push("lib/ ชั้นบนสุดว่าง — ทุกไฟล์อยู่ใน shared หรือ engine");
  if (loose.length) fails.push("ไฟล์ยังไม่ถูกจัดชั้น: " + loose.join(", "));
}

for (const c of checks) console.log("PASS  " + c);
if (fails.length) {
  console.log("\n=== มี FAIL ===");
  for (const f of fails) console.log("FAIL  " + f);
  process.exit(1);
}
console.log("\n=== ผ่านทั้งหมด ===");
