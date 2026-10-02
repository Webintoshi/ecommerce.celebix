import Link from "next/link";
import type { ReactNode } from "react";
import type { PublicDesignMedia, PublicStarterThemePresentationV3, PublicStorefront } from "@celebix/saas-contracts";

import { localizeStorefrontPath } from "../../lib/storefront-routes.ts";
import { alplerLogoDimensions } from "../../themes/alpler/logo.ts";

export function CheckoutHeader({ storefront, logo }: Readonly<{ storefront: PublicStorefront; logo?: PublicDesignMedia }>) {
  const dimensions = alplerLogoDimensions(storefront, logo);
  return <header className="shared-checkout-header" data-logo-aspect={dimensions ? "emblem" : undefined}>
    <div className="shared-checkout-container">
      <Link className="shared-checkout-brand" href={localizeStorefrontPath("/", storefront.locale)} aria-label={`${storefront.presentation.displayName} ana sayfa`}>
        {logo ? <img src={logo.url} alt={logo.altText || storefront.presentation.displayName} width={dimensions?.width ?? 180} height={dimensions?.height ?? 64} /> : storefront.presentation.displayName}
      </Link>
      <span className="shared-checkout-secure"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" /></svg>Güvenli ödeme</span>
      <Link className="shared-checkout-cart-link" href={localizeStorefrontPath("/cart", storefront.locale)} aria-label="Sepete dön"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 4 2 1 2 11h12l2-8H6" /><circle cx="9" cy="20" r="1" /><circle cx="18" cy="20" r="1" /></svg></Link>
    </div>
  </header>;
}

export function CheckoutFooter({ groups, storefront, signature }: Readonly<{ groups: PublicStarterThemePresentationV3["footer"]["groups"]; storefront: PublicStorefront; signature?: ReactNode }>) {
  const policies = [...new Map(groups.flatMap(group => group.links).filter(link => link.destination.startsWith("/policies/")).map(link => [link.destination, link])).values()];
  return <footer className="shared-checkout-footer">
    <div className="shared-checkout-container">
      {policies.length ? <nav aria-label="Alışveriş koşulları">{policies.map(link => <Link key={link.destination} href={localizeStorefrontPath(link.destination, storefront.locale)}>{link.label}</Link>)}</nav> : null}
      <p>© {new Date().getUTCFullYear()} {storefront.presentation.displayName}{storefront.presentation.supportEmail ? <> · <a href={`mailto:${storefront.presentation.supportEmail}`}>{storefront.presentation.supportEmail}</a></> : null}</p>
    </div>
    {signature}
  </footer>;
}
