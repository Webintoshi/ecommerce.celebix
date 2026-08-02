"use client";

import { starterMarqueeTokens, starterThemeTokens, type PublicStarterThemePresentation, type StarterThemeComposition } from "@celebix/saas-contracts";
import { useState } from "react";

import styles from "./design-settings.module.css";

type PreviewMode = "desktop" | "mobile";

type PreviewProps = Readonly<{ presentation: PublicStarterThemePresentation; composition?: never; storefrontHostname: string | null }>
  | Readonly<{ composition: StarterThemeComposition; presentation?: never; storefrontHostname: string | null }>;

export function StarterThemePreview(props: PreviewProps) {
  const [mode, setMode] = useState<PreviewMode>("desktop");
  if (props.composition) {
    const composition = props.composition;
    const hero = composition.sections.find((section) => section.kind === "hero");
    const productRow = composition.sections.find((section) => section.kind === "product_row");
    const values = composition.sections.find((section) => section.kind === "value_propositions");
    const testimonials = composition.sections.find((section) => section.kind === "testimonials");
    const announcementContent = <span className={styles.previewMarqueeTrack}>{composition.announcement.items.join(" · ")}</span>;
    return <section className={styles.previewSection} aria-labelledby="starter-composition-preview-title">
      <div className={styles.previewHeading}><div><p className={styles.eyebrow}>Taslak önizleme</p><h2 id="starter-composition-preview-title">Campaign Starter</h2><p>{props.storefrontHostname ?? "Kaydetmeden önce güvenli yerleşim önizlemesi"}</p></div><div className={styles.previewModes} aria-label="Önizleme boyutu">{(["desktop", "mobile"] as const).map((candidate) => <button aria-pressed={mode === candidate} className={styles.modeButton} key={candidate} onClick={() => setMode(candidate)} type="button">{candidate === "desktop" ? "Masaüstü" : "Mobil"}</button>)}</div></div>
      <div className={`${styles.previewViewport} ${styles[mode]}`}><div className={`${styles.previewStore} ${styles[`theme-${composition.visual.colorScheme}`]} ${styles[`heading-${composition.visual.headingStyle}`]} ${styles[`cards-${composition.visual.productCardStyle}`]} ${styles[`images-${composition.visual.productImageRatio}`]} ${styles[`corner-${composition.visual.cornerStyle}`]}`}>
        {composition.announcement.enabled ? composition.announcement.destination
          ? <a className={styles.previewMarquee} href={composition.announcement.destination}>{announcementContent}</a>
          : <div className={styles.previewMarquee}>{announcementContent}</div> : null}
        <header className={styles.previewNav}><strong>Mağazanız</strong><span>{composition.navigation.rootCategoryIds.length} menü kategorisi</span></header>
        {hero?.kind === "hero" && hero.enabled ? <div className={styles.previewHero}><div><small>{hero.slides[0]?.eyebrow ?? "Yeni sezon"}</small><h3>{hero.slides[0]?.heading}</h3><p>{hero.slides[0]?.body ?? "Kampanya mesajınız burada görünür."}</p><span>Keşfet</span></div><div className={styles.previewMedia} aria-label="Seçili güvenli hero görseli" /></div> : null}
        {productRow?.kind === "product_row" ? <div className={styles.previewProducts} aria-label="Ürün sırası önizlemesi">{[1, 2, 3].map((number) => <article key={number}><div className={styles.previewProductMedia} /><strong>{productRow.heading}</strong><small>Kalıcı katalog verisi</small></article>)}</div> : null}
        {values?.kind === "value_propositions" && values.enabled ? <div className={styles.previewProducts} aria-label="Değer önerileri önizlemesi">{values.items.map((item) => <article key={item.heading}><strong>{item.heading}</strong><small>{item.body}</small></article>)}</div> : null}
        {testimonials?.kind === "testimonials" && testimonials.enabled ? <section className={styles.previewCart} aria-label="Müşteri yorumları önizlemesi"><strong>{testimonials.heading}</strong><p>Yalnız yayımlanmış, en az {testimonials.minimumRating} yıldızlı onaylı ürün yorumları · en fazla {testimonials.limit}</p></section> : null}
        <div className={styles.previewExperience}>
          <section aria-label="Ürün detayı önizlemesi" className={`${styles.previewGallery} ${styles[`gallery-${composition.productDetail.galleryStyle}`]}`}>
            <strong>{composition.productDetail.galleryStyle === "grid" ? "Izgara galeri" : "Kaydırmalı galeri"}</strong>
            <div><i /><i /><i /></div>
            <p>{[composition.productDetail.showBrand ? "Marka" : null, composition.productDetail.showSku ? "SKU" : null, "showBreadcrumbs" in composition.productDetail && composition.productDetail.showBreadcrumbs ? "İçerik yolu" : null, composition.productDetail.showRelatedProducts ? "Benzer ürünler" : null, "showApprovedReviews" in composition.productDetail && composition.productDetail.showApprovedReviews ? "Onaylı yorumlar" : null, "showSizeGuide" in composition.productDetail && composition.productDetail.showSizeGuide ? "Boyut rehberi" : null].filter(Boolean).join(" · ") || "Ek ürün bilgisi kapalı"}</p>
            {"informationSections" in composition.productDetail ? <small>{composition.productDetail.informationSections.join(" · ")}</small> : null}
            <small>{composition.productDetail.mobileStickyPurchase ? "Mobil satın alma sabit" : "Mobil satın alma normal akışta"}</small>
          </section>
          <section aria-label="Sepet önizlemesi" className={styles.previewCart}>
            <strong>Sepet</strong>
            {composition.cart.showCheckoutReadiness ? <span>Ödemeye hazır</span> : <span>Hazırlık durumu gizli</span>}
            {composition.cart.trustMessage ? <p>{composition.cart.trustMessage}</p> : null}
            {composition.cart.showShippingProgress ? <small>Kargo ilerlemesi gösterilmiyor: canonical ücretsiz kargo eşiği sağlanmadı.</small> : null}
          </section>
        </div>
        {composition.schemaVersion === 2 ? <footer className={styles.previewCart} aria-label="Footer önizlemesi"><strong>Footer · {composition.footer.tone === "dark" ? "Koyu" : "Açık"}</strong><p>{composition.footer.groups.map(({ heading }) => heading).join(" · ")}</p><small>{composition.footer.newsletter.enabled ? "Bülten etkin" : "Bülten kapalı"} · {composition.footer.social.length} sosyal profil</small></footer> : null}
      </div></div><p className={styles.previewNotice}>Önizleme satış verisi üretmez; yayınlanan vitrin yalnız kalıcı katalog ve R2 verisini kullanır.</p>
    </section>;
  }
  const { presentation, storefrontHostname } = props;
  const tokens = starterThemeTokens(presentation);
  const marqueeTokens = presentation.marquee ? starterMarqueeTokens(presentation.marquee) : null;
  return <section className={styles.previewSection} aria-labelledby="starter-theme-preview-title">
    <div className={styles.previewHeading}>
      <div>
        <p className={styles.eyebrow}>Starter tema</p>
        <h2 id="starter-theme-preview-title">Vitrin önizlemesi</h2>
        <p>{storefrontHostname ?? "Doğrulanmış vitrin alanı henüz bulunmuyor."}</p>
      </div>
      <div className={styles.previewModes} aria-label="Önizleme boyutu">
        {(["desktop", "mobile"] as const).map((candidate) => <button
          aria-pressed={mode === candidate}
          className={styles.modeButton}
          key={candidate}
          onClick={() => setMode(candidate)}
          type="button"
        >{candidate === "desktop" ? "Masaüstü" : "Mobil"}</button>)}
      </div>
    </div>
    <div className={`${styles.previewViewport} ${styles[mode]}`}>
      <div className={`${styles.previewStore} ${styles[tokens.schemeClass]} ${styles[tokens.headingClass]} ${styles[tokens.cardClass]} ${styles[tokens.imageClass]}`}>
        {presentation.marquee && marqueeTokens ? <div className={`${styles.previewMarquee} ${styles[marqueeTokens.speedClass]} ${styles[marqueeTokens.directionClass]} ${styles[marqueeTokens.animationClass]}`}><span aria-hidden="true">{marqueeTokens.iconSymbol}</span><span className={styles.previewMarqueeTrack}>{presentation.marquee.items.join(" · ")}</span></div> : null}
        <header className={styles.previewNav}>
          <strong>{presentation.displayName}</strong>
          <span>Ürünler</span>
        </header>
        {presentation.promotion ? <a className={styles.previewPromotion} href={presentation.promotion.destination}>{presentation.promotion.headline}</a> : null}
        {presentation.hero.enabled ? <div className={styles.previewHero}>
          <div><small>Yeni sezon</small><h3>{presentation.hero.headline}</h3><p>{presentation.hero.body}</p><span>Ürünleri keşfet</span></div>
          <div className={styles.previewMedia} aria-label="Örnek içerik görsel alanı" />
        </div> : null}
        <div className={styles.previewProducts} aria-label="Örnek içerik ürün kartları">
          {["Örnek ürün", "Yeni seçki", "Mağaza favorisi"].map((label) => <article key={label}>
            <div className={styles.previewProductMedia} /><strong>{label}</strong><small>Örnek içerik</small>
          </article>)}
        </div>
      </div>
    </div>
    <p className={styles.previewNotice}>Bu alan tema yerleşimini örnek içerikle gösterir; satış, stok veya sipariş verisi üretmez.</p>
  </section>;
}
