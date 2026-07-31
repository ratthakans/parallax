/* ── ชั้นเชื่อมต่อฐานข้อมูล ─────────────────────────────────────

   ทั้งระบบเข้าถึงข้อมูลผ่านไฟล์นี้ไฟล์เดียว มีสองตัวขับอยู่ข้างหลัง:

     node:sqlite   เครื่องพัฒนาและชุดตรวจ — ไม่มี native dependency
                   ไม่ต้องมีเซิร์ฟเวอร์ ไม่ต้องต่อเน็ต
     postgres      Supabase — ของจริง มี RLS บังคับการแยกบัญชี

   ── ทำไมต้องเป็น async ทั้งที่ sqlite ทำงานแบบ sync ได้ ──

   ไดรเวอร์ Postgres ทุกตัวใน Node เป็น async ไม่มีข้อยกเว้น ถ้าปล่อยให้
   ฝั่งเรียกยังเป็น sync ต่อไป การย้ายจะกลายเป็นการแก้ .prepare() 113 จุด
   พร้อมกันในวันเดียวกับที่เปลี่ยนฐานข้อมูล ซึ่งไม่มีทางตรวจได้ว่าอะไรพัง
   เพราะอะไร

   ให้ทุกอย่างเป็น async ก่อนตั้งแต่ยังใช้ sqlite อยู่ — ชุดตรวจทั้งสี่ชุด
   ยังต้องผ่านเหมือนเดิมทุกข้อ พอถึงวันสลับตัวขับ จึงเหลือการเปลี่ยน
   ตัวแปรสภาพแวดล้อมตัวเดียวจริง ๆ

   ── ตัวยึดค่ายังเป็น ? เหมือนเดิม ──

   query ทั้ง 113 จุดเขียนด้วย ? แบบ SQLite ตัวขับ Postgres แปลงเป็น
   $1..$n ให้เอง ข้อความ SQL ในโค้ดจึงไม่ต้องแก้สักตัวอักษร
   ───────────────────────────────────────────────────────────── */

/* import แบบคงที่ ไม่ใช่ await import()

   ตอนแรกเขียนเป็น dynamic import เพื่อไม่ให้โหลดตัวขับที่ไม่ได้ใช้
   แต่ node:sqlite เป็นโมดูลภายนอกในสายตาของ bundler ฝั่งเซิร์ฟเวอร์
   การโหลดมันกลางคันทำให้ได้ "Failed to load external module node:sqlite:
   require is not defined" ตอนรัน ซึ่ง typecheck จับไม่ได้เลย
   lib/db.ts ใช้ import คงที่มาตลอดและไม่เคยมีปัญหา — ทำตามนั้น */
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import postgres from "postgres";

export type Param = string | number | boolean | null;

export interface Sql {
  /** ทุกแถวที่ตรง */
  all<T>(text: string, ...params: Param[]): Promise<T[]>;
  /** แถวแรก หรือ undefined */
  get<T>(text: string, ...params: Param[]): Promise<T | undefined>;
  /** คำสั่งเขียน — changes คือจำนวนแถวที่เปลี่ยนจริง */
  run(text: string, ...params: Param[]): Promise<{ changes: number }>;
  /** SQL ดิบหลายคำสั่ง ไม่มีพารามิเตอร์ — ใช้กับ DDL เท่านั้น */
  exec(text: string): Promise<void>;
}

export interface Db extends Sql {
  /* ── ธุรกรรมเป็น callback ไม่ใช่ BEGIN/COMMIT ลอย ๆ ──

     ของเดิมสั่ง d.exec("BEGIN") บนคอนเนกชันเดียวทั้งกระบวนการ ซึ่งใช้ได้
     กับไฟล์ sqlite ที่มีคอนเนกชันเดียว แต่กับ pool ของ Postgres คำสั่ง
     BEGIN กับคำสั่งที่ตามมาอาจไปคนละคอนเนกชัน แล้วธุรกรรมจะไม่ครอบอะไรเลย
     โดยไม่มีใครรู้ — เงียบและร้ายแรงที่สุดในบรรดาความผิดพลาดทั้งหมด

     callback บังคับให้ทุกคำสั่งข้างในวิ่งบนคอนเนกชันเดียวกันเสมอ */
  tx<T>(fn: (t: Sql) => Promise<T>): Promise<T>;
  /** ปิดการเชื่อมต่อ — ใช้ในชุดตรวจและสคริปต์ ไม่ใช้ในคำขอปกติ */
  close(): Promise<void>;
}

/* ── ? → $1..$n ──
   ข้าม ? ที่อยู่ในสตริงและในคอมเมนต์ ไม่งั้น query ที่มี '?' อยู่ในข้อความ
   จะถูกนับเป็นตัวยึดค่าแล้วจำนวนพารามิเตอร์จะเพี้ยนทั้งคำสั่ง */
export function toDollarPlaceholders(text: string): string {
  let out = "";
  let n = 0;
  let inSingle = false;
  let inDouble = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];

    if (inLineComment) {
      out += c;
      if (c === "\n") inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      out += c;
      if (c === "*" && next === "/") {
        out += next;
        i++;
        inBlockComment = false;
      }
      continue;
    }
    if (!inSingle && !inDouble && c === "-" && next === "-") {
      out += c;
      inLineComment = true;
      continue;
    }
    if (!inSingle && !inDouble && c === "/" && next === "*") {
      out += c;
      inBlockComment = true;
      continue;
    }
    if (c === "'" && !inDouble) {
      inSingle = !inSingle;
      out += c;
      continue;
    }
    if (c === '"' && !inSingle) {
      inDouble = !inDouble;
      out += c;
      continue;
    }
    if (c === "?" && !inSingle && !inDouble) {
      out += `$${++n}`;
      continue;
    }
    out += c;
  }
  return out;
}

/* ── ตัวขับ sqlite ────────────────────────────────────────────
   sync อยู่ข้างใน แต่ยื่นหน้าตาเป็น async ออกมา ฝั่งเรียกจึงเขียน
   เหมือนกันทั้งสองตัวขับ */
async function sqliteDb(path: string): Promise<Db> {
  mkdirSync(dirname(path), { recursive: true });
  const d = new DatabaseSync(path);
  d.exec("PRAGMA journal_mode = WAL");
  d.exec("PRAGMA foreign_keys = ON");

  const api: Sql = {
    async all<T>(text: string, ...params: Param[]) {
      return d.prepare(text).all(...(params as never[])) as T[];
    },
    async get<T>(text: string, ...params: Param[]) {
      return d.prepare(text).get(...(params as never[])) as T | undefined;
    },
    async run(text: string, ...params: Param[]) {
      const r = d.prepare(text).run(...(params as never[]));
      return { changes: Number(r.changes) };
    },
    async exec(text: string) {
      d.exec(text);
    },
  };

  return {
    ...api,
    async tx<T>(fn: (t: Sql) => Promise<T>) {
      d.exec("BEGIN");
      try {
        const out = await fn(api);
        d.exec("COMMIT");
        return out;
      } catch (err) {
        d.exec("ROLLBACK");
        throw err;
      }
    },
    async close() {
      d.close();
    },
  };
}

/* ── ตัวขับ Postgres (Supabase) ───────────────────────────────

   prepare: false เพราะ Supabase วางตัวรวมคอนเนกชัน (Supavisor) ไว้หน้า
   ฐานข้อมูลในโหมด transaction ซึ่งไม่รองรับ prepared statement ที่ผูกกับ
   คอนเนกชัน — เปิดไว้แล้วจะเจอ error เป็นครั้งคราวตอนโหลดสูง ซึ่งหาสาเหตุยาก
   เพราะตอนโหลดต่ำมันไม่เกิด

   ⚠ connection string ต้องเป็นของผู้ใช้ที่ล็อกอิน ไม่ใช่ service role
   ถ้าใช้ service key ที่นี่ RLS จะถูกข้ามทั้งหมดและไฟล์ 0002_rls.sql
   จะไม่ได้กันอะไรเลย ดูหมายเหตุหัวไฟล์นั้น */
async function postgresDb(url: string): Promise<Db> {
  const client = postgres(url, { prepare: false, max: 5, idle_timeout: 20 });

  const wrap = (c: typeof client): Sql => ({
    async all<T>(text: string, ...params: Param[]) {
      return (await c.unsafe(toDollarPlaceholders(text), params)) as unknown as T[];
    },
    async get<T>(text: string, ...params: Param[]) {
      const rows = (await c.unsafe(
        toDollarPlaceholders(text),
        params,
      )) as unknown as T[];
      return rows[0];
    },
    async run(text: string, ...params: Param[]) {
      const rows = await c.unsafe(toDollarPlaceholders(text), params);
      return { changes: rows.count ?? 0 };
    },
    async exec(text: string) {
      await c.unsafe(text);
    },
  });

  return {
    ...wrap(client),
    async tx<T>(fn: (t: Sql) => Promise<T>) {
      return (await client.begin(async (c) =>
        fn(wrap(c as unknown as typeof client)),
      )) as T;
    },
    async close() {
      await client.end();
    },
  };
}

/* ── เลือกตัวขับ ──────────────────────────────────────────────
   มี DATABASE_URL = Postgres · ไม่มี = ไฟล์ sqlite
   ที่อยู่ของไฟล์: /tmp บน Vercel เพราะที่อื่นเขียนไม่ได้ (ดู README) */
let _db: Promise<Db> | null = null;

export function sql(): Promise<Db> {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (url) {
    _db = postgresDb(url);
  } else {
    const path =
      process.env.PARALLAX_DB_PATH ??
      (process.env.VERCEL
        ? "/tmp/parallax/parallax.db"
        : `${process.cwd()}/.data/parallax.db`);
    _db = sqliteDb(path);
  }
  return _db;
}

/** ใช้ในชุดตรวจเมื่อสลับฐานกลางคัน */
export async function resetConnection() {
  if (!_db) return;
  const d = await _db;
  _db = null;
  await d.close();
}

export const usingPostgres = () => Boolean(process.env.DATABASE_URL);
