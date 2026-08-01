import { tx } from "@/lib/engine/sql";
import { logActivity } from "@/lib/engine/db";
import { createHash } from "node:crypto";
import { deriveFeatures } from "@/lib/engine/derive";
import { guessProductRoles } from "@/lib/engine/ai";
import { contactCapBlockedReason } from "@/lib/engine/billing";
import {
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

  const rejected = [...parsed.rejected];
  const refs = new Set<string>();
  const products = new Map<string, { category: string; price: number }>();
  const dates: number[] = [];
  let usable = 0;
  let discounted = 0;

  parsed.rows.forEach((row, i) => {
    const ref = normaliseRef(at(row, "customer_ref"));
    const when = normaliseDate(at(row, "occurred_at"));
    const money = rowMoney(row, at);
    if (!ref) {
      rejected.push({ line: i + 2, reason: "ไม่มีตัวระบุลูกค้า" });
      return;
    }
    if (!when) {
      rejected.push({ line: i + 2, reason: "อ่านวันที่ไม่ได้" });
      return;
    }
    if (!money) {
      rejected.push({ line: i + 2, reason: "อ่านยอดเงินไม่ได้" });
      return;
    }
    usable++;
    refs.add(`${ref.type}:${ref.value}`);
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
    transactions: usable,
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

export async function commitImport(
  tenantId: string,
  parsed: ParsedCsv,
  mapping: ColumnMapping,
  opts: { replace: boolean },
): Promise<ImportResult> {
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
      for (const t of ["campaigns", "customer_features", "customers", "products"]) {
        await q.run(`DELETE FROM ${t} WHERE tenant_id = ?`, tenantId);
      }
    }

    const insCustomerQ = `INSERT INTO customers (id, tenant_id, name, created_at) VALUES (?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name`;
    const insIdentityQ = `INSERT INTO identities (tenant_id, customer_id, type, value_hash) VALUES (?,?,?,?)
       ON CONFLICT(customer_id, type) DO NOTHING`;
    const insConsentQ = `INSERT INTO consents (tenant_id, customer_id, purpose, granted_at, revoked_at, source)
       VALUES (?,?,?,?,?,?) ON CONFLICT(customer_id, purpose) DO NOTHING`;
    const insProductQ = `INSERT INTO products (id, tenant_id, name, category, group_role, list_price)
       VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET group_role = excluded.group_role`;
    const insTxnQ = `INSERT INTO transactions (tenant_id, id, customer_id, occurred_at, total, discount_total, channel)
       VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`;
    const insLineQ = `INSERT INTO line_items (tenant_id, txn_id, product_id, qty, unit_price, unit_list_price)
       VALUES (?,?,?,?,?,?)`;

    const idFor = (s: string) =>
      createHash("sha256").update(s).digest("hex").slice(0, 20);

    const seenCustomers = new Set<string>();
    const seenProducts = new Set<string>();
    let txnSeq = 0;
    let customers = 0;
    let transactions = 0;

    for (const row of parsed.rows) {
      const ref = normaliseRef(at(row, "customer_ref"));
      const when = normaliseDate(at(row, "occurred_at"));
      // ตรรกะเงินตัวเดียวกับตอนพรีวิว ตัวเลขที่เห็นก่อนกดจึงตรงกับที่นำเข้า
      const money = rowMoney(row, at);
      if (!ref || !when || !money) continue;

      const cid = `c-${idFor(`${ref.type}:${ref.value}`)}`;
      if (!seenCustomers.has(cid)) {
        seenCustomers.add(cid);
        customers++;
        await q.run(insCustomerQ, 
          cid,
          tenantId,
          at(row, "customer_name").trim() || "ลูกค้าไม่ระบุชื่อ",
          when,
        );
        // ตัวระบุถูก hash ก่อนเก็บ — ไม่มีเบอร์หรืออีเมลดิบในระบบ
        await q.run(insIdentityQ, tenantId, cid,
          ref.type,
          createHash("sha256").update(ref.value).digest("hex"),
        );
        /* ไฟล์ POS ไม่มีข้อมูลความยินยอม จึงตั้งเป็น "ยังไม่ยินยอม"
           คนกลุ่มนี้จะไม่ถูกส่งและไม่ถูกส่งออกจนกว่าร้านจะเก็บ
           ความยินยอมจริง — ปลอดภัยกว่าการเดาว่ายินยอม */
        await q.run(insConsentQ, tenantId, cid, "marketing", null, null, "csv_import");
      }

      const pname = at(row, "product_name").trim();
      let pid: string | null = null;
      if (pname) {
        pid = `p-${idFor(pname)}`;
        if (!seenProducts.has(pid)) {
          seenProducts.add(pid);
          const meta = preview.products.find((p) => p.name === pname);
          await q.run(insProductQ, 
            pid,
            tenantId,
            pname,
            meta?.category ?? "ทั่วไป",
            roleByName.get(pname) ?? "attachment",
            meta?.price ?? money.listUnit,
          );
        }
      }

      const txnId = `t-${idFor(`${cid}:${when}:${++txnSeq}`)}`;
      await q.run(insTxnQ, tenantId, txnId,
        cid,
        when,
        money.total,
        money.discount,
        at(row, "channel").trim() || "pos",
      );
      transactions++;
      // unit_price ต้องเป็นราคาต่อหน่วย ไม่ใช่ยอดรวมของแถว
      if (pid) await q.run(insLineQ, tenantId, txnId, pid, money.qty, money.unitNet, money.listUnit);
    }

    await logActivity(
      tenantId,
      "owner",
      "import_csv",
      `${customers} customers · ${transactions} transactions`,
    );

    // DERIVE ทันทีเพื่อให้เห็น insight ภายในสามนาที
    await deriveFeatures(tenantId);

    return {
      customers,
      transactions,
      products: seenProducts.size,
      rejected: preview.rejected.length,
      roleSource: roleGuess.source,
    };
  });
}
