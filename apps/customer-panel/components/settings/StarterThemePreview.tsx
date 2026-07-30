"use client";

import { starterThemeTokens, type PublicStarterThemePresentation } from "@celebix/saas-contracts";
import { useState } from "react";

import styles from "./design-settings.module.css";

type PreviewMode = "desktop" | "mobile";

export function StarterThemePreview({
  presentation,
  storefrontHostname,
}: Readonly<{
  presentation: PublicStarterThemePresentation;
  storefrontHostname: string | null;
}>) {
  const [mode, setMode] = useState<PreviewMode>("desktop");
  const tokens = starterThemeTokens(presentation);
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
        {presentation.marquee ? <div className={styles.previewMarquee}>{presentation.marquee.items.join(" · ")}</div> : null}
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
