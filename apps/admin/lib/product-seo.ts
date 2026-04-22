import { VALID_PRODUCT_ROBOTS } from "@/lib/product-seo-generator";

export type ProductSEORobots = (typeof VALID_PRODUCT_ROBOTS)[number];

function normalizeWhitespace(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/\s+/g, " ").trim();
}

function isValidAbsoluteUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function normalizeProductSEOText(value: unknown) {
  const normalized = normalizeWhitespace(value);
  return normalized.length > 0 ? normalized : null;
}

export function normalizeProductSEOKeywords(value: unknown) {
  const rawValues: string[] = [];

  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string") {
        rawValues.push(...item.split(/[\n,;]+/g));
      }
    }
  } else if (typeof value === "string") {
    rawValues.push(...value.split(/[\n,;]+/g));
  }

  return Array.from(
    new Set(
      rawValues
        .map((item) => normalizeWhitespace(item))
        .filter((item) => item.length > 0),
    ),
  );
}

export function normalizeProductCanonicalUrl(value: unknown) {
  const normalized = normalizeWhitespace(value);

  if (!normalized) {
    return null;
  }

  if (normalized.startsWith("/")) {
    return normalized;
  }

  if (isValidAbsoluteUrl(normalized)) {
    return normalized;
  }

  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(normalized)) {
    return `https://${normalized}`;
  }

  return null;
}

export function normalizeProductSEORobots(value: unknown, isActive = true): ProductSEORobots {
  const normalized = normalizeWhitespace(value).toLowerCase();

  if (VALID_PRODUCT_ROBOTS.includes(normalized as ProductSEORobots)) {
    return normalized as ProductSEORobots;
  }

  return isActive ? "index,follow" : "noindex,follow";
}
