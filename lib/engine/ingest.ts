import { insertMany, tx, type Param } from "@/lib/engine/sql";
import { logActivity } from "@/lib/engine/db";
import { createHash } from "node:crypto";
import { deriveFeatures } from "@/lib/engine/derive";
import { guessProductRoles } from "@/lib/engine/ai";
import { contactCapBlockedReason } from "@/lib/engine/billing";
import {
  contactStorageReady,
  encryptContact,
  maskContact,
  matchKey,
  normaliseContact,
  type ContactKind,
} from "@/lib/engine/pii";
import {
  hasPurchases,
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

/** รับได้ทั้ง ค.ศ. และ พ.ศ. เพราะไฟล์จาก POS ไทยมีทั้งสองแบบ */
export function normaliseDate(v: string): string | null {
  const t = v.trim();
  if (!t) return null;

  const dmy = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmy) {
    let year = Number(dmy[3]);
    if (year > 2400) year -= 543; // พ.ศ. → ค.ศ.
    const d = new Date(Date.UTC(year, Number(dmy[2]) - 1, Number(dmy[1])));
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const ymd = t.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (ymd) {
    let year = Number(ymd[1]);
    if (year > 2400) year -= 543;
    const d = new Date(Date.UTC(year, Number(ymd[2]) - 1, Number(ymd[3])));
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const parsed = new Date(t);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
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
  const ref = normaliseRef(at("customer_ref"));
  if (ref?.type === "phone" || ref?.type === "email") push(ref.type, null, ref.value);
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
function profileOf(at: At): Profile | null {
  const txt = (f: ImportField) => at(f).trim() || null;
  const born = normaliseDate(at("birthday"));
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
  if (full) return full;
  const parts = [at("first_name").trim(), at("last_name").trim()].filter(Boolean).join(" ");
  return parts || at("nickname").trim() || UNNAMED;
}

/* ── นำเข้าจริง ───────────────────────────────────────────────── */

export function buildPreview(
  parsed: ParsedCsv,
  mapping: ColumnMapping,
): ImportPreview {
  const byField = new Map<ImportField, number>();
  mapping.mappings.forEach((m) => {
    const idx = parsed.headers.indexOf(m.column);
    if (idx >= 0 && m.field !== "ignore" && !byField.has(m.field)) {
      byField.set(m.field, idx);
    }
  });

  const missing = missingRequired((f) => byField.has(f));
  const at = (row: string[], f: ImportField) => {
    const i = byField.get(f);
    return i == null ? "" : (row[i] ?? "");
  };

  const purchases = hasPurchases((f) => byField.has(f));
  const rejected = [...parsed.rejected];
  const refs = new Set<string>();
  const products = new Map<string, { category: string; price: number }>();
  const dates: number[] = [];
  let usable = 0;
  let discounted = 0;
  let contactPoints = 0;

  parsed.rows.forEach((row, i) => {
    const get: At = (f) => at(row, f);
    const ident = identityOf(get);
    if (!ident) {
      rejected.push({ line: i + 2, reason: "ไม่มีตัวระบุลูกค้า (รหัส · เบอร์ · อีเมล · LINE)" });
      return;
    }
    const when = normaliseDate(at(row, "occurred_at"));
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
    contactPoints += channelsOf(get).length;
    if (!purchases || !when || !money) return;

    dates.push(Date.parse(when));
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
    customers: refs.size,
    transactions: purchases ? usable : 0,
    products: [...products.entries()].map(([name, v]) => ({ name, ...v })),
    dateRange: dates.length
      ? {
          from: new Date(Math.min(...dates)).toISOString().slice(0, 10),
          to: new Date(Math.max(...dates)).toISOString().slice(0, 10),
        }
      : null,
    missing,
    discountRowShare: usable ? discounted / usable : 0,
    contactPoints,
  };
}

export async function commitImport(
  tenantId: string,
  parsed: ParsedCsv,
  mapping: ColumnMapping,
  opts: { replace: boolean },
): Promise<ImportResult> {
  /* ID ลูกค้าคำนวณจากกุญแจ HMAC และช่องทางติดต่อต้องเข้ารหัส — ไม่มีกุญแจ
     คือหยุดตรงนี้ ก่อนที่ไฟล์จะเข้าไปครึ่งทางแล้วพังกลางธุรกรรม */
  if (!contactStorageReady()) {
    throw new Error(
      "ยังไม่ได้ตั้งกุญแจเข้ารหัสข้อมูลติดต่อ (PII_KEY · PII_HMAC_KEY) — ระบบจึงยังไม่รับไฟล์",
    );
  }
  const preview = buildPreview(parsed, mapping);
  if (preview.missing.length) {
    throw new Error(
      `Required columns are missing — ${preview.missing.join(", ")}`,
    );
  }

  /* เพดานจำนวนคนของแผนบังคับที่นี่ ก่อนแตะฐานข้อมูล

     ราคาคิดตามจำนวนคนที่ระบุตัวตนได้ ถ้าไม่ตรวจตรงจุดที่คนเพิ่มเข้ามา
     เพดานบนหน้าราคาก็เป็นแค่ตัวเลขในตาราง ตรวจตอนนำเข้าดีกว่าตอนส่ง
     เพราะร้านยังแก้ไฟล์หรืออัปเกรดได้ก่อนที่ข้อมูลจะเข้าไปครึ่งทาง

     replace = true คือแทนที่ทั้งฐาน ไม่ใช่เพิ่มเข้าไป จึงนับจากศูนย์ */
  const capBlock = await contactCapBlockedReason(
    tenantId,
    preview.customers,
    { replacing: opts.replace },
  );
  if (capBlock) throw new Error(capBlock);

  const byField = new Map<ImportField, number>();
  mapping.mappings.forEach((m) => {
    const idx = parsed.headers.indexOf(m.column);
    if (idx >= 0 && m.field !== "ignore" && !byField.has(m.field)) {
      byField.set(m.field, idx);
    }
  });
  const at = (row: string[], f: ImportField) => {
    const i = byField.get(f);
    return i == null ? "" : (row[i] ?? "");
  };

  /* A6 — ให้ AI เดาบทบาทสินค้า แล้วร้านยืนยันได้ทีหลัง
     group_role คือสิ่งที่ทำให้ K3 K4 R2 ทำงานได้ */
  const roleGuess = preview.products.length
    ? await guessProductRoles(
        preview.products.slice(0, 60).map((p) => ({
          name: p.name,
          price: p.price,
          category: p.category,
        })),
      )
    : { value: { products: [] }, source: "fallback" as const };
  const roleByName = new Map<string, GroupRole>(
    roleGuess.value.products.map((p) => [p.name, p.role]),
  );

  return tx(async (q) => {
    if (opts.replace) {
      /* ── ต้องลบเฉพาะบัญชีนี้ ──

         เดิมทุกตารางที่ไม่มีคอลัมน์ tenant_id ถูกลบด้วย
         `DELETE FROM <table>` เปล่า ๆ ซึ่งไม่ได้ลบข้อมูลของบัญชีที่
         กำลังนำเข้า แต่ลบของทุกบัญชีในระบบ — ร้านหนึ่งติ๊ก
         "แทนที่ข้อมูลเดิม" แล้วธุรกรรม ความยินยอม แคมเปญ และผลการวัด
         ของอีกสามบัญชีหายไปด้วย โดยไม่มีข้อความใดบอก

         ลบจากลูกไปหาแม่ตามลำดับเดียวกับ wipeTenant ใน lib/seed.ts
         ตารางที่ไม่มี tenant_id เข้าถึงผ่าน subquery ของ campaigns
         หรือ customers ของบัญชีนี้เท่านั้น */
      for (const t of ["campaign_audience", "messages", "attributions"]) {
        await q.run(
          `DELETE FROM ${t} WHERE campaign_id IN
             (SELECT id FROM campaigns WHERE tenant_id = ?)`,
          tenantId,
        );
      }
      await q.run(
        `DELETE FROM line_items WHERE txn_id IN (
           SELECT tx.id FROM transactions tx
           JOIN customers c ON c.id = tx.customer_id
           WHERE c.tenant_id = ?)`,
        tenantId,
      );
      for (const t of [
        "events", "consents", "memberships", "identities", "transactions",
      ]) {
        await q.run(
          `DELETE FROM ${t} WHERE customer_id IN
             (SELECT id FROM customers WHERE tenant_id = ?)`,
          tenantId,
        );
      }
      for (const t of [
        "campaigns", "customer_features", "contact_points", "contact_profiles",
        "customers", "products",
      ]) {
        await q.run(`DELETE FROM ${t} WHERE tenant_id = ?`, tenantId);
      }
    }

    /* ── สะสมก่อน แทรกทีเดียว ──

       เดิมแต่ละแถวของ CSV ยิงคำสั่งแยกกันห้าตัว ซึ่งบน sqlite ไม่รู้สึก
       แต่บน Postgres แต่ละคำสั่งคือการไปกลับข้ามเครือข่าย วัดได้ 213ms
       ต่อคำสั่ง — ไฟล์หมื่นแถวจึงกลายเป็นหลายชั่วโมง

       นี่ไม่ใช่แค่เรื่องเดโม: นี่คือเส้นทางที่ลูกค้าจริงอัปโหลดข้อมูลเข้ามา */
    const bufCustomer: Param[][] = [];
    const bufIdentity: Param[][] = [];
    const bufConsent: Param[][] = [];
    const bufProduct: Param[][] = [];
    const bufTxn: Param[][] = [];
    const bufLine: Param[][] = [];
    const bufPoint: Param[][] = [];
    const profiles = new Map<string, Profile>();

    const idFor = (s: string) =>
      createHash("sha256").update(s).digest("hex").slice(0, 20);

    /* ── ID ลูกค้าผูกกับร้าน และถอดกลับเป็นเบอร์ไม่ได้ ──

       เดิมคือ c- + sha256("phone:เบอร์") ซึ่งมีปัญหาสองชั้น:
       — ไม่มีรหัสร้าน: สองร้านนำเข้าเบอร์เดียวกันได้แถวเดียว ร้านที่สอง
         เขียนชื่อทับลูกค้าของร้านแรก และธุรกรรมของร้านที่สองหายเงียบ
         (ทดสอบแล้ว: ระบบรายงานว่านำเข้าสำเร็จ)
       — sha256 ของเบอร์ถอดกลับได้ในไม่กี่นาที ID ลูกค้าจึงเท่ากับเบอร์โทร
         ที่โผล่ใน URL · log · ไฟล์ส่งออก
       HMAC ที่มีรหัสร้านปิดทั้งสองช่อง และยังคงเดิมทุกครั้งที่นำเข้าซ้ำ */
    const customerId = (type: string, value: string) =>
      `c-${matchKey(tenantId, type, value).slice(0, 24)}`;

    const seenCustomers = new Set<string>();
    const seenIdentity = new Set<string>();
    const seenProducts = new Set<string>();
    const purchases = hasPurchases((f) => byField.has(f));
    const nowIso = new Date().toISOString();
    let txnSeq = 0;
    let customers = 0;
    let transactions = 0;
    let contactPoints = 0;

    for (const row of parsed.rows) {
      const get: At = (f) => at(row, f);
      const ident = identityOf(get);
      if (!ident) continue;
      const when = normaliseDate(at(row, "occurred_at"));
      // ตรรกะเงินตัวเดียวกับตอนพรีวิว ตัวเลขที่เห็นก่อนกดจึงตรงกับที่นำเข้า
      const money = rowMoney(row, at);
      if (purchases && (!when || !money)) continue;

      const cid = customerId(ident.type, ident.value);
      if (!seenCustomers.has(cid)) {
        seenCustomers.add(cid);
        customers++;
        bufCustomer.push([cid, tenantId, displayName(get), when ?? nowIso]);
        /* ไฟล์ POS ไม่มีข้อมูลความยินยอม จึงตั้งเป็น "ยังไม่ยินยอม"
           คนกลุ่มนี้จะไม่ถูกส่งและไม่ถูกส่งออกจนกว่าร้านจะเก็บ
           ความยินยอมจริง — ปลอดภัยกว่าการเดาว่ายินยอม

           การมีเบอร์ไม่ใช่การได้รับอนุญาตให้ส่ง — เก็บข้อมูลติดต่อได้มาก
           แค่ไหนก็ตาม การส่งยังผูกกับความยินยอมเหมือนเดิมทุกประการ */
        bufConsent.push([tenantId, cid, "marketing", null, null, "csv_import"]);
      }

      /* identities = ตัวจับคู่ ประเภทละหนึ่งต่อคน — derive ใช้ type = 'line'
         ตัดสินว่าทักทาง LINE ได้ไหม ส่วนค่าจริงทุกตัวอยู่ใน contact_points */
      const pointsHere = channelsOf(get);
      const idents: { type: string; value: string }[] = [
        ident,
        ...pointsHere.filter((c) => c.kind === "phone" || c.kind === "email" || c.kind === "line")
          .map((c) => ({ type: c.kind, value: c.value })),
      ];
      for (const id of idents) {
        const k = `${cid}|${id.type}`;
        if (seenIdentity.has(k)) continue;
        seenIdentity.add(k);
        bufIdentity.push([tenantId, cid, id.type, matchKey(tenantId, id.type, id.value)]);
      }

      const firstOfKind = new Set<string>();
      for (const c of pointsHere) {
        const hmac = matchKey(tenantId, c.kind, c.value);
        bufPoint.push([
          `cp-${matchKey(tenantId, "point", `${cid}|${c.kind}|${hmac}`).slice(0, 24)}`,
          tenantId, cid, c.kind, c.label,
          encryptContact(tenantId, c.kind, c.value),
          hmac,
          maskContact(c.kind, c.value),
          firstOfKind.has(c.kind) ? 0 : 1,
          "csv_import",
          nowIso,
        ]);
        firstOfKind.add(c.kind);
        contactPoints++;
      }

      // หลายแถวของคนเดียวกันรวมเป็นประวัติเดียว แถวหลังเติมช่องที่ยังว่าง
      const prof = profileOf(get);
      if (prof) {
        const prev = profiles.get(cid);
        if (!prev) profiles.set(cid, prof);
        else for (const k of Object.keys(prof) as (keyof Profile)[]) prev[k] ??= prof[k];
      }

      if (!purchases || !when || !money) continue;

      const pname = at(row, "product_name").trim();
      let pid: string | null = null;
      if (pname) {
        // ผูกกับร้านด้วยเหตุผลเดียวกับ ID ลูกค้า — ชื่อสินค้าซ้ำข้ามร้านเป็นเรื่องปกติ
        pid = `p-${idFor(`${tenantId}:${pname}`)}`;
        if (!seenProducts.has(pid)) {
          seenProducts.add(pid);
          const meta = preview.products.find((p) => p.name === pname);
          bufProduct.push([
            pid,
            tenantId,
            pname,
            meta?.category ?? "ทั่วไป",
            roleByName.get(pname) ?? "attachment",
            meta?.price ?? money.listUnit,
          ]);
        }
      }

      const txnId = `t-${idFor(`${cid}:${when}:${++txnSeq}`)}`;
      bufTxn.push([
        tenantId, txnId,
        cid,
        when,
        money.total,
        money.discount,
        at(row, "channel").trim() || "pos",
      ]);
      transactions++;
      // unit_price ต้องเป็นราคาต่อหน่วย ไม่ใช่ยอดรวมของแถว
      if (pid)
        bufLine.push([tenantId, txnId, pid, money.qty, money.unitNet, money.listUnit]);
    }

    const PROFILE_COLS: (keyof Profile)[] = [
      "first_name", "last_name", "nickname", "gender", "birthday", "company",
      "job_title", "subdistrict", "district", "province", "postcode", "note",
    ];
    const bufProfile: Param[][] = [...profiles].map(([cid, p]) => [
      cid, tenantId, ...PROFILE_COLS.map((c) => p[c]), nowIso,
    ]);

    /* ── แทรกทุกถัง ──
       ลำดับตามความสัมพันธ์: customers และ products ก่อน แล้ว transactions
       แล้วจึง line_items — Postgres บังคับ foreign key ทันที */
    /* ไฟล์รายชื่อที่ไม่มีคอลัมน์ชื่อต้องไม่ลบชื่อที่มีอยู่แล้ว
       ทิ้งเป็น "ลูกค้าไม่ระบุชื่อ" ทับชื่อจริงจากไฟล์ก่อนหน้า */
    await insertMany(q, "customers", ["id", "tenant_id", "name", "created_at"], bufCustomer,
      { onConflict: `ON CONFLICT(id) DO UPDATE SET name =
          CASE WHEN excluded.name = '${UNNAMED}' THEN customers.name ELSE excluded.name END` });
    await insertMany(q, "identities", ["tenant_id", "customer_id", "type", "value_hash"], bufIdentity,
      { onConflict: "ON CONFLICT(customer_id, type) DO NOTHING" });
    await insertMany(q, "contact_points",
      ["id", "tenant_id", "customer_id", "kind", "label", "value_enc", "value_hmac",
       "value_masked", "is_primary", "source", "created_at"],
      bufPoint, { onConflict: "ON CONFLICT DO NOTHING" });
    // ช่องที่ไฟล์นี้ไม่มีข้อมูล ต้องคงค่าจากไฟล์ก่อนหน้าไว้ ไม่ใช่ล้างเป็นว่าง
    await insertMany(q, "contact_profiles",
      ["customer_id", "tenant_id", ...PROFILE_COLS, "updated_at"],
      bufProfile, {
        onConflict: `ON CONFLICT(customer_id) DO UPDATE SET ${PROFILE_COLS
          .map((c) => `${c} = COALESCE(excluded.${c}, contact_profiles.${c})`)
          .join(", ")}, updated_at = excluded.updated_at`,
      });
    await insertMany(q, "consents", ["tenant_id", "customer_id", "purpose", "granted_at", "revoked_at", "source"], bufConsent,
      { onConflict: "ON CONFLICT(customer_id, purpose) DO NOTHING" });
    await insertMany(q, "products", ["id", "tenant_id", "name", "category", "group_role", "list_price"], bufProduct,
      { onConflict: "ON CONFLICT(id) DO UPDATE SET group_role = excluded.group_role" });
    await insertMany(q, "transactions", ["tenant_id", "id", "customer_id", "occurred_at", "total", "discount_total", "channel"], bufTxn,
      { onConflict: "ON CONFLICT(id) DO NOTHING" });
    await insertMany(q, "line_items", ["tenant_id", "txn_id", "product_id", "qty", "unit_price", "unit_list_price"], bufLine);

    await logActivity(
      tenantId,
      "owner",
      "import_csv",
      `${customers} customers · ${transactions} transactions · ${contactPoints} contact points`,
    );

    // DERIVE ทันทีเพื่อให้เห็น insight ภายในสามนาที
    await deriveFeatures(tenantId);

    return {
      customers,
      transactions,
      contactPoints,
      products: seenProducts.size,
      rejected: preview.rejected.length,
      roleSource: roleGuess.source,
    };
  });
}
