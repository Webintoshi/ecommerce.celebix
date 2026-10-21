import Link from "next/link";
import type { ReactNode } from "react";
import type { ProductCardContentProduct } from "../../components/ProductCardContent";
import type { PublicStarterHomeSection, PublicStarterThemePresentation, PublicStarterThemePresentationV2, PublicStarterThemePresentationV3, PublicStarterThemePresentationV4, PublicStorefront, PublicStorefrontDesign } from "@celebix/saas-contracts";
import { CampaignSectionContent } from "../../components/CampaignSectionContent";
import { isStorefrontPromotionActive } from "@celebix/storefront-design-ui";
import { formatTry } from "../../lib/format.ts";
import { categoryPath, localizeStorefrontPath, productIndexPath, productPath } from "../../lib/storefront-routes.ts";
import { LilyumIcon } from "./LilyumIcon";
import { LILYUM_COPY, lilyumHomeModel } from "./lilyum-model.ts";

type CategoryItem = Extract<PublicStarterHomeSection, { kind: "category_grid" }>["items"][number];
function LilyumCollectionTiles({ items, locale, className = "", prefetch }: { items: readonly CategoryItem[]; locale: string; className?: string; prefetch?: boolean }) {
  if (!items.length) return null;
  return <div className={`lf-collections ${className}`}>{items.map(item => <Link prefetch={prefetch} href={categoryPath(locale, item.slug)} key={item.slug} className="lf-collection">
    <img src={item.image.url} alt={item.image.altText || item.name} width={item.image.width ?? 800} height={item.image.height ?? 600} loading="lazy" decoding="async" />
    <span><strong>{item.name}</strong><small>Keşfet<LilyumIcon name="arrow" /></small></span>
  </Link>)}</div>;
}

export function LilyumProductCardsContent<Product extends ProductCardContentProduct>({ products, locale, renderFavorite, prefetch }: { products: readonly Product[]; locale: string; renderFavorite: (product: Product) => ReactNode; prefetch?: boolean }) {
  return <div className="lf-products">{products.map(product => <article className="lf-product" key={product.id}>
    <Link prefetch={prefetch} href={productPath(locale, product.slug)} className="lf-product-photo" aria-label={product.title}>
      {product.media[0] ? <img src={product.media[0].url} alt={product.media[0].altText || product.title} width={product.media[0].width ?? 540} height={product.media[0].height ?? 540} loading="lazy" decoding="async" /> : <span>Görsel yakında</span>}
    </Link>
    {renderFavorite(product)}
    <div className="lf-product-copy"><Link prefetch={prefetch} href={productPath(locale, product.slug)}><h3>{product.title}</h3></Link><div className="lf-product-price">{product.priceCents !== null ? <strong>{formatTry(product.priceCents)}</strong> : null}<Link prefetch={prefetch} href={productPath(locale, product.slug)} aria-label={`${product.title} incele`}>İncele<LilyumIcon name="arrow" /></Link></div></div>
  </article>)}</div>;
}

export function LilyumHomeContent<Product extends ProductCardContentProduct>({ storefront, design, projection, renderProductCards, renderProductRow, renderSection = (_section, content) => content, prefetch, previewMode, assetBaseUrl, now = new Date() }: { storefront: PublicStorefront; design: PublicStorefrontDesign; projection: Readonly<{ presentation: PublicStarterThemePresentation; productRows: readonly Readonly<{ key: string; items: readonly Product[] }>[] }>; renderProductCards: (products: readonly Product[]) => ReactNode; renderProductRow: (input: Readonly<{ section: Extract<PublicStarterHomeSection, { kind: "product_row" }>; products: readonly Product[]; presentation: PublicStarterThemePresentationV2 | PublicStarterThemePresentationV3 | PublicStarterThemePresentationV4; locale: string }>) => ReactNode; renderSection?: (section: PublicStarterHomeSection | undefined, content: ReactNode) => ReactNode; prefetch?: boolean; previewMode?: "desktop" | "mobile"; assetBaseUrl?: string; now?: Date }) {
  const presentation = projection.presentation;
  const { hero, multiHeroSection, categories, productRows, story } = lilyumHomeModel(presentation, design, projection);
  const locale = storefront.locale;
  const catalog = productIndexPath(locale);
  const assetUrl = (url: string) => assetBaseUrl && url.startsWith("/") ? new URL(url, assetBaseUrl).href : url;
  const primaryBanner = presentation.schemaVersion === 1 ? undefined : presentation.sections.find(section => section.kind === "banner");
  const primaryHero = presentation.schemaVersion === 1 ? undefined : presentation.sections.find(section => section.kind === "hero");
  const remainingSections = presentation.schemaVersion === 1 ? [] : presentation.sections.filter(section => section !== primaryBanner && section !== primaryHero && !["category_grid", "product_row"].includes(section.kind));
  const remainingCategories = categories.flatMap(section => section.items.slice(2));
  return <div className="lf-home">
      {isStorefrontPromotionActive(design.promotion, now) ? <aside className="lf-promotion lf-container"><strong>{design.promotion.headline}</strong>{design.promotion.body ? <p>{design.promotion.body}</p> : null}{design.promotion.destination ? <Link prefetch={prefetch} href={localizeStorefrontPath(design.promotion.destination.path, locale)}>İncele<LilyumIcon name="arrow" /></Link> : null}</aside> : null}
      {renderSection(primaryBanner ?? primaryHero, multiHeroSection && presentation.schemaVersion !== 1 ? <CampaignSectionContent section={multiHeroSection} presentation={presentation} productRows={projection.productRows} locale={locale} priority renderProductRow={renderProductRow} prefetch={prefetch} previewMode={previewMode} /> : hero.enabled ? <section className="lf-hero" aria-labelledby="lf-hero-title">
        <picture className="lf-hero-media" data-mobile-image={previewMode && hero.mobileImage ? "true" : undefined}>{hero.mobileImage && !previewMode ? <source media="(max-width: 760px)" srcSet={hero.mobileImage} /> : null}<img src={assetUrl(previewMode === "mobile" ? hero.mobileImage ?? hero.image : hero.image)} alt="Pembe lilyum ve beyaz gerbera çiçek aranjmanı" width="2164" height="727" fetchPriority="high" /></picture>
        <div className="lf-container lf-hero-copy"><span className="lf-eyebrow">{hero.eyebrow}</span><h1 id="lf-hero-title">{hero.heading}</h1><p>{hero.body}</p><Link prefetch={prefetch} className="lf-button" href={localizeStorefrontPath(hero.destination || catalog, locale)}>{LILYUM_COPY.cta}<LilyumIcon name="arrow" /></Link></div>
      </section> : null)}
      <div className="lf-container lf-home-content">
        <section id="lilyum-delivery" className="lf-delivery" aria-label="Teslimat bilgisi">
          <LilyumIcon name="pin" /><div><h2>Nereye gönderelim?</h2><p>Ordu’da aynı gün çiçek teslimatı</p></div>
          <details className="lf-delivery-disclosure"><summary className="lf-delivery-info">Teslimat bilgisi<LilyumIcon name="arrow" /></summary><div className="lf-delivery-content"><strong>Teslimat bilgisi</strong><p>Ordu’da aynı gün taze çiçek teslimatı. Teslimat adresi ve güncel saat bilgisi için mağazayla iletişime geçebilirsiniz.</p>{story?.body ? <p>{story.body}</p> : null}{presentation.supportEmail ? <a href={`mailto:${presentation.supportEmail}`}>{presentation.supportEmail}</a> : null}</div></details>
          <a href={presentation.supportEmail ? `mailto:${presentation.supportEmail}` : "/pages/iletisim"} className="lf-button">Mağazayla iletişime geç<LilyumIcon name="arrow" /></a>
        </section>
        {categories.map((section, index) => renderSection(section, <section className="lf-collection-section" aria-labelledby={`lf-collections-${index}`} key={section.sectionId ?? index}>
          <div className="lf-section-heading"><h2 id={`lf-collections-${index}`}>{section.heading}</h2><Link prefetch={prefetch} href={catalog}>Tümünü gör<LilyumIcon name="arrow" /></Link></div>
          <LilyumCollectionTiles items={section.items.slice(0, 2)} locale={locale} prefetch={prefetch} />
        </section>))}
        {!productRows.length ? <LilyumCollectionTiles items={remainingCategories} locale={locale} prefetch={prefetch} /> : null}
        {productRows.map(({ section, heading, products }, index) => renderSection(section, <section className="lf-product-section" aria-labelledby={`lf-row-${section.key}`} key={section.key}>
          <div className="lf-section-heading"><h2 id={`lf-row-${section.key}`}>{heading}</h2><Link prefetch={prefetch} href={"categorySlug" in section && section.categorySlug ? categoryPath(locale, section.categorySlug) : catalog}>Tümünü incele<LilyumIcon name="arrow" /></Link></div>
          {renderProductCards(products)}
          {index === 0 ? <LilyumCollectionTiles items={remainingCategories} locale={locale} className="lf-more-collections" prefetch={prefetch} /> : null}
        </section>))}
        {presentation.schemaVersion !== 1 ? remainingSections.map((section, index) => renderSection(section, <CampaignSectionContent key={"sectionId" in section ? section.sectionId : `${section.kind}-${index}`} section={section} presentation={presentation} productRows={projection.productRows} locale={locale} priority={false} renderProductRow={renderProductRow} prefetch={prefetch} previewMode={previewMode} />)) : null}
      </div>
    </div>;
}
