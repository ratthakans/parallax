/* ── ปรับรูปเพื่อจับคู่ตัวตน (Blueprint 2.0 บท 3 · docs/plan.md B3) ───────────

   "เก็บค่าดั้งเดิมควบคู่ค่าที่ปรับรูปแบบ รองรับชื่อไทยและอังกฤษ หมายเลขโทรศัพท์ต่างประเทศ และชื่อย่อบริษัท"
   ไฟล์นี้ทำแค่การปรับรูปและการเทียบ — ตัดสินว่ารวมหรือไม่อยู่ที่ lib/engine/vault/resolve.ts
   ฟังก์ชันบริสุทธิ์ทั้งหมด ไม่แตะฐานข้อมูล */

export type Script = "th" | "en" | "none";

const THAI = /[฀-๿]/;
const LATIN = /[A-Za-z]/;

/* คำนำหน้าชื่อ — ไฟล์จริงมักติดกับชื่อโดยไม่เว้นวรรค ("นายสมชาย") จึงตัดทั้งแบบมีและไม่มีช่องว่าง */
const TH_PREFIX = ["นางสาว", "น.ส.", "นาง", "นาย", "คุณ", "ดร.", "ผศ.ดร.", "รศ.ดร.", "ศ.ดร.", "ผศ.", "รศ.", "ศ.", "พญ.", "นพ.", "ทพ."]
  .sort((a, b) => b.length - a.length);
const EN_PREFIX = /^(mr|mrs|ms|miss|dr|prof|khun)\.?\s+/i;

export type NameInfo = { script: Script; tokens: string[]; display: string };

/** ทับศัพท์ไทย→อังกฤษเขียนได้หลายแบบ — พับให้เป็นรูปเดียวก่อนเทียบ
    (Somchay/Somchai · Thanapol/Thanaphon · Vichai/Wichai · Chiraporn/Jiraporn · Rattana/Ratana · Jaidee/Jaidi) */
export function foldLatin(token: string): string {
  let t = token.toLowerCase().replace(/[^a-z]/g, "");
  t = t.replace(/ph/g, "p").replace(/th/g, "t").replace(/kh/g, "k").replace(/ch/g, "j")
    .replace(/v/g, "w").replace(/g/g, "k").replace(/ee/g, "i").replace(/oo/g, "u").replace(/y/g, "i");
  t = t.replace(/l$/, "n");
  return t.replace(/(.)\1+/g, "$1");
}

export function nameInfo(raw: string | null | undefined): NameInfo {
  let s = (raw ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
  if (!s) return { script: "none", tokens: [], display: "" };
  const script: Script = THAI.test(s) ? "th" : LATIN.test(s) ? "en" : "none";
  if (script === "th") {
    for (const p of TH_PREFIX) {
      if (s.startsWith(p) && s.length - p.length >= 2) {
        s = s.slice(p.length).trim();
        break;
      }
    }
  } else {
    s = s.replace(EN_PREFIX, "");
  }
  const parts = s.split(" ").filter(Boolean);
  const tokens = (script === "en" ? parts.map(foldLatin) : parts.map((x) => x.replace(/[^฀-๿]/g, "")))
    .filter(Boolean)
    .sort();
  return { script, tokens, display: s };
}

/** สองชื่อเป็นคนเดียวกันได้ไหม: same · different · unknown (คนละอักษร หรือไม่มีชื่อ) */
export function compareNames(a: NameInfo, b: NameInfo): "same" | "different" | "unknown" {
  if (!a.tokens.length || !b.tokens.length) return "unknown";
  if (a.script !== b.script) return "unknown";
  if (a.tokens.length === b.tokens.length && a.tokens.every((t, i) => t === b.tokens[i])) return "same";
  /* ชื่อบางส่วน ("Wichai" กับ "Wichai Inkaew") ไม่ใช่หลักฐานว่าต่างคน — แต่ก็ไม่ใช่หลักฐานว่าคนเดียวกัน */
  const [short, long] = a.tokens.length < b.tokens.length ? [a.tokens, b.tokens] : [b.tokens, a.tokens];
  if (short.length < long.length && short.every((t) => long.includes(t))) return "unknown";
  return "different";
}

/** กุญแจของชื่อ — ใช้เป็นตัวแบ่งกลุ่มก่อนเทียบ ไม่ใช่เหตุผลรวม */
export const nameKey = (n: NameInfo) => (n.tokens.length ? `${n.script}:${n.tokens.join(" ")}` : "");

/* ── ชื่อองค์กร ── ตัดรูปแบบนิติบุคคล ไม่ตัดชื่อ — "สยามกริด" กับ "สยามกริด กรุ๊ป" เป็นคนละกุญแจ */
const TH_LEGAL = /(บริษัท|จำกัด|\(มหาชน\)|มหาชน|บจก\.?|บมจ\.?|หจก\.?|ห้างหุ้นส่วนจำกัด|ห้างหุ้นส่วนสามัญ)/g;
const EN_LEGAL = /\b(public\s+company\s+limited|company\s+limited|co\.?\s*,?\s*ltd\.?|limited|ltd\.?|pcl\.?|plc\.?|inc\.?|corp\.?|corporation|co\.)(?=\s|$|,)/gi;

export type OrgInfo = { script: Script; key: string; display: string };

export function orgInfo(raw: string | null | undefined): OrgInfo {
  const s = (raw ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
  if (!s) return { script: "none", key: "", display: "" };
  const script: Script = THAI.test(s) ? "th" : LATIN.test(s) ? "en" : "none";
  const core = script === "th"
    ? s.replace(TH_LEGAL, " ").replace(/[^฀-๿0-9A-Za-z]/g, "")
    : s.replace(EN_LEGAL, " ").toLowerCase().replace(/[^a-z0-9]/g, "");
  return { script, key: core ? `${script}:${core}` : "", display: s };
}

/* ── อีเมล ── อีเมลกลางไม่ใช่ตัวระบุคน · อีเมลฟรีไม่บอกบริษัท */
const GENERIC_LOCAL = /^(info|sales|contact|admin|hello|office|marketing|hr|support|enquiry|inquiry|service|team|booking|account|accounts|noreply|no-reply)$/i;
const FREE_DOMAIN = /^(gmail|googlemail|hotmail|outlook|live|msn|yahoo|ymail|icloud|me|aol|proton|protonmail|mail)\./i;

export type EmailInfo = { email: string; local: string; domain: string; generic: boolean; free: boolean };

export function emailInfo(normalised: string | null | undefined): EmailInfo | null {
  if (!normalised) return null;
  const [local, domain] = normalised.split("@");
  if (!local || !domain) return null;
  return { email: normalised, local, domain, generic: GENERIC_LOCAL.test(local), free: FREE_DOMAIN.test(domain) };
}

/* ── ชื่อไทยกับชื่ออังกฤษทับศัพท์ตรงกันไหม (docs/solo-plan.md S5 ข้อ 1) ─────────

   compareNames ตอบ "unknown" เสมอเมื่อชื่อคนละอักษร — ถูกต้องสำหรับการรวมเอง แต่การเสนอเป็นชุด
   ต้องแยกได้ว่า "สมชาย ใจดี" กับ "Somchai Jaidee" ทับศัพท์ตรงกัน ส่วน "สมชาย ใจดี" กับ "Somsak Jaidee" ไม่ใช่

   วิธี: เทียบโครงพยัญชนะ ไม่ถอดสระ — สระไทยเขียนได้หลายแบบเกินกว่าจะถอดให้ตรง
     ไทย  → พยัญชนะแต่ละตัวมีเสียงได้หลายแบบ (ต้นคำ/สะกด: ส = s หรือ t · ร = r หรือ n "พร = porn/phon")
            ตัวการันต์และตัวที่ตามด้วยการันต์ไม่ออกเสียง · อ ห ย เป็นตัวเงียบหรือสระ
     อังกฤษ → foldLatin แล้วตัดสระ (a e i o u) และ h
   ตรงกันเมื่อมีทางเลือกเสียงชุดหนึ่งที่ให้โครงเดียวกันทุกคำ — ตอบได้แค่ "ตรง" หรือ "ไม่แน่ใจ"
   ไม่เคยตอบ "ต่างคน" (ทับศัพท์ที่สะกดต่างเป็นงานของ AI หรือคนตรวจ ไม่ใช่ของกฎนี้) */

const TH_SOUND: Record<string, string[]> = {
  ก: ["k"], ข: ["k"], ฃ: ["k"], ค: ["k"], ฅ: ["k"], ฆ: ["k"], ง: ["nk"],
  จ: ["j", "t"], ฉ: ["j"], ช: ["j", "t"], ฌ: ["j", "t"], ซ: ["s", "t"], ญ: ["", "n"],
  ฎ: ["d", "t"], ฏ: ["t"], ฐ: ["t"], ฑ: ["t", "d"], ฒ: ["t"], ณ: ["n"], ด: ["d", "t"], ต: ["t"], ถ: ["t"], ท: ["t"], ธ: ["t"], น: ["n"],
  บ: ["b", "p"], ป: ["p"], ผ: ["p"], ฝ: ["f"], พ: ["p"], ฟ: ["f", "p"], ภ: ["p"], ม: ["m"], ย: [""],
  ร: ["r", "n", "rn", ""], ฤ: ["r"], ล: ["l", "n"], ฦ: ["l"], ว: ["w", ""], ศ: ["s", "t"], ษ: ["s", "t"], ส: ["s", "t"],
  ห: [""], ฬ: ["l", "n"], อ: [""], ฮ: [""],
};
const TH_MARK = /[ัิ-ฺ็-๎]/; // สระบน/ล่าง วรรณยุกต์ การันต์
const KARAN = "์";
const collapse = (s: string) => s.replace(/(.)\1+/g, "$1");

/** โครงพยัญชนะที่เป็นไปได้ทั้งหมดของคำไทยหนึ่งคำ (จำกัดจำนวน — ชื่อคนมีพยัญชนะไม่กี่ตัว) */
export function thaiSkeletons(token: string, cap = 4096): Set<string> {
  const ch = [...token.normalize("NFC")];
  const slots: string[][] = [];
  for (let i = 0; i < ch.length; i++) {
    const c = ch[i];
    if (c === "ำ") { slots.push(["m"]); continue; } // ำ = "am"
    const sound = TH_SOUND[c];
    if (!sound) continue;
    const n1 = ch[i + 1], n2 = ch[i + 2];
    /* การันต์: ตัวที่ถูกทับ (และ "ดิ์" "ทร์" ที่เงียบทั้งกลุ่ม) */
    if (n1 === KARAN || (n1 && TH_MARK.test(n1) && n2 === KARAN)) continue;
    if (c === "ท" && n1 === "ร" && n2 === KARAN) continue;
    slots.push(sound);
  }
  let acc = [""];
  for (const s of slots) {
    const next: string[] = [];
    for (const a of acc) for (const x of s) if (next.length < cap) next.push(a + x);
    acc = next;
  }
  return new Set(acc.map(collapse));
}

/** โครงพยัญชนะของคำอังกฤษที่ผ่าน foldLatin แล้ว */
export function latinSkeleton(folded: string): string {
  return collapse(folded.replace(/c/g, "k").replace(/z/g, "s").replace(/q/g, "k").replace(/x/g, "ks").replace(/[aeiouh]/g, ""));
}

/** ชื่อไทยกับชื่ออังกฤษทับศัพท์ตรงกันทุกคำไหม — false = กฎตัดสินไม่ได้ (ไม่ใช่ "ต่างคน") */
export function translitMatch(a: NameInfo, b: NameInfo): boolean {
  const pair = a.script === "th" && b.script === "en" ? [a, b] : b.script === "th" && a.script === "en" ? [b, a] : null;
  if (!pair) return false;
  const [th, en] = pair;
  if (!th.tokens.length || th.tokens.length !== en.tokens.length) return false;
  const thSets = th.tokens.map((t) => thaiSkeletons(t));
  const enSk = en.tokens.map(latinSkeleton);
  /* คำไม่จำเป็นต้องเรียงตรงกัน (ไฟล์หนึ่งสลับชื่อ-สกุล) — จับคู่แบบไม่ซ้ำกัน · ชื่อคนมีไม่กี่คำ ลองทุกแบบได้ */
  const used = new Array<boolean>(enSk.length).fill(false);
  const go = (i: number): boolean => {
    if (i === thSets.length) return true;
    for (let j = 0; j < enSk.length; j++) {
      if (used[j] || !enSk[j] || !thSets[i].has(enSk[j])) continue;
      used[j] = true;
      if (go(i + 1)) return true;
      used[j] = false;
    }
    return false;
  };
  return go(0);
}
