import type { ReactNode } from "react";
import type { PublicStarterThemePresentationV3, PublicStarterThemePresentationV4, PublicStorefront } from "@celebix/saas-contracts";
import { RetailFooter } from "../../components/RetailFooter";

export type GuzideFooterProps = Readonly<{
  groups: PublicStarterThemePresentationV3["footer"]["groups"];
  presentation: PublicStarterThemePresentationV3 | PublicStarterThemePresentationV4;
  storefront: Pick<PublicStorefront, "canonicalUrl" | "hostname" | "locale" | "currency">;
  logo?: Readonly<{ url: string; altText: string; width?: number; height?: number }> | null;
  renderNewsletter?: (newsletter: PublicStarterThemePresentationV3["footer"]["newsletter"]) => ReactNode;
  prefetch?: boolean;
  signature?: ReactNode;
}>;

export function GuzideFooter({ presentation, storefront, groups, logo, signature, renderNewsletter }: GuzideFooterProps) {
  return <RetailFooter storefront={storefront} presentation={{ ...presentation, footer: { ...presentation.footer, tone: "light" } }} groups={groups} logo={logo ?? presentation.logo} signature={signature} renderNewsletter={renderNewsletter} />;
}
