import {
  buildStorefrontProductUrl,
  buildStorefrontUrl,
  STORE_RUNTIME,
} from "@/lib/store-runtime";
import { normalizeVisibleText } from "@/lib/text-encoding";
import { extractPlainTextFromProductDescription } from "@celebix/platform-config/src/product-description-rich-text";

export type ProductSEORobots =
  | "index,follow"
  | "noindex,follow"
  | "index,nofollow"
  | "noindex,nofollow";

export type ProductSEOFamily =
  | "apple-watch-deri-kayisi"
  | "deri-saat-kayisi"
  | "deri-kartlik"
  | "hakiki-deri-cuzdan"
  | "deri-canta"
  | "deri-kilif-kese"
  | "deri-anahtarlik"
  | "other";

export interface ProductSEOSource {
  name: string;
  slug: string;
  description?: string | null;
  short_description?: string | null;
  category?: string | null;
  subcategory?: string | null;
  tags?: string[] | null;
  images?: string[] | null;
  is_active?: boolean;
  seo_title?: string | null;
  seo_description?: string | null;
  seo_keywords?: string[] | string | null;
  seo_focus_keyword?: string | null;
  canonical_url?: string | null;
  seo_robots?: ProductSEORobots | string | null;
  og_image?: string | null;
}

export interface ProductSEONormalizedFields {
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  focusKeyword: string;
  canonicalUrl: string | null;
  robots: ProductSEORobots;
  ogImage: string | null;
}

export interface ProductSEOIssue {
  code: string;
  severity: "error" | "warning";
  message: string;
}

export interface ProductSEOAuditSummary {
  titlePresent: boolean;
  descriptionPresent: boolean;
  focusKeywordPresent: boolean;
  canonicalOverridePresent: boolean;
  robotsCustom: boolean;
  ogImagePresent: boolean;
}

export interface ProductSEOAudit {
  score: number;
  issues: ProductSEOIssue[];
  summary: ProductSEOAuditSummary;
  titleLength: number;
  descriptionLength: number;
  defaultCanonicalUrl: string;
  effectiveCanonicalUrl: string;
  keywordCoverage: {
    covered: string[];
    missing: string[];
  };
  family: ProductSEOFamily;
}

export interface ProductSEOSuggestion extends ProductSEONormalizedFields {
  family: ProductSEOFamily;
  defaultCanonicalUrl: string;
}

export const DEFAULT_PRODUCT_SEO_ROBOTS: ProductSEORobots = "index,follow";

export const PRODUCT_SEO_ROBOT_OPTIONS: Array<{
  value: ProductSEORobots;
  label: string;
}> = [
  { value: "index,follow", label: "Index, follow" },
  { value: "noindex,follow", label: "Noindex, follow" },
  { value: "index,nofollow", label: "Index, nofollow" },
  { value: "noindex,nofollow", label: "Noindex, nofollow" },
];

export const PRODUCT_SEO_FAMILY_LABELS: Record<ProductSEOFamily, string> = {
  "apple-watch-deri-kayisi": "Apple Watch deri kayisi",
  "deri-saat-kayisi": "deri saat kayisi",
  "deri-kartlik": "deri kartlik",
  "hakiki-deri-cuzdan": "hakiki deri cuzdan",
  "deri-canta": "deri canta",
  "deri-kilif-kese": "deri kilif / kese",
  "deri-anahtarlik": "deri anahtarlik",
  other: "genel deri urun",
};

const FAMILY_KEYWORDS: Record<ProductSEOFamily, string[]> = {
  "apple-watch-deri-kayisi": [
    "apple watch deri kayisi",
    "deri apple watch kordon",
  ],
  "deri-saat-kayisi": [
    "deri saat kayisi",
    "hakiki deri saat kayisi",
  ],
  "deri-kartlik": [
    "deri kartlik",
    "kartlik",
  ],
  "hakiki-deri-cuzdan": [
    "hakiki deri cuzdan",
    "deri cuzdan",
  ],
  "deri-canta": [
    "deri canta",
    "canta",
  ],
  "deri-kilif-kese": [
    "deri kilif",
    "deri kese",
  ],
  "deri-anahtarlik": [
    "deri anahtarlik",
    "anahtarlik",
  ],
  other: [
    "deri urun",
  ],
};

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function toNullableText(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = normalizeVisibleText(value, { collapseWhitespace: true });
  return normalized.length > 0 ? normalized : null;
}

function toSearchText(value: string) {
  return collapseWhitespace(value)
    .toLocaleLowerCase("tr")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ş/g, "s")
    .replace(/ç/g, "c")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u");
}

function uniqueKeywords(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = toSearchText(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function truncateAtWordBoundary(value: string, maxLength: number) {
  const normalized = collapseWhitespace(value);

  if (normalized.length <= maxLength) {
    return normalized;
  }

  const slice = normalized.slice(0, maxLength + 1);
  const boundary = slice.lastIndexOf(" ");
  const trimmed =
    boundary > Math.floor(maxLength * 0.6)
      ? slice.slice(0, boundary)
      : normalized.slice(0, maxLength);

  return trimmed.trim().replace(/[|,-]+$/, "").trim();
}

function buildMetaTitle(productName: string, focusKeyword: string, brand: string) {
  const normalizedName = collapseWhitespace(productName) || focusKeyword;
  const candidates = [
    `${normalizedName} - ${focusKeyword} | ${brand}`,
    `${normalizedName} | ${focusKeyword}`,
    `${normalizedName} | ${brand}`,
    `${focusKeyword} | ${brand}`,
    normalizedName,
  ].map(collapseWhitespace);

  const ideal = candidates.find(
    (candidate) => candidate.length >= 35 && candidate.length <= 60,
  );

  if (ideal) {
    return ideal;
  }

  const withinLimit = candidates.find((candidate) => candidate.length <= 60);
  if (withinLimit) {
    return withinLimit;
  }

  const conciseName = truncateAtWordBoundary(normalizedName, 38);
  const conciseFocus = truncateAtWordBoundary(focusKeyword, 24);
  const shortenedCandidates = [
    `${conciseName} | ${brand}`,
    `${conciseName} - ${conciseFocus}`,
    `${conciseFocus} | ${brand}`,
    conciseName,
  ].map(collapseWhitespace);

  const shortened = shortenedCandidates.find(
    (candidate) => candidate.length >= 30 && candidate.length <= 60,
  );

  if (shortened) {
    return shortened;
  }

  return truncateAtWordBoundary(shortenedCandidates[0], 60);
}

function buildMetaDescription(
  productName: string,
  focusKeyword: string,
  brand: string,
) {
  let description = collapseWhitespace(
    `${productName}, ${focusKeyword} arayanlar icin ${brand} koleksiyonunda yer alir. ` +
      "Olcu, stok ve teslimat detaylarini urun sayfasinda inceleyin.",
  );

  if (description.length < 120) {
    description = collapseWhitespace(
      `${description} Guncel urun ozellikleri ve fiyat bilgisi ayni sayfada yer alir.`,
    );
  }

  if (description.length < 120) {
    description = collapseWhitespace(
      `${description} Siparis oncesi tum teknik detaylar bu sayfada sunulur.`,
    );
  }

  return truncateAtWordBoundary(description, 160);
}

function resolveCanonicalCandidate(value: string) {
  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(value)) {
    return `https://${value}`;
  }

  if (value.startsWith("/")) {
    return buildStorefrontUrl(value);
  }

  return buildStorefrontUrl(`/${value.replace(/^\/+/, "")}`);
}

function getDefaultRobots(isActive: boolean | undefined) {
  return isActive === false ? "noindex,follow" : DEFAULT_PRODUCT_SEO_ROBOTS;
}

function textIncludesKeyword(content: string, keyword: string) {
  const normalizedContent = toSearchText(content);
  const normalizedKeyword = toSearchText(keyword);
  return normalizedKeyword.length > 0 && normalizedContent.includes(normalizedKeyword);
}

export function normalizeProductSEOText(value: unknown) {
  return toNullableText(value);
}

export function normalizeProductSEOKeywords(value: unknown) {
  const rawValues: string[] = [];

  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string") {
        rawValues.push(...item.split(/[,;\n]/g));
      }
    }
  } else if (typeof value === "string") {
    rawValues.push(...value.split(/[,;\n]/g));
  }

  return uniqueKeywords(
    rawValues
      .map((keyword) => collapseWhitespace(keyword))
      .filter(Boolean),
  );
}

export function normalizeProductSEORobots(
  value: unknown,
  isActive: boolean | undefined,
): ProductSEORobots {
  const normalized = toNullableText(value);

  if (
    normalized === "index,follow" ||
    normalized === "noindex,follow" ||
    normalized === "index,nofollow" ||
    normalized === "noindex,nofollow"
  ) {
    return normalized;
  }

  return getDefaultRobots(isActive);
}

export function normalizeProductCanonicalUrl(value: unknown) {
  const normalized = toNullableText(value);

  if (!normalized) {
    return null;
  }

  try {
    return new URL(resolveCanonicalCandidate(normalized)).toString();
  } catch {
    return null;
  }
}

export function normalizeProductSEOFields(
  source: ProductSEOSource,
): ProductSEONormalizedFields {
  const ogImage = toNullableText(source.og_image) ?? toNullableText(source.images?.[0]);

  return {
    metaTitle: toNullableText(source.seo_title) ?? "",
    metaDescription: toNullableText(source.seo_description) ?? "",
    keywords: normalizeProductSEOKeywords(source.seo_keywords),
    focusKeyword: toNullableText(source.seo_focus_keyword) ?? "",
    canonicalUrl: normalizeProductCanonicalUrl(source.canonical_url),
    robots: normalizeProductSEORobots(source.seo_robots, source.is_active),
    ogImage,
  };
}

export function classifyProductSEOFamily(source: ProductSEOSource): ProductSEOFamily {
  const plainDescription = extractPlainTextFromProductDescription(
    source.description || source.short_description || "",
  );
  const haystack = toSearchText(
    [
      source.name,
      source.slug,
      source.category,
      source.subcategory,
      ...(source.tags || []),
      plainDescription,
    ]
      .filter(Boolean)
      .join(" "),
  );

  const hasAppleWatch = /(apple watch)/.test(haystack);
  const hasWatchStrap = /(saat|watch).*(kayis|kordon|strap|band)|(?:kayis|kordon|strap|band).*(saat|watch)/.test(
    haystack,
  );

  if (hasAppleWatch && /(kayis|kordon|strap|band)/.test(haystack)) {
    return "apple-watch-deri-kayisi";
  }

  if (hasWatchStrap) {
    return "deri-saat-kayisi";
  }

  if (/(kartlik|card holder|cardholder)/.test(haystack)) {
    return "deri-kartlik";
  }

  if (/(cuzdan|wallet)/.test(haystack)) {
    return "hakiki-deri-cuzdan";
  }

  if (/(canta|bag)/.test(haystack)) {
    return "deri-canta";
  }

  if (/(kilif|kese|case|pouch|sleeve)/.test(haystack)) {
    return "deri-kilif-kese";
  }

  if (/(anahtarlik|keychain|key holder)/.test(haystack)) {
    return "deri-anahtarlik";
  }

  return "other";
}

export function buildProductSEOSuggestion(
  source: ProductSEOSource,
): ProductSEOSuggestion {
  const family = classifyProductSEOFamily(source);
  const focusKeyword = FAMILY_KEYWORDS[family][0];
  const productName = collapseWhitespace(source.name) || focusKeyword;
  const brand =
    toNullableText(STORE_RUNTIME.defaultProductBrand) ||
    toNullableText(STORE_RUNTIME.name) ||
    "Celebix";
  const defaultCanonicalUrl = buildStorefrontProductUrl(source.slug);

  return {
    family,
    metaTitle: buildMetaTitle(productName, focusKeyword, brand),
    metaDescription: buildMetaDescription(productName, focusKeyword, brand),
    keywords: normalizeProductSEOKeywords([
      focusKeyword,
      productName,
      brand,
      ...FAMILY_KEYWORDS[family].slice(1),
    ]),
    focusKeyword,
    canonicalUrl: null,
    robots: getDefaultRobots(source.is_active),
    ogImage: toNullableText(source.og_image) ?? toNullableText(source.images?.[0]),
    defaultCanonicalUrl,
  };
}

export function auditProductSEO(source: ProductSEOSource): ProductSEOAudit {
  const normalized = normalizeProductSEOFields(source);
  const suggestion = buildProductSEOSuggestion(source);
  const title = normalized.metaTitle;
  const description = normalized.metaDescription;
  const focusKeyword = normalized.focusKeyword;
  const effectiveCanonicalUrl =
    normalized.canonicalUrl || suggestion.defaultCanonicalUrl;
  const keywords = normalized.keywords;
  const searchableContent = [
    source.name,
    title,
    description,
    source.short_description,
  ]
    .filter(Boolean)
    .join(" ");
  const coveredKeywords = keywords.filter((keyword) =>
    textIncludesKeyword(searchableContent, keyword),
  );
  const missingKeywords = keywords.filter(
    (keyword) => !coveredKeywords.includes(keyword),
  );
  const defaultRobots = getDefaultRobots(source.is_active);
  const titlePresent = title.length > 0;
  const descriptionPresent = description.length > 0;
  const focusKeywordPresent = focusKeyword.length > 0;
  const canonicalOverridePresent =
    Boolean(normalized.canonicalUrl) &&
    normalized.canonicalUrl !== suggestion.defaultCanonicalUrl;
  const robotsCustom = normalized.robots !== defaultRobots;
  const ogImagePresent = Boolean(normalized.ogImage);
  const issues: ProductSEOIssue[] = [];
  let score = 100;

  if (!titlePresent) {
    issues.push({
      code: "missing-title",
      severity: "error",
      message: "Meta title eksik.",
    });
    score -= 18;
  } else if (title.length < 35 || title.length > 60) {
    issues.push({
      code: "title-length",
      severity: "warning",
      message: "Meta title 35-60 karakter araliginda olmali.",
    });
    score -= 8;
  }

  if (!descriptionPresent) {
    issues.push({
      code: "missing-description",
      severity: "error",
      message: "Meta description eksik.",
    });
    score -= 18;
  } else if (description.length < 120 || description.length > 160) {
    issues.push({
      code: "description-length",
      severity: "warning",
      message: "Meta description 120-160 karakter araliginda olmali.",
    });
    score -= 8;
  }

  if (!focusKeywordPresent) {
    issues.push({
      code: "missing-focus-keyword",
      severity: "error",
      message: "Focus keyword eksik.",
    });
    score -= 12;
  } else {
    if (!textIncludesKeyword(title, focusKeyword)) {
      issues.push({
        code: "focus-missing-title",
        severity: "warning",
        message: "Focus keyword title icinde gecmiyor.",
      });
      score -= 8;
    }

    if (!textIncludesKeyword(description, focusKeyword)) {
      issues.push({
        code: "focus-missing-description",
        severity: "warning",
        message: "Focus keyword description icinde gecmiyor.",
      });
      score -= 8;
    }
  }

  if (keywords.length === 0) {
    issues.push({
      code: "missing-keywords",
      severity: "warning",
      message: "SEO keywords listesi bos.",
    });
    score -= 8;
  } else if (coveredKeywords.length === 0) {
    issues.push({
      code: "keywords-coverage-zero",
      severity: "warning",
      message: "Keywords title veya description icinde yer almiyor.",
    });
    score -= 8;
  } else if (coveredKeywords.length < Math.min(2, keywords.length)) {
    issues.push({
      code: "keywords-coverage-low",
      severity: "warning",
      message: "Keyword kapsami dusuk; title ve description ile daha iyi eslesmeli.",
    });
    score -= 5;
  }

  if (normalized.canonicalUrl) {
    try {
      const currentCanonical = new URL(normalized.canonicalUrl);
      const defaultCanonical = new URL(suggestion.defaultCanonicalUrl);
      const currentPath = currentCanonical.pathname.replace(/\/$/, "");
      const defaultPath = defaultCanonical.pathname.replace(/\/$/, "");

      if (currentCanonical.host !== defaultCanonical.host) {
        issues.push({
          code: "canonical-off-domain",
          severity: "error",
          message: "Canonical URL store domaini disina cikiyor.",
        });
        score -= 12;
      } else if (currentPath !== defaultPath) {
        issues.push({
          code: "canonical-path-mismatch",
          severity: "warning",
          message: "Canonical URL urun slug yoluyla eslesmiyor.",
        });
        score -= 6;
      }
    } catch {
      issues.push({
        code: "canonical-invalid",
        severity: "error",
        message: "Canonical URL gecersiz.",
      });
      score -= 12;
    }
  }

  if (source.is_active !== false && normalized.robots !== "index,follow") {
    issues.push({
      code: "robots-active-product",
      severity: "warning",
      message: "Aktif urunler icin robots genelde index,follow olmali.",
    });
    score -= 6;
  }

  if (source.is_active === false && normalized.robots === "index,follow") {
    issues.push({
      code: "robots-inactive-product",
      severity: "warning",
      message: "Pasif urunler icin noindex tavsiye edilir.",
    });
    score -= 6;
  }

  return {
    score: Math.max(0, score),
    issues,
    summary: {
      titlePresent,
      descriptionPresent,
      focusKeywordPresent,
      canonicalOverridePresent,
      robotsCustom,
      ogImagePresent,
    },
    titleLength: title.length,
    descriptionLength: description.length,
    defaultCanonicalUrl: suggestion.defaultCanonicalUrl,
    effectiveCanonicalUrl,
    keywordCoverage: {
      covered: coveredKeywords,
      missing: missingKeywords,
    },
    family: suggestion.family,
  };
}
