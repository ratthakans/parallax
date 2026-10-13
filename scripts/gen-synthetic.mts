/* เขียนไฟล์ข้อมูลสมมุติ B2B ลงดิสก์ไว้ลองนำเข้าด้วยมือ (docs/plan.md B1)
   ใช้: npm run synthetic -- [events|services] [จำนวนแถว]
   ออกที่ .data/synthetic/<segment>/ (อยู่ใน .gitignore) พร้อม truth.json — ห้าม commit ผลลัพธ์ */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileBytes, generateSynthetic, type Segment } from "@/lib/shared/synthetic-b2b";

const segment = (process.argv[2] ?? "events") as Segment;
const rows = Number(process.argv[3] ?? 10_000);
const set = generateSynthetic({ segment, sourceRows: rows });
const dir = join(process.cwd(), ".data", "synthetic", segment);
mkdirSync(dir, { recursive: true });
for (const f of set.files) writeFileSync(join(dir, f.name), fileBytes(f));
writeFileSync(join(dir, "truth.json"), JSON.stringify({ label: set.label, seed: set.seed, orgs: set.orgs, people: set.people, affiliations: set.affiliations, truth: set.truth }, null, 1));
console.log(`${set.label}: ${set.files.map((f) => `${f.name} (${f.rows.length} แถว · ${f.encoding})`).join(" · ")} → ${dir}`);
