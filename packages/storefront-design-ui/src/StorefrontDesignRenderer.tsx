import type { CSSProperties, ReactNode } from "react";

import type { PublicStorefrontDesign } from "@celebix/saas-contracts";

import { isStorefrontPromotionActive } from "./model.ts";

type DesignStyle = CSSProperties & Record<`--store-${string}`, string>;

const ICONS = Object.freeze({ none: "", sparkle: "✦", truck: "▰", shield: "◇" } as const);

export function StorefrontDesignRenderer({ design, storeName, now, children, compact = false, showHeader = true, showHomeSurfaces = true }: Readonly<{
  design: PublicStorefrontDesign;
  storeName: string;
  now: Date;
  children?: ReactNode;
  compact?: boolean;
  showHeader?: boolean;
  showHomeSurfaces?: boolean;
}>) {
  const style: DesignStyle = {
    "--store-primary": design.brand.primaryColor,
    "--store-accent": design.brand.accentColor,
    "--store-background": design.brand.backgroundColor,
    "--store-text": design.brand.textColor,
  };
  const promotionActive = isStorefrontPromotionActive(design.promotion, now);
  return (
    <div className="celebix-store-design" data-font={design.brand.fontFamily} data-compact={compact ? "true" : "false"} style={style}>
      {design.announcement.enabled ? (
        <div className="celebix-store-announcement" data-speed={design.announcement.speed} data-direction={design.announcement.direction} data-animation={design.announcement.animation} aria-label="Mağaza duyuruları">
          <div>{design.announcement.items.map((item, index) => <span key={`${index}-${item}`}>{ICONS[design.announcement.icon] ? <i aria-hidden="true">{ICONS[design.announcement.icon]}</i> : null}{item}</span>)}</div>
        </div>
      ) : null}
      {showHeader ? <header className="celebix-store-header">
        <a className="celebix-store-brand" href="/" aria-label={`${storeName} ana sayfa`}>
          {design.brand.logo ? <img src={design.brand.logo.url} alt={design.brand.logo.altText || storeName} /> : <strong>{storeName}</strong>}
        </a>
        <nav aria-label="Ana menü"><a href="/">Ana Sayfa</a><a href="/products">Ürünler</a></nav>
        <span className="celebix-store-bag">Çanta <b>0</b></span>
      </header> : null}
      {showHomeSurfaces && design.hero.enabled ? (
        <section className="celebix-store-hero" data-has-image={design.hero.image ? "true" : "false"}>
          <div className="celebix-store-hero-copy"><small>{storeName}</small><h1>{design.hero.headline}</h1>{design.hero.body ? <p>{design.hero.body}</p> : null}{design.hero.destination ? <a href={design.hero.destination.path}>Keşfet</a> : null}</div>
          {design.hero.image ? <img src={design.hero.image.url} alt={design.hero.image.altText} /> : null}
        </section>
      ) : null}
      {showHomeSurfaces && promotionActive ? <aside className="celebix-store-promotion"><div><strong>{design.promotion.headline}</strong>{design.promotion.body ? <span>{design.promotion.body}</span> : null}</div>{design.promotion.destination ? <a href={design.promotion.destination.path}>İncele</a> : null}</aside> : null}
      {children ? <div className="celebix-store-content">{children}</div> : null}
    </div>
  );
}
