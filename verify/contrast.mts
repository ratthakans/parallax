/* ── ทุกคู่ตัวหนังสือ/พื้นของคอนโซลต้องผ่าน WCAG AA (4.5:1) ──────

   แผน H เปลี่ยนสีทั้งชุด (docs/brand-plan.md §3) — ชุดสีที่เปลี่ยนด้วยตา
   คือชุดสีที่ ink-4 เคยตกเหลือ 2.6:1 มาแล้วครั้งหนึ่ง (ดู globals.css)
   ไฟล์นี้อ่านค่าจริงจาก console.css ทั้งสองธีม ไม่ใช่ค่าที่เราจำว่าตั้งไว้
   ───────────────────────────────────────────────────────────── */

import { readFileSync } from "node:fs";

const css = readFileSync("app/(app)/console.css", "utf8");

function block(selector: string): Record<string, string> {
  const at = css.indexOf(`${selector} {`);
  if (at < 0) throw new Error(`ไม่เจอ ${selector}`);
  const body = css.slice(at, css.indexOf("}", at));
  const vars: Record<string, string> = {};
  for (const m of body.matchAll(/--(c-[a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi)) {
    vars[m[1]] = m[2];
  }
  return vars;
}

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const TEXT = ["c-text", "c-text-2", "c-text-3", "c-text-4", "c-accent", "c-cyan", "c-good", "c-warn", "c-bad"];
const GROUND = ["c-bg", "c-bg-2", "c-panel", "c-panel-2"];

let fail = 0;
for (const [name, sel] of [
  ["สว่าง", ".console"],
  ["มืด", '.console[data-theme="dark"]'],
] as const) {
  const v = block(sel);
  const pairs: [string, string][] = [
    ...TEXT.flatMap((t) => GROUND.map((g) => [t, g] as [string, string])),
    ["c-on-primary", "c-primary"],
    ["c-on-primary", "c-primary-hover"],
  ];
  let worst = Infinity;
  for (const [t, g] of pairs) {
    if (!v[t] || !v[g]) {
      console.error(`FAIL ${name}: ไม่มีค่า --${!v[t] ? t : g}`);
      fail++;
      continue;
    }
    const r = ratio(v[t], v[g]);
    worst = Math.min(worst, r);
    if (r < 4.5) {
      console.error(`FAIL ${name}: --${t} ${v[t]} บน --${g} ${v[g]} = ${r.toFixed(2)}:1`);
      fail++;
    }
  }
  console.log(`${name}: ${pairs.length} คู่ · ต่ำสุด ${worst.toFixed(2)}:1`);
}

if (fail) {
  console.error(`\n${fail} คู่ไม่ผ่าน AA`);
  process.exit(1);
}
console.log("=== contrast ผ่านทั้งสองธีม ===");
