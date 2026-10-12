import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import type { Param } from "@/lib/engine/sql";

/* ── ข้อมูลติดต่อของลูกค้า: เก็บค่าจริง แต่ไม่เก็บแบบอ่านได้ ──────

   เดิมระบบเก็บเฉพาะ sha256 ของเบอร์ ด้วยเหตุผลว่า "ไม่มีเบอร์ดิบในระบบ"
   ซึ่งจริงตามตัวอักษร แต่ไม่ได้ปกป้องอะไร: เบอร์มือถือไทยมีราว 3 × 10⁸ เบอร์
   วัดแล้ว CPU หนึ่ง core ของเครื่องพัฒนาคำนวณได้ 1.78 ล้าน hash ต่อวินาที
   ไล่ครบทุกเบอร์ในราว 3 นาที และถอดเบอร์ตัวอย่างกลับได้ใน 1.33 วินาที

   CRM ต้องโทรหาลูกค้าได้ จึงต้องเก็บค่าจริง ไฟล์นี้คือที่เดียวที่ทำได้:

     encryptContact  AES-256-GCM — อ่านกลับได้เฉพาะคนที่มีกุญแจ
     matchKey        HMAC-SHA256 ผูกกับร้าน — ใช้จับคู่และตรวจซ้ำ
                     ถอดกลับไม่ได้ถ้าไม่มีกุญแจ และร้านต่างกันได้ค่าต่างกัน
     maskContact     ค่าที่ปิดบางส่วนไว้แสดงบนหน้าจอ ไม่ต้องถอดรหัส

   กฎ boundary: createDecipheriv ถูกเรียกได้ที่ไฟล์นี้เท่านั้น
   ───────────────────────────────────────────────────────────── */

/* member_no ไม่ใช่ช่องทางติดต่อ แต่เป็นตัวระบุตัวคน — อยู่ตารางเดียวกันเพราะ
   ทำหน้าที่เดียวกัน: บอกว่าแถวในไฟล์ใหม่คือคนเดิมคนไหน เดิมตัวระบุแยกไปอยู่
   ตาราง identities ซึ่ง hash ค่าเดียวกันซ้ำกับตารางนี้ทุกตัว */
export const CONTACT_KINDS = [
  "phone", "email", "line", "facebook", "instagram", "tiktok", "website", "address", "member_no",
] as const;
export type ContactKind = (typeof CONTACT_KINDS)[number];

/* ── กุญแจ ────────────────────────────────────────────────────

   PII_KEY       32 ไบต์ base64 — เข้ารหัสค่า
   PII_HMAC_KEY  32 ไบต์ base64 — ทำ matchKey และ ID ลูกค้า
                 ⚠ ห้ามเปลี่ยนหลังมีข้อมูลจริง: ID ของลูกค้าคำนวณจากกุญแจนี้
                 เปลี่ยนเมื่อไร ไฟล์ที่นำเข้ารอบถัดไปจะกลายเป็นลูกค้าคนใหม่ทั้งหมด

   ไม่มีกุญแจบน production = ปฏิเสธ ไม่ใช่ถอยไปเก็บแบบอ่านได้ และไม่ใช่
   ใช้กุญแจสำหรับพัฒนาเงียบ ๆ — สองอย่างนั้นคือการรั่วที่ไม่มีใครเห็น
   ส่วนเครื่องพัฒนาและ CI ใช้กุญแจตายตัวด้านล่าง เพื่อให้ชุดตรวจรันได้โดย
   ไม่ต้องตั้งค่าอะไร ข้อมูลที่เข้ารหัสด้วยมันจึงไม่ควรถือว่าเป็นความลับ */
const isProduction = () =>
  Boolean(process.env.VERCEL) || process.env.NODE_ENV === "production";

function key(name: "PII_KEY" | "PII_HMAC_KEY"): Buffer {
  const raw = process.env[name];
  if (raw) {
    const k = Buffer.from(raw, "base64");
    if (k.length !== 32) throw new Error(`${name} ต้องเป็น 32 ไบต์ในรูป base64`);
    return k;
  }
  if (isProduction()) {
    throw new Error(
      `ยังไม่ได้ตั้ง ${name} — ระบบจะไม่เก็บข้อมูลติดต่อจนกว่าจะมีกุญแจ`,
    );
  }
  return createHash("sha256").update(`parallax-dev-only:${name}`).digest();
}

/** พร้อมเก็บข้อมูลติดต่อหรือยัง — หน้าจอใช้เตือนก่อนนำเข้า แทนที่จะพังกลางทาง */
export function contactStorageReady(): boolean {
  try {
    key("PII_KEY");
    key("PII_HMAC_KEY");
    return true;
  } catch {
    return false;
  }
}

/* ── เข้ารหัส ──

   AAD ผูกค่าไว้กับร้านและชนิด: ciphertext ที่ถูกคัดลอกไปวางในแถวของอีกร้าน
   หรือย้ายจากช่องอีเมลไปช่องเบอร์ จะถอดไม่ออก แทนที่จะถอดได้แล้วแสดงผิดที่ */
const VERSION = "v1";

export function encryptContact(tenantId: string, kind: ContactKind, value: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key("PII_KEY"), iv);
  c.setAAD(Buffer.from(`${tenantId}:${kind}`));
  const ct = Buffer.concat([c.update(value, "utf8"), c.final()]);
  const b = (x: Buffer) => x.toString("base64url");
  return `${VERSION}.${b(iv)}.${b(c.getAuthTag())}.${b(ct)}`;
}

export function decryptContact(tenantId: string, kind: ContactKind, sealed: string): string {
  const [v, iv, tag, ct] = sealed.split(".");
  if (v !== VERSION || !iv || !tag || !ct) throw new Error("รูปแบบข้อมูลเข้ารหัสไม่ถูกต้อง");
  const d = createDecipheriv("aes-256-gcm", key("PII_KEY"), Buffer.from(iv, "base64url"));
  d.setAAD(Buffer.from(`${tenantId}:${kind}`));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
}

/* ── กุญแจจับคู่ ──

   ผูกกับร้านโดยตั้งใจ: คนเดียวกันที่เป็นลูกค้าของสองร้านต้องเป็นสองแถว
   ไม่ใช่แถวเดียวที่สองร้านแย่งกันเขียน — ซึ่งคือสิ่งที่ ID แบบเดิม
   (sha256 ของ "phone:เบอร์" ไม่มีรหัสร้าน) ทำให้เกิดขึ้นจริง */
export function matchKey(tenantId: string, kind: string, normalised: string): string {
  return createHmac("sha256", key("PII_HMAC_KEY"))
    .update(`${tenantId}\u001f${kind}\u001f${normalised}`)
    .digest("hex");
}

/* ── จัดรูปแบบก่อนเก็บ ──
   ค่าเดียวกันต้องได้ข้อความเดียวกันเสมอ ไม่งั้น matchKey จะต่างกันแล้ว
   คนเดียวกันกลายเป็นสองคน: "081-234-5678" · "+66 81 234 5678" · "0812345678" */
/* ── ID ลูกค้าผูกกับร้าน และถอดกลับเป็นเบอร์ไม่ได้ ──
   ที่เดียวที่สร้าง ID จากตัวระบุ ทั้งการนำเข้าไฟล์และการเพิ่มลูกค้าเองในหน้าจอ
   ใช้ฟังก์ชันนี้ คนที่พิมพ์เพิ่มไว้ก่อนจึงเป็นคนเดียวกับแถวในไฟล์ที่นำเข้าทีหลัง

   เดิมคือ c- + sha256("phone:เบอร์") ไม่มีรหัสร้าน: สองร้านนำเข้าเบอร์เดียวกัน
   ได้แถวเดียว ร้านที่สองเขียนชื่อทับและธุรกรรมของร้านที่สองหายเงียบ (ทดสอบแล้ว)
   และ sha256 ของเบอร์ถอดกลับได้ในไม่กี่นาที ID จึงเท่ากับเบอร์โทร */
export function customerIdFor(tenantId: string, kind: string, normalised: string): string {
  return `c-${matchKey(tenantId, kind, normalised).slice(0, 24)}`;
}

export function normaliseContact(kind: ContactKind, raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  switch (kind) {
    case "phone": {
      /* เลขที่ Excel แปลงเป็นวิทยาศาสตร์แล้ว (8.12346E+08) เสียหลักท้ายไปแล้ว
         และเบอร์ที่ปิดบางส่วน (******1234 จากมาร์เก็ตเพลส) ไม่ใช่เบอร์ —
         เดิมทั้งสองแบบผ่านออกมาเป็น "+81234608" ซึ่งคือเบอร์ญี่ปุ่นของคนอื่น */
      if (/\d[.,]?\d*e\+?\d/i.test(v) || /[*x•]{3,}/i.test(v)) return null;
      const plus = v.startsWith("+");
      let d = v.replace(/[^\d]/g, "");
      if (!d) return null;
      if (plus) return d.length >= 8 && d.length <= 15 ? `+${d}` : null;
      /* ไม่มี + = เบอร์ไทยเท่านั้น: 0 นำหน้า 9–10 หลัก · หรือ 9 หลักที่ Excel ตัดศูนย์ทิ้ง
         · หรือ 66 นำหน้า เลขแบบอื่นเดาประเทศไม่ได้ จึงไม่รับ แทนที่จะเดาผิด */
      if (d.startsWith("0") && (d.length === 9 || d.length === 10)) d = `66${d.slice(1)}`;
      else if (d.length === 9 && !d.startsWith("66")) d = `66${d}`;
      else if (d.length === 8 && /^[2-7]/.test(d)) d = `66${d}`;
      return d.startsWith("66") && (d.length === 10 || d.length === 11) ? `+${d}` : null;
    }
    case "email": {
      const e = v.toLowerCase();
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
    }
    case "line":
      return v.replace(/\s+/g, "").toLowerCase();
    case "facebook":
    case "instagram":
    case "tiktok": {
      // รับได้ทั้งลิงก์เต็มและชื่อบัญชี เก็บเป็นชื่อบัญชีอย่างเดียว
      const handle = v
        .replace(/^https?:\/\/(www\.|m\.)?[^/]+\//i, "")
        .replace(/^@/, "")
        .replace(/[/?#].*$/, "");
      return handle ? handle.toLowerCase() : null;
    }
    case "website": {
      const u = /^https?:\/\//i.test(v) ? v : `https://${v}`;
      try {
        const url = new URL(u);
        return `${url.protocol}//${url.host.toLowerCase()}${url.pathname.replace(/\/$/, "")}`;
      } catch {
        return null;
      }
    }
    case "address":
      return v.replace(/\s+/g, " ");
    case "member_no":
      return v;
  }
}

/* ── ค่าที่ปิดบางส่วน ──
   พอให้คนในทีมรู้ว่ามีช่องทางนี้และเป็นของใคร โดยไม่ต้องถอดรหัสทุกครั้ง
   ที่เปิดหน้า การเห็นค่าเต็มต้องผ่าน revealContactPoint ซึ่งบันทึกไว้ทุกครั้ง */
export function maskContact(kind: ContactKind, normalised: string): string {
  switch (kind) {
    case "phone": {
      const local = normalised.startsWith("+66") ? `0${normalised.slice(3)}` : normalised;
      return local.length > 4 ? `${local.slice(0, 3)}-xxx-${local.slice(-4)}` : "xxx";
    }
    case "email": {
      const [u, d] = normalised.split("@");
      return `${u.slice(0, 1)}${"•".repeat(Math.max(1, Math.min(u.length - 1, 5)))}@${d}`;
    }
    case "address": {
      // เหลือแค่คำท้าย ๆ ซึ่งมักเป็นจังหวัดและรหัสไปรษณีย์
      const parts = normalised.split(" ");
      return parts.length > 2 ? `… ${parts.slice(-2).join(" ")}` : "…";
    }
    case "website":
      return normalised.replace(/^https?:\/\//, "");
    default:
      return normalised.length > 3 ? `${normalised.slice(0, 2)}•••${normalised.slice(-1)}` : "•••";
  }
}

/* ── แถวหนึ่งของ contact_points ──
   ที่เดียวที่ประกอบค่าที่ปิดผนึกแล้ว — การนำเข้าและข้อมูลตัวอย่างใช้ตัวเดียวกัน
   จึงไม่มีทางที่ทางหนึ่งเก็บแบบอ่านได้ ส่วนอีกทางเข้ารหัส

   id อ่านออกตรง ๆ: ลูกค้า · ชนิด · กุญแจจับคู่ 16 ตัวแรก (ถอดกลับไม่ได้)
   คนในบัญชีเดียวกันใช้เบอร์ร่วมกันได้ (เบอร์บ้าน) id จึงต้องมีรหัสลูกค้าด้วย */
export const CONTACT_POINT_COLUMNS = [
  "id", "tenant_id", "customer_id", "kind", "label", "value_enc", "value_hmac",
  "value_masked", "is_primary", "source", "created_at",
];

export function contactPointRow(
  tenantId: string,
  customerId: string,
  kind: ContactKind,
  normalised: string,
  label: string | null,
  isPrimary: boolean,
  source: string,
): Param[] {
  const hmac = matchKey(tenantId, kind, normalised);
  return [
    `${customerId}:${kind}:${hmac.slice(0, 16)}`,
    tenantId, customerId, kind, label,
    encryptContact(tenantId, kind, normalised),
    hmac,
    maskContact(kind, normalised),
    isPrimary ? 1 : 0,
    source,
    new Date().toISOString(),
  ];
}
