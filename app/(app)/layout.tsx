import { activeTenantId } from "@/app/(app)/tenant";
import type { Metadata } from "next";
import Link from "next/link";
import "./console.css";
import { ConsoleNav } from "@/components/console/nav";
import { demoToolsEnabled } from "@/lib/shared/demo-tools";
import { ensureReady } from "@/lib/engine/bootstrap";
import { getTenant } from "@/lib/engine/match";

import { planById } from "@/lib/shared/plans";
import { TENANT_PROFILES, profileFor } from "@/lib/shared/tenants";
import { featuresComputedAt } from "@/lib/engine/derive";
import { switchTenantAction } from "./actions";
import { signOutAction } from "@/app/login/actions";
import { myTenants } from "./tenant";
import { currentUser } from "@/lib/shared/session";

export const metadata: Metadata = {
  title: "Console",
  robots: { index: false, follow: false },
};

export default async function ConsoleLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await ensureReady();
  const tenantId = await activeTenantId();
  const tenant = await getTenant(tenantId);
  const profile = profileFor(tenantId);
  const computedAt = await featuresComputedAt(tenantId);
  const allowed = await myTenants();
  const user = await currentUser();

  return (
    <div className="console">
      <a href="#console-main" className="c-skip c-btn c-btn-primary">
        ข้ามไปยังเนื้อหา
      </a>
      <div className="c-shell">
        <ConsoleNav
          tenantId={tenantId}
          tenantName={tenant?.name ?? profile.name}
          industry={profile.industry}
          credits={tenant?.message_credits ?? 0}
          planName={planById(tenant?.tier ?? "growth").name}
          computedAt={computedAt}
          tenants={TENANT_PROFILES.map((t) => ({
            id: t.id,
            name: t.name,
            industry: t.industry,
          }))}
          switchAction={switchTenantAction}
          baseLabel={profile.vocab.base}
          personLabel={profile.vocab.person}
        />
        <main id="console-main" tabIndex={-1} className="c-main">
          {/* ── ปฐมนิเทศคนที่เพิ่งกดเข้ามาจากหน้าเว็บ ────────────

              "Open the live console" เป็นปุ่มหลักของหน้าแรกแล้ว คนแปลกหน้า
              จึงมาถึงที่นี่เป็นที่แรก โดยไม่รู้ว่ากำลังดูอะไรอยู่ — หมายเหตุ
              ว่าข้อมูลเป็นชุดสังเคราะห์อยู่ท้ายสุดของหน้าบรีฟ ซึ่งอ่านไม่ทัน
              ก่อนจะเริ่มสงสัยว่านี่คือข้อมูลจริงของใครหรือเปล่า

              โผล่เฉพาะตอนเครื่องมือเดโมถูกปิด ซึ่งแปลว่ากำลังรันบนที่สาธารณะ
              ตอนพัฒนาไม่ต้องมี เพราะคนที่เปิดอยู่รู้อยู่แล้วว่าคืออะไร

              บรรทัดเดียว ไม่กินพื้นที่จอ — สิ่งที่หน้านี้ต้องการให้อ่านคือ
              สามการตัดสินใจ ไม่ใช่ป้ายประกาศ */}
          {!demoToolsEnabled() && (
            <div className="c-demobar">
              <span>
                <strong>Demo</strong> · synthetic data, four Thai businesses
              </span>
              <span className="c-demobar__sep" aria-hidden />
              <span>Approving and sending really work — no message leaves the system</span>
              <Link href="/" className="c-demobar__back">
                ← parallax
              </Link>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
