import type { ReactNode } from "react";
import type { PublicDesignMedia, PublicStarterThemePresentationV3, PublicStorefront } from "@celebix/saas-contracts";
import { RetailFooter } from "../../components/RetailFooter";

export function HizliFooter({ storefront, logo, groups, signature }: { storefront: PublicStorefront; logo?: PublicDesignMedia; groups: PublicStarterThemePresentationV3["footer"]["groups"]; signature: ReactNode }) {
  const p = storefront.presentation;
  const footer = p.schemaVersion === 3 || p.schemaVersion === 4 ? p.footer : { tone: "dark" as const, social: [] };
  return <RetailFooter storefront={storefront} presentation={{ ...p, footer }} groups={groups} logo={logo} signature={signature} />;
}
