(async () => {
  const PAGE_SIZE = 200;
  const hashCache = new Map();

  function normalizeUrl(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function toObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? { ...value } : {};
  }

  function toArray(value) {
    return Array.isArray(value)
      ? value.map((item) => (item && typeof item === "object" && !Array.isArray(item) ? { ...item } : item))
      : [];
  }

  async function fetchJson(url, init = {}) {
    const response = await fetch(url, {
      credentials: "include",
      headers: {
        accept: "application/json",
        ...(init.headers || {}),
      },
      ...init,
    });

    const text = await response.text();
    let payload = null;

    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }

    if (!response.ok || payload?.success === false) {
      throw new Error(payload?.error || payload?.message || `${response.status} ${response.statusText}`);
    }

    return payload;
  }

  async function fetchProducts() {
    const products = [];
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
      const payload = await fetchJson(`/api/products?page=${page}&limit=${PAGE_SIZE}`);
      products.push(...(Array.isArray(payload?.products) ? payload.products : []));
      totalPages = Number.parseInt(String(payload?.pagination?.totalPages || 1), 10) || 1;
      page += 1;
    }

    return products;
  }

  async function sha1Hex(buffer) {
    const digest = await crypto.subtle.digest("SHA-1", buffer);
    return Array.from(new Uint8Array(digest))
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
  }

  async function fingerprint(url) {
    const normalized = normalizeUrl(url);
    if (!normalized) {
      return { key: "url:", hashed: false, error: "Bos URL" };
    }

    const absolute = new URL(normalized, location.origin).toString();
    if (hashCache.has(absolute)) {
      return hashCache.get(absolute);
    }

    let result;

    try {
      const response = await fetch(absolute, {
        credentials: "include",
        headers: {
          accept: "image/*,*/*;q=0.8",
        },
      });

      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }

      const buffer = await response.arrayBuffer();
      const hash = await sha1Hex(buffer);
      result = {
        key: `sha1:${hash}`,
        hashed: true,
        error: null,
      };
    } catch (error) {
      result = {
        key: `url:${absolute}`,
        hashed: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    hashCache.set(absolute, result);
    return result;
  }

  async function fingerprintMany(urls) {
    return Promise.all(
      (urls || []).map(async (url) => ({
        url,
        fingerprint: await fingerprint(url),
      })),
    );
  }

  function createImagesV2Record(url, image, productName, index) {
    const imageRecord = toObject(image);
    return {
      ...imageRecord,
      url,
      alt: normalizeUrl(imageRecord.alt) || productName,
      isPrimary: index === 0,
      sortOrder: index,
    };
  }

  async function buildPlan(product) {
    const productRecord = toObject(product);
    const productName = normalizeUrl(productRecord.name) || normalizeUrl(productRecord.slug) || "Urun";
    const originalImages = Array.isArray(productRecord.images)
      ? productRecord.images.map((item) => normalizeUrl(item)).filter(Boolean)
      : [];
    const originalImagesV2 = Array.isArray(productRecord.images_v2)
      ? productRecord.images_v2.map((item) => toObject(item))
      : [];
    const originalVariants = Array.isArray(productRecord.variants)
      ? productRecord.variants.map((item) => toObject(item))
      : [];

    const gallerySources = [
      ...originalImages.map((url) => ({ url, image: null })),
      ...originalImagesV2
        .map((image) => ({ url: normalizeUrl(image.url), image }))
        .filter((entry) => entry.url),
    ];

    const galleryFingerprints = await fingerprintMany(gallerySources.map((entry) => entry.url));
    const gallerySeen = new Set();
    const galleryByKey = new Map();
    const galleryOrder = [];

    let galleryExactDuplicatesRemoved = 0;
    let galleryContentDuplicatesRemoved = 0;
    let galleryHashMisses = 0;

    for (let index = 0; index < gallerySources.length; index += 1) {
      const source = gallerySources[index];
      const currentFingerprint = galleryFingerprints[index].fingerprint;
      const key = currentFingerprint.key;

      if (!currentFingerprint.hashed && currentFingerprint.error) {
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
      const variantFingerprints = await fingerprintMany(variantImages);
      const variantSeen = new Set();
      const keptVariantKeys = [];
      const keptVariantImages = [];

      for (let index = 0; index < variantImages.length; index += 1) {
        const url = variantImages[index];
        const currentFingerprint = variantFingerprints[index].fingerprint;
        const key = currentFingerprint.key;

        if (!currentFingerprint.hashed && currentFingerprint.error) {
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
      const attributes = toArray(variant.attributes).map((attribute) => toObject(attribute));
      const nextAttributes = [];

      for (const attribute of attributes) {
        const nextAttribute = { ...attribute };
        const attributeImageUrl = normalizeUrl(nextAttribute.image_url);

        if (!attributeImageUrl) {
          nextAttributes.push(nextAttribute);
          continue;
        }

        const currentFingerprint = await fingerprint(attributeImageUrl);
        if (!currentFingerprint.hashed && currentFingerprint.error) {
          attributeHashMisses += 1;
        }

        if (galleryKeySet.has(currentFingerprint.key)) {
          attributeGalleryOverlapsRemoved += 1;
          delete nextAttribute.image_url;
        } else if (keptVariantKeySet.has(currentFingerprint.key)) {
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
          images: Array.isArray(variant.images)
            ? variant.images
            : normalizeUrl(variant.images)
              ? [normalizeUrl(variant.images)]
              : [],
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
    return {
      id: product.id,
      images: plan.nextImages,
      images_v2: plan.nextImagesV2,
      variants: (plan.nextVariants || []).map((variant) => ({
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
        shopify_metadata: toObject(variant.shopify_metadata),
      })),
    };
  }

  const products = await fetchProducts();
  const result = {
    totalProducts: products.length,
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

  for (const product of products) {
    const plan = await buildPlan(product);
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

    try {
      await fetchJson("/api/products", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(buildUpdatePayload(product, plan)),
      });
      result.updatedProducts += 1;
    } catch (error) {
      result.failedProducts += 1;
      result.errors.push(`${product.slug}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log("Butik Waya duplicate media repair result", result);
  return result;
})()
