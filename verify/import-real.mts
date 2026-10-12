/* ── ไฟล์จริงที่ร้านส่งมา ต้องวิเคราะห์ออกมาถูก ─────────────────

   ทุกกรณีในไฟล์นี้มาจากรูปแบบไฟล์ที่ร้านไทยมีจริง และเคยพังจริงก่อนแก้:
   1. POS หนึ่งแถวต่อสินค้า — สามชิ้นในบิลเดียวเคยนับเป็นสามครั้งที่ซื้อ
      รอบการซื้อของทุกคนจึงออกมา 7 วัน และยอดต่อครั้งเหลือราคาชิ้นเดียว
   2. มาร์เก็ตเพลส — เบอร์ถูกปิด (******1234) ทั้งไฟล์ถูกปฏิเสธ และออเดอร์ที่ยกเลิก
      เคยถูกนับเป็นยอดขาย
   3. Excel ที่แปลงข้อมูลแล้ว — 8/16/2025 เคยกลายเป็น 8 เม.ย. 2026 และ 8.12E+08
      เคยกลายเป็นเบอร์ญี่ปุ่น
   4. ไฟล์รายชื่อ — "ชื่อ" กับ "นามสกุล" แยกคอลัมน์ เคยเก็บแค่ชื่อต้น
   5. ความยินยอม — ไฟล์ไม่มีข้อมูลนี้ บรีฟจึงว่าง โดยไม่บอกว่าเพราะอะไร */
import "./isolate.mts";
import { ensureReady } from "@/lib/engine/bootstrap";
import { all, get, tx } from "@/lib/engine/sql";
import { buildPreview, commitImport, normaliseDate, parseCsv } from "@/lib/engine/ingest";
import { mapColumnsHeuristic } from "@/lib/engine/ai";
import { normaliseContact } from "@/lib/engine/pii";
import { wipeCustomerData } from "@/lib/engine/tenant-data";
import { loadFeatures } from "@/lib/engine/derive";
import { runMatch } from "@/lib/engine/match";
import { findCustomersByContact } from "@/lib/engine/contacts";
import { setConsent, getCustomer } from "@/lib/engine/customers";

const out: string[] = [];
const ok = (c: boolean, m: string) => out.push(`${c ? "PASS" : "FAIL"}  ${m}`);

await ensureReady();
const T = "mst-golf";
const fresh = () => tx((q) => wipeCustomerData(q, T));
const load = async (csv: string, opts = {}) => {
  const p = parseCsv(csv);
  const m = mapColumnsHeuristic(p.headers);
  return { preview: buildPreview(p, m), result: await commitImport(T, p, m, opts), mapping: m };
};
const field = (m: { mappings: { column: string; field: string }[] }, col: string) =>
  m.mappings.find((x) => x.column === col)?.field;
const stats = (phone: string) =>
  findCustomersByContact(T, "phone", phone).then(async ([id]) =>
    id ? (await get<{ n: number; s: number }>("SELECT COUNT(*) AS n, SUM(total) AS s FROM transactions WHERE customer_id = ?", id))! : { n: 0, s: 0 });

// ── 1 · POS ไทย หนึ่งแถวต่อสินค้า มีเลขที่บิล ──
const POS = "﻿วันที่,เลขที่บิล,ชื่อลูกค้า,เบอร์โทร,รายการสินค้า,จำนวน,ราคาต่อหน่วย,ส่วนลด,ยอดสุทธิ\r\n" + [
  `05/01/2569,INV001,สมชาย ใจดี,081-234-5671,ลูกกอล์ฟ,2,"1,850.00",0,"3,700.00"`,
  `05/01/2569,INV001,สมชาย ใจดี,081-234-5671,ถุงมือ,1,690.00,100,590.00`,
  `05/01/2569,INV001,สมชาย ใจดี,081-234-5671,ทีกอล์ฟ,1,150.00,0,150.00`,
  `04/02/2569,INV014,สมชาย ใจดี,081-234-5671,ลูกกอล์ฟ,1,"1,850.00",0,"1,850.00"`,
  `06/03/2569,INV031,สมชาย ใจดี,081-234-5671,กริปไม้,2,450.00,0,900.00`,
  `06/03/2569,INV031,สมชาย ใจดี,081-234-5671,ถุงมือ,1,690.00,0,690.00`,
  `10/01/2569,INV005,สุดา แก้วงาม,0892345672,ไม้ไดรเวอร์,1,"18,900.00",900,"18,000.00"`,
].join("\r\n") + "\r\n";
await fresh();
const pos = await load(POS);
ok(field(pos.mapping, "เลขที่บิล") === "order_id", "คอลัมน์ เลขที่บิล ถูกจับเป็นเลขบิล");
ok(pos.preview.transactions === 4 && pos.result.transactions === 4, `7 แถว 4 บิล → นับ 4 การซื้อ ทั้งพรีวิวและที่นำเข้า (${pos.preview.transactions}/${pos.result.transactions})`);
const somchai = await stats("0812345671");
ok(Number(somchai.n) === 3 && Number(somchai.s) === 7880, `สมชาย 3 บิล ยอด ฿7,880 (${somchai.n} · ${somchai.s})`);
const f1 = (await loadFeatures(T)).find((f) => f.name === "สมชาย ใจดี")!;
ok(f1.frequency_total === 3 && f1.personal_cycle_days >= 29 && f1.personal_cycle_days <= 31 && Math.round(f1.avg_order_value) === 2627,
  `รอบซื้อ ~30 วัน ยอดเฉลี่ยต่อบิล ฿2,627 (รอบ ${f1.personal_cycle_days} · เฉลี่ย ${Math.round(f1.avg_order_value)})`);
ok(pos.preview.contactPoints === 2 && pos.result.contactPoints === 2, `เบอร์เดียวกันหลายแถวนับเป็นช่องทางเดียว (${pos.preview.contactPoints}/${pos.result.contactPoints})`);
const [sid] = await findCustomersByContact(T, "phone", "0812345671");
ok((await getCustomer(T, sid))?.createdAt.slice(0, 10) === "2026-01-05", "วันที่เริ่มเป็นลูกค้า = การซื้อที่เก่าที่สุด ไม่ใช่แถวแรกของไฟล์");
const lines = Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM line_items WHERE tenant_id = ?", T))!.n);
ok(lines === 7, `สินค้าทุกแถวยังอยู่ครบ ${lines} รายการ`);
const again = await load(POS);
ok(again.result.transactions === 0 && Number((await stats("0812345671")).n) === 3, "นำเข้าไฟล์เดิมซ้ำ ไม่เพิ่มการซื้อ");
const reversed = POS.split("\r\n").filter(Boolean);
await load([reversed[0], ...reversed.slice(1).reverse()].join("\r\n"));
ok(Number((await stats("0812345671")).s) === 7880, "ไฟล์เดิมสลับลำดับแถว ยอดไม่เพิ่ม");
ok((await getCustomer(T, sid))?.createdAt.slice(0, 10) === "2026-01-05", "ไฟล์ที่เรียงจากใหม่ไปเก่า ไม่เลื่อนวันที่เริ่มเป็นลูกค้า");

// ── 2 · ไม่มีเลขบิล: คนเดียวกันวันเดียวกัน = มาครั้งเดียว ──
await fresh();
await load("date,phone,product,total\n2026-01-05,0811112222,A,100\n2026-01-05,0811112222,B,200\n2026-01-20,0811112222,C,300\n");
const noBill = await stats("0811112222");
ok(Number(noBill.n) === 2 && Number(noBill.s) === 600, `ไม่มีเลขบิล: สองแถววันเดียวกันรวมเป็นครั้งเดียว (${noBill.n} ครั้ง ฿${noBill.s})`);

// ── 3 · มาร์เก็ตเพลส: เบอร์ถูกปิด · ออเดอร์ยกเลิก ──
await fresh();
const MKT = "Order ID,Order Status,Order Creation Date,Username (Buyer),Receiver Name,Phone Number,Product Name,Quantity,Deal Price,Order Total Amount\n" + [
  "250801A,Completed,2025-08-01 10:20,buyer_a,คุณเอ,******1001,ลูกกอล์ฟ,1,1850,1850",
  "250801A,Completed,2025-08-01 10:20,buyer_a,คุณเอ,******1001,ทีกอล์ฟ,1,150,150",
  "250815B,Cancelled,2025-08-15 09:00,buyer_a,คุณเอ,******1001,ไม้ไดรเวอร์,1,18900,18900",
  "250820C,ยกเลิกแล้ว,2025-08-20 09:00,buyer_b,คุณบี,******1002,ถุงมือ,1,690,690",
  "250901D,Completed,2025-09-01 12:00,buyer_b,คุณบี,******1002,ถุงมือ,1,690,690",
].join("\n") + "\n";
const mkt = await load(MKT);
ok(field(mkt.mapping, "Username (Buyer)") === "customer_ref" && field(mkt.mapping, "Order Status") === "order_status",
  "ชื่อผู้ใช้เป็นตัวระบุ สถานะออเดอร์ถูกอ่าน");
ok(mkt.result.customers === 2 && mkt.result.transactions === 2 && mkt.preview.cancelledRows === 2,
  `2 คน 2 การซื้อ ข้าม 2 ออเดอร์ที่ยกเลิก (${mkt.result.customers} · ${mkt.result.transactions} · ข้าม ${mkt.preview.cancelledRows})`);
const rev = Number((await get<{ s: number }>("SELECT SUM(total) AS s FROM transactions WHERE tenant_id = ?", T))!.s);
ok(rev === 2690, `ยอดขายไม่รวมออเดอร์ที่ยกเลิก ฿${rev}`);
const masked = Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM contact_points WHERE tenant_id = ? AND kind = 'phone'", T))!.n);
ok(masked === 0, "เบอร์ที่ถูกปิด (******1001) ไม่ถูกเก็บเป็นเบอร์");

// ── 4 · Excel ที่แปลงข้อมูลแล้ว ──
ok(normaliseDate("8/16/2025", "mdy")?.slice(0, 10) === "2025-08-16" && normaliseDate("8/16/2025")?.slice(0, 10) === "2025-08-16",
  "16 เกิน 12 จึงเป็นวัน — 8/16/2025 = 16 ส.ค. ไม่ว่าคอลัมน์จะเขียนแบบไหน");
ok(normaliseDate("31/02/2569") === null && normaliseDate("2025-13-01") === null, "วันที่ไม่มีจริงถูกปฏิเสธ ไม่ล้นไปเดือนถัดไป");
ok(normaliseDate("05/01/2569")?.slice(0, 10) === "2026-01-05", "วันที่ พ.ศ. แบบ วัน/เดือน");
ok(normaliseDate("03/04/2025", "mdy")?.slice(0, 10) === "2025-03-04", "คอลัมน์ที่เขียนแบบ เดือน/วัน อ่านแถวที่กำกวมตามคอลัมน์");
ok(normaliseContact("phone", "8.12346E+08") === null && normaliseContact("phone", "******1234") === null,
  "เลขวิทยาศาสตร์และเบอร์ที่ถูกปิด ไม่ใช่เบอร์");
ok(normaliseContact("phone", "812345678") === "+66812345678" && normaliseContact("phone", "21234567") === "+6621234567",
  "เบอร์ที่ Excel ตัดศูนย์หน้าทิ้ง ยังอ่านเป็นเบอร์ไทยได้");
ok(normaliseContact("phone", "81234608") === null && normaliseContact("phone", "+81 3 1234 5678") === "+81312345678",
  "เลขไม่มี + ที่ไม่ใช่รูปแบบไทยไม่ถูกเดาเป็นประเทศอื่น · เบอร์ต่างประเทศที่มี + ยังรับได้");
await fresh();
const xl = await load('Date,Customer,Phone,Amount\n8/15/2025,Tom Lee,812345678,"฿1,200"\n8/16/2025,Ann Kim,8.12346E+08,950\n9/2/2025,Tom Lee,0812345678,300\n');
ok(field(xl.mapping, "Customer") === "customer_name", "หัวคอลัมน์ Customer คือชื่อลูกค้า");
ok(xl.preview.dateOrder === "mdy" && xl.preview.dateRange?.to === "2025-09-02", `ทั้งคอลัมน์เป็น เดือน/วัน — 9/2/2025 = 2 ก.ย. (${xl.preview.dateRange?.to})`);
ok(xl.preview.rejected.some((r) => r.reason.includes("เลขวิทยาศาสตร์")), "แถวที่เบอร์เสียบอกเหตุผลว่าเพราะ Excel");
const tom = await stats("0812345678");
ok(Number(tom.n) === 2 && Number(tom.s) === 1500, "812345678 กับ 0812345678 คือคนเดียวกัน");

// ── 5 · รายชื่อ: ชื่อ + นามสกุล ──
await fresh();
await load("ชื่อ,นามสกุล,เบอร์มือถือ,วันเกิด\nสมหญิง,รักดี,0801112233,12/03/2530\n");
const [sy] = await findCustomersByContact(T, "phone", "0801112233");
const syRec = await getCustomer(T, sy);
ok(syRec?.name === "สมหญิง รักดี", `ชื่อกับนามสกุลแยกคอลัมน์ ได้ชื่อเต็ม (${syRec?.name})`);
ok(syRec?.profile?.birthday === "1987-03-12", `วันเกิด พ.ศ. 2530 = 1987 (${syRec?.profile?.birthday})`);

// ── 6 · ความยินยอม ──
await fresh();
const withConsent = await load(
  "phone,name,ยินยอมรับข่าวสาร\n0831110001,ก,ใช่\n0831110002,ข,ไม่\n0831110003,ค,\n0831110004,ง,Y\n");
ok(withConsent.preview.consent.yes === 2 && withConsent.preview.consent.no === 1 && withConsent.result.consented === 2,
  `คอลัมน์ยินยอม: ใช่ 2 · ไม่ 1 · ว่าง 1 (บันทึก ${withConsent.result.consented})`);
const granted = async (phone: string) => {
  const [id] = await findCustomersByContact(T, "phone", phone);
  return (await getCustomer(T, id))!.consent.granted;
};
ok((await granted("0831110001")) && !(await granted("0831110002")) && !(await granted("0831110003")), "ใช่ = ยินยอม · ไม่ และ ว่าง = ยังไม่ยินยอม");
const [c1] = await findCustomersByContact(T, "phone", "0831110001");
await setConsent(T, c1, false, "test");
await load("phone,name,ยินยอมรับข่าวสาร\n0831110001,ก,ใช่\n");
ok(!(await granted("0831110001")), "คนที่ถอนในระบบแล้ว ไฟล์ที่บอกว่า ใช่ ไม่ทำให้กลับมายินยอม");
await load("phone,name,consent\n0831110004,ง,no\n");
ok(!(await granted("0831110004")), "ไฟล์ที่บอกว่า no ถอนคนที่เคยยินยอม");

await fresh();
const before = await runMatch(T);
ok(before.candidates.every((c) => c.blocked || c.audience.length === 0), "ก่อนนำเข้า ไม่มีอะไรให้ส่ง");
const rows = Array.from({ length: 400 }, (_, i) => {
  const p = `09${String(10000000 + i).slice(-8)}`;
  return [0, 1, 2, 3].map((k) => `2026-0${1 + k * 2}-1${i % 9},${p},คน${i},${1500 + (i % 7) * 900}`).join("\n");
}).join("\n");
await load(`date,phone,name,total\n${rows}\n`);
const blocked = await runMatch(T);
const waiting = blocked.candidates.reduce((s, c) => s + (c.filtered.find((f) => f.reason === "No marketing consent")?.count ?? 0), 0);
ok(waiting > 0 && blocked.candidates.filter((c) => !c.blocked).length === 0,
  `ไม่มีความยินยอม: มีคนเข้าเกณฑ์ ${waiting} คน แต่ยังไม่มีอะไรให้ส่ง — บรีฟต้องบอกเหตุผลนี้`);
const attested = await load(`date,phone,name,total\n${rows}\n`, { consentAll: true });
const open = await runMatch(T);
ok(attested.result.consented === 400 && open.candidates.some((c) => !c.blocked && c.audience.length > 0),
  `ติ๊กยืนยันความยินยอมตอนนำเข้า → บรีฟมีงานให้ทำ (${open.candidates.filter((c) => !c.blocked).map((c) => `${c.play.id}:${c.audience.length}`).join(", ")})`);
const log = await all<{ action: string }>("SELECT action FROM activity_log WHERE tenant_id = ? AND action LIKE 'import_consent%'", T);
ok(log.some((l) => l.action === "import_consent_attested"), "การยืนยันความยินยอมตอนนำเข้าถูกบันทึกว่าใครเป็นคนยืนยัน");

// ── 7 · play ที่ปิดไว้ต้องยังอยู่ในรายการ ไม่งั้นเปิดกลับไม่ได้ ──
const target = open.candidates.find((c) => !c.blocked)!;
await tx((q) => q.run(`INSERT INTO tenant_plays (tenant_id, play_id, enabled) VALUES (?,?,0)
  ON CONFLICT(tenant_id, play_id) DO UPDATE SET enabled = 0`, T, target.play.id));
const off = (await runMatch(T)).candidates.find((c) => c.play.id === target.play.id);
ok(off?.blocked === "Turned off for this account", "play ที่ปิดไว้ยังอยู่ในรายการ (มีปุ่มเปิดกลับ) แต่ไม่ถูกเสนอ");
await tx((q) => q.run("UPDATE tenant_plays SET enabled = 1 WHERE tenant_id = ? AND play_id = ?", T, target.play.id));
ok(!(await runMatch(T)).candidates.find((c) => c.play.id === target.play.id)?.blocked, "เปิดกลับแล้วถูกเสนอได้อีก");

for (const l of out) console.log(l);
const fails = out.filter((l) => l.startsWith("FAIL"));
console.log(fails.length ? `\n=== มี FAIL ${fails.length} ข้อ ===` : `\n=== ผ่านทั้งหมด ${out.length} ข้อ ===`);
process.exit(fails.length ? 1 : 0);
