import { all, asSystem, get, usingPostgres } from "@/lib/engine/sql";
import { membershipEnforced } from "@/lib/engine/access";
import { getTenant } from "@/lib/engine/match";
import { planById } from "@/lib/shared/plans";
import { TENANT_PROFILES } from "@/lib/shared/tenants";

/* ── ผู้ดูแลระบบ (ทีม Parallax) ──────────────────────────────────

   คนละบทบาทกับเจ้าของร้าน: เห็นทุกร้าน ทุกผู้ใช้ และคำขอทดลองใช้ที่เข้ามาจากเว็บ
   ใครเป็นผู้ดูแลกำหนดด้วย ADMIN_EMAILS (คั่นด้วยจุลภาค) บน Postgres
   ส่วนโหมดเดโม (SQLite ไม่มีการล็อกอิน) เปิดให้ดูได้ เพื่อทดสอบหน้าจอ

   คำสั่งที่นี่อ่านข้ามบัญชีโดยตั้งใจ จึงต้องผ่าน isAdmin ก่อนทุกครั้ง */

export function isAdmin(email: string | null | undefined): boolean {
  if (!membershipEnforced()) return true;
  const allow = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return Boolean(email && allow.includes(email.toLowerCase()));
}

export type AdminShop = {
  id: string;
  name: string;
  industry: string;
  plan: string;
  credits: number;
  customers: number;
  users: number;
  lastActivityAt: string | null;
  lastImportAt: string | null;
  synthetic: boolean;
};

async function adminShops(): Promise<AdminShop[]> {
  return Promise.all(
    TENANT_PROFILES.map(async (p) => {
      const [t, c, u, last, imp, syn] = await Promise.all([
        getTenant(p.id),
        get<{ n: number | string }>("SELECT COUNT(*) AS n FROM customers WHERE tenant_id = ?", p.id),
        get<{ n: number | string }>("SELECT COUNT(*) AS n FROM tenant_users WHERE tenant_id = ?", p.id),
        get<{ at: string | null }>("SELECT MAX(at) AS at FROM activity_log WHERE tenant_id = ?", p.id),
        get<{ at: string | null }>(
          "SELECT MAX(at) AS at FROM activity_log WHERE tenant_id = ? AND action = 'import_csv'", p.id,
        ),
        get<{ x: number }>("SELECT 1 AS x FROM customers WHERE tenant_id = ? AND id LIKE ? LIMIT 1", p.id, `${p.id}-c-%`),
      ]);
      return {
        id: p.id,
        name: t?.name ?? p.name,
        industry: p.industry,
        plan: planById(t?.tier ?? "growth").name,
        credits: t?.message_credits ?? 0,
        customers: Number(c?.n ?? 0),
        users: Number(u?.n ?? 0),
        lastActivityAt: last?.at ?? null,
        lastImportAt: imp?.at ?? null,
        synthetic: Boolean(syn),
      };
    }),
  );
}

export type Lead = {
  id: string;
  receivedAt: string;
  name: string;
  company: string;
  email: string;
  phone: string | null;
  topic: string | null;
  cycle: string | null;
  baseSize: string | null;
  message: string | null;
  forwarded: boolean;
};

async function listLeads(limit = 100): Promise<Lead[]> {
  const rows = await all<{
    id: string; received_at: string; name: string; company: string; email: string;
    phone: string | null; topic: string | null; cycle: string | null; base_size: string | null;
    message: string | null; forwarded: number | boolean;
  }>(
    `SELECT id, received_at, name, company, email, phone, topic, cycle, base_size, message, forwarded
     FROM contact_leads ORDER BY received_at DESC LIMIT ?`,
    limit,
  );
  return rows.map((r) => ({
    id: r.id, receivedAt: r.received_at, name: r.name, company: r.company, email: r.email,
    phone: r.phone, topic: r.topic, cycle: r.cycle, baseSize: r.base_size, message: r.message,
    forwarded: Boolean(r.forwarded),
  }));
}

export type AdminUser = { email: string; tenantId: string; role: string; lastSignInAt: string | null };

/** ผู้ใช้กับร้านที่ผูกไว้ — อีเมลอยู่ใน auth.users ของ Supabase จึงมีเฉพาะบน Postgres */
async function listUsers(): Promise<AdminUser[]> {
  if (!usingPostgres()) return [];
  const rows = await all<{ email: string | null; tenant_id: string; role: string; last_sign_in_at: string | null }>(
    `SELECT u.email, t.tenant_id, t.role, u.last_sign_in_at::text AS last_sign_in_at
     FROM tenant_users t LEFT JOIN auth.users u ON u.id::text = t.user_id::text
     ORDER BY t.tenant_id, u.email`,
  );
  return rows.map((r) => ({
    email: r.email ?? "(ไม่พบอีเมล)", tenantId: r.tenant_id, role: r.role, lastSignInAt: r.last_sign_in_at,
  }));
}

/** ทุกอย่างที่หน้าผู้ดูแลต้องใช้ — ตรวจสิทธิ์ก่อน แล้วจึงอ่านข้ามบัญชี */
export async function adminData(email: string | null | undefined) {
  if (!isAdmin(email)) return null;
  return asSystem(async () => {
    const [shops, leads, users] = await Promise.all([adminShops(), listLeads(), listUsers()]);
    return { shops, leads, users };
  });
}
