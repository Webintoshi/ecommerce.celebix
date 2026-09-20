import {
  normalizeStarterThemeCompositionV3,
  type PublicProduct,
  type PublicStorefront,
  type StarterThemeCompositionConfigV3,
  type StarterThemeComposition,
  type StorefrontDesignWorkspace,
  type TenantContext,
} from "@celebix/saas-contracts";
import type { PublicStorefrontRepository, StorefrontAssetRepository } from "@celebix/saas-data";

import {
  previewProductSourceKey,
  storefrontDesignPreviewDependencyKey,
  type StorefrontDesignPreviewProduct,
  type StorefrontDesignPreviewResourceStatus,
  type StorefrontDesignPreviewResources,
} from "../storefront-design-preview-model.ts";

const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ASSET_PATH = /^\/stores\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/storefront\/(?:logo|hero|social|favicon|category)\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp)$/;

export class StorefrontDesignPreviewLoaderError extends Error {
  constructor(readonly code: "invalid_input" | "unavailable") {
    super(code);
    this.name = "StorefrontDesignPreviewLoaderError";
  }
}

function failure(code: "invalid_input" | "unavailable" = "unavailable"): StorefrontDesignPreviewLoaderError {
  return new StorefrontDesignPreviewLoaderError(code);
}

function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).sort().join(",") !== [...keys].sort().join(",")) throw failure("invalid_input");
  return value as Record<string, unknown>;
}

function canonicalStorefront(tenantContext: TenantContext, storefront: PublicStorefront): void {
  const resolved = tenantContext.resolvedHost;
  if (!resolved || !HOSTNAME.test(resolved.canonicalHostname) || resolved.hostname !== resolved.canonicalHostname || resolved.storeId !== tenantContext.store.id || resolved.storeSlug !== tenantContext.store.slug) throw failure();
  if (storefront.id !== tenantContext.store.id || storefront.slug !== tenantContext.store.slug || storefront.hostname !== resolved.canonicalHostname || storefront.primaryHostname !== resolved.canonicalHostname) throw failure();
}

function collectionSlug(workspace: StorefrontDesignWorkspace, categoryId: string): string | null {
  const destination = workspace.destinations.find((entry) => entry.kind === "collection" && entry.resourceId === categoryId);
  if (!destination || !destination.path.startsWith("/collections/")) return null;
  const slug = destination.path.slice("/collections/".length);
  return SLUG.test(slug) ? slug : null;
}

function productSlug(workspace: StorefrontDesignWorkspace, productId: string): string | null {
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
}>) {
  if (!dependencies || typeof dependencies.publicStorefront?.getPublicStorefront !== "function" || typeof dependencies.assets?.listAssets !== "function") throw failure("invalid_input");
  return Object.freeze({
    async load(input: Readonly<{
      tenantContext: TenantContext;
      now: Date;
      workspace: StorefrontDesignWorkspace;
      composition: StarterThemeComposition;
    }>): Promise<StorefrontDesignPreviewResources> {
      const parsed = exact(input, ["tenantContext", "now", "workspace", "composition"]);
      const tenantContext = parsed.tenantContext as TenantContext;
      const workspace = parsed.workspace as StorefrontDesignWorkspace;
      if (!(parsed.now instanceof Date) || !Number.isFinite(parsed.now.getTime())) throw failure("invalid_input");
      const now = new Date(parsed.now);
      let composition: StarterThemeCompositionConfigV3;
      try { composition = normalizeStarterThemeCompositionV3(parsed.composition as StarterThemeCompositionConfigV3); }
      catch { throw failure("invalid_input"); }
      const resolved = tenantContext.resolvedHost;
      if (!resolved || resolved.status !== "active" || resolved.hostname !== resolved.canonicalHostname || resolved.storeId !== tenantContext.store.id || resolved.storeSlug !== tenantContext.store.slug || !HOSTNAME.test(resolved.canonicalHostname)) throw failure();

      let storefront: PublicStorefront;
      try { storefront = await dependencies.publicStorefront.getPublicStorefront({ hostname: resolved.canonicalHostname, now }); }
      catch { throw failure(); }
      canonicalStorefront(tenantContext, storefront);

      const sourceLimits = new Map<string, number>();
      const assetIds = new Set<string>();
      const hotspotIds = new Set<string>();
      for (const section of composition.sections) {
        if (!section.enabled) continue;
        if (section.kind === "product_row") {
          const key = previewProductSourceKey(section);
          sourceLimits.set(key, Math.max(sourceLimits.get(key) ?? 0, section.limit));
        } else if (section.kind === "hero") {
          for (const slide of section.slides) {
            assetIds.add(slide.desktopAssetId);
            if (slide.mobileAssetId) assetIds.add(slide.mobileAssetId);
            if (slide.productId) hotspotIds.add(slide.productId);
          }
        } else if (section.kind === "split_campaign") {
          for (const panel of section.panels) assetIds.add(panel.assetId);
        } else if (section.kind === "brand_story" && section.assetId) assetIds.add(section.assetId);
      }

      const productSources: Awaited<ReturnType<typeof sourceResult>>[] = [];
      let sharedProducts: readonly PublicProduct[] | undefined;
      if (sourceLimits.has("sale")) {
        const limit = sourceLimits.get("sale")!;
        try {
          const result = await dependencies.publicStorefront.listPublicProducts({ storefront, now, limit: 48 });
          sharedProducts = result.items;
          const items = result.items.filter((product) => typeof product.compareAtCents === "number" && product.compareAtCents > product.priceCents).slice(0, limit);
          productSources.push(sourceResult("sale", items.some(({ available }) => available) ? "ready" : "empty", items));
        } catch { productSources.push(sourceResult("sale", "unavailable")); }
      }
      if (sourceLimits.has("latest")) {
        const limit = sourceLimits.get("latest")!;
        try {
          const items = sharedProducts ? sharedProducts.slice(0, limit) : (await dependencies.publicStorefront.listPublicProducts({ storefront, now, limit })).items;
          productSources.push(sourceResult("latest", items.some(({ available }) => available) ? "ready" : "empty", items));
        } catch { productSources.push(sourceResult("latest", "unavailable")); }
      }
      for (const [key, limit] of [...sourceLimits].filter(([key]) => key.startsWith("category:")).sort(([left], [right]) => left.localeCompare(right))) {
        const categoryId = key.slice("category:".length);
        const slug = collectionSlug(workspace, categoryId);
        if (!slug) { productSources.push(sourceResult(key, "missing")); continue; }
        try {
          const result = await dependencies.publicStorefront.listPublicProductsByCategory({ storefront, now, slug, limit });
          if (result.category.id !== categoryId || result.category.slug !== slug) { productSources.push(sourceResult(key, "missing")); continue; }
          const items = result.items;
          productSources.push(sourceResult(key, items.some(({ available }) => available) ? "ready" : "empty", items, slug));
        } catch { productSources.push(sourceResult(key, "unavailable", [], slug)); }
      }

      const assets = new Map<string, StorefrontDesignPreviewResources["assets"][number]>();
      if (assetIds.size) {
        try {
          const listed = await dependencies.assets.listAssets({ tenantContext, now, includeArchived: false });
          const selected = new Map(listed.filter((asset) => asset.status === "active" && asset.storeId === tenantContext.store.id && assetIds.has(asset.id)).map((asset) => [asset.id, asset]));
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

      const categoryShowcase = storefront.presentation.schemaVersion === 3 && storefront.presentation.categoryShowcase
        ? Object.freeze({ status: "ready" as const, value: storefront.presentation.categoryShowcase })
        : Object.freeze({ status: "missing" as const });
      return Object.freeze({
        schemaVersion: 1,
        dependencyKey: storefrontDesignPreviewDependencyKey(composition),
        productSources: Object.freeze(productSources.sort((left, right) => left.key.localeCompare(right.key))),
        assets: Object.freeze([...assets.values()]),
        hotspots: Object.freeze(hotspots),
        categoryShowcase,
      });
    },
  });
}

export type ServerStorefrontDesignPreviewLoader = ReturnType<typeof createServerStorefrontDesignPreviewLoader>;
