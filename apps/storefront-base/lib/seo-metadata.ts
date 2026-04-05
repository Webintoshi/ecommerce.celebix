import type { Metadata } from "next";
import { getSeoSettings, getStoreInfo } from "@/lib/db/settings";
import { resolveStorefrontDirectAssetUrl } from "@/lib/asset-url";
import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";
import { getRequestOrigin } from "@/lib/request-origin";

type PageKeywords = string[] | string | null | undefined;

type BuildStorePageMetadataInput = {
  pathname: string;
  title?: string | null;
  description?: string | null;
  keywords?: PageKeywords;
  image?: string | null;
  type?: "website" | "article";
  noIndex?: boolean;
  publishedTime?: string;
  modifiedTime?: string;
};

type StoreSeoContext = {
  siteName: string;
  titleSuffix: string;
  defaultTitle: string;
  defaultDescription: string;
  keywords: string[];
  ogImageUrl: string;
  twitterHandle: string;
  robotsIndex: boolean;
  robotsFollow: boolean;
};

function normalizeTitle(value?: string | null) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeDescription(value?: string | null) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeKeywordArray(value: PageKeywords): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || "").trim())
      .filter((item) => item.length > 0);
  }

  if (typeof value !== "string") {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function dedupeKeywords(primary: string[], fallback: string[]) {
  return Array.from(
    new Set(
      [...primary, ...fallback]
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    ),
  );
}

function toAbsoluteAssetUrl(source: string | null | undefined, origin: string) {
  const directUrl = resolveStorefrontDirectAssetUrl(source);

  if (!directUrl) {
    return "";
  }

  if (directUrl.startsWith("/")) {
    return new URL(directUrl, origin).toString();
  }

  return directUrl;
}

function buildPageTitle(title: string, titleSuffix: string) {
  if (!title) {
    return titleSuffix;
  }

  const normalizedSuffix = titleSuffix.trim().toLowerCase();
  const normalizedTitle = title.trim().toLowerCase();
  if (normalizedSuffix && normalizedTitle.includes(normalizedSuffix)) {
    return title;
  }

  return `${title} | ${titleSuffix}`;
}

export async function getStoreSeoContext(): Promise<StoreSeoContext> {
  const [storeInfo, seoSettings] = await Promise.all([getStoreInfo(), getSeoSettings()]);
  const siteName = normalizeTitle(seoSettings.siteName) || storeInfo.name || STOREFRONT_RUNTIME.name;
  const titleSuffix = normalizeTitle(seoSettings.titleSuffix) || siteName;
  const defaultTitle = normalizeTitle(seoSettings.defaultTitle) || siteName;
  const defaultDescription =
    normalizeDescription(seoSettings.defaultDescription) ||
    STOREFRONT_RUNTIME.description ||
    siteName;

  return {
    siteName,
    titleSuffix,
    defaultTitle,
    defaultDescription,
    keywords: dedupeKeywords(normalizeKeywordArray(seoSettings.keywords), [siteName, "e-ticaret"]),
    ogImageUrl: typeof seoSettings.ogImageUrl === "string" ? seoSettings.ogImageUrl.trim() : "",
    twitterHandle: normalizeTitle(seoSettings.twitterHandle),
    robotsIndex: seoSettings.robotsIndex !== false,
    robotsFollow: seoSettings.robotsFollow !== false,
  };
}

export async function buildStoreRootMetadata(pathname: string): Promise<Metadata> {
  const seo = await getStoreSeoContext();
  const requestOrigin = await getRequestOrigin();
  const title = buildPageTitle(seo.defaultTitle, seo.titleSuffix);
  const ogImageUrl = toAbsoluteAssetUrl(seo.ogImageUrl, requestOrigin);
  const ogImages = ogImageUrl ? [{ url: ogImageUrl, alt: seo.siteName }] : undefined;
  const storeInfo = await getStoreInfo();
  const faviconUrl = typeof storeInfo?.faviconUrl === "string" ? storeInfo.faviconUrl.trim() : "";
  const faviconHref = faviconUrl ? `/favicon.ico?v=${encodeURIComponent(faviconUrl)}` : "/favicon.ico";

  return {
    title,
    description: seo.defaultDescription,
    keywords: seo.keywords,
    metadataBase: new URL(requestOrigin),
    icons: {
      icon: faviconHref,
      shortcut: faviconHref,
      apple: faviconHref,
    },
    openGraph: {
      type: "website",
      locale: "tr_TR",
      url: pathname,
      title,
      description: seo.defaultDescription,
      siteName: seo.siteName,
      images: ogImages,
    },
    twitter: {
      card: ogImages?.length ? "summary_large_image" : "summary",
      title,
      description: seo.defaultDescription,
      images: ogImages?.map((item) => item.url),
      creator: seo.twitterHandle || undefined,
      site: seo.twitterHandle || undefined,
    },
    robots: {
      index: seo.robotsIndex,
      follow: seo.robotsFollow,
      googleBot: {
        index: seo.robotsIndex,
        follow: seo.robotsFollow,
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
    alternates: {
      canonical: pathname,
    },
    verification: {
      google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
    },
  };
}

export async function buildStorePageMetadata(
  input: BuildStorePageMetadataInput,
): Promise<Metadata> {
  const seo = await getStoreSeoContext();
  const requestOrigin = await getRequestOrigin();
  const title = buildPageTitle(
    normalizeTitle(input.title) || seo.defaultTitle,
    seo.titleSuffix,
  );
  const description = normalizeDescription(input.description) || seo.defaultDescription;
  const imageUrl =
    toAbsoluteAssetUrl(input.image, requestOrigin) ||
    toAbsoluteAssetUrl(seo.ogImageUrl, requestOrigin);
  const keywords = dedupeKeywords(normalizeKeywordArray(input.keywords), seo.keywords);
  const index = input.noIndex ? false : seo.robotsIndex;
  const follow = input.noIndex ? false : seo.robotsFollow;
  const ogImages = imageUrl ? [{ url: imageUrl, alt: title }] : undefined;

  return {
    title,
    description,
    keywords,
    metadataBase: new URL(requestOrigin),
    alternates: {
      canonical: input.pathname,
    },
    openGraph: {
      title,
      description,
      type: input.type || "website",
      locale: "tr_TR",
      siteName: seo.siteName,
      url: input.pathname,
      images: ogImages,
      publishedTime: input.publishedTime,
      modifiedTime: input.modifiedTime,
    },
    twitter: {
      card: ogImages?.length ? "summary_large_image" : "summary",
      title,
      description,
      images: ogImages?.map((item) => item.url),
      creator: seo.twitterHandle || undefined,
      site: seo.twitterHandle || undefined,
    },
    robots: {
      index,
      follow,
      googleBot: {
        index,
        follow,
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
  };
}
