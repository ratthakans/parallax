/* ── ทะเบียนการลบ: ส่งออกก่อนกู้คืน · ใช้ซ้ำหลังกู้คืน (docs/plan.md หัวข้อ 7.5 · B6) ─────────

   กู้คืน backup ที่ทำก่อนการลบ = คนที่ถูกลบกลับมา และทะเบียนการลบใน backup ก็ไม่มีรายการนั้น
   ขั้นตอนที่ต้องทำทุกครั้งที่กู้คืน:
     1. ก่อนกู้:  npm run erasures -- export <tenant> <ไฟล์.json>    (จากฐานปัจจุบัน)
     2. กู้คืน backup
     3. หลังกู้:  npm run erasures -- reapply <tenant> <ไฟล์.json>   (ใส่ทะเบียนกลับ แล้วลบคนที่กลับมาซ้ำ)
   ไฟล์ส่งออกมีแค่ HMAC เหตุผล เวลา และผู้ลบ — ไม่มีชื่อหรือค่าติดต่อ แต่ยังเป็นข้อมูลส่วนบุคคล เก็บในที่ปลอดภัยและลบเมื่อเสร็จ */
import { readFileSync, writeFileSync } from "node:fs";

const [mode, tenant, file] = process.argv.slice(2);
if (!["export", "reapply"].includes(mode ?? "") || !tenant || !file) {
  console.error("ใช้: npm run erasures -- export|reapply <tenant> <ไฟล์.json>");
  process.exit(1);
}
const { ensureReady } = await import("@/lib/engine/bootstrap");
const { exportErasures, reapplyErasures } = await import("@/lib/engine/vault/erasure");
await ensureReady();
if (mode === "export") {
  const entries = await exportErasures(tenant);
  writeFileSync(file, JSON.stringify({ tenant, exportedAt: new Date().toISOString(), entries }, null, 1), { mode: 0o600 });
  console.log(`ส่งออก ${entries.length} รายการ → ${file}`);
} else {
  const data = JSON.parse(readFileSync(file, "utf8")) as { tenant: string; entries: Parameters<typeof reapplyErasures>[1] };
  if (data.tenant !== tenant) throw new Error(`ไฟล์เป็นของบัญชี ${data.tenant} ไม่ใช่ ${tenant}`);
  const r = await reapplyErasures(tenant, data.entries, "restore-runbook");
  console.log(`ใส่ทะเบียนกลับ ${r.restoredEntries} รายการ · ลบคนที่กลับมาซ้ำ ${r.erased} คน`);
}
