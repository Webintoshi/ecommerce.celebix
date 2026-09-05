import { hasApprovedPanelMutationOriginShape } from "../panel-origin-authority.ts";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const PRIVATE_EXACT = new Set([
  "authorization", "forwarded", "x-panel-session-credential", "x-store-id", "x-tenant-id",
  "x-principal-id", "x-membership-id", "x-plan-id", "x-database-role", "x-database-url",
]);
const PRIVATE_PREFIXES = Object.freeze([
  "x-celebix", "x-forwarded-", "x-store-", "x-tenant-", "x-principal-", "x-membership-", "x-plan-",
]);

export type PromotionRoute =
  | Readonly<{ kind: "list"; method: "GET"; pathname: "/api/promotions" }>
  | Readonly<{ kind: "create"; method: "POST"; pathname: "/api/promotions" }>
  | Readonly<{ kind: "detail"; method: "GET"; pathname: string; promotionId: string }>
  | Readonly<{ kind: "update"; method: "PATCH"; pathname: string; promotionId: string }>
  | Readonly<{ kind: "publish" | "pause" | "resume" | "duplicate" | "archive"; method: "POST"; pathname: string; promotionId: string }>
  | Readonly<{ kind: "simulate" | "conflicts" | "margin" | "target_resolve"; method: "POST"; pathname: string }>
  | Readonly<{ kind: "target_list" | "legacy"; method: "GET"; pathname: string }>
  | Readonly<{ kind: "legacy_resolve"; method: "GET"; pathname: string; legacyRecordId: string }>
  | Readonly<{ kind: "code_batch_list"; method: "GET"; pathname: string; promotionId: string }>
  | Readonly<{ kind: "code_batch_create"; method: "POST"; pathname: string; promotionId: string }>
  | Readonly<{ kind: "code_batch_status"; method: "POST"; pathname: string; batchId: string }>
  | Readonly<{ kind: "code_batch_csv"; method: "GET"; pathname: string; batchId: string }>
  | Readonly<{ kind: "analytics"; method: "GET"; pathname: string; promotionId: string }>
  | Readonly<{ kind: "overview"; method: "GET"; pathname: "/api/promotions/overview" }>;

export type PromotionRouteDecision =
  | Readonly<{ kind: "approved"; route: PromotionRoute }>
  | Readonly<{ kind: "invalid" }>
  | Readonly<{ kind: "not_found" }>
  | Readonly<{ kind: "method_not_allowed"; allow: "GET" | "POST" | "PATCH" | "GET, POST" | "GET, PATCH" }>;

const INVALID = Object.freeze({ kind: "invalid" as const });
const NOT_FOUND = Object.freeze({ kind: "not_found" as const });

function hasPrivateAuthority(request: Request): boolean {
  try {
    for (const [name] of request.headers) {
      if (PRIVATE_EXACT.has(name) || PRIVATE_PREFIXES.some((prefix) => name.startsWith(prefix))) return true;
    }
    return false;
  } catch {
    return true;
  }
}

export function preparePromotionRouteRequest(request: Request): Request {
  const headers = new Headers(request.headers);
  headers.delete("x-forwarded-for");
  headers.delete("x-forwarded-host");
  headers.delete("x-forwarded-port");
  headers.delete("x-forwarded-proto");
  headers.delete("x-forwarded-server");
  return new Request(request, { headers });
}

function selectRoute(pathname: string, method: string): PromotionRouteDecision {
  let allow: "GET" | "POST" | "PATCH" | "GET, POST" | "GET, PATCH";
  let selected: PromotionRoute;

  if (pathname === "/api/promotions") {
    allow = "GET, POST";
    selected = method === "POST"
      ? { kind: "create", method: "POST", pathname }
      : { kind: "list", method: "GET", pathname };
  } else if (pathname === "/api/promotions/simulate") {
    allow = "POST"; selected = { kind: "simulate", method: "POST", pathname };
  } else if (pathname === "/api/promotions/conflicts") {
    allow = "POST"; selected = { kind: "conflicts", method: "POST", pathname };
  } else if (pathname === "/api/promotions/margin") {
    allow = "POST"; selected = { kind: "margin", method: "POST", pathname };
  } else if (pathname === "/api/promotions/targets") {
    allow = "GET"; selected = { kind: "target_list", method: "GET", pathname };
  } else if (pathname === "/api/promotions/targets/resolve") {
    allow = "POST"; selected = { kind: "target_resolve", method: "POST", pathname };
  } else if (pathname === "/api/promotions/legacy") {
    allow = "GET"; selected = { kind: "legacy", method: "GET", pathname };
  } else if (pathname === "/api/promotions/overview") {
    allow = "GET"; selected = { kind: "overview", method: "GET", pathname };
  } else {
    const batchStatus = new RegExp(`^/api/promotions/code-batches/(${UUID})/status$`).exec(pathname);
    const batchCsv = new RegExp(`^/api/promotions/code-batches/(${UUID})/csv$`).exec(pathname);
    const batchCollection = new RegExp(`^/api/promotions/(${UUID})/code-batches$`).exec(pathname);
    const legacyResolve = new RegExp(`^/api/promotions/legacy/(${UUID})$`).exec(pathname);
    const action = new RegExp(`^/api/promotions/(${UUID})/(publish|pause|resume|duplicate|archive)$`).exec(pathname);
    const analytics = new RegExp(`^/api/promotions/(${UUID})/analytics$`).exec(pathname);
    const detail = new RegExp(`^/api/promotions/(${UUID})$`).exec(pathname);
    if (legacyResolve) {
      allow = "GET"; selected = { kind: "legacy_resolve", method: "GET", pathname, legacyRecordId: legacyResolve[1]! };
    } else if (batchStatus) {
      allow = "POST"; selected = { kind: "code_batch_status", method: "POST", pathname, batchId: batchStatus[1]! };
    } else if (batchCsv) {
      allow = "GET"; selected = { kind: "code_batch_csv", method: "GET", pathname, batchId: batchCsv[1]! };
    } else if (batchCollection) {
      allow = "GET, POST";
      selected = method === "POST"
        ? { kind: "code_batch_create", method: "POST", pathname, promotionId: batchCollection[1]! }
        : { kind: "code_batch_list", method: "GET", pathname, promotionId: batchCollection[1]! };
    } else if (action) {
      allow = "POST";
      selected = { kind: action[2] as "publish" | "pause" | "resume" | "duplicate" | "archive", method: "POST", pathname, promotionId: action[1]! };
    } else if (analytics) {
      allow = "GET"; selected = { kind: "analytics", method: "GET", pathname, promotionId: analytics[1]! };
    } else if (detail) {
      allow = "GET, PATCH";
      selected = method === "PATCH"
        ? { kind: "update", method: "PATCH", pathname, promotionId: detail[1]! }
        : { kind: "detail", method: "GET", pathname, promotionId: detail[1]! };
    } else {
      return NOT_FOUND;
    }
  }

  return method === selected.method
    ? Object.freeze({ kind: "approved", route: Object.freeze(selected) })
    : Object.freeze({ kind: "method_not_allowed", allow });
}

export function classifyPromotionRequest(request: unknown): PromotionRouteDecision {
  try {
    if (!(request instanceof Request) || hasPrivateAuthority(request)) return INVALID;
    const url = new URL(request.url);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password || url.hash ||
      (request.method !== "GET" && url.search !== "")
    ) return INVALID;
    return selectRoute(url.pathname, request.method);
  } catch {
    return INVALID;
  }
}

export function promotionOriginApproved(request: Request, panelOrigin: string): boolean {
  return hasApprovedPanelMutationOriginShape(request, panelOrigin);
}
