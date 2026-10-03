import type { CampaignHomeProjection } from "@celebix/saas-data";
import type { PublicStarterHomeSection, PublicStorefrontDesign, PublicStarterThemePresentation } from "@celebix/saas-contracts";

export const LILYUM_HERO_ASSET = "/themes/lilyum/flower-atelier-v1.webp";
const LEGACY_HERO = "e89e5b56-0c5a-5a96-b33d-4daf6234c84c.jpg";
const LEGACY_MOBILE_HERO = "ae93930a-7e43-5874-9342-dd4a7689c5be.jpg";
export const LILYUM_COPY = Object.freeze({ eyebrow: "LILYUM FLORA · ORDU", heading: "Sevdiklerine bir güzellik gönder.", body: "Özenle hazırlanan taze çiçekler, anlamlı anlar için.", cta: "Çiçekleri keşfet" });

export function lilyumBrandTokens(design: PublicStorefrontDesign) {
  const brand = design.brand;
  return {
    "--store-lilyum-primary": brand.primaryColor.toLowerCase() === "#ff5a00" ? "#24493b" : brand.primaryColor,
    "--store-lilyum-background": brand.backgroundColor.toLowerCase() === "#ffffff" ? "#f7f4ee" : brand.backgroundColor,
    "--store-lilyum-text": brand.textColor.toLowerCase() === "#171717" ? "#171b1a" : brand.textColor,
    "--store-lilyum-accent": brand.accentColor.toLowerCase() === "#171717" ? "#b58a53" : brand.accentColor,
  };
}

export function lilyumHomeModel(presentation: PublicStarterThemePresentation, design: PublicStorefrontDesign, projection?: CampaignHomeProjection | null) {
  const sections: readonly PublicStarterHomeSection[] = presentation.schemaVersion === 1 ? [] : presentation.sections;
  const banner = sections.find(section => section.kind === "banner");
  const legacy = sections.find(section => section.kind === "hero");
  const custom = design.publicationVersion > 1 && presentation.schemaVersion !== 4 ? design.hero : null;
  const published = custom?.enabled ? custom.slides[0] : undefined;
  const customSlide = published ? { ...published, destination: published.destination?.path, eyebrow: undefined } : undefined;
  const bannerSlide = banner?.kind === "banner" ? banner.slides.find(slide => slide.enabled) : undefined;
  const heroSlide = legacy?.kind === "hero" ? legacy.slides[0] : undefined;
  const slide = customSlide ?? bannerSlide ?? heroSlide;
  const image = slide?.desktopImage;
  const heading = slide && ("headline" in slide ? slide.headline : slide.heading);
  const oldHero = !image || image.url.endsWith(LEGACY_HERO);
  const mobileImage = slide?.mobileImage;
  const originalMobileImage = oldHero && mobileImage?.url.endsWith(LEGACY_MOBILE_HERO);
  const inheritedSlides = banner?.kind === "banner" ? banner.slides.filter(slide => slide.enabled) : legacy?.kind === "hero" ? legacy.slides : [];
  // Native campaign rendering remains authoritative when an admin publishes multiple slides.
  const multiHeroSection: PublicStarterHomeSection | undefined = published && custom && custom.slides.length > 1
    ? { kind: "banner", layout: "slider", autoplay: false, presentation: "overlay", slides: custom.slides.map((slide, index) => ({
      slideId: `lilyum-design-${index}`, enabled: true, headline: slide.headline, body: slide.body,
      desktopImage: slide.desktopImage ? { ...slide.desktopImage, mediaType: "image/jpeg", width: 2164, height: 727 } : null,
      mobileImage: slide.mobileImage ? { ...slide.mobileImage, mediaType: "image/jpeg", width: 800, height: 800 } : null,
      destination: slide.destination?.path ?? null,
    })) }
    : !published && inheritedSlides.length > 1 ? banner ?? legacy : undefined;
  const hero = {
    enabled: presentation.schemaVersion === 1 ? Boolean(customSlide) || presentation.hero.enabled : Boolean(customSlide ?? bannerSlide ?? heroSlide),
    image: oldHero ? LILYUM_HERO_ASSET : image.url,
    mobileImage: mobileImage && !mobileImage.url.endsWith(LEGACY_HERO) && !originalMobileImage ? mobileImage.url : undefined,
    heading: !heading || heading === presentation.displayName ? LILYUM_COPY.heading : heading,
    body: slide?.body || LILYUM_COPY.body,
    destination: slide?.destination ?? presentation.hero.destination,
    eyebrow: slide?.eyebrow || LILYUM_COPY.eyebrow,
  };
  const categories = sections.filter((section): section is Extract<PublicStarterHomeSection, { kind: "category_grid" }> => section.kind === "category_grid");
  const rows = sections.filter((section): section is Extract<PublicStarterHomeSection, { kind: "product_row" }> => section.kind === "product_row");
  const productsByKey = new Map(projection?.productRows.map(row => [row.key, row.items]) ?? []);
  const productRows = rows.map((section, index) => ({ section, heading: index === 0 && section.heading === "Lilyumlar" ? "Bugünün çiçek seçkisi" : section.heading, products: (productsByKey.get(section.key) ?? []).filter(product => product.available) })).filter(row => row.products.length);
  const story = sections.find(section => section.kind === "brand_story");
  return { hero, multiHeroSection, categories, productRows, story: story?.kind === "brand_story" ? story : undefined };
}

export function lilyumAnnouncement(presentation: PublicStarterThemePresentation, design: PublicStorefrontDesign) {
  const items = presentation.schemaVersion !== 1 ? presentation.announcement?.items ?? [] : design.publicationVersion > 1 ? design.announcement.enabled ? design.announcement.items : [] : presentation.marquee?.items ?? [];
  return items.map(text => text === "Ordu İçerisine 60 Dakika İçinde Teslim" ? "Ordu’da aynı gün çiçek teslimatı" : text).join(" · ");
}
