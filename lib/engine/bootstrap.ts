import { ensureSchema } from "@/lib/engine/db";
import { get } from "@/lib/engine/sql";
import { seedCampaignHistory } from "@/lib/engine/demo";
import { deriveFeatures, featuresComputedAt } from "@/lib/engine/derive";
import { isTenantSeeded, seed } from "@/lib/engine/seed";
import { TENANT_PROFILES } from "@/lib/shared/tenants";

/* เปิดครั้งแรกให้มีของให้ดูทันที — seed ชุดตัวอย่างแล้วคำนวณ feature
   ในระบบจริงขั้น DERIVE เป็น cron รายคืน ไม่ใช่ทำตอนเปิดหน้า

   seedCampaignHistory สร้างแคมเปญย้อนหลังให้ชั้น Proof มีของวัด —
   ถ้าไม่มี ทุกอย่างจะขึ้น "ยังไม่พอสรุป" ซึ่งถูกต้องแต่ดูไม่ออกว่าระบบทำอะไรได้

   ทำให้ทุกบัญชีในทะเบียน ไม่ใช่แค่บัญชีตั้งต้น เพราะผู้ใช้สลับบัญชีได้
   ทันทีและคาดหวังว่าจะเห็นของครบเหมือนกัน */

let ready = false;
let readying: Promise<void> | null = null;

export function ensureReady(): Promise<void> {
  if (ready) return Promise.resolve();
  readying ??= (async () => {
    /* ตารางต้องมีก่อนทุกอย่าง — เดิม db() สร้างให้เองตอนเปิดคอนเนกชัน
       ตอนนี้ไม่มี db() แล้ว จึงต้องเรียกให้ชัด */
    await ensureSchema();

    const seeded = await Promise.all(
      TENANT_PROFILES.map((t) => isTenantSeeded(t.id)),
    );
    if (seeded.some((s) => !s)) await seed();
    for (const t of TENANT_PROFILES) {
      if (!(await featuresComputedAt(t.id))) await deriveFeatures(t.id);
      await seedCampaignHistory(t.id);
    }
    ready = true;
  })().finally(() => {
    readying = null;
  });
  return readying;
}

export function resetReady() {
  ready = false;
}

export async function tenantStats(tenantId: string) {
  /* ทุกคำถามที่นี่คือ COUNT(*) ซึ่ง Postgres คืนเป็น bigint และ sqlite
     คืนเป็น number — ตัวช่วยตัวเดียวจึงแปลงให้เป็นตัวเลขทุกครั้ง
     แทนที่จะให้แต่ละจุดจำเอง */
  const count = async (sql: string, ...args: (string | number)[]) =>
    Number((await get<{ n: number | string }>(sql, ...args))?.n ?? 0);

  const customers = await count(
    "SELECT COUNT(*) AS n FROM customers WHERE tenant_id = ?",
    tenantId,
  );
  const campaigns = await count(
    "SELECT COUNT(*) AS n FROM campaigns WHERE tenant_id = ? AND dry_run = 0",
    tenantId,
  );
  const measuring = await count(
    "SELECT COUNT(*) AS n FROM campaigns WHERE tenant_id = ? AND dry_run = 0 AND status = 'measuring'",
    tenantId,
  );
  const sent = await count(
    `SELECT COUNT(*) AS n FROM messages m
     JOIN campaigns c ON c.id = m.campaign_id WHERE c.tenant_id = ?`,
    tenantId,
  );
  return { customers, campaigns, measuring, messagesSent: sent };
}
