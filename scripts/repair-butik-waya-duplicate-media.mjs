import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const REQUEST_TIMEOUT_MS = 25_000;

function parseArgs(argv) {
  const args = {
    storeSlug: "butik-waya",
    adminBaseUrl: process.env.BUTIK_WAYA_ADMIN_URL?.trim() || "https://admin.celebix.site",
    dryRun: false,
    auditPath: path.resolve("stores", "butik-waya", "duplicate-media-audit.json"),
    limit: Number.parseInt(process.env.BUTIK_WAYA_DUPLICATE_MEDIA_LIMIT || "0", 10) || 0,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--store-slug" && argv[index + 1]) {
      args.storeSlug = argv[index + 1];
      index += 1;
      continue;
    }

    if (token === "--admin-base-url" && argv[index + 1]) {
      args.adminBaseUrl = argv[index + 1];
      index += 1;
      continue;
    }

    if (token === "--audit" && argv[index + 1]) {
      args.auditPath = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }

    if (token === "--limit" && argv[index + 1]) {
      args.limit = Number.parseInt(argv[index + 1], 10) || 0;
      index += 1;
      continue;
    }

    if (token === "--dry-run") {
      args.dryRun = true;
    }
  }

  return args;
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function toJsonObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...value } : {};
}

function toJsonArray(value) {
  return Array.isArray(value)
    ? value.map((item) => (item && typeof item === "object" && !Array.isArray(item) ? { ...item } : item))
    : [];
}

function normalizeUrl(value) {
  return typeof value === "string" ? value.trim() : "";
}

function formatUnknownError(error) {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object") {
    try {
      return JSON.stringify(error, null, 2);
    } catch {
      return String(error);
    }
  }

  return String(error);
}

function toAbsoluteUrl(value, baseUrl) {
  const normalized = normalizeUrl(value);
  if (!normalized) {
    return "";
  }

  try {
    return new URL(normalized, baseUrl).toString();
  } catch {
    return normalized;
  }
}

function extractFetchableImageUrl(value, adminBaseUrl) {
  const absolute = toAbsoluteUrl(value, adminBaseUrl);
  if (!absolute) {
    return "";
  }

  try {
    const url = new URL(absolute);
    const adminUrl = new URL(adminBaseUrl);
    if (url.origin === adminUrl.origin && url.pathname === "/api/assets") {
      return url.toString();
    }

    return `${adminUrl.origin}/api/assets?src=${encodeURIComponent(url.toString())}`;
  } catch {
    return absolute;
  }
}

async function fetchWithTimeout(resource, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(resource, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchProducts(adminBaseUrl) {
  const pageSize = 200;
  const products = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const response = await fetchWithTimeout(
      `${adminBaseUrl.replace(/\/+$/, "")}/api/products?page=${page}&limit=${pageSize}`,
      {
        headers: {
          accept: "application/json",
          "user-agent": "CelebixWayaDuplicateMediaRepair/1.0",
        },
      },
    );

    if (!response.ok) {
      throw new Error(`Admin products feed okunamadi: ${response.status} ${response.statusText}`);
    }

    const payload = await response.json();
    if (!payload?.success || !Array.isArray(payload.products)) {
      throw new Error("Admin products feed beklenen formatta donmedi.");
    }

    products.push(...payload.products);
    totalPages = Number.parseInt(String(payload?.pagination?.totalPages || 1), 10) || 1;
    page += 1;
  }

  return products;
}

async function updateProduct(adminBaseUrl, payload) {
  const response = await fetchWithTimeout(`${adminBaseUrl.replace(/\/+$/, "")}/api/products`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "user-agent": "CelebixWayaDuplicateMediaRepair/1.0",
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let parsed = null;

  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok || !parsed?.success) {
    const errorMessage =
      parsed?.error ||
      parsed?.message ||
      `${response.status} ${response.statusText}` ||
      "Product update failed";
    throw new Error(errorMessage);
  }

  return parsed.product;
}

async function computeImageFingerprint(url, adminBaseUrl, cache) {
  const fetchUrl = extractFetchableImageUrl(url, adminBaseUrl);
  if (!fetchUrl) {
    return { key: `url:${normalizeUrl(url)}`, fetchUrl: "", hashed: false, error: null };
  }

  const cached = cache.get(fetchUrl);
  if (cached) {
    return cached;
  }

  let result;

  try {
    const response = await fetchWithTimeout(fetchUrl, {
      headers: {
        accept: "image/*,*/*;q=0.8",
        "user-agent": "CelebixWayaDuplicateMediaRepair/1.0",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const hash = createHash("sha1").update(buffer).digest("hex");

    result = {
      key: `sha1:${hash}`,
      fetchUrl,
      hashed: true,
      error: null,
    };
  } catch (error) {
    result = {
      key: `url:${fetchUrl}`,
      fetchUrl,
      hashed: false,
      error: formatUnknownError(error),
    };
  }

  cache.set(fetchUrl, result);
  return result;
}

async function fingerprintMany(urls, adminBaseUrl, cache) {
  const entries = await Promise.all(
    (urls || []).map(async (url) => ({
      url,
      fingerprint: await computeImageFingerprint(url, adminBaseUrl, cache),
    })),
  );

  return entries;
}

function createImagesV2Record(url, image, productName, index) {
  const imageRecord = toJsonObject(image);
  return {
    ...imageRecord,
    url,
    alt: normalizeUrl(imageRecord.alt) || productName,
    is_primary: index === 0,
    sort_order: index,
  };
}

async function buildProductRepairPlan(product, adminBaseUrl, hashCache) {
  const productRecord = toJsonObject(product);
  const productName = normalizeUrl(productRecord.name) || normalizeUrl(productRecord.slug) || "Urun";
  const originalImages = Array.isArray(productRecord.images) ? productRecord.images.map((item) => normalizeUrl(item)).filter(Boolean) : [];
  const originalImagesV2 = Array.isArray(productRecord.images_v2) ? productRecord.images_v2.map((item) => toJsonObject(item)) : [];
  const originalVariants = Array.isArray(productRecord.variants) ? productRecord.variants.map((item) => toJsonObject(item)) : [];

  const imagesV2Urls = originalImagesV2.map((item) => normalizeUrl(item.url)).filter(Boolean);
  const gallerySources = [
    ...originalImages.map((url) => ({ url, source: "images", image: null })),
    ...originalImagesV2.map((image) => ({ url: normalizeUrl(image.url), source: "images_v2", image })),
  ].filter((item) => item.url);

  const galleryFingerprints = await fingerprintMany(
    gallerySources.map((item) => item.url),
    adminBaseUrl,
    hashCache,
  );

  const gallerySeen = new Set();
  const galleryByKey = new Map();
  const galleryOrder = [];

  let galleryExactDuplicatesRemoved = 0;
  let galleryContentDuplicatesRemoved = 0;
  let galleryHashMisses = 0;

  for (let index = 0; index < gallerySources.length; index += 1) {
    const source = gallerySources[index];
    const fingerprint = galleryFingerprints[index].fingerprint;
    const key = fingerprint.key;

    if (!fingerprint.hashed && fingerprint.error) {
      galleryHashMisses += 1;
    }

    if (gallerySeen.has(key)) {
      if (galleryByKey.get(key)?.url === source.url) {
        galleryExactDuplicatesRemoved += 1;
      } else {
        galleryContentDuplicatesRemoved += 1;
      }
      continue;
    }

    gallerySeen.add(key);
    galleryOrder.push(key);
    galleryByKey.set(key, source);
  }

  const nextImages = galleryOrder.map((key) => galleryByKey.get(key)?.url).filter(Boolean);
  const imageByUrl = new Map(originalImagesV2.map((image) => [normalizeUrl(image.url), image]));
  const nextImagesV2 = galleryOrder.map((key, index) => {
    const source = galleryByKey.get(key);
    return createImagesV2Record(source.url, imageByUrl.get(source.url) || source.image, productName, index);
  });

  const galleryKeySet = new Set(galleryOrder);

  let variantExactDuplicatesRemoved = 0;
  let variantContentDuplicatesRemoved = 0;
  let variantGalleryOverlapsRemoved = 0;
  let attributeGalleryOverlapsRemoved = 0;
  let attributeVariantOverlapsRemoved = 0;
  let variantHashMisses = 0;
  let attributeHashMisses = 0;

  const nextVariants = [];

  for (const variant of originalVariants) {
    const variantImages = Array.isArray(variant.images)
      ? variant.images.map((item) => normalizeUrl(item)).filter(Boolean)
      : normalizeUrl(variant.images)
        ? [normalizeUrl(variant.images)]
        : [];
    const variantFingerprints = await fingerprintMany(variantImages, adminBaseUrl, hashCache);
    const variantSeen = new Set();
    const keptVariantKeys = [];
    const keptVariantImages = [];

    for (let index = 0; index < variantImages.length; index += 1) {
      const url = variantImages[index];
      const fingerprint = variantFingerprints[index].fingerprint;
      const key = fingerprint.key;

      if (!fingerprint.hashed && fingerprint.error) {
        variantHashMisses += 1;
      }

      if (variantSeen.has(key)) {
        if (keptVariantImages.includes(url)) {
          variantExactDuplicatesRemoved += 1;
        } else {
          variantContentDuplicatesRemoved += 1;
        }
        continue;
      }

      variantSeen.add(key);

      if (galleryKeySet.has(key)) {
        variantGalleryOverlapsRemoved += 1;
        continue;
      }

      keptVariantKeys.push(key);
      keptVariantImages.push(url);
    }

    const keptVariantKeySet = new Set(keptVariantKeys);
    const attributes = toJsonArray(variant.attributes).map((attribute) => toJsonObject(attribute));
    const nextAttributes = [];

    for (const attribute of attributes) {
      const nextAttribute = { ...attribute };
      const attributeImageUrl = normalizeUrl(nextAttribute.image_url);

      if (!attributeImageUrl) {
        nextAttributes.push(nextAttribute);
        continue;
      }

      const fingerprint = await computeImageFingerprint(attributeImageUrl, adminBaseUrl, hashCache);
      if (!fingerprint.hashed && fingerprint.error) {
        attributeHashMisses += 1;
      }

      if (galleryKeySet.has(fingerprint.key)) {
        attributeGalleryOverlapsRemoved += 1;
        delete nextAttribute.image_url;
      } else if (keptVariantKeySet.has(fingerprint.key)) {
        attributeVariantOverlapsRemoved += 1;
        delete nextAttribute.image_url;
      }

      nextAttributes.push(nextAttribute);
    }

    nextVariants.push({
      ...variant,
      images: keptVariantImages,
      attributes: nextAttributes,
    });
  }

  const changed =
    JSON.stringify(originalImages) !== JSON.stringify(nextImages) ||
    JSON.stringify(originalImagesV2) !== JSON.stringify(nextImagesV2) ||
    JSON.stringify(
      originalVariants.map((variant) => ({
        images: Array.isArray(variant.images) ? variant.images : [],
        attributes: Array.isArray(variant.attributes) ? variant.attributes : [],
      })),
    ) !==
      JSON.stringify(
        nextVariants.map((variant) => ({
          images: Array.isArray(variant.images) ? variant.images : [],
          attributes: Array.isArray(variant.attributes) ? variant.attributes : [],
        })),
      );

  return {
    changed,
    nextImages,
    nextImagesV2,
    nextVariants,
    metrics: {
      galleryImageCountBefore: gallerySources.length,
      galleryImageCountAfter: nextImages.length,
      galleryExactDuplicatesRemoved,
      galleryContentDuplicatesRemoved,
      variantExactDuplicatesRemoved,
      variantContentDuplicatesRemoved,
      variantGalleryOverlapsRemoved,
      attributeGalleryOverlapsRemoved,
      attributeVariantOverlapsRemoved,
      galleryHashMisses,
      variantHashMisses,
      attributeHashMisses,
    },
  };
}

function buildUpdatePayload(product, plan) {
  const variants = (plan.nextVariants || []).map((variant) => ({
    id: variant.id,
    name: variant.name,
    weight: variant.weight,
    price: variant.price,
    original_price: variant.original_price,
    cost: variant.cost,
    stock: variant.stock,
    sku: variant.sku,
    barcode: variant.barcode,
    group_name: variant.group_name,
    unit: variant.unit,
    max_purchase_quantity: variant.max_purchase_quantity,
    warehouse_location: variant.warehouse_location,
    images: Array.isArray(variant.images)
      ? variant.images
      : normalizeUrl(variant.images)
        ? [normalizeUrl(variant.images)]
        : [],
    attributes: Array.isArray(variant.attributes) ? variant.attributes : [],
    shopify_metadata: toJsonObject(variant.shopify_metadata),
  }));

  return {
    id: product.id,
    images: plan.nextImages,
    images_v2: plan.nextImagesV2,
    variants,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const adminBaseUrl = args.adminBaseUrl.replace(/\/+$/, "");
  const hashCache = new Map();
  const products = await fetchProducts(adminBaseUrl);
  const limitedProducts = args.limit > 0 ? products.slice(0, args.limit) : products;

  const result = {
    storeSlug: args.storeSlug,
    adminBaseUrl,
    dryRun: args.dryRun,
    totalProducts: limitedProducts.length,
    affectedProducts: 0,
    updatedProducts: 0,
    failedProducts: 0,
    galleryExactDuplicatesRemoved: 0,
    galleryContentDuplicatesRemoved: 0,
    variantExactDuplicatesRemoved: 0,
    variantContentDuplicatesRemoved: 0,
    variantGalleryOverlapsRemoved: 0,
    attributeGalleryOverlapsRemoved: 0,
    attributeVariantOverlapsRemoved: 0,
    galleryHashMisses: 0,
    variantHashMisses: 0,
    attributeHashMisses: 0,
    samples: [],
    errors: [],
  };

  for (const product of limitedProducts) {
    const plan = await buildProductRepairPlan(product, adminBaseUrl, hashCache);
    if (!plan.changed) {
      continue;
    }

    result.affectedProducts += 1;
    result.galleryExactDuplicatesRemoved += plan.metrics.galleryExactDuplicatesRemoved;
    result.galleryContentDuplicatesRemoved += plan.metrics.galleryContentDuplicatesRemoved;
    result.variantExactDuplicatesRemoved += plan.metrics.variantExactDuplicatesRemoved;
    result.variantContentDuplicatesRemoved += plan.metrics.variantContentDuplicatesRemoved;
    result.variantGalleryOverlapsRemoved += plan.metrics.variantGalleryOverlapsRemoved;
    result.attributeGalleryOverlapsRemoved += plan.metrics.attributeGalleryOverlapsRemoved;
    result.attributeVariantOverlapsRemoved += plan.metrics.attributeVariantOverlapsRemoved;
    result.galleryHashMisses += plan.metrics.galleryHashMisses;
    result.variantHashMisses += plan.metrics.variantHashMisses;
    result.attributeHashMisses += plan.metrics.attributeHashMisses;

    if (result.samples.length < 20) {
      result.samples.push({
        slug: product.slug,
        name: product.name,
        ...plan.metrics,
      });
    }

    if (args.dryRun) {
      result.updatedProducts += 1;
      continue;
    }

    try {
      await updateProduct(adminBaseUrl, buildUpdatePayload(product, plan));
      result.updatedProducts += 1;
    } catch (error) {
      result.failedProducts += 1;
      result.errors.push(`${product.slug}: ${formatUnknownError(error)}`);
    }
  }

  writeJson(args.auditPath, result);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(formatUnknownError(error));
  process.exitCode = 1;
});
