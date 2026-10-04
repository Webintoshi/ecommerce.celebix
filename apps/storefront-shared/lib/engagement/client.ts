"use client";

import { parseStoreEngagementCaptureRequest, parseStoreEngagementPublicSettings, normalizePromotionCode, type StoreEngagementCaptureRequest } from "@celebix/saas-contracts";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
const PUBLIC_FAILURES = ["invalid_input", "cart_unavailable", "campaign_unavailable", "promotion_unavailable", "invalid_reference", "contact_conflict", "rate_limited"] as const;
type PublicFailure = (typeof PUBLIC_FAILURES)[number];
export class StoreEngagementClientError extends Error {
  constructor(readonly code: PublicFailure | "request_failed" | "invalid_response") { super(code); this.name = "StoreEngagementClientError"; }
}
async function json(response: Response): Promise<unknown> {
  if (response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json" || !response.body) throw new StoreEngagementClientError("invalid_response");
  const reader = response.body.getReader(); let size = 0, value = "";
  const decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 262_144) { await reader.cancel(); throw new StoreEngagementClientError("invalid_response"); } value += decoder.decode(part.value, { stream: true }); }
    return JSON.parse(value + decoder.decode());
  } catch { throw new StoreEngagementClientError("invalid_response"); }
}
export function prepareEngagementContact(value: unknown): StoreEngagementCaptureRequest {
  try { return parseStoreEngagementCaptureRequest(value); } catch { throw new StoreEngagementClientError("invalid_input"); }
}
export function createStoreEngagementClient(fetcher: Fetcher = fetch) {
  async function request(path: string, body?: StoreEngagementCaptureRequest, signal?: AbortSignal) {
    try {
      const response = await fetcher(path, { method: body ? "POST" : "GET", credentials: "same-origin", cache: "no-store", signal, ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}) });
      if (!response.ok) {
        const failure = await json(response).catch(() => null) as { code?: unknown } | null;
        const code = PUBLIC_FAILURES.find(candidate => failure?.code === candidate);
        throw new StoreEngagementClientError(code ?? "request_failed");
      }
      return await json(response);
    } catch (error) { if (error instanceof StoreEngagementClientError) throw error; throw new StoreEngagementClientError("request_failed"); }
  }
  return Object.freeze({
    async settings(signal?: AbortSignal) {
      try { return parseStoreEngagementPublicSettings(await request("/api/store-engagement", undefined, signal)); }
      catch (error) { if (error instanceof StoreEngagementClientError) throw error; throw new StoreEngagementClientError("invalid_response"); }
    },
    async accountSession(signal?: AbortSignal): Promise<"anonymous" | "authenticated" | "unknown"> {
      try { const value = await request("/api/account/session", undefined, signal) as { outcome?: unknown }; return value?.outcome === "unauthenticated" ? "anonymous" : value?.outcome === "found" || value?.outcome === "profile_required" ? "authenticated" : "unknown"; } catch { return "unknown"; }
    },
    async captureContact(input: StoreEngagementCaptureRequest) {
      const value = await request("/api/cart/contact", prepareEngagementContact(input));
      if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== 2 || !Object.hasOwn(value, "contactCaptured") || !Object.hasOwn(value, "couponCode")) throw new StoreEngagementClientError("invalid_response");
      const result = value as { contactCaptured: unknown; couponCode: unknown };
      try { if (result.contactCaptured !== true || (result.couponCode !== null && (typeof result.couponCode !== "string" || normalizePromotionCode(result.couponCode) !== result.couponCode))) throw Error(); }
      catch { throw new StoreEngagementClientError("invalid_response"); }
      return Object.freeze({ contactCaptured: true as const, couponCode: result.couponCode as string | null });
    },
  });
}
