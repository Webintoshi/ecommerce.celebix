import type { ReactNode } from "react";
import type { PublicDesignMedia, PublicStarterFooter, PublicStorefront } from "@celebix/saas-contracts";
import { RetailFooter } from "../../components/RetailFooter";

export function LilyumFooter({ storefront, logo, groups, signature, renderNewsletter }: {
  storefront: PublicStorefront;
  logo?: PublicDesignMedia;
  groups: PublicStarterFooter["groups"];
  signature: ReactNode;
  renderNewsletter?: (newsletter: PublicStarterFooter["newsletter"]) => ReactNode;
  prefetch?: boolean;
}) {
  const p = storefront.presentation;
  const footer = p.schemaVersion === 3 || p.schemaVersion === 4 ? p.footer : { social: [], tone: "dark" as const };
  return <RetailFooter storefront={storefront} presentation={{ ...p, footer: { ...footer, tone: "dark" } }} groups={groups} logo={logo} signature={signature} renderNewsletter={renderNewsletter} />;
}
