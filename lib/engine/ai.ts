import { all, exec, get, run, usingPostgres } from "@/lib/engine/sql";
import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import type { Play } from "@/lib/shared/types";
import {
  IMPORT_FIELDS,
  type ColumnMapping,
  type ImportField,
} from "@/lib/shared/ingest-types";

export { IMPORT_FIELDS, FIELD_LABEL } from "@/lib/shared/ingest-types";
export type { ColumnMapping, ImportField } from "@/lib/shared/ingest-types";

/* ── ชั้น AI ────────────────────────────────────────────────────
   AI อยู่ตรงไหน — ตาม Play Engine §8

   ใช้      แม็ปคอลัมน์ตอน import · เดาบทบาทสินค้า · เขียนข้อความ
            สามโทน · สรุปบรีฟเช้าเป็นภาษาคน · อธิบายว่าทำไมแนะนำ
   ไม่ใช้   เลือกว่าใครอยู่ในกลุ่ม · คำนวณคะแนนและจัดอันดับ ·
            คำนวณ lift และช่วงความเชื่อมั่น · ตัดสินใจส่งหรือไม่ส่ง ·
            บังคับใช้ cooldown และเพดาน

   ข้อบังคับเรื่องต้นทุน (F3) — เรียกหนึ่งครั้งต่อแคมเปญ ไม่ใช่ต่อคน
   ทุกผลลัพธ์ถูก cache ด้วย hash ของ input จึงเรียกซ้ำไม่เสียเงินซ้ำ

   ถ้าไม่มี ANTHROPIC_API_KEY ทุกฟังก์ชันจะคืนค่าจากสูตร
   deterministic แทน — demo ไม่พังและไม่มีค่าใช้จ่าย
   ───────────────────────────────────────────────────────────── */

const MODEL = "claude-opus-5";

export type AiSource = "ai" | "fallback" | "cache";

export type AiResult<T> = {
  value: T;
  source: AiSource;
  /** เหตุผลที่ตกไปใช้ fallback — แสดงตรง ๆ ในหน้าจอ */
  note?: string;
};

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

/* ── cache ────────────────────────────────────────────────────
   ตารางเดียวเก็บผลของทุกงาน AI คีย์คือ hash ของ (kind + input)
   ───────────────────────────────────────────────────────────── */

/* ── ใครเป็นเจ้าของตาราง ai_cache ──────────────────────────────

   ฝั่ง Postgres เป็นของ supabase/migrations/0001_schema.sql
   ฝั่ง sqlite สร้างที่นี่ เพราะไม่มีตัวรัน migration บนเครื่องพัฒนา

   ── บทเรียนจากการย้ายไฟล์แรก ──

   ตอนแรกที่นี่สั่ง CREATE TABLE IF NOT EXISTS ทั้งสองตัวขับ แล้วบน
   Postgres มันเงียบ ๆ ไม่ทำอะไรเพราะตารางมีอยู่แล้วจาก migration —
   แต่ migration ประกาศคอลัมน์ไว้เป็น value jsonb ส่วนโค้ดเขียน
   payload กับ model การเขียนแคชจึงพังทุกครั้ง

   และมันพังแบบมองไม่เห็น เพราะ ask() จับ error แล้วตกไปเส้น fallback
   ซึ่งหน้าตาเหมือนทำงานปกติทุกประการ — แค่ไม่มีอะไรถูก cache อีกเลย
   และทุกคำขอเสียเงินเรียก API ใหม่

   เมื่อสองแหล่งสคีมาแตกกัน ผู้แพ้คือฝั่งที่ไม่ได้ประกาศ ไม่ใช่ฝั่งที่ผิด */
async function ensureCache() {
  if (usingPostgres()) return;
  await exec(`
    CREATE TABLE IF NOT EXISTS ai_cache (
      key TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      payload TEXT NOT NULL,
      model TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

function cacheKey(kind: string, input: unknown): string {
  return createHash("sha256")
    .update(`${kind}:${MODEL}:${JSON.stringify(input)}`)
    .digest("hex")
    .slice(0, 32);
}

async function readCache<T>(key: string): Promise<T | null> {
  await ensureCache();
  const row = await get<{ payload: string }>(
    "SELECT payload FROM ai_cache WHERE key = ?",
    key,
  );
  return row ? (JSON.parse(row.payload) as T) : null;
}

async function writeCache(key: string, kind: string, value: unknown) {
  await ensureCache();
  await run(
    `INSERT INTO ai_cache (key, kind, payload, model, created_at)
     VALUES (?,?,?,?,?)
     ON CONFLICT(key) DO UPDATE SET payload = excluded.payload`,
    key,
    kind,
    JSON.stringify(value),
    MODEL,
    new Date().toISOString(),
  );
}

export async function aiCacheStats(): Promise<{ kind: string; n: number }[]> {
  await ensureCache();
  /* COUNT(*) กลับมาเป็น bigint จากไดรเวอร์ Postgres ซึ่ง JSON.stringify
     ทำเป็นสตริง ส่วน sqlite ให้ number มาตรง ๆ — Number() ทำให้ทั้งสอง
     ตัวขับคืนชนิดเดียวกัน ไม่งั้นหน้า settings จะแสดง "12" บ้าง 12 บ้าง */
  const rows = await all<{ kind: string; n: number | string }>(
    "SELECT kind, COUNT(*) AS n FROM ai_cache GROUP BY kind",
  );
  return rows.map((r) => ({ kind: r.kind, n: Number(r.n) }));
}

export async function clearAiCache() {
  await ensureCache();
  await exec("DELETE FROM ai_cache");
}

/* ── ตัวเรียกกลาง ─────────────────────────────────────────────
   ทุกงานผ่านที่นี่ จึงมี cache · fallback · การจับ error
   ที่เหมือนกันหมด และนับจำนวนการเรียกได้จากที่เดียว
   ───────────────────────────────────────────────────────────── */

type AskOptions<T> = {
  kind: string;
  input: unknown;
  system: string;
  prompt: string;
  /** JSON Schema — บังคับรูปร่างผลลัพธ์ ไม่ต้อง parse เอง */
  schema: Record<string, unknown>;
  fallback: () => T;
  maxTokens?: number;
};

async function ask<T>(opts: AskOptions<T>): Promise<AiResult<T>> {
  const key = cacheKey(opts.kind, opts.input);
  const cached = await readCache<T>(key);
  if (cached) return { value: cached, source: "cache" };

  if (!aiConfigured()) {
    return {
      value: opts.fallback(),
      source: "fallback",
      note: "ANTHROPIC_API_KEY is not set — using templates",
    };
  }

  try {
    const res = await client().messages.create({
      model: MODEL,
      max_tokens: opts.maxTokens ?? 2000,
      // งานเหล่านี้สั้นและตรงไปตรงมา ไม่ต้องใช้ effort สูง
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: opts.schema },
      },
      system: opts.system,
      messages: [{ role: "user", content: opts.prompt }],
    });

    // safety classifier ปฏิเสธได้ ต้องเช็คก่อนอ่าน content
    if (res.stop_reason === "refusal") {
      return {
        value: opts.fallback(),
        source: "fallback",
        note: "The model refused this request — using templates",
      };
    }

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const value = JSON.parse(text) as T;
    await writeCache(key, opts.kind, value);
    return { value, source: "ai" };
  } catch (err) {
    let note = "The AI call failed — using templates";
    if (err instanceof Anthropic.RateLimitError) note = "Rate limited — using templates";
    else if (err instanceof Anthropic.AuthenticationError) note = "Invalid API key — using templates";
    else if (err instanceof Anthropic.APIConnectionError) note = "Could not connect — using templates";
    console.error("[ai]", opts.kind, err);
    return { value: opts.fallback(), source: "fallback", note };
  }
}

/* ══════════════════════════════════════════════════════════════
   1 · แม็ปคอลัมน์ตอน import
   ไฟล์จาก POS แต่ละยี่ห้อตั้งชื่อคอลัมน์ไม่เหมือนกันเลย
   งานนี้คือที่ที่ AI คุ้มที่สุด เพราะกฎเขียนตายตัวไม่ได้
   ══════════════════════════════════════════════════════════════ */

const MAPPING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    mappings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          column: { type: "string" },
          field: { type: "string", enum: [...IMPORT_FIELDS] },
          confidence: { type: "number" },
          why: { type: "string" },
        },
        required: ["column", "field", "confidence", "why"],
      },
    },
  },
  required: ["mappings"],
};

/* ── สูตรสำเร็จ — จับคำในหัวคอลัมน์ ทั้งไทยและอังกฤษ ─────────────

   ให้คะแนนความจำเพาะ แล้วจับคู่ที่คะแนนสูงสุดก่อน ไม่ใช่ไล่คอลัมน์
   ซ้ายไปขวาแล้วใครถึงก่อนได้ก่อน

   เหตุผลจากไฟล์จริง: `ราคาต่อหน่วย` มาก่อน `ยอดสุทธิ` ในไฟล์ POS ทั่วไป
   ถ้าใครถึงก่อนได้ก่อน คำว่า "ราคา" จะคว้า field total ไป แล้ว `ยอดสุทธิ`
   ตกไปเป็น ignore — รายได้ที่นำเข้าจะเป็นราคาต่อหน่วยแทนยอดจริง
   ผิดทั้งจำนวนชิ้นและส่วนลด สำหรับผลิตภัณฑ์ที่ขายการวัดส่วนต่างรายได้
   การนำเข้าคอลัมน์รายได้ผิดคือความผิดพลาดที่ทำให้ทุกตัวเลขหลังจากนั้นผิดตาม */

type Rule = { field: ImportField; re: RegExp; score: number };

const RULES: Rule[] = [
  // ── ตัวระบุลูกค้า — รหัสลูกค้าชัดเจนกว่าเบอร์โทร ──
  { field: "customer_ref", re: /(customer.?(id|code|no)|cust.?no|รหัสลูกค้า|รหัสสมาชิก|member.?(id|no)|เลขสมาชิก)/i, score: 10 },
  { field: "customer_ref", re: /(phone|tel|mobile|เบอร์|โทร|email|อีเมล|e-?mail)/i, score: 6 },

  { field: "customer_name", re: /(customer.?name|ชื่อลูกค้า|ชื่อ-?นามสกุล|full.?name)/i, score: 10 },
  { field: "customer_name", re: /(ชื่อ|name)/i, score: 4 },

  { field: "occurred_at", re: /(occurred|invoice.?date|order.?date|วันที่ซื้อ|วันที่ขาย|วันที่ทำรายการ)/i, score: 10 },
  { field: "occurred_at", re: /(date|วันที่|เวลา|time)/i, score: 6 },

  // ── เงิน — ยอดสุทธิต้องชนะราคาต่อหน่วยเสมอ ──
  { field: "total", re: /(ยอดสุทธิ|ยอดรวมสุทธิ|รวมสุทธิ|รวมทั้งสิ้น|net.?(total|amount|sales)|grand.?total|line.?total)/i, score: 12 },
  { field: "total", re: /(ยอดรวม|ยอดขาย|ยอดเงิน|จำนวนเงิน|total|amount|paid|sales)/i, score: 8 },
  { field: "total", re: /(ยอด)/i, score: 5 },

  { field: "unit_price", re: /(ราคาต่อหน่วย|ราคา\/หน่วย|ราคาต่อชิ้น|unit.?price|price.?per.?unit)/i, score: 12 },

  { field: "list_price", re: /(list.?price|ราคาป้าย|ราคาปก|ราคาเต็ม|msrp|full.?price|ก่อนลด|before.?discount)/i, score: 12 },

  { field: "discount", re: /(ส่วนลด|discount|ลดราคา|promo.?discount)/i, score: 12 },

  { field: "product_name", re: /(product.?name|item.?name|ชื่อสินค้า|รายการสินค้า)/i, score: 10 },
  { field: "product_name", re: /(product|item|sku|สินค้า|รายการ)/i, score: 6 },

  { field: "product_category", re: /(category|หมวด|ประเภทสินค้า|กลุ่มสินค้า|product.?type)/i, score: 10 },

  { field: "qty", re: /(qty|quantity|จำนวนชิ้น|จำนวนหน่วย|units|pcs)/i, score: 10 },
  { field: "qty", re: /(จำนวน)/i, score: 6 },

  { field: "channel", re: /(channel|ช่องทาง|sales.?channel)/i, score: 10 },
  { field: "channel", re: /(source|สาขา|branch|store)/i, score: 6 },
];

export function mapColumnsHeuristic(headers: string[]): ColumnMapping {
  // คะแนนสูงสุดของแต่ละคู่ (คอลัมน์ × field)
  const scored: { col: number; field: ImportField; score: number }[] = [];
  headers.forEach((column, col) => {
    const best = new Map<ImportField, number>();
    for (const r of RULES) {
      if (!r.re.test(column)) continue;
      if ((best.get(r.field) ?? 0) < r.score) best.set(r.field, r.score);
    }
    for (const [field, score] of best) scored.push({ col, field, score });
  });

  // จับคู่แบบละโมบจากคะแนนสูงไปต่ำ — หนึ่ง field ต่อหนึ่งคอลัมน์
  scored.sort((a, b) => b.score - a.score || a.col - b.col);
  const takenField = new Set<ImportField>();
  const takenCol = new Set<number>();
  const chosen = new Map<number, { field: ImportField; score: number }>();
  for (const s of scored) {
    if (takenField.has(s.field) || takenCol.has(s.col)) continue;
    takenField.add(s.field);
    takenCol.add(s.col);
    chosen.set(s.col, { field: s.field, score: s.score });
  }

  return {
    mappings: headers.map((column, col) => {
      const hit = chosen.get(col);
      if (!hit) {
        return {
          column,
          field: "ignore" as ImportField,
          confidence: 0.3,
          why: "No confident guess",
        };
      }
      return {
        column,
        field: hit.field,
        // คำที่จำเพาะให้ความมั่นใจสูงกว่าคำกว้าง ๆ
        confidence: hit.score >= 10 ? 0.75 : 0.55,
        why: "Matched the header text",
      };
    }),
  };
}

/* ── ปิดหน้าค่าตัวอย่างก่อนส่งออกนอกเครื่อง ────────────────────

   ก่อนหน้านี้ mapColumns ส่งสามแถวแรกของ CSV ดิบเข้า prompt ตรง ๆ
   ไฟล์ export จาก POS มีชื่อลูกค้ากับเบอร์โทรอยู่ในนั้น — ข้อมูลส่วนบุคคล
   ของลูกค้าของลูกค้าเรา ออกไปหาบริการภายนอกโดยไม่มีใครขออนุญาต
   บนผลิตภัณฑ์ที่หน้า /trust ขายเรื่อง PDPA โดยเฉพาะ

   ยังไม่เคยเกิดขึ้นจริงเพราะเครื่องนี้ไม่เคยมี ANTHROPIC_API_KEY
   ทุกครั้งที่ผ่านมาจึงวิ่งเส้น fallback — แต่มันจะเปิดทันทีที่ตั้งคีย์

   ── ทำไมยังแม็ปได้แม่นเท่าเดิม ──

   สิ่งที่ระบบต้องดูจากค่าตัวอย่างคือ *รูปทรง* ไม่ใช่ *เนื้อ*: คอลัมน์นี้
   เป็นวันที่รูปแบบไหน · ตัวเลขนี้เป็นยอดสุทธิหรือราคาต่อหน่วย · ช่องนี้
   ว่างบ่อยไหม ทั้งหมดนั้นอ่านได้จากรูปทรง

   ตัวเลขกับวันที่จึงส่งไปทั้งค่า (ไม่ระบุตัวบุคคล และเป็นสัญญาณที่
   system prompt บอกเองว่าต้องใช้แยกคอลัมน์เงิน) ส่วนข้อความอิสระ —
   ชื่อ ที่อยู่ อีเมล — เหลือแต่โครง และเบอร์โทรเหลือแค่สองหลักแรก
   ซึ่งพอให้รู้ว่าเป็นเบอร์มือถือไทย โดยไม่ชี้ไปที่ใคร */

const DATE_LIKE = /^\s*\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}([ T]\d{1,2}:\d{2}(:\d{2})?)?\s*$/;
const NUMBER_LIKE = /^\s*[-+]?[฿$€]?\s*\d[\d,\s]*(\.\d+)?\s*%?\s*$/;
/* ── เบอร์โทรต้องตรวจ *ก่อน* จำนวน ──
   "0812345678" เข้าเกณฑ์ NUMBER_LIKE ทุกประการ (ตัวเลขล้วน ไม่มีวรรคตอน)
   ถ้าตรวจจำนวนก่อน เบอร์มือถือที่พิมพ์ติดกันจะหลุดออกไปทั้งเบอร์ —
   ซึ่งเป็นเคสที่การปิดหน้านี้มีไว้ป้องกันโดยตรง

   เกณฑ์: ตัวเลขอย่างน้อยเก้าหลัก และขึ้นต้นด้วย 0 หรือ + หรือมีวรรคตอนคั่น
   ยอดเงินไทยแทบไม่มีเก้าหลักติดกันโดยไม่มีคอมมา และไม่ขึ้นต้นด้วยศูนย์ */
const PHONE_LIKE = /^\s*\+?[\d\s()-]{8,}\s*$/;

function looksLikePhone(v: string): boolean {
  if (!PHONE_LIKE.test(v)) return false;
  const digits = v.replace(/\D/g, "");
  if (digits.length < 9) return false;
  return /^[0+]/.test(v.trim()) || /[\s()-]/.test(v.trim());
}

export function maskCell(v: string): string {
  if (v === "") return "";
  if (v.length > 64) v = v.slice(0, 64);

  /* วันที่ — ส่งทั้งค่า รูปแบบวันที่คือสัญญาณที่ต้องอ่านให้ออก */
  if (DATE_LIKE.test(v)) return v;

  /* เบอร์โทร — ต้องมาก่อนจำนวน เหลือสองหลักแรกพอให้รู้ว่าเป็นมือถือไทย */
  if (looksLikePhone(v)) {
    const d = v.replace(/\D/g, "");
    return d.slice(0, 2) + "X".repeat(d.length - 2);
  }

  /* จำนวนเงิน — ส่งทั้งค่า system prompt ต้องใช้แยกยอดสุทธิจากราคาต่อหน่วย */
  if (NUMBER_LIKE.test(v)) return v;

  /* ข้อความอิสระ — เหลือแต่โครง วรรคตอนคงไว้เพราะบอกรูปแบบได้
     (เช่น มี @ คืออีเมล มี / คือรหัสอ้างอิง) */
  return v.replace(/[^\s@/\-_.,:#()]/gu, (ch) =>
    /\d/.test(ch) ? "9" : /[\u0E00-\u0E7F]/.test(ch) ? "ก" : "x",
  );
}

export async function mapColumns(
  headers: string[],
  sampleRows: string[][],
): Promise<AiResult<ColumnMapping>> {
  const masked = sampleRows.slice(0, 3).map((r) => r.map(maskCell));

  return ask<ColumnMapping>({
    kind: "map_columns",
    input: { headers, sample: masked },
    schema: MAPPING_SCHEMA,
    maxTokens: 2000,
    system:
      "You map the columns of a sales export from a Thai POS system. " +
      "Headers may be Thai, English or mixed. Reply as JSON matching the schema only. " +
      "When unsure, use the field \"ignore\" and give a low confidence. " +
      "Separate the money columns carefully: total = the row net after discount " +
      "(for example ยอดสุทธิ, รวมทั้งสิ้น, net amount) · " +
      "unit_price = price per unit · list_price = the pre-discount ticket price · " +
      "discount = the discount. When both a net total and a unit price exist, total " +
      "must always be the net column — never map a unit price to total. " +
      "When both a customer code and a phone number exist, customer_ref is the code. " +
      "Each field maps to at most one column.",
    prompt: `Headers: ${JSON.stringify(headers)}

First three sample rows. Letters and digits in free text have been replaced
with placeholders to keep customer data out of this request — read them for
shape, not meaning. Dates and amounts are unaltered.
${masked.map((r) => JSON.stringify(r)).join("\n")}

Map every column and give a short reason in English.`,
    fallback: () => mapColumnsHeuristic(headers),
  });
}

/* ══════════════════════════════════════════════════════════════
   2 · เดาบทบาทสินค้า — anchor / attachment / consumable
   group_role คือสิ่งที่ทำให้ K3 K4 R2 ทำงานได้ (Play Engine §5)
   ══════════════════════════════════════════════════════════════ */

export type RoleGuess = {
  products: { name: string; role: "anchor" | "attachment" | "consumable"; why: string }[];
};

const ROLE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    products: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          role: { type: "string", enum: ["anchor", "attachment", "consumable"] },
          why: { type: "string" },
        },
        required: ["name", "role", "why"],
      },
    },
  },
  required: ["products"],
};

export function guessRolesHeuristic(
  items: { name: string; price: number }[],
): RoleGuess {
  const prices = items.map((i) => i.price).sort((a, b) => a - b);
  const p70 = prices[Math.floor(prices.length * 0.7)] ?? 0;
  const p30 = prices[Math.floor(prices.length * 0.3)] ?? 0;
  return {
    products: items.map((i) => ({
      name: i.name,
      role: i.price >= p70 ? "anchor" : i.price <= p30 ? "consumable" : "attachment",
      why: "Split by price band",
    })),
  };
}

export async function guessProductRoles(
  items: { name: string; price: number; category: string }[],
): Promise<AiResult<RoleGuess>> {
  return ask<RoleGuess>({
    kind: "product_roles",
    input: items,
    schema: ROLE_SCHEMA,
    maxTokens: 3000,
    system:
      "You assign product roles for a CRM system. " +
      "anchor = the considered, high-price item. " +
      "attachment = what is usually bought after an anchor. " +
      "consumable = used up and rebought on a cycle. " +
      "Reply as JSON matching the schema only, with a short reason in English",
    prompt: `Products:
${items.map((i) => `- ${i.name} · category ${i.category} · list price ${i.price}`).join("\n")}

Assign a role to every item.`,
    fallback: () => guessRolesHeuristic(items),
  });
}

/* ══════════════════════════════════════════════════════════════
   3 · เขียนข้อความสามโทน — หนึ่งครั้งต่อแคมเปญ (F3)
   นี่คือการตัดสินใจที่กำหนดว่ามาร์จิ้นจะเป็น 70% หรือ 40%
   ══════════════════════════════════════════════════════════════ */

export type CopySet = { tone: string; body: string }[];

/* คำเรียกของบัญชี — ส่งเข้าไปใน prompt ทุกครั้ง

   ถ้าไม่ส่ง โมเดลจะเขียนว่า "ลูกค้า" และ "สินค้าที่คุณเคยซื้อ" ให้ทุกบัญชี
   ข้อความที่พรรคการเมืองส่งหาสมาชิกจะอ่านเหมือนโปรโมชันร้านค้า
   ซึ่งผิดทั้งน้ำเสียงและข้อเท็จจริง */
export type VocabCtx = {
  person: string;
  purchase: string;
  item: string;
  orgKind: string;
  /* คำไทยชุดเดียวกัน — คอนโซลกับข้อความ fallback ใช้ชุดนี้
     ส่วน prompt ยังส่งคำอังกฤษไปด้วยเพราะช่วยให้โมเดลเข้าใจบริบทธุรกิจ */
  th: { person: string; purchase: string; item: string; orgKind: string; purchaseVerb: string };
};

const DEFAULT_VOCAB: VocabCtx = {
  person: "customer",
  purchase: "purchase",
  item: "product",
  orgKind: "shop",
  th: {
    person: "ลูกค้า",
    purchase: "การซื้อ",
    item: "สินค้า",
    orgKind: "ร้าน",
    purchaseVerb: "ซื้อ",
  },
};

const COPY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    variants: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          tone: { type: "string", enum: ["formal", "warm", "playful"] },
          body: { type: "string" },
        },
        required: ["tone", "body"],
      },
    },
  },
  required: ["variants"],
};

/** ต้องมีตัวแปรเหล่านี้เท่านั้น — แทนค่ารายบุคคลตอนส่ง ไม่เรียก AI ต่อคน */
const ALLOWED_VARS = ["{{name}}", "{{last_product}}"];

export function writeCopyFallback(
  play: Play,
  discountPct: number,
  v: VocabCtx = DEFAULT_VOCAB,
): CopySet {
  const offerLine =
    discountPct > 0
      ? `Take ${discountPct}% off this round`
      : "You get first access";
  const tones = [
    {
      tone: "formal",
      open: "Dear {{name}},",
      mid: `the ${v.orgKind} would like to invite you.`,
    },
    { tone: "warm", open: "Hi {{name}},", mid: "we wanted you to know first." },
    { tone: "playful", open: "{{name}} 👋", mid: "worth a look?" },
  ];
  return tones.map((t) => ({
    tone: t.tone,
    body: `${t.open}\n${play.copy_brief.angle} ${t.mid}\nYour last ${v.item} — {{last_product}}\n${offerLine}`,
  }));
}

export async function writeCopy(
  play: Play,
  ctx: {
    discountPct: number;
    audienceSize: number;
    businessName: string;
    vocab?: VocabCtx;
  },
): Promise<AiResult<CopySet>> {
  const vc = ctx.vocab ?? DEFAULT_VOCAB;
  const res = await ask<{ variants: CopySet }>({
    kind: "campaign_copy",
    input: { play: play.id, ...ctx },
    schema: COPY_SCHEMA,
    maxTokens: 2500,
    system:
      `You write LINE messages for ${vc.orgKind} "${ctx.businessName}". ` +
      `They go to existing ${vc.person}s. ` +
      "Write three tones: formal, warm, playful. " +
      "Each message is at most four lines, in natural English as the owner would write it. " +
      "Only {{name}} and {{last_product}} may be used, and every message must include {{name}}. " +
      "Never add a price, number or date you were not given. " +
      "Reply as JSON matching the schema only",
    prompt: `Campaign: ${play.name}
Reason to reach out: ${play.logic}
Angle to use: ${play.copy_brief.angle}
Avoid: ${play.copy_brief.avoid.join(" · ") || "none"}
Offer: ${ctx.discountPct > 0 ? `up to ${ctx.discountPct}% off` : "No discount — use access or status instead"}
Audience: ${ctx.audienceSize} ${vc.person}s
Address the recipient as "${vc.person}" and call what they paid for a "${vc.item}"

Write all three tones.`,
    fallback: () => ({ variants: writeCopyFallback(play, ctx.discountPct, vc) }),
  });

  /* ตรวจผลลัพธ์จาก AI ก่อนใช้ — ถ้ามีตัวแปรที่ไม่รู้จัก การแทนค่า
     ตอนส่งจะเหลือ {{...}} ค้างในข้อความที่ลูกค้าได้รับ */
  const variants = res.value.variants ?? [];
  const bad = variants.find((v) => {
    const vars = v.body.match(/\{\{\w+\}\}/g) ?? [];
    return vars.some((x) => !ALLOWED_VARS.includes(x)) || !v.body.includes("{{name}}");
  });
  if (bad || variants.length !== 3) {
    return {
      value: writeCopyFallback(play, ctx.discountPct),
      source: "fallback",
      note: "The AI copy used unknown variables — fell back to templates",
    };
  }
  return { value: variants, source: res.source, note: res.note };
}

/* ══════════════════════════════════════════════════════════════
   4 · สรุปบรีฟเช้าเป็นภาษาคน
   เจ้าของร้านไม่ต้องรู้ว่า RFM คืออะไร
   ══════════════════════════════════════════════════════════════ */

const BRIEF_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: { summary: { type: "string" } },
  required: ["summary"],
};

export type BriefInput = {
  businessName: string;
  slipping: number;
  unreachable: number;
  items: { name: string; size: number; value: number; why: string }[];
  vocab?: VocabCtx;
};

export function summariseBriefFallback(input: BriefInput): string {
  const v = input.vocab ?? DEFAULT_VOCAB;
  if (!input.items.length) {
    return `วันนี้ยังไม่มีอะไรคุ้มค่าส่ง — ระบบจะไม่เสนอสิ่งที่วัดผลไม่ได้ ตอนนี้มี${v.th.person} ${input.slipping.toLocaleString("en-US")} คนกำลังห่างหายไป รอให้กลุ่มโตพอก่อน`;
  }
  const top = input.items[0];
  const total = input.items.reduce((s, i) => s + i.value, 0);
  return `วันนี้มีสามอย่างที่ควรทำ เริ่มจาก "${top.name}" — ${v.th.person} ${top.size.toLocaleString("en-US")} คน มูลค่าราว ฿${Math.round(top.value).toLocaleString("en-US")} ทั้งสามรวมกันราว ฿${Math.round(total).toLocaleString("en-US")} และตอนนี้มี${v.th.person}เดิม ${input.slipping.toLocaleString("en-US")} คนที่เลยรอบปกติของตัวเองไปแล้ว`;
}

export async function summariseBrief(
  input: BriefInput,
): Promise<AiResult<string>> {
  const res = await ask<{ summary: string }>({
    kind: "brief_summary",
    input,
    schema: BRIEF_SCHEMA,
    maxTokens: 700,
    system:
      `You summarise the morning brief for whoever runs the ${(input.vocab ?? DEFAULT_VOCAB).orgKind}. ` +
      `Call people in the base "${(input.vocab ?? DEFAULT_VOCAB).person}". ` +
      "Write plain conversational English, no more than three sentences, in baht and headcount. " +
      "Never use jargon such as RFM, cohort, attribution, churn or segment. " +
      "Never invent a number you were not given. Reply as JSON matching the schema only.",
    prompt: `Account: ${input.businessName}
${(input.vocab ?? DEFAULT_VOCAB).person} drifting past their own cycle: ${input.slipping}
${(input.vocab ?? DEFAULT_VOCAB).person} unreachable on LINE: ${input.unreachable}

Three moves proposed today:
${input.items.map((i, n) => `${n + 1}. ${i.name} — ${i.size} expected value ${Math.round(i.value)} (${i.why})`).join("\n")}

Summarise it for the owner.`,
    fallback: () => ({ summary: summariseBriefFallback(input) }),
  });
  return { value: res.value.summary, source: res.source, note: res.note };
}

/* ══════════════════════════════════════════════════════════════
   5 · อธิบายว่าทำไมถึงแนะนำ play นี้ (D7)
   ต้องตอบคำถาม "ทำไมส่งหาคนนี้" ได้ทุกครั้ง
   ══════════════════════════════════════════════════════════════ */

const WHY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: { explanation: { type: "string" } },
  required: ["explanation"],
};

export type WhyInput = {
  playName: string;
  logic: string;
  size: number;
  filtered: { reason: string; count: number }[];
  responseRate: number;
  orderValue: number;
  vocab?: VocabCtx;
};

export function explainPlayFallback(i: WhyInput): string {
  const v = i.vocab ?? DEFAULT_VOCAB;
  const cut = i.filtered.reduce((s, f) => s + f.count, 0);
  const base = `เลือก${v.th.person} ${i.size.toLocaleString("en-US")} คนนี้เพราะ ${i.logic} โดยใช้สถิติจาก${v.th.orgKind}อื่นที่มีวงจรเดียวกัน กลุ่มนี้ตอบกลับราว ${(i.responseRate * 100).toFixed(1)}% และ${v.th.purchaseVerb}ครั้งละราว ฿${i.orderValue.toLocaleString("en-US")}`;
  return cut > 0
    ? `${base} และมีอีก ${cut.toLocaleString("en-US")} คนที่เข้าเกณฑ์แต่ถูกตัดออก — ${i.filtered.map((f) => f.reason).join(" · ")}`
    : base;
}

export async function explainPlay(i: WhyInput): Promise<AiResult<string>> {
  const res = await ask<{ explanation: string }>({
    kind: "explain_play",
    input: i,
    schema: WHY_SCHEMA,
    maxTokens: 700,
    system:
      `You explain to whoever runs the ${(i.vocab ?? DEFAULT_VOCAB).orgKind} why the system chose this group of ${(i.vocab ?? DEFAULT_VOCAB).person}s. ` +
      "ตอบเป็นภาษาไทยแบบพูดคุยธรรมดา ไม่เกินสามประโยค ไม่ใช้ศัพท์เทคนิค " +
      "บอกด้วยว่าใครถูกตัดออกและเพราะอะไร ถ้ามี " +
      "Never invent a number you were not given. Reply as JSON matching the schema only.",
    prompt: `Campaign: ${i.playName}
Selection logic: ${i.logic}
Qualifying: ${i.size}
Expected response: ${(i.responseRate * 100).toFixed(1)}%
Average order: ${i.orderValue}
Excluded: ${i.filtered.length ? i.filtered.map((f) => `${f.reason} ${f.count}`).join(" · ") : "none"}

Explain it.`,
    fallback: () => ({ explanation: explainPlayFallback(i) }),
  });
  return { value: res.value.explanation, source: res.source, note: res.note };
}
