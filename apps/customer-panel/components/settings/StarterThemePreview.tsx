"use client";

import {
  starterMarqueeTokens,
  starterThemeTokens,
  type PublicStarterThemePresentation,
  type StarterThemeComposition,
} from "@celebix/saas-contracts";
import { Monitor, Smartphone } from "lucide-react";
import { useState } from "react";

import { starterThemeCategoryPlaceholderLabels } from "@/lib/starter-theme-composer-model";
import styles from "./starter-theme-preview.module.css";

type PreviewMode = "desktop" | "mobile";

type PreviewProps =
  | Readonly<{
    presentation: PublicStarterThemePresentation;
    composition?: never;
    productTitles?: never;
    storefrontHostname: string | null;
  }>
  | Readonly<{
    composition: StarterThemeComposition;
    presentation?: never;
    productTitles: readonly string[];
    storefrontHostname: string | null;
  }>;

const MODES = Object.freeze([
  Object.freeze({ id: "desktop" as const, label: "Masaüstü", Icon: Monitor }),
  Object.freeze({ id: "mobile" as const, label: "Mobil", Icon: Smartphone }),
]);

function PreviewModePicker({ mode, setMode }: Readonly<{
  mode: PreviewMode;
  setMode: (mode: PreviewMode) => void;
}>) {
  return <div className={styles.previewModes} aria-label="Önizleme boyutu">
    {MODES.map(({ id, label, Icon }) => <button
      aria-label={`${label} önizleme`}
      aria-pressed={mode === id}
      className={styles.modeButton}
      key={id}
      onClick={() => setMode(id)}
      type="button"
    >
      <Icon aria-hidden="true" />
      <span>{label}</span>
    </button>)}
  </div>;
}

function ProductCards({ heading, productTitles }: Readonly<{
  heading: string;
  productTitles: readonly string[];
}>) {
  const visibleTitles = productTitles.length > 0 ? productTitles.slice(0, 3) : ["Katalog ürünü"];
  return <section className={styles.productSection} aria-label="Ürün sırası önizlemesi">
    <div className={styles.sectionTitle}><h4>{heading}</h4><span>Tümünü gör</span></div>
    <div className={styles.previewProducts}>
      {visibleTitles.map((title, index) => <article key={`${title}-${index}`}>
        <div className={styles.previewProductMedia} aria-hidden="true"><span>{index + 1}</span></div>
        <strong>{title}</strong>
        <small>Aktif katalog</small>
      </article>)}
    </div>
  </section>;
}

export function StarterThemePreview(props: PreviewProps) {
  const [mode, setMode] = useState<PreviewMode>("desktop");

  if (props.composition) {
    const composition = props.composition;
    const hero = composition.sections.find((section) => section.kind === "hero");
    const productRow = composition.sections.find((section) => section.kind === "product_row");
    const values = composition.sections.find((section) => section.kind === "value_propositions");
    const testimonials = composition.sections.find((section) => section.kind === "testimonials");
    const categoryPlaceholders = starterThemeCategoryPlaceholderLabels(composition);
    const announcementContent = <span className={styles.previewMarqueeTrack}>{composition.announcement.items.join(" · ")}</span>;

    return <section className={styles.previewSection} aria-labelledby="starter-composition-preview-title">
      <div className={styles.previewHeading}>
        <div>
          <h2 id="starter-composition-preview-title">Mağaza önizlemesi</h2>
          <p>{props.storefrontHostname ?? "Kaydedilmemiş taslak"}</p>
        </div>
        <PreviewModePicker mode={mode} setMode={setMode} />
      </div>

      <div className={`${styles.previewViewport} ${styles[mode]}`}>
        <div className={`${styles.previewStore} ${styles[`theme-${composition.visual.colorScheme}`]} ${styles[`heading-${composition.visual.headingStyle}`]} ${styles[`cards-${composition.visual.productCardStyle}`]} ${styles[`images-${composition.visual.productImageRatio}`]} ${styles[`corner-${composition.visual.cornerStyle}`]}`}>
          {composition.announcement.enabled ? composition.announcement.destination
            ? <a className={styles.previewMarquee} href={composition.announcement.destination}>{announcementContent}</a>
            : <div className={styles.previewMarquee}>{announcementContent}</div>
            : null}

          <header className={styles.previewNav}>
            <strong>Mağazanız</strong>
            <nav aria-label="Mağaza menüsü">
              <span>Yeni</span><span>Koleksiyon</span><span>Hakkımızda</span>
            </nav>
            <span className={styles.previewCart}>Sepet · 0</span>
          </header>

          {hero?.kind === "hero" && hero.enabled ? <section className={styles.previewHero}>
            <div>
              <small>{hero.slides[0]?.eyebrow ?? "Yeni sezon"}</small>
              <h3>{hero.slides[0]?.heading ?? "Yeni koleksiyonu keşfedin"}</h3>
              {hero.slides[0]?.body ? <p>{hero.slides[0].body}</p> : null}
              <span>Şimdi keşfet</span>
            </div>
            <div className={styles.previewMedia} aria-label="Seçili hero görsel alanı"><i /><i /></div>
          </section> : null}

          {productRow?.kind === "product_row"
            ? <ProductCards heading={productRow.heading} productTitles={props.productTitles} />
            : null}

          {categoryPlaceholders.length ? <section className={styles.previewCategoryPlaceholders} aria-label="Kategori görsel alanları">
            {categoryPlaceholders.slice(0, 3).map((label, index) => <article key={label}>
              <div aria-hidden="true"><span>{String(index + 1).padStart(2, "0")}</span></div>
              <strong>{label}</strong>
            </article>)}
          </section> : null}

          {values?.kind === "value_propositions" && values.enabled ? <section className={styles.previewValues} aria-label="Değer önerileri önizlemesi">
            {values.items.map((item) => <article key={item.heading}><i aria-hidden="true" /><div><strong>{item.heading}</strong><small>{item.body}</small></div></article>)}
          </section> : null}

          {testimonials?.kind === "testimonials" && testimonials.enabled ? <section className={styles.previewTestimonial} aria-label="Müşteri yorumları önizlemesi">
            <span aria-hidden="true">★★★★★</span><strong>{testimonials.heading}</strong>
            <small>En az {testimonials.minimumRating} yıldızlı onaylı ürün yorumları</small>
          </section> : null}

          <div className={styles.previewExperience}>
            <section aria-label="Ürün detayı önizlemesi" className={`${styles.previewGallery} ${styles[`gallery-${composition.productDetail.galleryStyle}`]}`}>
              <div><i /><i /><i /></div>
              <strong>{composition.productDetail.galleryStyle === "grid" ? "Izgara ürün galerisi" : "Kaydırmalı ürün galerisi"}</strong>
              <p>{[
                composition.productDetail.showBrand ? "Marka" : null,
                composition.productDetail.showSku ? "SKU" : null,
                "showBreadcrumbs" in composition.productDetail && composition.productDetail.showBreadcrumbs ? "İçerik yolu" : null,
                composition.productDetail.showRelatedProducts ? "Benzer ürünler" : null,
                "showApprovedReviews" in composition.productDetail && composition.productDetail.showApprovedReviews ? "Onaylı yorumlar" : null,
                "showSizeGuide" in composition.productDetail && composition.productDetail.showSizeGuide ? "Boyut rehberi" : null,
              ].filter(Boolean).join(" · ") || "Ek ürün bilgisi kapalı"}</p>
              {"informationSections" in composition.productDetail ? <small>{composition.productDetail.informationSections.map((item) => ({
                description: "Açıklama",
                materials_and_care: "Malzeme ve bakım",
                certifications: "Sertifikalar",
                shipping_and_returns: "Kargo ve iade",
              })[item]).join(" · ")}</small> : null}
            </section>
            <section aria-label="Sepet önizlemesi" className={styles.previewCheckout}>
              <span>Sepet</span>
              <strong>{composition.cart.showCheckoutReadiness ? "Ödemeye hazır" : "Sepetiniz"}</strong>
              {composition.cart.trustMessage ? <p>{composition.cart.trustMessage}</p> : null}
              <button type="button">Ödemeye geç</button>
              <small>{composition.productDetail.mobileStickyPurchase ? "Mobil satın alma sabit" : "Mobil satın alma sayfa akışında"}</small>
              {composition.cart.showShippingProgress ? <small>Kargo ilerlemesi gösterilmiyor: canonical ücretsiz kargo eşiği sağlanmadı.</small> : null}
            </section>
          </div>

          {composition.schemaVersion === 2 ? <footer className={styles.previewFooter} aria-label="Footer önizlemesi">
            <strong>Mağazanız</strong>
            <span>{composition.footer.groups.map(({ heading }) => heading).join(" · ")}</span>
            <small>{composition.footer.newsletter.enabled ? "Bülten etkin" : "Bülten kapalı"} · {composition.footer.social.length} sosyal profil</small>
          </footer> : null}
        </div>
      </div>
      <p className={styles.previewNotice}>Değişiklikler yalnız yayınladığınızda müşterilere görünür.</p>
    </section>;
  }

  const { presentation, storefrontHostname } = props;
  const tokens = starterThemeTokens(presentation);
  const marqueeTokens = presentation.marquee ? starterMarqueeTokens(presentation.marquee) : null;

  return <section className={styles.previewSection} aria-labelledby="starter-theme-preview-title">
    <div className={styles.previewHeading}>
      <div><h2 id="starter-theme-preview-title">Mağaza önizlemesi</h2><p>{storefrontHostname ?? "Doğrulanmış vitrin bekleniyor"}</p></div>
      <PreviewModePicker mode={mode} setMode={setMode} />
    </div>
    <div className={`${styles.previewViewport} ${styles[mode]}`}>
      <div className={`${styles.previewStore} ${styles[tokens.schemeClass]} ${styles[tokens.headingClass]} ${styles[tokens.cardClass]} ${styles[tokens.imageClass]}`}>
        {presentation.marquee && marqueeTokens ? <div className={`${styles.previewMarquee} ${styles[marqueeTokens.speedClass]} ${styles[marqueeTokens.directionClass]} ${styles[marqueeTokens.animationClass]}`}><span aria-hidden="true">{marqueeTokens.iconSymbol}</span><span className={styles.previewMarqueeTrack}>{presentation.marquee.items.join(" · ")}</span></div> : null}
        <header className={styles.previewNav}><strong>{presentation.displayName}</strong><nav aria-label="Mağaza menüsü"><span>Ürünler</span><span>Yeni</span></nav><span className={styles.previewCart}>Sepet · 0</span></header>
        {presentation.promotion ? <a className={styles.previewPromotion} href={presentation.promotion.destination}>{presentation.promotion.headline}</a> : null}
        {presentation.hero.enabled ? <section className={styles.previewHero}><div><small>Yeni sezon</small><h3>{presentation.hero.headline}</h3><p>{presentation.hero.body}</p><span>Ürünleri keşfet</span></div><div className={styles.previewMedia} aria-label="Örnek içerik görsel alanı"><i /><i /></div></section> : null}
        <ProductCards heading="Yeni seçkiler" productTitles={["Örnek ürün", "Yeni seçki", "Mağaza favorisi"]} />
      </div>
    </div>
    <p className={styles.previewNotice}>Bu alan tema yerleşimini örnek içerikle gösterir.</p>
  </section>;
}
