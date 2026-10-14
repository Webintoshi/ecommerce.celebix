import { parseGoogleMerchantAttributes, parseGoogleMerchantOverview, parseGoogleMerchantProducts, parseGoogleMerchantSyncResult, type GoogleMerchantAttributes } from "@celebix/saas-contracts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_CODES = new Set(["invalid_input", "membership_denied", "durable_authority_invalid", "store_inactive", "not_found", "connection_required", "needs_reconnect", "version_conflict", "operation_mismatch", "operation_busy", "provider_limit", "unavailable", "commit_unknown"]);
export type GoogleMerchantPreferences = Readonly<{ productId: string; enabled: boolean; attributes: GoogleMerchantAttributes }>;
export class GoogleMerchantApiError extends Error {
  readonly code: string;
  constructor(code: string) { super(SAFE_CODES.has(code) ? code : "unavailable"); this.name = "GoogleMerchantApiError"; this.code = this.message; }
}

async function read(response: Response): Promise<unknown> {
  if (!response.body) throw new GoogleMerchantApiError("unavailable");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let result = "", size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 262144) { await reader.cancel(); throw new GoogleMerchantApiError("unavailable"); }
      result += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(result + decoder.decode());
  } finally { reader.releaseLock(); }
}

export function createGoogleMerchantClient(fetcher: typeof fetch = fetch) {
  async function request(path: string, init: RequestInit = {}): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetcher(`/api/marketplaces/google-merchant${path}`, { ...init, credentials: "same-origin", cache: "no-store", signal: controller.signal });
      const payload = await read(response);
      if (!response.ok) {
        const code = payload && typeof payload === "object" && "code" in payload && typeof payload.code === "string" ? payload.code : "unavailable";
        throw new GoogleMerchantApiError(code);
      }
      return payload;
    } catch (error) { if (error instanceof GoogleMerchantApiError) throw error; throw new GoogleMerchantApiError("unavailable"); }
    finally { clearTimeout(timer); }
  }
  async function write(path: string, input: unknown, operationId: string) {
    if (!UUID.test(operationId)) throw new GoogleMerchantApiError("invalid_input");
    return request(path, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": operationId }, body: JSON.stringify(input) });
  }
  async function parsed<T>(action: () => Promise<unknown>, parser: (value: unknown) => T): Promise<T> {
    try { return parser(await action()); } catch (error) { if (error instanceof GoogleMerchantApiError) throw error; throw new GoogleMerchantApiError("unavailable"); }
  }
  return Object.freeze({
    overview: () => parsed(() => request(""), parseGoogleMerchantOverview),
    products(cursor?: string) {
      if (cursor && !UUID.test(cursor)) return Promise.reject(new GoogleMerchantApiError("invalid_input"));
      const params = new URLSearchParams({ limit: "20" });
      if (cursor) params.set("cursor", cursor);
      return parsed(() => request(`/products?${params}`), parseGoogleMerchantProducts);
    },
    sync: (operationId: string) => parsed(() => write("/sync", {}, operationId), parseGoogleMerchantSyncResult),
    async preferences(variantId: string, input: GoogleMerchantPreferences, operationId: string): Promise<{ saved: true; replayed: boolean }> {
      if (!UUID.test(variantId) || !UUID.test(input.productId) || typeof input.enabled !== "boolean") throw new GoogleMerchantApiError("invalid_input");
      let attributes: GoogleMerchantAttributes;
      try { attributes = parseGoogleMerchantAttributes(input.attributes); } catch { throw new GoogleMerchantApiError("invalid_input"); }
      return parsed(() => write(`/products/${variantId}/preferences`, { productId: input.productId, enabled: input.enabled, attributes }, operationId), value => {
        if (!value || typeof value !== "object" || !("saved" in value) || value.saved !== true || !("replayed" in value) || typeof value.replayed !== "boolean" || Object.keys(value).some(key => !["saved", "replayed"].includes(key))) throw new GoogleMerchantApiError("unavailable");
        return { saved: true, replayed: value.replayed };
      });
    },
  });
}
export type GoogleMerchantClient = ReturnType<typeof createGoogleMerchantClient>;
export const googleMerchantClient = createGoogleMerchantClient();
