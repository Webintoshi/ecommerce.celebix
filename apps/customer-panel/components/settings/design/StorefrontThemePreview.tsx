import type { ReactNode } from "react";
import type { PublicStarterThemePresentationV4, PublicStorefront, PublicStorefrontDesign } from "@celebix/saas-contracts";
import { StorefrontNavigationItems } from "@celebix/storefront-design-ui";
import { CampaignHeaderBar } from "../../../../storefront-shared/components/CampaignHeaderBar";
import { StoreIcon } from "../../../../storefront-shared/components/StoreIcon";
import { LilyumHeaderBar } from "../../../../storefront-shared/themes/lilyum/LilyumHeaderBar";
import { LilyumIcon } from "../../../../storefront-shared/themes/lilyum/LilyumIcon";
import { lilyumAnnouncement } from "../../../../storefront-shared/themes/lilyum/lilyum-model.ts";
import { lilyumLogoFor } from "../../../../storefront-shared/themes/lilyum/logo.ts";
import { lilyumThemeFor } from "../../../../storefront-shared/themes/lilyum/theme.ts";
import { AlplerHeaderPresentation } from "../../../../storefront-shared/themes/alpler/AlplerHeaderPresentation";
import { alplerThemeFor } from "../../../../storefront-shared/themes/alpler/theme.ts";
import { SioraHeaderContent } from "../../../../storefront-shared/themes/siora/SioraHeaderContent";
import { SioraIcon } from "../../../../storefront-shared/themes/siora/SioraIcon";
import { sioraThemeFor } from "../../../../storefront-shared/themes/siora/theme.ts";
import { guzideThemeFor } from "../../../../storefront-shared/themes/guzide/theme.ts";
import { LilyumFooter } from "../../../../storefront-shared/themes/lilyum/LilyumFooter";
import { AlplerFooter } from "../../../../storefront-shared/themes/alpler/AlplerFooter";
import { SioraFooter } from "../../../../storefront-shared/themes/siora/SioraFooter";
import { GuzideFooter } from "../../../../storefront-shared/themes/guzide/GuzideFooter";
import { categoryPath, localizeStorefrontPath, productIndexPath } from "../../../../storefront-shared/lib/storefront-routes.ts";
import headerStyles from "../../../../storefront-shared/components/campaign-header.module.css";

export function previewVisualThemeFor(storefront: Pick<PublicStorefront, "id">) {
  return lilyumThemeFor(storefront) ?? alplerThemeFor(storefront) ?? sioraThemeFor(storefront) ?? guzideThemeFor(storefront);
}

export function previewStorefront(identity: Pick<PublicStorefront, "id" | "hostname" | "canonicalUrl" | "locale" | "currency">, presentation: PublicStarterThemePresentationV4): PublicStorefront {
  return { ...identity, schemaVersion: 2, name: presentation.displayName, slug: "design-preview", primaryHostname: identity.hostname, themeKey: "starter", presentation };
}

function PreviewUtilities() {
  return <nav className="store-utilities" aria-label="Mağaza araçları">{(["search", "heart", "account", "cart"] as const).map((icon, index) => <button type="button" disabled key={icon} aria-label={["Ara", "Favoriler", "Hesabım", "Sepet"][index]}><StoreIcon name={icon} /></button>)}</nav>;
}

function PreviewMobileTools() {
  return <div className="siora-mobile-shell"><div className="siora-header-mobile-tools"><button type="button" disabled aria-label="Menüyü aç"><SioraIcon name="menu" /></button><button type="button" disabled aria-label="Ürün ara"><SioraIcon name="search" /></button></div></div>;
}

function previewLogo(storefront: PublicStorefront, design: PublicStorefrontDesign) {
  const logo = lilyumLogoFor(storefront, design.brand.logo ?? storefront.presentation.logo);
  return logo?.url.startsWith("/") ? { ...logo, url: new URL(logo.url, storefront.canonicalUrl).href } : logo;
}

export function ThemePreviewHeader({ storefront, design }: Readonly<{ storefront: PublicStorefront; design: PublicStorefrontDesign }>) {
  const presentation = storefront.presentation;
  if (presentation.schemaVersion !== 4) return null;
  const logo = previewLogo(storefront, design);
  const visual = presentation.visual;
  if (lilyumThemeFor(storefront)) return <LilyumHeaderBar displayName={presentation.displayName} logo={logo} locale={storefront.locale} navigation={presentation.navigation.items} announcement={lilyumAnnouncement(presentation, design)} prefetch={false}
    cartButton={<button type="button" className="lf-desktop-tool" aria-label="Sepet" disabled><LilyumIcon name="bag" /></button>}
    menuButton={<button type="button" className="lf-menu-trigger" aria-label="Menüyü aç" disabled><LilyumIcon name="menu" /></button>} />;
  if (alplerThemeFor(storefront)) return <AlplerHeaderPresentation storefront={storefront} design={design} utilities={<PreviewUtilities />} mobileMenu={<PreviewMobileTools />} />;
  if (sioraThemeFor(storefront)) return <header className="siora-header" data-storefront-header-bar data-header-style={visual.headerStyle} data-header-width={visual.headerWidth} data-header-layout={visual.headerLayout} data-siora-home="true" data-siora-scrolled="false" data-siora-compact="false">
    <SioraHeaderContent storefront={storefront} design={design}
      search={<form className="siora-header-search store-live-search" role="search" onSubmit={event => event.preventDefault()}><button type="submit" disabled aria-label="Ürün ara"><SioraIcon name="search" /></button><input type="search" placeholder="Ara" readOnly aria-label="Ürün adı veya anahtar kelime" /></form>}
      mobileMenu={<PreviewMobileTools />}
      actions={<nav className="siora-header-actions" data-storefront-header-actions aria-label="Hesap ve sepet"><a href="/account" aria-label="Hesabım"><SioraIcon name="account" /><span>Hesabım</span></a><button type="button" disabled aria-label="Sepetim"><SioraIcon name="bag" /><span>Sepetim</span></button></nav>} />
  </header>;
  return <header className={headerStyles.header} data-header-style={visual.headerStyle} data-header-width={visual.headerWidth} data-header-layout={visual.headerLayout}>
    <CampaignHeaderBar displayName={presentation.displayName} logo={logo} prefetch={false}
      desktopNavigation={<nav className={headerStyles.desktopNav} aria-label="Ana menü"><a href="/">Ana Sayfa</a><a href={productIndexPath(storefront.locale)}>Ürünler</a><StorefrontNavigationItems items={presentation.navigation.items} categoryHref={slug => categoryPath(storefront.locale, slug)} resolveHref={item => item.path ? localizeStorefrontPath(item.path, storefront.locale) : categoryPath(storefront.locale, item.slug)} classes={{ root: headerStyles.megaTrigger, summary: headerStyles.megaTrigger, panel: headerStyles.mega, links: headerStyles.megaLinks, featured: headerStyles.featured, branch: headerStyles.megaBranch }} /></nav>}
      desktopSearch={guzideThemeFor(storefront) ? <button className="guzide-header-search-trigger" type="button" disabled aria-label="Ürünlerde ara"><StoreIcon name="search" /><span>Ürünlerde ara</span></button> : undefined}
      utilities={<PreviewUtilities />} menuButton={<button type="button" className={headerStyles.menuButton} disabled aria-label="Menüyü aç"><SioraIcon name="menu" /></button>} />
  </header>;
}

export function ThemePreviewFooter({ storefront, design, renderNewsletter }: Readonly<{ storefront: PublicStorefront; design: PublicStorefrontDesign; renderNewsletter: () => ReactNode }>) {
  const presentation = storefront.presentation;
  if (presentation.schemaVersion !== 4) return null;
  const logo = previewLogo(storefront, design);
  const props = { storefront, presentation, groups: presentation.footer.groups, logo: logo ?? undefined, renderNewsletter, prefetch: false };
  if (lilyumThemeFor(storefront)) return <LilyumFooter {...props} signature={null} />;
  if (alplerThemeFor(storefront)) return <AlplerFooter {...props} />;
  if (sioraThemeFor(storefront)) return <SioraFooter {...props} />;
  if (guzideThemeFor(storefront)) return <GuzideFooter {...props} />;
  return null;
}
