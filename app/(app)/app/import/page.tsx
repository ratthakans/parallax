import { aiConfigured } from "@/lib/engine/ai";
import { usageFor } from "@/lib/engine/billing";
import { getActiveTenantId } from "@/lib/shared/active-tenant";
import { profileFor } from "@/lib/shared/tenants";
import { Metric, PageHead, Panel, num } from "@/components/console/ui";
import { Importer } from "@/components/console/importer";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  /* ── หน้านี้เคยไม่รู้จักบัญชีที่เปิดอยู่เลย ──────────────────────

     จากแปดหน้าของคอนโซล นี่เป็นหน้าเดียวที่ไม่เคยเรียก getActiveTenantId()
     ผลคือสลับบัญชีขณะอยู่หน้านี้แล้วจอไม่เปลี่ยนอะไรสักอย่าง — ซึ่งอ่านได้
     ว่าการสลับพัง ทั้งที่จริงคือหน้านี้ไม่เคยแสดงบัญชีตั้งแต่แรก

     และมันคือหน้าที่อันตรายที่สุดที่จะไม่บอกปลายทาง: สิ่งที่กำลังจะอัปโหลด
     คือฐานลูกค้าจริง commitImport เขียนลงบัญชีที่อยู่ใน cookie ไม่ใช่บัญชี
     ที่ผู้ใช้คิดว่าตัวเองอยู่ ถ้าสองอย่างนี้ไม่ตรงกัน ไฟล์ของร้านหนึ่ง
     จะไปอยู่ในฐานของอีกร้านโดยไม่มีอะไรเตือน

     เพดานจำนวนคนก็เช่นกัน — contactCapBlockedReason ปฏิเสธการนำเข้าที่
     ทำให้เกินเพดานอยู่แล้ว แต่ปฏิเสธ *หลัง* อัปโหลดและแม็ปคอลัมน์เสร็จ
     บอกที่ว่างที่เหลือก่อนลากไฟล์เข้ามา ถูกกว่าบอกตอนงานเสียไปแล้ว */
  const tenantId = await getActiveTenantId();
  const profile = profileFor(tenantId);
  const v = profile.vocab;
  const u = await usageFor(tenantId);
  const ai = aiConfigured();

  const headroom =
    u.contactCap != null ? Math.max(0, u.contactCap - u.identified) : null;

  return (
    <>
      <PageHead
        label="Import"
        title="Drop a file, see where the revenue leaks"
        lead="Almost every POS exports CSV. That is an API already open that nobody can close — no vendor deal required."
      />

      {/* ── ปลายทางของไฟล์ ต้องอ่านได้ก่อนลาก ── */}
      <Panel flat className="mb-6 border-l-2 border-[var(--c-accent)] p-5 md:p-6">
        <p className="c-label text-[var(--c-accent)]">this file goes into</p>
        <div className="mt-4 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
          <Metric size="sm" label="Account" value={profile.name} sub={profile.industry} />
          <Metric size="sm" label="Plan" value={u.plan.name} />
          <Metric
            size="sm"
            label={`Identifiable ${v.people}`}
            value={
              u.contactCap != null
                ? `${num(u.identified)} / ${num(u.contactCap)}`
                : num(u.identified)
            }
            sub={u.contactCap == null ? "No numeric cap on this plan" : undefined}
            tone={u.overCap ? "bad" : "plain"}
          />
          <Metric
            size="sm"
            label="Room for"
            value={headroom != null ? `${num(headroom)} more` : "—"}
            sub={
              headroom != null
                ? "An import past this is refused"
                : "Agreed by contract"
            }
            tone={headroom != null && headroom === 0 ? "bad" : "muted"}
          />
        </div>
        <p className="c-thai mt-5 text-[0.78rem] text-[var(--c-text-4)]">
          Switch account in the sidebar before importing if this is not the right
          one — the file is written to the account named here, not the one you had
          open last.
        </p>
      </Panel>

      {!ai && (
        <Panel flat className="mb-6 border-l-2 border-[var(--c-warn)] p-5">
          <p className="c-label text-[var(--c-warn)]">ai not connected</p>
          <p className="c-thai mt-2.5 text-[0.84rem] text-[var(--c-text-2)]">
            Column mapping falls back to pattern matching, which handles
            straightforwardly named headers but misreads unusual ones. Set{" "}
            <span className="c-mono">ANTHROPIC_API_KEY</span> and restart so the model
            can read sample rows as well.
          </p>
        </Panel>
      )}

      <Importer />
    </>
  );
}
