import Link from "next/link";
import type { PublicStarterHomeSection } from "@celebix/saas-contracts";

import { formatTry } from "@/lib/format.ts";
import { CampaignHeroClient } from "./CampaignHeroClient";
import styles from "./campaign-home.module.css";

type HeroSection = Extract<PublicStarterHomeSection, { kind: "hero" }>;

export function CampaignHero({ section }: Readonly<{ section: HeroSection }>) {
  return <CampaignHeroClient count={section.slides.length}>{section.slides.map((slide, index) => <article className={styles.heroSlide} key={`${slide.heading}-${index}`}>
    {slide.desktopImage ? <picture><source media="(max-width: 700px)" srcSet={(slide.mobileImage ?? slide.desktopImage).url} />{/* eslint-disable-next-line @next/next/no-img-element */}<img className={styles.heroImage} src={slide.desktopImage.url} alt={slide.desktopImage.altText} width={slide.desktopImage.width} height={slide.desktopImage.height} fetchPriority={index === 0 ? "high" : "auto"} /></picture> : <div className={styles.heroFallback} aria-hidden="true" />}
    <div className={styles.heroShade} /><div className={styles.heroCopy}>{slide.eyebrow ? <span>{slide.eyebrow}</span> : null}<h1>{slide.heading}</h1>{slide.body ? <p>{slide.body}</p> : null}<Link className={styles.heroAction} href={slide.destination}>Koleksiyonu keşfet</Link></div>
    {slide.hotspot ? <Link className={styles.hotspot} href={`/products/${slide.hotspot.productSlug}`} aria-label={`${slide.hotspot.title} ürününü incele`}><span aria-hidden="true">+</span><strong>{slide.hotspot.title}</strong><small>{formatTry(slide.hotspot.priceCents)}</small></Link> : null}
  </article>)}</CampaignHeroClient>;
}
