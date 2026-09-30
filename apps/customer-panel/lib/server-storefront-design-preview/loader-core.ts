import {
  normalizeStarterThemeCompositionV4,
  type PublicProduct,
  type PublicStarterNavigationItem,
  type PublicStorefront,
  type StarterThemeCompositionConfigV4,
  type StarterThemeComposition,
  type StorefrontDesignWorkspace,
  type StorefrontDesignEditorWorkspace,
  type TenantContext,
} from "@celebix/saas-contracts";
import type { CatalogAdminRepository, CatalogOnboardingRepository, MerchantAdminRepository, PublicStorefrontRepository, StorefrontAssetRepository } from "@celebix/saas-data";

import {
  previewProductSourceKey,
  storefrontDesignPreviewDependencyKey,
  type StorefrontDesignPreviewProduct,
  type StorefrontDesignPreviewResourceStatus,
  type StorefrontDesignPreviewResources,
} from "../storefront-design-preview-model.ts";

const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ASSET_PATH = /^\/stores\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/storefront\/(?:logo|hero|social|favicon|category|collection)\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp)$/;

export class StorefrontDesignPreviewLoaderError extends Error {
  constructor(readonly code: "invalid_input" | "unavailable") {
    super(code);
    this.name = "StorefrontDesignPreviewLoaderError";
  }
}

function failure(code: "invalid_input" | "unavailable" = "unavailable"): StorefrontDesignPreviewLoaderError {
  return new StorefrontDesignPreviewLoaderError(code);
}

function exact(value: unknown, keys: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || (keys.some((key) => !Object.hasOwn(value, key)) || Object.keys(value).some((key) => !keys.includes(key) && !optional.includes(key)))) throw failure("invalid_input");
  return value as Record<string, unknown>;
}

function canonicalStorefront(tenantContext: TenantContext, storefront: PublicStorefront): void {
  const resolved = tenantContext.resolvedHost;
  if (!resolved || !HOSTNAME.test(resolved.canonicalHostname) || resolved.hostname !== resolved.canonicalHostname || resolved.storeId !== tenantContext.store.id || resolved.storeSlug !== tenantContext.store.slug) throw failure();
  if (storefront.id !== tenantContext.store.id || storefront.slug !== tenantContext.store.slug || storefront.hostname !== resolved.canonicalHostname || storefront.primaryHostname !== resolved.canonicalHostname) throw failure();
}

function collectionSlug(workspace: StorefrontDesignWorkspace | StorefrontDesignEditorWorkspace, categoryId: string): string | null {
  const destination = workspace.destinations.find((entry) => entry.kind === "collection" && entry.resourceId === categoryId);
  if (!destination) return null;
  const slug = destination.path.match(/^\/(?:collections|categories|kategori)\/([a-z0-9-]+)$/)?.[1] ?? "";
  return SLUG.test(slug) ? slug : null;
}

function productSlug(workspace: StorefrontDesignWorkspace | StorefrontDesignEditorWorkspace, productId: string): string | null {
  const destination = workspace.destinations.find((entry) => entry.kind === "product" && entry.resourceId === productId);
  if (!destination || !destination.path.startsWith("/products/")) return null;
  const slug = destination.path.slice("/products/".length);
  return SLUG.test(slug) ? slug : null;
}

function previewProduct(product: PublicProduct): StorefrontDesignPreviewProduct {
  return Object.freeze({
    id: product.id,
    slug: product.slug,
    title: product.title,
    currency: product.currency,
    priceCents: product.priceCents,
    ...(product.compareAtCents !== undefined ? { compareAtCents: product.compareAtCents } : {}),
    available: product.available,
    ...(product.brand ? { brand: Object.freeze({ name: product.brand.name }) } : {}),
    media: Object.freeze(product.media.slice(0, 2).map((media) => Object.freeze({
      url: media.url,
      altText: media.altText,
      ...(media.width !== undefined ? { width: media.width } : {}),
      ...(media.height !== undefined ? { height: media.height } : {}),
    }))),
  });
}

function sourceResult(key: string, status: StorefrontDesignPreviewResourceStatus, items: readonly PublicProduct[] = [], categorySlug?: string) {
  return Object.freeze({ key, status, items: Object.freeze(items.map(previewProduct)), ...(categorySlug ? { categorySlug } : {}) });
}

function safeAssetImage(asset: Awaited<ReturnType<StorefrontAssetRepository["listAssets"]>>[number]) {
  if (!asset.altText || !["image/jpeg", "image/png", "image/webp"].includes(asset.mediaType)) return undefined;
  let url: URL; try { url = new URL(asset.publicUrl); } catch { return undefined; }
  const extension = asset.mediaType === "image/jpeg" ? ".jpg" : asset.mediaType === "image/png" ? ".png" : ".webp";
  if (url.protocol !== "https:" || !["media.celebix.site", "media.saas-staging.celebix.site"].includes(url.hostname) || url.username || url.password || url.port || url.search || url.hash || !ASSET_PATH.test(url.pathname) || !url.pathname.endsWith(extension)) return undefined;
  return Object.freeze({ url: asset.publicUrl, mediaType: asset.mediaType, altText: asset.altText, width: asset.width, height: asset.height });
}

export function createServerStorefrontDesignPreviewLoader(dependencies: Readonly<{
  publicStorefront: PublicStorefrontRepository;
  assets: StorefrontAssetRepository;
  merchantAdmin: Pick<MerchantAdminRepository, "list">;
  reviews?: Pick<CatalogAdminRepository, "listReviews">;
  categories?: Pick<CatalogOnboardingRepository, "listCategories">;
}>) {
  if (!dependencies || typeof dependencies.publicStorefront?.getPublicStorefront !== "function" || typeof dependencies.assets?.listAssets !== "function" || typeof dependencies.merchantAdmin?.list !== "function") throw failure("invalid_input");
  return Object.freeze({
    async load(input: Readonly<{
      tenantContext: TenantContext;
      now: Date;
      workspace: StorefrontDesignWorkspace | StorefrontDesignEditorWorkspace;
      composition: StarterThemeComposition;
      previewProductId?: string;
    }>): Promise<StorefrontDesignPreviewResources> {
      const parsed = exact(input, ["tenantContext", "now", "workspace", "composition"], ["previewProductId"]);
      const tenantContext = parsed.tenantContext as TenantContext;
      const workspace = parsed.workspace as StorefrontDesignWorkspace | StorefrontDesignEditorWorkspace;
      if (!(parsed.now instanceof Date) || !Number.isFinite(parsed.now.getTime())) throw failure("invalid_input");
      const now = new Date(parsed.now);
      const previewProductId = parsed.previewProductId as string | undefined;
      if (previewProductId !== undefined && (typeof previewProductId !== "string" || !UUID.test(previewProductId))) throw failure("invalid_input");
      let composition: StarterThemeCompositionConfigV4;
      try { composition = normalizeStarterThemeCompositionV4(parsed.composition as StarterThemeCompositionConfigV4); }
      catch { throw failure("invalid_input"); }
      const resolved = tenantContext.resolvedHost;
      if (!resolved || resolved.status !== "active" || resolved.hostname !== resolved.canonicalHostname || resolved.storeId !== tenantContext.store.id || resolved.storeSlug !== tenantContext.store.slug || !HOSTNAME.test(resolved.canonicalHostname)) throw failure();

      let storefront: PublicStorefront;
      try { storefront = await dependencies.publicStorefront.getPublicStorefront({ hostname: resolved.canonicalHostname, now }); }
      catch { throw failure(); }
      canonicalStorefront(tenantContext, storefront);

      const sourceLimits = new Map<string, number>();
      const assetIds = new Set<string>();
      if (composition.navigation.featuredAssetId) assetIds.add(composition.navigation.featuredAssetId);
      const hotspotIds = new Set<string>();
      const mediaIds = new Set<string>();
      const selectedCategoryIds = [...new Set(composition.sections.flatMap((section) =>
        section.enabled && section.kind === "category_grid" ? section.categoryIds : []))];
      for (const section of composition.sections) {
        if (!section.enabled) continue;
        if (section.kind === "product_row") {
          const key = previewProductSourceKey(section);
          sourceLimits.set(key, Math.max(sourceLimits.get(key) ?? 0, section.limit));
        } else if (section.kind === "banner") {
          for (const slide of section.slides.filter((slide) => slide.enabled)) {
            for (const reference of [slide.desktopImage, slide.mobileImage]) {
              if (reference?.kind === "asset") assetIds.add(reference.assetId);
              if (reference?.kind === "media") mediaIds.add(reference.mediaId);
            }
            if (slide.productId) hotspotIds.add(slide.productId);
          }
        } else if (section.kind === "split_campaign") {
          for (const panel of section.panels) assetIds.add(panel.assetId);
        } else if (section.kind === "brand_story" && section.assetId) assetIds.add(section.assetId);
      }

      const legacyCategoryIds = new Set(composition.sections.flatMap((section) => section.enabled && section.kind === "category_grid" && !Object.hasOwn(section, "categoryImages") ? section.categoryIds : []));
      const categoryAssets = new Map<string, string>();
      for (const section of composition.sections) if (section.enabled && section.kind === "category_grid") {
        for (const mapping of section.categoryImages ?? []) if (section.categoryIds.includes(mapping.categoryId)) assetIds.add(mapping.assetId);
      }
      let categoryReadUnavailable = false;
      if (legacyCategoryIds.size) {
        try {
          const records = await dependencies.merchantAdmin.list({ tenantContext, now, kind: "category_showcase" });
          const active = records.filter((record) => record.kind === "category_showcase" && record.status === "active")
            .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id));
          for (const record of active) {
            const items = record.config.items;
            if (!Array.isArray(items) || items.length > 8) throw failure();
            for (const item of items) {
              if (!item || typeof item !== "object" || Array.isArray(item) ||
                typeof item.categoryId !== "string" || !UUID.test(item.categoryId) ||
                typeof item.assetId !== "string" || !UUID.test(item.assetId)) throw failure();
              if (legacyCategoryIds.has(item.categoryId) && !categoryAssets.has(item.categoryId)) categoryAssets.set(item.categoryId, item.assetId);
            }
          }
          for (const id of selectedCategoryIds) {
            const assetId = categoryAssets.get(id);
            if (assetId) assetIds.add(assetId);
          }
        } catch { categoryReadUnavailable = true; }
      }

      for (const assetId of categoryAssets.values()) assetIds.add(assetId);
      const categoryReads = new Map<string, ReturnType<PublicStorefrontRepository["listPublicProductsByCategory"]>>();
      function authorizedCategory(id: string, slug: string) {
        const key = `${id}:${slug}`;
        let selected = categoryReads.get(key);
        if (!selected) { selected = dependencies.publicStorefront.listPublicProductsByCategory({ storefront, now, slug, limit: 1 }); categoryReads.set(key, selected); }
        return selected;
      }
      const fullProducts = new Map<string, PublicProduct>();
      const productReads = new Map<string, Promise<PublicProduct | undefined>>();
      async function authorizedProduct(id: string, detail = false): Promise<PublicProduct | undefined> {
        const slug = productSlug(workspace, id);
        if (!slug) return undefined;
        const reusable = fullProducts.get(id);
        if (!detail && reusable?.slug === slug) return reusable;
        let pending = !detail ? productReads.get(id) : undefined;
        if (!pending) {
          pending = dependencies.publicStorefront.getPublicProductBySlug({ storefront, now, slug }).then((product) => {
            if (product.id !== id || product.slug !== slug || product.status !== "active") return undefined;
            fullProducts.set(id, product); return product;
          });
          if (!detail) productReads.set(id, pending);
        }
        return pending;
      }
      async function catalogProducts(limit: number, filter: "available" | "available_discounted", categorySlug: string | null = null): Promise<readonly PublicProduct[]> {
        const query = dependencies.publicStorefront.queryPublicCatalog;
        if (!query) {
          const listed = categorySlug ? await dependencies.publicStorefront.listPublicProductsByCategory({ storefront, now, slug: categorySlug, limit: 48 }) : await dependencies.publicStorefront.listPublicProducts({ storefront, now, limit: 48 });
          return listed.items.filter((product) => product.available && (filter !== "available_discounted" || (product.compareAtCents ?? 0) > product.priceCents)).slice(0, limit);
        }
        const items: PublicProduct[] = []; let offset = 0;
        for (;;) {
          const page = await query.call(dependencies.publicStorefront, { storefront, now, categorySlug, query: "", filter, order: "featured", limit: 48, offset });
          items.push(...page.items.filter((product) => product.available));
          if (items.length >= limit || page.nextOffset === null) return items.slice(0, limit);
          if (page.nextOffset <= offset) throw failure();
          offset = page.nextOffset;
        }
      }
      const productSources: Awaited<ReturnType<typeof sourceResult>>[] = [];
      for (const key of ["sale", "latest"]) if (sourceLimits.has(key)) {
        try {
          const items = await catalogProducts(sourceLimits.get(key)!, key === "sale" ? "available_discounted" : "available");
          for (const product of items) fullProducts.set(product.id, product);
          productSources.push(sourceResult(key, items.length ? "ready" : "empty", items));
        } catch { productSources.push(sourceResult(key, "unavailable")); }
      }
      for (const [key, limit] of [...sourceLimits].filter(([key]) => key.startsWith("category:")).sort(([left], [right]) => left.localeCompare(right))) {
        const categoryId = key.slice("category:".length);
        const slug = collectionSlug(workspace, categoryId);
        if (!slug) { productSources.push(sourceResult(key, "missing")); continue; }
        try {
          const result = await authorizedCategory(categoryId, slug);
          if (result.category.id !== categoryId || result.category.slug !== slug) { productSources.push(sourceResult(key, "missing")); continue; }
          const items = await catalogProducts(limit, "available", slug);
          for (const product of items) fullProducts.set(product.id, product);
          productSources.push(sourceResult(key, items.length ? "ready" : "empty", items, slug));
        } catch { productSources.push(sourceResult(key, "unavailable", [], slug)); }
      }
      for (const section of composition.sections) if (section.enabled && section.kind === "product_row" && section.source === "manual") {
        const ids = section.productIds ?? [];
        const loaded = await Promise.all(ids.map(async (id) => { try { return await authorizedProduct(id); } catch { return undefined; } }));
        const items = loaded.filter((product): product is PublicProduct => Boolean(product?.available)).slice(0, section.limit);
        productSources.push(sourceResult(previewProductSourceKey(section), ids.length === 0 ? "empty" : items.length === ids.length ? "ready" : items.length ? "partial" : "missing", items));
      }

      const assets = new Map<string, StorefrontDesignPreviewResources["assets"][number]>();
      const selectedAssets = new Map<string, Awaited<ReturnType<StorefrontAssetRepository["listAssets"]>>[number]>();
      if (assetIds.size) {
        try {
          const listed = await dependencies.assets.listAssets({ tenantContext, now, includeArchived: false });
          const selected = new Map(listed.filter((asset) => asset.status === "active" && asset.storeId === tenantContext.store.id && assetIds.has(asset.id)).map((asset) => [asset.id, asset]));
          for (const [id, asset] of selected) selectedAssets.set(id, asset);
          for (const id of [...assetIds].sort()) {
            const asset = selected.get(id);
            const image = asset ? safeAssetImage(asset) : undefined;
            assets.set(id, image ? Object.freeze({ id, status: "ready", image }) : Object.freeze({ id, status: asset ? "unavailable" : "missing" }));
          }
        } catch {
          for (const id of [...assetIds].sort()) assets.set(id, Object.freeze({ id, status: "unavailable" }));
        }
      }

      const reusableProducts = new Map(productSources.flatMap((source) => source.items).map((product) => [product.id, product]));
      let navigation: StorefrontDesignPreviewResources["navigation"];
      const navigationRoots = composition.navigation.rootLinks ?? composition.navigation.rootCategoryIds.map(resourceId => ({ kind: "category" as const, resourceId }));
      if (navigationRoots.length === 0) navigation = Object.freeze({ status: "ready", value: Object.freeze({ items: Object.freeze([]) }) });
      else if (dependencies.categories) try {
        const listed = await dependencies.categories.listCategories({ tenantContext, now });
        const active = new Map(listed.filter((category) => category.status === "active").map((category) => [category.id, category]));
        const children = new Map<string, typeof listed[number][]>();
        for (const category of active.values()) if (category.parentId) {
          const siblings = children.get(category.parentId) ?? [];
          siblings.push(category); children.set(category.parentId, siblings);
        }
        for (const siblings of children.values()) siblings.sort((left, right) => left.position - right.position || left.id.localeCompare(right.id));
        const featured = composition.navigation.featuredAssetId ? assets.get(composition.navigation.featuredAssetId) : undefined;
        const item = (id: string, depth: number): PublicStarterNavigationItem | undefined => {
          const category = active.get(id); if (!category) return undefined;
          return Object.freeze({ name: category.name, slug: category.slug, children: Object.freeze(depth < 2 ? (children.get(id) ?? []).slice(0, 8).flatMap((child) => { const selected = item(child.id, depth + 1); return selected ? [selected] : []; }) : []), ...(id === composition.navigation.featuredCategoryId && featured?.status === "ready" && featured.image ? { featured: Object.freeze({ name: category.name, slug: category.slug, image: featured.image }) } : {}) });
        };
        const items = Object.freeze(navigationRoots.flatMap((link): PublicStarterNavigationItem[] => {
          if (link.kind === "category") { const selected = item(link.resourceId, 0); return selected ? [selected] : []; }
          const destination = workspace.destinations.find(entry => entry.kind === "catalog_collection" && entry.resourceId === link.resourceId);
          const slug = destination?.path.match(/^\/collections\/([a-z0-9-]+)$/)?.[1];
          return destination && slug ? [Object.freeze({ name: destination.label, slug, children: Object.freeze([]), kind: "catalog_collection", resourceId: link.resourceId, path: destination.path })] : [];
        }));
        const featuredUnavailable = composition.navigation.featuredAssetId && featured?.status !== "ready";
        navigation = items.length ? Object.freeze({ status: items.length === navigationRoots.length && !featuredUnavailable ? "ready" : "partial", value: Object.freeze({ items }) }) : Object.freeze({ status: "missing" });
      } catch { navigation = Object.freeze({ status: "unavailable" }); }
      else navigation = Object.freeze({ status: "unavailable" });
      const hotspots: StorefrontDesignPreviewResources["hotspots"][number][] = [];
      for (const productId of [...hotspotIds].sort()) {
        const slug = productSlug(workspace, productId);
        if (!slug) { hotspots.push(Object.freeze({ productId, status: "missing" })); continue; }
        const reusable = reusableProducts.get(productId);
        if (reusable?.slug === slug) { hotspots.push(Object.freeze({ productId, status: "ready", value: Object.freeze({ productSlug: reusable.slug, title: reusable.title, priceCents: reusable.priceCents, currency: reusable.currency }) })); continue; }
        try {
          const product = await dependencies.publicStorefront.getPublicProductBySlug({ storefront, now, slug });
          if (product.id !== productId || product.slug !== slug) { hotspots.push(Object.freeze({ productId, status: "missing" })); continue; }
          hotspots.push(Object.freeze({ productId, status: "ready", value: Object.freeze({ productSlug: product.slug, title: product.title, priceCents: product.priceCents, currency: product.currency }) }));
        } catch { hotspots.push(Object.freeze({ productId, status: "unavailable" })); }
      }

      const categoryIdentities = new Map<string, { id: string; name: string; slug: string }>();
      const unavailableCategoryIds = new Set<string>();
      await Promise.all(selectedCategoryIds.map(async (id) => {
        const slug = collectionSlug(workspace, id);
        if (!slug) return;
        try {
          const result = await authorizedCategory(id, slug);
          if (result.category.id === id && result.category.slug === slug) categoryIdentities.set(id, result.category);
        } catch { unavailableCategoryIds.add(id); }
      }));
      const categorySections = Object.freeze(composition.sections.flatMap((section) => {
        if (!section.enabled || section.kind !== "category_grid") return [];
        const items = Object.freeze(section.categoryIds.flatMap((id) => {
          const category = categoryIdentities.get(id);
          const selectedId = Object.hasOwn(section, "categoryImages") ? section.categoryImages?.find((mapping) => mapping.categoryId === id)?.assetId : categoryAssets.get(id);
          const selected = selectedId ? selectedAssets.get(selectedId) : undefined;
          const image = selected?.kind === "category" ? assets.get(selected.id)?.image : undefined;
          return category && image ? [Object.freeze({ ...category, image })] : [];
        }));
        const unavailable = section.categoryIds.some((id) => unavailableCategoryIds.has(id)) || (!Object.hasOwn(section, "categoryImages") && categoryReadUnavailable);
        const status: StorefrontDesignPreviewResourceStatus = items.length ? items.length === section.categoryIds.length ? "ready" : "partial" : section.categoryIds.length === 0 ? "empty" : unavailable ? "unavailable" : "missing";
        return [Object.freeze({ sectionId: section.sectionId, status, ...(items.length ? { value: Object.freeze({ heading: section.heading, layout: section.layout, items }) } : {}) })];
      }));
      const firstCategories = categorySections[0];
      const categoryShowcase = firstCategories?.value
        ? Object.freeze({ status: "ready" as const, value: firstCategories.value })
        : Object.freeze({ status: firstCategories?.status ?? "missing" as const });
      const designMedia = workspace.schemaVersion === 1 ? workspace.media.filter((option) => option.reference.kind === "media") : workspace.media;
      const media = Object.freeze([...mediaIds].sort().map((id) => {
        const selected = designMedia.find((option) => option.id === id);
        return selected ? Object.freeze({ id, status: "ready" as const, image: Object.freeze({ url: selected.url, altText: selected.altText, mediaType: selected.mediaType, width: selected.width, height: selected.height }) }) : Object.freeze({ id, status: "missing" as const });
      }));
      const representativeId = previewProductId ?? workspace.destinations.find((item) => item.kind === "product")?.resourceId;
      let productDetail: NonNullable<StorefrontDesignPreviewResources["productDetail"]> = Object.freeze({ status: "empty" });
      let relatedProducts: StorefrontDesignPreviewResources["relatedProducts"] = Object.freeze([]);
      if (representativeId) {
        try {
          const product = await authorizedProduct(representativeId, true);
          if (!product) productDetail = Object.freeze({ status: "missing" });
          else {
            // Full gallery is independent of the compact home-card projection.
            let media = product.media;
            try { media = await dependencies.publicStorefront.listPublicProductMedia({ storefront, now, productId: product.id }); } catch { /* Detail's existing images remain valid. */ }
            productDetail = Object.freeze({ status: "ready", value: Object.freeze({ ...product, media }) });
            if (dependencies.publicStorefront.listRelatedPublicProducts) try {
              const related = await dependencies.publicStorefront.listRelatedPublicProducts({ storefront, now, productSlug: product.slug, limit: 4 });
              relatedProducts = Object.freeze(related.items.map(previewProduct));
            } catch { /* Related products are optional. */ }
          }
        } catch { productDetail = Object.freeze({ status: "unavailable" }); }
      }
      let testimonials: NonNullable<StorefrontDesignPreviewResources["testimonials"]> = Object.freeze({ status: "unavailable", items: Object.freeze([]) });
      if (composition.sections.some((section) => section.enabled && section.kind === "testimonials") && dependencies.reviews) try {
        const reviews = await dependencies.reviews.listReviews({ tenantContext, now, status: "approved" });
        const approved = reviews.filter((review) => review.status === "approved" && Number.isInteger(review.rating) && review.rating >= 1 && review.rating <= 5);
        // Nine reviews for each rating threshold cover every editable section limit without an oversized response.
        const selected = [...new Map([1,2,3,4,5].flatMap((minimum) => approved.filter((review) => review.rating >= minimum).slice(0, 9)).map((review) => [review.id, review])).values()];
        const items = Object.freeze(selected.map((review) => Object.freeze({ reviewerName: review.reviewerName, rating: review.rating as 1 | 2 | 3 | 4 | 5, ...(review.title ? { title: review.title } : {}), body: review.body, ...(review.merchantReply ? { merchantReply: review.merchantReply } : {}) })));
        testimonials = Object.freeze({ status: items.length ? "ready" : "empty", items });
      } catch { /* Only approved, tenant-owned reviews can be displayed. */ }
      return Object.freeze({
        schemaVersion: 1,
        dependencyKey: storefrontDesignPreviewDependencyKey(composition, previewProductId),
        productDetail,
        navigation,
        relatedProducts,
        testimonials,
        productSources: Object.freeze(productSources.sort((left, right) => left.key.localeCompare(right.key))),
        assets: Object.freeze([...assets.values()]),
        hotspots: Object.freeze(hotspots),
        categoryShowcase,
        categorySections,
        media,
      });
    },
  });
}

export type ServerStorefrontDesignPreviewLoader = ReturnType<typeof createServerStorefrontDesignPreviewLoader>;
