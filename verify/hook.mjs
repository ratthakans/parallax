// ให้ node นำเข้าไฟล์แบบไม่ใส่นามสกุลได้เหมือนที่ bundler ทำ
// ใช้เฉพาะสคริปต์ตรวจ invariant ไม่เกี่ยวกับ runtime ของแอป
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const p = new URL(`../${specifier.slice(2)}`, import.meta.url);
    for (const ext of [".ts", ".tsx", "/index.ts"]) {
      const cand = new URL(p.href + ext);
      if (existsSync(fileURLToPath(cand))) return next(cand.href, context);
    }
  }
  if (specifier.startsWith(".") && !/\.[a-z]+$/.test(specifier)) {
    const base = new URL(specifier, context.parentURL ?? pathToFileURL(process.cwd()));
    for (const ext of [".ts", ".tsx", "/index.ts"]) {
      const cand = new URL(base.href + ext);
      if (existsSync(fileURLToPath(cand))) return next(cand.href, context);
    }
  }
  return next(specifier, context);
}
