"use client";

import {
  StorefrontDesignRenderer,
  createPreviewStorefrontDesign,
  type StorefrontRendererSurface,
} from "@celebix/storefront-design-ui";
import type {
  StarterFooterLinkConfig,
  StarterThemeSectionConfigV3,
  StorefrontDesignDestinationOption,
  StorefrontDesignDocument,
  StorefrontDesignMediaOption,
} from "@celebix/saas-contracts";
import { normalizeStarterThemeCompositionV3 } from "@celebix/saas-contracts";

import type { DesignCanvasSurface, DesignCanvasTrigger } from "./design-surface-model";
import styles from "../design-settings.module.css";
import { STARTER_FOOTER_POLICIES, STARTER_FOOTER_SYSTEM_LINKS } from "../starter-footer-options";
import { CategoryPlaceholderCards, ProductCards } from "../StarterThemePreviewScaffolds";

interface VisualStorefrontCanvasProps {
  readonly design: StorefrontDesignDocument;
  readonly storeName: string;
  readonly publishedVersion: number;
  readonly publishedAt: string;
  readonly media: readonly StorefrontDesignMediaOption[];
  readonly destinations: readonly StorefrontDesignDestinationOption[];
  readonly mode: "desktop" | "mobile";
  readonly now: Date;
  readonly selectedSurface?: DesignCanvasSurface;
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
  hero: "Banner",
  category_grid: "Kategori vitrini",
  product_row: "Ürün satırı",
  split_campaign: "Kampanya panelleri",
  brand_story: "Marka hikâyesi",
  value_propositions: "Değer önerileri",
  testimonials: "Müşteri yorumları",
} satisfies Readonly<Record<StarterThemeSectionConfigV3["kind"], string>>);

function unresolvedResource(kind: string, id: string) {
  return `${kind} kimliği: ${id} (yayın vitrininin sunucu tarafında çözümlenir)`;
}

function sectionHeading(section: StarterThemeSectionConfigV3): string {
  if (section.kind === "hero") return section.slides[0]?.heading ?? SECTION_LABELS.hero;
  if (section.kind === "split_campaign") return section.panels[0]?.heading ?? SECTION_LABELS.split_campaign;
  if (section.kind === "value_propositions") return section.items[0]?.heading ?? SECTION_LABELS.value_propositions;
  return section.heading;
}

function HomepageSectionConfiguration({ section, destinations }: Readonly<{
  section: StarterThemeSectionConfigV3;
  destinations: readonly StorefrontDesignDestinationOption[];
}>) {
  switch (section.kind) {
    case "hero":
      return <ul className={styles.canvasSectionItems}>{section.slides.map((slide, index) => <li key={`${slide.desktopAssetId}-${index}`}>
        <strong>{slide.heading}</strong>
        <span>Masaüstü görsel kimliği: {slide.desktopAssetId}</span>
        <span>{slide.mobileAssetId ? `Mobil görsel kimliği: ${slide.mobileAssetId}` : "Mobil görsel: masaüstü görseli kullanılır"}</span>
      </li>)}</ul>;
    case "category_grid": {
      const categories = new Map(destinations.filter(({ kind }) => kind === "collection").map((item) => [item.resourceId, item.label]));
      const labels = section.categoryIds.map((categoryId) => categories.get(categoryId) ?? unresolvedResource("Kategori", categoryId));
      return <><p className={styles.canvasSectionMeta}>Düzen: {section.layout === "duo" ? "İki büyük görsel" : "Düzenli ızgara"}</p>{labels.length
        ? <CategoryPlaceholderCards gridClassName={styles.canvasCategoryGrid} labels={labels} layout={section.layout} />
        : <p className={styles.canvasSectionMeta}>Bu bölüm için henüz kategori seçilmedi.</p>}</>;
    }
    case "product_row":
      return <><p className={styles.canvasSectionMeta}>Kaynak: {section.source} · Ürün sınırı: {section.limit}</p><ProductCards contentLabel="Örnek içerik" gridClassName={styles.canvasProductGrid} productTitles={[]} /><p className={styles.canvasProjectionText}>Katalog ürünleri yayın vitrini katalog projeksiyonu ile gösterilir.</p></>;
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
  section: StarterThemeSectionConfigV3;
  destinations: readonly StorefrontDesignDestinationOption[];
}>) {
  return <article
    className={styles.canvasSectionSummary}
    data-preview-section-kind={section.kind}
    data-preview-section-id={section.sectionId}
  >
    <header><small>{SECTION_LABELS[section.kind]}</small><h2>{sectionHeading(section)}</h2></header>
    <HomepageSectionConfiguration section={section} destinations={destinations} />
  </article>;
}

function footerLink(link: StarterFooterLinkConfig, destinations: readonly StorefrontDesignDestinationOption[]) {
  if (link.kind === "system") {
    const label = STARTER_FOOTER_SYSTEM_LINKS.find(([destination]) => destination === link.destination)?.[1] ?? link.destination;
    return { label, detail: link.destination };
  }
  if (link.kind === "fixed_policy") {
    const label = STARTER_FOOTER_POLICIES.find(([key]) => key === link.policyKey)?.[1] ?? link.policyKey;
    return { label, detail: `Politika: ${link.policyKey}` };
  }
  const resourceId = link.kind === "category" ? link.categoryId : link.pageId;
  const destinationKind = link.kind === "category" ? "collection" : "page";
  const resolved = destinations.find(({ kind, resourceId: candidate }) => kind === destinationKind && candidate === resourceId);
  return resolved
    ? { label: resolved.label, detail: resolved.path }
    : { label: unresolvedResource(link.kind === "category" ? "Kategori" : "Sayfa", resourceId), detail: resourceId };
}

function assertNever(value: never): never {
  throw new TypeError(`design_preview_section_unreachable:${String(value)}`);
}

export function VisualStorefrontCanvas(props: Readonly<VisualStorefrontCanvasProps>) {
  const preview = createPreviewStorefrontDesign({
    draft: props.design,
    publishedVersion: props.publishedVersion,
    publishedAt: props.publishedAt,
    media: props.media,
    destinations: props.destinations,
  });
  const composition = normalizeStarterThemeCompositionV3(props.design.composition);
  const designHeroActive = preview.hero.enabled && preview.hero.slides.length > 0;
  const visibleSections = composition.sections.filter((section) => section.enabled && (!designHeroActive || section.kind !== "hero"));

  return <div className={styles.previewViewport} data-mode={props.mode} aria-label={`${props.mode === "desktop" ? "Masaüstü" : "Mobil"} mağaza tasarım tuvali`}>
    <div className={styles.previewNotice} role="note"><strong>Taslak önizlemesi</strong><span>Yayınlanmış mağazadan farklı olabilir.</span></div>
    <StorefrontDesignRenderer
      design={preview}
      storeName={props.storeName}
      now={props.now}
      compact
      editor={{
        selectedSurface: rendererSurface(props.selectedSurface),
        onSelectSurface: (surface, trigger) => props.onSelectSurface(editorSurface(surface), trigger),
      }}
    >
      {!preview.hero.enabled || preview.hero.slides.length === 0 ? <section className={`${styles.canvasSurface} ${styles.canvasEmptyHero}`}>
        <small>ANA SAYFA</small><strong>Banner alanı kapalı</strong><p>Bir banner eklemek veya alanı açmak için seçin.</p>
        <SurfaceButton surface="homepage" label="Ana sayfayı düzenle" selected={props.selectedSurface === "homepage"} onSelect={props.onSelectSurface} />
      </section> : null}

      <section className={`${styles.canvasSurface}`} data-design-surface="homepage" aria-label="Ana sayfa bölümleri önizlemesi">
        {visibleSections.length ? <><p className={styles.canvasProjectionNotice} role="note">Ana sayfa görselleri, katalog kayıtları ve yorumlar yayın vitrininin sunucu tarafında çözümlenir. Burada taslak sırası ve kayıtlı ayarlar gösterilir.</p><div className={styles.canvasSectionList}>{visibleSections.map((section) => <HomepagePreviewSection key={section.sectionId} section={section} destinations={props.destinations} />)}</div></> : <div className={styles.canvasEmptyHomepage} data-empty-home="true"><strong>Ana sayfanız şu anda boş</strong><p>Bölüm eklediğinizde taslak önizlemesi burada görünür.</p></div>}
        <SurfaceButton surface="homepage" label="Ana sayfayı düzenle" selected={props.selectedSurface === "homepage"} onSelect={props.onSelectSurface} />
      </section>

      <section className={`${styles.canvasSurface} ${styles.canvasProductDetailPreview}`} data-design-surface="product" aria-label="Ürün sayfası önizlemesi">
        <div className={styles.canvasProductGallery} aria-hidden="true"><i /><i /><i /></div>
        <div className={styles.canvasProductSummary}><small>ÖRNEK ÜRÜN SAYFASI</small><h2>Örnek ürün adı</h2><p>Katalog verisi bağlandığında ürün bilgileri, seçenekleri ve satın alma alanı burada görünür.</p><div><span>−</span><b>1</b><span>+</span><button type="button" tabIndex={-1}>Sepete ekle</button></div></div>
        <SurfaceButton surface="product" label="Ürün sayfası" selected={props.selectedSurface === "product"} onSelect={props.onSelectSurface} />
      </section>

      <footer className={`${styles.canvasSurface} ${styles.canvasFooterPreview}`} data-design-surface="footer" data-tone={composition.footer.tone} aria-label="Footer önizlemesi">
        <div><strong>{props.storeName}</strong><small>Mağaza bilgileri</small></div>
        <div className={styles.canvasFooterGroups}>{composition.footer.groups.map((group, index) => <section key={`${group.heading}-${index}`}><strong>{group.heading}</strong><ul>{group.links.map((link, linkIndex) => { const resolved = footerLink(link, props.destinations); return <li key={`${link.kind}-${linkIndex}`}><span>{resolved.label}</span><small>{resolved.detail}</small></li>; })}</ul></section>)}</div>
        {composition.footer.newsletter.enabled ? <section className={styles.canvasFooterNewsletter}><strong>{composition.footer.newsletter.heading}</strong><p>{composition.footer.newsletter.body}</p><small>{composition.footer.newsletter.consentLabel}</small></section> : null}
        {composition.footer.social.length ? <div className={styles.canvasFooterSocial} aria-label="Sosyal medya">{composition.footer.social.map(({ network, url }) => <span key={network}><strong>{network}</strong><small>{url}</small></span>)}</div> : null}
        <small>© {props.now.getFullYear()} {props.storeName}</small>
        <SurfaceButton surface="footer" label="Footer" selected={props.selectedSurface === "footer"} onSelect={props.onSelectSurface} />
      </footer>
    </StorefrontDesignRenderer>
  </div>;
}
