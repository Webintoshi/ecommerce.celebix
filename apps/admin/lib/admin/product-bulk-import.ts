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

export interface ParsedVariant {
  name: string;
  weight: number;
  price: number;
  originalPrice?: number;
  stock: number;
  sku: string;
}

export interface ParsedProduct {
  name: string;
  slug: string;
  description: string;
  shortDescription: string;
  category: "fistik-ezmesi" | "findik-ezmesi" | "kuruyemis";
  subcategory: "sekersiz" | "hurmali" | "balli" | "klasik" | "sutlu-findik-kremasi" | "kakaolu" | "cig" | "kavrulmus";
  images: string[];
  tags: string[];
  vegan: boolean;
  glutenFree: boolean;
  sugarFree: boolean;
  highProtein: boolean;
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

const BASE_ALIASES: Record<CanonicalField, string[]> = {
  name: ["urun adi", "urun adı", "name", "title", "product name"],
  slug: ["slug", "handle", "url", "permalink"],
  description: ["aciklama", "açıklama", "description", "body", "body (html)", "full description"],
  shortDescription: ["kisa aciklama", "kısa açıklama", "short description", "excerpt"],
  category: ["kategori", "category", "categories", "urun kategorisi"],
  tags: ["etiket", "etiketler", "tags"],
  published: ["yayinda", "yayında", "published", "is published", "visible"],
  status: ["status", "durum"],
  variantName: ["varyant", "varyant adi", "varyant adı", "variant", "option1 value", "attribute 1 value(s)"],
  weight: ["agirlik", "ağırlık", "weight", "grams", "variant grams"],
  price: ["fiyat", "price", "regular price", "variant price"],
  compareAtPrice: ["indirim oncesi fiyat", "compare at price", "sale price", "variant compare at price"],
  stock: ["stok", "stock", "stock quantity", "inventory", "variant inventory qty"],
  sku: ["sku", "stok kodu", "stock code", "variant sku"],
  images: ["gorseller", "görseller", "image", "image src", "images"],
};

const PROVIDERS: ProviderDefinition[] = [
  {
    id: "woocommerce",
    label: "WooCommerce",
    description: "WooCommerce CSV dışa aktarma formatı",
    templateHeaders: ["Name", "Slug", "Description", "Short description", "Categories", "SKU", "Regular price", "Sale price", "Stock", "Images", "Attribute 1 value(s)", "Weight (kg)", "Published"],
    templateRow: [
      "Şekersiz Fıstık Ezmesi",
      "sekersiz-fistik-ezmesi",
      "Doğal ve katkısız fıstık ezmesi.",
      "Şekersiz fıstık ezmesi.",
      "Fıstık Ezmesi > Şekersiz",
      "EZM-FS-450-1",
      "421",
      "399",
      "120",
      "https://cdn.celebix.app/products/fistik-1.jpg,https://cdn.celebix.app/products/fistik-2.jpg",
      "450 G",
      "0.45",
      "1",
    ],
    aliases: {
      variantName: ["attribute 1 value(s)", "option1 value"],
      published: ["published"],
    },
  },
  {
    id: "shopify",
    label: "Shopify",
    description: "Shopify Products CSV formatı",
    templateHeaders: ["Handle", "Title", "Body (HTML)", "Product Category", "Tags", "Status", "Option1 Name", "Option1 Value", "Variant SKU", "Variant Grams", "Variant Inventory Qty", "Variant Price", "Variant Compare At Price", "Image Src"],
    templateRow: [
      "sekersiz-fistik-ezmesi",
      "Şekersiz Fıstık Ezmesi",
      "<p>Doğal ve katkısız fıstık ezmesi.</p>",
      "Fıstık Ezmesi",
      "dogal,sekersiz,vegan",
      "active",
      "Gramaj",
      "450 G",
      "EZM-FS-450-1",
      "450",
      "120",
      "421",
      "449",
      "https://cdn.celebix.app/products/fistik-1.jpg",
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
    description: "IdeaSoft toplu ürün dosyası",
    templateHeaders: ["Ürün Adı", "Seo Link", "Kategori", "Kısa Açıklama", "Açıklama", "Stok Kodu", "Fiyat", "Stok Adedi", "Görseller", "Varyant Adı"],
    templateRow: [
      "Şekersiz Fıstık Ezmesi",
      "sekersiz-fistik-ezmesi",
      "Fıstık Ezmesi",
      "Şekersiz fıstık ezmesi.",
      "Doğal ve katkısız fıstık ezmesi.",
      "EZM-FS-450-1",
      "421",
      "120",
      "https://cdn.celebix.app/products/fistik-1.jpg|https://cdn.celebix.app/products/fistik-2.jpg",
      "450 G",
    ],
    aliases: {
      slug: ["seo link", "seolink"],
      shortDescription: ["kısa açıklama"],
      stock: ["stok adedi"],
      images: ["görseller"],
    },
  },
  {
    id: "ticimax",
    label: "Ticimax",
    description: "Ticimax dışa aktarma CSV/XLS başlıkları",
    templateHeaders: ["Ürün Adı", "SEO Url", "Kategori", "Açıklama", "Kısa Açıklama", "Stok Kodu", "Barkod", "Satış Fiyatı", "Piyasa Fiyatı", "Stok", "Resim 1", "Resim 2", "Varyant"],
    templateRow: [
      "Şekersiz Fıstık Ezmesi",
      "sekersiz-fistik-ezmesi",
      "Fıstık Ezmesi",
      "Doğal ve katkısız fıstık ezmesi.",
      "Şekersiz fıstık ezmesi.",
      "EZM-FS-450-1",
      "",
      "421",
      "449",
      "120",
      "https://cdn.celebix.app/products/fistik-1.jpg",
      "https://cdn.celebix.app/products/fistik-2.jpg",
      "450 G",
    ],
    aliases: {
      slug: ["seo url"],
      price: ["satış fiyatı", "satis fiyati"],
      compareAtPrice: ["piyasa fiyatı", "piyasa fiyati"],
      images: ["resim 1", "resim1", "görsel 1"],
    },
  },
  {
    id: "tsoft",
    label: "T-Soft",
    description: "T-Soft ürün aktarma başlıkları",
    templateHeaders: ["Ürün Adı", "Seo", "Kategori", "Açıklama", "Kısa Açıklama", "Stok Kodu", "Fiyat", "İndirimli Fiyat", "Stok", "Resim", "Varyant"],
    templateRow: [
      "Şekersiz Fıstık Ezmesi",
      "sekersiz-fistik-ezmesi",
      "Fıstık Ezmesi",
      "Doğal ve katkısız fıstık ezmesi.",
      "Şekersiz fıstık ezmesi.",
      "EZM-FS-450-1",
      "421",
      "399",
      "120",
      "https://cdn.celebix.app/products/fistik-1.jpg",
      "450 G",
    ],
    aliases: {
      slug: ["seo"],
      compareAtPrice: ["indirimli fiyat"],
      images: ["resim"],
    },
  },
  {
    id: "ikas",
    label: "ikas",
    description: "ikas ürün CSV formatı",
    templateHeaders: ["name", "slug", "description", "category", "tags", "sku", "price", "compare_at_price", "inventory", "weight", "images", "status", "variant"],
    templateRow: [
      "Şekersiz Fıstık Ezmesi",
      "sekersiz-fistik-ezmesi",
      "Doğal ve katkısız fıstık ezmesi.",
      "Fıstık Ezmesi",
      "dogal,sekersiz",
      "EZM-FS-450-1",
      "421",
      "449",
      "120",
      "450",
      "https://cdn.celebix.app/products/fistik-1.jpg",
      "active",
      "450 G",
    ],
    aliases: {
      compareAtPrice: ["compare_at_price"],
      stock: ["inventory"],
    },
  },
  {
    id: "opencart",
    label: "OpenCart",
    description: "OpenCart ürün aktarımı",
    templateHeaders: ["name", "seo_keyword", "description", "meta_description", "category", "sku", "price", "quantity", "image", "status", "model"],
    templateRow: [
      "Şekersiz Fıstık Ezmesi",
      "sekersiz-fistik-ezmesi",
      "Doğal ve katkısız fıstık ezmesi.",
      "Şekersiz fıstık ezmesi.",
      "Fıstık Ezmesi",
      "EZM-FS-450-1",
      "421",
      "120",
      "https://cdn.celebix.app/products/fistik-1.jpg",
      "1",
      "450 G",
    ],
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
    description: "PrestaShop ürün CSV yapısı",
    templateHeaders: ["Name", "URL rewritten", "Description", "Short description", "Categories", "Reference", "Price tax excluded", "Quantity", "Image URLs", "Active", "Supplier reference"],
    templateRow: [
      "Şekersiz Fıstık Ezmesi",
      "sekersiz-fistik-ezmesi",
      "Doğal ve katkısız fıstık ezmesi.",
      "Şekersiz fıstık ezmesi.",
      "Fıstık Ezmesi",
      "EZM-FS-450-1",
      "421",
      "120",
      "https://cdn.celebix.app/products/fistik-1.jpg,https://cdn.celebix.app/products/fistik-2.jpg",
      "1",
      "450 G",
    ],
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
    description: "Magento ürün import başlıkları",
    templateHeaders: ["sku", "name", "url_key", "description", "short_description", "categories", "price", "qty", "base_image", "small_image", "thumbnail_image", "product_online", "weight"],
    templateRow: [
      "EZM-FS-450-1",
      "Şekersiz Fıstık Ezmesi",
      "sekersiz-fistik-ezmesi",
      "Doğal ve katkısız fıstık ezmesi.",
      "Şekersiz fıstık ezmesi.",
      "Fıstık Ezmesi",
      "421",
      "120",
      "https://cdn.celebix.app/products/fistik-1.jpg",
      "https://cdn.celebix.app/products/fistik-2.jpg",
      "https://cdn.celebix.app/products/fistik-3.jpg",
      "1",
      "450",
    ],
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
    description: "BigCommerce ürün CSV formatı",
    templateHeaders: ["Product Name", "Product URL", "Description", "Categories", "Product Code/SKU", "Price", "Retail Price", "Current Stock", "Image URL", "Visible", "Option Set"],
    templateRow: [
      "Şekersiz Fıstık Ezmesi",
      "sekersiz-fistik-ezmesi",
      "Doğal ve katkısız fıstık ezmesi.",
      "Fıstık Ezmesi",
      "EZM-FS-450-1",
      "421",
      "449",
      "120",
      "https://cdn.celebix.app/products/fistik-1.jpg",
      "Y",
      "450 G",
    ],
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
    description: "Wix Stores ürün aktarımı",
    templateHeaders: ["Name", "Slug", "Description", "Ribbon", "Price", "Discounted Price", "In Stock", "Inventory", "SKU", "Media", "Collection", "Option Name", "Option Value"],
    templateRow: [
      "Şekersiz Fıstık Ezmesi",
      "sekersiz-fistik-ezmesi",
      "Doğal ve katkısız fıstık ezmesi.",
      "",
      "421",
      "399",
      "TRUE",
      "120",
      "EZM-FS-450-1",
      "https://cdn.celebix.app/products/fistik-1.jpg",
      "Fıstık Ezmesi",
      "Gramaj",
      "450 G",
    ],
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
    description: "Özel/karışık CSV dosyaları",
    templateHeaders: ["urun_adi", "slug", "aciklama", "kisa_aciklama", "kategori", "etiketler", "varyant", "agirlik", "fiyat", "indirim_oncesi_fiyat", "stok", "sku", "gorseller", "durum"],
    templateRow: [
      "Şekersiz Fıstık Ezmesi",
      "sekersiz-fistik-ezmesi",
      "Doğal ve katkısız fıstık ezmesi.",
      "Şekersiz fıstık ezmesi.",
      "Fıstık Ezmesi",
      "dogal,sekersiz,vegan",
      "450 G",
      "450",
      "421",
      "449",
      "120",
      "EZM-FS-450-1",
      "https://cdn.celebix.app/products/fistik-1.jpg|https://cdn.celebix.app/products/fistik-2.jpg",
      "active",
    ],
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
      errors: ["CSV dosyasında başlık ve en az bir veri satırı olmalıdır."],
      warnings: [],
      skippedRows: 0,
      totalRows: Math.max(rows.length - 1, 0),
    };
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
        name: name || "İsimsiz Ürün",
        slug: generatedSlug,
        description: cleanText(description),
        shortDescription: cleanText(shortDescription),
        categoryRaw,
        tags: new Set(tags),
        images: new Set(rowImages),
        vegan: /vegan/.test(dietarySource),
        glutenFree: /glutensiz|gluten[-\s]?free/.test(dietarySource),
        sugarFree: /sekersiz|şekersiz|sugar[-\s]?free/.test(dietarySource),
        highProtein: /high[-\s]?protein|protein/.test(dietarySource),
        variants: [],
        sourceRows: [humanRow],
      });
    }

    const draft = drafts.get(draftKey)!;
    if (name && draft.name === "İsimsiz Ürün") draft.name = name;
    if (!draft.slug && generatedSlug) draft.slug = generatedSlug;
    if (description && !draft.description) draft.description = cleanText(description);
    if (shortDescription && !draft.shortDescription) draft.shortDescription = cleanText(shortDescription);
    if (categoryRaw && !draft.categoryRaw) draft.categoryRaw = categoryRaw;
    tags.forEach((tag) => draft.tags.add(tag));
    rowImages.forEach((image) => draft.images.add(image));
    draft.sourceRows.push(humanRow);

    if (price <= 0) {
      warnings.push(`Satır ${humanRow}: Fiyat bulunamadı veya 0. Varyant atlandı.`);
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
    if (!draft.name || draft.name === "İsimsiz Ürün") {
      errors.push(`Ürün (${key}) adı bulunamadı. İlgili satırlar: ${draft.sourceRows.join(", ")}`);
      return;
    }

    if (!draft.slug) {
      draft.slug = toSlug(draft.name);
    }
    if (!draft.slug) {
      errors.push(`Ürün "${draft.name}" için geçerli slug üretilemedi.`);
      return;
    }

    if (draft.variants.length === 0) {
      warnings.push(`Ürün "${draft.name}" için fiyatlı varyant bulunamadı. Ürün atlandı.`);
      return;
    }

    const { category, subcategory } = mapCategory(draft.categoryRaw, draft.name, draft.slug);
    const description = draft.description || `${draft.name} urunu Celebix E-ticaret kataloguna toplu yukleme ile eklendi.`;
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

    if (char === "\r") {
      continue;
    }

    cell += char;
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

function buildIndexMap(headers: string[], aliases: Record<CanonicalField, string[]>): Record<CanonicalField, number> {
  const indexMap = {} as Record<CanonicalField, number>;
  (Object.keys(aliases) as CanonicalField[]).forEach((field) => {
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

function collectImages(row: string[], headers: string[], imageIndex: number): string[] {
  const images = new Set<string>();
  if (imageIndex >= 0) {
    splitMultiValue(getField(row, imageIndex)).forEach((item) => {
      if (looksLikeUrl(item)) images.add(item);
    });
  }

  headers.forEach((header, headerIndex) => {
    if (!header.includes("image") && !header.includes("gorsel") && !header.includes("görsel") && !header.includes("resim")) {
      return;
    }
    splitMultiValue(getField(row, headerIndex)).forEach((item) => {
      if (looksLikeUrl(item)) images.add(item);
    });
  });

  return Array.from(images).slice(0, 8);
}

function cleanText(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeHeader(value: string): string {
  return normalize(value)
    .replace(/[_\-]+/g, " ")
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

function splitMultiValue(value: string): string[] {
  return value
    .split(/[|,;]/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function toNumber(value: string, fallback: number | undefined): number {
  if (!value) return fallback ?? 0;
  const normalized = value
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}\b)/g, "")
    .replace(",", ".");
  const parsed = Number.parseFloat(normalized);
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

function mapCategory(rawCategory: string, productName: string, slug: string): {
  category: "fistik-ezmesi" | "findik-ezmesi" | "kuruyemis";
  subcategory: "sekersiz" | "hurmali" | "balli" | "klasik" | "sutlu-findik-kremasi" | "kakaolu" | "cig" | "kavrulmus";
} {
  const source = normalize(`${rawCategory} ${productName} ${slug}`);

  let category: "fistik-ezmesi" | "findik-ezmesi" | "kuruyemis" = "fistik-ezmesi";
  if (source.includes("findik")) category = "findik-ezmesi";
  if (source.includes("kuruyemis") || source.includes("kuruyemis") || source.includes("badem") || source.includes("ceviz") || source.includes("yer fistigi")) {
    category = "kuruyemis";
  }
  if (source.includes("fistik ezmesi") || source.includes("fistik kremasi")) {
    category = "fistik-ezmesi";
  }

  let subcategory: "sekersiz" | "hurmali" | "balli" | "klasik" | "sutlu-findik-kremasi" | "kakaolu" | "cig" | "kavrulmus" = "klasik";
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
  const seen = new Set<string>();
  const output: ParsedVariant[] = [];
  variants.forEach((variant, index) => {
    const key = `${variant.sku}|${variant.name}|${variant.price}`;
    if (seen.has(key)) return;
    seen.add(key);
    output.push({
      ...variant,
      sku: variant.sku || `EZM-VAR-${index + 1}`,
    });
  });
  return output;
}

function csvEscape(value: string): string {
  const text = String(value ?? "");
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, "\"\"")}"`;
}

function isTruthy(value: string, fallback: boolean): boolean {
  if (!value) return fallback;
  const normalized = normalize(value);
  if (["1", "true", "yes", "evet", "y", "active", "published"].includes(normalized)) return true;
  if (["0", "false", "no", "hayir", "n", "passive", "draft"].includes(normalized)) return false;
  return fallback;
}

function isFalsyStatus(value: string): boolean {
  if (!value) return false;
  const normalized = normalize(value);
  return ["draft", "archived", "pasif", "inactive", "disabled", "pending"].includes(normalized);
}

function looksLikeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}
