export const STOREFRONT_DESIGN_FONT_FAMILIES = Object.freeze(["inter", "manrope", "playfair", "montserrat"] as const);
export const STOREFRONT_DESIGN_DESTINATION_KINDS = Object.freeze(["none", "product", "collection", "page"] as const);
export const STOREFRONT_DESIGN_ANNOUNCEMENT_ICONS = Object.freeze(["none", "sparkle", "truck", "shield"] as const);
export const STOREFRONT_DESIGN_ANNOUNCEMENT_SPEEDS = Object.freeze(["slow", "normal", "fast"] as const);
export const STOREFRONT_DESIGN_ANNOUNCEMENT_DIRECTIONS = Object.freeze(["left", "right"] as const);
export const STOREFRONT_DESIGN_ANNOUNCEMENT_ANIMATIONS = Object.freeze(["continuous", "step"] as const);

export type StorefrontDesignFontFamily = (typeof STOREFRONT_DESIGN_FONT_FAMILIES)[number];
export type StorefrontDesignDestinationKind = (typeof STOREFRONT_DESIGN_DESTINATION_KINDS)[number];
export type StorefrontDesignAnnouncementIcon = (typeof STOREFRONT_DESIGN_ANNOUNCEMENT_ICONS)[number];
export type StorefrontDesignAnnouncementSpeed = (typeof STOREFRONT_DESIGN_ANNOUNCEMENT_SPEEDS)[number];
export type StorefrontDesignAnnouncementDirection = (typeof STOREFRONT_DESIGN_ANNOUNCEMENT_DIRECTIONS)[number];
export type StorefrontDesignAnnouncementAnimation = (typeof STOREFRONT_DESIGN_ANNOUNCEMENT_ANIMATIONS)[number];

export type DesignDestination = Readonly<
  | { kind: "none" }
  | { kind: "product" | "collection" | "page"; resourceId: string }
>;

export type DesignMediaReference = Readonly<{ kind: "media"; mediaId: string }> | null;

export type StorefrontDesignBrand = Readonly<{
  logo: DesignMediaReference;
  favicon: DesignMediaReference;
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  fontFamily: StorefrontDesignFontFamily;
}>;

export type StorefrontDesignHeroSlide = Readonly<{
  headline: string;
  body: string;
  desktopImage: DesignMediaReference;
  mobileImage: DesignMediaReference;
  destination: DesignDestination;
  enabled: boolean;
}>;

export type StorefrontDesignHero = Readonly<{
  enabled: boolean;
  slides: readonly StorefrontDesignHeroSlide[];
}>;

export type StorefrontDesignPromotion = Readonly<{
  headline: string;
  body: string;
  destination: DesignDestination;
  startsAt: string | null;
  endsAt: string | null;
  enabled: boolean;
}>;

export type StorefrontDesignAnnouncement = Readonly<{
  items: readonly string[];
  icon: StorefrontDesignAnnouncementIcon;
  speed: StorefrontDesignAnnouncementSpeed;
  direction: StorefrontDesignAnnouncementDirection;
  animation: StorefrontDesignAnnouncementAnimation;
  enabled: boolean;
}>;

export type StorefrontDesignDocument = Readonly<{
  schemaVersion: 2;
  brand: StorefrontDesignBrand;
  hero: StorefrontDesignHero;
  promotion: StorefrontDesignPromotion;
  announcement: StorefrontDesignAnnouncement;
}>;

export type PublicDesignMedia = Readonly<{ url: string; altText: string }> | null;
export type PublicDesignDestination = Readonly<{ path: string }> | null;

export type PublicStorefrontDesignHeroSlide = Readonly<{
  headline: string;
  body: string;
  desktopImage: PublicDesignMedia;
  mobileImage: PublicDesignMedia;
  destination: PublicDesignDestination;
}>;

export type PublicStorefrontDesign = Readonly<{
  schemaVersion: 2;
  publicationVersion: number;
  publishedAt: string;
  brand: Readonly<{
    logo: PublicDesignMedia;
    favicon: PublicDesignMedia;
    primaryColor: string;
    accentColor: string;
    backgroundColor: string;
    textColor: string;
    fontFamily: StorefrontDesignFontFamily;
  }>;
  hero: Readonly<{
    enabled: boolean;
    slides: readonly PublicStorefrontDesignHeroSlide[];
  }>;
  promotion: Readonly<{
    headline: string;
    body: string;
    destination: PublicDesignDestination;
    startsAt: string | null;
    endsAt: string | null;
    enabled: boolean;
  }>;
  announcement: StorefrontDesignAnnouncement;
}>;

export type StorefrontDesignMediaOption = Readonly<{
  id: string;
  url: string;
  altText: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  width: number;
  height: number;
}>;

export type StorefrontDesignDestinationOption = Readonly<{
  kind: "product" | "collection" | "page";
  resourceId: string;
  label: string;
  path: string;
}>;

export type StorefrontDesignWorkspace = Readonly<{
  schemaVersion: 2;
  draftVersion: number;
  publishedVersion: number;
  draftUpdatedAt: string;
  publishedAt: string;
  draft: StorefrontDesignDocument;
  published: PublicStorefrontDesign;
  store: Readonly<{ name: string; timezone: string }>;
  media: readonly StorefrontDesignMediaOption[];
  destinations: readonly StorefrontDesignDestinationOption[];
}>;

export type StorefrontDesignDraftMutation = Readonly<{
  draftVersion: number;
  draftUpdatedAt: string;
  draft: StorefrontDesignDocument;
}>;

export type StorefrontDesignPublicationMutation = Readonly<{
  draftVersion: number;
  publishedVersion: number;
  publishedAt: string;
  published: PublicStorefrontDesign;
}>;

export type StorefrontDesignPublishIssue = Readonly<{
  code: "hero_enabled_slide_missing" | "hero_slide_headline_missing" | "hero_slide_desktop_image_missing";
  slideIndex?: number;
}>;
