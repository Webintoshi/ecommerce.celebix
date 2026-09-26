"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

import type { PublicStorefrontDesign, PublicStarterThemePresentationV2, PublicStarterThemePresentationV3 } from "@celebix/saas-contracts";

import { isStorefrontPromotionActive } from "./model.ts";
import { createStorefrontTypographyResources } from "./typography.ts";
import { StorefrontNavigationItems } from "./StorefrontNavigation.tsx";

type DesignStyle = CSSProperties & Record<`--store-${string}`, string>;

const ICONS = Object.freeze({ none: "", sparkle: "✦", truck: "▰", shield: "◇" } as const);

export type StorefrontRendererSurface = "announcement" | "brand" | "navigation" | "hero" | "promotion" | "cart";

export interface StorefrontDesignEditorBridge {
  readonly selectedSurface?: StorefrontRendererSurface;
  readonly onSelectSurface: (surface: StorefrontRendererSurface, trigger?: HTMLButtonElement) => void;
}

function editorSurface(editor: StorefrontDesignEditorBridge | undefined, surface: StorefrontRendererSurface, label: string, content: ReactNode) {
  if (!editor) return content;
  return <div className="celebix-store-edit-shell" data-edit-shell={surface}>
    {content}
    <button type="button" className="celebix-store-edit-control" data-design-surface={surface} aria-label={`${label} alanını düzenle`} aria-pressed={editor.selectedSurface === surface} onClick={(event) => editor.onSelectSurface(surface, event.currentTarget)}><span>{label}</span></button>
  </div>;
}

export function StorefrontDesignRenderer({ design, storeName, now, children, compact = false, showHeader = true, showHomeSurfaces = true, editor, presentation, previewMode, navigationStatus }: Readonly<{
  design: PublicStorefrontDesign;
  storeName: string;
  now: Date;
  children?: ReactNode;
  compact?: boolean;
  showHeader?: boolean;
  showHomeSurfaces?: boolean;
  editor?: StorefrontDesignEditorBridge;
  presentation?: PublicStarterThemePresentationV2 | PublicStarterThemePresentationV3;
  previewMode?: "desktop" | "mobile";
  navigationStatus?: "loading" | "ready" | "partial" | "empty" | "missing" | "unavailable";
}>) {
  const visual = presentation?.schemaVersion === 3 ? presentation.visual : undefined;
  const typography = createStorefrontTypographyResources(design.typography);
  const style: DesignStyle = {
    "--store-primary": design.brand.primaryColor,
    "--store-accent": design.brand.accentColor,
    "--store-background": design.brand.backgroundColor,
    "--store-text": design.brand.textColor,
    ...typography.style,
    "--store-section-spacing": visual?.sectionSpacing === "compact" ? "40px" : visual?.sectionSpacing === "airy" ? "112px" : previewMode === "mobile" ? "64px" : "clamp(64px, 7vw, 112px)",
  };
  const announcement = presentation ? { ...design.announcement, enabled: Boolean(presentation.announcement), items: presentation.announcement?.items ?? [] } : design.announcement;
  const announcementDestination = presentation?.announcement?.destination;
  const promotionActive = isStorefrontPromotionActive(design.promotion, now);
  const [activeSlide, setActiveSlide] = useState(0);
  const [paused, setPaused] = useState(false);
  const slides = design.hero.slides.filter((slide) => slide.desktopImage !== null);
  useEffect(() => { if (activeSlide >= slides.length) setActiveSlide(0); }, [activeSlide, slides.length]);
  useEffect(() => {
    if (paused || slides.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const timer = window.setInterval(() => setActiveSlide((current) => (current + 1) % slides.length), 5_000);
    return () => window.clearInterval(timer);
  }, [paused, slides.length]);
  const selectSlide = (index: number) => setActiveSlide((index + slides.length) % slides.length);
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link rel="stylesheet" href={typography.stylesheetUrl} />
      <div className="celebix-store-design" data-font={design.brand.fontFamily} data-compact={compact ? "true" : "false"} data-preview-mode={previewMode} style={style}>
      {announcement.enabled ? editorSurface(editor, "announcement", "Duyuru şeridi", (
        <div className="celebix-store-announcement" data-speed={announcement.speed} data-direction={announcement.direction} data-animation={announcement.animation} aria-label="Mağaza duyuruları">
          <div>{announcement.items.map((item, index) => <span key={`${index}-${item}`}>{ICONS[announcement.icon] ? <i aria-hidden="true">{ICONS[announcement.icon]}</i> : null}{announcementDestination ? <a href={announcementDestination}>{item}</a> : item}</span>)}</div>
        </div>
      )) : null}
      {showHeader ? <header className="celebix-store-header" data-layout={visual?.headerLayout} data-width={visual?.headerWidth} data-style={presentation?.visual.headerStyle}>
        {editorSurface(editor, "brand", "Logo ve marka", <a className="celebix-store-brand" href="/" aria-label={`${storeName} ana sayfa`}>
          {design.brand.logo ? <img src={design.brand.logo.url} alt={design.brand.logo.altText || storeName} /> : <strong>{storeName}</strong>}
        </a>)}
        {editorSurface(editor, "navigation", "Header ve menü", <>
          <nav className="celebix-store-desktop-nav" aria-label="Ana menü"><a href="/">Ana Sayfa</a><a href="/products">Ürünler</a><StorefrontNavigationItems items={presentation?.navigation.items ?? []} desktopDisclosure /></nav>
          <details className="celebix-store-mobile-nav"><summary>Menü <span aria-hidden="true">☰</span></summary><nav aria-label="Mobil menü"><a href="/">Ana Sayfa</a><a href="/products">Ürünler</a><StorefrontNavigationItems items={presentation?.navigation.items ?? []} mode="mobile" /></nav></details>
          {navigationStatus && navigationStatus !== "ready" ? <small className="celebix-store-nav-state" role="status">{navigationStatus === "loading" ? "Menü kategorileri yükleniyor." : navigationStatus === "partial" ? "Bazı menü kategorileri kullanılamıyor." : navigationStatus === "empty" ? "Menü kategorisi seçilmedi." : "Seçili menü kategorileri önizlemede kullanılamıyor."}</small> : null}
        </>)}
        {editorSurface(editor, "cart", "Yan sepet", <span className="celebix-store-bag">Çanta <b>0</b></span>)}
      </header> : null}
      {showHomeSurfaces && design.hero.enabled && slides.length ? (
        editorSurface(editor, "hero", "Ana banner", <section className="celebix-store-hero-slider" aria-roledescription="carousel" aria-label="Mağaza bannerları" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocusCapture={() => setPaused(true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false); }}>
          <div className="celebix-store-hero-track">
            {slides.map((slide, index) => {
              const desktopImage = slide.desktopImage;
              if (!desktopImage) return null;
              const mobileImage = slide.mobileImage ?? desktopImage;
              const selectedImage = previewMode === "mobile" ? mobileImage : desktopImage;
              const banner = <picture>
                {previewMode === undefined ? <source media="(max-width: 720px)" srcSet={mobileImage.url} /> : null}
                <img src={selectedImage.url} alt={selectedImage.altText} fetchPriority={index === 0 ? "high" : "auto"} />
              </picture>;
              return <article key={`${index}-${slide.headline}`} className="celebix-store-hero" data-active={index === activeSlide ? "true" : "false"} aria-label={slide.headline} aria-hidden={index !== activeSlide}>
                <h1 className="celebix-store-hero-title-sr">{slide.headline}</h1>
                {slide.destination ? <a className="celebix-store-hero-media" href={slide.destination.path} tabIndex={index === activeSlide ? undefined : -1} aria-label={`${slide.headline} bannerını aç`}>{banner}</a> : banner}
              </article>;
            })}
          </div>
          {slides.length > 1 ? <><button type="button" className="celebix-store-hero-arrow celebix-store-hero-prev" aria-label="Önceki banner" onClick={() => selectSlide(activeSlide - 1)}>‹</button><button type="button" className="celebix-store-hero-arrow celebix-store-hero-next" aria-label="Sonraki banner" onClick={() => selectSlide(activeSlide + 1)}>›</button><div className="celebix-store-hero-dots" role="group" aria-label="Banner seçimi">{slides.map((slide, index) => <button type="button" key={`${index}-${slide.headline}`} aria-label={`${index + 1}. banner`} aria-current={index === activeSlide ? "true" : undefined} onClick={() => selectSlide(index)} />)}</div></> : null}
        </section>)
      ) : null}
      {showHomeSurfaces && promotionActive ? editorSurface(editor, "promotion", "Promosyon", <aside className="celebix-store-promotion"><div><strong>{design.promotion.headline}</strong>{design.promotion.body ? <span>{design.promotion.body}</span> : null}</div>{design.promotion.destination ? <a href={design.promotion.destination.path}>İncele</a> : null}</aside>) : null}
      {children ? <div className="celebix-store-content">{children}</div> : null}
      </div>
    </>
  );
}
