import "server-only";
import { hasApprovedPanelMutationOriginShape } from "../panel-origin-authority.ts";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const PATH = new RegExp(`^(?:/api/catalog/onboarding/(?:options|products|categories(?:/${UUID}(?:/archive)?)?)|/api/catalog/products/${UUID}/(?:merchandising|publish-after-media))$`);

export type CatalogOnboardingRequestExpectation = Readonly<{
  method: "GET" | "POST" | "PATCH";
  pathname: string;
}>;

export type CatalogOnboardingRequestDecision = "approved" | "method_not_allowed" | "origin_denied" | "request_invalid";

function invalid(): never { throw new Error("catalog_onboarding_request_authority_invalid"); }

function panelOrigin(value: unknown): string {
  if (typeof value !== "string" || value.length > 2_048 || value.trim() !== value) invalid();
  let parsed: URL;
  try { parsed = new URL(value); } catch { return invalid(); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port || parsed.pathname !== "/" || parsed.search || parsed.hash || parsed.origin !== value) invalid();
  return value;
}

function expectation(value: CatalogOnboardingRequestExpectation): CatalogOnboardingRequestExpectation {
  if (
    !value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).sort().join(",") !== "method,pathname"
    || !["GET", "POST", "PATCH"].includes(value.method)
    || !PATH.test(value.pathname)
  ) invalid();
  return value;
}

export function createCatalogOnboardingRequestAuthorityValidator(options: Readonly<{ panelOrigin: string }>) {
  if (!options || typeof options !== "object" || Array.isArray(options) || Object.keys(options).join(",") !== "panelOrigin") invalid();
  const origin = panelOrigin(options.panelOrigin);
  return Object.freeze({
    validate(request: unknown, expected: CatalogOnboardingRequestExpectation): CatalogOnboardingRequestDecision {
      const exact = expectation(expected);
      if (!(request instanceof Request)) return "request_invalid";
      if (request.method !== exact.method) return "method_not_allowed";
      if (exact.method !== "GET" && !hasApprovedPanelMutationOriginShape(request, origin)) return "origin_denied";
      let url: URL;
      try { url = new URL(request.url); } catch { return "request_invalid"; }
      if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password || url.pathname !== exact.pathname || url.search || url.hash) return "request_invalid";
      return "approved";
    },
  });
}
