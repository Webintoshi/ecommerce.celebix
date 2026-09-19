import type { VariantPricingPolicy } from "@celebix/saas-contracts";
import type {
  ActivatedReferenceSet, ReferenceDefinitionList, ReferenceImpactPreview, ReferenceSetDetail,
  ReferenceSetList, ReferenceSetValue, VariantPolicyPreview, VariantPolicyProjection,
} from "@celebix/saas-data";

import {
  activatedOutput, decimal, definitionsOutput, digest, exact, id, integer, label,
  listOutput, policy, policyOutput, policyPreviewOutput, previewOutput, referenceIdentity, setOutput, setValues,
} from "../reference-pricing-http/validation.ts";

type ServerCode = "invalid_input" | "conflict" | "forbidden" | "not_found" | "unauthenticated" | "method_not_allowed" | "unavailable";
export type ReferencePricingApiErrorCode = ServerCode | "verification_unavailable";
export type ReferencePricingErrorState = "error" | "denied" | "conflict" | "not_found" | "unavailable" | "verification_unavailable";
type Fetcher = typeof fetch;

const BASE = "/api/reference-pricing";
const MAX_RESPONSE_BYTES = 1_048_576;
const CODE_STATUS: Readonly<Record<ServerCode, number>> = Object.freeze({
  invalid_input: 400, conflict: 409, forbidden: 403, not_found: 404,
  unauthenticated: 401, method_not_allowed: 405, unavailable: 503,
});

export class ReferencePricingApiError extends Error {
  readonly code: ReferencePricingApiErrorCode;
  readonly status: number;
  constructor(code: ReferencePricingApiErrorCode, status: number) {
    super(code);
    this.name = "ReferencePricingApiError";
    this.code = code;
    this.status = status;
    Object.freeze(this);
  }
}

function invalid(): never { throw new TypeError("reference_pricing_client_invalid"); }
function safeInput<T>(parse: () => T): T { try { return parse(); } catch { return invalid(); } }

async function readJson(response: Response): Promise<unknown> {
  if (response.headers.get("content-type")?.split(";", 1)[0]?.trim() !== "application/json") throw new ReferencePricingApiError("unavailable", 503);
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^(?:0|[1-9][0-9]*)$/.test(declared) || Number(declared) > MAX_RESPONSE_BYTES)) throw new ReferencePricingApiError("unavailable", 503);
  const reader = response.body?.getReader();
  if (!reader) throw new ReferencePricingApiError("unavailable", 503);
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > MAX_RESPONSE_BYTES) { await reader.cancel().catch(() => undefined); throw new ReferencePricingApiError("unavailable", 503); }
      chunks.push(new Uint8Array(next.value));
    }
  } catch (caught) {
    if (caught instanceof DOMException && caught.name === "AbortError") throw caught;
    throw new ReferencePricingApiError("unavailable", 503);
  }
  if (!total || (declared !== null && Number(declared) !== total)) throw new ReferencePricingApiError("unavailable", 503);
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new ReferencePricingApiError("unavailable", 503); }
}

function responseError(value: unknown, status: number): ReferencePricingApiError {
  try {
    const raw = exact(value, ["code"]);
    if (typeof raw.code !== "string" || !Object.hasOwn(CODE_STATUS, raw.code)) throw new TypeError();
    const code = raw.code as ServerCode;
    return CODE_STATUS[code] === status
      ? new ReferencePricingApiError(code, status)
      : new ReferencePricingApiError("unavailable", 503);
  } catch { return new ReferencePricingApiError("unavailable", 503); }
}

export function referencePricingErrorState(value: unknown): ReferencePricingErrorState {
  if (!(value instanceof ReferencePricingApiError)) return "error";
  if (value.code === "forbidden" || value.code === "unauthenticated") return "denied";
  if (value.code === "conflict") return "conflict";
  if (value.code === "not_found") return "not_found";
  if (value.code === "verification_unavailable") return "verification_unavailable";
  if (value.code === "unavailable") return "unavailable";
  return "error";
}

export function createReferencePricingApi(fetcher: Fetcher = fetch, uuid: () => string = () => crypto.randomUUID()) {
  if (typeof fetcher !== "function" || typeof uuid !== "function") invalid();
  const operationId = () => id(uuid());

  async function request<T>(path: string, parser: (value: unknown) => T, body?: unknown, signal?: AbortSignal, isMutation = false): Promise<T> {
    const isPost = body !== undefined;
    let reachedNetwork = false;
    try {
      reachedNetwork = true;
      const response = await fetcher(path, {
        credentials: "same-origin", cache: "no-store", ...(signal ? { signal } : {}),
        ...(isPost ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}),
      });
      const value = await readJson(response);
      if (!response.ok) {
        const failure = responseError(value, response.status);
        throw isMutation && failure.code === "unavailable"
          ? new ReferencePricingApiError("verification_unavailable", 503) : failure;
      }
      try { return parser(value); }
      catch { throw new ReferencePricingApiError(isMutation ? "verification_unavailable" : "unavailable", 503); }
    } catch (caught) {
      if (caught instanceof ReferencePricingApiError) {
        if (isMutation && caught.code === "unavailable") throw new ReferencePricingApiError("verification_unavailable", 503);
        throw caught;
      }
      if (caught instanceof DOMException && caught.name === "AbortError" && !isMutation) throw caught;
      throw new ReferencePricingApiError(isMutation && reachedNetwork ? "verification_unavailable" : "unavailable", 503);
    }
  }

  return Object.freeze({
    listDefinitions(signal?: AbortSignal): Promise<ReferenceDefinitionList> {
      return request(`${BASE}/definitions`, definitionsOutput, undefined, signal);
    },
    async listSets(selection: Readonly<{ pageSize: number; afterSetVersion?: number }> = { pageSize: 20 }, signal?: AbortSignal): Promise<ReferenceSetList> {
      const { pageSize, cursor } = safeInput(() => {
        const raw = exact(selection, ["pageSize"], ["afterSetVersion"]);
        return { pageSize: integer(raw.pageSize, 1, 100), cursor: Object.hasOwn(raw, "afterSetVersion") ? integer(raw.afterSetVersion, 1) : undefined };
      });
      const params = new URLSearchParams({ pageSize: String(pageSize) });
      if (cursor !== undefined) params.set("afterSetVersion", String(cursor));
      return request(`${BASE}/sets?${params}`, (value) => {
        const selected = listOutput(value);
        if (selected.items.length > pageSize) invalid();
        return selected;
      }, undefined, signal);
    },
    async getSet(setId?: string, signal?: AbortSignal): Promise<ReferenceSetDetail> {
      const selected = safeInput(() => setId === undefined ? undefined : id(setId));
      return request(`${BASE}/sets/${selected ?? "current"}`, (value) => {
        const result = setOutput(value);
        if (selected !== undefined && result.setId !== selected) invalid();
        return result;
      }, undefined, signal);
    },
    async getPolicy(variantId: string, signal?: AbortSignal): Promise<VariantPolicyProjection> {
      const selected = safeInput(() => id(variantId));
      return request(`${BASE}/policies/${selected}`, (value) => {
        const result = policyOutput(value);
        if (result.variantId !== selected) invalid();
        return result;
      }, undefined, signal);
    },
    async previewPolicy(selection: Readonly<{ variantId: string; policy: VariantPricingPolicy; channel: "storefront" }>, signal?: AbortSignal): Promise<VariantPolicyPreview> {
      const safe = safeInput(() => {
        const raw = exact(selection, ["variantId", "policy", "channel"]);
        if (raw.channel !== "storefront") invalid();
        return Object.freeze({ variantId: id(raw.variantId), policy: policy(raw.policy), channel: raw.channel });
      });
      return request(`${BASE}/policies/${safe.variantId}/preview`, (value) => {
        const result = policyPreviewOutput(value);
        if (result.variantId !== safe.variantId || result.method !== safe.policy.method
          || (safe.policy.method !== "fixed_try" && result.referenceId !== safe.policy.referenceId)) invalid();
        return result;
      }, { policy: safe.policy, channel: safe.channel }, signal);
    },
    async preview(selection: Readonly<{ setId: string; channel: "storefront" | "quick_order"; pageSize: number; afterVariantId?: string }>, signal?: AbortSignal): Promise<ReferenceImpactPreview> {
      const safe = safeInput(() => {
        const raw = exact(selection, ["setId", "channel", "pageSize"], ["afterVariantId"]);
        if (raw.channel !== "storefront" && raw.channel !== "quick_order") invalid();
        return Object.freeze({ setId: id(raw.setId), channel: raw.channel, pageSize: integer(raw.pageSize, 1, 100),
          ...(Object.hasOwn(raw, "afterVariantId") ? { afterVariantId: id(raw.afterVariantId) } : {}),
        });
      });
      return request(`${BASE}/preview`, (value) => {
        const result = previewOutput(value);
        if (result.setId !== safe.setId || result.entries.length > safe.pageSize) invalid();
        return result;
      }, safe, signal);
    },
    async define(intent: Readonly<{ referenceId: string; kind: "usd" | "eur" | "gold_gram"; label: string; referencePurity?: string }>): Promise<ReturnType<typeof referenceIdentity>> {
      const safe = safeInput(() => {
        const raw = exact(intent, ["referenceId", "kind", "label"], ["referencePurity"]);
        if (raw.kind !== "usd" && raw.kind !== "eur" && raw.kind !== "gold_gram") invalid();
        if (raw.kind !== "gold_gram" && Object.hasOwn(raw, "referencePurity")) invalid();
        return Object.freeze({ operationId: operationId(), referenceId: id(raw.referenceId), kind: raw.kind, label: label(raw.label),
          ...(Object.hasOwn(raw, "referencePurity") ? { referencePurity: decimal(raw.referencePurity, 8, true, true) } : {}),
        });
      });
      return request(`${BASE}/definitions`, (value) => {
        const result = referenceIdentity(value);
        if (result.id !== safe.referenceId) invalid();
        return result;
      }, safe, undefined, true);
    },
    async saveSet(intent: Readonly<{ setId: string; expectedStateVersion: number; values: readonly ReferenceSetValue[] }>): Promise<ReferenceSetDetail> {
      const safe = safeInput(() => {
        const raw = exact(intent, ["setId", "expectedStateVersion", "values"]);
        return Object.freeze({ operationId: operationId(), setId: id(raw.setId), expectedStateVersion: integer(raw.expectedStateVersion, 0), values: setValues(raw.values) });
      });
      return request(`${BASE}/sets`, (value) => {
        const result = setOutput(value);
        if (result.setId !== safe.setId || result.isActive) invalid();
        return result;
      }, safe, undefined, true);
    },
    async activate(intent: Readonly<{ setId: string; expectedStateVersion: number; expectedScopeDigest: string }>): Promise<ActivatedReferenceSet> {
      const safe = safeInput(() => {
        const raw = exact(intent, ["setId", "expectedStateVersion", "expectedScopeDigest"]);
        return Object.freeze({ setId: id(raw.setId), operationId: operationId(), expectedStateVersion: integer(raw.expectedStateVersion, 0), expectedScopeDigest: digest(raw.expectedScopeDigest) });
      });
      return request(`${BASE}/sets/${safe.setId}/activate`, (value) => {
        const result = activatedOutput(value);
        if (result.setId !== safe.setId) invalid();
        return result;
      }, { operationId: safe.operationId, expectedStateVersion: safe.expectedStateVersion, expectedScopeDigest: safe.expectedScopeDigest }, undefined, true);
    },
    async savePolicy(intent: Readonly<{ variantId: string; expectedVariantVersion: number; expectedPolicyVersion: number; expectedScopeDigest: string; policy: VariantPricingPolicy }>): Promise<VariantPolicyProjection> {
      const safe = safeInput(() => {
        const raw = exact(intent, ["variantId", "expectedVariantVersion", "expectedPolicyVersion", "expectedScopeDigest", "policy"]);
        return Object.freeze({ variantId: id(raw.variantId), operationId: operationId(), expectedVariantVersion: integer(raw.expectedVariantVersion, 1),
          expectedPolicyVersion: integer(raw.expectedPolicyVersion, 0), expectedScopeDigest: digest(raw.expectedScopeDigest), policy: policy(raw.policy),
        });
      });
      return request(`${BASE}/policies/${safe.variantId}`, (value) => {
        const result = policyOutput(value);
        if (result.variantId !== safe.variantId) invalid();
        return result;
      }, { operationId: safe.operationId, expectedVariantVersion: safe.expectedVariantVersion, expectedPolicyVersion: safe.expectedPolicyVersion, expectedScopeDigest: safe.expectedScopeDigest, policy: safe.policy }, undefined, true);
    },
  });
}

export type ReferencePricingApi = ReturnType<typeof createReferencePricingApi>;
export const referencePricingApi = createReferencePricingApi();
