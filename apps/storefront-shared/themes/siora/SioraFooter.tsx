import Link from "next/link";
import type { ReactNode } from "react";
import type { PublicDesignMedia, PublicStarterThemePresentationV3, PublicStarterThemePresentationV4, PublicStorefront } from "@celebix/saas-contracts";
import { RetailFooter } from "../../components/RetailFooter";
import { localizeStorefrontPath } from "../../lib/storefront-routes.ts";

export function SioraFooter({ storefront, presentation, groups, logo, checkout = false, signature, renderNewsletter, prefetch }: Readonly<{
  storefront: PublicStorefront;
  presentation: PublicStarterThemePresentationV3 | PublicStarterThemePresentationV4;
  groups: PublicStarterThemePresentationV3["footer"]["groups"];
  logo?: PublicDesignMedia;
  checkout?: boolean;
  signature?: ReactNode;
  renderNewsletter?: (newsletter: PublicStarterThemePresentationV3["footer"]["newsletter"]) => ReactNode;
  prefetch?: boolean;
}>) {
  if (checkout) return <footer className="siora-checkout-footer store-container"><span>© {new Date().getUTCFullYear()} {presentation.displayName}</span><nav aria-label="Ödeme bilgileri">{groups.flatMap(group => group.links).filter(link => link.destination.startsWith("/policies/")).map(link => <Link prefetch={prefetch} href={localizeStorefrontPath(link.destination, storefront.locale)} key={`${link.destination}-${link.label}`}>{link.label}</Link>)}</nav>{signature}</footer>;
  return <RetailFooter storefront={storefront} presentation={presentation} groups={groups} logo={logo} signature={signature} renderNewsletter={renderNewsletter} />;
}
