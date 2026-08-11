"use client";

import {
  StorefrontDesignRenderer,
  createPreviewStorefrontDesign,
  type StorefrontRendererSurface,
} from "@celebix/storefront-design-ui";
import type {
  StorefrontDesignDestinationOption,
  StorefrontDesignDocument,
  StorefrontDesignMediaOption,
} from "@celebix/saas-contracts";

import type { DesignCanvasSurface } from "./design-surface-model";
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
  readonly onSelectSurface: (surface: DesignCanvasSurface, trigger?: HTMLButtonElement) => void;
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
  onSelect: (surface: DesignCanvasSurface, trigger?: HTMLButtonElement) => void;
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

export function VisualStorefrontCanvas(props: Readonly<VisualStorefrontCanvasProps>) {
  const preview = createPreviewStorefrontDesign({
    draft: props.design,
    publishedVersion: props.publishedVersion,
    publishedAt: props.publishedAt,
    media: props.media,
    destinations: props.destinations,
  });
  const composition = props.design.composition;
  const categorySection = composition.sections.find((section) => section.kind === "category_grid" && section.enabled);
  const productSection = composition.sections.find((section) => section.kind === "product_row" && section.enabled);
  const categoryCount = categorySection?.kind === "category_grid" ? Math.min(4, categorySection.categoryIds.length || 4) : 4;
  const productCount = productSection?.kind === "product_row" ? Math.min(4, Math.max(2, productSection.limit)) : 4;
  const footerGroups = composition.schemaVersion === 2 ? composition.footer.groups.map(({ heading }) => heading) : [];

  return <div className={styles.previewViewport} data-mode={props.mode} aria-label={`${props.mode === "desktop" ? "Masaüstü" : "Mobil"} mağaza tasarım tuvali`}>
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
        <div className={styles.canvasCategoryPreview}>
          <header><small>KOLEKSİYONLAR</small><h2>{categorySection?.kind === "category_grid" ? categorySection.heading : "Kategorileri keşfedin"}</h2></header>
          <div className={styles.canvasCategoryGrid} data-count={categoryCount}>
            {Array.from({ length: categoryCount }, (_, index) => <article key={index}><div aria-hidden="true"><i /></div><strong>Kategori {index + 1}</strong></article>)}
          </div>
        </div>
        <div className={styles.canvasProductPreview}>
          <header><small>MAĞAZA</small><h2>{productSection?.kind === "product_row" ? productSection.heading : "Öne çıkan ürünler"}</h2><span>Tümünü gör</span></header>
          <div className={styles.canvasProductGrid}>
            {Array.from({ length: productCount }, (_, index) => <article key={index}><div aria-hidden="true"><i /></div><strong>Ürün {index + 1}</strong><small>Ürün bilgisi</small></article>)}
          </div>
        </div>
        <SurfaceButton surface="homepage" label="Ana sayfayı düzenle" selected={props.selectedSurface === "homepage"} onSelect={props.onSelectSurface} />
      </section>

      <section className={`${styles.canvasSurface} ${styles.canvasProductDetailPreview}`} data-design-surface="product" aria-label="Ürün sayfası önizlemesi">
        <div className={styles.canvasProductGallery} aria-hidden="true"><i /><i /><i /></div>
        <div className={styles.canvasProductSummary}><small>ÜRÜN SAYFASI</small><h2>Ürün adı</h2><p>Ürün bilgileri, seçenekleri ve satın alma alanı burada görünür.</p><div><span>−</span><b>1</b><span>+</span><button type="button" tabIndex={-1}>Sepete ekle</button></div></div>
        <SurfaceButton surface="product" label="Ürün sayfası" selected={props.selectedSurface === "product"} onSelect={props.onSelectSurface} />
      </section>

      <footer className={`${styles.canvasSurface} ${styles.canvasFooterPreview}`} data-design-surface="footer" aria-label="Footer önizlemesi">
        <div><strong>{props.storeName}</strong><small>Mağaza bilgileri</small></div>
        <div>{footerGroups.length ? footerGroups.map((heading) => <span key={heading}>{heading}</span>) : <><span>Mağaza</span><span>Yardım</span><span>Hesabım</span></>}</div>
        <small>© {props.now.getFullYear()} {props.storeName}</small>
        <SurfaceButton surface="footer" label="Footer" selected={props.selectedSurface === "footer"} onSelect={props.onSelectSurface} />
      </footer>
    </StorefrontDesignRenderer>
  </div>;
}
