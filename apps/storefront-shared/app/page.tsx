import type { Metadata } from "next";
import Link from "next/link";
import { starterMarqueeTokens } from "@celebix/saas-contracts";

import { ProductGrid } from "@/components/ProductGrid";
import { CategoryShowcase } from "@/components/CategoryShowcase";
import { StorefrontFrame } from "@/components/StorefrontFrame";
import { CampaignHome } from "@/components/CampaignHome";
import { resolveStorefrontPage } from "@/lib/page-context.ts";
import { requireStorefrontPage } from "@/lib/page-resolution.ts";

export async function generateMetadata(): Promise<Metadata> {
  const selected = await resolveStorefrontPage();
  if (selected.kind !== "active") return { title: "Mağaza bulunamadı", robots: { index: false, follow: false } };
  const { storefront } = selected.context;
  const { presentation } = storefront;
  const title = presentation.seo.title ?? presentation.displayName;
  const description = presentation.seo.description ?? `${presentation.displayName} yeni ve aktif ürünleri`;
  return {
    title,
    description,
    robots: { index: presentation.seo.allowIndex, follow: presentation.seo.allowIndex },
    alternates: { canonical: storefront.canonicalUrl },
    openGraph: { title, description, type: "website", url: storefront.canonicalUrl, images: presentation.seo.socialImage ? [presentation.seo.socialImage.url] : [] },
  };
}

export default async function HomePage() {
  const context = requireStorefrontPage(await resolveStorefrontPage());
  const { runtime, storefront } = context;
  if (context.campaign) return <CampaignHome storefront={storefront} projection={context.campaign} />;
  const { presentation } = storefront;
  const products = await runtime.repository.listPublicProducts({ storefront, now: new Date(), limit: presentation.theme.homeProductLimit });
  const heroMedia = presentation.hero.image ?? products.items.find((product) => product.media.length)?.media[0];
  const marqueeTokens = presentation.marquee ? starterMarqueeTokens(presentation.marquee) : null;
  return <StorefrontFrame storefront={storefront}>
    {presentation.marquee && marqueeTokens ? <aside className={`store-marquee ${marqueeTokens.iconClass} ${marqueeTokens.speedClass} ${marqueeTokens.directionClass} ${marqueeTokens.animationClass}`} aria-label="Mağaza duyuruları"><span className="marquee-icon" aria-hidden="true">{marqueeTokens.iconSymbol}</span><span className="marquee-track">{presentation.marquee.items.join(" · ")}</span></aside> : null}
    {presentation.promotion ? <Link className="store-promotion" href={presentation.promotion.destination}>{presentation.promotion.headline}{presentation.promotion.body ? <small>{presentation.promotion.body}</small> : null}</Link> : null}
    {presentation.hero.enabled ? <section className={`home-hero ${heroMedia ? "has-hero-media" : ""}`}>
      {heroMedia ? <img className="hero-media" src={heroMedia.url} alt={heroMedia.altText} width={heroMedia.width} height={heroMedia.height} /> : null}
      <div className="store-container hero-copy"><span>YENİ SEÇKİ</span><h1>{presentation.hero.headline}</h1><p>{presentation.hero.body}</p><Link className="store-button" href={presentation.hero.destination}>Koleksiyonu keşfet</Link></div>
    </section> : null}
    {presentation.categoryShowcase ? <CategoryShowcase showcase={presentation.categoryShowcase} /> : null}
    <section className="store-section store-container"><div className="section-heading"><div><span>SEÇİLİ KOLEKSİYON</span><h2>Yeni Ürünler</h2></div><Link href="/products">Tümünü gör →</Link></div><ProductGrid products={products.items} cardStyle={presentation.theme.productCardStyle} imageRatio={presentation.theme.productImageRatio} /></section>
    {presentation.theme.showBrandStory ? <section className="brand-story"><div className="store-container"><span>MAĞAZA DENEYİMİ</span><h2>Az, öz ve özenle seçilmiş.</h2><p>{presentation.displayName}, ürünlerini güvenli Celebix altyapısı üzerinden aynı sade vitrin diliyle sunar.</p></div></section> : null}
  </StorefrontFrame>;
}
