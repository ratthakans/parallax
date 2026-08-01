/* ── สคีมาสองฝั่งต้องเป็นความจริงเดียวกัน ──────────────────────

   ระบบนี้ถือสคีมาไว้สองที่ เพราะสองภาษาถิ่นของ SQL:

     lib/engine/db.ts                    → sqlite (dev, CI)
     supabase/migrations/0001_schema.sql → Postgres (production)

   สองไฟล์ที่ต้องเดินคู่กันด้วยความจำของคนคือสองไฟล์ที่จะแตกกันสักวัน
   และมันแตกไปแล้วสองครั้งก่อนที่ไฟล์นี้จะมีอยู่:

   1. ai_cache — migration ประกาศ value jsonb แต่โค้ดเขียน payload กับ
      model ทุกการเขียนแคชบน Postgres พังเงียบ ๆ เพราะ ask() จับ error
      แล้วตกไป fallback ซึ่งหน้าตาเหมือนทำงานปกติ

   2. tenant_id — ถูกเพิ่มใน Postgres แปดตารางเพื่อให้ RLS ทำงาน แต่ไม่ได้
      เพิ่มฝั่ง sqlite และเป็น NOT NULL ทุก INSERT ที่ไม่ส่งค่านี้จะพัง
      ทั้งหมดทันทีที่สลับตัวขับ

   ทั้งสองครั้งไม่มีอะไรจับได้ จนกระทั่งมีคนต่อฐานจริงแล้วลองด้วยมือ
   ไฟล์นี้ทำให้ความแตกต่างกลายเป็นด่านที่ไม่ผ่าน แทนที่จะเป็นเรื่องที่
   ค่อยไปสะดุดเอาข้างหน้า

   ── ต้องมี DATABASE_URL ถึงจะตรวจได้ ──

   ไม่มีก็ข้าม ไม่ใช่ล้มเหลว เพราะ CI ของ PR จากคนนอกไม่ควรต้องมีรหัส
   ฐานข้อมูล แต่บนเครื่องที่มีค่าเชื่อมต่อ มันจะตรวจทุกครั้ง
   ───────────────────────────────────────────────────────────── */

import { DatabaseSync } from "node:sqlite";
import postgres from "postgres";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const url = process.env.DATABASE_URL;
if (!url) {
  console.log("ข้าม — ไม่มี DATABASE_URL จึงไม่มีฝั่ง Postgres ให้เทียบ");
  process.exit(0);
}

/* sqlite ต้องเป็นฐานใหม่เอี่ยม ไม่ใช่ไฟล์ที่ใช้อยู่ — ไฟล์ที่ใช้อยู่อาจมี
   คอลัมน์ที่ ALTER เพิ่มไว้แล้ว ซึ่งจะซ่อนความจริงว่า CREATE TABLE
   ที่เขียนไว้ยังขาดอยู่ */
const dir = mkdtempSync(join(tmpdir(), "parity-"));
process.env.PARALLAX_DB_PATH = join(dir, "p.db");
/* db() สร้างตารางให้เองตอนเปิดครั้งแรก — เรียกแล้วปิด เหลือไฟล์ที่มี
   สคีมาครบตามที่ db.ts ประกาศไว้จริง ไม่ใช่ตามที่เราจำว่าประกาศไว้ */
const { db } = await import("@/lib/engine/db");
db();
const lite = new DatabaseSync(process.env.PARALLAX_DB_PATH);

const pg = postgres(url, { prepare: false, max: 1 });

type Col = { name: string; notNull: boolean };

const liteCols = (t: string): Col[] => {
  try {
    return (
      lite.prepare(`PRAGMA table_info(${t})`).all() as {
        name: string;
        notnull: number;
      }[]
    ).map((r) => ({ name: r.name, notNull: r.notnull === 1 }));
  } catch {
    return [];
  }
};

const tables = (
  await pg`select tablename from pg_tables where schemaname='public' order by 1`
).map((r) => r.tablename as string);

const problems: string[] = [];

for (const t of tables) {
  const pgCols = (
    await pg`select column_name, is_nullable, column_default
             from information_schema.columns
             where table_schema='public' and table_name=${t}
             order by column_name`
  ).map((r) => ({
    name: r.column_name as string,
    notNull: r.is_nullable === "NO",
    hasDefault: r.column_default != null,
  }));

  const lc = liteCols(t);
  if (!lc.length) {
    problems.push(`${t} — ไม่มีในสคีมา sqlite เลย`);
    continue;
  }

  const liteNames = new Set(lc.map((c) => c.name));
  const pgNames = new Set(pgCols.map((c) => c.name));

  for (const c of pgCols) {
    if (liteNames.has(c.name)) continue;
    /* คอลัมน์ที่มีค่าตั้งต้นและ null ได้ ไม่ทำให้ INSERT ที่ไม่ส่งค่าพัง
       จึงเตือนแต่ไม่ปรับตก — ที่ต้องปรับตกคือ NOT NULL ที่ไม่มีค่าตั้งต้น */
    const fatal = c.notNull && !c.hasDefault;
    problems.push(
      `${t}.${c.name} — มีใน Postgres${fatal ? " (NOT NULL, ไม่มีค่าตั้งต้น)" : ""} แต่ไม่มีใน sqlite`,
    );
  }
  for (const c of lc) {
    if (!pgNames.has(c.name)) {
      problems.push(`${t}.${c.name} — มีใน sqlite แต่ไม่มีใน Postgres`);
    }
  }
}

await pg.end({ timeout: 2 });
lite.close();

if (problems.length) {
  console.error(`สคีมาสองฝั่งไม่ตรงกัน ${problems.length} จุด\n`);
  for (const p of problems) console.error(`  ${p}`);
  console.error(
    "\nแก้ทั้งสองฝั่งให้ตรงกัน แล้วรันใหม่ — ฝั่งที่ไม่ได้ประกาศคือฝั่งที่จะพัง",
  );
  process.exit(1);
}

console.log(`=== สคีมาตรงกันทั้ง ${tables.length} ตาราง ===`);
