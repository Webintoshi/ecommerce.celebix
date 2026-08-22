import { hasApprovedPanelMutationOriginShape } from "../panel-origin-authority.ts";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const QUICK_LINK_PATH = new RegExp(
  `^(?:/api/orders/quick-links|/api/orders/quick-links/payment-methods|/api/orders/quick-links/${UUID}|/api/orders/quick-links/${UUID}/(?:cancel|duplicate|url)|/api/orders/quick-links/provider/(?:activate|revoke))$`,
);

export type QuickLinkRequestAuthorityDecision =
  | "approved"
  | "method_not_allowed"
  | "origin_denied"
  | "request_invalid";

export type QuickLinkRequestExpectation = Readonly<{
  method: "GET" | "POST";
  pathname: string;
  query: "allowed" | "forbidden";
}>;

export type QuickLinkRequestAuthorityValidator = Readonly<{
  validate(request: unknown, expectation: QuickLinkRequestExpectation): QuickLinkRequestAuthorityDecision;
}>;

function invalid(): never {
  throw new Error("quick_link_request_authority_invalid");
}

function panelOrigin(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 2_048 || value !== value.trim()) invalid();
  let url: URL;
  try { url = new URL(value); } catch { return invalid(); }
  if (
    url.protocol !== "https:" || url.username || url.password || url.port || url.pathname !== "/" ||
    url.search || url.hash || url.origin !== value
  ) invalid();
  return value;
}

function expectation(value: QuickLinkRequestExpectation): QuickLinkRequestExpectation {
  if (
    !value || typeof value !== "object" || Array.isArray(value) ||
    Object.keys(value).sort().join(",") !== "method,pathname,query" ||
    (value.method !== "GET" && value.method !== "POST") || !QUICK_LINK_PATH.test(value.pathname) ||
    (value.query !== "allowed" && value.query !== "forbidden") ||
    (value.query === "allowed" && (value.method !== "GET" || value.pathname !== "/api/orders/quick-links"))
  ) invalid();
  return value;
}

function getHasBody(request: Request): boolean {
  if (request.body !== null || request.headers.get("transfer-encoding") !== null) return true;
  const length = request.headers.get("content-length");
  return length !== null && length !== "0";
}

export function createQuickLinkRequestAuthorityValidator(options: {
  panelOrigin: string;
}): QuickLinkRequestAuthorityValidator {
  let configuredOrigin: string;
  try {
    if (
      !options || typeof options !== "object" || Array.isArray(options) ||
      Object.keys(options).join(",") !== "panelOrigin"
    ) invalid();
    configuredOrigin = panelOrigin(options.panelOrigin);
  } catch { return invalid(); }
  return Object.freeze({
    validate(request: unknown, expected: QuickLinkRequestExpectation): QuickLinkRequestAuthorityDecision {
      try {
        const selected = expectation(expected);
        if (!(request instanceof Request)) return "request_invalid";
        if (request.method !== selected.method) return "method_not_allowed";
        if (selected.method === "POST" && !hasApprovedPanelMutationOriginShape(request, configuredOrigin)) return "origin_denied";
        if (request.headers.get("transfer-encoding") !== null) return "request_invalid";
        if (selected.method === "GET" && getHasBody(request)) return "request_invalid";
        const url = new URL(request.url);
        if (
          (url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password ||
          url.pathname !== selected.pathname || url.hash ||
          (selected.query === "forbidden" && url.search !== "")
        ) return "request_invalid";
        return "approved";
      } catch { return "request_invalid"; }
    },
  });
}
