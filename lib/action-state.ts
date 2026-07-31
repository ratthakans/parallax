/* ── ผลของ Server Action ที่ผู้ใช้ต้องได้อ่าน ────────────────────

   เดิมทุก action สื่อสารความล้มเหลวด้วยการ throw ซึ่งอ่านดีมากในโค้ด
   ("Cannot send yet — quiet hours") แต่ผู้ใช้ไม่มีวันได้เห็น: Next
   ตัดข้อความของ error ที่มาจากฝั่งเซิร์ฟเวอร์ทิ้งใน production
   เพื่อไม่ให้รายละเอียดภายในรั่ว เหลือแค่ข้อความกลาง ๆ กับ digest

   ความล้มเหลวที่ "คาดไว้แล้ว" — ช่วงห้ามส่ง · เครดิตหมด · เกินเพดานแผน —
   จึงต้องเป็นค่าที่ return ออกมา ไม่ใช่ข้อยกเว้นที่โยนทิ้ง ส่วน error.tsx
   เก็บเฉพาะสิ่งที่ไม่ควรเกิดจริง ๆ

   ok กับ error อยู่ด้วยกันได้ เพราะการส่งหนึ่งครั้งจบแบบครึ่ง ๆ ได้จริง:
   ส่งไป 400 คน แล้วเครดิตหมดกลางทาง อีก 143 คนไม่ได้รับ */
export type ActionState = {
  ok?: string;
  error?: string;
} | null;

/** ข้อความจาก error ที่โยนออกมา — ใช้เมื่อดักไว้ในฝั่งเซิร์ฟเวอร์แล้วเท่านั้น */
export function messageOf(err: unknown): string {
  return err instanceof Error && err.message
    ? err.message
    : "Something went wrong. Nothing was changed.";
}
