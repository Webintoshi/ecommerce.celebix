import { normalizeStarterThemeCompositionV3, parsePublicProduct, type PublicStorefrontAsset, type StarterThemeComposition } from "@celebix/saas-contracts";

import { storefrontDesignPreviewDependencyKey, type StorefrontDesignPreviewResourceStatus, type StorefrontDesignPreviewResources } from "../storefront-design-preview-model.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ASSET_PATH = /^\/stores\/[0-9a-f-]{36}\/storefront\/(?:logo|hero|social|favicon|category)\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/;
const MAX_RESPONSE_BYTES = 1_048_576;
const STATUSES = Object.freeze(["ready", "partial", "empty", "missing", "unavailable"] as const);

export class StorefrontDesignPreviewApiError extends Error {
  constructor() { super("Önizleme kaynakları şu anda alınamadı."); this.name = "StorefrontDesignPreviewApiError"; }
}

function record(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new StorefrontDesignPreviewApiError();
  const keys = Object.keys(value); if (required.some((key) => !Object.hasOwn(value, key)) || keys.some((key) => !required.includes(key) && !optional.includes(key))) throw new StorefrontDesignPreviewApiError();
  return value as Record<string, unknown>;
}
function status(value: unknown): StorefrontDesignPreviewResourceStatus { if (!STATUSES.includes(value as never)) throw new StorefrontDesignPreviewApiError(); return value as StorefrontDesignPreviewResourceStatus; }
function text(value: unknown, max: number): string { if (typeof value !== "string" || value.length < 1 || value.length > max || value !== value.trim() || /[\u0000-\u001f\u007f]/.test(value)) throw new StorefrontDesignPreviewApiError(); return value; }
function integer(value: unknown, max: number): number { if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > max) throw new StorefrontDesignPreviewApiError(); return value as number; }
function asset(value: unknown): PublicStorefrontAsset {
  const parsed = record(value, ["url", "mediaType", "altText", "width", "height"]); const mediaType = parsed.mediaType;
  if (!UUID.test(String(parsed.url).split("/").at(-1)?.split(".")[0] ?? "") || !["image/jpeg", "image/png", "image/webp"].includes(mediaType as string)) throw new StorefrontDesignPreviewApiError();
  let url: URL; try { url = new URL(text(parsed.url, 2048)); } catch { throw new StorefrontDesignPreviewApiError(); }
  const extension = mediaType === "image/jpeg" ? ".jpg" : mediaType === "image/png" ? ".png" : ".webp";
  if (url.protocol !== "https:" || !["media.celebix.site", "media.saas-staging.celebix.site"].includes(url.hostname) || url.username || url.password || url.port || url.search || url.hash || !ASSET_PATH.test(url.pathname) || !url.pathname.endsWith(extension)) throw new StorefrontDesignPreviewApiError();
  return Object.freeze({ url: url.toString(), mediaType: mediaType as PublicStorefrontAsset["mediaType"], altText: text(parsed.altText, 500), width: integer(parsed.width, 8192), height: integer(parsed.height, 8192) });
}
function list(value: unknown, max: number): unknown[] { if (!Array.isArray(value) || value.length > max) throw new StorefrontDesignPreviewApiError(); return value; }

export function parseStorefrontDesignPreviewResources(value: unknown, expectedKey: string): StorefrontDesignPreviewResources {
  const root = record(value, ["schemaVersion", "dependencyKey", "productSources", "assets", "hotspots", "categoryShowcase"]);
  if (root.schemaVersion !== 1 || root.dependencyKey !== expectedKey) throw new StorefrontDesignPreviewApiError();
  const sourceKeys = new Set<string>();
  const productSources = list(root.productSources, 12).map((entry) => { const parsed = record(entry, ["key", "status", "items"], ["categorySlug"]); const key = text(parsed.key, 96); if (sourceKeys.has(key) || (key !== "latest" && key !== "sale" && !/^category:[0-9a-f-]{36}$/.test(key))) throw new StorefrontDesignPreviewApiError(); sourceKeys.add(key); const categorySlug = parsed.categorySlug === undefined ? undefined : text(parsed.categorySlug, 100); if (categorySlug && !SLUG.test(categorySlug)) throw new StorefrontDesignPreviewApiError(); return Object.freeze({ key, status: status(parsed.status), items: Object.freeze(list(parsed.items, 48).map(parsePublicProduct)), ...(categorySlug ? { categorySlug } : {}) }); });
  const assetIds = new Set<string>();
  const assets = list(root.assets, 24).map((entry) => { const parsed = record(entry, ["id", "status"], ["image"]); const id = text(parsed.id, 36); if (!UUID.test(id) || assetIds.has(id)) throw new StorefrontDesignPreviewApiError(); assetIds.add(id); const selectedStatus = status(parsed.status); const image = parsed.image === undefined ? undefined : asset(parsed.image); if ((selectedStatus === "ready") !== Boolean(image)) throw new StorefrontDesignPreviewApiError(); return Object.freeze({ id, status: selectedStatus, ...(image ? { image } : {}) }); });
  const hotspotIds = new Set<string>();
  const hotspots = list(root.hotspots, 12).map((entry) => { const parsed = record(entry, ["productId", "status"], ["value"]); const productId = text(parsed.productId, 36); if (!UUID.test(productId) || hotspotIds.has(productId)) throw new StorefrontDesignPreviewApiError(); hotspotIds.add(productId); const selectedStatus = status(parsed.status); let selected; if (parsed.value !== undefined) { const value = record(parsed.value, ["productSlug", "title", "priceCents", "currency"]); if (value.currency !== "TRY" || !SLUG.test(text(value.productSlug, 100))) throw new StorefrontDesignPreviewApiError(); selected = Object.freeze({ productSlug: value.productSlug as string, title: text(value.title, 160), priceCents: integer(value.priceCents, Number.MAX_SAFE_INTEGER), currency: "TRY" as const }); } if ((selectedStatus === "ready") !== Boolean(selected)) throw new StorefrontDesignPreviewApiError(); return Object.freeze({ productId, status: selectedStatus, ...(selected ? { value: selected } : {}) }); });
  const category = record(root.categoryShowcase, ["status"], ["value"]); const categoryStatus = status(category.status); let categoryValue;
  if (category.value !== undefined) { const selected = record(category.value, ["heading", "layout", "items"]); if (!['duo','grid'].includes(selected.layout as string)) throw new StorefrontDesignPreviewApiError(); categoryValue = Object.freeze({ heading: text(selected.heading, 160), layout: selected.layout as "duo" | "grid", items: Object.freeze(list(selected.items, 8).map((entry) => { const item = record(entry, ["id", "name", "slug", "image"]); const id = text(item.id, 36), slug = text(item.slug, 100); if (!UUID.test(id) || !SLUG.test(slug)) throw new StorefrontDesignPreviewApiError(); return Object.freeze({ id, name: text(item.name, 160), slug, image: asset(item.image) }); })) }); }
  if ((categoryStatus === "ready") !== Boolean(categoryValue)) throw new StorefrontDesignPreviewApiError();
  return Object.freeze({ schemaVersion: 1, dependencyKey: expectedKey, productSources: Object.freeze(productSources), assets: Object.freeze(assets), hotspots: Object.freeze(hotspots), categoryShowcase: Object.freeze({ status: categoryStatus, ...(categoryValue ? { value: categoryValue } : {}) }) });
}

async function responseJson(response: Response): Promise<unknown> {
  if (!(response.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) throw new StorefrontDesignPreviewApiError();
  const length = response.headers.get("content-length"); if (length && (!/^\d+$/.test(length) || Number(length) > MAX_RESPONSE_BYTES)) throw new StorefrontDesignPreviewApiError();
  const bytes = new Uint8Array(await response.arrayBuffer()); if (bytes.byteLength > MAX_RESPONSE_BYTES) throw new StorefrontDesignPreviewApiError();
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { throw new StorefrontDesignPreviewApiError(); } finally { bytes.fill(0); }
}

export function createStorefrontDesignPreviewApi(fetcher: typeof fetch = fetch) {
  return Object.freeze({
    async preview(input: StarterThemeComposition, signal?: AbortSignal): Promise<StorefrontDesignPreviewResources> {
      const composition = normalizeStarterThemeCompositionV3(input); const dependencyKey = storefrontDesignPreviewDependencyKey(composition); let response: Response;
      try { response = await fetcher("/api/storefront-design/preview", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify({ composition }), signal }); }
      catch (error) { if (error instanceof DOMException && error.name === "AbortError") throw error; throw new StorefrontDesignPreviewApiError(); }
      const value = await responseJson(response); if (!response.ok) throw new StorefrontDesignPreviewApiError();
      const envelope = record(value, ["code", "resources"]); if (envelope.code !== "ok") throw new StorefrontDesignPreviewApiError();
      return parseStorefrontDesignPreviewResources(envelope.resources, dependencyKey);
    },
  });
}

export const storefrontDesignPreviewApi = createStorefrontDesignPreviewApi();
