import type { PublicProduct } from "@celebix/saas-contracts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))+$/;
const MAXIMUM_FAVORITES = 100;
const MAXIMUM_BODY_BYTES = 8_192;

function uniqueProductIds(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > MAXIMUM_FAVORITES) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<PropertyKey, PropertyDescriptor>;
  if (Reflect.ownKeys(descriptors).length !== value.length + 1) return null;
  const ids: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable || typeof descriptor.value !== "string" || !UUID.test(descriptor.value)) return null;
    if (!seen.has(descriptor.value)) {
      seen.add(descriptor.value);
      ids.push(descriptor.value);
    }
  }
  return Object.freeze(ids);
}

function invalidRequest(): never {
  throw new TypeError("storefront_favorites_request_invalid");
}

function publicOrigin(value: string): string {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash || parsed.port || parsed.origin !== value) invalidRequest();
    return parsed.origin;
  } catch {
    return invalidRequest();
  }
}

export function favoritesStorageKey(hostname: string): string {
  if (typeof hostname !== "string" || !HOSTNAME.test(hostname)) throw new TypeError("storefront_favorites_invalid_hostname");
  return `celebix:storefront:favorites:v1:${hostname}`;
}

export function parseFavoriteProductIds(raw: string | null): readonly string[] {
  if (raw === null || typeof raw !== "string" || raw.length > MAXIMUM_BODY_BYTES) return Object.freeze([]);
  try { return uniqueProductIds(JSON.parse(raw)) ?? Object.freeze([]); } catch { return Object.freeze([]); }
}

export function reconcileFavoriteProductIds(stored: readonly string[], products: readonly PublicProduct[]): readonly string[] {
  const allowed = new Set(products.map(({ id }) => id));
  return Object.freeze(stored.filter((id, index) => index < MAXIMUM_FAVORITES && UUID.test(id) && allowed.has(id)));
}

export function toggleFavoriteProductId(current: readonly string[], productId: string): readonly string[] {
  if (!UUID.test(productId)) return Object.freeze([...current]);
  if (current.includes(productId)) return Object.freeze(current.filter((id) => id !== productId));
  return current.length >= MAXIMUM_FAVORITES ? Object.freeze([...current]) : Object.freeze([...current, productId]);
}

export async function readFavoriteResolutionRequest(request: Request, configuredPublicOrigin: string): Promise<readonly string[]> {
  const origin = publicOrigin(configuredPublicOrigin);
  let url: URL;
  try { url = new URL(request.url); } catch { return invalidRequest(); }
  if (request.method !== "POST" || (url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password || url.pathname !== "/api/favorites/resolve" || url.search || url.hash) invalidRequest();
  if (request.headers.get("origin") !== origin || request.headers.has("authorization") || request.headers.has("transfer-encoding") || request.headers.has("x-celebix-request-signature") || request.headers.has("x-celebix-key-id")) invalidRequest();
  if (request.headers.get("content-type")?.trim().toLowerCase() !== "application/json") invalidRequest();
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^(?:0|[1-9]\d*)$/.test(declared) || Number(declared) > MAXIMUM_BODY_BYTES)) invalidRequest();
  if (request.body === null) invalidRequest();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > MAXIMUM_BODY_BYTES) { await reader.cancel().catch(() => undefined); invalidRequest(); }
      chunks.push(new Uint8Array(next.value));
    }
    const body = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    let parsed: unknown;
    try { parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)); } finally { body.fill(0); }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed) || Object.getPrototypeOf(parsed) !== Object.prototype) invalidRequest();
    const descriptors = Object.getOwnPropertyDescriptors(parsed) as unknown as Record<PropertyKey, PropertyDescriptor>;
    if (Reflect.ownKeys(descriptors).length !== 1 || !descriptors.productIds || !("value" in descriptors.productIds) || !descriptors.productIds.enumerable) invalidRequest();
    return uniqueProductIds(descriptors.productIds.value) ?? invalidRequest();
  } catch (error) {
    if (error instanceof TypeError && error.message === "storefront_favorites_request_invalid") throw error;
    return invalidRequest();
  } finally {
    for (const chunk of chunks) chunk.fill(0);
  }
}
