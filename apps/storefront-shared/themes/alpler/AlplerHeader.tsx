import Link from "next/link";
import { StorefrontNavigationItems } from "@celebix/storefront-design-ui";
import type { PublicStorefront, PublicStorefrontDesign } from "@celebix/saas-contracts";

import { StoreUtilities } from "../../components/StoreUtilities";
import { categoryPath, productIndexPath, localizeStorefrontPath } from "@/lib/storefront-routes.ts";
import { SioraIcon } from "../siora/SioraIcon";
import { SioraMobileShell } from "../siora/SioraMobileShell";

export function AlplerHeader({ storefront, design }: Readonly<{ storefront: PublicStorefront; design: PublicStorefrontDesign }>) {
  const { presentation, locale } = storefront;
  const logo = design.publicationVersion > 1 ? (design.brand.logo ?? presentation.logo) : presentation.logo;
  const navigation = presentation.schemaVersion === 1 ? { items: [] } : presentation.navigation;
  const visual = presentation.schemaVersion === 1 ? null : presentation.visual;
  const headerWidth = presentation.schemaVersion === 3 || presentation.schemaVersion === 4 ? presentation.visual.headerWidth : "wide";
  const headerLayout = presentation.schemaVersion === 3 || presentation.schemaVersion === 4 ? presentation.visual.headerLayout : "menu_logo_actions";

  const firstSection = presentation.schemaVersion === 1 ? null : presentation.sections[0];
  const heroAvailable = design.hero.enabled && design.hero.slides.some((slide) => slide.desktopImage || slide.mobileImage)
    || presentation.hero.enabled && Boolean(presentation.hero.image)
    || firstSection?.kind === "hero" && firstSection.slides.some((slide) => slide.desktopImage || slide.mobileImage)
    || firstSection?.kind === "banner" && firstSection.slides.some((slide) => slide.enabled && (slide.desktopImage || slide.mobileImage));

  return <header className="alpler-header" data-storefront-header-bar data-header-overlay-available={heroAvailable ? "true" : "false"} data-header-style={visual?.headerStyle ?? "solid"} data-header-width={headerWidth} data-header-layout={headerLayout}>
    <div className="alpler-header-bar" data-storefront-header-container>
      <Link className="alpler-header-discover" href={productIndexPath(locale)} prefetch={false}>Ürünleri keşfet <SioraIcon name="arrow" /></Link>
      <nav className="alpler-desktop-navigation" aria-label="Ana menü">
        <Link href="/" prefetch={false}>Ana Sayfa</Link>
        <Link href={productIndexPath(locale)} prefetch={false}>Tüm Ürünler</Link>
        <StorefrontNavigationItems
          items={navigation.items}
          desktopDisclosure
          categoryHref={(slug) => categoryPath(locale, slug)}
          resolveHref={(item) => item.path ? localizeStorefrontPath(item.path, locale) : categoryPath(locale, item.slug)}
          renderLink={(href, content, className) => <Link href={href} className={className} prefetch={false}>{content}</Link>}
          classes={{ root: "alpler-navigation-category", summary: "alpler-navigation-summary", panel: "alpler-navigation-panel", links: "alpler-navigation-links", featured: "alpler-navigation-featured", branch: "alpler-navigation-branch" }}
        />
      </nav>
      <SioraMobileShell storefrontId={storefront.id} locale={locale} displayName={presentation.displayName} navigation={navigation} variant="sports" />
      <Link className="alpler-wordmark" data-storefront-wordmark href="/" prefetch={false} aria-label={`${presentation.displayName} ana sayfa`}>
        {logo ? <img src={logo.url} alt={logo.altText || presentation.displayName} width={180} height={48} /> : <span>{presentation.displayName}</span>}
      </Link>
      <div className="alpler-header-utilities" data-storefront-header-actions><StoreUtilities /></div>
      <Link className="alpler-header-account" href="/account" prefetch={false} aria-label="Hesabım"><SioraIcon name="account" /></Link>
    </div>
  </header>;
}
