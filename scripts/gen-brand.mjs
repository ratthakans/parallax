/* ── ผู้สร้างไฟล์แบรนด์ ────────────────────────────────────────

   ไฟล์ใน public/brand/ ทุกตัวออกมาจากสคริปต์นี้ ไม่มีตัวไหนวาดมือ

   ที่มาของรูปทรงคือ components/brand.tsx — ถ้าโลโก้บนเว็บเปลี่ยน
   ต้องแก้ที่นั่นก่อน แล้วรันตัวนี้ซ้ำ ไม่ใช่แก้ svg ทีละไฟล์ให้ตรงกันเอง

     node scripts/gen-brand.mjs

   ส่วน PNG เรนเดอร์จาก svg เหล่านี้ผ่าน canvas ของเบราว์เซอร์
   (qlmanage ของ macOS ใช้ไม่ได้ — มันแบนพื้นหลังเป็นสีขาวเสมอ
   โลโก้สีขาวจึงกลายเป็นสี่เหลี่ยมขาวเปล่าที่ยังรายงาน hasAlpha ตามปกติ)
   ───────────────────────────────────────────────────────────── */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public/brand");
mkdirSync(OUT, { recursive: true });

/* ── ค่าที่วัดจากเบราว์เซอร์ ไม่ใช่ค่าที่เดา ──
   IBM Plex Sans Thai 500 ที่ font-size 100:
     ความกว้าง 489.9 · cap height 69.8 · ระยะเว้นซ้ายของตัว P 8.6 */
const CAP_AT_100 = 69.8;
const LSB_AT_100 = 8.6;
const INK_R_AT_100 = 487.8;   // ขอบขวาของหมึกก่อนใส่ tracking

/* หน่วยของทุกไฟล์: cap height = 100 */
const CAP = 100;
const FONT = CAP / (CAP_AT_100 / 100);
const TRACK = 0.24 * FONT;                       // tracking 0.24em เท่าเว็บ
const TEXT_INK_L = (LSB_AT_100 / 100) * FONT;
const TEXT_INK_W = ((INK_R_AT_100 - LSB_AT_100) / 100) * FONT + 7 * TRACK;

/* สัดส่วนของ Wordmark บนเว็บ: mark 20px · gap 10px · ตัวอักษร 15.2px */
const CAP_PX = 15.2 * (CAP_AT_100 / 100);
const WEB_MARK = (20 / CAP_PX) * CAP;            // 188.51
const WEB_GAP = (10 / CAP_PX) * CAP;             // 94.25

/* ── เรขาคณิตของเครื่องหมาย บนกริด 24 หน่วยเดิม ── */
const G = { apex: [12, 4.5], left: [3, 19.5], right: [21, 19.5], stroke: 1.1, dot: 1.9 };
const FADE = 0.35;   // เส้นฐานจาง — ดู "baseline rule" ในหน้า /brand

function markGeometry(box) {
  const s = box / 24;
  const stroke = G.stroke * s;
  const dot = G.dot * s;
  const half = stroke / 2;
  const [ax, ay] = G.apex.map((v) => v * s);
  const [lx, ly] = G.left.map((v) => v * s);
  const rx = G.right[0] * s;
  return {
    s, stroke, dot, ax, ay, lx, ly, rx,
    inkL: lx - half, inkR: rx + half,
    inkT: ay - dot, inkB: ly + half,
  };
}

const round = (n) => Math.round(n * 100) / 100;

function markSvgBody(m, color, dy) {
  const p = (n) => round(n);
  return `
    <path d="M${p(m.lx)} ${p(m.ly + dy)} L${p(m.ax)} ${p(m.ay + dy)} L${p(m.rx)} ${p(m.ly + dy)}"
          fill="none" stroke="${color}" stroke-width="${p(m.stroke)}" stroke-linecap="round"/>
    <path d="M${p(m.lx)} ${p(m.ly + dy)} L${p(m.rx)} ${p(m.ly + dy)}"
          fill="none" stroke="${color}" stroke-width="${p(m.stroke)}" stroke-linecap="round" opacity="${FADE}"/>
    <circle cx="${p(m.ax)}" cy="${p(m.ay + dy)}" r="${p(m.dot)}" fill="${color}"/>`;
}

/* ── ฟอนต์ฝังในไฟล์ ──
   ชุด latin ของ IBM Plex Sans Thai 500 ที่ Next โหลดไว้แล้ว
   (แผนที่ชื่อไฟล์อยู่ใน @font-face ของ public/deck/index.html)
   ฝังไว้เพื่อให้เปิดที่ไหนตัวอักษรก็ถูก ไม่ต้องลงฟอนต์ก่อน */
const WOFF2 = join(ROOT, "public/deck/assets/website-brand/666deae7c569669f-s.p.2t1pwrt0o-zp3.woff2");
const fontB64 = readFileSync(WOFF2).toString("base64");
const FACE = `<defs><style>
    @font-face{font-family:"IBM Plex Sans Thai";font-style:normal;font-weight:500;src:url(data:font/woff2;base64,${fontB64}) format("woff2")}
  </style></defs>`;

const STACK = "IBM Plex Sans Thai, IBM Plex Sans, Helvetica Neue, Arial, sans-serif";

/**
 * ล็อกอัพ = เครื่องหมาย + ตัวอักษร
 *
 * @param markBox  กล่องของเครื่องหมายในหน่วย cap = 100
 * @param gap      ระยะจากขอบขวาของกล่องถึงจุดเริ่มตัวอักษร
 */
function lockup(color, { markBox, gap, embed = true } = {}) {
  const m = markGeometry(markBox);
  // จัดกึ่งกลางเครื่องหมายกับกึ่งกลาง cap height
  const dy = CAP / 2 - (m.inkT + m.inkB) / 2;
  const penX = markBox + gap;

  const L = Math.min(m.inkL, penX + TEXT_INK_L);
  const R = penX + TEXT_INK_L + TEXT_INK_W;
  const T = Math.min(m.inkT + dy, 0);            // 0 = ยอดของตัว P
  const B = Math.max(m.inkB + dy, CAP);          // CAP = เส้นฐานของตัวอักษร
  const W = R - L, H = B - T;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${round(W)} ${round(H)}" width="${round(W)}" height="${round(H)}" role="img" aria-label="PARALLAX">
  <title>PARALLAX</title>
  ${embed ? FACE : ""}
  <g transform="translate(${round(-L)} ${round(-T)})">${markSvgBody(m, color, dy)}
    <text x="${round(penX)}" y="${CAP}" fill="${color}"
          font-family="${STACK}" font-weight="500"
          font-size="${round(FONT)}" letter-spacing="${round(TRACK)}"
          xml:space="preserve">PARALLAX</text>
  </g>
</svg>
`;
}

function markOnly(color) {
  const m = markGeometry(WEB_MARK);
  const w = m.inkR - m.inkL, h = m.inkB - m.inkT;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${round(w)} ${round(h)}" width="${round(w)}" height="${round(h)}" role="img" aria-label="PARALLAX">
  <title>PARALLAX</title>
  <g transform="translate(${round(-m.inkL)} ${round(-m.inkT)})">${markSvgBody(m, color, 0)}
  </g>
</svg>
`;
}

const COLORS = {
  ink: "#0a1633",      // พื้นสว่าง — ค่าตั้งต้น
  white: "#ffffff",    // พื้นเข้ม
  signal: "#0047ff",   // สีเน้นของแบรนด์
};

/* ── ล็อกอัพตัวรอง ──
   เครื่องหมายเตี้ยลงจนสูงเท่าตัว P พอดี และระยะแคบลง
   ใช้ตอนโลโก้ต้องยืนเรียงกับโลโก้เจ้าอื่น (co-branding · ท้ายเอกสาร)
   ซึ่งตัวหลักจะสูงข่มเพื่อนบ้านทุกครั้ง */
const COMPACT_MARK = WEB_MARK * (CAP / (markGeometry(WEB_MARK).inkB - markGeometry(WEB_MARK).inkT));
const COMPACT_GAP = 0.62 * CAP;

const files = [];
for (const [name, hex] of Object.entries(COLORS)) {
  files.push([`parallax-logo-${name}.svg`, lockup(hex, { markBox: WEB_MARK, gap: WEB_GAP })]);
  files.push([`parallax-logo-compact-${name}.svg`, lockup(hex, { markBox: COMPACT_MARK, gap: COMPACT_GAP })]);
  files.push([`parallax-mark-${name}.svg`, markOnly(hex)]);
}
/* ตัวที่เอาไปแก้ต่อในโปรแกรมออกแบบ — ไม่ฝังฟอนต์ ตัวอักษรยังเป็นตัวอักษร */
files.push([
  "parallax-logo-editable.svg",
  lockup(COLORS.ink, { markBox: WEB_MARK, gap: WEB_GAP, embed: false }),
]);

for (const [name, body] of files) {
  writeFileSync(join(OUT, name), body);
}

const box = (svg) => svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/).slice(1).join(" × ");
console.log(`หลัก    ${box(lockup("#000", { markBox: WEB_MARK, gap: WEB_GAP }))}   เครื่องหมาย ${round(markGeometry(WEB_MARK).inkB - markGeometry(WEB_MARK).inkT)} สูง`);
console.log(`รอง     ${box(lockup("#000", { markBox: COMPACT_MARK, gap: COMPACT_GAP }))}   เครื่องหมาย ${CAP} สูง`);
console.log(`\n${files.length} ไฟล์ · cap height = ${CAP} หน่วยในทุกไฟล์`);
