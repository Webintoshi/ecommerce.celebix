const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const PATH = new RegExp(`^(?:/api/orders/abandoned-carts|/api/orders/abandoned-carts/summary|/api/orders/abandoned-carts/${UUID}|/api/orders/abandoned-carts/${UUID}/(?:recovered|archive))$`);

export type AbandonedCartRequestAuthorityDecision = "approved" | "method_not_allowed" | "origin_denied" | "request_invalid";
export type AbandonedCartRequestExpectation = Readonly<{ method: "GET" | "POST"; pathname: string; query: "allowed" | "forbidden" }>;

function invalid(): never { throw new Error("abandoned_cart_request_authority_invalid"); }

function panelOrigin(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 2_048 || value.trim() !== value) invalid();
  let url: URL; try { url = new URL(value); } catch { return invalid(); }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash || url.origin !== value) invalid();
  return value;
}

function expectation(value: AbandonedCartRequestExpectation): AbandonedCartRequestExpectation {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.keys(value).sort().join(",") !== "method,pathname,query" || !["GET", "POST"].includes(value.method) || !PATH.test(value.pathname) || !["allowed", "forbidden"].includes(value.query) || (value.query === "allowed" && (value.method !== "GET" || value.pathname !== "/api/orders/abandoned-carts"))) invalid();
  return value;
}

export function createAbandonedCartRequestAuthorityValidator(options: Readonly<{ panelOrigin: string }>) {
  let origin: string;
  try { if (typeof options !== "object" || options === null || Array.isArray(options) || Object.keys(options).join(",") !== "panelOrigin") invalid(); origin = panelOrigin(options.panelOrigin); } catch { return invalid(); }
  return Object.freeze({
    validate(request: unknown, expected: AbandonedCartRequestExpectation): AbandonedCartRequestAuthorityDecision {
      try {
        const exact = expectation(expected);
        if (!(request instanceof Request)) return "request_invalid";
        if (request.method !== exact.method) return "method_not_allowed";
        if (exact.method === "POST" && request.headers.get("origin") !== origin) return "origin_denied";
        const url = new URL(request.url);
        if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== exact.pathname || url.hash || (exact.query === "forbidden" && url.search)) return "request_invalid";
        return "approved";
      } catch { return "request_invalid"; }
    },
  });
}
