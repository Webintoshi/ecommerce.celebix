import Link from "next/link";
import { StorefrontNavigationItems } from "@celebix/storefront-design-ui";
import type { PublicStorefront, PublicStorefrontDesign } from "@celebix/saas-contracts";

import { StoreUtilities } from "../../components/StoreUtilities";
import { categoryPath, productIndexPath, localizeStorefrontPath } from "@/lib/storefront-routes.ts";
import { SioraIcon } from "./SioraIcon";
import { SioraMobileShell } from "./SioraMobileShell";

export function SioraHeader({ storefront, design }: Readonly<{ storefront: PublicStorefront; design: PublicStorefrontDesign }>) {
  const { presentation, locale } = storefront;
  const logo = design.publicationVersion > 1 ? (design.brand.logo ?? presentation.logo) : presentation.logo;
  const navigation = presentation.schemaVersion === 1 ? { items: [] } : presentation.navigation;
  const visual = presentation.schemaVersion === 1 ? null : presentation.visual;
  const headerWidth = presentation.schemaVersion === 3 || presentation.schemaVersion === 4 ? presentation.visual.headerWidth : "wide";
  const headerLayout = presentation.schemaVersion === 3 || presentation.schemaVersion === 4 ? presentation.visual.headerLayout : "menu_logo_actions";

  return <header className="siora-header" data-storefront-header-bar data-header-style={visual?.headerStyle ?? "solid"} data-header-width={headerWidth} data-header-layout={headerLayout}>
    <div className="siora-header-bar" data-storefront-header-container>
      <Link className="siora-header-discover" href={productIndexPath(locale)} prefetch={false}>Koleksiyonu keşfet <SioraIcon name="arrow" /></Link>
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
      <SioraMobileShell storefrontId={storefront.id} locale={locale} displayName={presentation.displayName} navigation={navigation} />
      <Link className="siora-wordmark" data-storefront-wordmark href="/" prefetch={false} aria-label={`${presentation.displayName} ana sayfa`}>
        {logo ? <img src={logo.url} alt={logo.altText || presentation.displayName} width={180} height={48} /> : <span>{presentation.displayName}</span>}
      </Link>
      <div className="siora-header-utilities" data-storefront-header-actions><StoreUtilities /></div>
      <Link className="siora-header-account" href="/account" prefetch={false} aria-label="Hesabım"><SioraIcon name="account" /></Link>
    </div>
  </header>;
}
