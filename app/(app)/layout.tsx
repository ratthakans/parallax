import { activeTenantId } from "@/app/(app)/tenant";
import type { Metadata } from "next";
import Link from "next/link";
import "./console.css";
import { cookies } from "next/headers";
import { AppBar } from "@/components/console/appbar";
import { setThemeAction } from "./ui-actions";
import { demoToolsEnabled } from "@/lib/shared/demo-tools";
import { ensureReady } from "@/lib/engine/bootstrap";
import { getTenant } from "@/lib/engine/match";

import { CONSOLE_PROFILES, isSignupTenantId, profileFor } from "@/lib/shared/tenants";
import { consoleGate, signupInfo } from "@/lib/engine/signup/gate";
import { membershipEnforced } from "@/lib/engine/access";
import { hasSyntheticData } from "@/lib/engine/synthetic";
import { switchTenantAction } from "./actions";
import { signOutAction } from "@/app/login/actions";
import { myTenants } from "./tenant";
import { redirect } from "next/navigation";
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
  const theme = (await cookies()).get("parallax_theme")?.value === "dark" ? "dark" : "light";
  /* แถบเดโมขึ้นตามข้อมูลจริงของบัญชี ไม่ใช่ตามสวิตช์เครื่องมือเดโม (ดู lib/engine/synthetic.ts) */
  const synthetic = await hasSyntheticData(tenantId);
  const allowed = await myTenants();
  const user = await currentUser();
  /* รหัสผ่านถูกแต่ยังไม่ได้ใส่รหัสจากแอป — ยังล็อกอินไม่ครบ */
  if (user?.mfa === "pending") redirect("/login/mfa");
  /* บัญชีสมัครเอง (S9): ต้องตั้งค่าครบ (รวมยืนยันสองชั้นในรอบนี้) และยังอยู่ในช่วงทดลองหรือชำระแล้ว
     หน้า /onboarding กับ /upgrade อยู่นอกกลุ่มนี้โดยตั้งใจ — อยู่ในนี้แล้วจะ redirect วนตัวเอง */
  const signup = await signupInfo(tenantId, membershipEnforced() ? (user?.mfa ?? "none") : "verified");
  const gateTo = consoleGate(signup);
  if (gateTo) redirect(gateTo);
  const currentName = tenant?.name ?? profile.name;

  return (
    <div className="console" data-theme={theme}>
      <a href="#console-main" className="c-skip c-btn c-btn-primary">
        ข้ามไปยังเนื้อหา
      </a>
      <div className="c-shell">
        <AppBar
          tenantId={tenantId}
          tenantName={currentName}
          industry={profile.industry}
          tenants={[
            ...CONSOLE_PROFILES.filter((t) => allowed.includes(t.id)),
            ...allowed.filter(isSignupTenantId).map(profileFor),
          ].map((t) => ({
            id: t.id,
            name: t.id === tenantId ? currentName : t.name,
            industry: t.industry,
          }))}
          switchAction={switchTenantAction}
          userEmail={user?.email}
          signOutAction={signOutAction}
          theme={theme}
          setThemeAction={setThemeAction}
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
          {synthetic && !signup.selfSignup && (
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
          {signup.selfSignup && signup.billingState !== "paid" && (
            <div className="c-demobar">
              <span>
                <strong>ทดลองใช้</strong> · เหลือ {signup.daysLeft} วัน · ข้อมูลสมมุติเท่านั้น
              </span>
              <span className="c-demobar__sep" aria-hidden />
              <span>AI ปิดระหว่างทดลอง</span>
              <Link href="/upgrade" className="c-demobar__back">
                อัปเกรด →
              </Link>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
