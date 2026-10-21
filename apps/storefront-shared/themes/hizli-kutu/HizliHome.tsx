import Link from "next/link";
import type { CampaignHomeProjection } from "@celebix/saas-data";
import type { PublicStarterHomeSection, PublicStorefront, PublicStorefrontDesign } from "@celebix/saas-contracts";
import { HomepageSectionContainer, StorefrontDesignRenderer } from "@celebix/storefront-design-ui";
import { StorefrontFrame } from "../../components/StorefrontFrame";
import { CampaignSectionContent } from "../../components/CampaignSectionContent";
import { CampaignProductRow } from "../../components/CampaignProductRow";
import { composeCampaignHomeSections, campaignHomeSectionKey } from "../../components/campaign-home-sections";
import { localizePublicStorefrontDesign, localizeStorefrontPath, productIndexPath } from "../../lib/storefront-routes.ts";
import { HizliIcon } from "./HizliIcon";

type Banner = Extract<PublicStarterHomeSection, { kind: "banner" }>;

function Placeholder({ className = "" }: { className?: string }) { return <div className={`hk-placeholder ${className}`}>Placeholder</div>; }

function Banner({ section, locale, first }: { section: Banner; locale: string; first: boolean }) {
  const slide = section.slides.find(slide => slide.enabled);
  if (!slide) return null;
  const image = slide.desktopImage ?? slide.mobileImage;
  const destination = slide.destination ? localizeStorefrontPath(slide.destination, locale) : null;
  const media = image ? <picture>{slide.mobileImage ? <source media="(max-width: 760px)" srcSet={slide.mobileImage.url} /> : null}<img src={image.url} alt={image.altText} width={image.width ?? 1600} height={image.height ?? 900} loading={first ? "eager" : "lazy"} fetchPriority={first ? "high" : "auto"} decoding="async" /></picture> : <Placeholder />;
  const Heading = first ? "h1" : "h2";
  const content = section.presentation === "image_only" ? <section className="hk-image-banner" aria-label={slide.headline || "Banner"}>{destination ? <Link href={destination}>{media}</Link> : media}</section> : <section className="hk-hero">
    <div className="hk-hero-copy"><Heading>{slide.headline}</Heading>{slide.body ? <p>{slide.body}</p> : null}{destination ? <Link className="hk-button" href={destination}>Ürünleri keşfet<HizliIcon name="arrow" /></Link> : null}</div>
    <div className="hk-hero-media">{media}</div>
  </section>;
  return section.style ? <HomepageSectionContainer style={section.style}>{content}</HomepageSectionContainer> : content;
}

export function HizliHome({ storefront, design, projection }: { storefront: PublicStorefront; design: PublicStorefrontDesign; projection?: CampaignHomeProjection | null }) {
  const presentation = projection?.presentation ?? storefront.presentation;
  const effective = { ...storefront, presentation };
  const catalog = productIndexPath(storefront.locale);
  const customized = design.publicationVersion > 1;
  const designHero = customized && design.hero.enabled && design.hero.slides.length > 0;
  const sections = presentation.schemaVersion === 1 ? [] : composeCampaignHomeSections(presentation, designHero);
  const rows = projection?.productRows ?? [];
  const starter = !customized && !sections.some(section => section.kind === "hero" || section.kind === "banner");
  const content = <div className="hk-home">
    {starter ? <section className="hk-hero"><div className="hk-hero-copy"><h1>İyi bir paketle<br />başlar.</h1><p>İşletmenize uygun ambalajları keşfedin.</p><Link className="hk-button" href={catalog}>Ürünleri keşfet<HizliIcon name="arrow" /></Link></div><div className="hk-hero-media"><Placeholder /></div></section> : null}
    {starter && !sections.some(section => section.kind === "category_grid") ? <section className="hk-container hk-section"><h2>İhtiyacınıza göre keşfedin</h2><div className="hk-placeholder-categories">{[1, 2, 3, 4].map(key => <Placeholder key={key} />)}</div></section> : null}
    {presentation.schemaVersion !== 1 ? sections.map((section, index) => {
      const key = campaignHomeSectionKey(section, index);
      if (section.kind === "banner" && section.layout === "single" && !section.slides.some(slide => slide.enabled && slide.hotspot)) return <Banner key={key} section={section} locale={storefront.locale} first={index === 0} />;
      if (section.kind === "product_row" && !rows.find(row => row.key === section.key)?.items.length) return <section className="hk-container hk-section hk-products-empty" key={key}><div className="hk-section-heading"><h2>{section.heading}</h2><Link href={catalog}>Tüm ürünler<HizliIcon name="arrow" /></Link></div><p>Ürünlerimiz yakında burada.</p></section>;
      return <CampaignSectionContent key={key} section={section} presentation={presentation} productRows={rows} locale={storefront.locale} priority={index === 0} renderProductRow={input => <CampaignProductRow {...input} />} />;
    }) : null}
    {starter ? <section className="hk-container hk-section hk-process"><h2>Ambalajınızı kolayca seçin</h2><ol>{[
      ["Ürününüzü bulun", "İhtiyacınıza uygun ambalajları keşfedin."],
      ["Ölçü ve paketi seçin", "Ürünün seçeneklerini inceleyin."],
      ["Siparişinizi tamamlayın", "Seçimlerinizi sepetinizde kontrol edin."],
    ].map(([heading, body], index) => <li key={heading}><span>{index + 1}</span><div><h3>{heading}</h3><p>{body}</p></div></li>)}</ol></section> : null}
  </div>;
  // The persistent header owns the announcement on every route.
  const homeDesign = { ...design, announcement: { ...design.announcement, enabled: false } };
  return <StorefrontFrame storefront={effective} design={design}>{customized ? <StorefrontDesignRenderer design={localizePublicStorefrontDesign(homeDesign, storefront.locale)} storeName={presentation.displayName} now={new Date()} showHeader={false} presentation={presentation.schemaVersion === 1 ? undefined : { ...presentation, announcement: undefined }}>{content}</StorefrontDesignRenderer> : content}</StorefrontFrame>;
}
