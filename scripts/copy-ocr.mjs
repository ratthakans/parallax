/* ── ไฟล์อ่านนามบัตรในเครื่อง (docs/brand-plan.md §5.2) ──────────────

   tesseract.js ดึง worker · wasm core · ข้อมูลภาษา จาก CDN เป็นค่าตั้งต้น
   เราไม่ให้คอนโซลโหลดสคริปต์จากที่อื่น (CSP · และรูปนามบัตรต้องไม่ออกนอกเครื่อง)
   จึงคัดไฟล์จาก node_modules มาไว้ที่ public/ocr/ ก่อน dev และ build ทุกครั้ง

   ไม่ commit ไฟล์เหล่านี้ (~16MB · อยู่ใน .gitignore) — รุ่นถูกตรึงด้วย package-lock แทน
   core เอาเฉพาะแบบ LSTM สามตัว (เบราว์เซอร์โหลดตัวเดียวตามที่รองรับ SIMD) */

import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const out = "public/ocr";
mkdirSync(out, { recursive: true });
const files = [
  ["node_modules/tesseract.js/dist/worker.min.js", "worker.min.js"],
  ["node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js", "tesseract-core-lstm.wasm.js"],
  ["node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js"],
  ["node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js", "tesseract-core-relaxedsimd-lstm.wasm.js"],
  ["node_modules/@tesseract.js-data/tha/4.0.0_best_int/tha.traineddata.gz", "tha.traineddata.gz"],
  ["node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz", "eng.traineddata.gz"],
];
for (const [from, to] of files) copyFileSync(from, join(out, to));
console.log(`ocr: คัด ${files.length} ไฟล์ไป ${out}/`);
