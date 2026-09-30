"use client";

import { useEffect, useState } from "react";
import type { PublicStarterHomeSection } from "@celebix/saas-contracts";

type BannerSection = Extract<PublicStarterHomeSection, { kind: "banner" }>;
const defaultHref = (path: string) => path;

export function StorefrontBanner({ section, previewMode, destinationHref = defaultHref, priority = false }: Readonly<{
  section: BannerSection;
  previewMode?: "desktop" | "mobile";
  destinationHref?: (path: string) => string;
  priority?: boolean;
}>) {
  const enabled = section.slides.filter((slide) => slide.enabled && (slide.desktopImage || section.presentation === "overlay"));
  const slides = section.layout === "single" ? enabled.slice(0, 1) : enabled;
  const carousel = section.layout === "slider" && slides.length > 1;
  const [activeSlide, setActiveSlide] = useState(0);
  const [paused, setPaused] = useState(false);
  const [interacted, setInteracted] = useState(false);
  const active = activeSlide < slides.length ? activeSlide : 0;
  useEffect(() => { if (activeSlide >= slides.length) setActiveSlide(0); }, [activeSlide, slides.length]);
  useEffect(() => {
    if (!carousel || !section.autoplay || paused || interacted || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;
    const timer = window.setInterval(() => setActiveSlide((index) => (index + 1) % slides.length), 5_000);
    return () => window.clearInterval(timer);
  }, [carousel, section.autoplay, paused, interacted, slides.length]);
  const selectSlide = (index: number) => { setInteracted(true); setActiveSlide((index + slides.length) % slides.length); };
  if (!slides.length) return null;
  return <section className="celebix-store-banner" data-layout={section.layout} data-presentation={section.presentation} data-preview-mode={previewMode}
    aria-roledescription={carousel ? "carousel" : undefined} aria-label="Mağaza bannerları"
    onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onPointerDown={() => setInteracted(true)}
    onFocusCapture={() => setPaused(true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false); }}
    onKeyDown={(event) => { if (!carousel || !["ArrowLeft", "ArrowRight"].includes(event.key)) return; event.preventDefault(); selectSlide(active + (event.key === "ArrowRight" ? 1 : -1)); }}>
    <div className="celebix-store-banner-track">
      {slides.map((slide, index) => {
        const visible = !carousel || index === active;
        const desktop = slide.desktopImage;
        const mobile = slide.mobileImage ?? desktop;
        const selected = previewMode === "mobile" ? mobile : desktop;
        const picture = selected ? <picture>
          {previewMode === undefined && mobile ? <source media="(max-width: 700px)" srcSet={mobile.url} /> : null}
          <img src={selected.url} alt={selected.altText} width={selected.width} height={selected.height} loading={priority && index === 0 ? "eager" : "lazy"} fetchPriority={priority && index === 0 ? "high" : "auto"} />
        </picture> : <div className="celebix-store-banner-fallback" aria-hidden="true" />;
        return <article key={slide.slideId} data-slide-id={slide.slideId} data-active={visible ? "true" : "false"} className="celebix-store-banner-slide" aria-hidden={!visible || undefined} inert={!visible || undefined}>
          {section.presentation === "image_only" && slide.destination ? <a className="celebix-store-banner-media" href={destinationHref(slide.destination)} tabIndex={visible ? undefined : -1} aria-label={`${slide.headline} bannerını aç`}>{picture}</a> : picture}
          {section.presentation === "overlay" ? <><div className="celebix-store-banner-shade" /><div className="celebix-store-banner-copy">
            {slide.eyebrow ? <span>{slide.eyebrow}</span> : null}<h2>{slide.headline}</h2>{slide.body ? <p>{slide.body}</p> : null}
            {slide.destination ? <a className="celebix-store-banner-action" href={destinationHref(slide.destination)} tabIndex={visible ? undefined : -1}>Koleksiyonu keşfet</a> : null}
          </div></> : <h2 className="celebix-store-hero-title-sr">{slide.headline}</h2>}
          {slide.hotspot ? <a className="celebix-store-banner-hotspot" href={destinationHref(`/products/${slide.hotspot.productSlug}`)} tabIndex={visible ? undefined : -1} aria-label={`${slide.hotspot.title} ürününü incele`}>
            <span aria-hidden="true">+</span><strong>{slide.hotspot.title}</strong><small>{new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(slide.hotspot.priceCents / 100)}</small>
          </a> : null}
        </article>;
      })}
    </div>
    {carousel ? <><button type="button" className="celebix-store-hero-arrow celebix-store-hero-prev" aria-label="Önceki banner" onClick={() => selectSlide(active - 1)}>‹</button>
      <button type="button" className="celebix-store-hero-arrow celebix-store-hero-next" aria-label="Sonraki banner" onClick={() => selectSlide(active + 1)}>›</button>
      <div className="celebix-store-hero-dots" role="group" aria-label="Banner seçimi">{slides.map((slide, index) => <button type="button" key={slide.slideId} aria-label={`${index + 1}. banner`} aria-current={index === active ? "true" : undefined} onClick={() => selectSlide(index)} />)}</div>
    </> : null}
  </section>;
}
