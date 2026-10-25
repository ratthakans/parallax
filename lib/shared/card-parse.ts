/* ── แยกข้อความที่อ่านจากรูปนามบัตรเป็นช่อง (docs/brand-plan.md §5.2) ──────

   รูปถูกอ่านในเบราว์เซอร์ (tesseract) — ไฟล์นี้รับแค่บรรทัดข้อความที่อ่านได้
   จึงทดสอบได้โดยไม่ต้องมีรูปหรือเบราว์เซอร์ (verify/card-parse.mts)

   กฎ ไม่ใช่โมเดล: อีเมล/เบอร์จับด้วยรูปแบบ · บริษัท/ตำแหน่งจับด้วยคำ ·
   ชื่อ = บรรทัดข้อความล้วนที่เหลือบรรทัดแรก ซึ่งพลาดได้ — ทุกช่องที่เดา
   จึงติดธง unsure ให้หน้าจอขอให้คนตรวจ ก่อนบันทึกผู้ใช้เห็นและแก้ได้ทุกช่องเสมอ */

/** ช่องเดียวกับ CardInput ของ lib/engine/vault/cards — ประกาศซ้ำเพราะ lib/shared ห้าม import engine */
export type CardFields = { name: string; title: string; company: string; email: string; phone: string };
export type CardLine = { text: string; confidence?: number };
export type ParsedCard = { card: CardFields; unsure: (keyof CardFields)[] };

/** ต่ำกว่านี้ถือว่า OCR อ่านบรรทัดนั้นไม่ชัด — ช่องที่มาจากบรรทัดนั้นต้องตรวจ */
export const LOW_CONFIDENCE = 70;

const EMAIL = /[A-Za-z0-9._%+-]+\s?@\s?[A-Za-z0-9.-]+\s?\.\s?[A-Za-z]{2,}/;
const PHONE = /(?:\+\s?66|\(?0)[\d\s().-]{7,15}\d/g;
const FAX = /fax|แฟกซ์|โทรสาร|(^|\s)f\s?[:.]/i;
const WEB = /www\.|https?:|\.co\.th|\.com\b|\.net\b|\.org\b/i;
const COMPANY = /บริษัท|จำกัด|มหาชน|ห้างหุ้นส่วน|หจก|co\.?,?\s*ltd|company|corporation|\bcorp\b|\bgroup\b|\binc\b|limited|\bplc\b|holdings?/i;
const TITLE =
  /ผู้จัดการ|ผู้อำนวยการ|กรรมการ|ประธาน|หัวหน้า|เจ้าหน้าที่|วิศวกร|ที่ปรึกษา|นักวิเคราะห์|ผู้ช่วย|เลขานุการ|พนักงาน|ผู้แทน|ฝ่าย|ผู้ประสานงาน|ผู้ก่อตั้ง|เจ้าของ|\b(manager|director|engineer|officer|executive|ceo|cto|cfo|coo|cmo|president|vp|head|lead|specialist|consultant|analyst|coordinator|founder|partner|owner|assistant|supervisor|representative|sales|marketing|account)\b/i;
const ADDRESS = /ถนน|ถ\.|แขวง|เขต|ตำบล|ต\.|อำเภอ|อ\.|จังหวัด|ซอย|ชั้น|อาคาร|หมู่|road|\brd\b|street|\bst\b|soi|floor|building|tower|bangkok|กรุงเทพ|\b\d{5}\b/i;
const PREFIX = /^(?:นางสาว|นาง|นาย|น\.ส\.|คุณ|ดร\.|(?:mrs|mr|ms|miss|dr)(?:\.|\s))\s*/i;

/* OCR อ่าน "ำ" เป็นสองตัว (นิคหิต + า) — หน้าตาเหมือนกันแต่ค้นหาและตรวจคนซ้ำไม่เจอ */
const clean = (s: string) =>
  s.normalize("NFC").replace(/\u0E4D\u0E32/g, "\u0E33").replace(/[|_~`^*]+/g, " ").replace(/\s+/g, " ").trim();

/** มือถือไทยขึ้นต้น 06/08/09 · ตอบเป็นตัวเลขล้วนแบบ 0XXXXXXXXX หรือ null ถ้าไม่ใช่เบอร์ไทยที่ครบ */
export function normalizePhone(raw: string): string | null {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("66")) d = `0${d.slice(2)}`;
  /* +66 (0) 81… — คนพิมพ์ศูนย์ในวงเล็บไว้ให้คนในประเทศ */
  if (d.startsWith("00")) d = d.slice(1);
  if (!d.startsWith("0")) return null;
  return d.length === 9 || d.length === 10 ? d : null;
}

const isMobile = (d: string) => d.length === 10 && /^0[689]/.test(d);
const formatPhone = (d: string) =>
  d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : d.startsWith("02") ? `02-${d.slice(2, 5)}-${d.slice(5)}` : `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;

export function parseCardLines(input: CardLine[] | string): ParsedCard {
  const lines: CardLine[] = (typeof input === "string" ? input.split(/\r?\n/).map((text) => ({ text })) : input)
    .map((l) => ({ ...l, text: clean(l.text) }))
    .filter((l) => l.text.length >= 2);
  const low = (l?: CardLine) => l?.confidence != null && l.confidence < LOW_CONFIDENCE;
  const unsure = new Set<keyof CardFields>();
  const used = new Set<CardLine>();

  /* อีเมล — OCR ชอบแทรกช่องว่างรอบ @ และจุด */
  let email = "";
  const emailLine = lines.find((l) => EMAIL.test(l.text));
  if (emailLine) {
    email = emailLine.text.match(EMAIL)![0].replace(/\s/g, "").toLowerCase();
    used.add(emailLine);
    if (low(emailLine)) unsure.add("email");
  }

  /* เบอร์ — ข้ามบรรทัดแฟกซ์ · มือถือก่อนเบอร์สำนักงาน */
  const phones: { d: string; line: CardLine }[] = [];
  for (const l of lines) {
    if (EMAIL.test(l.text) && !/\d{3}/.test(l.text.replace(EMAIL, ""))) continue;
    const hits = [...l.text.matchAll(PHONE)].map((m) => normalizePhone(m[0])).filter((d): d is string => d != null);
    if (!hits.length) continue;
    used.add(l);
    if (FAX.test(l.text) && !/โทร|tel|mobile|มือถือ|\bm\b|\bt\b/i.test(l.text)) continue;
    for (const d of hits) phones.push({ d, line: l });
  }
  const phone = phones.find((p) => isMobile(p.d)) ?? phones[0];
  if (phone && low(phone.line)) unsure.add("phone");

  for (const l of lines) if (WEB.test(l.text)) used.add(l);

  const free = () => lines.filter((l) => !used.has(l));

  /* บริษัท — บรรทัดแรกที่มีคำบอกนิติบุคคล */
  const companyLines = free().filter((l) => COMPANY.test(l.text));
  const companyLine = companyLines[0];
  /* นามบัตรสองภาษามีชื่อบริษัทสองบรรทัด — บรรทัดที่สองต้องไม่ถูกเดาเป็นชื่อคน */
  for (const l of companyLines) used.add(l);
  if (!companyLine || low(companyLine)) unsure.add("company");

  /* ตำแหน่ง — บรรทัดแรกที่มีคำบอกตำแหน่ง และไม่ใช่ที่อยู่ */
  const titleLine = free().find((l) => TITLE.test(l.text) && !ADDRESS.test(l.text));
  if (titleLine) used.add(titleLine);
  if (!titleLine || low(titleLine)) unsure.add("title");

  /* ชื่อ — ข้อความล้วน 2–4 คำ ไม่ใช่ที่อยู่ ไม่มีตัวเลข · ไม่เจอเลย = ว่างให้คนกรอก
     ชื่อเดาเสมอ จึงติดธงทุกครั้ง ยกเว้นมีคำนำหน้าชื่อซึ่งเป็นหลักฐานที่ดี */
  const candidates = free().filter((l) => {
    const t = l.text.replace(PREFIX, "");
    const words = t.split(" ").filter(Boolean);
    return !/\d|@/.test(t) && !ADDRESS.test(t) && t.length >= 4 && t.length <= 40 && words.length <= 4 && (words.length >= 2 || /[฀-๿]/.test(t));
  });
  /* บรรทัดที่มีคำนำหน้าชื่อชนะ — ไม่งั้นบรรทัดแรกที่เข้าเกณฑ์ */
  const nameLine = candidates.find((l) => PREFIX.test(l.text)) ?? candidates[0];
  const name = nameLine ? nameLine.text.replace(PREFIX, "").trim() : "";
  if (!nameLine || low(nameLine) || !PREFIX.test(nameLine.text)) unsure.add("name");

  if (!email && !phone) {
    unsure.add("email");
    unsure.add("phone");
  }

  return {
    card: {
      name,
      title: titleLine?.text ?? "",
      company: companyLine?.text ?? "",
      email,
      phone: phone ? formatPhone(phone.d) : "",
    },
    unsure: [...unsure],
  };
}
