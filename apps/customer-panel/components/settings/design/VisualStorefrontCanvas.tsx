"use client";

import {
  StorefrontDesignRenderer,
  ProductDetailPreview,
  RepresentativeCartPreview,
  createPreviewStorefrontDesign,
  type StorefrontRendererSurface,
} from "@celebix/storefront-design-ui";
import type {
  PublicStarterHomeSection,
  PublicStarterThemePresentationV2,
  PublicStarterThemePresentationV3,
  PublicStarterThemePresentationV4,
  StarterFooterLinkConfig,
  StarterThemeSectionConfigV4,
  StorefrontDesignDestinationOption,
  StorefrontDesignDocument,
  StorefrontDesignMediaOption,
  HomepageSectionId,
  PublicStorefront,
} from "@celebix/saas-contracts";
import { normalizeProductDescriptionHtml } from "@celebix/platform-config/src/product-description-rich-text.ts";
import { normalizeStorefrontDesignDocumentV5 } from "@celebix/saas-contracts";
import { CampaignSectionContent } from "../../../../storefront-shared/components/CampaignSectionContent";
import { ProductCardContent } from "../../../../storefront-shared/components/ProductCardContent";
import { CampaignProductRowFrame } from "../../../../storefront-shared/components/CampaignProductRowFrame";
import { GuzideFooter } from "../../../../storefront-shared/themes/guzide/GuzideFooter";
import { guzideThemeFor } from "../../../../storefront-shared/themes/guzide/theme.ts";
import "../../../../storefront-shared/themes/guzide/guzide.css";
import { composeCampaignHomeSections } from "../../../../storefront-shared/components/campaign-home-sections";

import type { DesignCanvasSurface, DesignCanvasTrigger } from "./design-surface-model";
import { composeDraftCampaignProjection, type StorefrontDesignPreviewProduct, type StorefrontDesignPreviewResources } from "../../../lib/storefront-design-preview-model";
import styles from "../design-settings.module.css";
import { STARTER_FOOTER_POLICIES, STARTER_FOOTER_SYSTEM_LINKS } from "../starter-footer-options";
import { CategoryPlaceholderCards, ProductCards } from "../StarterThemePreviewScaffolds";

export type StorefrontPreviewIdentity = Pick<PublicStorefront, "id" | "hostname" | "canonicalUrl" | "locale" | "currency">;

interface VisualStorefrontCanvasProps {
  readonly design: StorefrontDesignDocument;
  readonly storeName: string;
  readonly storefront?: StorefrontPreviewIdentity;
  readonly publishedVersion: number;
  readonly publishedAt: string;
  readonly media: readonly StorefrontDesignMediaOption[];
  readonly destinations: readonly StorefrontDesignDestinationOption[];
  readonly previewResources?: StorefrontDesignPreviewResources;
  readonly previewProductId?: string;
  readonly onSelectPreviewProduct?: (productId: string) => void;
  readonly mode: "desktop" | "mobile";
  readonly now: Date;
  readonly selectedSurface?: DesignCanvasSurface;
  readonly selectedSectionId?: HomepageSectionId;
  readonly onSelectSection?: (sectionId: HomepageSectionId, trigger?: DesignCanvasTrigger) => void;
  readonly onInsertSection?: (index: number, trigger?: DesignCanvasTrigger) => void;
  readonly onSelectSurface: (surface: DesignCanvasSurface, trigger?: DesignCanvasTrigger) => void;
}

const RENDERER_SURFACES = new Set<DesignCanvasSurface>(["announcement", "brand", "navigation", "cart"]);

function rendererSurface(surface: DesignCanvasSurface | undefined): StorefrontRendererSurface | undefined {
  return surface && RENDERER_SURFACES.has(surface) ? surface as StorefrontRendererSurface : undefined;
}

function editorSurface(surface: StorefrontRendererSurface): DesignCanvasSurface {
  return surface === "hero" || surface === "promotion" ? "homepage" : surface as DesignCanvasSurface;
}

function SurfaceButton({ surface, label, selected, onSelect }: Readonly<{
  surface: DesignCanvasSurface;
  label: string;
  selected: boolean;
  onSelect: (surface: DesignCanvasSurface, trigger?: DesignCanvasTrigger) => void;
}>) {
  return <button
    type="button"
    className={styles.canvasSurfaceButton}
    data-design-surface={surface}
    aria-label={`${label} alanını düzenle`}
    aria-pressed={selected}
    onClick={(event) => onSelect(surface, event.currentTarget)}
  ><span>{label}</span></button>;
}

const SECTION_LABELS = Object.freeze({
  banner: "Banner",
  category_grid: "Kategori vitrini",
  product_row: "Ürün satırı",
  split_campaign: "Kampanya panelleri",
  brand_story: "Marka hikâyesi",
  value_propositions: "Değer önerileri",
  testimonials: "Müşteri yorumları",
} satisfies Readonly<Record<StarterThemeSectionConfigV4["kind"], string>>);

function unresolvedResource(kind: string, id: string) {
  return `${kind} kimliği: ${id} (yayın vitrininin sunucu tarafında çözümlenir)`;
}

function sectionHeading(section: StarterThemeSectionConfigV4): string {
  if (section.kind === "banner") return section.slides[0]?.headline ?? SECTION_LABELS.banner;
  if (section.kind === "split_campaign") return section.panels[0]?.heading ?? SECTION_LABELS.split_campaign;
  if (section.kind === "value_propositions") return section.items[0]?.heading ?? SECTION_LABELS.value_propositions;
  return section.heading;
}

function HomepageSectionConfiguration({ section, destinations }: Readonly<{
  section: StarterThemeSectionConfigV4;
  destinations: readonly StorefrontDesignDestinationOption[];
}>) {
  switch (section.kind) {
    case "banner":
      return <p className={styles.canvasSectionMeta}>{section.slides.length} görsel · {section.layout}</p>;
    case "category_grid": {
      const categories = new Map(destinations.filter(({ kind }) => kind === "collection").map((item) => [item.resourceId, item.label]));
      const labels = section.categoryIds.map((categoryId) => categories.get(categoryId) ?? unresolvedResource("Kategori", categoryId));
      return <><p className={styles.canvasSectionMeta}>Düzen: {section.layout === "duo" ? "İki büyük görsel" : "Düzenli ızgara"}</p>{labels.length
        ? <CategoryPlaceholderCards gridClassName={styles.canvasCategoryGrid} labels={labels} layout={section.layout} />
        : <p className={styles.canvasSectionMeta}>Bu bölüm için henüz kategori seçilmedi.</p>}</>;
    }
    case "product_row":
      return <><p className={styles.canvasSectionMeta}>Kaynak: {section.source} · Ürün sınırı: {section.limit}</p><ProductCards contentLabel="Örnek içerik" count={section.limit} gridClassName={styles.canvasProductGrid} productTitles={[]} /><p className={styles.canvasProjectionText}>Katalog ürünleri yayın vitrini katalog projeksiyonu ile gösterilir.</p></>;
    case "split_campaign":
      return <ul className={styles.canvasSectionItems}>{section.panels.map((panel, index) => <li key={`${panel.assetId}-${index}`}><strong>{panel.heading}</strong><span>Görsel kimliği: {panel.assetId}</span><span>Hedef: {panel.destination}</span></li>)}</ul>;
    case "brand_story":
      return <><p className={styles.canvasProjectionText}>{section.body}</p>{section.assetId ? <p className={styles.canvasSectionMeta}>Görsel kimliği: {section.assetId}</p> : null}</>;
    case "value_propositions":
      return <ul className={styles.canvasSectionItems}>{section.items.map((item, index) => <li key={`${item.heading}-${index}`}><strong>{item.heading}</strong><span>{item.body}</span></li>)}</ul>;
    case "testimonials":
      return <><p className={styles.canvasSectionMeta}>En az {section.minimumRating} yıldız · En fazla {section.limit} yorum</p><p className={styles.canvasProjectionText}>Onaylı yorumlar yayın vitrini katalog projeksiyonu ile gösterilir.</p></>;
    default:
      return assertNever(section);
  }
}

function HomepagePreviewSection({ section, destinations }: Readonly<{
  section: StarterThemeSectionConfigV4;
  destinations: readonly StorefrontDesignDestinationOption[];
}>) {
  return <article
    className={styles.canvasSectionSummary}
  >
    <header><small>{SECTION_LABELS[section.kind]}</small><h2>{sectionHeading(section)}</h2></header>
    <HomepageSectionConfiguration section={section} destinations={destinations} />
  </article>;
}

function PreviewProductRow({ section, products, presentation, locale }: Readonly<{
  section: Extract<PublicStarterHomeSection, { kind: "product_row" }>;
  products: readonly StorefrontDesignPreviewProduct[];
  presentation: PublicStarterThemePresentationV2 | PublicStarterThemePresentationV3 | PublicStarterThemePresentationV4;
  locale: string;
}>) {
  return <section className={styles.canvasResolvedProductRow} data-campaign-product-row="true" aria-labelledby={`preview-row-${section.key}`}>
    <header><small>{section.source === "manual" ? "SEÇKİ" : section.source === "sale" ? "FIRSATLAR" : section.source === "category" ? "KOLEKSİYON" : "YENİ GELENLER"}</small><h2 id={`preview-row-${section.key}`}>{section.heading}</h2></header>
    <div className={styles.canvasResolvedProducts}>{products.map((product) => <article className={`product-card card-${presentation.visual.productCardStyle} image-${presentation.visual.productImageRatio}`} data-preview-product-card="true" key={product.id}><ProductCardContent product={product} locale={locale} cardStyle={presentation.visual.productCardStyle} imageRatio={presentation.visual.productImageRatio} prefetch={false} /></article>)}</div>
  </section>;
}

function hasPreviewSectionContent(
  section: PublicStarterHomeSection,
  productRows: readonly Readonly<{ key: string; items: readonly StorefrontDesignPreviewProduct[] }>[],
): boolean {
  switch (section.kind) {
    case "hero": return section.slides.length > 0;
    case "banner": return section.slides.some(slide => slide.enabled && (slide.desktopImage || section.presentation === "overlay"));
    case "category_grid": return section.items.length > 0;
    case "product_row": return productRows.find((row) => row.key === section.key)?.items.some(({ available }) => available) ?? false;
    case "split_campaign": return section.panels.length > 0;
    case "brand_story": return true;
    case "value_propositions": return section.items.length > 0;
    case "testimonials": return section.items.length > 0;
    default: return assertNever(section);
  }
}

const PREVIEW_RESOURCE_LABELS = Object.freeze({
  loading: "Seçili kaynaklar ve görseller yükleniyor.",
  partial: "Bazı seçili kaynaklar veya görseller kullanılamıyor.",
  empty: "Bu kaynakta gösterilebilecek içerik bulunamadı.",
  missing: "Seçilen kaynak veya görsel artık bulunamıyor.",
  unavailable: "Bu kaynak önizleme için kullanılamıyor.",
} as const);

function footerLink(link: StarterFooterLinkConfig, destinations: readonly StorefrontDesignDestinationOption[]) {
  if (link.kind === "system") {
    const label = STARTER_FOOTER_SYSTEM_LINKS.find(([destination]) => destination === link.destination)?.[1] ?? link.destination;
    return { label, detail: link.destination };
  }
  if (link.kind === "fixed_policy") {
    const label = STARTER_FOOTER_POLICIES.find(([key]) => key === link.policyKey)?.[1] ?? link.policyKey;
    return { label, detail: `Politika: ${link.policyKey}` };
  }
  const resourceId = link.kind === "category" ? link.categoryId : link.kind === "catalog_collection" ? link.resourceId : link.pageId;
  const destinationKind = link.kind === "category" ? "collection" : link.kind === "catalog_collection" ? "catalog_collection" : "page";
  const resolved = destinations.find(({ kind, resourceId: candidate }) => kind === destinationKind && candidate === resourceId);
  return resolved
    ? { label: resolved.label, detail: resolved.path }
    : { label: unresolvedResource(link.kind === "category" ? "Kategori" : link.kind === "catalog_collection" ? "Koleksiyon" : "Sayfa", resourceId), detail: resourceId };
}

function assertNever(value: never): never {
  throw new TypeError(`design_preview_section_unreachable:${String(value)}`);
}

export function VisualStorefrontCanvas(props: Readonly<VisualStorefrontCanvasProps>) {
  const normalizedDesign = normalizeStorefrontDesignDocumentV5(props.design);
  const preview = createPreviewStorefrontDesign({
    draft: normalizedDesign,
    publishedVersion: props.publishedVersion,
    publishedAt: props.publishedAt,
    media: props.media,
    destinations: props.destinations,
  });
  const composition = normalizedDesign.composition;
  const designHeroActive = preview.hero.enabled && preview.hero.slides.some((slide) => slide.desktopImage);
  const visibleSections = composition.sections;
  const resolved = props.previewResources ? composeDraftCampaignProjection({ composition, storeName: props.storeName, destinations: props.destinations, resources: props.previewResources, media: props.media }) : null;
  const campaignSections = resolved ? composeCampaignHomeSections(resolved.projection.presentation, designHeroActive) : [];
  const campaignById = new Map(campaignSections.flatMap((section) => "sectionId" in section && section.sectionId ? [[section.sectionId, section] as const] : []));
  const projectedById = new Map((resolved?.projection.presentation.sections ?? []).flatMap((section) => "sectionId" in section && section.sectionId ? [[section.sectionId, section] as const] : []));
  const resolvedStates = new Map(resolved?.sectionStates.map((state) => [state.sectionId, state.status]) ?? []);
  const visualTheme = props.storefront ? guzideThemeFor(props.storefront) : undefined;
  const locale = props.storefront?.locale ?? "tr";
  const renderPreviewNewsletter = () => <form className="retail-newsletter-form" onSubmit={event => event.preventDefault()} aria-label="Bülten formu önizlemesi"><label><span>E-posta adresi</span><span><input type="email" placeholder="E-posta adresi" readOnly/><button type="submit" disabled>Kaydol</button></span></label><label className="retail-newsletter-consent"><input type="checkbox" disabled/><span>{composition.footer.newsletter.consentLabel}</span></label></form>;

  return <div className={styles.previewViewport} data-mode={props.mode} data-storefront-theme={visualTheme} aria-label={`${props.mode === "desktop" ? "Masaüstü" : "Mobil"} mağaza tasarım tuvali`} onClickCapture={(event) => { if ((event.target as HTMLElement).closest("a")) event.preventDefault(); }}>
    <div className={styles.previewNotice} role="note"><strong>Mağaza önizlemesi</strong><span>Penceredeki değişiklikler Uygula ile mağazaya yansır.</span></div>
    <StorefrontDesignRenderer
      design={preview}
      storeName={props.storeName}
      now={props.now}
      compact
      presentation={resolved?.projection.presentation}
      previewMode={props.mode}
      navigationStatus={props.previewResources?.navigation?.status}
      editor={{
        selectedSurface: rendererSurface(props.selectedSurface),
        onSelectSurface: (surface, trigger) => props.onSelectSurface(editorSurface(surface), trigger),
      }}
    >
      <div className={`${styles.canvasThemeFrame} starter-storefront campaign-storefront corners-${composition.visual.cornerStyle} theme-${composition.visual.colorScheme} heading-${composition.visual.headingStyle}`} data-preview-mode={props.mode} data-published-design="true">
      <section data-design-surface="homepage" aria-label="Ana sayfa bölümleri önizlemesi">
        <div className={styles.canvasResolvedSections} data-campaign-home>
          {visibleSections.map((config, index) => {
            const section = campaignById.get(config.sectionId) ?? projectedById.get(config.sectionId);
            const status = resolvedStates.get(config.sectionId) ?? "unavailable";
            const hasContent = section && resolved && hasPreviewSectionContent(section, resolved.projection.productRows);
            return <div key={config.sectionId} className={styles.canvasSectionWithGap}>
              <button type="button" className={styles.canvasInsertGap} aria-label={`${index + 1}. konuma bölüm ekle`} data-insert-index={index} onClick={event => props.onInsertSection?.(index, event.currentTarget)}><span>＋ Bölüm ekle</span></button>
              <section className={styles.canvasSurface} data-preview-section-kind={config.kind} data-preview-section-id={config.sectionId} data-preview-resource-status={status} data-section-hidden={!config.enabled ? "true" : undefined}>
                {!config.enabled ? <div className={styles.canvasSectionSummary}><strong>{SECTION_LABELS[config.kind]}</strong><p>Gizli bölüm</p></div> : hasContent && section && resolved ? <CampaignSectionContent section={section} presentation={resolved.projection.presentation} productRows={resolved.projection.productRows} locale={locale} prefetch={false} previewMode={props.mode} renderProductRow={input => visualTheme ? <CampaignProductRowFrame {...input} visualTheme={visualTheme} prefetch={false} renderProductGrid={() => <div className={`product-grid ${styles.canvasSharedProductGrid}`}>{input.products.map(product => <article className={`product-card card-${input.presentation.visual.productCardStyle} image-${input.presentation.visual.productImageRatio}`} data-preview-product-card="true" key={product.id}><ProductCardContent product={product} locale={locale} cardStyle={input.presentation.visual.productCardStyle} imageRatio={input.presentation.visual.productImageRatio} prefetch={false}/><button className="product-card-cart" type="button" disabled>{product.available?"Sepete ekle":"Tükendi"}</button><button className="favorite-button" type="button" disabled aria-label={`${product.title} favori önizlemesi`}>♡</button></article>)}</div>}/> : <PreviewProductRow {...input} />} /> : <HomepagePreviewSection section={config} destinations={props.destinations} />}
                {config.enabled && status !== "ready" ? <p className={styles.canvasResourceState} role="status">{PREVIEW_RESOURCE_LABELS[status]}</p> : null}
                <button type="button" className={styles.canvasSurfaceButton} aria-label={`${SECTION_LABELS[config.kind]} ${index + 1} bölümünü düzenle`} aria-pressed={props.selectedSectionId===config.sectionId} onClick={event => props.onSelectSection?.(config.sectionId,event.currentTarget)}><span>{SECTION_LABELS[config.kind]}</span></button>
              </section>
            </div>;
          })}
          {!visibleSections.length ? <div className={styles.canvasEmptyHomepage} data-empty-home="true"><strong>Ana sayfanız boş</strong><p>Bir bölüm ekleyin.</p></div> : null}
          <button type="button" className={styles.canvasInsertGap} aria-label="Footer öncesine bölüm ekle" data-insert-index={visibleSections.length} onClick={event => props.onInsertSection?.(visibleSections.length,event.currentTarget)}><span>＋ Bölüm ekle</span></button>
        </div>
      </section>

      <section className={styles.canvasSurface} data-design-surface="product" hidden={props.selectedSurface !== "product"} aria-label="Ürün sayfası önizlemesi">
        <label className="celebix-preview-product-selector">Önizlenecek gerçek ürün
          <select aria-label="Önizlenecek gerçek ürün" value={props.previewProductId ?? props.previewResources?.productDetail?.value?.id ?? ""} onChange={(event) => props.onSelectPreviewProduct?.(event.currentTarget.value)}>
            {!props.previewResources?.productDetail?.value && !props.previewProductId ? <option value="">Bir ürün seçin</option> : null}
            {props.destinations.filter((item) => item.kind === "product").map((item) => <option key={item.resourceId} value={item.resourceId}>{item.label}</option>)}
          </select>
          <small>Bu seçim tasarımı değiştirmez. Ürün bilgileri katalogdan alınır.</small>
        </label>
        {props.previewResources?.productDetail?.status === "ready" && props.previewResources.productDetail.value ? <ProductDetailPreview key={props.previewResources.productDetail.value.id} product={props.previewResources.productDetail.value} options={composition.productDetail} cart={composition.cart} mode={props.mode} relatedProducts={props.previewResources.relatedProducts} renderText={(value) => <div className="product-description-rich-text" dangerouslySetInnerHTML={{ __html: normalizeProductDescriptionHtml(value) }} />} /> : <p className={styles.canvasResourceState} role="status">{props.previewResources?.productDetail?.status === "loading" ? "Ürün bilgileri yükleniyor." : props.previewResources?.productDetail?.status === "empty" ? "Önizlenebilecek aktif ürün bulunamadı." : "Seçili ürünün önizlemesi kullanılamıyor. Başka bir ürün seçin."}</p>}
        <SurfaceButton surface="product" label="Ürün sayfası" selected={props.selectedSurface === "product"} onSelect={props.onSelectSurface} />
      </section>

      <section className={styles.canvasSurface} data-design-surface="cart" hidden={props.selectedSurface !== "cart"}>
        <RepresentativeCartPreview product={props.previewResources?.productDetail?.value} settings={composition.cart} />
        <SurfaceButton surface="cart" label="Yan sepet" selected={props.selectedSurface === "cart"} onSelect={props.onSelectSurface} />
      </section>

      <section className={`${styles.canvasSurface} ${visualTheme ? "" : styles.canvasFooterPreview}`} data-design-surface="footer" data-tone={composition.footer.tone} aria-label="Footer önizlemesi">
        {visualTheme && props.storefront && resolved ? <GuzideFooter storefront={props.storefront} presentation={resolved.projection.presentation} groups={resolved.projection.presentation.footer.groups} logo={preview.brand.logo} renderNewsletter={renderPreviewNewsletter} prefetch={false}/> : <>
        <div><strong>{props.storeName}</strong><small>Mağaza bilgileri</small></div>
        <div className={styles.canvasFooterGroups}>{composition.footer.groups.map((group, index) => <section key={`${group.heading}-${index}`}><strong>{group.heading}</strong><ul>{group.links.map((link, linkIndex) => { const resolved = footerLink(link, props.destinations); return <li key={`${link.kind}-${linkIndex}`}><span>{resolved.label}</span><small>{resolved.detail}</small></li>; })}</ul></section>)}</div>
        {composition.footer.newsletter.enabled ? <section className={styles.canvasFooterNewsletter}><strong>{composition.footer.newsletter.heading}</strong><p>{composition.footer.newsletter.body}</p><small>{composition.footer.newsletter.consentLabel}</small></section> : null}
        {composition.footer.social.length ? <div className={styles.canvasFooterSocial} aria-label="Sosyal medya">{composition.footer.social.map(({ network, url }) => <span key={network}><strong>{network}</strong><small>{url}</small></span>)}</div> : null}
        <small>© {props.now.getFullYear()} {props.storeName}</small>
        </>}
        <SurfaceButton surface="footer" label="Footer" selected={props.selectedSurface === "footer"} onSelect={props.onSelectSurface} />
      </section>
      </div>
    </StorefrontDesignRenderer>
  </div>;
}
