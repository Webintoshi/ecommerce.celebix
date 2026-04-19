import "server-only";

import { XMLParser } from "fast-xml-parser";
import { buildGeneratedSku } from "@/lib/sku";
import type {
  BulkImportParseResult,
  ParsedProduct,
  ParsedProductImage,
  ParsedVariant,
  ParsedVariantAttribute,
} from "@/lib/admin/product-bulk-import";

type FeedParseOptions = {
  fallbackStock?: number;
};

type FeedCategoryPathSegment = {
  slug: string;
  name: string;
};

type FeedDraftProduct = {
  name: string;
  slug: string;
  description: string;
  shortDescription: string;
  category: string;
  subcategory: string;
  categoryPath: FeedCategoryPathSegment[];
  brand?: string;
  tags: Set<string>;
  images: Map<string, ParsedProductImage>;
  variants: Map<string, ParsedVariant>;
  sourceRows: number[];
  shopifyMetadata?: Record<string, unknown>;
};

type FeedEntryDraft = {
  id: string;
  title: string;
  description: string;
  link: string;
  slug: string;
  groupId: string;
  brand?: string;
  category: string;
  subcategory: string;
  categoryPath: FeedCategoryPathSegment[];
  images: string[];
  tags: string[];
  price: number;
  originalPrice?: number;
  stock: number;
  variantName: string;
  variantAttributes: ParsedVariantAttribute[];
};

const FEED_HEADERS = [
  "id",
  "title",
  "description",
  "link",
  "brand",
  "availability",
  "price",
  "sale_price",
  "product_type",
  "item_group_id",
  "additional_variant_attribute",
  "image_link",
  "additional_image_link",
] as const;

export function parseXmlProductFeed(
  xmlContent: string,
  options: FeedParseOptions = {},
): BulkImportParseResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const fallbackStock = Math.max(1, Math.round(options.fallbackStock ?? 1));

  const cleanedXml = stripUtf8Bom(xmlContent);
  const parser = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false,
    trimValues: true,
    removeNSPrefix: true,
    isArray: (_name, jpath) =>
      jpath === "feed.entry" ||
      jpath === "feed.entry.additional_image_link" ||
      jpath === "feed.entry.additional_variant_attribute" ||
      jpath === "rss.channel.item" ||
      jpath === "rss.channel.item.additional_image_link" ||
      jpath === "rss.channel.item.additional_variant_attribute",
  });

  let parsed: Record<string, unknown>;
  try {
    parsed = parser.parse(cleanedXml) as Record<string, unknown>;
  } catch (error) {
    return {
      headers: [...FEED_HEADERS],
      products: [],
      errors: [
        `XML feed ayrıştırılamadı: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
      ],
      warnings: [],
      skippedRows: 0,
      totalRows: 0,
    };
  }

  const entries = resolveFeedEntries(parsed);
  if (entries.length === 0) {
    return {
      headers: [...FEED_HEADERS],
      products: [],
      errors: ["Feed içinde işlenebilir ürün girdisi bulunamadı."],
      warnings: [],
      skippedRows: 0,
      totalRows: 0,
    };
  }

  warnings.push(
    `Feed stok adedi göndermediği için stok fallback kullanıldı: in stock/preorder = ${fallbackStock}, out of stock = 0.`,
  );

  const drafts = new Map<string, FeedDraftProduct>();
  let skippedRows = 0;

  entries.forEach((entry, index) => {
    const humanRow = index + 1;
    const normalized = normalizeFeedEntry(entry, humanRow, fallbackStock);

    if (!normalized) {
      skippedRows += 1;
      warnings.push(`Satır ${humanRow}: Gerekli feed alanları eksik olduğu için atlandı.`);
      return;
    }

    if (!drafts.has(normalized.groupId)) {
      drafts.set(normalized.groupId, {
        name: normalized.title,
        slug: normalized.slug,
        description: normalized.description,
        shortDescription: normalized.description.slice(0, 160),
        category: normalized.category,
        subcategory: normalized.subcategory,
        categoryPath: normalized.categoryPath,
        brand: normalized.brand,
        tags: new Set(normalized.tags),
        images: new Map<string, ParsedProductImage>(),
        variants: new Map<string, ParsedVariant>(),
        sourceRows: [humanRow],
        shopifyMetadata: buildFeedImportMetadata(normalized),
      });
    }

    const draft = drafts.get(normalized.groupId)!;
    if (!draft.brand && normalized.brand) {
      draft.brand = normalized.brand;
    }
    if (!draft.description && normalized.description) {
      draft.description = normalized.description;
    }
    if (!draft.shortDescription && normalized.description) {
      draft.shortDescription = normalized.description.slice(0, 160);
    }
    if (!draft.category && normalized.category) {
      draft.category = normalized.category;
    }
    if (!draft.subcategory && normalized.subcategory) {
      draft.subcategory = normalized.subcategory;
    }
    if (draft.categoryPath.length === 0 && normalized.categoryPath.length > 0) {
      draft.categoryPath = normalized.categoryPath;
    }
    normalized.tags.forEach((tag) => draft.tags.add(tag));
    draft.sourceRows.push(humanRow);

    normalized.images.forEach((imageUrl) => {
      if (draft.images.has(imageUrl)) {
        return;
      }

      draft.images.set(imageUrl, {
        url: imageUrl,
        alt: normalized.title,
        isPrimary: draft.images.size === 0,
        sortOrder: draft.images.size,
      });
    });

    const variant: ParsedVariant = {
      name: normalized.variantName,
      weight: 0,
      price: normalized.price,
      originalPrice: normalized.originalPrice,
      stock: normalized.stock,
      sku:
        normalized.id ||
        buildGeneratedSku({
          context: `${normalized.groupId}-${normalized.variantName}`,
          index,
        }),
      images: normalized.images.slice(0, 1),
      attributes: normalized.variantAttributes,
    };

    draft.variants.set(buildVariantKey(variant), variant);
  });

  const products: ParsedProduct[] = [];

  drafts.forEach((draft) => {
    const imagesV2 = Array.from(draft.images.values()).slice(0, 12);
    const variants = Array.from(draft.variants.values());

    if (variants.length === 0) {
      warnings.push(`Ürün "${draft.name}" için varyant üretilemediği için ürün atlandı.`);
      return;
    }

    products.push({
      name: draft.name,
      slug: draft.slug,
      description:
        draft.description || `${draft.name} ürünü XML feed üzerinden toplu aktarım ile hazırlandı.`,
      shortDescription:
        draft.shortDescription ||
        draft.description.slice(0, 160) ||
        `${draft.name} ürünü XML feed üzerinden toplu aktarım ile hazırlandı.`,
      category: draft.category || "genel",
      subcategory: draft.subcategory,
      categoryPath: draft.categoryPath,
      images: imagesV2.map((image) => image.url),
      imagesV2,
      tags: Array.from(draft.tags).slice(0, 24),
      vegan: false,
      glutenFree: false,
      sugarFree: false,
      highProtein: false,
      brand: draft.brand,
      status: "published",
      isActive: true,
      isDraft: false,
      seoTitle: draft.name,
      seoDescription:
        draft.shortDescription ||
        draft.description.slice(0, 160) ||
        `${draft.name} ürün detayları XML feed üzerinden alındı.`,
      shopifyMetadata: draft.shopifyMetadata,
      variants,
      sourceRows: Array.from(new Set(draft.sourceRows)).sort((left, right) => left - right),
    });
  });

  return {
    headers: [...FEED_HEADERS],
    products,
    errors,
    warnings,
    skippedRows,
    totalRows: entries.length,
  };
}

function resolveFeedEntries(parsed: Record<string, unknown>): Array<Record<string, unknown>> {
  const atomFeed = asRecord(parsed.feed);
  if (atomFeed) {
    return ensureRecordArray(atomFeed.entry);
  }

  const rss = asRecord(parsed.rss);
  const channel = asRecord(rss?.channel);
  if (channel) {
    return ensureRecordArray(channel.item);
  }

  return [];
}

function normalizeFeedEntry(
  entry: Record<string, unknown>,
  rowIndex: number,
  fallbackStock: number,
): FeedEntryDraft | null {
  const title = cleanText(readText(entry.title));
  const link = cleanText(readText(entry.link));
  const id = cleanText(readText(entry.id));
  const itemGroupId = cleanText(readText(entry.item_group_id));
  const slug = toSlug(extractSlugFromLink(link) || title || itemGroupId || id || `urun-${rowIndex}`);
  const groupId = cleanText(itemGroupId || slug || id || `feed-${rowIndex}`);
  const description =
    cleanText(readText(entry.description)) ||
    title ||
    `Feed satırı ${rowIndex} için açıklama bulunamadı.`;
  const brand = cleanText(readText(entry.brand)) || undefined;
  const productType = cleanText(
    readText(entry.product_type) || readText(entry.google_product_category),
  );
  const { category, subcategory, categoryPath } = mapFeedCategory(productType, title, slug);
  const images = dedupeStrings([
    cleanText(readText(entry.image_link)),
    ...ensureArray(entry.additional_image_link).map((value) => cleanText(readText(value))),
  ]).slice(0, 12);

  const variantAttributes = parseVariantAttributes(entry.additional_variant_attribute);
  const variantName =
    variantAttributes.map((attribute) => attribute.value).join(" / ") || "Standart";

  const regularPrice = parseMoney(readText(entry.price));
  const salePrice = parseMoney(readText(entry.sale_price));
  const { price, originalPrice } = resolvePricing(regularPrice, salePrice);
  if (price <= 0) {
    return null;
  }

  const availability = normalize(cleanText(readText(entry.availability)));
  const stock = mapAvailabilityToStock(availability, fallbackStock);

  return {
    id,
    title: title || slug || `Ürün ${rowIndex}`,
    description,
    link,
    slug: slug || `urun-${rowIndex}`,
    groupId,
    brand,
    category,
    subcategory,
    categoryPath,
    images,
    tags: buildFeedTags({ brand, productType }),
    price,
    originalPrice,
    stock,
    variantName,
    variantAttributes,
  };
}

function parseVariantAttributes(value: unknown): ParsedVariantAttribute[] {
  return ensureArray(value)
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => {
      const name = cleanText(readText(item.label)) || "Seçenek";
      const parsedValue = cleanText(readText(item.value));
      if (!parsedValue) {
        return null;
      }

      return {
        name,
        value: parsedValue,
      } satisfies ParsedVariantAttribute;
    })
    .filter((item): item is ParsedVariantAttribute => Boolean(item));
}

function buildFeedTags(input: { brand?: string; productType: string }): string[] {
  const rawSegments = [
    input.brand,
    ...input.productType
      .split(/[>/|]+/g)
      .flatMap((segment) => segment.split("&"))
      .map((segment) => cleanText(segment)),
  ];

  return dedupeStrings(rawSegments).slice(0, 12);
}

function resolvePricing(
  regularPrice: number,
  salePrice: number,
): { price: number; originalPrice?: number } {
  if (salePrice > 0 && regularPrice > 0 && salePrice < regularPrice) {
    return {
      price: salePrice,
      originalPrice: regularPrice,
    };
  }

  if (regularPrice > 0) {
    return { price: regularPrice };
  }

  if (salePrice > 0) {
    return { price: salePrice };
  }

  return { price: 0 };
}

function mapAvailabilityToStock(availability: string, fallbackStock: number): number {
  if (!availability) {
    return fallbackStock;
  }

  if (availability.includes("outofstock") || availability.includes("out of stock")) {
    return 0;
  }

  if (availability.includes("preorder") || availability.includes("pre order")) {
    return fallbackStock;
  }

  return fallbackStock;
}

function mapFeedCategory(
  rawCategory: string,
  productName: string,
  slug: string,
): { category: string; subcategory: string; categoryPath: FeedCategoryPathSegment[] } {
  const normalizedSource = cleanText(rawCategory || productName || slug);
  if (!normalizedSource) {
    return {
      category: "genel",
      subcategory: "",
      categoryPath: [{ slug: "genel", name: "Genel" }],
    };
  }

  const hierarchy = normalizedSource
    .split(">")
    .map((segment) => cleanText(segment))
    .filter(Boolean);
  const categoryPath = (hierarchy.length > 0 ? hierarchy : [normalizedSource])
    .map((segment) => {
      const normalizedSlug = toSlug(segment);
      if (!normalizedSlug) {
        return null;
      }

      return {
        slug: normalizedSlug,
        name: segment,
      } satisfies FeedCategoryPathSegment;
    })
    .filter((segment): segment is FeedCategoryPathSegment => Boolean(segment));

  if (categoryPath.length > 1) {
    const category = categoryPath[0]?.slug || "genel";
    const subcategorySlug = categoryPath[categoryPath.length - 1]?.slug || "";
    return {
      category,
      subcategory: subcategorySlug !== category ? subcategorySlug : "",
      categoryPath,
    };
  }

  const fallbackCategory = categoryPath[0]?.slug || toSlug(normalizedSource) || "genel";
  return {
    category: fallbackCategory,
    subcategory: "",
    categoryPath:
      categoryPath.length > 0
        ? categoryPath
        : [{ slug: fallbackCategory, name: normalizedSource }],
  };
}

function buildFeedImportMetadata(entry: FeedEntryDraft): Record<string, unknown> {
  return {
    celebix_import_source: {
      kind: "xml_feed",
      rawCategoryPath: entry.categoryPath.map((segment) => segment.name),
      itemGroupId: entry.groupId,
    },
  };
}

function extractSlugFromLink(value: string): string {
  if (!value) {
    return "";
  }

  try {
    const url = new URL(value);
    const lastPathSegment = url.pathname.split("/").filter(Boolean).pop() || "";
    return cleanText(lastPathSegment);
  } catch {
    return cleanText(value.split("/").filter(Boolean).pop() || "");
  }
}

function parseMoney(value: string): number {
  if (!value) {
    return 0;
  }

  return toNumber(value.replace(/[A-Z]{3}$/i, "").trim(), 0);
}

function readText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return readText(value[0]);
  }

  const record = asRecord(value);
  if (record) {
    const direct =
      typeof record["#text"] === "string"
        ? record["#text"]
        : typeof record.text === "string"
          ? record.text
          : typeof record.value === "string"
            ? record.value
            : "";
    return direct;
  }

  return "";
}

function ensureArray<T>(value: T | T[] | undefined | null): T[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (value === undefined || value === null) {
    return [];
  }

  return [value];
}

function ensureRecordArray(value: unknown): Array<Record<string, unknown>> {
  return ensureArray(value)
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function stripUtf8Bom(value: string): string {
  return value.replace(/^\uFEFF/, "");
}

function buildVariantKey(variant: ParsedVariant): string {
  const attributeKey =
    variant.attributes
      ?.map((attribute) => `${toSlug(attribute.name)}:${toSlug(attribute.value)}`)
      .sort()
      .join("|") || "";
  return variant.sku || attributeKey || toSlug(variant.name) || buildGeneratedSku({ context: "variant", index: 0 });
}

function cleanText(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9\s/._-]/g, " ");
}

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function toNumber(value: string, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const normalizedValue = value
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}\b)/g, "")
    .replace(",", ".");
  const parsed = Number.parseFloat(normalizedValue);
  if (Number.isNaN(parsed)) {
    return fallback;
  }

  return parsed;
}

function dedupeStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim())))];
}
