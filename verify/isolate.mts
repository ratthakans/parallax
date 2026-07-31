/* ── ชุดตรวจต้องมีฐานข้อมูลของตัวเอง ──────────────────────────

   เดิมทุกชุดเขียนลง .data/parallax.db ตัวเดียวกับ dev server: ชุดตรวจ
   อนุมัติแคมเปญและส่งข้อความจริงลงฐานที่ใช้เปิดดูอยู่ แล้วรอบถัดไป
   ก็ไปเจอของที่ตัวเองทิ้งไว้ ผลคือรันสองครั้งติดกันได้คนละคำตอบ —
   "ไม่มีแคมเปญหลุดเข้าฐานตอนถูกปฏิเสธ (พบ 3)" คือของที่รอบก่อนทิ้งไว้
   ไม่ใช่บั๊กที่ชุดตรวจกำลังจับ

   ต้อง import ไฟล์นี้ก่อน import อะไรที่แตะ lib/db เพราะ DB_PATH
   ถูกอ่านตอนโหลดโมดูล ไม่ใช่ตอนเปิดฐาน

   ตั้ง PARALLAX_DB_PATH เองได้ ถ้าอยากตรวจฐานจริง */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

if (!process.env.PARALLAX_DB_PATH) {
  process.env.PARALLAX_DB_PATH = join(
    mkdtempSync(join(tmpdir(), "parallax-verify-")),
    "parallax.db",
  );
}
