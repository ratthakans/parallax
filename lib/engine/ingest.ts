import { all, insertMany, tx, type Param, type Sql } from "@/lib/engine/sql";
import { syncLegacyConsents } from "@/lib/engine/policy/marketing";
import { logActivity } from "@/lib/engine/db";
import { createHash } from "node:crypto";
import { deriveFeatures } from "@/lib/engine/derive";
import { guessProductRoles } from "@/lib/engine/ai";
import { contactCapBlockedReason } from "@/lib/engine/billing";
import { importBlockedReason } from "@/lib/engine/signup/gate";
import {
  CONTACT_POINT_COLUMNS,
  contactPointRow,
  contactStorageReady,
  customerIdFor,
  matchKey,
  normaliseContact,
  type ContactKind,
} from "@/lib/engine/pii";
import {
  FIELD_LABEL,
  hasPurchases,
  isSummaryColumn,
  missingRequired,
  type ColumnMapping,
  type ImportField,
  type ImportPreview,
  type ImportResult,
} from "@/lib/shared/ingest-types";
import type { GroupRole } from "@/lib/shared/types";

export * from "@/lib/shared/ingest-types";

/* ── INGEST ────────────────────────────────────────────────────
   ลากไฟล์วาง → schema กลาง (Play Engine §5 ขั้นที่ 1)

   POS แทบทุกเจ้าในโลก export CSV ได้ นั่นคือ API ที่เปิดอยู่แล้ว
   และไม่มีใครปิดได้ งานที่ยากคือทำให้ทุกไฟล์ลงตารางชุดเดียวกัน
   ───────────────────────────────────────────────────────────── */

export type ParsedCsv = {
  headers: string[];
  rows: string[][];
  /** แถวที่ใช้ไม่ได้ พร้อมเหตุผล (A7) */
  rejected: { line: number; reason: string }[];
};

/** parser ที่รองรับ quoted field และ escaped quote ตามมาตรฐาน RFC 4180 */
export function parseCsv(text: string): ParsedCsv {
  const clean = text.replace(/^﻿/, "").replace(/\r\n/g, "\n");
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === "," || ch === "\t") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ""));
  const [headerRow, ...dataRows] = nonEmpty;
  const headers = (headerRow ?? []).map((h) => h.trim());

  const rejected: { line: number; reason: string }[] = [];
  const good: string[][] = [];
  dataRows.forEach((r, i) => {
    if (r.length !== headers.length) {
      rejected.push({
        line: i + 2,
        reason: `${r.length} columns, but the header has ${headers.length}`,
      });
      return;
    }
    good.push(r.map((c) => c.trim()));
  });

  return { headers, rows: good, rejected };
}

/* ── คลีนค่าแต่ละชนิด (A4) ───────────────────────────────────── */

/** จัดรูปเบอร์โทรไทยให้เป็นรูปเดียว แล้ว hash ก่อนเก็บ */
export function normalisePhone(v: string): string | null {
  const digits = v.replace(/[^\d]/g, "");
  if (!digits) return null;
  if (digits.startsWith("66") && digits.length >= 11) return `0${digits.slice(2)}`;
  if (digits.length === 9 && !digits.startsWith("0")) return `0${digits}`;
  return digits;
}

export function normaliseRef(v: string): { type: string; value: string } | null {
  const t = v.trim();
  if (!t) return null;
  if (t.includes("@")) return { type: "email", value: t.toLowerCase() };
  const phone = normalisePhone(t);
  if (phone && phone.length >= 9) return { type: "phone", value: phone };
  return { type: "member_no", value: t };
}

export type DateOrder = "dmy" | "mdy";

/* วันที่ต้องมีจริง — Date.UTC(2025, 15, 8) ไม่ error แต่ล้นไปเป็นเมษายนปีถัดไป
   เดิม "8/16/2025" จากไฟล์ Excel ภาษาอังกฤษจึงกลายเป็น 8 เม.ย. 2026 เงียบ ๆ */
function utcDate(year: number, month: number, day: number): string | null {
  if (year > 2400) year -= 543; // พ.ศ. → ค.ศ.
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCMonth() === month - 1 && d.getUTCDate() === day ? d.toISOString() : null;
}

/** รับได้ทั้ง ค.ศ. และ พ.ศ. เพราะไฟล์จาก POS ไทยมีทั้งสองแบบ
 *  order: ไฟล์นี้เขียน วัน/เดือน (ไทย) หรือ เดือน/วัน (Excel ภาษาอังกฤษ) — ดู detectDateOrder */
export function normaliseDate(v: string, order: DateOrder = "dmy"): string | null {
  const t = v.trim();
  if (!t) return null;

  const dmy = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmy) {
    const a = Number(dmy[1]), b = Number(dmy[2]);
    // เลขที่เกิน 12 บอกเองว่าเป็นวัน — เชื่อตัวเลขก่อนเชื่อลำดับของไฟล์
    const monthFirst = a > 12 ? false : b > 12 ? true : order === "mdy";
    return monthFirst ? utcDate(Number(dmy[3]), a, b) : utcDate(Number(dmy[3]), b, a);
  }
  const ymd = t.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (ymd) return utcDate(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));
  const parsed = new Date(t);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** ทั้งคอลัมน์เขียนแบบไหน — นับแถวที่ตัดสินได้เอง (มีเลขเกิน 12) แล้วใช้กับแถวที่กำกวม */
export function detectDateOrder(values: string[]): DateOrder {
  let dmy = 0, mdy = 0;
  for (const v of values) {
    const m = v.trim().match(/^(\d{1,2})[/-](\d{1,2})[/-]\d{4}/);
    if (!m) continue;
    if (Number(m[1]) > 12) dmy++;
    else if (Number(m[2]) > 12) mdy++;
  }
  return mdy > dmy ? "mdy" : "dmy";
}

/* ── สถานะคำสั่งซื้อที่ไม่ใช่การซื้อจริง ──
   ไฟล์จากมาร์เก็ตเพลสมีออเดอร์ที่ยกเลิก คืนเงิน คืนสินค้าปนอยู่ด้วยเสมอ
   นับเข้าไปแล้วยอดขายและความถี่สูงเกินจริง */
const CANCELLED = /(cancel|ยกเลิก|refund|คืนเงิน|return|คืนสินค้า|failed|ไม่สำเร็จ|void|unpaid|ยังไม่ชำระ)/i;

/* ── ค่าในคอลัมน์ความยินยอม ── */
const CONSENT_YES = /^(y|yes|true|1|✓|✔|ยินยอม|ให้ความยินยอม|ใช่|ตกลง|รับ|รับข่าวสาร|opt.?in|agree[d]?|subscribed)$/i;
const CONSENT_NO = /^(n|no|false|0|✗|✘|ไม่ยินยอม|ไม่|ไม่รับ|ไม่รับข่าวสาร|opt.?out|ปฏิเสธ|unsubscribed)$/i;
function consentOf(v: string): "yes" | "no" | null {
  const t = v.trim();
  return CONSENT_YES.test(t) ? "yes" : CONSENT_NO.test(t) ? "no" : null;
}

/* ── หนึ่งการซื้อ = หนึ่งบิล ไม่ใช่หนึ่งแถว ──
   ไฟล์ POS ส่วนใหญ่มีหนึ่งแถวต่อสินค้า บิลที่มีสามชิ้นจึงเป็นสามแถว เดิมระบบนับ
   เป็นสามครั้งที่ซื้อ ห่างกันศูนย์วัน รอบการซื้อของทุกคนจึงออกมา 7 วัน (ค่าต่ำสุด)
   และยอดต่อครั้งเหลือราคาของชิ้นเดียว — ทดสอบกับไฟล์ POS แล้ว: 3 บิลกลายเป็น 7 ครั้ง

   มีเลขที่บิล → รวมตามเลขบิล · ไม่มี → รวมแถวของคนเดียวกันในวันเดียวกัน (เวลาไทย)
   ซึ่งคือ "การมาร้านหนึ่งครั้ง" ที่การวิเคราะห์รอบการซื้อต้องการ */
function purchaseKey(cid: string, when: string, orderId: string): string {
  if (orderId) return `${cid}|o|${orderId}`;
  const day = new Date(Date.parse(when) + 7 * 3600_000).toISOString().slice(0, 10);
  return `${cid}|d|${day}`;
}

export function normaliseMoney(v: string): number | null {
  const cleaned = v.replace(/[฿$,\s]/g, "").replace(/บาท/g, "");
  /* ช่องว่างต้องเป็น null ไม่ใช่ 0 — Number("") คืน 0 ซึ่งดูเหมือนตัวเลขที่ถูกต้อง
     ผลคือแถวที่ไม่มียอดเงินจะถูกนำเข้าเป็นรายการ 0 บาทแทนที่จะถูกปฏิเสธ
     และคอลัมน์ที่ไม่ได้แม็ปจะกลายเป็น "ราคา 0" แทนที่จะเป็น "ไม่มีข้อมูล" */
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/* ── ตัวเลขเงินของหนึ่งแถว ─────────────────────────────────────

   ไฟล์ POS จริงไม่ได้ให้คอลัมน์เดียวกันทุกเจ้า บางเจ้าให้ยอดสุทธิของแถว
   บางเจ้าให้ราคาต่อหน่วยกับจำนวนแล้วให้เราคูณเอง บางเจ้าให้ส่วนลดแยก
   ตรรกะนี้จึงอยู่ที่เดียวและใช้ทั้งตอนพรีวิวและตอนเขียนลงฐาน
   ถ้าแยกกันสองที่ ตัวเลขที่ผู้ใช้เห็นก่อนกดจะไม่ตรงกับที่นำเข้าจริง

   ที่สำคัญคือ unit_price ต้องเป็นราคาต่อหน่วยจริง ไม่ใช่ยอดสุทธิของแถว
   เพราะ lib/derive.ts คำนวณ discount_affinity จาก unit_list_price เทียบ
   unit_price ถ้าใส่ยอดรวมของแถวลงไป สัญญาณส่วนลดจะผิดทุกแถวที่ซื้อ
   มากกว่าหนึ่งชิ้น */

type RowMoney = {
  /** ยอดสุทธิของแถวนี้ */
  total: number;
  /** ราคาต่อหน่วยที่จ่ายจริง */
  unitNet: number;
  /** ราคาป้ายต่อหน่วย */
  listUnit: number;
  /** ส่วนลดรวมของแถวนี้ */
  discount: number;
  qty: number;
};

function rowMoney(
  row: string[],
  at: (row: string[], f: ImportField) => string,
): RowMoney | null {
  const qty = Math.max(1, Math.round(Number(at(row, "qty")) || 1));
  const netCol = normaliseMoney(at(row, "total"));
  const unitCol = normaliseMoney(at(row, "unit_price"));
  const listCol = normaliseMoney(at(row, "list_price"));
  // ไฟล์บางเจ้าใส่ส่วนลดเป็นเลขลบ
  const discCol = normaliseMoney(at(row, "discount"));
  const disc = discCol != null ? Math.abs(discCol) : null;

  /* ยอดสุทธิของแถวคือตัวเลขที่เชื่อถือได้ที่สุด เพราะเป็นเงินที่เข้าร้านจริง
     ถ้าไม่มีคอลัมน์นั้น จึงประกอบขึ้นจากราคาต่อหน่วยแล้วหักส่วนลด */
  const total =
    netCol ?? (unitCol != null ? Math.max(0, unitCol * qty - (disc ?? 0)) : null);
  if (total == null) return null;

  /* ส่วนลด: คอลัมน์ส่วนลดก่อน ถ้าไม่มีก็อนุมานจากราคาป้าย */
  const discount =
    disc ?? (listCol != null ? Math.max(0, listCol * qty - total) : 0);

  /* ราคาต่อหน่วยทั้งสองค่าคิดจากยอดสุทธิและส่วนลด ไม่ใช่เชื่อคอลัมน์ตรง ๆ

     เพราะ "ราคาต่อหน่วย" ในไฟล์ POS ไทยส่วนใหญ่เป็นราคาก่อนลด ไม่ใช่ราคา
     ที่จ่ายจริง ถ้าเอาไปใส่เป็น unit_price ตรง ๆ แล้วบวกส่วนลดหาราคาป้าย
     จะได้ราคาป้ายที่สูงเกินจริงเป็นสองเท่าของส่วนลด และ discount_affinity
     จะเพี้ยนตามทุกแถวที่มีส่วนลด

     คิดจากยอดสุทธิแทน ได้ค่าที่สอดคล้องกันเองเสมอ:
       ต่อหน่วยที่จ่ายจริง = ยอดสุทธิ ÷ จำนวน
       ราคาป้ายต่อหน่วย   = (ยอดสุทธิ + ส่วนลด) ÷ จำนวน
     ตรวจกับไฟล์ตัวอย่างได้: net 8,000 + ลด 900 = 8,900 ซึ่งเท่ากับคอลัมน์
     ราคาต่อหน่วยพอดี */
  const unitNet = total / qty;
  const listUnit = listCol ?? (total + discount) / qty;

  return { total, unitNet, listUnit, discount, qty };
}

/* ── อ่านแถวเดียว: เป็นใคร · ติดต่อทางไหน · ประวัติ ────────────────
   ใช้ทั้งพรีวิวและตอนนำเข้าจริง ตัวเลขที่เห็นก่อนกดจึงตรงกับที่เข้าฐาน */

type At = (f: ImportField) => string;

/** ตัวระบุลูกค้า — รหัสก่อน แล้วค่อยเบอร์ อีเมล LINE */
function identityOf(at: At): { type: string; value: string } | null {
  const ref = normaliseRef(at("customer_ref"));
  if (ref) {
    // ใช้รูปแบบเดียวกับคอลัมน์เบอร์/อีเมล ไม่งั้นคนเดียวกันที่มาจากสองไฟล์
    // (ไฟล์หนึ่งใส่เบอร์ในช่องรหัส อีกไฟล์ใส่ในช่องเบอร์) จะกลายเป็นสองคน
    if (ref.type === "phone" || ref.type === "email") {
      const v = normaliseContact(ref.type, ref.value);
      if (v) return { type: ref.type, value: v };
    }
    return ref;
  }
  const order: [ImportField, ContactKind][] = [
    ["phone", "phone"], ["email", "email"], ["line_id", "line"], ["phone_alt", "phone"],
  ];
  for (const [f, kind] of order) {
    const v = normaliseContact(kind, at(f));
    if (v) return { type: kind, value: v };
  }
  return null;
}

const CHANNEL_FIELDS: { field: ImportField; kind: ContactKind; label: string | null }[] = [
  { field: "phone", kind: "phone", label: "มือถือ" },
  { field: "phone_alt", kind: "phone", label: "เบอร์อื่น" },
  { field: "email", kind: "email", label: null },
  { field: "line_id", kind: "line", label: null },
  { field: "facebook", kind: "facebook", label: null },
  { field: "instagram", kind: "instagram", label: null },
  { field: "tiktok", kind: "tiktok", label: null },
  { field: "website", kind: "website", label: null },
];

/** ทุกช่องทางติดต่อในแถว จัดรูปแบบแล้ว ไม่ซ้ำกันเอง */
function channelsOf(at: At): { kind: ContactKind; label: string | null; value: string }[] {
  const out: { kind: ContactKind; label: string | null; value: string }[] = [];
  const seen = new Set<string>();
  const push = (kind: ContactKind, label: string | null, raw: string) => {
    const value = normaliseContact(kind, raw);
    if (!value || seen.has(`${kind}|${value}`)) return;
    seen.add(`${kind}|${value}`);
    out.push({ kind, label, value });
  };
  for (const c of CHANNEL_FIELDS) push(c.kind, c.label, at(c.field));
  // เบอร์หรืออีเมลที่อยู่ในช่องรหัสลูกค้าก็เป็นช่องทางติดต่อเหมือนกัน
  /* ค่าในช่องรหัสลูกค้า: เบอร์หรืออีเมลเป็นช่องทางติดต่อ ส่วนรหัสสมาชิก
     เป็นตัวระบุ — ทั้งหมดอยู่ใน contact_points ที่เดียว ไม่แยกตารางแล้ว */
  const ref = normaliseRef(at("customer_ref"));
  if (ref?.type === "phone" || ref?.type === "email") push(ref.type, null, ref.value);
  else if (ref) push("member_no", null, ref.value);
  /* ที่อยู่รวมเป็นค่าเดียว — แยกเก็บตำบล/อำเภอ/จังหวัดแบบอ่านได้ไว้ใน
     contact_profiles ด้วย เพราะต้องใช้กรองกลุ่ม ส่วนบ้านเลขที่และถนนคือ
     ส่วนที่ระบุตัวคนได้จริง จึงอยู่ในค่าที่เข้ารหัสเท่านั้น */
  const street = at("address").trim();
  if (street) {
    // ต่อตำบล/อำเภอ/จังหวัดท้ายบ้านเลขที่ เว้นแต่ช่องที่อยู่มีคำนั้นอยู่แล้ว
    const extra = [at("subdistrict"), at("district"), at("province"), at("postcode")]
      .map((x) => x.trim())
      .filter((x) => x && !street.includes(x));
    push("address", null, [street, ...extra].join(" "));
  }
  return out;
}

type Profile = {
  first_name: string | null; last_name: string | null; nickname: string | null;
  gender: string | null; birthday: string | null; company: string | null;
  job_title: string | null; subdistrict: string | null; district: string | null;
  province: string | null; postcode: string | null; note: string | null;
};

function genderOf(v: string): string | null {
  const t = v.trim().toLowerCase();
  if (!t) return null;
  if (/^(ชาย|male|m|นาย|ผู้ชาย)$/.test(t)) return "male";
  if (/^(หญิง|female|f|นาง|นางสาว|น\.ส\.|ผู้หญิง)$/.test(t)) return "female";
  return t;
}

/** ประวัติของคน — คืน null ถ้าไฟล์ไม่มีข้อมูลประวัติเลย */
function profileOf(at: At, born: string | null): Profile | null {
  const txt = (f: ImportField) => at(f).trim() || null;
  const p: Profile = {
    first_name: txt("first_name"), last_name: txt("last_name"), nickname: txt("nickname"),
    gender: genderOf(at("gender")), birthday: born ? born.slice(0, 10) : null,
    company: txt("company"), job_title: txt("job_title"), subdistrict: txt("subdistrict"),
    district: txt("district"), province: txt("province"), postcode: txt("postcode"),
    note: txt("note"),
  };
  return Object.values(p).some((x) => x != null) ? p : null;
}

const UNNAMED = "ลูกค้าไม่ระบุชื่อ";

function displayName(at: At): string {
  const full = at("customer_name").trim();
  const last = at("last_name").trim();
  /* ไฟล์รายชื่อไทยมักแยก "ชื่อ" กับ "นามสกุล" — "ชื่อ" ถูกจับเป็นชื่อลูกค้า
     ทั้งที่เป็นแค่ชื่อต้น เดิมจึงได้ "สมชาย" แทน "สมชาย ใจดี" */
  if (full) return last && !full.includes(last) ? `${full} ${last}` : full;
  const parts = [at("first_name").trim(), at("last_name").trim()].filter(Boolean).join(" ");
  return parts || at("nickname").trim() || UNNAMED;
}

/* ── นำเข้าจริง ───────────────────────────────────────────────── */

/* อ่านค่าของแต่ละ field ตามการจับคู่คอลัมน์ — พรีวิวกับนำเข้าจริงใช้ตัวเดียวกัน
   เดิมเขียนซ้ำสองชุด ซึ่งคือที่ที่ตัวเลขก่อนกดกับหลังกดจะเริ่มไม่ตรงกัน */
function fieldReader(parsed: ParsedCsv, mapping: ColumnMapping) {
  const byField = new Map<ImportField, number>();
  mapping.mappings.forEach((m) => {
    const idx = parsed.headers.indexOf(m.column);
    if (idx >= 0 && m.field !== "ignore" && !isSummaryColumn(m.column) && !byField.has(m.field)) byField.set(m.field, idx);
  });
  const at = (row: string[], f: ImportField) => {
    const i = byField.get(f);
    return i == null ? "" : (row[i] ?? "");
  };
  const orders = new Map<ImportField, DateOrder>();
  const dateOrder = (f: ImportField): DateOrder => {
    if (!orders.has(f)) orders.set(f, detectDateOrder(parsed.rows.map((r) => at(r, f))));
    return orders.get(f)!;
  };
  /** วันที่ของแถวนี้ อ่านตามลำดับที่ทั้งคอลัมน์ใช้ */
  const date = (row: string[], f: ImportField) => normaliseDate(at(row, f), dateOrder(f));
  return { has: (f: ImportField) => byField.has(f), at, date, dateOrder };
}

export function buildPreview(
  parsed: ParsedCsv,
  mapping: ColumnMapping,
): ImportPreview {
  const read = fieldReader(parsed, mapping);
  const { has, at } = read;
  const missing = missingRequired(has);

  const purchases = hasPurchases(has);
  const rejected = [...parsed.rejected];
  const refs = new Set<string>();
  const products = new Map<string, { category: string; price: number }>();
  const dates: number[] = [];
  let usable = 0;
  let discounted = 0;
  let cancelledRows = 0;
  const uniquePoints = new Set<string>();
  const purchaseKeys = new Set<string>();
  const consentBy = new Map<string, "yes" | "no">();

  parsed.rows.forEach((row, i) => {
    const get: At = (f) => at(row, f);
    const ident = identityOf(get);
    if (!ident) {
      const raw = at(row, "phone");
      rejected.push({
        line: i + 2,
        reason: /e\+?\d/i.test(raw)
          ? `เบอร์ถูก Excel แปลงเป็นเลขวิทยาศาสตร์ (${raw.trim()}) — ตัวเลขหายไปแล้ว ต้องแก้ในไฟล์ต้นทาง`
          : /[*x•]{3,}/i.test(raw)
            ? "เบอร์ถูกปิดบางส่วน (เช่น จากมาร์เก็ตเพลส) — ใช้ชื่อผู้ใช้หรือรหัสลูกค้าแทน"
            : "ไม่มีตัวระบุลูกค้า (รหัส · เบอร์ · อีเมล · LINE)",
      });
      return;
    }
    if (CANCELLED.test(at(row, "order_status"))) {
      cancelledRows++;
      rejected.push({ line: i + 2, reason: `คำสั่งซื้อ${at(row, "order_status").trim()} — ไม่นับเป็นการซื้อ` });
      return;
    }
    const c = consentOf(at(row, "consent"));
    if (c) consentBy.set(`${ident.type}:${ident.value}`, c);
    const when = read.date(row, "occurred_at");
    const money = rowMoney(row, at);
    if (purchases && !when) {
      rejected.push({ line: i + 2, reason: "อ่านวันที่ไม่ได้" });
      return;
    }
    if (purchases && !money) {
      rejected.push({ line: i + 2, reason: "อ่านยอดเงินไม่ได้" });
      return;
    }
    usable++;
    refs.add(`${ident.type}:${ident.value}`);
    for (const c of channelsOf(get)) uniquePoints.add(`${ident.type}:${ident.value}|${c.kind}|${c.value}`);
    if (!purchases || !when || !money) return;

    dates.push(Date.parse(when));
    purchaseKeys.add(purchaseKey(`${ident.type}:${ident.value}`, when, at(row, "order_id").trim()));
    if (money.discount > 0) discounted++;
    const pname = at(row, "product_name").trim();
    if (pname && !products.has(pname)) {
      products.set(pname, {
        category: at(row, "product_category").trim() || "ทั่วไป",
        price: money.listUnit,
      });
    }
  });

  return {
    totalRows: parsed.rows.length,
    usableRows: usable,
    rejected: rejected.slice(0, 25),
    rejectedRows: rejected.length,
    customers: refs.size,
    contactPoints: uniquePoints.size,
    transactions: purchases ? purchaseKeys.size : 0,
    cancelledRows,
    consent: {
      yes: [...consentBy.values()].filter((x) => x === "yes").length,
      no: [...consentBy.values()].filter((x) => x === "no").length,
    },
    dateOrder: read.dateOrder("occurred_at"),
    products: [...products.entries()].map(([name, v]) => ({ name, ...v })),
    dateRange: dates.length
      ? {
          from: new Date(Math.min(...dates)).toISOString().slice(0, 10),
          to: new Date(Math.max(...dates)).toISOString().slice(0, 10),
        }
      : null,
    missing,
    discountRowShare: usable ? discounted / usable : 0,
  };
}

/* ── นำเข้าจริง: อ่าน → รวบรวม → เขียน ─────────────────────────

   ไม่มีตัวเลือก "แทนที่ข้อมูลเดิม" แล้ว การนำเข้าจึงทำได้อย่างเดียวคือ
   เพิ่มและเติม — คนเดิมไม่ซ้ำ ช่องที่ว่างในไฟล์ใหม่ไม่ลบข้อมูลเดิม
   การล้างทั้งบัญชีย้ายไปเป็นปุ่มในหน้าตั้งค่า (wipeCustomerData)
   เพราะติ๊กครั้งเดียวในหน้านำเข้าเคยลบลูกค้า 1,240 คนไปจริง */

type ImportBatch = {
  customers: Param[][];
  points: Param[][];
  profiles: Param[][];
  consents: Param[][];
  products: Param[][];
  txns: Param[][];
  lines: Param[][];
  /** คอลัมน์ความยินยอม (หรือการยืนยันของเจ้าของร้านตอนนำเข้า) บอกว่าใช่ / ไม่ */
  consentYes: string[];
  consentNo: string[];
};

const PROFILE_COLS: (keyof Profile)[] = [
  "first_name", "last_name", "nickname", "gender", "birthday", "company",
  "job_title", "subdistrict", "district", "province", "postcode", "note",
];

/** ตัวระบุในไฟล์ที่ตรงกับช่องทางติดต่อของคนที่มีอยู่แล้ว: "ชนิด:กุญแจ" → รหัสลูกค้า */
async function knownCustomers(
  tenantId: string,
  parsed: ParsedCsv,
  read: ReturnType<typeof fieldReader>,
): Promise<Map<string, string>> {
  const keys = new Map<string, { kind: string; hmac: string }>();
  for (const row of parsed.rows) {
    const ident = identityOf((f) => read.at(row, f));
    if (!ident) continue;
    const hmac = matchKey(tenantId, ident.type, ident.value);
    keys.set(`${ident.type}:${hmac}`, { kind: ident.type, hmac });
  }
  const found = new Map<string, string>();
  const list = [...keys.values()];
  const kinds = [...new Set(list.map((k) => k.kind))];
  for (let i = 0; i < list.length; i += 500) {
    const chunk = list.slice(i, i + 500);
    const rows = await all<{ kind: string; value_hmac: string; customer_id: string }>(
      `SELECT kind, value_hmac, MIN(customer_id) AS customer_id FROM contact_points
       WHERE tenant_id = ? AND kind IN (${kinds.map(() => "?").join(",")})
         AND value_hmac IN (${chunk.map(() => "?").join(",")})
       GROUP BY kind, value_hmac`,
      tenantId, ...kinds, ...chunk.map((k) => k.hmac),
    );
    for (const r of rows) found.set(`${r.kind}:${r.value_hmac}`, r.customer_id);
  }
  return found;
}

/** แปลงทุกแถวเป็นแถวของแต่ละตาราง — ไม่แตะฐานข้อมูล */
function collectImport(
  tenantId: string,
  parsed: ParsedCsv,
  read: ReturnType<typeof fieldReader>,
  preview: ImportPreview,
  roleByName: Map<string, GroupRole>,
  known: Map<string, string>,
  opts: ImportOptions,
): ImportBatch {
  const { at, has } = read;
  const b: ImportBatch = {
    customers: [], points: [], profiles: [], consents: [], products: [], txns: [], lines: [],
    consentYes: [], consentNo: [],
  };
  const idFor = (x: string) => createHash("sha256").update(x).digest("hex").slice(0, 20);

  /* คนที่มีอยู่แล้วต้องหาจากช่องทางติดต่อก่อน ไม่ใช่คำนวณ ID ใหม่จากค่าในไฟล์
     ID ของคนที่ถูกรวมเข้ากับอีกคน หรือคนที่เพิ่มเองด้วยอีเมลแล้วไฟล์มีแต่เบอร์
     คำนวณจากค่าในไฟล์ไม่ได้ — คำนวณแล้วจะได้คนที่ถูกรวมไปแล้วกลับมาอีกคน */
  const customerId = (type: string, value: string) =>
    known.get(`${type}:${matchKey(tenantId, type, value)}`) ?? customerIdFor(tenantId, type, value);

  const seenCustomers = new Set<string>();
  const seenProducts = new Set<string>();
  const profiles = new Map<string, Profile>();
  const purchases = hasPurchases(has);
  const nowIso = new Date().toISOString();
  // การซื้อหนึ่งครั้ง (บิล · หรือวันเดียวกันของคนเดียวกัน) → แถวใน b.txns
  const purchaseRow = new Map<string, Param[]>();
  const customerRow = new Map<string, Param[]>();
  const seenPoints = new Set<string>();
  const consentBy = new Map<string, "yes" | "no">();

  for (const row of parsed.rows) {
    const get: At = (f) => at(row, f);
    const ident = identityOf(get);
    if (!ident) continue;
    // ยกเลิก · คืนเงิน ไม่ใช่การซื้อ และไม่ใช่หลักฐานว่าเป็นลูกค้าด้วย
    if (CANCELLED.test(at(row, "order_status"))) continue;
    const when = read.date(row, "occurred_at");
    // ตรรกะเงินตัวเดียวกับตอนพรีวิว ตัวเลขที่เห็นก่อนกดจึงตรงกับที่นำเข้า
    const money = rowMoney(row, at);
    if (purchases && (!when || !money)) continue;

    const cid = customerId(ident.type, ident.value);
    const known = customerRow.get(cid);
    /* ไฟล์ POS เรียงจากใหม่ไปเก่า แถวแรกของคนหนึ่งจึงเป็นการซื้อล่าสุด — เดิมใช้เป็น
       วันที่เริ่มเป็นลูกค้า คนที่ซื้อมา 18 เดือนจึงขึ้นว่า "เพิ่มเมื่อ 3 วันก่อน" */
    if (known && when && when < String(known[3])) known[3] = when;
    if (!seenCustomers.has(cid)) {
      seenCustomers.add(cid);
      const row: Param[] = [cid, tenantId, displayName(get), when ?? nowIso];
      customerRow.set(cid, row);
      b.customers.push(row);
      /* ไฟล์ไม่มีข้อมูลความยินยอม จึงตั้งเป็น "ยังไม่ยินยอม" — การมีเบอร์
         ไม่ใช่การได้รับอนุญาตให้ส่ง ไม่ว่าจะเก็บข้อมูลติดต่อได้มากแค่ไหน */
      b.consents.push([tenantId, cid, "marketing", null, null, "csv_import"]);
    }

    // แถวหลังของคนเดียวกันเพิ่มช่องทางที่ยังไม่มี ส่วนที่ซ้ำ ON CONFLICT ข้ามให้
    const firstOfKind = new Set<string>();
    for (const c of channelsOf(get)) {
      const pointKey = `${cid}|${c.kind}|${c.value}`;
      if (seenPoints.has(pointKey)) { firstOfKind.add(c.kind); continue; }
      seenPoints.add(pointKey);
      b.points.push(contactPointRow(tenantId, cid, c.kind, c.value, c.label, !firstOfKind.has(c.kind), "csv_import"));
      firstOfKind.add(c.kind);
    }

    // หลายแถวของคนเดียวกันรวมเป็นประวัติเดียว แถวหลังเติมช่องที่ยังว่าง
    const said = opts.consentAll ? "yes" : consentOf(at(row, "consent"));
    // "ไม่" ชนะ "ใช่" ถ้าคนเดียวกันมีทั้งสองแบบในไฟล์เดียว
    if (said && consentBy.get(cid) !== "no") consentBy.set(cid, said);

    const prof = profileOf(get, read.date(row, "birthday"));
    if (prof) {
      const prev = profiles.get(cid);
      if (!prev) profiles.set(cid, prof);
      else for (const k of PROFILE_COLS) prev[k] ??= prof[k];
    }

    if (!purchases || !when || !money) continue;

    const pname = at(row, "product_name").trim();
    let pid: string | null = null;
    if (pname) {
      // ผูกกับร้านด้วยเหตุผลเดียวกับ ID ลูกค้า — ชื่อสินค้าซ้ำข้ามร้านเป็นเรื่องปกติ
      pid = `p-${idFor(`${tenantId}:${pname}`)}`;
      if (!seenProducts.has(pid)) {
        seenProducts.add(pid);
        const meta = preview.products.find((x) => x.name === pname);
        b.products.push([
          pid, tenantId, pname, meta?.category ?? "ทั่วไป",
          roleByName.get(pname) ?? "attachment", meta?.price ?? money.listUnit,
        ]);
      }
    }

    /* ── ID ของการซื้อมาจากบิล ไม่ใช่ลำดับแถว ──

       เดิม ID มาจากลำดับแถว แล้วต่อมาจากเนื้อหาของแถว — ทั้งสองแบบนับหนึ่งแถว
       เป็นหนึ่งการซื้อ ตอนนี้ ID มาจาก (คน · เลขบิล) หรือ (คน · วัน) ไฟล์เดิมที่
       นำเข้าซ้ำ หรือเรียงแถวต่างกัน จึงได้ ID เดิมและไม่ถูกนับซ้ำเหมือนเดิม
       ส่วนหลายแถวของบิลเดียวรวมเป็นการซื้อเดียว ยอดเป็นผลรวมของทุกแถว */
    const key = purchaseKey(cid, when, at(row, "order_id").trim());
    const txnId = `t-${idFor(`${tenantId}|${key}`)}`;
    const existing = purchaseRow.get(key);
    if (existing) {
      existing[4] = Number(existing[4]) + money.total;
      existing[5] = Number(existing[5]) + money.discount;
      if (when < String(existing[3])) existing[3] = when;
    } else {
      const txn: Param[] = [tenantId, txnId, cid, when, money.total, money.discount, at(row, "channel").trim() || "pos"];
      purchaseRow.set(key, txn);
      b.txns.push(txn);
    }
    // unit_price ต้องเป็นราคาต่อหน่วย ไม่ใช่ยอดรวมของแถว
    if (pid) b.lines.push([tenantId, txnId, pid, money.qty, money.unitNet, money.listUnit]);
  }

  b.profiles = [...profiles].map(([cid, p]) => [cid, tenantId, ...PROFILE_COLS.map((c) => p[c]), nowIso]);
  for (const [cid, v] of consentBy) (v === "yes" ? b.consentYes : b.consentNo).push(cid);
  return b;
}

/** id ไหนในรายการนี้มีอยู่แล้ว — ถามเป็นก้อน ไม่ใช่ทีละแถว */
async function existingIds(q: Sql, table: "transactions", ids: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (let i = 0; i < ids.length; i += 1000) {
    const chunk = ids.slice(i, i + 1000);
    const rows = await q.all<{ id: string }>(
      `SELECT id FROM ${table} WHERE id IN (${chunk.map(() => "?").join(",")})`,
      ...chunk,
    );
    for (const r of rows) out.add(r.id);
  }
  return out;
}

/** เขียนทุกตารางในธุรกรรมเดียว — ลำดับตามความสัมพันธ์ เพราะ Postgres บังคับ foreign key ทันที */
async function writeImport(q: Sql, b: ImportBatch): Promise<number> {
  /* ไฟล์รายชื่อที่ไม่มีคอลัมน์ชื่อต้องไม่ลบชื่อที่มีอยู่แล้ว
     ทิ้งเป็น "ลูกค้าไม่ระบุชื่อ" ทับชื่อจริงจากไฟล์ก่อนหน้า */
  await insertMany(q, "customers", ["id", "tenant_id", "name", "created_at"], b.customers, {
    onConflict: `ON CONFLICT(id) DO UPDATE SET name =
      CASE WHEN excluded.name = '${UNNAMED}' THEN customers.name ELSE excluded.name END,
      created_at = CASE WHEN excluded.created_at < customers.created_at
        THEN excluded.created_at ELSE customers.created_at END`,
  });
  await insertMany(q, "contact_points", CONTACT_POINT_COLUMNS, b.points,
    { onConflict: "ON CONFLICT DO NOTHING" });
  // ช่องที่ไฟล์นี้ไม่มีข้อมูล ต้องคงค่าจากไฟล์ก่อนหน้าไว้ ไม่ใช่ล้างเป็นว่าง
  await insertMany(q, "contact_profiles", ["customer_id", "tenant_id", ...PROFILE_COLS, "updated_at"], b.profiles, {
    onConflict: `ON CONFLICT(customer_id) DO UPDATE SET ${PROFILE_COLS
      .map((c) => `${c} = COALESCE(excluded.${c}, contact_profiles.${c})`)
      .join(", ")}, updated_at = excluded.updated_at`,
  });
  await insertMany(q, "consents", ["tenant_id", "customer_id", "purpose", "granted_at", "revoked_at", "source"], b.consents,
    { onConflict: "ON CONFLICT(customer_id, purpose) DO NOTHING" });
  /* ความยินยอมจากไฟล์: "ใช่" บันทึกได้เฉพาะคนที่ยังไม่เคยถอน — คนที่บอกร้านให้หยุดส่ง
     (ถอนในหน้าของเขา) ต้องไม่กลับมาได้รับเพราะไฟล์เก่าที่บอกว่าเคยยินยอม
     "ไม่" ถอนคนที่ยินยอมอยู่ ทั้งสองแบบเก็บวันที่ไว้เป็นหลักฐาน */
  const nowIso = new Date().toISOString();
  const tenantId = String(b.customers[0]?.[1] ?? "");
  for (const [ids, sql] of [
    [b.consentYes, `UPDATE consents SET granted_at = ?, source = 'csv_import'
      WHERE tenant_id = ? AND purpose = 'marketing' AND granted_at IS NULL AND revoked_at IS NULL AND customer_id IN `],
    [b.consentNo, `UPDATE consents SET revoked_at = ?
      WHERE tenant_id = ? AND purpose = 'marketing' AND granted_at IS NOT NULL AND revoked_at IS NULL AND customer_id IN `],
  ] as const) {
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      await q.run(`${sql}(${chunk.map(() => "?").join(",")})`, nowIso, tenantId, ...chunk);
    }
  }
  await insertMany(q, "products", ["id", "tenant_id", "name", "category", "group_role", "list_price"], b.products,
    { onConflict: "ON CONFLICT(id) DO UPDATE SET group_role = excluded.group_role" });
  /* ── รายการสินค้าเพิ่มเฉพาะธุรกรรมที่เพิ่งเข้ามาใหม่ ──
     line_items ไม่มี key กันซ้ำ เดิมธุรกรรมที่มีอยู่แล้วถูกข้ามด้วย ON CONFLICT
     แต่รายการสินค้าของมันถูกเพิ่มซ้ำทุกครั้งที่นำเข้าไฟล์เดิม */
  const known = await existingIds(q, "transactions", b.txns.map((t) => String(t[1])));
  const freshTxns = b.txns.filter((t) => !known.has(String(t[1])));
  await insertMany(q, "transactions", ["tenant_id", "id", "customer_id", "occurred_at", "total", "discount_total", "channel"], freshTxns,
    { onConflict: "ON CONFLICT(id) DO NOTHING" });
  await insertMany(q, "line_items", ["tenant_id", "txn_id", "product_id", "qty", "unit_price", "unit_list_price"],
    b.lines.filter((l) => !known.has(String(l[1]))));
  return freshTxns.length;
}

export type ImportOptions = {
  /** เจ้าของร้านยืนยันตอนนำเข้าว่าทุกคนในไฟล์ให้ความยินยอมกับร้านแล้ว
      (เช่น รายชื่อสมาชิกที่สมัครผ่านฟอร์มที่มีข้อความขอความยินยอม) */
  consentAll?: boolean;
};

export async function commitImport(
  tenantId: string,
  parsed: ParsedCsv,
  mapping: ColumnMapping,
  opts: ImportOptions = {},
): Promise<ImportResult> {
  /* ID ลูกค้าคำนวณจากกุญแจ HMAC และช่องทางติดต่อต้องเข้ารหัส — ไม่มีกุญแจ
     คือหยุดตรงนี้ ก่อนที่ไฟล์จะเข้าไปครึ่งทางแล้วพังกลางธุรกรรม */
  if (!contactStorageReady()) {
    throw new Error(
      "ยังไม่ได้ตั้งกุญแจเข้ารหัสข้อมูลติดต่อ (PII_KEY · PII_HMAC_KEY) — ระบบจึงยังไม่รับไฟล์",
    );
  }
  /* บัญชีสมัครเองไม่รับไฟล์จริง (S9) — ตัวนำเข้า CSV นี้ไม่มีทางเป็นไฟล์สมมุติของระบบ จึงปิดทั้งเส้น */
  const blocked = await importBlockedReason(tenantId);
  if (blocked) throw new Error(blocked);
  const read = fieldReader(parsed, mapping);
  const preview = buildPreview(parsed, mapping);
  if (preview.missing.length) {
    throw new Error(`ยังขาดคอลัมน์ — ${preview.missing.map((f) => FIELD_LABEL[f]).join(" · ")}`);
  }

  /* เพดานจำนวนคนของแผนบังคับก่อนแตะฐานข้อมูล — ร้านยังแก้ไฟล์หรืออัปเกรด
     ได้ทัน ก่อนที่ข้อมูลจะเข้าไปครึ่งทาง */
  const capBlock = await contactCapBlockedReason(tenantId, preview.customers);
  if (capBlock) throw new Error(capBlock);

  /* A6 — ให้ AI เดาบทบาทสินค้า แล้วร้านยืนยันได้ทีหลัง
     group_role คือสิ่งที่ทำให้ K3 K4 R2 ทำงานได้ */
  const roleGuess = preview.products.length
    ? await guessProductRoles(
        tenantId,
        preview.products.slice(0, 60).map((x) => ({ name: x.name, price: x.price, category: x.category })),
      )
    : { value: { products: [] }, source: "fallback" as const };
  const roleByName = new Map<string, GroupRole>(roleGuess.value.products.map((x) => [x.name, x.role]));

  const batch = collectImport(tenantId, parsed, read, preview, roleByName, await knownCustomers(tenantId, parsed, read), opts);

  const result = await tx(async (q) => {
    const newTxns = await writeImport(q, batch);
    await logActivity(
      tenantId,
      "owner",
      "import_csv",
      `${batch.customers.length} customers · ${newTxns} new transactions · ${batch.points.length} contact points`,
    );
    if (batch.consentYes.length || batch.consentNo.length) {
      await logActivity(
        tenantId,
        "owner",
        opts.consentAll ? "import_consent_attested" : "import_consent_column",
        `${batch.consentYes.length} consented · ${batch.consentNo.length} withdrew`,
      );
    }
    // DERIVE ทันทีเพื่อให้เห็น insight ภายในสามนาที
    await deriveFeatures(tenantId);
    return {
      customers: batch.customers.length,
      // นับเฉพาะที่เพิ่มเข้ามาจริง — ไฟล์เดิมนำเข้าซ้ำต้องบอกว่า 0 ไม่ใช่จำนวนแถว
      transactions: newTxns,
      contactPoints: batch.points.length,
      products: batch.products.length,
      rejected: preview.rejectedRows,
      roleSource: roleGuess.source,
      consented: batch.consentYes.length,
    };
  });
  /* ความยินยอมจากไฟล์ส่งต่อเข้าที่จริง (G2) — นอกธุรกรรมนำเข้า เพราะบันทึกแต่ละคนมีธุรกรรมและหลักฐานของตัวเอง */
  if (batch.consentYes.length || batch.consentNo.length) await syncLegacyConsents(tenantId, "owner", [...batch.consentYes, ...batch.consentNo]);
  return result;
}
