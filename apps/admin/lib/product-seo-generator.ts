import { buildStorefrontProductUrl, STORE_RUNTIME } from "@/lib/store-runtime";

export const VALID_PRODUCT_ROBOTS = [
  "index,follow",
  "noindex,follow",
  "index,nofollow",
  "noindex,nofollow",
] as const;

export type ProductSeoRobots = (typeof VALID_PRODUCT_ROBOTS)[number];

export type ProductSeoFamily =
  | "apple-watch-strap"
  | "watch-strap"
  | "card-holder"
  | "wallet"
  | "bag"
  | "case"
  | "keychain"
  | "accessory";

export type ProductSeoGeneratorSource = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  short_description?: string | null;
  tags?: string[] | null;
  category?: string | null;
  subcategory?: string | null;
  images?: string[] | null;
  is_active?: boolean | null;
  status?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  seo_keywords?: string[] | null;
  seo_focus_keyword?: string | null;
  canonical_url?: string | null;
  seo_robots?: string | null;
  og_image?: string | null;
  faq?: Array<{ question: string; answer: string }> | null;
};

export type ProductSeoSuggestion = {
  family: ProductSeoFamily;
  title: string;
  description: string;
  focusKeyword: string;
  keywords: string[];
  robots: ProductSeoRobots;
  canonicalUrl: string | null;
  ogImage: string | null;
};

export type ProductSeoAssessment = {
  score: number;
  issues: string[];
  titleLength: number;
  descriptionLength: number;
  keywordCoverageCount: number;
  keywordCoverageTotal: number;
  defaultCanonicalUrl: string;
  effectiveCanonicalUrl: string;
  hasTitle: boolean;
  hasDescription: boolean;
  hasFocusKeyword: boolean;
  hasKeywords: boolean;
  hasCanonicalOverride: boolean;
  hasValidRobots: boolean;
  hasOgImage: boolean;
};

const TITLE_MIN_LENGTH = 35;
const TITLE_MAX_LENGTH = 60;
const DESCRIPTION_MIN_LENGTH = 120;
const DESCRIPTION_MAX_LENGTH = 160;
const SEO_HEALTH_THRESHOLD = 80;

const COLOR_TOKENS = [
  "acı kahve",
  "antrasit",
  "asfalt",
  "bej",
  "camel",
  "cat",
  "kahve",
  "kirmizi",
  "kırmızı",
  "kizil",
  "kızıl",
  "mavi",
  "murdum",
  "oranj",
  "saffiano",
  "siyah",
  "taba",
  "yesil",
  "yeşil",
] as const;

const DEFAULT_BRAND = STORE_RUNTIME.defaultProductBrand || STORE_RUNTIME.name || "Celebix";

export const PRODUCT_SEO_ROBOT_OPTIONS = [
  { value: "index,follow", label: "Index, follow" },
  { value: "noindex,follow", label: "Noindex, follow" },
  { value: "index,nofollow", label: "Index, nofollow" },
  { value: "noindex,nofollow", label: "Noindex, nofollow" },
] as const;

export const PRODUCT_SEO_FAMILY_LABELS: Record<ProductSeoFamily, string> = {
  "apple-watch-strap": "Apple Watch deri kayisi",
  "watch-strap": "deri saat kayisi",
  "card-holder": "deri kartlik",
  wallet: "hakiki deri cuzdan",
  bag: "deri canta",
  case: "deri kilif / kese",
  keychain: "deri anahtarlik",
  accessory: "diger aksesuar",
};

function normalizeSpace(value: string | null | undefined) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeForMatch(value: string | null | undefined) {
  return normalizeSpace(value)
    .toLocaleLowerCase("tr-TR")
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ş/g, "s")
    .replace(/ü/g, "u");
}

function uniqueKeywords(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => normalizeSpace(value))
        .filter((value) => value.length > 0),
    ),
  );
}

function trimTrailingTitlePunctuation(value: string) {
  return normalizeSpace(value)
    .replace(/[-|:,;]+$/g, "")
    .trim();
}

function buildTitleWithBrand(baseTitle: string) {
  const normalizedBase = trimTrailingTitlePunctuation(baseTitle);
  const title = `${normalizedBase} | ${DEFAULT_BRAND}`;

  if (title.length <= TITLE_MAX_LENGTH) {
    return title;
  }

  const compactCandidates = uniqueKeywords([
    normalizedBase
      .replace(/\b(Hakiki|El Yapımı|Premium)\b/gi, "")
      .replace(/\s*-\s*/g, " ")
      .replace(/\bApple Watch Deri Kayış[ıi]\b/gi, "Apple Watch Kayışı")
      .replace(/\bDeri Saat Kayış[ıi]\b/gi, "Saat Kayışı")
      .replace(/\bÇift Katlı\b/gi, "Çift Kat")
      .replace(/\bTek Katlı\b/gi, "Tek Kat"),
    normalizedBase
      .replace(/\s*-\s*/g, " ")
      .replace(/\bApple Watch Deri Kayış[ıi]\b/gi, "Apple Watch Kayışı"),
  ]);

  for (const compactCandidate of compactCandidates) {
    const compactBase = trimTrailingTitlePunctuation(compactCandidate);
    const compactTitle = `${compactBase} | ${DEFAULT_BRAND}`;

    if (compactTitle.length <= TITLE_MAX_LENGTH) {
      return compactTitle;
    }
  }

  const compactBase = trimTrailingTitlePunctuation(compactCandidates[0] || normalizedBase);
  const allowedBaseLength = Math.max(20, TITLE_MAX_LENGTH - DEFAULT_BRAND.length - 3);
  const truncatedBase = compactBase.slice(0, allowedBaseLength);
  const lastWordBoundary = truncatedBase.lastIndexOf(" ");
  const safeBase =
    lastWordBoundary > 24 ? truncatedBase.slice(0, lastWordBoundary) : truncatedBase;
  return `${trimTrailingTitlePunctuation(safeBase)} | ${DEFAULT_BRAND}`;
}

function clampDescription(value: string) {
  const normalized = normalizeSpace(value);

  if (normalized.length <= DESCRIPTION_MAX_LENGTH) {
    return normalized;
  }

  const sliced = normalized.slice(0, DESCRIPTION_MAX_LENGTH - 1);
  const lastWordBoundary = sliced.lastIndexOf(" ");
  const safeSlice = lastWordBoundary > DESCRIPTION_MIN_LENGTH - 15
    ? sliced.slice(0, lastWordBoundary)
    : sliced;
  return `${safeSlice.trim()}.`;
}

function ensureDescriptionLength(primary: string, fallback: string) {
  const normalizedPrimary = clampDescription(primary);

  if (normalizedPrimary.length >= DESCRIPTION_MIN_LENGTH) {
    return normalizedPrimary;
  }

  const extended = clampDescription(`${normalizedPrimary} ${fallback}`);
  return extended.length >= DESCRIPTION_MIN_LENGTH ? extended : normalizedPrimary;
}

function keywordCoverage(text: string, keyword: string) {
  const normalizedText = normalizeForMatch(text);
  const tokens = normalizeForMatch(keyword)
    .split(" ")
    .filter((token) => token.length > 2);

  return tokens.every((token) => normalizedText.includes(token));
}

function isValidCanonicalUrl(value: string | null | undefined) {
  const normalized = normalizeSpace(value);
  if (!normalized) {
    return false;
  }

  if (normalized.startsWith("/")) {
    return true;
  }

  try {
    const url = new URL(normalized);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function getCanonicalPath(value: string) {
  if (value.startsWith("/")) {
    return value.replace(/\/$/, "") || "/";
  }

  try {
    return new URL(value).pathname.replace(/\/$/, "") || "/";
  } catch {
    return "";
  }
}

function isCanonicalOnStoreDomain(value: string) {
  if (value.startsWith("/")) {
    return true;
  }

  try {
    return new URL(value).host === new URL(STORE_RUNTIME.storefrontUrl).host;
  } catch {
    return false;
  }
}

export function isValidProductRobots(value: string | null | undefined): value is ProductSeoRobots {
  return VALID_PRODUCT_ROBOTS.includes(normalizeSpace(value) as ProductSeoRobots);
}

function resolveSeoRobots(product: ProductSeoGeneratorSource): ProductSeoRobots {
  if (isValidProductRobots(product.seo_robots)) {
    return product.seo_robots;
  }

  return product.is_active === false ? "noindex,follow" : "index,follow";
}

function getPrimaryImage(product: ProductSeoGeneratorSource) {
  if (!Array.isArray(product.images)) {
    return null;
  }

  return product.images.find((image) => normalizeSpace(image).length > 0) || null;
}

function inferColorModifier(product: ProductSeoGeneratorSource) {
  const source = normalizeForMatch(`${product.name} ${product.slug}`);

  return COLOR_TOKENS.find((token) => source.includes(normalizeForMatch(token))) || null;
}

function resolveAccessoryKeyword(product: ProductSeoGeneratorSource) {
  const source = normalizeForMatch(`${product.name} ${product.slug}`);

  if (source.includes("airpods")) return "deri AirPods kilifi";
  if (source.includes("airtag")) return "deri AirTag kilifi";
  if (source.includes("pasaport") && source.includes("kilif")) return "deri pasaport kilifi";
  if (source.includes("pasaport") && source.includes("cuzdan")) return "deri pasaport cuzdani";
  if (source.includes("gozluk") && source.includes("kilif")) return "deri gozluk kilifi";
  if (source.includes("gozluk") && source.includes("kutu")) return "deri gozluk kutusu";
  if (source.includes("anahtar") && source.includes("kesesi")) return "deri anahtar kesesi";
  if (source.includes("tutun") && source.includes("kesesi")) return "deri tutun kesesi";
  if (source.includes("saat") && source.includes("kesesi")) return "deri saat kesesi";
  if (source.includes("telefon") && source.includes("canta")) return "deri telefon cantasi";
  if (source.includes("evrak") && source.includes("canta")) return "deri evrak cantasi";
  if (source.includes("omuz") && source.includes("canta")) return "deri omuz cantasi";
  if (source.includes("postaci") && source.includes("canta")) return "deri postaci cantasi";
  if (source.includes("tote") && source.includes("canta")) return "deri tote canta";
  if (source.includes("dopp-kit") || source.includes("makyaj") && source.includes("canta")) {
    return "deri makyaj cantasi";
  }
  if (source.includes("anahtarlik") || source.includes("keyfolder")) return "deri anahtarlik";
  if (source.includes("kalemlik")) return "deri kalemlik";
  if (source.includes("kalem kutusu")) return "deri kalem kutusu";
  if (source.includes("bakim") && source.includes("kremi")) return "deri bakim kremi";
  if (source.includes("tepsi")) return "deri tepsi";
  if (source.includes("bardak")) return "deri bardak altligi";
  if (source.includes("kablo")) return "deri kablo duzenleyici";
  if (source.includes("cakmak")) return "deri cakmak kilifi";

  return "deri aksesuar";
}

function classifyProductFamily(product: ProductSeoGeneratorSource): ProductSeoFamily {
  const source = normalizeForMatch(`${product.name} ${product.slug}`);

  if (source.includes("apple watch")) return "apple-watch-strap";
  if (
    source.includes("saat kayisi") ||
    (source.includes("deri kayis") && !source.includes("apple watch"))
  ) {
    return "watch-strap";
  }
  if (source.includes("kartlik")) return "card-holder";
  if (source.includes("cuzdan")) return "wallet";
  if (
    source.includes("canta") ||
    source.includes("dopp-kit") ||
    source.includes("tote") ||
    source.includes("postaci") ||
    source.includes("omuz")
  ) {
    return "bag";
  }
  if (
    source.includes("kilif") ||
    source.includes("kesesi") ||
    source.includes("airpods") ||
    source.includes("airtag")
  ) {
    return "case";
  }
  if (source.includes("anahtarlik") || source.includes("keyfolder")) return "keychain";
  return "accessory";
}

function resolveFocusKeyword(product: ProductSeoGeneratorSource, family: ProductSeoFamily) {
  switch (family) {
    case "apple-watch-strap":
      return "apple watch deri kayışı";
    case "watch-strap":
      return "deri saat kayışı";
    case "card-holder":
      return "deri kartlık";
    case "wallet":
      return "hakiki deri cüzdan";
    case "bag":
      return resolveAccessoryKeyword(product)
        .replace("kilifi", "kılıfı")
        .replace("canta", "çanta")
        .replace("cantasi", "çantası")
        .replace("cuzdani", "cüzdanı")
        .replace("bakim", "bakım");
    case "case":
      return resolveAccessoryKeyword(product)
        .replace("kilifi", "kılıfı")
        .replace("kesesi", "kesesi")
        .replace("cuzdani", "cüzdanı")
        .replace("gozluk", "gözlük")
        .replace("anahtar", "anahtar")
        .replace("pasaport", "pasaport");
    case "keychain":
      return "deri anahtarlık";
    default:
      return resolveAccessoryKeyword(product)
        .replace("bakim", "bakım")
        .replace("cantasi", "çantası")
        .replace("canta", "çanta")
        .replace("kilifi", "kılıfı")
        .replace("cuzdani", "cüzdanı");
  }
}

function buildKeywords(product: ProductSeoGeneratorSource, family: ProductSeoFamily, focusKeyword: string) {
  const familyKeywords = (() => {
    switch (family) {
      case "apple-watch-strap":
        return [
          "el yapımı apple watch kayışı",
          "hakiki deri apple watch kordonu",
          "apple watch uyumlu kayış",
        ];
      case "watch-strap":
        return [
          "el yapımı saat kayışı",
          "hakiki deri saat kordonu",
          "klasik saat kayışı",
        ];
      case "card-holder":
        return [
          "el yapımı kartlık",
          "hakiki deri kartlık",
          "ince kartlık",
        ];
      case "wallet":
        return [
          "el yapımı deri cüzdan",
          "hakiki deri cüzdan",
          "ince cüzdan",
        ];
      case "bag":
        return [
          "el yapımı deri çanta",
          "hakiki deri çanta",
          normalizeSpace(resolveFocusKeyword(product, family)),
        ];
      case "case":
        return [
          "el yapımı deri aksesuar",
          "hakiki deri kılıf",
          normalizeSpace(resolveFocusKeyword(product, family)),
        ];
      case "keychain":
        return [
          "el yapımı anahtarlık",
          "hakiki deri anahtarlık",
          "günlük deri aksesuar",
        ];
      default:
        return [
          "el yapımı deri aksesuar",
          "hakiki deri aksesuar",
          normalizeSpace(resolveFocusKeyword(product, family)),
        ];
    }
  })();

  return uniqueKeywords([
    focusKeyword,
    ...familyKeywords,
    ...(product.tags || []).slice(0, 2),
  ]).slice(0, 6);
}

function buildTitleBase(product: ProductSeoGeneratorSource, family: ProductSeoFamily, focusKeyword: string) {
  const displayName = normalizeSpace(product.name) || normalizeSpace(product.slug);
  const normalizedDisplayName = normalizeForMatch(displayName);

  if (family === "apple-watch-strap" && !normalizedDisplayName.includes("apple watch")) {
    return `${displayName} Apple Watch Deri Kayışı`;
  }

  if (
    family === "watch-strap" &&
    !normalizedDisplayName.includes("saat kayisi") &&
    !normalizedDisplayName.includes("deri kayis")
  ) {
    return `${displayName} Deri Saat Kayışı`;
  }

  if (family === "card-holder" && !normalizedDisplayName.includes("kartlik")) {
    return `${displayName} Deri Kartlık`;
  }

  if (family === "wallet" && !normalizedDisplayName.includes("cuzdan")) {
    return `${displayName} Hakiki Deri Cüzdan`;
  }

  if (
    family === "bag" &&
    !normalizedDisplayName.includes("canta") &&
    !normalizedDisplayName.includes("çanta")
  ) {
    return `${displayName} Deri Çanta`;
  }

  if (family === "case" && !normalizedDisplayName.includes("kilif") && !normalizedDisplayName.includes("kese")) {
    return `${displayName} ${focusKeyword}`;
  }

  if (family === "keychain" && !normalizedDisplayName.includes("anahtarlik")) {
    return `${displayName} Deri Anahtarlık`;
  }

  return displayName;
}

function buildDescription(product: ProductSeoGeneratorSource, family: ProductSeoFamily, focusKeyword: string) {
  const displayName = normalizeSpace(product.name) || normalizeSpace(product.slug);
  const detailCopy = (() => {
    switch (family) {
      case "apple-watch-strap":
        return "Apple Watch ile uyumlu tasarımıyla günlük kullanımda konfor, dayanıklılık ve güçlü bir görünüm sunar.";
      case "watch-strap":
        return "Klasik saatler için konforlu kullanım, sağlam form ve karakterli bir görünüm sunar.";
      case "card-holder":
        return "Kartlarınızı ince formda düzenli taşımak için işlevsel ve zarif bir seçimdir.";
      case "wallet":
        return "Günlük kullanımda düzen, ince form ve uzun ömürlü kullanım sunar.";
      case "bag":
        return "Günlük kullanımda düzen, dayanıklılık ve zamansız bir görünüm sunar.";
      case "case":
        return "Günlük kullanımda koruma, düzen ve uzun ömürlü kullanım sunar.";
      case "keychain":
        return "Anahtarlarınızı güvenle taşımak için kompakt, dayanıklı ve şık bir çözümdür.";
      default:
        return "Günlük kullanımda işlev, dayanıklılık ve özenli işçilik sunar.";
    }
  })();

  const primary = `${displayName}, el yapımı hakiki deri ${focusKeyword} olarak ${detailCopy} ${DEFAULT_BRAND} atölyesinde özenle hazırlanır.`;
  const fallback = "Premium işçilik ve doğal deri dokusuyla uzun ömürlü bir kullanım deneyimi sağlar.";
  return ensureDescriptionLength(primary, fallback);
}

export function generateProductSeoSuggestion(product: ProductSeoGeneratorSource): ProductSeoSuggestion {
  const family = classifyProductFamily(product);
  const focusKeyword = resolveFocusKeyword(product, family);
  const title = buildTitleWithBrand(buildTitleBase(product, family, focusKeyword));
  const description = buildDescription(product, family, focusKeyword);
  const keywords = buildKeywords(product, family, focusKeyword);
  const robots = resolveSeoRobots(product);
  const canonicalUrl = isValidCanonicalUrl(product.canonical_url) ? normalizeSpace(product.canonical_url) : null;
  const ogImage = normalizeSpace(product.og_image) || getPrimaryImage(product);

  return {
    family,
    title,
    description,
    focusKeyword,
    keywords,
    robots,
    canonicalUrl,
    ogImage,
  };
}

export function assessProductSeo(product: ProductSeoGeneratorSource): ProductSeoAssessment {
  const issues: string[] = [];
  let score = 100;

  const title = normalizeSpace(product.seo_title);
  const description = normalizeSpace(product.seo_description);
  const focusKeyword = normalizeSpace(product.seo_focus_keyword);
  const keywords = Array.isArray(product.seo_keywords)
    ? product.seo_keywords.map((keyword) => normalizeSpace(keyword)).filter(Boolean)
    : [];
  const canonicalOverride = normalizeSpace(product.canonical_url);
  const robots = normalizeSpace(product.seo_robots);
  const ogImage = normalizeSpace(product.og_image) || getPrimaryImage(product) || "";

  if (!title) {
    score -= 20;
    issues.push("Meta başlık eksik");
  } else if (title.length < TITLE_MIN_LENGTH || title.length > TITLE_MAX_LENGTH) {
    score -= 10;
    issues.push(`Meta başlık ${TITLE_MIN_LENGTH}-${TITLE_MAX_LENGTH} karakter aralığında değil`);
  }

  if (!description) {
    score -= 20;
    issues.push("Meta açıklama eksik");
  } else if (description.length < DESCRIPTION_MIN_LENGTH || description.length > DESCRIPTION_MAX_LENGTH) {
    score -= 10;
    issues.push(`Meta açıklama ${DESCRIPTION_MIN_LENGTH}-${DESCRIPTION_MAX_LENGTH} karakter aralığında değil`);
  }

  if (!focusKeyword) {
    score -= 15;
    issues.push("Focus keyword eksik");
  } else {
    if (title && !keywordCoverage(title, focusKeyword)) {
      score -= 10;
      issues.push("Meta başlık focus keyword kapsamıyor");
    }

    if (description && !keywordCoverage(description, focusKeyword)) {
      score -= 10;
      issues.push("Meta açıklama focus keyword kapsamıyor");
    }
  }

  if (keywords.length < 3) {
    score -= 10;
    issues.push("SEO keywords yetersiz");
  } else if (focusKeyword && !keywords.some((keyword) => keywordCoverage(keyword, focusKeyword))) {
    score -= 5;
    issues.push("Focus keyword keyword listesinde yok");
  }

  if (canonicalOverride && !isValidCanonicalUrl(canonicalOverride)) {
    score -= 10;
    issues.push("Canonical override geçersiz");
  }

  if (robots && !isValidProductRobots(robots)) {
    score -= 10;
    issues.push("Robots değeri geçersiz");
  }

  if (!ogImage) {
    score -= 5;
    issues.push("OG görseli eksik");
  }

  if (!product.faq || product.faq.length === 0) {
    score -= 5;
    issues.push("FAQ schema eksik");
  }

  return {
    score: Math.max(0, score),
    issues,
    hasTitle: Boolean(title),
    hasDescription: Boolean(description),
    hasFocusKeyword: Boolean(focusKeyword),
    hasKeywords: keywords.length >= 3,
    hasCanonicalOverride: Boolean(canonicalOverride) && isValidCanonicalUrl(canonicalOverride),
    hasValidRobots: !robots || isValidProductRobots(robots),
    hasOgImage: Boolean(ogImage),
  };
}

export function isWeakProductSeo(product: ProductSeoGeneratorSource) {
  return assessProductSeo(product).score < SEO_HEALTH_THRESHOLD;
}

export function isMissingCriticalProductSeo(product: ProductSeoGeneratorSource) {
  const health = assessProductSeo(product);
  return !health.hasTitle || !health.hasDescription || !health.hasFocusKeyword || !health.hasKeywords;
}
