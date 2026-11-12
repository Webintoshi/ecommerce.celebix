"use client";

import { useEffect, useRef, useState } from "react";
import type { PublicStarterHomeSection } from "@celebix/saas-contracts";

type BannerSection = Extract<PublicStarterHomeSection, { kind: "banner" }>;
export function StorefrontBanner({ section, previewMode, destinationHrefs, priority = false, swipeNavigation = false }: Readonly<{
  section: BannerSection;
  previewMode?: "desktop" | "mobile";
  destinationHrefs?: Readonly<Record<string, string>>;
  priority?: boolean;
  swipeNavigation?: boolean;
}>) {
  const destinationHref = (path: string) => destinationHrefs?.[path] ?? path;
  const enabled = section.slides.filter((slide) => slide.enabled && (slide.desktopImage || section.presentation === "overlay"));
  const slides = section.layout === "single" ? enabled.slice(0, 1) : enabled;
  const carousel = section.layout === "slider" && slides.length > 1;
  const canRotate = carousel && section.autoplay;
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const suppressClickUntil = useRef(0);
  const [activeSlide, setActiveSlide] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [rotationRequested, setRotationRequested] = useState(true);
  const rotationControl = useRef<HTMLButtonElement>(null);
  const active = activeSlide < slides.length ? activeSlide : 0;
  useEffect(() => { if (activeSlide >= slides.length) setActiveSlide(0); }, [activeSlide, slides.length]);
  useEffect(() => {
    if (!canRotate) return;
    const motionPreference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const stopForReducedMotion = () => { if (motionPreference?.matches) setRotationRequested(false); };
    stopForReducedMotion();
    motionPreference?.addEventListener?.("change", stopForReducedMotion);
    return () => motionPreference?.removeEventListener?.("change", stopForReducedMotion);
  }, [canRotate]);

  useEffect(() => {
    if (!canRotate || !rotationRequested || hovered) return;
    const timer = window.setInterval(() => setActiveSlide((index) => (index + 1) % slides.length), 5_000);
    return () => window.clearInterval(timer);
  }, [canRotate, rotationRequested, hovered, slides.length]);

  const selectSlide = (index: number) => {
    setRotationRequested(false);
    setActiveSlide((index + slides.length) % slides.length);
  };
  if (!slides.length) return null;
  return <section className="celebix-store-banner" data-layout={section.layout} data-presentation={section.presentation} data-preview-mode={previewMode} data-swipe-navigation={swipeNavigation && carousel ? "true" : undefined}
    aria-roledescription={carousel ? "carousel" : undefined} aria-label="Mağaza bannerları"
    onTouchStart={event => {
      suppressClickUntil.current = 0;
      const touch = event.touches[0];
      touchStart.current = swipeNavigation && carousel && event.touches.length === 1 ? { x: touch.clientX, y: touch.clientY } : null;
    }}
    onTouchCancel={() => { touchStart.current = null; }}
    onTouchEnd={event => {
      const start = touchStart.current, touch = event.changedTouches[0];
      touchStart.current = null;
      if (!start || !touch) return;
      const dx = touch.clientX - start.x, dy = touch.clientY - start.y;
      if (Math.abs(dx) < 40 || Math.abs(dx) <= Math.abs(dy) * 1.5) return;
      suppressClickUntil.current = Date.now() + 500;
      selectSlide(active + (dx < 0 ? 1 : -1));
    }}
    onClickCapture={event => {
      if (Date.now() < suppressClickUntil.current && event.detail > 0 && (event.target as Element).closest("a")) {
        event.preventDefault(); event.stopPropagation(); suppressClickUntil.current = 0;
      }
    }}
    onPointerEnter={event => { if (event.pointerType === "mouse") setHovered(true); }}
    onPointerLeave={event => { if (event.pointerType === "mouse") setHovered(false); }}
    onPointerDown={canRotate ? event => {
      if (!rotationControl.current?.contains(event.target as Node)) setRotationRequested(false);
    } : undefined}
    onFocusCapture={canRotate ? event => {
      if (event.target === rotationControl.current
        && (event.currentTarget.contains(event.relatedTarget) || !event.target.matches(":focus-visible"))) return;
      setRotationRequested(false);
    } : undefined}>
    {canRotate ? <button ref={rotationControl} type="button" className="celebix-store-hero-rotation"
      aria-label={rotationRequested ? "Otomatik geçişi durdur" : "Otomatik geçişi başlat"}
      onClick={() => setRotationRequested(value => !value)}>
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        {rotationRequested ? <path d="M4 3h2.5v10H4zm5.5 0H12v10H9.5z" /> : <path d="M5 2.5 13 8l-8 5.5z" />}
      </svg>
    </button> : null}
    <div className="celebix-store-banner-track">
      {slides.map((slide, index) => {
        const visible = !carousel || index === active;
        const desktop = slide.desktopImage;
        const mobile = slide.mobileImage ?? desktop;
        const selected = previewMode === "mobile" ? mobile : desktop;
        const picture = selected ? <picture>
          {previewMode === undefined && mobile ? <source media="(max-width: 700px)" srcSet={mobile.url} width={mobile.width} height={mobile.height} /> : null}
          <img src={selected.url} alt={selected.altText} width={selected.width} height={selected.height} loading={priority && index === 0 ? "eager" : "lazy"} fetchPriority={priority && index === 0 ? "high" : carousel && !visible ? "low" : undefined} />
        </picture> : <div className="celebix-store-banner-fallback" aria-hidden="true" />;
        return <article key={slide.slideId} data-slide-id={slide.slideId} data-active={visible ? "true" : "false"} className="celebix-store-banner-slide" role={carousel ? "group" : undefined} aria-roledescription={carousel ? "slayt" : undefined} aria-label={carousel ? `${index + 1} / ${slides.length}` : undefined} aria-hidden={!visible || undefined} inert={!visible || undefined}>
          {section.presentation === "image_only" && slide.destination ? <a className="celebix-store-banner-media" href={destinationHref(slide.destination)} tabIndex={visible ? undefined : -1} aria-label={`${slide.headline} bannerını aç`}>{picture}</a> : picture}
          {section.presentation === "overlay" ? <><div className="celebix-store-banner-shade" /><div className="celebix-store-banner-copy">
            {slide.eyebrow ? <span>{slide.eyebrow}</span> : null}<h2>{slide.headline}</h2>{slide.body ? <p>{slide.body}</p> : null}
            {slide.destination ? <a className="celebix-store-banner-action" href={destinationHref(slide.destination)} tabIndex={visible ? undefined : -1}>Koleksiyonu keşfet</a> : null}
          </div></> : <h2 className="celebix-store-hero-title-sr">{slide.headline}</h2>}
          {slide.hotspot ? <a className="celebix-store-banner-hotspot" href={destinationHref(`/products/${slide.hotspot.productSlug}`)} tabIndex={visible ? undefined : -1} aria-label={`${slide.hotspot.title} ürününü incele`}>
            <span aria-hidden="true">+</span><strong>{slide.hotspot.title}</strong>{slide.hotspot.priceCents !== null ? <small>{new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(slide.hotspot.priceCents / 100)}</small> : null}
          </a> : null}
        </article>;
      })}
    </div>
    {carousel ? <>
      <span className="celebix-store-hero-title-sr" aria-live={canRotate && rotationRequested ? "off" : "polite"} aria-atomic="true">{active + 1} / {slides.length}. banner</span>
      <button type="button" className="celebix-store-hero-arrow celebix-store-hero-prev" aria-label="Önceki banner" onClick={() => selectSlide(active - 1)}>‹</button>
      <button type="button" className="celebix-store-hero-arrow celebix-store-hero-next" aria-label="Sonraki banner" onClick={() => selectSlide(active + 1)}>›</button>
      <div className="celebix-store-hero-dots" role="group" aria-label="Banner seçimi">{slides.map((slide, index) => <button type="button" key={slide.slideId} aria-label={`${index + 1}. banner`} aria-current={index === active ? "true" : undefined} onClick={() => selectSlide(index)} />)}</div>
    </> : null}
  </section>;
}
