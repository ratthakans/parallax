import { taxIdChecksum } from "@/lib/shared/tax-id";
/* ── ข้อมูลสมมุติแบบ B2B พร้อมเฉลย (docs/plan.md B1 · ตัดสินใจ T8) ─────────

   ใช้ทดสอบ Data Vault และวัดความแม่นของการรวมตัวตน (B3) ก่อนมีข้อมูลจริง —
   ข้อมูลจริงของลูกค้าไม่ลงเครื่องพัฒนาและไม่อยู่ในชุดทดสอบ (Blueprint บท 8)

   สองกลุ่มลูกค้า (ไม่มีโค้ดเฉพาะลูกค้ารายใด):
     events    ผู้จัดงานที่ขายสปอนเซอร์ — "Sunline Energy Week (งานสมมุติ)"
     services  บริษัทขายบริการ/โครงการ B2B — "Northgate Advisory (บริษัทสมมุติ)"

   ความยุ่งที่ตั้งใจใส่ (แบบที่เจอในไฟล์จริง): หัวคอลัมน์ไทย/อังกฤษต่างกันทุกไฟล์ ·
   ชื่อสะกดต่าง สลับชื่อ-สกุล คำนำหน้า · ชื่อบริษัทหลายรูปแบบ (บจก. / Co., Ltd. / ชื่อย่อ) ·
   อีเมลกลาง (info@) · อีเมลส่วนตัว · เบอร์หลายรูปแบบ · วันที่ พ.ศ./ค.ศ. · คนย้ายงาน ·
   บริษัทในเครือ (คนละนิติบุคคล) · แถวซ้ำในไฟล์เดียว · ช่องว่าง · ไฟล์หนึ่งเป็น Windows-874

   ปลอดภัย: อีเมลทุกตัวใช้โดเมน .example (RFC 2606 สงวนไว้ ไม่มีใครเป็นเจ้าของ)
   ชื่อบริษัทประกอบจากพยางค์ ไม่ใช่ชื่อบริษัทจริง · เลขผู้เสียภาษีผ่าน checksum แต่สุ่มขึ้น

   เฉลย (truth): ทุกแถวที่ออกไปบอกได้ว่าเป็นคนไหน (personKey) และองค์กรไหน (orgKey) จริง ๆ
   ฟังก์ชันบริสุทธิ์ — seed เดียวกันได้ผลเดียวกันทุกไบต์ */

export type Segment = "events" | "services";

export type TruthOrg = {
  key: string; nameTh: string; nameEn: string; short: string; domain: string;
  taxId: string; branch: string; parentKey: string | null; industry: string;
};
export type TruthPerson = { key: string; first: string; last: string; firstEn: string; lastEn: string; title: string };
export type TruthRow = { file: string; line: number; personKey: string | null; orgKey: string | null; duplicateOf?: number };
export type SyntheticFile = { name: string; encoding: "utf-8" | "windows-874"; headers: string[]; rows: string[][] };
export type SyntheticSet = {
  segment: Segment; seed: number; label: string;
  orgs: TruthOrg[]; people: TruthPerson[];
  /** ช่วงสังกัดจริง: คนย้ายงานมีสองช่วง */
  affiliations: { personKey: string; orgKey: string; from: string; to: string | null }[];
  files: SyntheticFile[]; truth: TruthRow[];
};

/* ── ตัวสุ่มแบบกำหนดได้ (mulberry32) ── */
function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (n: number) => Math.floor(next() * n),
    pick: <T,>(xs: readonly T[]) => xs[Math.floor(next() * xs.length)],
    chance: (p: number) => next() < p,
  };
}
type R = ReturnType<typeof rng>;

/* ── คลังคำ ── */
const FIRST = [
  ["สมชาย", "Somchai"], ["สมศักดิ์", "Somsak"], ["วิชัย", "Wichai"], ["ประเสริฐ", "Prasert"], ["อนุชา", "Anucha"],
  ["ธนพล", "Thanaphon"], ["กิตติ", "Kitti"], ["ณัฐพล", "Nattaphon"], ["สุรชัย", "Surachai"], ["ปิยะ", "Piya"],
  ["สุภาพร", "Supaporn"], ["วรรณา", "Wanna"], ["กาญจนา", "Kanchana"], ["ศิริพร", "Siriporn"], ["อรุณี", "Arunee"],
  ["พิมพ์ชนก", "Pimchanok"], ["ณัฐธิดา", "Natthida"], ["จิราพร", "Jiraporn"], ["มาลี", "Malee"], ["รัตนา", "Rattana"],
] as const;
/* ทับศัพท์หลายแบบที่เจอจริง — ใช้ทำให้ชื่ออังกฤษของคนเดียวกันไม่ตรงกันข้ามไฟล์ */
const EN_VARIANT: Record<string, string[]> = {
  Somchai: ["Somchay", "Somchai"], Wichai: ["Wichai", "Vichai"], Thanaphon: ["Thanapol", "Tanaphon"],
  Nattaphon: ["Nattapol", "Natthaphon"], Surachai: ["Surachay", "Surachai"], Supaporn: ["Suphaphon", "Supaporn"],
  Kanchana: ["Kanjana", "Kanchana"], Siriporn: ["Siriphon", "Siriporn"], Natthida: ["Nattida", "Natthida"],
  Jiraporn: ["Chiraporn", "Jiraporn"], Rattana: ["Ratana", "Rattana"], Kitti: ["Kitti", "Gitti"],
};
const LAST = [
  ["ใจดี", "Jaidee"], ["ศรีสุข", "Srisuk"], ["วงศ์สวัสดิ์", "Wongsawat"], ["ทองดี", "Thongdee"], ["บุญมา", "Boonma"],
  ["แสงทอง", "Saengthong"], ["รุ่งเรือง", "Rungrueang"], ["ชัยมงคล", "Chaimongkol"], ["พรหมมา", "Phromma"], ["สุขสวัสดิ์", "Suksawat"],
  ["เจริญผล", "Charoenphon"], ["ศักดิ์ดี", "Sakdee"], ["มั่นคง", "Mankhong"], ["นาคสวัสดิ์", "Naksawat"], ["อินทร์แก้ว", "Inkaew"],
] as const;
const ORG_A = [["สยาม", "Siam"], ["อันดามัน", "Andaman"], ["ลานนา", "Lanna"], ["สุวรรณ", "Suwan"], ["นครา", "Nakhara"], ["ชลธี", "Chonlathee"], ["ภูผา", "Phupha"], ["ไพศาล", "Phaisan"]] as const;
const ORG_B = [["กริด", "Grid"], ["โซลาร์", "Solar"], ["พาวเวอร์", "Power"], ["เทค", "Tech"], ["ลอจิสติกส์", "Logistics"], ["คอนซัลท์", "Consult"], ["เอ็นจิเนียริ่ง", "Engineering"], ["ดาต้า", "Data"]] as const;
const ORG_C = [["โซลูชั่นส์", "Solutions"], ["เวิร์คส", "Works"], ["กรุ๊ป", "Group"], ["ซิสเต็มส์", "Systems"], ["พาร์ทเนอร์ส", "Partners"]] as const;
const INDUSTRY: Record<Segment, string[]> = {
  events: ["โซลาร์และพลังงานหมุนเวียน", "แบตเตอรี่และกักเก็บพลังงาน", "การไฟฟ้าและสาธารณูปโภค", "ที่ปรึกษาพลังงาน", "การเงินสีเขียว", "ผู้ใช้พลังงานรายใหญ่"],
  services: ["การผลิต", "ค้าปลีกสมัยใหม่", "โลจิสติกส์", "การเงิน", "อสังหาริมทรัพย์", "หน่วยงานรัฐ"],
};
const TITLES = [
  ["ผู้จัดการฝ่ายขาย", "Sales Manager"], ["ผจก.ฝ่ายการตลาด", "Marketing Manager"], ["กรรมการผู้จัดการ", "Managing Director"],
  ["ผู้อำนวยการฝ่ายพัฒนาธุรกิจ", "Business Development Director"], ["วิศวกร", "Engineer"], ["เจ้าหน้าที่จัดซื้อ", "Procurement Officer"],
  ["ประธานเจ้าหน้าที่บริหาร", "CEO"], ["ผู้ช่วยผู้จัดการ", "Assistant Manager"], ["หัวหน้าฝ่ายบัญชี", "Head of Accounting"],
] as const;
const PREFIX_TH = ["คุณ", "นาย", "นางสาว", "นาง", "ดร.", ""];
const PREFIX_EN = ["Mr.", "Ms.", "Mrs.", "Dr.", "", ""];

/* ── เลขผู้เสียภาษีนิติบุคคล 13 หลัก (ขึ้นต้น 0) ที่ checksum ถูก ── */
export { taxIdChecksum };
function makeTaxId(r: R): string {
  let s = "0105";
  while (s.length < 12) s += String(r.int(10));
  return s + String(taxIdChecksum(s));
}

/* ── รูปแบบที่ต่างกันของค่าเดียวกัน ── */
function phoneVariants(r: R): (fmt: number) => string {
  const d = `08${r.pick(["1", "6", "9"])}${String(r.int(10_000_000)).padStart(7, "0")}`;
  return (fmt) =>
    [d, `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`, `+66 ${d.slice(1, 3)} ${d.slice(3, 6)} ${d.slice(6)}`, `(${d.slice(0, 3)}) ${d.slice(3)}`][fmt % 4];
}
function orgName(o: TruthOrg, style: number): string {
  return [
    `บริษัท ${o.nameTh} จำกัด`, `บจก. ${o.nameTh}`, `${o.nameEn} Co., Ltd.`, o.short,
    `${o.nameEn.toUpperCase()} CO.,LTD`, ` ${o.nameTh} `,
  ][style % 6];
}
function thaiDate(r: R, buddhist: boolean, yearFrom: number, yearTo: number): string {
  const y = yearFrom + r.int(yearTo - yearFrom + 1);
  const m = 1 + r.int(12), d = 1 + r.int(28);
  return buddhist ? `${d}/${m}/${y + 543}` : `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/* ── ตัวสร้าง ── */
export function generateSynthetic(opts: { segment: Segment; seed?: number; sourceRows?: number }): SyntheticSet {
  const segment = opts.segment;
  const seed = opts.seed ?? 20261013;
  const target = opts.sourceRows ?? 10_000;
  const r = rng(seed + (segment === "events" ? 0 : 7919));

  // องค์กร — ราว 1 องค์กรต่อ 18 แถว · 10% เป็นบริษัทในเครือของบริษัทอื่น (คนละนิติบุคคล)
  const orgCount = Math.max(8, Math.round(target / 18));
  const orgs: TruthOrg[] = [];
  const seenNames = new Set<string>();
  for (let i = 0; orgs.length < orgCount && i < orgCount * 20; i++) {
    const a = r.pick(ORG_A), b = r.pick(ORG_B), c = r.pick(ORG_C);
    const n = r.int(4);
    const nameTh = `${a[0]}${b[0]}${n ? "" : " " + c[0]}${orgs.length >= ORG_A.length * ORG_B.length ? ` ${orgs.length}` : ""}`;
    if (seenNames.has(nameTh)) continue;
    seenNames.add(nameTh);
    const nameEn = `${a[1]} ${b[1]}${n ? "" : " " + c[1]}${orgs.length >= ORG_A.length * ORG_B.length ? ` ${orgs.length}` : ""}`;
    const slug = nameEn.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const parent = orgs.length > 5 && r.chance(0.1) ? r.pick(orgs.filter((o) => !o.parentKey)) : null;
    orgs.push({
      key: `o${orgs.length + 1}`, nameTh, nameEn, short: `${a[1]}${b[1]}`.toUpperCase().slice(0, 8),
      domain: `${slug}.example`, taxId: makeTaxId(r), branch: r.chance(0.15) ? "00001" : "00000",
      parentKey: parent?.key ?? null, industry: r.pick(INDUSTRY[segment]),
    });
  }

  // คน — ราว 1 คนต่อ 2.4 แถว (แต่ละคนโผล่หลายไฟล์/หลายปี) · 8% ย้ายงานหนึ่งครั้ง
  const peopleCount = Math.max(20, Math.round(target / 2.4));
  const people: TruthPerson[] = [];
  const affiliations: SyntheticSet["affiliations"] = [];
  for (let i = 0; i < peopleCount; i++) {
    const f = r.pick(FIRST), l = r.pick(LAST), t = r.pick(TITLES);
    const p: TruthPerson = { key: `p${i + 1}`, first: f[0], last: l[0], firstEn: f[1], lastEn: l[1], title: r.chance(0.5) ? t[0] : t[1] };
    people.push(p);
    const home = r.pick(orgs);
    if (r.chance(0.08)) {
      const next = r.pick(orgs.filter((o) => o.key !== home.key));
      const moved = `${2019 + r.int(5)}-0${1 + r.int(9)}-01`;
      affiliations.push({ personKey: p.key, orgKey: home.key, from: "2016-01-01", to: moved });
      affiliations.push({ personKey: p.key, orgKey: next.key, from: moved, to: null });
    } else {
      affiliations.push({ personKey: p.key, orgKey: home.key, from: "2016-01-01", to: null });
    }
  }
  const affByPerson = new Map<string, SyntheticSet["affiliations"]>();
  for (const a of affiliations) affByPerson.set(a.personKey, [...(affByPerson.get(a.personKey) ?? []), a]);
  const affOf = (pk: string, year: number) => {
    const list = affByPerson.get(pk)!;
    return list.find((a) => Number(a.from.slice(0, 4)) <= year && (!a.to || Number(a.to.slice(0, 4)) > year)) ?? list[list.length - 1];
  };
  const orgByKey = new Map(orgs.map((o) => [o.key, o]));
  const phoneOf = new Map(people.map((p) => [p.key, phoneVariants(r)]));

  const files: SyntheticFile[] = [];
  const truth: TruthRow[] = [];
  const share = [0.5, 0.3, 0.2];
  const plan = segment === "events"
    ? [
        { name: "registrations_2016-2025.csv", encoding: "utf-8" as const,
          headers: ["ลำดับ", "ชื่อ-นามสกุล", "บริษัท / หน่วยงาน", "ตำแหน่ง", "อีเมล", "เบอร์โทรศัพท์", "ประเภทผู้ร่วมงาน", "งาน", "วันที่ลงทะเบียน"] },
        { name: "sponsor_exhibitor_contacts.csv", encoding: "windows-874" as const,
          headers: ["Company", "Contact First Name", "Contact Last Name", "Position", "Email", "Mobile", "Package", "Year", "Owner (BD)"] },
        { name: "namecards_export.csv", encoding: "utf-8" as const,
          headers: ["Name", "Title", "Company", "E-mail", "Tel", "Scanned at", "Note"] },
      ]
    : [
        { name: "crm_export_old.csv", encoding: "utf-8" as const,
          headers: ["Account Name", "Contact Name", "Job Title", "Email Address", "Phone", "Last Activity", "Stage", "Account Owner"] },
        { name: "ลูกค้าเก่า_ทีมขาย.csv", encoding: "windows-874" as const,
          headers: ["บริษัท", "ชื่อ", "นามสกุล", "ตำแหน่ง", "อีเมล", "มือถือ", "วันที่ติดต่อล่าสุด", "หมายเหตุ"] },
        { name: "namecards_export.csv", encoding: "utf-8" as const,
          headers: ["Name", "Title", "Company", "E-mail", "Tel", "Scanned at", "Note"] },
      ];

  plan.forEach((spec, fi) => {
    const rows: string[][] = [];
    const fileTruth: TruthRow[] = [];
    const n = Math.round(target * share[fi]);
    for (let line = 1; rows.length < n; line++) {
      // 3% เป็นแถวซ้ำของแถวก่อนหน้าในไฟล์เดียวกัน (ช่องว่างหรือตัวพิมพ์ต่าง)
      if (rows.length > 5 && r.chance(0.03)) {
        const src = r.int(rows.length);
        rows.push(rows[src].map((v) => (r.chance(0.3) ? ` ${v} ` : v)));
        fileTruth.push({ ...fileTruth[src], line: rows.length, duplicateOf: src + 1 });
        continue;
      }
      const p = r.pick(people);
      const year = 2016 + r.int(10);
      const aff = affOf(p.key, year);
      const o = orgByKey.get(aff.orgKey)!;
      const en = r.chance(0.35);
      const fEn = EN_VARIANT[p.firstEn] ? r.pick(EN_VARIANT[p.firstEn]) : p.firstEn;
      const fullTh = `${r.pick(PREFIX_TH)}${p.first} ${p.last}`.trim();
      const fullEn = r.chance(0.15) ? `${p.lastEn} ${fEn}` : `${r.pick(PREFIX_EN)} ${fEn} ${p.lastEn}`.trim();
      const name = en ? fullEn : fullTh;
      const generic = r.chance(0.06);
      const personal = !generic && r.chance(0.1);
      const email = generic
        ? `info@${o.domain}`
        : personal
          ? `${p.firstEn.toLowerCase()}${p.lastEn.toLowerCase().slice(0, 3)}${r.int(90) + 10}@mail.example`
          : `${p.firstEn.toLowerCase()}.${p.lastEn.toLowerCase().slice(0, 1)}@${o.domain}`;
      const phone = r.chance(0.12) ? "" : phoneOf.get(p.key)!(r.int(4));
      const company = orgName(o, r.int(6));
      const title = r.chance(0.1) ? "" : p.title;
      const date = thaiDate(r, r.chance(0.5), year, year);
      const orgOnly = generic && r.chance(0.4); // แถวที่มีแต่อีเมลกลางของบริษัท ไม่มีชื่อคน

      let row: string[];
      if (spec.headers[0] === "ลำดับ") {
        row = [String(line), orgOnly ? "" : name, company, title, email, phone, r.pick(["ผู้เข้าชม", "ผู้ออกบูธ", "วิทยากร", "VIP"]), r.pick(["Sunline Energy Week", "Sunline Solar+Storage", "Sunline Summit"]) + ` ${year}`, date];
      } else if (spec.headers[0] === "Company") {
        row = [company, orgOnly ? "" : (en ? fEn : p.first), orgOnly ? "" : (en ? p.lastEn : p.last), title, email, phone, r.pick(["Platinum", "Gold", "Booth 9 sqm", "Booth 18 sqm", ""]), String(year), r.pick(["BD-A", "BD-B", "BD-C"])];
      } else if (spec.headers[0] === "Name") {
        row = [orgOnly ? "" : name, title, company, email, phone, date, r.chance(0.2) ? "เจอที่บูธ" : ""];
      } else if (spec.headers[0] === "Account Name") {
        row = [company, orgOnly ? "" : name, title, email, phone, date, r.pick(["Prospect", "Proposal", "Won", "Lost", ""]), r.pick(["ฝ่ายขาย 1", "ฝ่ายขาย 2"])];
      } else {
        row = [company, orgOnly ? "" : p.first, orgOnly ? "" : p.last, title, email, phone, date, r.chance(0.2) ? "เคยเสนอราคา" : ""];
      }
      rows.push(row);
      fileTruth.push({ file: spec.name, line: rows.length, personKey: orgOnly ? null : p.key, orgKey: o.key });
    }
    truth.push(...fileTruth);
    files.push({ name: spec.name, encoding: spec.encoding, headers: spec.headers, rows });
  });

  return {
    segment, seed,
    label: segment === "events" ? "Sunline Energy Week (งานสมมุติ)" : "Northgate Advisory (บริษัทสมมุติ)",
    orgs, people, affiliations, files, truth,
  };
}

/* ── ไฟล์ CSV ── */
function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
export function toCsv(f: SyntheticFile): string {
  return [f.headers, ...f.rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/* Windows-874 (TIS-620 + ส่วนขยายของ Windows) — อักษรไทย U+0E01–U+0E5B คือไบต์ 0xA1–0xFB
   ไม่มีตัวเข้ารหัสในตัวของ Node จึงแปลงเอง · อักขระนอกช่วงนี้และนอก ASCII จะกลายเป็น "?" */
export function encodeWindows874(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  let n = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) out[n++] = cp;
    else if (cp >= 0x0e01 && cp <= 0x0e5b) out[n++] = cp - 0x0e00 + 0xa0;
    else out[n++] = 0x3f;
  }
  return out.subarray(0, n);
}

export function fileBytes(f: SyntheticFile): Uint8Array {
  const csv = toCsv(f);
  return f.encoding === "windows-874" ? encodeWindows874(csv) : new TextEncoder().encode("﻿" + csv);
}
