import {
  parsePublicStorefrontDesign,
  parseStorefrontDesignDocument,
  type PublicDesignDestination,
  type PublicDesignMedia,
  type PublicStorefrontDesign,
  type StorefrontDesignDestinationOption,
  type StorefrontDesignDocument,
  type StorefrontDesignHeroSlide,
  type StorefrontDesignMediaOption,
  type StorefrontDesignPromotion,
} from "@celebix/saas-contracts";

type PreviewInput = Readonly<{
  draft: StorefrontDesignDocument;
  publishedVersion: number;
  publishedAt: string;
  media: readonly StorefrontDesignMediaOption[];
  destinations: readonly StorefrontDesignDestinationOption[];
}>;

function invalid(): never { throw new TypeError("storefront_design_preview_invalid"); }

function media(input: PreviewInput, reference: StorefrontDesignDocument["brand"]["logo"]): PublicDesignMedia {
  if (reference === null) return null;
  const selected = input.media.find(({ id }) => id === reference.mediaId);
  if (!selected) invalid();
  return Object.freeze({ url: selected.url, altText: selected.altText });
}

function destination(input: PreviewInput, reference: StorefrontDesignHeroSlide["destination"]): PublicDesignDestination {
  if (reference.kind === "none") return null;
  const selected = input.destinations.find(({ kind, resourceId }) => kind === reference.kind && resourceId === reference.resourceId);
  if (!selected) invalid();
  return Object.freeze({ path: selected.path });
}

export function createPreviewStorefrontDesign(value: PreviewInput): PublicStorefrontDesign {
  try {
    const input = Object.freeze({ ...value, draft: parseStorefrontDesignDocument(value.draft) });
    return parsePublicStorefrontDesign({
      schemaVersion: 2,
      publicationVersion: input.publishedVersion,
      publishedAt: input.publishedAt,
      brand: {
        logo: media(input, input.draft.brand.logo),
        favicon: media(input, input.draft.brand.favicon),
        primaryColor: input.draft.brand.primaryColor,
        accentColor: input.draft.brand.accentColor,
        backgroundColor: input.draft.brand.backgroundColor,
        textColor: input.draft.brand.textColor,
        fontFamily: input.draft.brand.fontFamily,
      },
      hero: {
        enabled: input.draft.hero.enabled,
        slides: input.draft.hero.slides.filter((slide) => slide.enabled).map((slide) => ({
          headline: slide.headline,
          body: slide.body,
          desktopImage: media(input, slide.desktopImage),
          mobileImage: media(input, slide.mobileImage),
          destination: destination(input, slide.destination),
        })),
      },
      promotion: {
        headline: input.draft.promotion.headline,
        body: input.draft.promotion.body,
        destination: destination(input, input.draft.promotion.destination),
        startsAt: input.draft.promotion.startsAt,
        endsAt: input.draft.promotion.endsAt,
        enabled: input.draft.promotion.enabled,
      },
      announcement: input.draft.announcement,
    });
  } catch { return invalid(); }
}

export function isStorefrontPromotionActive(promotion: Pick<StorefrontDesignPromotion, "enabled" | "startsAt" | "endsAt">, now: Date): boolean {
  if (!promotion.enabled || !(now instanceof Date) || !Number.isFinite(now.valueOf())) return false;
  if (promotion.startsAt === null || promotion.endsAt === null) return promotion.startsAt === null && promotion.endsAt === null;
  const timestamp = now.toISOString();
  return promotion.startsAt <= timestamp && timestamp < promotion.endsAt;
}
