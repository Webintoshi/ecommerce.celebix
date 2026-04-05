export interface StoreSeoSettings {
  defaultTitle: string;
  titleSuffix: string;
  defaultDescription: string;
  keywords: string[];
  ogImageUrl?: string;
  twitterHandle?: string;
  siteName?: string;
  robotsIndex: boolean;
  robotsFollow: boolean;
}

export const DEFAULT_STORE_SEO_SETTINGS: StoreSeoSettings = {
  defaultTitle: "",
  titleSuffix: "",
  defaultDescription: "",
  keywords: [],
  ogImageUrl: "",
  twitterHandle: "",
  siteName: "",
  robotsIndex: true,
  robotsFollow: true,
};

function normalizeKeywords(input: unknown): string[] {
  if (Array.isArray(input)) {
    return Array.from(
      new Set(
        input
          .map((value) => String(value || "").trim())
          .filter((value) => value.length > 0),
      ),
    );
  }

  if (typeof input === "string") {
    return Array.from(
      new Set(
        input
          .split(",")
          .map((value) => value.trim())
          .filter((value) => value.length > 0),
      ),
    );
  }

  return [];
}

export function normalizeStoreSeoSettings(
  value?: Partial<StoreSeoSettings> | null,
  fallback?: Partial<StoreSeoSettings> | null,
): StoreSeoSettings {
  const merged = {
    ...DEFAULT_STORE_SEO_SETTINGS,
    ...(fallback || {}),
    ...(value || {}),
  };

  return {
    defaultTitle: String(merged.defaultTitle || "").trim(),
    titleSuffix: String(merged.titleSuffix || "").trim(),
    defaultDescription: String(merged.defaultDescription || "").trim(),
    keywords: normalizeKeywords(merged.keywords),
    ogImageUrl: String(merged.ogImageUrl || "").trim(),
    twitterHandle: String(merged.twitterHandle || "").trim(),
    siteName: String(merged.siteName || "").trim(),
    robotsIndex: merged.robotsIndex !== false,
    robotsFollow: merged.robotsFollow !== false,
  };
}

export function serializeSeoKeywords(keywords: string[]): string {
  return normalizeKeywords(keywords).join(", ");
}

