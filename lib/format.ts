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
