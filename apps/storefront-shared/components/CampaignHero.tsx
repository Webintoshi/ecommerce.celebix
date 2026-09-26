import type { PublicStarterHomeSection } from "@celebix/saas-contracts";
import Link from "next/link";

import { formatTry } from "../lib/format.ts";
import { localizeStorefrontPath, productPath } from "../lib/storefront-routes.ts";
import { CampaignHeroClient } from "./CampaignHeroClient";
import styles from "./campaign-home.module.css";

type HeroSection = Extract<PublicStarterHomeSection, { kind: "hero" }>;

export function CampaignHero({ section, locale, prefetch, previewMode }: Readonly<{ section: HeroSection; locale: string; prefetch?: boolean; previewMode?: "desktop" | "mobile" }>) {
  return (
    <CampaignHeroClient count={section.slides.length}>
      {section.slides.map((slide, index) => (
        <article className={styles.heroSlide} key={`${slide.heading}-${index}`}>
          {slide.desktopImage ? (
            <picture>
              {previewMode === undefined ? <source media="(max-width: 700px)" srcSet={(slide.mobileImage ?? slide.desktopImage).url} /> : null}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className={styles.heroImage} src={(previewMode === "mobile" ? slide.mobileImage ?? slide.desktopImage : slide.desktopImage).url} alt={(previewMode === "mobile" ? slide.mobileImage ?? slide.desktopImage : slide.desktopImage).altText} width={slide.desktopImage.width} height={slide.desktopImage.height} fetchPriority={index === 0 ? "high" : "auto"} />
            </picture>
          ) : <div className={styles.heroFallback} aria-hidden="true" />}
          <div className={styles.heroShade} />
          <div className={styles.heroCopy}>
            {slide.eyebrow ? <span>{slide.eyebrow}</span> : null}
            <h1>{slide.heading}</h1>
            {slide.body ? <p>{slide.body}</p> : null}
            <Link className={styles.heroAction} href={localizeStorefrontPath(slide.destination, locale)} prefetch={prefetch}>Koleksiyonu keşfet</Link>
          </div>
          {slide.hotspot ? (
            <Link className={styles.hotspot} href={productPath(locale, slide.hotspot.productSlug)} prefetch={prefetch} aria-label={`${slide.hotspot.title} ürününü incele`}>
              <span aria-hidden="true">+</span><strong>{slide.hotspot.title}</strong><small>{formatTry(slide.hotspot.priceCents)}</small>
            </Link>
          ) : null}
        </article>
      ))}
    </CampaignHeroClient>
  );
}
