import type { ReactNode } from "react";
import Link from "next/link";
import { StorefrontNavigationItems } from "@celebix/storefront-design-ui";
import type { PublicStorefront, PublicStorefrontDesign } from "@celebix/saas-contracts";
import { categoryPath, productIndexPath, localizeStorefrontPath } from "../../lib/storefront-routes.ts";
import { SioraIcon } from "./SioraIcon";

export function SioraHeaderContent({ storefront, design, search, actions, mobileMenu }: Readonly<{ storefront: PublicStorefront; design: PublicStorefrontDesign; search: ReactNode; actions: ReactNode; mobileMenu: ReactNode }>) {
 const { presentation, locale } = storefront;
 const logo = design.publicationVersion > 1 ? (design.brand.logo ?? presentation.logo) : presentation.logo;
 const navigation = presentation.schemaVersion === 1 ? { items: [] } : presentation.navigation;
 return <>
    <div className="siora-header-bar" data-storefront-header-container>
      {search}
      {mobileMenu}
      <Link className="siora-wordmark" data-storefront-wordmark href="/" prefetch={false} aria-label={`${presentation.displayName} ana sayfa`}>
        {logo ? <img src={logo.url} alt={logo.altText || presentation.displayName} width={180} height={90} /> : <span>{presentation.displayName}</span>}
      </Link>
      {actions}
      <Link className="siora-header-account" href="/account" prefetch={false} aria-label="Hesabım"><SioraIcon name="account" /></Link>
    </div>
    <div className="siora-header-navigation-row">
      <nav className="siora-desktop-navigation" aria-label="Ana menü">
        <Link href="/" prefetch={false}>Ana Sayfa</Link>
        <Link href={productIndexPath(locale)} prefetch={false}>Tüm Ürünler</Link>
        <StorefrontNavigationItems
          items={navigation.items}
          desktopDisclosure
          categoryHref={(slug) => categoryPath(locale, slug)}
          resolveHref={(item) => item.path ? localizeStorefrontPath(item.path, locale) : categoryPath(locale, item.slug)}
          renderLink={(href, content, className) => <Link href={href} className={className} prefetch={false}>{content}</Link>}
          classes={{ root: "siora-navigation-category", summary: "siora-navigation-summary", panel: "siora-navigation-panel", links: "siora-navigation-links", featured: "siora-navigation-featured", branch: "siora-navigation-branch" }}
        />
      </nav>
    </div>
 </>;
}
