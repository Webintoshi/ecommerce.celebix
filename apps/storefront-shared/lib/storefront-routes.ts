import type { PublicStorefrontDesign } from "@celebix/saas-contracts";

export type StorefrontRouteVariant = "localized" | "legacy";

function isTurkishLocale(locale: string): boolean {
  return locale.toLocaleLowerCase("en-US") === "tr"
    || locale.toLocaleLowerCase("en-US").startsWith("tr-");
}

function routeSuffix(destination: string): Readonly<{ pathname: string; suffix: string }> {
  const suffixIndex = destination.search(/[?#]/u);
  return suffixIndex === -1
    ? Object.freeze({ pathname: destination, suffix: "" })
    : Object.freeze({
        pathname: destination.slice(0, suffixIndex),
        suffix: destination.slice(suffixIndex),
      });
}

export function storefrontRouteVariant(locale: string): StorefrontRouteVariant {
  return isTurkishLocale(locale) ? "localized" : "legacy";
}

export function productIndexPath(locale: string): string {
  return isTurkishLocale(locale) ? "/urunler" : "/products";
}

export function productPath(locale: string, slug: string): string {
  return `${isTurkishLocale(locale) ? "/urun" : "/products"}/${slug}`;
}

export function categoryPath(locale: string, slug: string): string {
  return `${isTurkishLocale(locale) ? "/kategori" : "/categories"}/${slug}`;
}

export function localizeStorefrontPath(destination: string, locale: string): string {
  if (!isTurkishLocale(locale) || !destination.startsWith("/")) return destination;
  const { pathname, suffix } = routeSuffix(destination);
  if (pathname === "/products") return `${productIndexPath(locale)}${suffix}`;
  if (pathname.startsWith("/products/")) {
    return `${productPath(locale, pathname.slice("/products/".length))}${suffix}`;
  }
  if (pathname.startsWith("/categories/")) {
    return `${categoryPath(locale, pathname.slice("/categories/".length))}${suffix}`;
  }
  return destination;
}

export function localizePublicStorefrontDesign(
  design: PublicStorefrontDesign,
  locale: string,
): PublicStorefrontDesign {
  if (!isTurkishLocale(locale)) return design;
  return Object.freeze({
    ...design,
    hero: Object.freeze({
      ...design.hero,
      slides: Object.freeze(design.hero.slides.map((slide) => Object.freeze({
        ...slide,
        destination: slide.destination
          ? Object.freeze({ path: localizeStorefrontPath(slide.destination.path, locale) })
          : null,
      }))),
    }),
    promotion: Object.freeze({
      ...design.promotion,
      destination: design.promotion.destination
        ? Object.freeze({ path: localizeStorefrontPath(design.promotion.destination.path, locale) })
        : null,
    }),
  });
}
