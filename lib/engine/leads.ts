import { randomUUID } from "node:crypto";
import { run } from "@/lib/engine/sql";

/* ── ข้อความจากฟอร์มติดต่อ ───────────────────────────────────────

   ทุกปุ่ม "ขอทดลองใช้" บนเว็บพาไปที่ฟอร์มเดียว และเดิมฟอร์มส่งต่อได้แค่ทาง
   webhook ซึ่งยังไม่ได้ตั้ง — ทุกข้อความจึงถูกปฏิเสธ ตอนนี้เก็บลงฐานก่อนเสมอ
   แล้วค่อยส่งต่อ webhook ถ้ามี ข้อความไม่หายแม้ webhook ล่ม */
export type Lead = {
  name: string;
  company: string;
  email: string;
  phone: string;
  topic: string;
  cycle: string;
  baseSize: string;
  message: string;
};

export async function saveLead(lead: Lead): Promise<{ id: string; receivedAt: string }> {
  const id = randomUUID();
  const receivedAt = new Date().toISOString();
  await run(
    `INSERT INTO contact_leads (id, received_at, name, company, email, phone, topic, cycle, base_size, message)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, receivedAt, lead.name, lead.company, lead.email, lead.phone || null, lead.topic || null,
    lead.cycle || null, lead.baseSize || null, lead.message || null,
  );
  return { id, receivedAt };
}

export async function markForwarded(id: string): Promise<void> {
  await run("UPDATE contact_leads SET forwarded = 1 WHERE id = ?", id);
}
