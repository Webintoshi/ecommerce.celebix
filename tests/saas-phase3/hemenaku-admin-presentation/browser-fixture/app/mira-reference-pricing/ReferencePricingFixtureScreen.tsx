"use client";

import { ReferencePricingConsole } from "@/components/reference-pricing/ReferencePricingConsole";
import { VariantPricingPolicyControl } from "@/components/reference-pricing/VariantPricingPolicyControl";
import { PanelLayoutClient } from "@/components/panel/PanelLayoutClient";
import { PanelPageHeader, PanelPageShell } from "@/components/panel/PanelPageShell";

const VARIANT_ID = "40000000-0000-4000-8000-000000000001";
const MODEL = Object.freeze({
  analyticsAvailable: false,
  storeSlug: "fiyat-fixture-magazasi",
  membershipLabel: "Mağaza sahibi",
  planCode: "growth",
  planVersion: 3,
  entitlementStatus: "active" as const,
  storefrontHostname: "fixture.invalid",
  locale: "tr-TR",
});

export function ReferencePricingFixtureScreen({ view }: Readonly<{ view: string }>) {
  return <PanelLayoutClient model={MODEL}>
    {view === "references" || view === "readonly" ?
      <ReferencePricingConsole canRead canManage={view !== "readonly"} /> :
      <PanelPageShell>
        <PanelPageHeader title="Ürün fiyat yöntemi" description="İzole varyant fiyatlandırma görünümü." />
        <VariantPricingPolicyControl variantId={VARIANT_ID} variantVersion={4}
          fixedPriceCents={1000000} canManage={view !== "variant-readonly"}
          onSaved={() => undefined} onClose={() => undefined} />
      </PanelPageShell>}
  </PanelLayoutClient>;
}
