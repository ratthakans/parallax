import { activeTenantId } from "@/app/(app)/tenant";
import type { Metadata } from "next";
import Link from "next/link";
import "./console.css";
import { ConsoleNav } from "@/components/console/nav";
import { demoToolsEnabled } from "@/lib/shared/demo-tools";
import { ensureReady } from "@/lib/engine/bootstrap";
import { getTenant } from "@/lib/engine/match";

import { planById } from "@/lib/shared/plans";
import { CONSOLE_PROFILES, profileFor } from "@/lib/shared/tenants";
import { featuresComputedAt } from "@/lib/engine/derive";
import { hasSyntheticData } from "@/lib/engine/synthetic";
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
  /* แถบเดโมขึ้นตามข้อมูลจริงของบัญชี ไม่ใช่ตามสวิตช์เครื่องมือเดโม (ดู lib/engine/synthetic.ts) */
  const synthetic = await hasSyntheticData(tenantId);
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
          tenants={CONSOLE_PROFILES.filter((t) => allowed.includes(t.id)).map((t) => ({
            id: t.id,
            name: t.name,
            industry: t.industry,
          }))}
          switchAction={switchTenantAction}
          baseLabel={profile.vocab.th.base}
          personLabel={profile.vocab.th.person}
          userEmail={user?.email}
          signOutAction={signOutAction}
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
          {synthetic && (
            <div className="c-demobar">
              <span>
                <strong>เดโม</strong> · ข้อมูลสังเคราะห์จากธุรกิจไทย 4 รูปแบบ
              </span>
              <span className="c-demobar__sep" aria-hidden />
              <span>การอนุมัติและส่งทำงานครบ แต่ไม่มีข้อความออกจากระบบจริง</span>
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
