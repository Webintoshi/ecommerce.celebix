"use client";

import {
  StorefrontDesignRenderer,
  createPreviewStorefrontDesign,
  type StorefrontRendererSurface,
} from "@celebix/storefront-design-ui";
import type {
  StarterThemeSectionConfigV3,
  StorefrontDesignDestinationOption,
  StorefrontDesignDocument,
  StorefrontDesignMediaOption,
} from "@celebix/saas-contracts";
import { normalizeStarterThemeCompositionV3 } from "@celebix/saas-contracts";

import type { DesignCanvasSurface, DesignCanvasTrigger } from "./design-surface-model";
import styles from "../design-settings.module.css";

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

function SectionMedia({ media, assetId, label }: Readonly<{
  media: readonly StorefrontDesignMediaOption[];
  assetId?: string;
  label: string;
}>) {
  const selected = assetId ? media.find(({ id }) => id === assetId) : undefined;
  return selected
    ? <img src={selected.url} alt={selected.altText || label} />
    : <div className={styles.canvasExampleMedia} aria-label={`${label} için örnek görsel`}><i aria-hidden="true" /></div>;
}

function HomepagePreviewSection({ section, media, destinations }: Readonly<{
  section: StarterThemeSectionConfigV3;
  media: readonly StorefrontDesignMediaOption[];
  destinations: readonly StorefrontDesignDestinationOption[];
}>) {
  const attributes = {
    "data-preview-section-kind": section.kind,
    "data-preview-section-id": section.sectionId,
  } as const;

  switch (section.kind) {
    case "hero":
      return <section className={styles.canvasCompositionHero} {...attributes}>
        {section.slides.map((slide, index) => <article key={`${slide.desktopAssetId}-${index}`}>
          <SectionMedia media={media} assetId={slide.desktopAssetId} label={`${index + 1}. banner`} />
          <div>{slide.eyebrow ? <small>{slide.eyebrow}</small> : null}<h2>{slide.heading}</h2>{slide.body ? <p>{slide.body}</p> : null}</div>
        </article>)}
      </section>;
    case "category_grid": {
      const categories = new Map(destinations.filter(({ kind }) => kind === "collection").map((item) => [item.resourceId, item.label]));
      return <section className={styles.canvasCategoryPreview} {...attributes}>
        <header><small>KOLEKSİYONLAR</small><h2>{section.heading}</h2></header>
        {section.categoryIds.length ? <div className={styles.canvasCategoryGrid} data-count={section.categoryIds.length}>
          {section.categoryIds.map((categoryId, index) => <article key={categoryId}><div aria-hidden="true"><i /></div><strong>{categories.get(categoryId) ?? `Örnek kategori ${index + 1}`}</strong>{categories.has(categoryId) ? null : <small>Örnek gösterim</small>}</article>)}
        </div> : <p className={styles.canvasCatalogNotice}>Bu bölüm için henüz kategori seçilmedi.</p>}
      </section>;
    }
    case "product_row":
      return <section className={styles.canvasProductPreview} {...attributes}>
        <header><small>MAĞAZA</small><h2>{section.heading}</h2><span>Tümünü gör</span></header>
        <div className={styles.canvasProductGrid}>
          {Array.from({ length: Math.min(4, section.limit) }, (_, index) => <article key={`${section.sectionId}-example-${index}`}><div aria-hidden="true"><i /></div><strong>Örnek ürün {index + 1}</strong><small>Katalog yer tutucusu</small></article>)}
        </div>
      </section>;
    case "split_campaign":
      return <section className={styles.canvasCampaignPreview} {...attributes}>
        {section.panels.map((panel, index) => <article key={`${panel.assetId}-${panel.destination}-${index}`}><SectionMedia media={media} assetId={panel.assetId} label={`${index + 1}. kampanya`} /><div>{panel.eyebrow ? <small>{panel.eyebrow}</small> : null}<h2>{panel.heading}</h2>{panel.body ? <p>{panel.body}</p> : null}</div></article>)}
      </section>;
    case "brand_story":
      return <section className={styles.canvasStoryPreview} {...attributes}>
        <div>{section.eyebrow ? <small>{section.eyebrow}</small> : null}<h2>{section.heading}</h2><p>{section.body}</p></div>
        {section.assetId ? <SectionMedia media={media} assetId={section.assetId} label="Marka hikâyesi" /> : null}
      </section>;
    case "value_propositions":
      return <section className={styles.canvasValuesPreview} {...attributes}>
        {section.items.map((item, index) => <article key={`${item.heading}-${index}`}><i aria-hidden="true">◇</i><strong>{item.heading}</strong><p>{item.body}</p></article>)}
      </section>;
    case "testimonials":
      return <section className={styles.canvasTestimonialsPreview} {...attributes}><small>ONAYLI YORUMLAR</small><h2>{section.heading}</h2><p>Mağazanıza ait uygun yorumlar yayınlanan vitrinde burada gösterilir.</p></section>;
    default:
      return assertNever(section);
  }
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
  const visibleSections = composition.sections.filter(({ enabled }) => enabled);

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
        {visibleSections.length ? visibleSections.map((section) => <HomepagePreviewSection key={section.sectionId} section={section} media={props.media} destinations={props.destinations} />) : <div className={styles.canvasEmptyHomepage} data-empty-home="true"><strong>Ana sayfanız şu anda boş</strong><p>Bölüm eklediğinizde taslak önizlemesi burada görünür.</p></div>}
        <SurfaceButton surface="homepage" label="Ana sayfayı düzenle" selected={props.selectedSurface === "homepage"} onSelect={props.onSelectSurface} />
      </section>

      <section className={`${styles.canvasSurface} ${styles.canvasProductDetailPreview}`} data-design-surface="product" aria-label="Ürün sayfası önizlemesi">
        <div className={styles.canvasProductGallery} aria-hidden="true"><i /><i /><i /></div>
        <div className={styles.canvasProductSummary}><small>ÖRNEK ÜRÜN SAYFASI</small><h2>Örnek ürün adı</h2><p>Katalog verisi bağlandığında ürün bilgileri, seçenekleri ve satın alma alanı burada görünür.</p><div><span>−</span><b>1</b><span>+</span><button type="button" tabIndex={-1}>Sepete ekle</button></div></div>
        <SurfaceButton surface="product" label="Ürün sayfası" selected={props.selectedSurface === "product"} onSelect={props.onSelectSurface} />
      </section>

      <footer className={`${styles.canvasSurface} ${styles.canvasFooterPreview}`} data-design-surface="footer" data-tone={composition.footer.tone} aria-label="Footer önizlemesi">
        <div><strong>{props.storeName}</strong><small>Mağaza bilgileri</small></div>
        <div className={styles.canvasFooterGroups}>{composition.footer.groups.map((group, index) => <section key={`${group.heading}-${index}`}><strong>{group.heading}</strong><small>{group.links.length} bağlantı</small></section>)}</div>
        {composition.footer.newsletter.enabled ? <section className={styles.canvasFooterNewsletter}><strong>{composition.footer.newsletter.heading}</strong><p>{composition.footer.newsletter.body}</p><small>{composition.footer.newsletter.consentLabel}</small></section> : null}
        {composition.footer.social.length ? <div className={styles.canvasFooterSocial} aria-label="Sosyal medya">{composition.footer.social.map(({ network }) => <span key={network}>{network}</span>)}</div> : null}
        <small>© {props.now.getFullYear()} {props.storeName}</small>
        <SurfaceButton surface="footer" label="Footer" selected={props.selectedSurface === "footer"} onSelect={props.onSelectSurface} />
      </footer>
    </StorefrontDesignRenderer>
  </div>;
}
