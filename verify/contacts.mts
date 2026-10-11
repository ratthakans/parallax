/* ── ข้อมูลติดต่อ: เก็บได้มาก แต่ไม่รั่ว ─────────────────────────

   ตรวจสามเรื่องที่พังแล้วไม่มีใครเห็น:
   1. ค่าจริงไม่เคยลงฐานข้อมูลแบบอ่านได้ — ค้นไฟล์ฐานข้อมูลทั้งไฟล์ ไม่ใช่
      แค่คอลัมน์ที่คิดว่าเกี่ยว
   2. สองร้านมีลูกค้าคนเดียวกันได้ โดยไม่เขียนทับกัน
   3. ไฟล์รายชื่อที่ไม่มียอดขายนำเข้าได้ และนำเข้าซ้ำแล้วไม่ทำของเดิมหาย */
import "./isolate.mts";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { ensureReady } from "@/lib/engine/bootstrap";
import { all, get } from "@/lib/engine/sql";
import { parseCsv, commitImport, buildPreview } from "@/lib/engine/ingest";
import { mapColumnsHeuristic } from "@/lib/engine/ai";
import {
  contactStorageReady, decryptContact, encryptContact, maskContact, matchKey, normaliseContact,
} from "@/lib/engine/pii";
import { findCustomersByContact, listContactPoints, revealContactPoint } from "@/lib/engine/contacts";
import { IMPORT_FIELDS, IMPORT_FIELD_GROUPS } from "@/lib/shared/ingest-types";
import { identifiedCount } from "@/lib/engine/billing";
import { loadFeatures } from "@/lib/engine/derive";
import { wipeCustomerData } from "@/lib/engine/tenant-data";
import { tx } from "@/lib/engine/sql";

const out: string[] = [];
const ok = (c: boolean, m: string) => out.push(`${c ? "PASS" : "FAIL"}  ${m}`);
const throws = (fn: () => unknown) => { try { fn(); return false; } catch { return true; } };

await ensureReady();
const A = "mst-golf", B = "hongmove";

// ── 1 · การเข้ารหัส ──
const sealed = encryptContact(A, "phone", "+66812345678");
ok(decryptContact(A, "phone", sealed) === "+66812345678", "เข้ารหัสแล้วถอดกลับได้ค่าเดิม");
ok(!sealed.includes("812345678"), "ค่าที่เข้ารหัสไม่มีเบอร์อยู่ข้างใน");
ok(encryptContact(A, "phone", "+66812345678") !== sealed, "เข้ารหัสค่าเดิมสองครั้งได้ไม่เหมือนกัน (IV สุ่ม)");
ok(throws(() => decryptContact(B, "phone", sealed)), "ย้ายค่าไปอีกร้าน ถอดไม่ออก");
ok(throws(() => decryptContact(A, "email", sealed)), "ย้ายจากช่องเบอร์ไปช่องอีเมล ถอดไม่ออก");
const tampered = sealed.slice(0, -2) + (sealed.endsWith("A") ? "BB" : "AA");
ok(throws(() => decryptContact(A, "phone", tampered)), "แก้ไขค่าที่เข้ารหัสแม้ตัวเดียว ถอดไม่ออก");

// ── 2 · กุญแจจับคู่ ──
const k = matchKey(A, "phone", "+66812345678");
ok(k === matchKey(A, "phone", "+66812345678"), "กุญแจจับคู่คงที่ — นำเข้าซ้ำได้คนเดิม");
ok(k !== matchKey(B, "phone", "+66812345678"), "ร้านต่างกันได้กุญแจต่างกัน");
ok(k !== createHash("sha256").update("+66812345678").digest("hex")
  && k !== createHash("sha256").update("0812345678").digest("hex"),
  "ไม่ใช่ sha256 ธรรมดาที่ไล่ถอดได้");

// ── 3 · จัดรูปแบบและปิดบัง ──
const variants = ["081-234-5678", "0812345678", "+66 81 234 5678", "66812345678", "812345678"];
ok(variants.every((v) => normaliseContact("phone", v) === "+66812345678"),
  `เบอร์ห้ารูปแบบได้ค่าเดียวกัน (${variants.length} แบบ)`);
ok(normaliseContact("email", " Somchai@Example.COM ") === "somchai@example.com", "อีเมลตัดช่องว่างและเป็นตัวเล็ก");
ok(normaliseContact("email", "ไม่ใช่อีเมล") === null, "ไม่รับอีเมลที่ไม่ใช่อีเมล");
ok(normaliseContact("instagram", "https://www.instagram.com/Somchai.Golf/") === "somchai.golf", "ลิงก์โซเชียลเหลือแค่ชื่อบัญชี");
ok(maskContact("phone", "+66812345678") === "081-xxx-5678", `ปิดเบอร์เป็น ${maskContact("phone", "+66812345678")}`);
ok(!maskContact("email", "somchai@example.com").includes("somchai"), `ปิดอีเมลเป็น ${maskContact("email", "somchai@example.com")}`);

// ── 4 · จับหัวคอลัมน์ภาษาไทย ──
const headers = ["ชื่อ-นามสกุล", "ชื่อเล่น", "เบอร์มือถือ", "เบอร์บ้าน", "อีเมล", "ไลน์", "Facebook",
  "ที่อยู่", "ตำบล", "อำเภอ", "จังหวัด", "รหัสไปรษณีย์", "วันเกิด", "เพศ", "บริษัท", "ตำแหน่ง", "หมายเหตุ"];
const expect = ["customer_name", "nickname", "phone", "phone_alt", "email", "line_id", "facebook",
  "address", "subdistrict", "district", "province", "postcode", "birthday", "gender", "company", "job_title", "note"];
const mapped = mapColumnsHeuristic(headers).mappings.map((m) => m.field);
const wrong = headers.filter((_, i) => mapped[i] !== expect[i]).map((h, i) => `${h}→${mapped[headers.indexOf(h)]}`);
ok(wrong.length === 0, `จับหัวคอลัมน์ไทยถูกครบ ${headers.length} คอลัมน์${wrong.length ? " · ผิด: " + wrong.join(", ") : ""}`);
ok(mapColumnsHeuristic(["ชื่อ-นามสกุล", "นามสกุล"]).mappings[0].field === "customer_name",
  "\"ชื่อ-นามสกุล\" เป็นชื่อเต็ม ไม่ถูกนามสกุลแย่ง");

// ── 5 · นำเข้ารายชื่อที่ไม่มียอดขาย ──
const contactsCsv = `${headers.join(",")}
สมชาย ใจดี,ชาย,081-234-5678,02-123-4567,Somchai@Example.com,somchai_line,https://facebook.com/somchai.jd,99/1 ถนนสุขุมวิท,คลองเตยเหนือ,วัฒนา,กรุงเทพมหานคร,10110,15/03/2528,ชาย,บ.ไทยวัสดุ,ผู้จัดการจัดซื้อ,ลูกค้าจากงานแฟร์
สมหญิง รักดี,หญิง,+66 89 999 0000,,somying@example.com,,,,,,เชียงใหม่,50000,,หญิง,,,
,,,,,,,,,,,,,,,,ไม่มีตัวระบุ — ต้องถูกปฏิเสธ`;
const parsed = parseCsv(contactsCsv);
const mapping = mapColumnsHeuristic(parsed.headers);
const preview = buildPreview(parsed, mapping);
ok(preview.missing.length === 0, `ไฟล์รายชื่ออย่างเดียวไม่ถูกบังคับวันที่/ยอดเงิน (ขาด: ${preview.missing.join(",") || "ไม่มี"})`);
ok(preview.customers === 2 && preview.transactions === 0, `พรีวิว: ${preview.customers} คน · ${preview.transactions} ธุรกรรม`);
// สมชาย 6 (มือถือ · บ้าน · อีเมล · LINE · Facebook · ที่อยู่) + สมหญิง 2 (มือถือ · อีเมล)
// สมหญิงมีแค่จังหวัด ไม่มีบ้านเลขที่ จึงไม่เกิดช่องที่อยู่ — จังหวัดอยู่ในประวัติแทน
ok(preview.contactPoints === 8, `พรีวิว: ช่องทางติดต่อ ${preview.contactPoints} ช่อง (คาด 8)`);
const res = await commitImport(A, parsed, mapping);
ok(res.customers === 2 && res.contactPoints === 8, `นำเข้า: ${res.customers} คน · ${res.contactPoints} ช่องทาง`);

const [somchai] = await findCustomersByContact(A, "phone", "0812345678");
ok(Boolean(somchai), "หาลูกค้าจากเบอร์รูปแบบอื่นเจอ");
const pts = await listContactPoints(A, somchai);
ok(pts.length === 6, `สมชายมี ${pts.length} ช่องทาง (มือถือ · บ้าน · อีเมล · LINE · Facebook · ที่อยู่)`);
ok(pts.every((p) => !/812345678|somchai@example/.test(p.masked)), "รายการที่แสดงบนหน้าจอไม่มีค่าเต็ม");
const prof = await get<Record<string, string>>("SELECT * FROM contact_profiles WHERE customer_id = ?", somchai);
ok(prof?.birthday === "1985-03-15", `วันเกิด พ.ศ. 2528 → ${prof?.birthday}`);
ok(prof?.nickname === "ชาย" && prof?.gender === "male" && prof?.province === "กรุงเทพมหานคร",
  "ประวัติ: ชื่อเล่น · เพศ · จังหวัด ครบ");
const consent = await get<{ granted_at: string | null }>(
  "SELECT granted_at FROM consents WHERE customer_id = ? AND purpose = 'marketing'", somchai);
ok(consent != null && consent.granted_at == null, "มีเบอร์ไม่ได้แปลว่ายินยอมให้ส่ง — ความยินยอมยังว่าง");

// ── 6 · เปิดดูค่าเต็ม ต้องมีร่องรอย ──
const phone = pts.find((p) => p.kind === "phone" && p.isPrimary)!;
const before = (await get<{ n: number }>("SELECT COUNT(*) AS n FROM activity_log WHERE action = 'reveal_contact'"))!.n;
ok(await revealContactPoint(A, phone.id, "verify") === "+66812345678", "เปิดดูได้ค่าเต็ม");
const logRows = await all<{ detail: string }>("SELECT detail FROM activity_log WHERE action = 'reveal_contact'");
ok(Number(logRows.length) === Number(before) + 1, "การเปิดดูถูกบันทึก");
ok(logRows.every((r) => !r.detail.includes("812345678")), "บันทึกไม่มีเบอร์อยู่ข้างใน");
ok(await revealContactPoint(B, phone.id, "verify") === null, "อีกร้านเปิดดูไม่ได้");

// ── 7 · นำเข้าซ้ำ: ไม่เพิ่มซ้ำ ไม่ล้างของเดิม ──
const again = parseCsv(`เบอร์มือถือ,ชื่อเล่น\n0812345678,\n`);
await commitImport(A, again, mapColumnsHeuristic(again.headers));
ok((await listContactPoints(A, somchai)).length === pts.length, "นำเข้าซ้ำไม่เพิ่มช่องทางซ้ำ");
const nameNow = (await get<{ name: string }>("SELECT name FROM customers WHERE id = ?", somchai))!.name;
ok(nameNow === "สมชาย ใจดี", `ไฟล์ที่ไม่มีชื่อไม่ลบชื่อเดิม (${nameNow})`);
const prof2 = await get<{ nickname: string }>("SELECT nickname FROM contact_profiles WHERE customer_id = ?", somchai);
ok(prof2?.nickname === "ชาย", "ไฟล์ที่ไม่มีชื่อเล่นไม่ลบชื่อเล่นเดิม");

// ── 8 · สองร้าน ลูกค้าคนเดียวกัน ──
const sale = (name: string, total: number) =>
  parseCsv(`เบอร์มือถือ,ชื่อลูกค้า,วันที่ซื้อ,ยอดสุทธิ,ชื่อสินค้า\n081-234-5678,${name},2026-09-01,${total},ลูกกอล์ฟ\n`);
for (const [t, name, total] of [[A, "สมชาย (กอล์ฟ)", 4200], [B, "สมชาย (แท็กซี่)", 350]] as const) {
  const p = sale(name, total);
  await commitImport(t, p, mapColumnsHeuristic(p.headers));
}
const [inA] = await findCustomersByContact(A, "phone", "0812345678");
const [inB] = await findCustomersByContact(B, "phone", "0812345678");
ok(inA !== inB, "คนเดียวกันในสองร้านเป็นสองแถว");
const owner = await get<{ tenant_id: string }>("SELECT tenant_id FROM customers WHERE id = ?", inB);
ok(owner?.tenant_id === B, "แถวของร้านที่สองเป็นของร้านที่สอง");
const txB = await all<{ total: number }>("SELECT total FROM transactions WHERE customer_id = ? AND tenant_id = ?", inB, B);
ok(txB.length === 1 && Number(txB[0].total) === 350, "ธุรกรรมของร้านที่สองไม่หาย");
const prodRows = await all<{ tenant_id: string }>("SELECT tenant_id FROM products WHERE name = 'ลูกกอล์ฟ'");
ok(new Set(prodRows.map((r) => r.tenant_id)).size === 2, "สินค้าชื่อซ้ำข้ามร้านเป็นสองแถว");

// ── 9 · ไฟล์ยอดขายยังบังคับวันที่และยอดเงินเหมือนเดิม ──
const bad = parseCsv(`เบอร์มือถือ,วันที่ซื้อ,ยอดสุทธิ\n0899990000,ไม่ใช่วันที่,100\n`);
const badPrev = buildPreview(bad, mapColumnsHeuristic(bad.headers));
ok(badPrev.usableRows === 0 && badPrev.rejected.some((r) => r.reason.includes("วันที่")), "ไฟล์ยอดขายที่วันที่อ่านไม่ได้ถูกปฏิเสธ");

// ── 10 · ค่าจริงไม่อยู่ในไฟล์ฐานข้อมูลเลย ──
const dbPath = process.env.PARALLAX_DB_PATH!;
const raw = Buffer.concat([dbPath, `${dbPath}-wal`].filter(existsSync).map((p) => readFileSync(p)));
const leaks = ["0812345678", "+66812345678", "812345678", "somchai@example.com", "somying@example.com",
  "somchai_line", "99/1 ถนนสุขุมวิท"].filter((v) => raw.includes(Buffer.from(v, "utf8")));
ok(leaks.length === 0, `ค้นไฟล์ฐานข้อมูลทั้งไฟล์ไม่พบค่าจริง${leaks.length ? " · พบ: " + leaks.join(", ") : ""}`);

// ── 10.1 · เมนูเลือกคอลัมน์: ทุก field อยู่ในกลุ่มเดียวพอดี ──
const grouped = IMPORT_FIELD_GROUPS.flatMap((g) => g.fields);
const missingFromMenu = IMPORT_FIELDS.filter((f) => f !== "ignore" && !grouped.includes(f));
const dupInMenu = grouped.filter((f, i) => grouped.indexOf(f) !== i);
ok(missingFromMenu.length === 0 && dupInMenu.length === 0,
  `เมนูจัดกลุ่มครบ ${grouped.length} field${missingFromMenu.length ? " · หายไป: " + missingFromMenu : ""}${dupInMenu.length ? " · ซ้ำ: " + dupInMenu : ""}`);

// ── 10.2 · รหัสสมาชิกเป็นตัวระบุใน contact_points ──
const member = parseCsv(`รหัสลูกค้า,ชื่อลูกค้า\nM-00042,คุณสมาชิก\n`);
await commitImport(A, member, mapColumnsHeuristic(member.headers));
await commitImport(A, member, mapColumnsHeuristic(member.headers));
const memberRows = await all<{ customer_id: string; value_enc: string }>(
  "SELECT customer_id, value_enc FROM contact_points WHERE tenant_id = ? AND kind = 'member_no'", A);
ok(memberRows.length === 1 && !memberRows[0].value_enc.includes("M-00042"),
  `ไฟล์ที่มีแค่รหัสสมาชิกได้ลูกค้าหนึ่งคน นำเข้าซ้ำไม่ซ้ำ และรหัสถูกเข้ารหัส (${memberRows.length} แถว)`);

// ── 10.3 · ผู้อ่านที่ย้ายจาก identities มา contact_points ──
const seededIdentified = await identifiedCount("brc-golf");
const seededPeople = Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM customers WHERE tenant_id = ?", "brc-golf"))!.n);
ok(seededIdentified === seededPeople && seededPeople > 0,
  `นับคนที่ระบุตัวได้จาก contact_points (${seededIdentified}/${seededPeople})`);
const lineReach = (await loadFeatures("brc-golf")).filter((f) => f.reachable_by === "line").length;
ok(lineReach > 0, `ทักทาง LINE ได้ตัดสินจาก contact_points (${lineReach} คน)`);
ok(!(await all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'identities'")).length,
  "ไม่มีตาราง identities แล้ว");

// ── 10.4 · ล้างข้อมูลลูกค้าทั้งบัญชี ──
const logBefore = Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM activity_log WHERE tenant_id = ?", A))!.n);
const bBefore = Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM customers WHERE tenant_id = ?", B))!.n);
await tx((q) => wipeCustomerData(q, A));
const left = async (t: string) => Number((await get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t} WHERE tenant_id = ?`, A))!.n);
const leftovers = [];
for (const t of ["customers", "contact_points", "contact_profiles", "transactions", "campaigns", "products", "customer_features"])
  if (await left(t)) leftovers.push(`${t}=${await left(t)}`);
ok(leftovers.length === 0, `ล้างแล้วไม่เหลือข้อมูลลูกค้าของร้านนี้${leftovers.length ? " · เหลือ " + leftovers.join(", ") : ""}`);
ok(await left("activity_log") === logBefore, "บันทึกการใช้งานไม่ถูกลบไปด้วย");
ok(Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM customers WHERE tenant_id = ?", B))!.n) === bBefore,
  "ร้านอื่นไม่โดนลบ");

// ── 11 · production ที่ไม่มีกุญแจ = ไม่รับ ──
const saved = { NODE_ENV: process.env.NODE_ENV, PII_KEY: process.env.PII_KEY, PII_HMAC_KEY: process.env.PII_HMAC_KEY };
(process.env as Record<string, string | undefined>).NODE_ENV = "production";
delete process.env.PII_KEY; delete process.env.PII_HMAC_KEY;
const readyInProd = contactStorageReady();
let refused = "";
try { await commitImport(A, again, mapColumnsHeuristic(again.headers)); }
catch (e) { refused = (e as Error).message; }
for (const [k2, v] of Object.entries(saved)) {
  if (v === undefined) delete (process.env as Record<string, string | undefined>)[k2];
  else (process.env as Record<string, string | undefined>)[k2] = v;
}
ok(!readyInProd && refused.includes("PII_KEY"), "production ที่ไม่มีกุญแจปฏิเสธการนำเข้า ไม่ถอยไปเก็บแบบอ่านได้");

for (const l of out) console.log(l);
const fails = out.filter((l) => l.startsWith("FAIL"));
console.log(fails.length ? `\n=== มี FAIL ${fails.length} ข้อ ===` : `\n=== ผ่านทั้งหมด ${out.length} ข้อ ===`);
process.exit(fails.length ? 1 : 0);
