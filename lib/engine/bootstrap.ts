import { usingPostgres } from "@/lib/engine/sql";
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
    /* ── บนฐานจริง ห้าม seed จากคำขอของผู้ใช้ ──

       สองเหตุผล และทั้งคู่เป็นเหตุผลที่หนักพอเอง:

       1. ตอนนี้คำขอวิ่งในนามผู้ใช้ที่ล็อกอิน RLS จึงกันการเขียนข้าม
          บัญชี — isTenantSeeded จะเห็นศูนย์แถวของบัญชีที่ไม่ใช่ของเขา
          แล้ว seed พยายามสร้างใหม่ทุกคำขอ

       2. seed สี่บัญชีใช้ 102 วินาที (วัดแล้ว) ยาวเกินกว่า serverless
          function จะรอ — ดู docs/postgres-migration.md

       ข้อมูลบน production มาจากสคริปต์ที่รันครั้งเดียว ไม่ใช่จากหน้าเว็บ */
    if (usingPostgres()) {
      ready = true;
      return;
    }

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

