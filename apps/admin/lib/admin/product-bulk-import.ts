export type BulkImportProvider =
  | "woocommerce"
  | "shopify"
  | "ideasoft"
  | "ticimax"
  | "tsoft"
  | "ikas"
  | "opencart"
  | "prestashop"
  | "magento"
  | "bigcommerce"
  | "wix"
  | "generic";

type ParsedProductStatus = "draft" | "published" | "archived" | "scheduled";

export interface ParsedProductImage {
  url: string;
  alt: string;
  isPrimary: boolean;
  sortOrder: number;
}

export interface ParsedVariantAttribute {
  name: string;
  value: string;
  linked_to?: string;
  color_code?: string | null;
  image_url?: string | null;
  attribute?: {
    id: string;
    name: string;
  };
}

export interface ParsedVariant {
  name: string;
  weight: number;
  price: number;
  originalPrice?: number;
  stock: number;
  sku: string;
  images?: string[];
  cost?: number;
  barcode?: string;
  unit?: string;
  groupName?: string;
  attributes?: ParsedVariantAttribute[];
  shopifyMetadata?: Record<string, unknown>;
}

export interface ParsedProduct {
  name: string;
  slug: string;
  description: string;
  shortDescription: string;
  category: string;
  subcategory: string;
  images: string[];
  imagesV2?: ParsedProductImage[];
  tags: string[];
  vegan: boolean;
  glutenFree: boolean;
  sugarFree: boolean;
  highProtein: boolean;
  brand?: string;
  status?: ParsedProductStatus;
  isActive?: boolean;
  isDraft?: boolean;
  publishedAt?: string | null;
  seoTitle?: string;
  seoDescription?: string;
  shopifyMetafields?: Record<string, string>;
  shopifyMetadata?: Record<string, unknown>;
  variants: ParsedVariant[];
  sourceRows: number[];
}

export interface BulkImportParseResult {
  headers: string[];
  products: ParsedProduct[];
  errors: string[];
  warnings: string[];
  skippedRows: number;
  totalRows: number;
}

interface ProviderDefinition {
  id: BulkImportProvider;
  label: string;
  description: string;
  templateHeaders: string[];
  templateRow: string[];
  aliases: Partial<Record<CanonicalField, string[]>>;
}

type CanonicalField =
  | "name"
  | "slug"
  | "description"
  | "shortDescription"
  | "category"
  | "tags"
  | "published"
  | "status"
  | "variantName"
  | "weight"
  | "price"
  | "compareAtPrice"
  | "stock"
  | "sku"
  | "images";

type ShopifyField =
  | "handle"
  | "title"
  | "bodyHtml"
  | "vendor"
  | "productCategory"
  | "type"
  | "tags"
  | "published"
  | "status"
  | "option1Name"
  | "option1Value"
  | "option1LinkedTo"
  | "option2Name"
  | "option2Value"
  | "option2LinkedTo"
  | "option3Name"
  | "option3Value"
  | "option3LinkedTo"
  | "variantSku"
  | "variantGrams"
  | "variantInventoryTracker"
  | "variantInventoryQty"
  | "variantInventoryPolicy"
  | "variantFulfillmentService"
  | "variantPrice"
  | "variantCompareAtPrice"
  | "variantRequiresShipping"
  | "variantTaxable"
  | "unitPriceTotalMeasure"
  | "unitPriceTotalMeasureUnit"
  | "unitPriceBaseMeasure"
  | "unitPriceBaseMeasureUnit"
  | "variantBarcode"
  | "imageSrc"
  | "imagePosition"
  | "imageAltText"
  | "giftCard"
  | "seoTitle"
  | "seoDescription"
  | "bandMaterial"
  | "claspType"
  | "colorPattern"
  | "watchAccessoryStyle"
  | "variantImage"
  | "variantWeightUnit"
  | "variantTaxCode"
  | "costPerItem";

const BASE_ALIASES: Record<CanonicalField, string[]> = {
  name: ["urun adi", "name", "title", "product name"],
  slug: ["slug", "handle", "url", "permalink"],
  description: ["aciklama", "description", "body", "body (html)", "full description"],
  shortDescription: ["kisa aciklama", "short description", "excerpt"],
  category: ["kategori", "category", "categories", "urun kategorisi"],
  tags: ["etiket", "etiketler", "tags"],
  published: ["yayinda", "published", "is published", "visible"],
  status: ["status", "durum"],
  variantName: ["varyant", "varyant adi", "variant", "option1 value", "attribute 1 value(s)"],
  weight: ["agirlik", "weight", "grams", "variant grams"],
  price: ["fiyat", "price", "regular price", "variant price"],
  compareAtPrice: ["indirim oncesi fiyat", "compare at price", "sale price", "variant compare at price"],
  stock: ["stok", "stock", "stock quantity", "inventory", "variant inventory qty"],
  sku: ["sku", "stok kodu", "stock code", "variant sku"],
  images: ["gorseller", "image", "image src", "images"],
};

const SHOPIFY_ALIASES: Record<ShopifyField, string[]> = {
  handle: ["handle"],
  title: ["title"],
  bodyHtml: ["body (html)", "body html", "body"],
  vendor: ["vendor"],
  productCategory: ["product category"],
  type: ["type"],
  tags: ["tags"],
  published: ["published"],
  status: ["status"],
  option1Name: ["option1 name"],
  option1Value: ["option1 value"],
  option1LinkedTo: ["option1 linked to"],
  option2Name: ["option2 name"],
  option2Value: ["option2 value"],
  option2LinkedTo: ["option2 linked to"],
  option3Name: ["option3 name"],
  option3Value: ["option3 value"],
  option3LinkedTo: ["option3 linked to"],
  variantSku: ["variant sku"],
  variantGrams: ["variant grams"],
  variantInventoryTracker: ["variant inventory tracker"],
  variantInventoryQty: ["variant inventory qty"],
  variantInventoryPolicy: ["variant inventory policy"],
  variantFulfillmentService: ["variant fulfillment service"],
  variantPrice: ["variant price"],
  variantCompareAtPrice: ["variant compare at price"],
  variantRequiresShipping: ["variant requires shipping"],
  variantTaxable: ["variant taxable"],
  unitPriceTotalMeasure: ["unit price total measure"],
  unitPriceTotalMeasureUnit: ["unit price total measure unit"],
  unitPriceBaseMeasure: ["unit price base measure"],
  unitPriceBaseMeasureUnit: ["unit price base measure unit"],
  variantBarcode: ["variant barcode"],
  imageSrc: ["image src"],
  imagePosition: ["image position"],
  imageAltText: ["image alt text"],
  giftCard: ["gift card"],
  seoTitle: ["seo title"],
  seoDescription: ["seo description"],
  bandMaterial: [
    "bant malzemesi (product.metafields.shopify.band-material)",
    "product.metafields.shopify.band-material",
    "bant malzemesi",
  ],
  claspType: [
    "kenetleme turu (product.metafields.shopify.clasp-type)",
    "kenetleme turu",
    "product.metafields.shopify.clasp-type",
  ],
  colorPattern: [
    "renk (product.metafields.shopify.color-pattern)",
    "renk",
    "product.metafields.shopify.color-pattern",
  ],
  watchAccessoryStyle: [
    "saat aksesuar stili (product.metafields.shopify.watch-accessory-style)",
    "saat aksesuar stili",
    "product.metafields.shopify.watch-accessory-style",
  ],
  variantImage: ["variant image"],
  variantWeightUnit: ["variant weight unit"],
  variantTaxCode: ["variant tax code"],
  costPerItem: ["cost per item"],
};

const PROVIDERS: ProviderDefinition[] = [
  {
    id: "woocommerce",
    label: "WooCommerce",
    description: "WooCommerce CSV formati",
    templateHeaders: ["Name", "Slug", "Description", "Short description", "Categories", "SKU", "Regular price", "Sale price", "Stock", "Images", "Attribute 1 value(s)", "Weight (kg)", "Published"],
    templateRow: ["Ornek Urun", "ornek-urun", "Aciklama", "Kisa aciklama", "Kategori", "SKU-1", "100", "90", "10", "https://cdn.example.com/1.jpg", "Standart", "0.45", "1"],
    aliases: {
      variantName: ["attribute 1 value(s)", "option1 value"],
      published: ["published"],
    },
  },
  {
    id: "shopify",
    label: "Shopify",
    description: "Shopify Products CSV formati",
    templateHeaders: [
      "Handle",
      "Title",
      "Body (HTML)",
      "Vendor",
      "Product Category",
      "Type",
      "Tags",
      "Published",
      "Option1 Name",
      "Option1 Value",
      "Option1 Linked To",
      "Option2 Name",
      "Option2 Value",
      "Option2 Linked To",
      "Option3 Name",
      "Option3 Value",
      "Option3 Linked To",
      "Variant SKU",
      "Variant Grams",
      "Variant Inventory Tracker",
      "Variant Inventory Qty",
      "Variant Inventory Policy",
      "Variant Fulfillment Service",
      "Variant Price",
      "Variant Compare At Price",
      "Variant Requires Shipping",
      "Variant Taxable",
      "Unit Price Total Measure",
      "Unit Price Total Measure Unit",
      "Unit Price Base Measure",
      "Unit Price Base Measure Unit",
      "Variant Barcode",
      "Image Src",
      "Image Position",
      "Image Alt Text",
      "Gift Card",
      "SEO Title",
      "SEO Description",
      "Bant malzemesi (product.metafields.shopify.band-material)",
      "Kenetleme Turu (product.metafields.shopify.clasp-type)",
      "Renk (product.metafields.shopify.color-pattern)",
      "Saat aksesuar stili (product.metafields.shopify.watch-accessory-style)",
      "Variant Image",
      "Variant Weight Unit",
      "Variant Tax Code",
      "Cost per item",
      "Status",
    ],
    templateRow: [
      "classic-deri-kordon",
      "Classic Deri Kordon",
      "<p>El yapimi premium deri saat kordonu.</p>",
      "Celebix Atelier",
      "Apparel & Accessories > Jewelry > Watch Accessories",
      "Deri Kordon",
      "deri,el-yapimi,klasik",
      "TRUE",
      "Renk",
      "Siyah",
      "product.metafields.shopify.color-pattern",
      "Kasa",
      "42mm",
      "",
      "Toka",
      "Silver",
      "",
      "CLK-BLK-42-SLV",
      "120",
      "shopify",
      "15",
      "deny",
      "manual",
      "1499",
      "1699",
      "TRUE",
      "TRUE",
      "",
      "",
      "",
      "",
      "8680000000001",
      "https://cdn.celebix.app/products/kordon-siyah.jpg",
      "1",
      "Siyah deri kordon",
      "FALSE",
      "Classic Deri Kordon",
      "El yapimi premium deri saat kordonu.",
      "Hakiki deri",
      "Tokali",
      "Siyah",
      "Klasik",
      "https://cdn.celebix.app/products/kordon-siyah-variant.jpg",
      "g",
      "",
      "420",
      "active",
    ],
    aliases: {
      slug: ["handle"],
      name: ["title"],
      description: ["body (html)"],
      category: ["product category", "type"],
      variantName: ["option1 value"],
      weight: ["variant grams"],
      stock: ["variant inventory qty"],
      compareAtPrice: ["variant compare at price"],
    },
  },
  {
    id: "ideasoft",
    label: "IdeaSoft",
    description: "IdeaSoft format",
    templateHeaders: ["Urun Adi", "Seo Link", "Kategori", "Kisa Aciklama", "Aciklama", "Stok Kodu", "Fiyat", "Stok Adedi", "Gorseller", "Varyant Adi"],
    templateRow: ["Ornek Urun", "ornek-urun", "Kategori", "Kisa", "Aciklama", "SKU-1", "100", "10", "https://cdn.example.com/1.jpg", "Standart"],
    aliases: {
      slug: ["seo link", "seolink"],
      shortDescription: ["kisa aciklama"],
      stock: ["stok adedi"],
      images: ["gorseller"],
    },
  },
  {
    id: "ticimax",
    label: "Ticimax",
    description: "Ticimax format",
    templateHeaders: ["Urun Adi", "SEO Url", "Kategori", "Aciklama", "Kisa Aciklama", "Stok Kodu", "Barkod", "Satis Fiyati", "Piyasa Fiyati", "Stok", "Resim 1", "Resim 2", "Varyant"],
    templateRow: ["Ornek Urun", "ornek-urun", "Kategori", "Aciklama", "Kisa", "SKU-1", "", "100", "120", "10", "https://cdn.example.com/1.jpg", "https://cdn.example.com/2.jpg", "Standart"],
    aliases: {
      slug: ["seo url"],
      price: ["satis fiyati"],
      compareAtPrice: ["piyasa fiyati"],
      images: ["resim 1", "resim1", "gorsel 1"],
    },
  },
  {
    id: "tsoft",
    label: "T-Soft",
    description: "T-Soft format",
    templateHeaders: ["Urun Adi", "Seo", "Kategori", "Aciklama", "Kisa Aciklama", "Stok Kodu", "Fiyat", "Indirimli Fiyat", "Stok", "Resim", "Varyant"],
    templateRow: ["Ornek Urun", "ornek-urun", "Kategori", "Aciklama", "Kisa", "SKU-1", "100", "90", "10", "https://cdn.example.com/1.jpg", "Standart"],
    aliases: {
      slug: ["seo"],
      compareAtPrice: ["indirimli fiyat"],
      images: ["resim"],
    },
  },
  {
    id: "ikas",
    label: "ikas",
    description: "ikas format",
    templateHeaders: ["name", "slug", "description", "category", "tags", "sku", "price", "compare_at_price", "inventory", "weight", "images", "status", "variant"],
    templateRow: ["Ornek Urun", "ornek-urun", "Aciklama", "Kategori", "etiket", "SKU-1", "100", "120", "10", "450", "https://cdn.example.com/1.jpg", "active", "Standart"],
    aliases: {
      compareAtPrice: ["compare_at_price"],
      stock: ["inventory"],
    },
  },
  {
    id: "opencart",
    label: "OpenCart",
    description: "OpenCart format",
    templateHeaders: ["name", "seo_keyword", "description", "meta_description", "category", "sku", "price", "quantity", "image", "status", "model"],
    templateRow: ["Ornek Urun", "ornek-urun", "Aciklama", "Kisa", "Kategori", "SKU-1", "100", "10", "https://cdn.example.com/1.jpg", "1", "Standart"],
    aliases: {
      slug: ["seo_keyword"],
      shortDescription: ["meta_description"],
      stock: ["quantity"],
      variantName: ["model"],
      images: ["image"],
    },
  },
  {
    id: "prestashop",
    label: "PrestaShop",
    description: "PrestaShop format",
    templateHeaders: ["Name", "URL rewritten", "Description", "Short description", "Categories", "Reference", "Price tax excluded", "Quantity", "Image URLs", "Active", "Supplier reference"],
    templateRow: ["Ornek Urun", "ornek-urun", "Aciklama", "Kisa", "Kategori", "SKU-1", "100", "10", "https://cdn.example.com/1.jpg", "1", "Standart"],
    aliases: {
      slug: ["url rewritten"],
      sku: ["reference"],
      price: ["price tax excluded"],
      stock: ["quantity"],
      images: ["image urls"],
      variantName: ["supplier reference"],
    },
  },
  {
    id: "magento",
    label: "Magento",
    description: "Magento format",
    templateHeaders: ["sku", "name", "url_key", "description", "short_description", "categories", "price", "qty", "base_image", "small_image", "thumbnail_image", "product_online", "weight"],
    templateRow: ["SKU-1", "Ornek Urun", "ornek-urun", "Aciklama", "Kisa", "Kategori", "100", "10", "https://cdn.example.com/1.jpg", "https://cdn.example.com/2.jpg", "https://cdn.example.com/3.jpg", "1", "450"],
    aliases: {
      slug: ["url_key"],
      stock: ["qty"],
      images: ["base_image"],
      published: ["product_online"],
    },
  },
  {
    id: "bigcommerce",
    label: "BigCommerce",
    description: "BigCommerce format",
    templateHeaders: ["Product Name", "Product URL", "Description", "Categories", "Product Code/SKU", "Price", "Retail Price", "Current Stock", "Image URL", "Visible", "Option Set"],
    templateRow: ["Ornek Urun", "ornek-urun", "Aciklama", "Kategori", "SKU-1", "100", "120", "10", "https://cdn.example.com/1.jpg", "Y", "Standart"],
    aliases: {
      slug: ["product url"],
      sku: ["product code/sku"],
      compareAtPrice: ["retail price"],
      stock: ["current stock"],
      images: ["image url"],
      published: ["visible"],
      variantName: ["option set"],
    },
  },
  {
    id: "wix",
    label: "Wix",
    description: "Wix format",
    templateHeaders: ["Name", "Slug", "Description", "Ribbon", "Price", "Discounted Price", "In Stock", "Inventory", "SKU", "Media", "Collection", "Option Name", "Option Value"],
    templateRow: ["Ornek Urun", "ornek-urun", "Aciklama", "", "100", "90", "TRUE", "10", "SKU-1", "https://cdn.example.com/1.jpg", "Kategori", "Secenek", "Standart"],
    aliases: {
      category: ["collection"],
      compareAtPrice: ["discounted price"],
      published: ["in stock"],
      stock: ["inventory"],
      images: ["media"],
      variantName: ["option value"],
    },
  },
  {
    id: "generic",
    label: "Genel CSV",
    description: "Genel format",
    templateHeaders: ["urun_adi", "slug", "aciklama", "kisa_aciklama", "kategori", "etiketler", "varyant", "agirlik", "fiyat", "indirim_oncesi_fiyat", "stok", "sku", "gorseller", "durum"],
    templateRow: ["Ornek Urun", "ornek-urun", "Aciklama", "Kisa", "Kategori", "etiket", "Standart", "450", "100", "120", "10", "SKU-1", "https://cdn.example.com/1.jpg", "active"],
    aliases: {},
  },
];

interface CsvParseResult {
  rows: string[][];
  delimiter: string;
}

interface DraftProduct {
  name: string;
  slug: string;
  description: string;
  shortDescription: string;
  categoryRaw: string;
  tags: Set<string>;
  images: Set<string>;
  vegan: boolean;
  glutenFree: boolean;
  sugarFree: boolean;
  highProtein: boolean;
  variants: ParsedVariant[];
  sourceRows: number[];
}

interface ShopifyDraftProduct {
  name: string;
  slug: string;
  description: string;
  shortDescription: string;
  category: string;
  subcategory: string;
  tags: Set<string>;
  images: Map<string, ParsedProductImage>;
  vegan: boolean;
  glutenFree: boolean;
  sugarFree: boolean;
  highProtein: boolean;
  brand?: string;
  status: ParsedProductStatus;
  isActive: boolean;
  isDraft: boolean;
  seoTitle?: string;
  seoDescription?: string;
  shopifyMetafields: Record<string, string>;
  shopifyMetadata: Record<string, unknown>;
  optionFallbacks: ShopifyOptionFallback[];
  variants: ParsedVariant[];
  sourceRows: number[];
}

interface ShopifyOption {
  name: string;
  value: string;
  linkedTo?: string;
}

interface ShopifyOptionFallback {
  name?: string;
  linkedTo?: string;
}

interface InferredCategoryFallback {
  category?: string;
  subcategory?: string;
}

const COLOR_VALUE_MAP: Record<string, string> = {
  black: "#111111",
  siyah: "#111111",
  white: "#f5f5f5",
  beyaz: "#f5f5f5",
  brown: "#6f4e37",
  kahverengi: "#6f4e37",
  tan: "#c69c6d",
  taba: "#c69c6d",
  camel: "#c19a6b",
  navy: "#23395d",
  lacivert: "#23395d",
  blue: "#2563eb",
  mavi: "#2563eb",
  red: "#dc2626",
  kirmizi: "#dc2626",
  bordo: "#7f1d1d",
  burgundy: "#7f1d1d",
  green: "#15803d",
  yesil: "#15803d",
  olive: "#556b2f",
  haki: "#556b2f",
  gray: "#6b7280",
  grey: "#6b7280",
  gri: "#6b7280",
  silver: "#c0c0c0",
  gold: "#d4af37",
  rosegold: "#b76e79",
  "rose-gold": "#b76e79",
  gunmetal: "#3f3f46",
  beige: "#d6c6a5",
  bej: "#d6c6a5",
  orange: "#ea580c",
  turuncu: "#ea580c",
  pink: "#ec4899",
  pembe: "#ec4899",
  purple: "#7c3aed",
  mor: "#7c3aed",
};

const GENERIC_COMMERCE_TYPE_SLUGS = new Set([
  "simple",
  "variable",
  "variation",
  "grouped",
  "external",
  "downloadable",
  "virtual",
]);

const GENERIC_COMMERCE_CATEGORY_SLUGS = new Set([
  "uncategorized",
]);

export function getBulkImportProviders(): ProviderDefinition[] {
  return PROVIDERS;
}

export function buildTemplateCsv(providerId: BulkImportProvider): string {
  const provider = PROVIDERS.find((item) => item.id === providerId) ?? PROVIDERS[PROVIDERS.length - 1];
  const headerLine = provider.templateHeaders.map((cell) => csvEscape(cell)).join(",");
  const rowLine = provider.templateRow.map((cell) => csvEscape(cell)).join(",");
  return `${headerLine}\n${rowLine}\n`;
}

export function parseBulkProductsFromCsv(csvContent: string, providerId: BulkImportProvider): BulkImportParseResult {
  const provider = PROVIDERS.find((item) => item.id === providerId) ?? PROVIDERS[PROVIDERS.length - 1];
  const parseResult = parseCsv(csvContent);
  const rows = parseResult.rows.filter((row) => row.some((cell) => cell.trim().length > 0));

  if (rows.length < 2) {
    return {
      headers: rows[0] ?? [],
      products: [],
      errors: ["CSV dosyasinda baslik ve en az bir veri satiri olmalidir."],
      warnings: [],
      skippedRows: 0,
      totalRows: Math.max(rows.length - 1, 0),
    };
  }

  if (provider.id === "shopify") {
    return parseShopifyProducts(rows);
  }

  const headers = rows[0].map((header) => normalizeHeader(header));
  const aliases = mergeAliases(provider.aliases);
  const indexes = buildIndexMap(headers, aliases);

  const warnings: string[] = [];
  const errors: string[] = [];
  const drafts = new Map<string, DraftProduct>();
  let skippedRows = 0;

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const humanRow = rowIndex + 1;

    const rawStatus = getField(row, indexes.status);
    const rawPublished = getField(row, indexes.published);
    const isDisabled = !isTruthy(rawPublished, true) || isFalsyStatus(rawStatus);
    if (isDisabled) {
      skippedRows += 1;
      continue;
    }

    const name = getField(row, indexes.name);
    const slugInput = getField(row, indexes.slug);
    const generatedSlug = slugInput ? toSlug(slugInput) : name ? toSlug(name) : "";
    const draftKey = generatedSlug || `row-${humanRow}`;

    const description = getField(row, indexes.description);
    const shortDescription = getField(row, indexes.shortDescription);
    const categoryRaw = getField(row, indexes.category);
    const tags = splitMultiValue(getField(row, indexes.tags));
    const rowImages = collectImages(row, headers, indexes.images);

    const variantName = getField(row, indexes.variantName);
    const weight = toNumber(getField(row, indexes.weight), 0);
    const price = toNumber(getField(row, indexes.price), 0);
    const originalPrice = toNumber(getField(row, indexes.compareAtPrice), undefined);
    const stock = Math.max(0, Math.round(toNumber(getField(row, indexes.stock), 0)));
    const skuRaw = getField(row, indexes.sku);

    const dietarySource = `${name} ${description} ${tags.join(" ")}`.toLowerCase();
    const variantSku = skuRaw || `EZM-${draftKey.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16)}-${rowIndex}`;
    const normalizedVariantName = variantName || (weight > 0 ? `${Math.round(weight)} G` : "Standart");

    if (!name && !slugInput && !price && !variantName) {
      skippedRows += 1;
      continue;
    }

    if (!drafts.has(draftKey)) {
      drafts.set(draftKey, {
        name: name || "Isimsiz Urun",
        slug: generatedSlug,
        description: cleanText(description),
        shortDescription: cleanText(shortDescription),
        categoryRaw,
        tags: new Set(tags),
        images: new Set(rowImages),
        vegan: /vegan/.test(dietarySource),
        glutenFree: /glutensiz|gluten[-\s]?free/.test(dietarySource),
        sugarFree: /sekersiz|sugar[-\s]?free/.test(dietarySource),
        highProtein: /high[-\s]?protein|protein/.test(dietarySource),
        variants: [],
        sourceRows: [humanRow],
      });
    }

    const draft = drafts.get(draftKey)!;
    if (name && draft.name === "Isimsiz Urun") draft.name = name;
    if (!draft.slug && generatedSlug) draft.slug = generatedSlug;
    if (description && !draft.description) draft.description = cleanText(description);
    if (shortDescription && !draft.shortDescription) draft.shortDescription = cleanText(shortDescription);
    if (categoryRaw && !draft.categoryRaw) draft.categoryRaw = categoryRaw;
    tags.forEach((tag) => draft.tags.add(tag));
    rowImages.forEach((image) => draft.images.add(image));
    draft.sourceRows.push(humanRow);

    if (price <= 0) {
      warnings.push(`Satir ${humanRow}: Fiyat bulunamadi veya 0. Varyant atlandi.`);
      continue;
    }

    draft.variants.push({
      name: normalizedVariantName,
      weight,
      price,
      originalPrice: originalPrice && originalPrice > price ? originalPrice : undefined,
      stock,
      sku: variantSku,
    });
  }

  const products: ParsedProduct[] = [];
  drafts.forEach((draft, key) => {
    if (!draft.name || draft.name === "Isimsiz Urun") {
      errors.push(`Urun (${key}) adi bulunamadi. Ilgili satirlar: ${draft.sourceRows.join(", ")}`);
      return;
    }

    if (!draft.slug) {
      draft.slug = toSlug(draft.name);
    }
    if (!draft.slug) {
      errors.push(`Urun "${draft.name}" icin gecerli slug uretilemedi.`);
      return;
    }

    if (draft.variants.length === 0) {
      warnings.push(`Urun "${draft.name}" icin fiyatli varyant bulunamadi. Urun atlandi.`);
      return;
    }

    const { category, subcategory } = mapGenericCategory(draft.categoryRaw, draft.name, draft.slug);
    const description = draft.description || `${draft.name} urunu Celebix e-ticaret kataloguna toplu yukleme ile eklendi.`;
    const shortDescription = draft.shortDescription || description.slice(0, 160);

    products.push({
      name: draft.name,
      slug: draft.slug,
      description,
      shortDescription,
      category,
      subcategory,
      images: Array.from(draft.images).slice(0, 8),
      tags: Array.from(draft.tags).slice(0, 30),
      vegan: draft.vegan,
      glutenFree: draft.glutenFree,
      sugarFree: draft.sugarFree,
      highProtein: draft.highProtein,
      variants: dedupeVariants(draft.variants),
      sourceRows: Array.from(new Set(draft.sourceRows)),
    });
  });

  return {
    headers: rows[0],
    products,
    errors,
    warnings,
    skippedRows,
    totalRows: Math.max(rows.length - 1, 0),
  };
}

function parseShopifyProducts(rows: string[][]): BulkImportParseResult {
  const headers = rows[0];
  const normalizedHeaders = headers.map((header) => normalizeHeader(header));
  const indexes = buildIndexMap(normalizedHeaders, SHOPIFY_ALIASES);
  const warnings: string[] = [];
  const errors: string[] = [];
  const drafts = new Map<string, ShopifyDraftProduct>();
  let skippedRows = 0;

  if (indexes.handle < 0) {
    return {
      headers,
      products: [],
      errors: ['Shopify CSV icin "Handle" kolonu zorunludur.'],
      warnings: [],
      skippedRows: 0,
      totalRows: Math.max(rows.length - 1, 0),
    };
  }

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const humanRow = rowIndex + 1;

    if (!row.some((cell) => cell.trim().length > 0)) {
      skippedRows += 1;
      continue;
    }

    const handle = getField(row, indexes.handle);
    const title = getField(row, indexes.title);
    const bodyHtml = getField(row, indexes.bodyHtml);
    const vendor = getField(row, indexes.vendor);
    const rawProductCategory = getField(row, indexes.productCategory);
    const rawType = getField(row, indexes.type);
    const rawTags = splitMultiValue(getField(row, indexes.tags));
    const rawPublished = parseOptionalBoolean(getField(row, indexes.published));
    const rawStatus = getField(row, indexes.status);
    const publicationState = mapShopifyPublicationState(rawStatus, rawPublished);
    const seoTitle = getField(row, indexes.seoTitle);
    const seoDescription = getField(row, indexes.seoDescription);
    const giftCard = parseOptionalBoolean(getField(row, indexes.giftCard));

    const shopifyMetafields = compactStringRecord({
      band_material: getField(row, indexes.bandMaterial),
      clasp_type: getField(row, indexes.claspType),
      color_pattern: getField(row, indexes.colorPattern),
      watch_accessory_style: getField(row, indexes.watchAccessoryStyle),
    });

    const slug = handle ? toSlug(handle) : title ? toSlug(title) : "";
    const draftKey = slug || `row-${humanRow}`;
    const categoryResolution = resolveShopifyCategory({
      rawType,
      rawProductCategory,
      watchAccessoryStyle: shopifyMetafields.watch_accessory_style,
      fallback: `${title || handle} ${rawTags.join(" ")}`.trim(),
    });
    const dietarySource = `${title} ${bodyHtml} ${rawTags.join(" ")} ${Object.values(shopifyMetafields).join(" ")}`.toLowerCase();

    if (!handle && !title && !bodyHtml && rawTags.length === 0) {
      skippedRows += 1;
      continue;
    }

    if (shouldSkipShopifyCatalogRow({ handle, title, tags: rawTags })) {
      skippedRows += 1;
      continue;
    }

    if (!drafts.has(draftKey)) {
      drafts.set(draftKey, {
        name: title || handleToTitle(handle) || "Isimsiz Urun",
        slug,
        description: cleanText(bodyHtml),
        shortDescription: cleanText(bodyHtml).slice(0, 160),
        category: categoryResolution.category,
        subcategory: categoryResolution.subcategory,
        tags: new Set(rawTags),
        images: new Map<string, ParsedProductImage>(),
        vegan: /vegan/.test(dietarySource),
        glutenFree: /glutensiz|gluten[-\s]?free/.test(dietarySource),
        sugarFree: /sekersiz|sugar[-\s]?free/.test(dietarySource),
        highProtein: /high[-\s]?protein|protein/.test(dietarySource),
        brand: vendor || undefined,
        status: publicationState.status,
        isActive: publicationState.isActive,
        isDraft: publicationState.isDraft,
        seoTitle: seoTitle || undefined,
        seoDescription: seoDescription || undefined,
        shopifyMetafields,
        shopifyMetadata: compactRecord({
          handle: handle || undefined,
          vendor: vendor || undefined,
          product_category: rawProductCategory || undefined,
          type: rawType || undefined,
          published: rawPublished,
          gift_card: giftCard,
          raw_status: rawStatus || undefined,
        }),
        optionFallbacks: [],
        variants: [],
        sourceRows: [humanRow],
      });
    }

    const draft = drafts.get(draftKey)!;
    if (title && draft.name === "Isimsiz Urun") draft.name = title;
    if (!draft.slug && slug) draft.slug = slug;
    if (bodyHtml && !draft.description) draft.description = cleanText(bodyHtml);
    if (!draft.shortDescription && bodyHtml) {
      draft.shortDescription = cleanText(bodyHtml).slice(0, 160);
    }
    if (!draft.brand && vendor) draft.brand = vendor;
    if (!draft.category && categoryResolution.category) draft.category = categoryResolution.category;
    if (!draft.subcategory && categoryResolution.subcategory) draft.subcategory = categoryResolution.subcategory;
    if (!draft.seoTitle && seoTitle) draft.seoTitle = seoTitle;
    if (!draft.seoDescription && seoDescription) draft.seoDescription = seoDescription;
    if (draft.status === "published" && publicationState.status !== "published") {
      draft.status = publicationState.status;
      draft.isActive = publicationState.isActive;
      draft.isDraft = publicationState.isDraft;
    }
    rawTags.forEach((tag) => draft.tags.add(tag));
    draft.sourceRows.push(humanRow);
    draft.shopifyMetafields = { ...draft.shopifyMetafields, ...shopifyMetafields };
    draft.shopifyMetadata = compactRecord({
      ...draft.shopifyMetadata,
      handle: draft.shopifyMetadata.handle || handle || undefined,
      vendor: draft.shopifyMetadata.vendor || vendor || undefined,
      product_category: draft.shopifyMetadata.product_category || rawProductCategory || undefined,
      type: draft.shopifyMetadata.type || rawType || undefined,
      published: rawPublished ?? draft.shopifyMetadata.published,
      gift_card: giftCard ?? draft.shopifyMetadata.gift_card,
      raw_status: draft.shopifyMetadata.raw_status || rawStatus || undefined,
    });

    const productImage = buildShopifyImage(row, indexes, draft.images.size);
    if (productImage) {
      mergeDraftImage(draft.images, productImage);
    }

    const variantImageUrl = getUrlField(row, indexes.variantImage);
    if (variantImageUrl) {
      mergeDraftImage(draft.images, {
        url: variantImageUrl,
        alt: productImage?.alt || draft.name,
        isPrimary: draft.images.size === 0,
        sortOrder: draft.images.size,
      });
    }

    draft.optionFallbacks = buildShopifyOptionFallbacks(row, indexes, draft.optionFallbacks);
    const options = buildShopifyOptions(row, indexes, draft.optionFallbacks);
    const hasVariantData =
      options.length > 0 ||
      Boolean(getField(row, indexes.variantSku)) ||
      hasCellValue(row, indexes.variantPrice) ||
      hasCellValue(row, indexes.variantCompareAtPrice) ||
      hasCellValue(row, indexes.variantInventoryQty) ||
      hasCellValue(row, indexes.variantBarcode) ||
      hasCellValue(row, indexes.variantGrams) ||
      hasCellValue(row, indexes.costPerItem) ||
      Boolean(variantImageUrl);

    if (!hasVariantData && draft.variants.length > 0) {
      continue;
    }

    const variant = buildShopifyVariant({
      draft,
      row,
      rowIndex,
      indexes,
      options,
      variantImageUrl,
    });

    mergeVariantIntoDraft(draft, variant);
  }

  const products: ParsedProduct[] = [];
  drafts.forEach((draft, key) => {
    if (!draft.name || draft.name === "Isimsiz Urun") {
      draft.name = handleToTitle(draft.slug) || draft.name;
    }

    if (!draft.slug) {
      draft.slug = toSlug(draft.name);
    }

    if (!draft.slug) {
      errors.push(`Urun (${key}) icin gecerli slug uretilemedi.`);
      return;
    }

    if (draft.variants.length === 0) {
      warnings.push(`Urun "${draft.name}" icin varyant bulunamadi. Varsayilan varyant olusturuldu.`);
      draft.variants.push(createFallbackVariant(draft));
    }

    const imagesV2 = finalizeDraftImages(draft.images, draft.name);
    const description = draft.description || `${draft.name} urunu Shopify toplu urun aktarimindan olusturuldu.`;
    const shortDescription = draft.shortDescription || description.slice(0, 160);

    products.push({
      name: draft.name,
      slug: draft.slug,
      description,
      shortDescription,
      category: draft.category || "genel",
      subcategory: draft.subcategory || "",
      images: imagesV2.map((image) => image.url),
      imagesV2,
      tags: Array.from(draft.tags).slice(0, 60),
      vegan: draft.vegan,
      glutenFree: draft.glutenFree,
      sugarFree: draft.sugarFree,
      highProtein: draft.highProtein,
      brand: draft.brand,
      status: draft.status,
      isActive: draft.isActive,
      isDraft: draft.isDraft,
      seoTitle: draft.seoTitle,
      seoDescription: draft.seoDescription,
      shopifyMetafields: compactStringRecord(draft.shopifyMetafields),
      shopifyMetadata: compactRecord(draft.shopifyMetadata),
      variants: dedupeVariants(draft.variants),
      sourceRows: Array.from(new Set(draft.sourceRows)),
    });
  });

  return {
    headers,
    products,
    errors,
    warnings,
    skippedRows,
    totalRows: Math.max(rows.length - 1, 0),
  };
}

function buildShopifyVariant({
  draft,
  row,
  rowIndex,
  indexes,
  options,
  variantImageUrl,
}: {
  draft: ShopifyDraftProduct;
  row: string[];
  rowIndex: number;
  indexes: Record<ShopifyField, number>;
  options: ShopifyOption[];
  variantImageUrl: string | null;
}): ParsedVariant {
  const weight = toNumber(getField(row, indexes.variantGrams), 0);
  const price = toNumber(getField(row, indexes.variantPrice), 0);
  const originalPrice = toNumber(getField(row, indexes.variantCompareAtPrice), undefined);
  const stock = Math.max(0, Math.round(toNumber(getField(row, indexes.variantInventoryQty), 0)));
  const sku =
    getField(row, indexes.variantSku) ||
    `SHOP-${draft.slug.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 18)}-${rowIndex}`;

  return {
    name: buildVariantName(options, weight),
    weight,
    price,
    originalPrice: originalPrice !== undefined && originalPrice > price ? originalPrice : undefined,
    stock,
    sku,
    images: variantImageUrl ? [variantImageUrl] : [],
    cost: toNumber(getField(row, indexes.costPerItem), undefined),
    barcode: getField(row, indexes.variantBarcode) || undefined,
    unit: "adet",
    groupName: options.map((option) => option.name).filter(Boolean).join(" / ") || undefined,
    attributes: buildVariantAttributes(options, variantImageUrl),
    shopifyMetadata: compactRecord({
      inventory_tracker: getField(row, indexes.variantInventoryTracker) || undefined,
      inventory_policy: getField(row, indexes.variantInventoryPolicy) || undefined,
      fulfillment_service: getField(row, indexes.variantFulfillmentService) || undefined,
      requires_shipping: parseOptionalBoolean(getField(row, indexes.variantRequiresShipping)),
      taxable: parseOptionalBoolean(getField(row, indexes.variantTaxable)),
      unit_price_total_measure: nullableNumber(toNumber(getField(row, indexes.unitPriceTotalMeasure), undefined)),
      unit_price_total_measure_unit: getField(row, indexes.unitPriceTotalMeasureUnit) || undefined,
      unit_price_base_measure: nullableNumber(toNumber(getField(row, indexes.unitPriceBaseMeasure), undefined)),
      unit_price_base_measure_unit: getField(row, indexes.unitPriceBaseMeasureUnit) || undefined,
      weight_unit: getField(row, indexes.variantWeightUnit) || undefined,
      tax_code: getField(row, indexes.variantTaxCode) || undefined,
      option_links: compactRecord(
        Object.fromEntries(
          options
            .filter((option) => option.linkedTo)
            .map((option) => [toSlug(option.name) || option.name, option.linkedTo])
        )
      ),
    }),
  };
}

function buildVariantAttributes(options: ShopifyOption[], variantImageUrl: string | null): ParsedVariantAttribute[] {
  return options.map((option, index) => {
    const isColorOption = looksLikeColorAttribute(option.name, option.linkedTo);
    const attributeImage =
      variantImageUrl && (isColorOption || options.length === 1 || index === 0)
        ? variantImageUrl
        : undefined;

    return {
      name: option.name,
      value: option.value,
      linked_to: option.linkedTo,
      color_code: isColorOption ? toColorCode(option.value) : undefined,
      image_url: attributeImage,
      attribute: {
        id: toSlug(option.name) || `option-${index + 1}`,
        name: option.name,
      },
    };
  });
}

function buildVariantName(options: ShopifyOption[], weight: number): string {
  const values = options.map((option) => option.value).filter((value) => value && !isDefaultVariantValue(value));
  if (values.length > 0) return values.join(" / ");
  if (weight > 0) return `${trimTrailingZeros(weight)} G`;
  return "Standart";
}

function createFallbackVariant(draft: ShopifyDraftProduct): ParsedVariant {
  return {
    name: "Standart",
    weight: 0,
    price: 0,
    stock: 0,
    sku: `SHOP-${draft.slug.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 18)}-1`,
    images: draft.images.size > 0 ? [finalizeDraftImages(draft.images, draft.name)[0].url] : [],
    unit: "adet",
  };
}

function mergeVariantIntoDraft(draft: ShopifyDraftProduct, incomingVariant: ParsedVariant) {
  const variantKey = buildVariantKey(incomingVariant);
  const existingIndex = draft.variants.findIndex((variant) => buildVariantKey(variant) === variantKey);
  if (existingIndex === -1) {
    draft.variants.push(incomingVariant);
    return;
  }
  draft.variants[existingIndex] = mergeVariants(draft.variants[existingIndex], incomingVariant);
}

function mergeVariants(existing: ParsedVariant, incoming: ParsedVariant): ParsedVariant {
  return {
    ...existing,
    name: existing.name || incoming.name,
    weight: existing.weight || incoming.weight,
    price: existing.price || incoming.price,
    originalPrice: existing.originalPrice ?? incoming.originalPrice,
    stock: Math.max(existing.stock, incoming.stock),
    sku: existing.sku || incoming.sku,
    images: dedupeStrings([...(existing.images || []), ...(incoming.images || [])]),
    cost: existing.cost ?? incoming.cost,
    barcode: existing.barcode || incoming.barcode,
    unit: existing.unit || incoming.unit,
    groupName: existing.groupName || incoming.groupName,
    attributes: mergeAttributes(existing.attributes || [], incoming.attributes || []),
    shopifyMetadata: compactRecord({
      ...(existing.shopifyMetadata || {}),
      ...(incoming.shopifyMetadata || {}),
    }),
  };
}

function mergeAttributes(existing: ParsedVariantAttribute[], incoming: ParsedVariantAttribute[]): ParsedVariantAttribute[] {
  const output = new Map<string, ParsedVariantAttribute>();
  [...existing, ...incoming].forEach((attribute, index) => {
    const key = `${normalize(attribute.name)}|${normalize(attribute.value)}`;
    const current = output.get(key);
    if (!current) {
      output.set(key, attribute);
      return;
    }

    output.set(key, {
      ...current,
      linked_to: current.linked_to || attribute.linked_to,
      color_code: current.color_code || attribute.color_code,
      image_url: current.image_url || attribute.image_url,
      attribute: current.attribute || attribute.attribute || {
        id: `attr-${index + 1}`,
        name: attribute.name,
      },
    });
  });
  return Array.from(output.values());
}

function buildVariantKey(variant: ParsedVariant): string {
  const attributePart = (variant.attributes || [])
    .map((attribute) => `${normalize(attribute.name)}:${normalize(attribute.value)}`)
    .join("|");

  return [normalize(variant.sku), normalize(variant.name), attributePart, String(variant.price || 0)]
    .filter(Boolean)
    .join("::");
}

function buildShopifyOptionFallbacks(
  row: string[],
  indexes: Record<ShopifyField, number>,
  existingFallbacks: ShopifyOptionFallback[] = []
): ShopifyOptionFallback[] {
  const rawOptions: ShopifyOption[] = [
    { name: getField(row, indexes.option1Name), value: getField(row, indexes.option1Value), linkedTo: getField(row, indexes.option1LinkedTo) || undefined },
    { name: getField(row, indexes.option2Name), value: getField(row, indexes.option2Value), linkedTo: getField(row, indexes.option2LinkedTo) || undefined },
    { name: getField(row, indexes.option3Name), value: getField(row, indexes.option3Value), linkedTo: getField(row, indexes.option3LinkedTo) || undefined },
  ];

  return rawOptions.map((option, index) => ({
    name: option.name || existingFallbacks[index]?.name || undefined,
    linkedTo: option.linkedTo || existingFallbacks[index]?.linkedTo,
  }));
}

function buildShopifyOptions(
  row: string[],
  indexes: Record<ShopifyField, number>,
  optionFallbacks: ShopifyOptionFallback[] = []
): ShopifyOption[] {
  const rawOptions: ShopifyOption[] = [
    { name: getField(row, indexes.option1Name), value: getField(row, indexes.option1Value), linkedTo: getField(row, indexes.option1LinkedTo) || undefined },
    { name: getField(row, indexes.option2Name), value: getField(row, indexes.option2Value), linkedTo: getField(row, indexes.option2LinkedTo) || undefined },
    { name: getField(row, indexes.option3Name), value: getField(row, indexes.option3Value), linkedTo: getField(row, indexes.option3LinkedTo) || undefined },
  ];

  return rawOptions
    .filter((option) => option.name || option.value)
    .map((option, index) => ({
      name: option.name || optionFallbacks[index]?.name || `Secenek ${index + 1}`,
      value: option.value,
      linkedTo: option.linkedTo || optionFallbacks[index]?.linkedTo,
    }))
    .filter((option) => option.value && !isDefaultVariantValue(option.value));
}

function buildShopifyImage(
  row: string[],
  indexes: Record<ShopifyField, number>,
  fallbackOrder: number
): ParsedProductImage | null {
  const url = getUrlField(row, indexes.imageSrc);
  if (!url) return null;

  const position = toNumber(getField(row, indexes.imagePosition), undefined);
  return {
    url,
    alt: getField(row, indexes.imageAltText),
    isPrimary: position === undefined ? fallbackOrder === 0 : position <= 1,
    sortOrder: position === undefined ? fallbackOrder : Math.max(0, Math.round(position) - 1),
  };
}

function mergeDraftImage(imageMap: Map<string, ParsedProductImage>, image: ParsedProductImage) {
  const existing = imageMap.get(image.url);
  if (!existing) {
    imageMap.set(image.url, image);
    return;
  }

  imageMap.set(image.url, {
    url: image.url,
    alt: existing.alt || image.alt,
    isPrimary: existing.isPrimary || image.isPrimary,
    sortOrder: Math.min(existing.sortOrder, image.sortOrder),
  });
}

function finalizeDraftImages(imageMap: Map<string, ParsedProductImage>, productName: string): ParsedProductImage[] {
  return Array.from(imageMap.values())
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((image, index) => ({
      url: image.url,
      alt: image.alt || `${productName} gorseli`,
      isPrimary: index === 0,
      sortOrder: index,
    }))
    .slice(0, 24);
}

function resolveShopifyCategory({
  rawType,
  rawProductCategory,
  watchAccessoryStyle,
  fallback,
}: {
  rawType: string;
  rawProductCategory: string;
  watchAccessoryStyle?: string;
  fallback: string;
}): { category: string; subcategory: string } {
  const typeValue = normalizeCommerceCategoryValue(rawType, { allowGenericType: false, allowGenericCategory: false });
  const taxonomyValue = normalizeCommerceCategoryValue(extractLastTaxonomySegment(rawProductCategory), {
    allowGenericType: false,
    allowGenericCategory: false,
  });
  const taxonomyFallbackValue = normalizeCommerceCategoryValue(extractLastTaxonomySegment(rawProductCategory), {
    allowGenericType: false,
    allowGenericCategory: true,
  });
  const watchStyleValue = normalizeCategoryValue(watchAccessoryStyle);
  const inferredFallback = inferCategoryFromFallbackLabel(fallback);

  const primary =
    taxonomyValue ||
    watchStyleValue ||
    inferredFallback.category ||
    taxonomyFallbackValue ||
    typeValue ||
    "genel";
  const secondary =
    [watchStyleValue, inferredFallback.subcategory, taxonomyValue, typeValue].filter((value) => value && value !== primary)[0] || "";

  return {
    category: toSlug(primary) || "genel",
    subcategory: secondary ? toSlug(secondary) : "",
  };
}

function mapShopifyPublicationState(rawStatus: string, published?: boolean): {
  status: ParsedProductStatus;
  isActive: boolean;
  isDraft: boolean;
} {
  const normalizedStatus = normalize(rawStatus);
  if (normalizedStatus === "archived") return { status: "archived", isActive: false, isDraft: false };
  if (normalizedStatus === "draft") return { status: "draft", isActive: false, isDraft: true };
  if (published === false) return { status: "draft", isActive: false, isDraft: true };
  return { status: "published", isActive: true, isDraft: false };
}

function normalizeCategoryValue(value: string | undefined): string {
  return value ? value.replace(/\s+/g, " ").trim() : "";
}

function normalizeCommerceCategoryValue(
  value: string | undefined,
  options: {
    allowGenericType: boolean;
    allowGenericCategory: boolean;
  }
): string {
  const normalizedValue = normalizeCategoryValue(value);
  if (!normalizedValue) return "";

  const slug = toSlug(normalizedValue);
  if (!options.allowGenericType && GENERIC_COMMERCE_TYPE_SLUGS.has(slug)) {
    return "";
  }

  if (!options.allowGenericCategory && GENERIC_COMMERCE_CATEGORY_SLUGS.has(slug)) {
    return "";
  }

  return normalizedValue;
}

function inferCategoryFromFallbackLabel(value: string): InferredCategoryFallback {
  const source = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0131/g, "i")
    .replace(/[^a-z0-9\s/._-]/g, " ");

  if (
    source.includes("watch band") ||
    source.includes("watch strap") ||
    source.includes("apple watch") ||
    source.includes("saat kayis") ||
    source.includes("saat kordon") ||
    source.includes("deri kayis") ||
    source.includes("deri kordon")
  ) {
    return {
      category: "watch-bands",
      subcategory: source.includes("apple watch") ? "apple-watch" : "classic-watch",
    };
  }

  if (source.includes("caki") || source.includes("bicak")) {
    return { category: "protective-cases", subcategory: "knife-sheaths" };
  }

  if (source.includes("airpods")) {
    return { category: "protective-cases", subcategory: "airpods-cases" };
  }

  if (source.includes("airtag")) {
    return { category: "protective-cases", subcategory: "airtag-cases" };
  }

  if (source.includes("gozluk")) {
    return { category: "protective-cases", subcategory: "eyewear-cases" };
  }

  if (source.includes("cakmak") || source.includes("zippo")) {
    return { category: "protective-cases", subcategory: "lighter-cases" };
  }

  if (source.includes("kalemlik") || source.includes("kalem kutusu")) {
    return { category: "desk-accessories", subcategory: "pen-cases" };
  }

  if (source.includes("saat kesesi") || source.includes("watch pouch") || source.includes("watch case")) {
    return { category: "protective-cases", subcategory: "watch-cases" };
  }

  if (source.includes("kartlik")) {
    return { category: "wallets", subcategory: "card-holders" };
  }

  if (source.includes("pasaport")) {
    return { category: "wallets", subcategory: "passport-wallets" };
  }

  if (source.includes("cuzdan")) {
    if (source.includes("pasaport")) return { category: "wallets", subcategory: "passport-wallets" };
    if (source.includes("telefon")) return { category: "wallets", subcategory: "phone-wallets" };
    return { category: "wallets", subcategory: "classic-wallets" };
  }

  if (source.includes("anahtar")) {
    return { category: "key-accessories", subcategory: source.includes("anahtarlik") ? "keychains" : "key-cases" };
  }

  if (source.includes("tutun")) {
    return { category: "small-leather-goods", subcategory: "tobacco-pouches" };
  }

  if (source.includes("ruj")) {
    return { category: "small-leather-goods", subcategory: "cosmetic-cases" };
  }

  if (source.includes("bardak altligi")) {
    return { category: "desk-accessories", subcategory: "coasters" };
  }

  if (source.includes("tepsi")) {
    return { category: "desk-accessories", subcategory: "trays" };
  }

  if (source.includes("kablo toplayici")) {
    return { category: "desk-accessories", subcategory: "cable-organizers" };
  }

  if (source.includes("bakim kremi")) {
    return { category: "care-products", subcategory: "leather-care" };
  }

  if (
    source.includes("canta") ||
    source.includes("gogus") ||
    source.includes("omuz") ||
    source.includes("postaci") ||
    source.includes("tote") ||
    source.includes("evrak") ||
    source.includes("dopp kit") ||
    source.includes("makyaj")
  ) {
    if (source.includes("telefon cantasi")) return { category: "bags", subcategory: "phone-bags" };
    if (source.includes("evrak")) return { category: "bags", subcategory: "document-bags" };
    if (source.includes("el cantasi")) return { category: "bags", subcategory: "handbags" };
    if (source.includes("omuz")) return { category: "bags", subcategory: "shoulder-bags" };
    if (source.includes("gogus") || source.includes("postaci")) return { category: "bags", subcategory: "crossbody-bags" };
    if (source.includes("tote")) return { category: "bags", subcategory: "tote-bags" };
    if (source.includes("makyaj") || source.includes("dopp kit")) return { category: "bags", subcategory: "pouches" };
    return { category: "bags" };
  }

  return {};
}

function shouldSkipShopifyCatalogRow(input: {
  handle: string;
  title: string;
  tags: string[];
}): boolean {
  const source = normalize(`${input.handle} ${input.title} ${input.tags.join(" ")}`);

  return (
    source.includes("globo product options") ||
    source.includes("option set") ||
    source.includes("paketinizi seciniz")
  );
}

function extractLastTaxonomySegment(value: string): string {
  if (!value) return "";
  const segments = value.split(">").map((item) => item.trim()).filter(Boolean);
  return segments[segments.length - 1] || value.trim();
}

function handleToTitle(handle: string): string {
  if (!handle) return "";
  return handle
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function parseCsv(input: string): CsvParseResult {
  const clean = input.replace(/^\uFEFF/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = detectDelimiter(firstLine);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < clean.length; i += 1) {
    const char = clean[i];
    const next = clean[i + 1];

    if (inQuotes) {
      if (char === "\"") {
        if (next === "\"") {
          cell += "\"";
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === "\"") {
      inQuotes = true;
      continue;
    }

    if (char === delimiter) {
      row.push(cell.trim());
      cell = "";
      continue;
    }

    if (char === "\n") {
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    if (char !== "\r") {
      cell += char;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    rows.push(row);
  }

  return { rows, delimiter };
}

function detectDelimiter(firstLine: string): string {
  const commas = (firstLine.match(/,/g) ?? []).length;
  const semicolons = (firstLine.match(/;/g) ?? []).length;
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  if (semicolons >= commas && semicolons >= tabs) return ";";
  if (tabs >= commas && tabs >= semicolons) return "\t";
  return ",";
}

function mergeAliases(providerAliases: Partial<Record<CanonicalField, string[]>>): Record<CanonicalField, string[]> {
  const merged = {} as Record<CanonicalField, string[]>;
  (Object.keys(BASE_ALIASES) as CanonicalField[]).forEach((field) => {
    const base = BASE_ALIASES[field];
    const extra = providerAliases[field] ?? [];
    merged[field] = Array.from(new Set([...base, ...extra]));
  });
  return merged;
}

function buildIndexMap<T extends string>(headers: string[], aliases: Record<T, string[]>): Record<T, number> {
  const indexMap = {} as Record<T, number>;
  (Object.keys(aliases) as T[]).forEach((field) => {
    const matched = aliases[field]
      .map((alias) => normalizeHeader(alias))
      .find((alias) => headers.includes(alias));
    indexMap[field] = matched ? headers.indexOf(matched) : -1;
  });
  return indexMap;
}

function getField(row: string[], index: number): string {
  if (index < 0 || index >= row.length) return "";
  return cleanText(row[index]);
}

function getUrlField(row: string[], index: number): string | null {
  const value = getField(row, index);
  return looksLikeUrl(value) ? value : null;
}

function hasCellValue(row: string[], index: number): boolean {
  if (index < 0 || index >= row.length) return false;
  return row[index].trim().length > 0;
}

function collectImages(row: string[], headers: string[], imageIndex: number): string[] {
  const images = new Set<string>();
  if (imageIndex >= 0) {
    splitMultiValue(getField(row, imageIndex)).forEach((item) => {
      if (looksLikeUrl(item)) images.add(item);
    });
  }

  headers.forEach((header, headerIndex) => {
    if (!header.includes("image") && !header.includes("gorsel") && !header.includes("resim")) return;
    splitMultiValue(getField(row, headerIndex)).forEach((item) => {
      if (looksLikeUrl(item)) images.add(item);
    });
  });

  return Array.from(images).slice(0, 8);
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

function normalizeHeader(value: string): string {
  return normalize(value).replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9\s/._-]/g, " ");
}

function splitMultiValue(value: string): string[] {
  return value.split(/[|,;]/g).map((item) => item.trim()).filter(Boolean);
}

function toNumber(value: string, fallback: number | undefined): number {
  if (!value) return fallback ?? 0;
  const normalizedValue = value.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  const parsed = Number.parseFloat(normalizedValue);
  if (Number.isNaN(parsed)) return fallback ?? 0;
  return parsed;
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

function mapGenericCategory(rawCategory: string, productName: string, slug: string): { category: string; subcategory: string } {
  const source = normalize(`${rawCategory} ${productName} ${slug}`);
  let category = "fistik-ezmesi";
  if (source.includes("findik")) category = "findik-ezmesi";
  if (source.includes("kuruyemis") || source.includes("badem") || source.includes("ceviz") || source.includes("yer fistigi")) category = "kuruyemis";
  if (source.includes("fistik ezmesi") || source.includes("fistik kremasi")) category = "fistik-ezmesi";

  let subcategory = "klasik";
  if (source.includes("sekersiz")) subcategory = "sekersiz";
  else if (source.includes("hurmali")) subcategory = "hurmali";
  else if (source.includes("balli")) subcategory = "balli";
  else if (source.includes("sutlu")) subcategory = "sutlu-findik-kremasi";
  else if (source.includes("kakaolu")) subcategory = "kakaolu";
  else if (source.includes("cig")) subcategory = "cig";
  else if (source.includes("kavrulmus")) subcategory = "kavrulmus";

  return { category, subcategory };
}

function dedupeVariants(variants: ParsedVariant[]): ParsedVariant[] {
  const merged = new Map<string, ParsedVariant>();
  variants.forEach((variant, index) => {
    const key = buildVariantKey(variant) || `variant-${index + 1}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, {
        ...variant,
        sku: variant.sku || `EZM-VAR-${index + 1}`,
        images: dedupeStrings(variant.images || []),
        attributes: variant.attributes || [],
      });
      return;
    }
    merged.set(key, mergeVariants(existing, variant));
  });
  return Array.from(merged.values());
}

function csvEscape(value: string): string {
  const text = String(value ?? "");
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, "\"\"")}"`;
}

function isTruthy(value: string, fallback: boolean): boolean {
  const parsed = parseOptionalBoolean(value);
  return parsed === undefined ? fallback : parsed;
}

function parseOptionalBoolean(value: string): boolean | undefined {
  if (!value) return undefined;
  const normalizedValue = normalize(value);
  if (["1", "true", "yes", "evet", "y", "active", "published"].includes(normalizedValue)) return true;
  if (["0", "false", "no", "hayir", "n", "passive", "draft"].includes(normalizedValue)) return false;
  return undefined;
}

function isFalsyStatus(value: string): boolean {
  if (!value) return false;
  const normalizedValue = normalize(value);
  return ["draft", "archived", "pasif", "inactive", "disabled", "pending"].includes(normalizedValue);
}

function looksLikeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function compactRecord<T extends Record<string, unknown>>(input: T): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => {
      if (value === undefined || value === null) return false;
      if (typeof value === "string") return value.trim().length > 0;
      if (Array.isArray(value)) return value.length > 0;
      if (typeof value === "object") return Object.keys(value).length > 0;
      return true;
    })
  );
}

function compactStringRecord(input: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => typeof value === "string" && value.trim().length > 0)
  ) as Record<string, string>;
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function nullableNumber(value: number | undefined): number | null | undefined {
  if (value === undefined || Number.isNaN(value)) return undefined;
  return value;
}

function trimTrailingZeros(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/\.?0+$/, "");
}

function isDefaultVariantValue(value: string): boolean {
  const normalizedValue = normalize(value);
  return normalizedValue === "default title" || normalizedValue === "default";
}

function looksLikeColorAttribute(name: string, linkedTo?: string): boolean {
  const source = normalize(`${name} ${linkedTo || ""}`);
  return source.includes("renk") || source.includes("color") || source.includes("pattern");
}

function toColorCode(value: string): string | undefined {
  if (/^#([a-f0-9]{3}|[a-f0-9]{6})$/i.test(value)) return value;
  const normalizedValue = normalize(value).replace(/\s+/g, "");
  return COLOR_VALUE_MAP[normalizedValue];
}
