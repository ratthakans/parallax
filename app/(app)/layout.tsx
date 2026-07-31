import type { Metadata } from "next";
import "./console.css";
import { ConsoleNav } from "@/components/console/nav";
import { ensureReady } from "@/lib/bootstrap";
import { getTenant } from "@/lib/match";
import { getActiveTenantId } from "@/lib/active-tenant";
import { planById } from "@/lib/plans";
import { TENANT_PROFILES, profileFor } from "@/lib/tenants";
import { featuresComputedAt } from "@/lib/derive";
import { switchTenantAction } from "./actions";

export const metadata: Metadata = {
  title: "Console",
  robots: { index: false, follow: false },
};

export default async function ConsoleLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await ensureReady();
  const tenantId = await getActiveTenantId();
  const tenant = getTenant(tenantId);
  const profile = profileFor(tenantId);
  const computedAt = featuresComputedAt(tenantId);

  return (
    <div className="console">
      <a href="#console-main" className="c-skip c-btn c-btn-primary">
        Skip to content
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
          {children}
        </main>
      </div>
    </div>
  );
}
