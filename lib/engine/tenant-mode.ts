import { get, run } from "@/lib/engine/sql";
import { logActivity } from "@/lib/engine/db";
import { CUSTOMER_MODE_TH, defaultCustomerMode, isCustomerMode, type CustomerMode } from "@/lib/shared/tenants";

/* ── โหมดลูกค้าของบัญชี (docs/crm-plan.md F1 · migration 0026) ──────────────
   อ่านจาก tenants.customer_mode · แถวไม่มี/ค่าแปลก = ค่าสำรองจากทะเบียนนิ่ง (บัญชีเดิมได้หน้าจอเดิม)
   ผู้เรียกตรวจสิทธิ์เจ้าของบัญชีเองก่อนเปลี่ยน — บน Postgres นโยบาย tenants_update (0002) กันซ้ำอีกชั้น */

export async function customerMode(tenantId: string): Promise<CustomerMode> {
  const r = await get<{ customer_mode: string }>("SELECT customer_mode FROM tenants WHERE id = ?", tenantId);
  return isCustomerMode(r?.customer_mode) ? r.customer_mode : defaultCustomerMode(tenantId);
}

export async function setCustomerMode(tenantId: string, mode: string, actor: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isCustomerMode(mode)) return { ok: false, error: "เลือกแบบลูกค้าจากรายการ" };
  const before = await customerMode(tenantId);
  if (before === mode) return { ok: true };
  await run("UPDATE tenants SET customer_mode = ? WHERE id = ?", mode, tenantId);
  if ((await customerMode(tenantId)) !== mode) return { ok: false, error: "บันทึกไม่สำเร็จ — เฉพาะเจ้าของบัญชีเปลี่ยนได้" };
  await logActivity(tenantId, actor, "customer_mode", `${CUSTOMER_MODE_TH[before].label} → ${CUSTOMER_MODE_TH[mode].label}`);
  return { ok: true };
}
