const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const ORDER_PATH = new RegExp(
  `^(?:/api/orders|/api/orders/summary|/api/orders/drafts|/api/orders/drafts/${UUID}|/api/orders/drafts/${UUID}/(?:archive|convert)|/api/orders/${UUID}|/api/orders/${UUID}/(?:status|payment|shipping|notes|neighbors)|/api/orders/${UUID}/notes/${UUID}/archive)$`,
);

export type OrderRequestAuthorityDecision =
  | "approved"
  | "method_not_allowed"
  | "origin_denied"
  | "request_invalid";

export type OrderRequestExpectation = Readonly<{
  method: "GET" | "POST" | "PATCH";
  pathname: string;
  query: "allowed" | "forbidden";
}>;

export type OrderRequestAuthorityValidator = Readonly<{
  validate(request: unknown, expectation: OrderRequestExpectation): OrderRequestAuthorityDecision;
}>;

function invalid(): never {
  throw new Error("order_request_authority_invalid");
}

function canonicalPanelOrigin(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2_048 || value.trim() !== value) invalid();
  let parsed: URL;
  try { parsed = new URL(value); } catch { return invalid(); }
  if (
    parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port ||
    parsed.pathname !== "/" || parsed.search || parsed.hash || parsed.origin !== value
  ) invalid();
  return value;
}

function exactExpectation(value: OrderRequestExpectation): OrderRequestExpectation {
  if (
    typeof value !== "object" || value === null || Array.isArray(value) ||
    Object.keys(value).sort().join(",") !== "method,pathname,query" ||
    !["GET", "POST", "PATCH"].includes(value.method) || !ORDER_PATH.test(value.pathname) ||
    (value.query !== "allowed" && value.query !== "forbidden") ||
    (value.query === "allowed" && (
      value.method !== "GET" ||
      (value.pathname !== "/api/orders" && value.pathname !== "/api/orders/drafts")
    ))
  ) invalid();
  return value;
}

export function createOrderRequestAuthorityValidator(options: {
  panelOrigin: string;
}): OrderRequestAuthorityValidator {
  let panelOrigin: string;
  try {
    if (
      typeof options !== "object" || options === null || Array.isArray(options) ||
      Object.keys(options).join(",") !== "panelOrigin"
    ) invalid();
    panelOrigin = canonicalPanelOrigin(options.panelOrigin);
  } catch { return invalid(); }
  return Object.freeze({
    validate(request: unknown, expectation: OrderRequestExpectation): OrderRequestAuthorityDecision {
      try {
        const exact = exactExpectation(expectation);
        if (!(request instanceof Request)) return "request_invalid";
        if (request.method !== exact.method) return "method_not_allowed";
        if (exact.method !== "GET" && request.headers.get("origin") !== panelOrigin) return "origin_denied";
        const url = new URL(request.url);
        if (
          (url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password ||
          url.pathname !== exact.pathname || url.hash || (exact.query === "forbidden" && url.search)
        ) return "request_invalid";
        return "approved";
      } catch { return "request_invalid"; }
    },
  });
}
