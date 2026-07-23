import { parsePriceList, parsePriceListItem, parsePriceListRule, type TenantContext } from "@celebix/saas-contracts";
import { pricingRepositoryErrorCode, type PricingRepository } from "@celebix/saas-data";
import { readOrderPanelSessionCookie } from "../order-http/request-input.ts";
import type { ServerPanelAccessResult } from "../server-panel-access/access.ts";
import type { ServerPricingRuntime } from "../server-pricing/runtime.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PRIVATE_HEADERS = ["authorization", "x-store-id", "x-tenant-id", "x-celebix-store", "x-celebix-tenant"];
const MAX_BODY = 65_536;
type Dependencies = Readonly<{ resolveRuntime(): Promise<ServerPricingRuntime | null>; now(): Date; requestId(): string }>;
type Route = Readonly<{ kind: "list" | "get" | "save" | "activate" | "archive"; id?: string; method: "GET" | "POST" }>;
function response(value: unknown, status = 200, extra?: HeadersInit) { const headers = new Headers(extra); headers.set("cache-control", "no-store"); headers.set("x-content-type-options", "nosniff"); return Response.json(value, { status, headers }); }
function error(code: string, status: number, extra?: HeadersInit) { return response({ code }, status, extra); }
function repositoryError(value: unknown) { const code = pricingRepositoryErrorCode(value); if (code === "invalid_input") return error("invalid_input", 400); if (code === "resource_not_found") return error("not_found", 404); if (["version_conflict", "invalid_transition", "operation_mismatch", "pricing_conflict"].includes(code ?? "")) return error("conflict", 409); if (["unauthenticated", "membership_denied", "store_inactive", "feature_not_enabled", "durable_authority_invalid"].includes(code ?? "")) return error("forbidden", 403); return error("unavailable", 503); }
function classify(request: Request): Route | Response {
  try {
    if (PRIVATE_HEADERS.some((name) => request.headers.has(name))) return error("invalid_input", 400);
    const url = new URL(request.url); if (url.search !== "" || url.hash !== "") return error("invalid_input", 400);
    const list = url.pathname === "/api/pricing/price-lists";
    const detail = new RegExp(`^/api/pricing/price-lists/(${UUID.source.slice(1, -1)})$`).exec(url.pathname);
    const action = new RegExp(`^/api/pricing/price-lists/(${UUID.source.slice(1, -1)})/(activate|archive)$`).exec(url.pathname);
    if (!list && !detail && !action) return error("not_found", 404);
    if (list && request.method === "GET") return { kind: "list", method: "GET" };
    if (list && request.method === "POST") return { kind: "save", method: "POST" };
    if (detail && request.method === "GET") return { kind: "get", id: detail[1], method: "GET" };
    if (action && request.method === "POST") return { kind: action[2] as "activate" | "archive", id: action[1], method: "POST" };
    return error("method_not_allowed", 405, { allow: list ? "GET, POST" : detail ? "GET" : "POST" });
  } catch { return error("invalid_input", 400); }
}
function exact(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return null;
  const keys = Object.keys(value), allowed = new Set([...required, ...optional]); return required.every((key) => Object.hasOwn(value, key)) && keys.every((key) => allowed.has(key)) ? value as Record<string, unknown> : null;
}
async function body(request: Request): Promise<unknown | null> {
  if (request.headers.get("content-type") !== "application/json" || request.headers.has("transfer-encoding") || request.body === null) return null;
  const declared = request.headers.get("content-length"); if (declared !== null && (!/^(?:0|[1-9]\d*)$/.test(declared) || Number(declared) > MAX_BODY)) return null;
  const reader = request.body.getReader(), chunks: Uint8Array[] = []; let total = 0;
  try { for (;;) { const next = await reader.read(); if (next.done) break; total += next.value.byteLength; if (total > MAX_BODY) { await reader.cancel().catch(() => undefined); return null; } chunks.push(new Uint8Array(next.value)); } } catch { return null; }
  if (!total || (declared !== null && Number(declared) !== total)) return null; const bytes = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { return null; }
}
function listValue(value: unknown): readonly ReturnType<typeof parsePriceList>[] { if (!Array.isArray(value) || value.length > 500) throw new Error(); return Object.freeze(value.map(parsePriceList)); }
function parsedMutation(value: unknown, kind: "save" | "activate" | "archive") {
  if (kind === "save") {
    const parsed = exact(value, ["operationId", "name", "items", "rules"], ["priceListId", "expectedVersion"]); if (!parsed || !UUID.test(String(parsed.operationId)) || typeof parsed.name !== "string" || !Array.isArray(parsed.items) || !Array.isArray(parsed.rules) || parsed.items.length < 1 || parsed.items.length > 500 || parsed.rules.length < 1 || parsed.rules.length > 100 || ((parsed.priceListId === undefined) !== (parsed.expectedVersion === undefined))) return null;
    try { const items = Object.freeze(parsed.items.map(parsePriceListItem)), rules = Object.freeze(parsed.rules.map(parsePriceListRule)); return Object.freeze({ operationId: parsed.operationId as string, ...(parsed.priceListId === undefined ? {} : { priceListId: UUID.test(String(parsed.priceListId)) ? parsed.priceListId as string : (() => { throw new Error(); })(), expectedVersion: Number.isSafeInteger(parsed.expectedVersion) && (parsed.expectedVersion as number) >= 1 ? parsed.expectedVersion as number : (() => { throw new Error(); })() }), name: parsed.name, items, rules }); } catch { return null; }
  }
  const parsed = exact(value, ["operationId", "expectedVersion"]); return parsed && UUID.test(String(parsed.operationId)) && Number.isSafeInteger(parsed.expectedVersion) && (parsed.expectedVersion as number) >= 1 && (parsed.expectedVersion as number) < Number.MAX_SAFE_INTEGER ? Object.freeze({ operationId: parsed.operationId as string, expectedVersion: parsed.expectedVersion as number }) : null;
}
async function authorize(dependencies: Dependencies, request: Request, route: Route): Promise<Response | Readonly<{ runtime: ServerPricingRuntime; tenantContext: TenantContext; now: Date }>> {
  const cookie = readOrderPanelSessionCookie(request); if (cookie.kind !== "present") return error("unauthenticated", 401);
  let runtime: ServerPricingRuntime | null; try { runtime = await dependencies.resolveRuntime(); } catch { return error("unavailable", 503); } if (!runtime) return error("unavailable", 503);
  if (route.method === "POST" && request.headers.get("origin") !== runtime.access.panelOrigin) return error("forbidden", 403);
  let now: Date, requestId: string; try { now = dependencies.now(); requestId = dependencies.requestId(); } catch { return error("unavailable", 503); } if (!(now instanceof Date) || !Number.isFinite(now.getTime()) || !UUID.test(requestId)) return error("unavailable", 503);
  let access: ServerPanelAccessResult; try { access = await runtime.access.resolveCredential({ credential: cookie.credential, requestId, now: new Date(now) }); } catch { return error("unavailable", 503); }
  if (access.kind === "unauthenticated") return error("unauthenticated", 401); if (access.kind === "unauthorized") return error("forbidden", 403); if (access.kind !== "authenticated") return error("unavailable", 503);
  return Object.freeze({ runtime, tenantContext: access.tenantContext, now: new Date(now) });
}
export function createPricingHttpHandler(dependencies: Dependencies) {
  if (!dependencies || Object.keys(dependencies).sort().join(",") !== "now,requestId,resolveRuntime" || typeof dependencies.now !== "function" || typeof dependencies.requestId !== "function" || typeof dependencies.resolveRuntime !== "function") throw new Error("pricing_http_handler_invalid");
  return async (request: Request): Promise<Response> => {
    const route = classify(request); if (route instanceof Response) return route;
    let mutation: ReturnType<typeof parsedMutation> = null;
    if (route.method === "GET") { if (request.body !== null || request.headers.has("content-type") || request.headers.has("content-length") || request.headers.has("transfer-encoding")) return error("invalid_input", 400); }
    else { mutation = parsedMutation(await body(request), route.kind as "save" | "activate" | "archive"); if (!mutation) return error("invalid_input", 400); }
    const authorized = await authorize(dependencies, request, route); if (authorized instanceof Response) return authorized;
    const authority = { tenantContext: authorized.tenantContext, now: authorized.now }, repository: PricingRepository = authorized.runtime.pricing;
    try {
      if (route.kind === "list") return response({ items: listValue(await repository.list(authority)) });
      if (route.kind === "get") return response(parsePriceList(await repository.get({ ...authority, priceListId: route.id! })));
      if (route.kind === "save") return response(parsePriceList(await repository.save({ ...authority, ...(mutation as Parameters<PricingRepository["save"]>[0]) })));
      const input = { ...authority, ...(mutation as { operationId: string; expectedVersion: number }), priceListId: route.id! };
      return response(parsePriceList(await repository[route.kind](input)));
    } catch (caught) { return repositoryError(caught); }
  };
}
