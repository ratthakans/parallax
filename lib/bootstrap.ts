import { seedCampaignHistory } from "./demo";
import { db } from "./db";
import { deriveFeatures, featuresComputedAt } from "./derive";
import { isTenantSeeded, seed } from "./seed";
import { TENANT_PROFILES } from "./tenants";

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
    const missing = TENANT_PROFILES.filter((t) => !isTenantSeeded(t.id));
    if (missing.length) seed();
    for (const t of TENANT_PROFILES) {
      if (!featuresComputedAt(t.id)) deriveFeatures(t.id);
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

export function tenantStats(tenantId: string) {
  const d = db();
  const one = <T>(sql: string, ...args: (string | number)[]) =>
    d.prepare(sql).get(...args) as T;

  const base = one<{ n: number }>(
    "SELECT COUNT(*) AS n FROM customers WHERE tenant_id = ?",
    tenantId,
  );
  const campaigns = one<{ n: number }>(
    "SELECT COUNT(*) AS n FROM campaigns WHERE tenant_id = ? AND dry_run = 0",
    tenantId,
  );
  const measuring = one<{ n: number }>(
    "SELECT COUNT(*) AS n FROM campaigns WHERE tenant_id = ? AND dry_run = 0 AND status = 'measuring'",
    tenantId,
  );
  const sent = one<{ n: number }>(
    `SELECT COUNT(*) AS n FROM messages m
     JOIN campaigns c ON c.id = m.campaign_id WHERE c.tenant_id = ?`,
    tenantId,
  );
  return {
    customers: base.n,
    campaigns: campaigns.n,
    measuring: measuring.n,
    messagesSent: sent.n,
  };
}
