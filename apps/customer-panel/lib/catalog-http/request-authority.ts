import "server-only";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
export const CATALOG_SUMMARY_PATH = "/api/catalog/summary";
export const CATALOG_VARIANT_CHOICES_PATH = "/api/catalog/variant-choices";
const CATALOG_PATH = new RegExp(
  `^(?:/api/catalog/(?:summary|variant-choices)|/api/catalog/products(?:/${UUID}(?:/archive|/variants(?:/${UUID}(?:/archive)?)?)?)?)$`,
);

export type CatalogRequestAuthorityDecision =
  | "approved"
  | "method_not_allowed"
  | "origin_denied"
  | "request_invalid";

export type CatalogRequestExpectation = Readonly<{
  method: "GET" | "POST" | "PATCH";
  pathname: string;
  query: "allowed" | "forbidden";
}>;

export type CatalogRequestAuthorityValidator = Readonly<{
  validate(request: unknown, expectation: CatalogRequestExpectation): CatalogRequestAuthorityDecision;
}>;

function invalid(): never {
  throw new Error("catalog_request_authority_invalid");
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

function expectation(value: CatalogRequestExpectation): CatalogRequestExpectation {
  if (
    typeof value !== "object" || value === null || Array.isArray(value) ||
    Object.keys(value).sort().join(",") !== "method,pathname,query" ||
    !["GET", "POST", "PATCH"].includes(value.method) ||
    !CATALOG_PATH.test(value.pathname) ||
    (value.query !== "allowed" && value.query !== "forbidden") ||
    (value.query === "allowed" && (value.method !== "GET" || value.pathname !== "/api/catalog/products"))
  ) invalid();
  return value;
}

export function createCatalogRequestAuthorityValidator(options: {
  panelOrigin: string;
}): CatalogRequestAuthorityValidator {
  if (
    typeof options !== "object" || options === null || Array.isArray(options) ||
    Object.keys(options).join(",") !== "panelOrigin"
  ) invalid();
  const panelOrigin = canonicalPanelOrigin(options.panelOrigin);
  return Object.freeze({
    validate(request: unknown, expected: CatalogRequestExpectation): CatalogRequestAuthorityDecision {
      const exact = expectation(expected);
      if (!(request instanceof Request)) return "request_invalid";
      if (request.method !== exact.method) return "method_not_allowed";
      if (exact.method !== "GET" && request.headers.get("origin") !== panelOrigin) return "origin_denied";
      let url: URL;
      try { url = new URL(request.url); } catch { return "request_invalid"; }
      if (
        (url.protocol !== "http:" && url.protocol !== "https:") ||
        url.username || url.password || url.pathname !== exact.pathname || url.hash ||
        (exact.query === "forbidden" && url.search)
      ) return "request_invalid";
      return "approved";
    },
  });
}
