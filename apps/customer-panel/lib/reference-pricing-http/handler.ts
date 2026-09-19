import { isMerchantActionAllowed, type TenantContext } from "@celebix/saas-contracts";
import { referencePricingRepositoryErrorCode, type ReferencePricingRepository } from "@celebix/saas-data";

import { approvedPanelMutationOriginForStore, hasApprovedPanelMutationOriginShape } from "../panel-origin-authority.ts";
import { readOrderPanelSessionCookie } from "../order-http/request-input.ts";
import type { ServerPanelAccessResult } from "../server-panel-access/access.ts";
import type { ServerReferencePricingRuntime } from "../server-reference-pricing/runtime.ts";
import {
  activatedOutput, decimal, definitionsOutput, digest, exact, id, integer,
  label, listOutput, policy, policyOutput, policyPreviewOutput, previewOutput, referenceIdentity, setOutput, setValues,
} from "./validation.ts";

const BASE = "/api/reference-pricing";
const MAX_BODY_BYTES = 65_536;
const PRIVATE_HEADERS = new Set([
  "authorization", "x-panel-session-credential", "x-store-id", "x-tenant-id",
  "x-principal-id", "x-membership-id", "x-plan-id", "x-database-role", "x-database-url",
]);
type Dependencies = Readonly<{
  resolveRuntime(): Promise<ServerReferencePricingRuntime | null>;
  now(): Date;
  requestId(): string;
}>;
type RouteKind = "definitions" | "list" | "get" | "getPolicy" | "preview" | "previewPolicy" | "define" | "saveSet" | "activate" | "savePolicy";
type Route = Readonly<{
  kind: RouteKind;
  method: "GET" | "POST";
  id?: string;
  pageSize?: number;
  afterSetVersion?: number;
}>;

function response(value: unknown, status = 200, extra?: HeadersInit): Response {
  const headers = new Headers(extra);
  headers.set("cache-control", "no-store");
  headers.set("x-content-type-options", "nosniff");
  return Response.json(value, { status, headers });
}
function error(code: string, status: number, extra?: HeadersInit): Response { return response({ code }, status, extra); }

function repositoryError(value: unknown): Response {
  const code = referencePricingRepositoryErrorCode(value);
  if (code === "invalid_input") return error("invalid_input", 400);
  if (code === "resource_not_found") return error("not_found", 404);
  if (code === "version_conflict" || code === "operation_mismatch" || code === "scope_conflict") return error("conflict", 409);
  if (code === "unauthenticated") return error("unauthenticated", 401);
  if (code === "membership_denied" || code === "store_inactive" || code === "feature_not_enabled" || code === "durable_authority_invalid") return error("forbidden", 403);
  return error("unavailable", 503);
}

function listQuery(searchParams: URLSearchParams): Pick<Route, "pageSize" | "afterSetVersion"> {
  const entries = [...searchParams.entries()];
  if (entries.length > 2 || entries.some(([key]) => key !== "pageSize" && key !== "afterSetVersion")
    || new Set(entries.map(([key]) => key)).size !== entries.length) throw new TypeError("invalid_query");
  const selectedPageSize = searchParams.get("pageSize");
  const selectedCursor = searchParams.get("afterSetVersion");
  if (selectedPageSize !== null && !/^(?:[1-9][0-9]?)$|^100$/.test(selectedPageSize)) throw new TypeError("invalid_query");
  if (selectedCursor !== null && !/^[1-9][0-9]*$/.test(selectedCursor)) throw new TypeError("invalid_query");
  return Object.freeze({
    pageSize: integer(selectedPageSize === null ? 20 : Number(selectedPageSize), 1, 100),
    ...(selectedCursor === null ? {} : { afterSetVersion: integer(Number(selectedCursor), 1) }),
  });
}

function classify(request: Request): Route | Response {
  try {
    for (const [name] of request.headers) {
      if (PRIVATE_HEADERS.has(name) || name.startsWith("x-celebix-")) return error("invalid_input", 400);
    }
    const url = new URL(request.url);
    if (url.hash !== "" || url.search.length > 2_048) return error("invalid_input", 400);
    const path = url.pathname;
    const definitions = path === `${BASE}/definitions`;
    const sets = path === `${BASE}/sets`;
    const current = path === `${BASE}/sets/current`;
    const preview = path === `${BASE}/preview`;
    const set = /^\/api\/reference-pricing\/sets\/([0-9a-f-]{36})$/.exec(path);
    const activation = /^\/api\/reference-pricing\/sets\/([0-9a-f-]{36})\/activate$/.exec(path);
    const policyRoute = /^\/api\/reference-pricing\/policies\/([0-9a-f-]{36})$/.exec(path);
    const policyPreviewRoute = /^\/api\/reference-pricing\/policies\/([0-9a-f-]{36})\/preview$/.exec(path);
    if (!definitions && !sets && !current && !preview && !set && !activation && !policyRoute && !policyPreviewRoute) return error("not_found", 404);
    if (set && !id(set[1])) return error("not_found", 404);
    if (activation && !id(activation[1])) return error("not_found", 404);
    if (policyRoute && !id(policyRoute[1])) return error("not_found", 404);
    if (policyPreviewRoute && !id(policyPreviewRoute[1])) return error("not_found", 404);
    if (!sets && url.search !== "") return error("invalid_input", 400);
    if (definitions && request.method === "GET") return { kind: "definitions", method: "GET" };
    if (definitions && request.method === "POST") return { kind: "define", method: "POST" };
    if (sets && request.method === "GET") return { kind: "list", method: "GET", ...listQuery(url.searchParams) };
    if (sets && request.method === "POST") {
      if (url.search !== "") return error("invalid_input", 400);
      return { kind: "saveSet", method: "POST" };
    }
    if (current && request.method === "GET") return { kind: "get", method: "GET" };
    if (set && request.method === "GET") return { kind: "get", method: "GET", id: id(set[1]) };
    if (activation && request.method === "POST") return { kind: "activate", method: "POST", id: id(activation[1]) };
    if (policyRoute && request.method === "GET") return { kind: "getPolicy", method: "GET", id: id(policyRoute[1]) };
    if (policyRoute && request.method === "POST") return { kind: "savePolicy", method: "POST", id: id(policyRoute[1]) };
    if (policyPreviewRoute && request.method === "POST") return { kind: "previewPolicy", method: "POST", id: id(policyPreviewRoute[1]) };
    if (preview && request.method === "POST") return { kind: "preview", method: "POST" };
    return error("method_not_allowed", 405, { allow: definitions || sets || policyRoute ? "GET, POST" : current || set ? "GET" : "POST" });
  } catch { return error("invalid_input", 400); }
}

async function body(request: Request): Promise<unknown | null> {
  if (request.headers.get("content-type") !== "application/json" || request.headers.has("transfer-encoding") || request.body === null) return null;
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^(?:0|[1-9][0-9]*)$/.test(declared) || Number(declared) > MAX_BODY_BYTES)) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > MAX_BODY_BYTES) { await reader.cancel().catch(() => undefined); return null; }
      chunks.push(new Uint8Array(next.value));
    }
  } catch { return null; }
  if (!total || (declared !== null && Number(declared) !== total)) return null;
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { return null; }
}

function mutationInput(value: unknown, route: Route): Readonly<Record<string, unknown>> {
  if (route.kind === "preview") {
    const raw = exact(value, ["setId", "channel", "pageSize"], ["afterVariantId"]);
    if (raw.channel !== "storefront" && raw.channel !== "quick_order") throw new TypeError("invalid_preview");
    return Object.freeze({ setId: id(raw.setId), channel: raw.channel, pageSize: integer(raw.pageSize, 1, 100),
      ...(Object.hasOwn(raw, "afterVariantId") ? { afterVariantId: id(raw.afterVariantId) } : {}),
    });
  }
  if (route.kind === "define") {
    const raw = exact(value, ["operationId", "referenceId", "kind", "label"], ["referencePurity"]);
    if (raw.kind !== "usd" && raw.kind !== "eur" && raw.kind !== "gold_gram") throw new TypeError("invalid_kind");
    if (raw.kind !== "gold_gram" && Object.hasOwn(raw, "referencePurity")) throw new TypeError("invalid_purity");
    return Object.freeze({ operationId: id(raw.operationId), referenceId: id(raw.referenceId), kind: raw.kind,
      label: label(raw.label), ...(Object.hasOwn(raw, "referencePurity") ? { referencePurity: decimal(raw.referencePurity, 8, true, true) } : {}),
    });
  }
  if (route.kind === "saveSet") {
    const raw = exact(value, ["operationId", "setId", "expectedStateVersion", "values"]);
    return Object.freeze({ operationId: id(raw.operationId), setId: id(raw.setId),
      expectedStateVersion: integer(raw.expectedStateVersion, 0), values: setValues(raw.values),
    });
  }
  if (route.kind === "activate") {
    const raw = exact(value, ["operationId", "expectedStateVersion", "expectedScopeDigest"]);
    return Object.freeze({ operationId: id(raw.operationId), expectedStateVersion: integer(raw.expectedStateVersion, 0),
      expectedScopeDigest: digest(raw.expectedScopeDigest),
    });
  }
  if (route.kind === "savePolicy") {
    const raw = exact(value, ["operationId", "expectedVariantVersion", "expectedPolicyVersion", "expectedScopeDigest", "policy"]);
    return Object.freeze({ operationId: id(raw.operationId), expectedVariantVersion: integer(raw.expectedVariantVersion, 1),
      expectedPolicyVersion: integer(raw.expectedPolicyVersion, 0), expectedScopeDigest: digest(raw.expectedScopeDigest), policy: policy(raw.policy),
    });
  }
  if (route.kind === "previewPolicy") {
    const raw = exact(value, ["policy", "channel"]);
    if (raw.channel !== "storefront") throw new TypeError("invalid_policy_preview_channel");
    return Object.freeze({ policy: policy(raw.policy), channel: raw.channel });
  }
  throw new TypeError("invalid_mutation_route");
}

async function authorize(dependencies: Dependencies, request: Request, route: Route): Promise<Response | Readonly<{
  runtime: ServerReferencePricingRuntime;
  tenantContext: TenantContext;
  now: Date;
}>> {
  const cookie = readOrderPanelSessionCookie(request);
  if (cookie.kind !== "present") return error("unauthenticated", 401);
  let runtime: ServerReferencePricingRuntime | null;
  try { runtime = await dependencies.resolveRuntime(); } catch { return error("unavailable", 503); }
  if (!runtime) return error("unavailable", 503);
  if (route.method === "POST" && !hasApprovedPanelMutationOriginShape(request, runtime.access.panelOrigin)) return error("forbidden", 403);
  let now: Date;
  let requestId: string;
  try { now = dependencies.now(); requestId = dependencies.requestId(); } catch { return error("unavailable", 503); }
  try { id(requestId); } catch { return error("unavailable", 503); }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return error("unavailable", 503);
  let access: ServerPanelAccessResult;
  try { access = await runtime.access.resolveCredential({ hostname: request.headers.get("host"), credential: cookie.credential, requestId, now: new Date(now) }); }
  catch { return error("unavailable", 503); }
  if (access.kind === "unauthenticated") return error("unauthenticated", 401);
  if (access.kind === "unauthorized") return error("forbidden", 403);
  if (access.kind !== "authenticated") return error("unavailable", 503);
  if (route.method === "POST" && !approvedPanelMutationOriginForStore(request, runtime.access.panelOrigin, access.tenantContext.store.slug)) return error("forbidden", 403);
  const action = route.method === "GET" || route.kind === "preview" || route.kind === "previewPolicy" ? "pricing.read" : "pricing.manage";
  if (!isMerchantActionAllowed(access.tenantContext.membership.role, action)) return error("forbidden", 403);
  return Object.freeze({ runtime, tenantContext: access.tenantContext, now: new Date(now) });
}

export function createReferencePricingHttpHandler(dependencies: Dependencies) {
  if (!dependencies || Object.keys(dependencies).sort().join(",") !== "now,requestId,resolveRuntime"
    || typeof dependencies.now !== "function" || typeof dependencies.requestId !== "function"
    || typeof dependencies.resolveRuntime !== "function") throw new Error("reference_pricing_http_handler_invalid");
  return async (request: Request): Promise<Response> => {
    const route = classify(request);
    if (route instanceof Response) return route;
    let input: Readonly<Record<string, unknown>> | undefined;
    if (route.method === "GET") {
      if (request.body !== null || request.headers.has("content-type") || request.headers.has("content-length")
        || request.headers.has("transfer-encoding")) return error("invalid_input", 400);
    } else {
      const raw = await body(request);
      try { input = mutationInput(raw, route); } catch { return error("invalid_input", 400); }
    }
    const authorized = await authorize(dependencies, request, route);
    if (authorized instanceof Response) return authorized;
    const authority = { tenantContext: authorized.tenantContext, now: authorized.now };
    const pricing: ReferencePricingRepository = authorized.runtime.referencePricing;
    try {
      if (route.kind === "definitions") return response(definitionsOutput(await pricing.listDefinitions(authority)));
      if (route.kind === "list") return response(listOutput(await pricing.list({ ...authority, pageSize: route.pageSize!, ...(route.afterSetVersion === undefined ? {} : { afterSetVersion: route.afterSetVersion }) })));
      if (route.kind === "get") {
        const result = setOutput(await pricing.get({ ...authority, ...(route.id === undefined ? {} : { setId: route.id }) }));
        if (route.id !== undefined && result.setId !== route.id) return error("unavailable", 503);
        return response(result);
      }
      if (route.kind === "getPolicy") {
        const result = policyOutput(await pricing.getPolicy({ ...authority, variantId: route.id! }));
        return result.variantId === route.id ? response(result) : error("unavailable", 503);
      }
      if (route.kind === "preview") {
        const safe = input as Parameters<ReferencePricingRepository["preview"]>[0];
        const result = previewOutput(await pricing.preview({ ...authority, ...safe }));
        return result.setId === safe.setId && result.entries.length <= safe.pageSize ? response(result) : error("unavailable", 503);
      }
      if (route.kind === "previewPolicy") {
        const safe = input as Parameters<ReferencePricingRepository["previewPolicy"]>[0];
        const result = policyPreviewOutput(await pricing.previewPolicy({ ...authority, ...safe, variantId: route.id! }));
        return result.variantId === route.id && result.method === safe.policy.method
          && (safe.policy.method === "fixed_try" || result.referenceId === safe.policy.referenceId)
          ? response(result) : error("unavailable", 503);
      }
      if (route.kind === "define") {
        const safe = input as Parameters<ReferencePricingRepository["define"]>[0];
        const result = referenceIdentity(await pricing.define({ ...authority, ...safe }));
        return result.id === safe.referenceId ? response(result) : error("unavailable", 503);
      }
      if (route.kind === "saveSet") {
        const safe = input as Parameters<ReferencePricingRepository["saveSet"]>[0];
        const result = setOutput(await pricing.saveSet({ ...authority, ...safe }));
        return result.setId === safe.setId && !result.isActive ? response(result) : error("unavailable", 503);
      }
      if (route.kind === "activate") {
        const safe = input as Parameters<ReferencePricingRepository["activate"]>[0];
        const result = activatedOutput(await pricing.activate({ ...authority, ...safe, setId: route.id! }));
        return result.setId === route.id ? response(result) : error("unavailable", 503);
      }
      const safe = input as Parameters<ReferencePricingRepository["savePolicy"]>[0];
      const result = policyOutput(await pricing.savePolicy({ ...authority, ...safe, variantId: route.id! }));
      return result.variantId === route.id ? response(result) : error("unavailable", 503);
    } catch (caught) { return repositoryError(caught); }
  };
}
