/* ── ชั้นเชื่อมต่อฐานข้อมูล ─────────────────────────────────────

   ทั้งระบบเข้าถึงข้อมูลผ่านไฟล์นี้ไฟล์เดียว มีสองตัวขับอยู่ข้างหลัง:

     node:sqlite   เครื่องพัฒนาและชุดตรวจ — ไม่มี native dependency
                   ไม่ต้องมีเซิร์ฟเวอร์ ไม่ต้องต่อเน็ต
     postgres      Supabase — ของจริง มี RLS บังคับการแยกบัญชี

   ── ทำไมต้องเป็น async ทั้งที่ sqlite ทำงานแบบ sync ได้ ──

   ไดรเวอร์ Postgres ทุกตัวใน Node เป็น async ไม่มีข้อยกเว้น ถ้าปล่อยให้
   ฝั่งเรียกยังเป็น sync ต่อไป การย้ายจะกลายเป็นการแก้ .prepare() 59 จุด
   (204 คำสั่ง) พร้อมกันในวันเดียวกับที่เปลี่ยนฐานข้อมูล ซึ่งไม่มีทางตรวจได้
   ว่าอะไรพังเพราะอะไร

   ── ตัวยึดค่ายังเป็น ? เหมือนเดิม ──

   query ทุกจุดเขียนด้วย ? แบบ SQLite ตัวขับ Postgres แปลงเป็น $1..$n
   ให้เอง ข้อความ SQL ในโค้ดจึงไม่ต้องแก้สักตัวอักษร
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
import { AsyncLocalStorage } from "node:async_hooks";

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


/* ── json_extract → ตัวดำเนินการ JSON ของ Postgres ────────────

   sqlite มี json_extract(col, '$.key') · Postgres ไม่มีฟังก์ชันชื่อนั้นเลย
   และไม่มีไวยากรณ์กลางที่ทั้งคู่เข้าใจ

   ทางเลือกคือให้ query แต่ละอันรู้ว่าตัวเองรันบนตัวขับไหน ซึ่งพัง
   จุดประสงค์ของ adapter ทั้งหมด — ที่นี่จึงแปลงให้ตอนส่งออก เหมือนที่
   แปลง ? เป็น $n อยู่แล้ว

   ->> คืนค่าเป็น text เสมอ จึง cast เป็น numeric ต่อ เพราะทุกจุดที่ใช้
   อยู่ตอนนี้เอาไปคำนวณ ไม่ใช่เอาไปเทียบสตริง */
export function toJsonOperators(text: string): string {
  return text.replace(
    /json_extract\(\s*([\w.]+)\s*,\s*'\$\.([\w]+)'\s*\)/g,
    "($1::jsonb ->> '$2')::numeric",
  );
}

/** SQL ที่เขียนด้วยภาษาถิ่น sqlite → ภาษาถิ่น Postgres */
export function toPostgres(text: string): string {
  return toDollarPlaceholders(toJsonOperators(text));
}

/* ── คำสั่งที่ช้าผิดปกติต้องมองเห็นได้ ────────────────────────

   บนไฟล์ sqlite ทุกอย่างเร็วจนไม่มีอะไรให้สังเกต พอย้ายไป Postgres
   คำสั่งเดียวที่ช้ากลายเป็นสิ่งที่ทำให้ทั้งคำขอพัง — และ error ที่ได้
   ("canceling statement due to statement timeout") ไม่ได้บอกว่าคำสั่งไหน

   ตั้ง PARALLAX_SLOW_MS เพื่อให้พิมพ์ทุกคำสั่งที่ช้ากว่านั้น
   ปิดไว้โดยปริยาย จึงไม่มีต้นทุนตอนใช้งานปกติ */
const SLOW_MS = Number(process.env.PARALLAX_SLOW_MS ?? 0);

async function timed<T>(text: string, fn: () => Promise<T>): Promise<T> {
  if (!SLOW_MS) return fn();
  const t0 = Date.now();
  try {
    return await fn();
  } finally {
    const ms = Date.now() - t0;
    if (ms >= SLOW_MS) {
      console.warn(`[sql ${ms}ms] ${text.replace(/\s+/g, " ").slice(0, 120)}`);
    }
  }
}

/* ── ตัวขับ sqlite ────────────────────────────────────────────
   sync อยู่ข้างใน แต่ยื่นหน้าตาเป็น async ออกมา ฝั่งเรียกจึงเขียน
   เหมือนกันทั้งสองตัวขับ */
async function sqliteDb(path: string): Promise<Db> {
  mkdirSync(dirname(path), { recursive: true });
  const d = new DatabaseSync(path);
  d.exec("PRAGMA journal_mode = WAL");
  d.exec("PRAGMA foreign_keys = ON");

  /* ── บูลีนต้องกลายเป็น 0/1 ก่อนถึง sqlite ──

     node:sqlite ผูกค่าได้แค่ string · number · bigint · null · Uint8Array
     ส่ง true เข้าไปตรง ๆ จะได้ "Provided value cannot be bound to SQLite
     parameter" ส่วน Postgres มีชนิด boolean จริงและรับ true ได้เลย

     ตอนนี้ยังไม่มีคอลัมน์ไหนในระบบเป็น boolean จริง — is_new_arrival ·
     dry_run · enabled · matured เป็น integer 0/1 ทั้งสองฝั่ง (ตรวจจาก
     information_schema แล้ว) จุดเรียกจึงเขียน `= 1` ได้ตามเดิม

     ตัวแปลงนี้จึงเป็นตาข่ายรับ ไม่ใช่ทางหลัก: วันที่มีใครเพิ่มคอลัมน์
     boolean จริงแล้วส่ง true เข้ามา มันจะทำงานแทนที่จะโยน
     "Provided value cannot be bound to SQLite parameter" ออกมา */
  const bind = (params: Param[]) =>
    params.map((p) => (typeof p === "boolean" ? (p ? 1 : 0) : p)) as never[];

  const api: Sql = {
    async all<T>(text: string, ...params: Param[]) {
      return timed(text, async () => d.prepare(text).all(...bind(params)) as T[]);
    },
    async get<T>(text: string, ...params: Param[]) {
      return timed(
        text,
        async () => d.prepare(text).get(...bind(params)) as T | undefined,
      );
    },
    async run(text: string, ...params: Param[]) {
      return timed(text, async () => {
        const r = d.prepare(text).run(...bind(params));
        return { changes: Number(r.changes) };
      });
    },
    async exec(text: string) {
      await timed(text, async () => d.exec(text));
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
/* ── ขนาด pool ────────────────────────────────────────────────

   หน้าคอนโซลหนึ่งหน้ายิงคำถามที่ไม่ขึ้นต่อกันเจ็ดข้อพร้อมกัน (ดู runMatch)
   และแต่ละข้อเปิดธุรกรรมของตัวเองเพื่อผูก claims ถ้า pool เล็กกว่านั้น
   คำถามที่เหลือจะเข้าคิว แล้วการทำงานขนานที่อุตส่าห์เขียนไว้ก็ไม่เกิดขึ้นจริง

   ไม่ตั้งสูงกว่านี้เพราะบน Vercel ทุกอินสแตนซ์มี pool ของตัวเอง —
   ตัวเลขนี้คูณด้วยจำนวนอินสแตนซ์ที่ตื่นอยู่ ไม่ใช่เพดานรวมของทั้งระบบ */
const POOL_MAX = 12;

async function postgresDb(url: string): Promise<Db> {
  const client = postgres(url, {
    prepare: false,
    max: POOL_MAX,
    idle_timeout: 20,
  });

  const wrap = (c: typeof client): Sql => ({
    async all<T>(text: string, ...params: Param[]) {
      return timed(
        text,
        async () => (await c.unsafe(toPostgres(text), params)) as unknown as T[],
      );
    },
    async get<T>(text: string, ...params: Param[]) {
      return timed(text, async () => {
        const rows = (await c.unsafe(
          toPostgres(text),
          params,
        )) as unknown as T[];
        return rows[0];
      });
    },
    async run(text: string, ...params: Param[]) {
      return timed(text, async () => {
        const rows = await c.unsafe(toPostgres(text), params);
        return { changes: rows.count ?? 0 };
      });
    },
    async exec(text: string) {
      await timed(text, async () => {
        await c.unsafe(text);
      });
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

/* ── ตัวช่วยระดับโมดูล ────────────────────────────────────────

   ถ้าทุกจุดเรียกต้องเขียน (await sql()).all(...) เอง โค้ดจะยาวขึ้นทั้งไฟล์
   โดยไม่ได้อะไรกลับมา สี่ตัวนี้ห่อการรอคอนเนกชันไว้ข้างใน จุดเรียกจึงสั้น
   กว่าของเดิมด้วยซ้ำ:

     เดิม  db().prepare(Q).all(a, b) as Row[]
     ใหม่  await all<Row>(Q, a, b)

   generic ทำให้ไม่ต้อง cast ด้วย as ซึ่งเป็นจุดที่ชนิดข้อมูลเคยหลุดออก
   จากความจริงได้เงียบ ๆ */

/* ── ตัวตนของคำขอ เดินทางไปกับ async context ────────────────

   ถ้าจะให้ RLS ทำงานกับทุก query ต้องมีสองทางเลือก:

     ก. ส่ง handle ของธุรกรรมเข้าไปทุกฟังก์ชัน — แก้ลายเซ็น 60 ตัว
        และผู้เรียกทั้งหมดของมัน
     ข. เก็บไว้ใน async context แล้วให้ตัวช่วยหยิบเอง

   ข. คือเหตุผลที่ AsyncLocalStorage มีอยู่ ลายเซ็นไม่เปลี่ยนสักตัว
   และโค้ดที่ไม่ได้อยู่ในคำขอของผู้ใช้ (สคริปต์ · ชุดตรวจ · งานเบื้องหลัง)
   ก็ยังทำงานเหมือนเดิมเพราะ context ว่าง

   ── ทำไมไม่ตั้ง claims ค้างไว้กับคอนเนกชัน ──

   pool หยิบคอนเนกชันไปใช้ซ้ำข้ามคำขอ ตัวตนที่ค้างอยู่จะกลายเป็นตัวตน
   ของคนถัดไป — ดู asUser() ท้ายไฟล์ */
const identity = new AsyncLocalStorage<{ userId: string }>();

/** ผูกตัวตนให้ทุก query ที่เกิดข้างใน callback นี้ */
export function withIdentity<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  return identity.run({ userId }, fn);
}

/* ── ผูกตัวตนโดยไม่ต้องมี callback ห่อ ──────────────────────

   withIdentity() ต้องห่อโค้ดที่จะรัน ซึ่งใช้ไม่ได้กับ React Server
   Component: layout ไม่ได้เรนเดอร์ page อยู่ในตัวมันเอง — มันคืน element
   ให้ React ไปเรนเดอร์ทีหลัง การห่อใน layout จึงไม่ครอบ query ของ page

   enterWith() ตั้งค่าให้ async context ปัจจุบันและทุกอย่างที่ตามมา
   โดยไม่ต้องห่อ ซึ่งเป็นสิ่งที่มันถูกออกแบบมาเพื่อจุดเข้าของคำขอพอดี

   เรียกจาก activeTenantId() ที่ทุกหน้าและเกือบทุก action เรียกอยู่แล้ว
   ก่อนแตะข้อมูลใด ๆ — จุดเดียว ครอบทั้งคำขอ */
export function enterIdentity(userId: string) {
  identity.enterWith({ userId });
}

/** ธุรกรรมที่กำลังเปิดอยู่ของคำขอนี้ ถ้ามี */
const activeTx = new AsyncLocalStorage<Sql>();

/* ตัวช่วยทุกตัวเดินผ่านที่นี่ ลำดับคือ:
     อยู่ในธุรกรรมแล้ว   → ใช้ handle นั้น (ไม่งั้นจะหลุดออกนอกธุรกรรม)
     มีตัวตนและใช้ Postgres → เปิดธุรกรรมสั้น ๆ พร้อม claims
     นอกนั้น              → ต่อตรงเหมือนเดิม */
async function scoped<T>(fn: (t: Sql) => Promise<T>): Promise<T> {
  const open = activeTx.getStore();
  if (open) return fn(open);
  const who = identity.getStore();
  if (who && usingPostgres()) return asUser(who.userId, fn);
  return fn(await sql());
}

export async function all<T>(text: string, ...params: Param[]): Promise<T[]> {
  return scoped((t) => t.all<T>(text, ...params));
}

export async function get<T>(
  text: string,
  ...params: Param[]
): Promise<T | undefined> {
  return scoped((t) => t.get<T>(text, ...params));
}

export async function run(
  text: string,
  ...params: Param[]
): Promise<{ changes: number }> {
  return scoped((t) => t.run(text, ...params));
}

export async function exec(text: string): Promise<void> {
  return (await sql()).exec(text);
}

export async function tx<T>(fn: (t: Sql) => Promise<T>): Promise<T> {
  /* ธุรกรรมซ้อนธุรกรรมไม่ได้ — ถ้าเปิดอยู่แล้วให้ใช้ตัวเดิมต่อ */
  const open = activeTx.getStore();
  if (open) return fn(open);
  const who = identity.getStore();
  if (who && usingPostgres()) return asUser(who.userId, fn);
  return (await sql()).tx((t) => activeTx.run(t, () => fn(t)));
}

/* ── แทรกหลายแถวด้วยคำสั่งเดียว ───────────────────────────────

   บนไฟล์ sqlite การแทรกทีละแถวไม่ต่างอะไรมาก เพราะทุกอย่างอยู่ในโปรเซส
   เดียวกัน แต่กับ Postgres ทุกคำสั่งคือการไปกลับข้ามเครือข่าย — seed ชุด
   ตัวอย่างแทรกหลายพันแถว วัดแล้วเกินสิบนาทีก็ยังไม่จบ เทียบกับสี่วินาที
   บน sqlite

   และมันไม่ใช่แค่ข้อมูลเดโม commitImport แทรกด้วยรูปแบบเดียวกัน ร้านที่
   อัปโหลด CSV หมื่นแถวจะเจอเหมือนกันเป๊ะ

   ── ทำไมต้องหั่นเป็นก้อน ──

   sqlite รับพารามิเตอร์ได้สูงสุด 32,766 ตัวต่อคำสั่ง (วัดแล้ว: 16,383 แถว
   ที่สองคอลัมน์ผ่าน 20,000 ไม่ผ่าน) ส่วน Postgres รับ 65,535 เกณฑ์จึงเป็น
   ของ sqlite และคำนวณจากจำนวนคอลัมน์จริง ไม่ใช่ตัวเลขตายตัวที่จะพังเงียบ ๆ
   วันที่มีคนเพิ่มคอลัมน์

   เผื่อไว้ที่ 30,000 เพราะบางคำสั่งมีพารามิเตอร์อื่นนอกเหนือจากแถว */
const MAX_PARAMS = 30_000;

export async function insertMany(
  q: Sql,
  table: string,
  columns: string[],
  rows: Param[][],
  opts: { onConflict?: string } = {},
): Promise<number> {
  if (!rows.length) return 0;

  const perRow = columns.length;
  const chunkSize = Math.max(1, Math.floor(MAX_PARAMS / perRow));
  const placeholder = `(${columns.map(() => "?").join(",")})`;
  const head = `INSERT INTO ${table} (${columns.join(",")}) VALUES `;
  const tail = opts.onConflict ? ` ${opts.onConflict}` : "";

  let written = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const sql = head + chunk.map(() => placeholder).join(",") + tail;
    const r = await q.run(sql, ...chunk.flat());
    written += r.changes;
  }
  return written;
}

/* ── ทำให้ RLS ทำงานจริง โดยไม่แตะ query สักตัว ─────────────────

   นโยบายทั้ง 39 ข้อใน 0002_rls.sql ตั้งอยู่บน auth.uid() ซึ่ง Postgres
   อ่านจาก current_setting('request.jwt.claims')->>'sub' — ไม่ใช่จาก
   ชื่อผู้ใช้ที่ต่อฐาน

   แปลว่าเราคงคอนเนกชันเดิม (postgres ผ่าน Supavisor) และ SQL ทั้ง 204
   คำสั่งไว้ได้ทั้งหมด แค่บอกฐานข้อมูลว่า "คำขอนี้เป็นของ user คนนี้"
   ก่อนเริ่มธุรกรรม จากนั้นนโยบายจะทำงานเองทุกข้อ

   ทางเลือกอื่นคือย้ายไปเรียกผ่าน PostgREST ของ Supabase ซึ่งพก JWT
   ไปเอง แต่นั่นแปลว่าเขียน query ใหม่ทั้ง 204 ตัว

   ── SET LOCAL ไม่ใช่ SET ──

   LOCAL ผูกกับธุรกรรม พอจบธุรกรรมค่าหายไปเอง ถ้าใช้ SET เฉย ๆ ค่าจะ
   ค้างอยู่กับคอนเนกชัน และคอนเนกชันนั้นถูกคืนเข้า pool แล้วหยิบไปใช้กับ
   คำขอของคนอื่นต่อ — ซึ่งแปลว่าคนหนึ่งจะอ่านข้อมูลในนามอีกคน
   นี่คือความผิดพลาดที่แย่ที่สุดที่เป็นไปได้ในไฟล์นี้

   ── ทำไมต้องตรวจรูปแบบ uuid ──

   SET LOCAL รับพารามิเตอร์ไม่ได้ ค่าจึงต้องต่อเข้าไปในสตริง SQL ตรง ๆ
   userId มาจาก JWT ที่ Supabase ตรวจแล้วก็จริง แต่การต่อสตริงลง SQL
   ต้องมีด่านของตัวเองเสมอ ไม่ใช่พึ่งว่าต้นทางสะอาด */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function asUser<T>(
  userId: string,
  fn: (t: Sql) => Promise<T>,
): Promise<T> {
  if (!UUID.test(userId)) throw new Error("รหัสผู้ใช้ไม่ใช่รูปแบบ uuid");

  /* sqlite ไม่มี RLS — บนเครื่องพัฒนาจึงรันตรง ๆ การแยกบัญชียังทำงาน
     เพราะทุก query มี WHERE tenant_id อยู่แล้ว RLS เป็นชั้นที่สอง
     ไม่ใช่ชั้นเดียว */
  if (!usingPostgres()) return tx(fn);

  const d = await sql();
  return d.tx(async (t) => {
    /* ── สองคำสั่ง ส่งเป็นก้อนเดียว ──

       เดิมเป็น t.run() สองครั้ง = สองรอบไป-กลับ ซึ่งฟังดูเล็กจนกระทั่ง
       วัดจริง: หน้าบรีฟหนึ่งหน้ายิง 35 query แปลว่า 70 คำสั่งนี้กินไป
       7.4 วินาที — เกือบครึ่งของเวลาฐานข้อมูลทั้งหน้า

       exec() ส่งข้อความดิบโดยไม่มีพารามิเตอร์ ตัวขับจึงใช้ simple protocol
       ซึ่งรับหลายคำสั่งคั่นด้วย ; ได้ในรอบเดียว */
    await t.exec(
      `SET LOCAL role authenticated;` +
        ` SET LOCAL request.jwt.claims = '{"sub":"${userId}","role":"authenticated"}'`,
    );
    return activeTx.run(t, () => fn(t));
  });
}
