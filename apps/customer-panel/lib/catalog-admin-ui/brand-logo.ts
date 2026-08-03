import { parseStorefrontAsset, type CatalogAdminJson, type StorefrontAsset } from "@celebix/saas-contracts";

import { CatalogAdminApiError } from "./client.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export type BrandLogoSelection = Readonly<{
  assets: readonly StorefrontAsset[];
  selectedId?: string;
}>;

export function selectBrandLogoId(value: unknown): string | undefined {
  return typeof value === "string" && UUID.test(value) ? value : undefined;
}

function unavailable(status = 503): never {
  throw new CatalogAdminApiError("unavailable", status);
}

function plainRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string" || !descriptors[key as string]?.enumerable || !("value" in descriptors[key as string]!))) return null;
  return Object.fromEntries((keys as string[]).map((key) => [key, descriptors[key]!.value]));
}

export function selectBrandLogoAssets(value: unknown, selectedId?: unknown): BrandLogoSelection {
  const envelope = plainRecord(value);
  if (!envelope || Object.keys(envelope).sort().join(",") !== "assets,code" || envelope.code !== "ok" || !Array.isArray(envelope.assets) || envelope.assets.length > 64) unavailable();
  let parsed: readonly StorefrontAsset[];
  try { parsed = Object.freeze(envelope.assets.map(parseStorefrontAsset)); }
  catch { return unavailable(); }
  const assets = Object.freeze(parsed.filter((asset) => asset.kind === "logo" && asset.status === "active"));
  const candidate = selectBrandLogoId(selectedId);
  const retained = candidate && assets.some(({ id }) => id === candidate) ? candidate : undefined;
  return Object.freeze({ assets, ...(retained ? { selectedId: retained } : {}) });
}

export function withBrandLogoConfig(config: Readonly<Record<string, CatalogAdminJson>>, logoAssetId?: string): Readonly<Record<string, CatalogAdminJson>> {
  if (logoAssetId !== undefined && !UUID.test(logoAssetId)) throw new TypeError("catalog_admin_brand_logo_invalid");
  const next: Record<string, CatalogAdminJson> = { ...config };
  delete next.logoAssetId;
  if (logoAssetId) next.logoAssetId = logoAssetId;
  return Object.freeze(next);
}

export async function uploadBrandLogo(file: File, altText: string, operationId: string): Promise<StorefrontAsset> {
  if (!(file instanceof File) || !MEDIA_TYPES.has(file.type) || file.size < 1 || !UUID.test(operationId) || typeof altText !== "string" || altText.length < 1 || altText.length > 500 || altText !== altText.trim() || CONTROL.test(altText)) throw new TypeError("catalog_admin_brand_logo_invalid");
  const body = new FormData();
  body.set("kind", "logo");
  body.set("altText", altText);
  body.set("file", file);
  let response: Response;
  try {
    response = await fetch("/api/storefront-assets", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "idempotency-key": operationId },
      body,
    });
  } catch { return unavailable(); }
  if (!response.ok || response.headers.get("content-type")?.split(";", 1)[0] !== "application/json") unavailable(response.status || 503);
  let value: unknown;
  try { value = await response.json(); } catch { return unavailable(); }
  const envelope = plainRecord(value);
  if (!envelope || Object.keys(envelope).sort().join(",") !== "asset,code,replayed" || envelope.code !== "created" || typeof envelope.replayed !== "boolean") unavailable();
  try {
    const asset = parseStorefrontAsset(envelope.asset);
    if (asset.kind !== "logo" || asset.status !== "active" || asset.id !== operationId) unavailable();
    return asset;
  } catch (error) {
    if (error instanceof CatalogAdminApiError) throw error;
    return unavailable();
  }
}
