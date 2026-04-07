export type GoogleMerchantFeedAvailability =
  | "in_stock"
  | "out_of_stock"
  | "preorder"
  | "backorder";

export type GoogleMerchantFeedCondition = "new" | "refurbished" | "used";

export interface GoogleMerchantFeedSettings {
  contentLanguage: string;
  targetCountry: string;
  currency: string;
  feedLabel: string;
  defaultCondition: GoogleMerchantFeedCondition;
  googleProductCategory?: string;
  customLabel0?: string;
}

export interface GoogleMerchantFeedItem {
  id: string;
  title: string;
  description: string;
  link: string;
  imageLink: string;
  additionalImageLinks?: string[];
  availability: GoogleMerchantFeedAvailability;
  price: string;
  condition: GoogleMerchantFeedCondition;
  brand?: string;
  gtin?: string;
  mpn?: string;
  identifierExists?: "yes" | "no";
  itemGroupId?: string;
  productType?: string;
  googleProductCategory?: string;
  color?: string;
  size?: string;
  material?: string;
  customLabel0?: string;
}

export const DEFAULT_GOOGLE_MERCHANT_FEED_SETTINGS: GoogleMerchantFeedSettings = {
  contentLanguage: "tr",
  targetCountry: "TR",
  currency: "TRY",
  feedLabel: "TR",
  defaultCondition: "new",
};

function asCleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stripHtml(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatOptionalTag(tagName: string, value?: string | null) {
  const normalized = asCleanString(value);
  return normalized ? `    <g:${tagName}>${escapeXml(normalized)}</g:${tagName}>` : "";
}

export function normalizeGoogleMerchantFeedSettings(
  input?: Record<string, unknown> | null,
): GoogleMerchantFeedSettings {
  const contentLanguage =
    asCleanString(input?.contentLanguage).toLowerCase() ||
    DEFAULT_GOOGLE_MERCHANT_FEED_SETTINGS.contentLanguage;
  const targetCountry =
    asCleanString(input?.targetCountry).toUpperCase() ||
    DEFAULT_GOOGLE_MERCHANT_FEED_SETTINGS.targetCountry;
  const currency =
    asCleanString(input?.currency).toUpperCase() ||
    DEFAULT_GOOGLE_MERCHANT_FEED_SETTINGS.currency;
  const feedLabel =
    asCleanString(input?.feedLabel).toUpperCase() ||
    DEFAULT_GOOGLE_MERCHANT_FEED_SETTINGS.feedLabel;
  const defaultCondition = (["new", "refurbished", "used"] as const).includes(
    input?.defaultCondition as GoogleMerchantFeedCondition,
  )
    ? (input?.defaultCondition as GoogleMerchantFeedCondition)
    : DEFAULT_GOOGLE_MERCHANT_FEED_SETTINGS.defaultCondition;

  return {
    contentLanguage,
    targetCountry,
    currency,
    feedLabel,
    defaultCondition,
    googleProductCategory: asCleanString(input?.googleProductCategory) || undefined,
    customLabel0: asCleanString(input?.customLabel0) || undefined,
  };
}

export function normalizeGoogleMerchantText(value: string, maxLength: number) {
  const stripped = stripHtml(value);
  if (stripped.length <= maxLength) {
    return stripped;
  }

  return stripped.slice(0, Math.max(0, maxLength - 1)).trimEnd();
}

export function validateGoogleMerchantFeedItem(item: GoogleMerchantFeedItem) {
  const issues: string[] = [];

  if (!asCleanString(item.id)) issues.push("id eksik");
  if (!asCleanString(item.title)) issues.push("title eksik");
  if (!asCleanString(item.description)) issues.push("description eksik");
  if (!asCleanString(item.link)) issues.push("link eksik");
  if (!asCleanString(item.imageLink)) issues.push("image_link eksik");
  if (!asCleanString(item.price)) issues.push("price eksik");
  if (!asCleanString(item.condition)) issues.push("condition eksik");
  if (!asCleanString(item.availability)) issues.push("availability eksik");

  return issues;
}

export function buildGoogleMerchantFeedXml(input: {
  title: string;
  link: string;
  description: string;
  items: GoogleMerchantFeedItem[];
}) {
  const itemsXml = input.items
    .map((item) => {
      const additionalImages = (item.additionalImageLinks || [])
        .filter(Boolean)
        .map(
          (image) =>
            `    <g:additional_image_link>${escapeXml(asCleanString(image))}</g:additional_image_link>`,
        )
        .join("\n");

      return [
        "  <item>",
        `    <g:id>${escapeXml(asCleanString(item.id))}</g:id>`,
        `    <title>${escapeXml(asCleanString(item.title))}</title>`,
        `    <description>${escapeXml(asCleanString(item.description))}</description>`,
        `    <link>${escapeXml(asCleanString(item.link))}</link>`,
        `    <g:image_link>${escapeXml(asCleanString(item.imageLink))}</g:image_link>`,
        additionalImages,
        `    <g:availability>${escapeXml(item.availability)}</g:availability>`,
        `    <g:price>${escapeXml(asCleanString(item.price))}</g:price>`,
        `    <g:condition>${escapeXml(item.condition)}</g:condition>`,
        formatOptionalTag("brand", item.brand),
        formatOptionalTag("gtin", item.gtin),
        formatOptionalTag("mpn", item.mpn),
        formatOptionalTag("identifier_exists", item.identifierExists),
        formatOptionalTag("item_group_id", item.itemGroupId),
        formatOptionalTag("product_type", item.productType),
        formatOptionalTag("google_product_category", item.googleProductCategory),
        formatOptionalTag("color", item.color),
        formatOptionalTag("size", item.size),
        formatOptionalTag("material", item.material),
        formatOptionalTag("custom_label_0", item.customLabel0),
        "  </item>",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
  <title>${escapeXml(asCleanString(input.title))}</title>
  <link>${escapeXml(asCleanString(input.link))}</link>
  <description>${escapeXml(asCleanString(input.description))}</description>
${itemsXml}
</channel>
</rss>`;
}
