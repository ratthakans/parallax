/* ── แยกช่องจากข้อความนามบัตร (docs/brand-plan.md §5.4) ─────────────────

   ข้อความในชุดนี้คือสิ่งที่ OCR อ่านได้จากนามบัตรสมมุติ — รวมความผิดพลาดที่ OCR
   ทำจริง (ช่องว่างแทรกใน @ · ขีดแปลก ๆ · บรรทัดแฟกซ์) ทุกชื่อและโดเมนเป็นของสมมุติ
   ผ่านเมื่อ: อีเมล/เบอร์ ≥ 95% · ชื่อ/บริษัท ≥ 80% · บรรทัดที่อ่านไม่ชัดติดธงตรวจเสมอ */
import { parseCardLines, normalizePhone, type CardFields } from "@/lib/shared/card-parse";

let fail = 0;
const ok = (c: boolean, m: string) => { if (!c) fail++; console.log(`${c ? "ok  " : "FAIL"} ${m}`); };

type Case = { text: string; want: Partial<CardFields> };
const CASES: Case[] = [
  { text: "บริษัท สุวรรณพาวเวอร์ กรุ๊ป จำกัด\nนายสมชาย ใจดี\nผู้จัดการฝ่ายขาย\nโทร 02-123-4567\nมือถือ 081-234-5678\nsomchai@suwanpower.example", want: { name: "สมชาย ใจดี", company: "บริษัท สุวรรณพาวเวอร์ กรุ๊ป จำกัด", title: "ผู้จัดการฝ่ายขาย", phone: "081-234-5678", email: "somchai@suwanpower.example" } },
  { text: "Ratana Wongsawat\nSenior Engineer\nPhaisan Solar Co., Ltd.\nM: +66 89 555 1234\nratana.w@phaisan.example\nwww.phaisan.example", want: { name: "Ratana Wongsawat", title: "Senior Engineer", company: "Phaisan Solar Co., Ltd.", phone: "089-555-1234", email: "ratana.w@phaisan.example" } },
  { text: "Nattida Charoenphon\nBusiness Development Director\nSunline Energy Group\nT. 02 555 0101  F. 02 555 0102\nnattida @ sunline .example", want: { name: "Nattida Charoenphon", company: "Sunline Energy Group", phone: "02-555-0101", email: "nattida@sunline.example" } },
  { text: "ดร. ประเสริฐ มั่นคง\nกรรมการผู้จัดการ\nบริษัท มั่นคงวิศวกรรม จำกัด (มหาชน)\n99/1 ถนนพระราม 9 แขวงห้วยขวาง เขตห้วยขวาง กรุงเทพฯ 10310\nโทรศัพท์ 0-2111-2222 โทรสาร 0-2111-2223\nprasert@mankong.example", want: { name: "ประเสริฐ มั่นคง", title: "กรรมการผู้จัดการ", company: "บริษัท มั่นคงวิศวกรรม จำกัด (มหาชน)", phone: "02-111-2222", email: "prasert@mankong.example" } },
  { text: "Jaidee Vichai\nProcurement Manager\nThai Logistics Holdings PLC\nMobile 091 234 5678\njaidee.v@thailog.example", want: { name: "Jaidee Vichai", title: "Procurement Manager", company: "Thai Logistics Holdings PLC", phone: "091-234-5678", email: "jaidee.v@thailog.example" } },
  { text: "คุณวิไล สายทอง\nเจ้าหน้าที่จัดซื้อ\nห้างหุ้นส่วนจำกัด ทองการช่าง\n086-777-8888", want: { name: "วิไล สายทอง", title: "เจ้าหน้าที่จัดซื้อ", company: "ห้างหุ้นส่วนจำกัด ทองการช่าง", phone: "086-777-8888", email: "" } },
  { text: "MR. SOMPONG RAKDEE\nCEO & Founder\nGreenLeaf Corporation\n+66 (0) 81 999 0000\nsompong@greenleaf.example", want: { name: "SOMPONG RAKDEE", company: "GreenLeaf Corporation", phone: "081-999-0000", email: "sompong@greenleaf.example" } },
  { text: "Anong Srisuk\nMarketing Lead\nBlueWave Company Limited\nanong@bluewave.example\nTel: 02-987-6543 ext. 12", want: { name: "Anong Srisuk", title: "Marketing Lead", company: "BlueWave Company Limited", phone: "02-987-6543", email: "anong@bluewave.example" } },
  { text: "บริษัท เอเชียแพ็ค จำกัด\nASIA PACK CO.,LTD.\nนางสาวกมลวรรณ ศรีสุข\nผู้ช่วยผู้จัดการฝ่ายการตลาด\nkamonwan@asiapack.example\n089 123 4567", want: { name: "กมลวรรณ ศรีสุข", company: "บริษัท เอเชียแพ็ค จำกัด", phone: "089-123-4567", email: "kamonwan@asiapack.example" } },
  { text: "Peter Tan\nRegional Sales Manager\nOrbit Systems Inc.\npeter.tan@orbit.example\n+66 2 222 3333", want: { name: "Peter Tan", title: "Regional Sales Manager", company: "Orbit Systems Inc.", phone: "02-222-3333", email: "peter.tan@orbit.example" } },
];

let nameHit = 0, companyHit = 0, emailHit = 0, phoneHit = 0;
for (const [i, c] of CASES.entries()) {
  const { card } = parseCardLines(c.text);
  const w = c.want;
  const same = (k: keyof CardFields) => w[k] === undefined || card[k] === w[k];
  if (w.name === undefined || card.name.toLowerCase() === w.name.toLowerCase()) nameHit++; else console.log(`     ${i + 1} ชื่อ: ได้ "${card.name}" ต้องการ "${w.name}"`);
  if (same("company")) companyHit++; else console.log(`     ${i + 1} บริษัท: ได้ "${card.company}" ต้องการ "${w.company}"`);
  if (same("email")) emailHit++; else console.log(`     ${i + 1} อีเมล: ได้ "${card.email}" ต้องการ "${w.email}"`);
  if (same("phone")) phoneHit++; else console.log(`     ${i + 1} เบอร์: ได้ "${card.phone}" ต้องการ "${w.phone}"`);
  if (w.title !== undefined && card.title !== w.title) console.log(`     ${i + 1} ตำแหน่ง: ได้ "${card.title}" ต้องการ "${w.title}" (ไม่นับเกณฑ์)`);
}
const n = CASES.length;
const pct = (x: number) => Math.round((x / n) * 100);
ok(emailHit / n >= 0.95, `อีเมลถูก ${pct(emailHit)}% (เกณฑ์ 95%)`);
ok(phoneHit / n >= 0.95, `เบอร์ถูก ${pct(phoneHit)}% (เกณฑ์ 95%)`);
ok(nameHit / n >= 0.8, `ชื่อถูก ${pct(nameHit)}% (เกณฑ์ 80%)`);
ok(companyHit / n >= 0.8, `บริษัทถูก ${pct(companyHit)}% (เกณฑ์ 80%)`);

// ── แฟกซ์ไม่ถูกเลือกเป็นเบอร์ ──
ok(parseCardLines("Somchai Test\nFax 02-000-1111\nTel 02-000-2222").card.phone === "02-000-2222", "เบอร์แฟกซ์ไม่ถูกเลือก");
// ── มือถือมาก่อนเบอร์สำนักงาน ──
ok(parseCardLines("A B\n02-111-1111\n081-111-1111").card.phone === "081-111-1111", "เลือกมือถือก่อนเบอร์สำนักงาน");
// ── ความมั่นใจต่ำ = ติดธง ──
const lowConf = parseCardLines([{ text: "นายสมศักดิ์ ทดสอบ", confidence: 40 }, { text: "somsak@test.example", confidence: 95 }]);
ok(lowConf.unsure.includes("name") && !lowConf.unsure.includes("email"), "บรรทัดที่อ่านไม่ชัดติดธงตรวจ บรรทัดที่ชัดไม่ติด");
// ── ไม่มีช่องทางติดต่อเลย = ติดธงทั้งคู่ ──
const noContact = parseCardLines("นายเอ บี\nบริษัท ทดสอบ จำกัด");
ok(noContact.unsure.includes("email") && noContact.unsure.includes("phone"), "ไม่พบอีเมลและเบอร์ = ขอให้ตรวจ");
// ── ข้อความว่าง/ขยะไม่ทำให้ล้ม ──
const junk = parseCardLines("|||\n~~\n");
ok(junk.card.name === "" && junk.card.email === "" && junk.unsure.includes("name"), "ข้อความขยะได้ช่องว่างพร้อมธง ไม่ล้ม");
// ── คำนำหน้าชื่อตัดเฉพาะที่เป็นคำนำหน้าจริง ──
ok(parseCardLines("MRS. Jane Doe\njane@x.example").card.name === "Jane Doe", "ตัด MRS. ทั้งคำ ไม่เหลือ S.");
ok(parseCardLines("Drake Smith\ndrake@x.example").card.name === "Drake Smith", "ชื่อที่ขึ้นต้นด้วย Dr ไม่ถูกตัด");
// ── "ำ" ที่ OCR แยกเป็นนิคหิต + า ถูกรวมกลับ ──
ok(parseCardLines("บริษัท ทดสอบ \u0E08\u0E4D\u0E32\u0E01\u0E31\u0E14\nนายเอ บี").card.company === "บริษัท ทดสอบ จำกัด", "สระอำที่ OCR แยกสองตัวถูกรวมกลับ");
// ── normalizePhone ──
ok(normalizePhone("+66 81 234 5678") === "0812345678" && normalizePhone("12345") === null, "แปลงเบอร์ +66 และปฏิเสธเลขที่ไม่ใช่เบอร์");

if (fail) { console.error(`\n${fail} ข้อไม่ผ่าน`); process.exit(1); }
console.log("\n=== card-parse ผ่านทั้งหมด ===");
