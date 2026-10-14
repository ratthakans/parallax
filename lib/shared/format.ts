/* ตัวจัดรูปตัวเลขชุดเดียวของทั้งคอนโซล

   อยู่ใน lib ไม่ใช่ใน component เพราะ Server Action ก็ต้องเขียนข้อความ
   ที่มีตัวเลขให้ผู้ใช้อ่านเหมือนกัน ("ส่งไป 1,204 · เหลือเครดิต 3,796")
   และ action ไม่ควรต้อง import ไฟล์ .tsx เพื่อขอฟังก์ชันสามบรรทัด */

export const baht = (n: number) => `฿${Math.round(n).toLocaleString("en-US")}`;
export const num = (n: number) => n.toLocaleString("en-US");
export const pct = (n: number, digits = 1) => `${n.toFixed(digits)}%`;

/* ── ช่วงความเชื่อมั่นที่ไม่มีอยู่จริง ต้องเขียนว่าไม่มี ──────────

   แคมเปญที่เล็กเกินกว่าจะกันกลุ่มควบคุมไว้ได้จะวัดด้วยวิธี time-shift
   แทน กลุ่มควบคุมจึงมีศูนย์คน ค่าความคลาดเคลื่อนมาตรฐานเป็นอนันต์
   ตามนิยาม และ (-Infinity).toFixed(1) คืนสตริง "-Infinity" ตรง ๆ
   หน้าจอจึงเคยอ่านว่า "95% CI -Infinity to Infinity%" ซึ่งดูเหมือน
   ระบบพัง ทั้งที่ความหมายคือ "ไม่มีกลุ่มเปรียบเทียบ จึงไม่มีช่วง"

   เลขที่คำนวณไม่ได้ต้องบอกว่าคำนวณไม่ได้ ไม่ใช่พิมพ์สัญลักษณ์อนันต์
   ออกมาให้ตีความเอง */
export function ciLabel(low: number, high: number): string {
  if (!Number.isFinite(low) || !Number.isFinite(high)) return "No control group";
  return `${low.toFixed(1)} to ${high.toFixed(1)}%`;
}

/* ── วันที่แบบไทย ปี พ.ศ. ชุดเดียวทั้งคอนโซล ──────────────────

   หน้าจอเดียวเคยมีวันที่สามแบบ: "MONDAY 12 OCTOBER" · "11/10/69" ·
   "2025-10-30" ซึ่งอย่างหลังเป็นค่าดิบจากฐานข้อมูลที่หลุดออกมาตรง ๆ
   และคนอ่านต้องแปลงปีเองว่าเป็น ค.ศ. หรือ พ.ศ.

   timeZone ตั้งเป็นกรุงเทพตายตัว เพราะเซิร์ฟเวอร์บน Vercel ใช้ UTC —
   ซื้อตอนตีหนึ่งเวลาไทยจะกลายเป็นเมื่อวานถ้าปล่อยให้ใช้โซนของเครื่อง */
const TH_DATE = new Intl.DateTimeFormat("th-TH", {
  day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok",
});
const TH_DATE_TIME = new Intl.DateTimeFormat("th-TH", {
  day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  timeZone: "Asia/Bangkok",
});

/* วันและชั่วโมงตามเวลาไทยสำหรับตรรกะ (ไม่ใช่การแสดงผล) — ประเทศไทยไม่มีเวลาออมแสง จึงบวก 7 ชั่วโมงได้ตรง ๆ */
export const bangkokDay = (t: number | Date = Date.now()): string => new Date(+t + 7 * 3600_000).toISOString().slice(0, 10);
export const bangkokHour = (t: number | Date = Date.now()): number => new Date(+t + 7 * 3600_000).getUTCHours();

export function thaiDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  return Number.isNaN(t) ? "—" : TH_DATE.format(t);
}

export function thaiDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  return Number.isNaN(t) ? "—" : TH_DATE_TIME.format(t);
}

/** "วันนี้" · "เมื่อวาน" · "12 วันก่อน" — นับเป็นวันเต็ม ไม่ใช่ 24 ชั่วโมงล่าสุด */
export function daysAgoLabel(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "—";
  const d = Math.floor((now - Date.parse(iso)) / 86400000);
  if (Number.isNaN(d)) return "—";
  if (d <= 0) return "วันนี้";
  if (d === 1) return "เมื่อวาน";
  return `${num(d)} วันก่อน`;
}

/** "วันจันทร์ที่ 12 ตุลาคม 2569" — หัวบรีฟเช้า */
export function thaiDateLong(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("th-TH", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bangkok",
  }).format(d);
}
