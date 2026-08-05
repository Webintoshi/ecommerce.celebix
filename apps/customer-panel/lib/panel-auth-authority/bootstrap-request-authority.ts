export type PanelBootstrapRequestAuthorityDecision =
  | "approved"
  | "method_not_allowed"
  | "request_invalid";

export type PanelBootstrapRequestAuthorityValidator = Readonly<{
  validate(request: unknown): PanelBootstrapRequestAuthorityDecision;
}>;

function invalid(): never {
  throw new Error("panel_bootstrap_request_authority_invalid");
}

function exactSourceOrigin(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2_048) invalid();
  let parsed: URL;
  try { parsed = new URL(value); } catch { return invalid(); }
  if (
    parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port ||
    parsed.pathname !== "/" || parsed.search || parsed.hash || parsed.origin !== value
  ) invalid();
  return value;
}

function exactPublicBootstrapUrl(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2_048) invalid();
  let parsed: URL;
  try { parsed = new URL(value); } catch { return invalid(); }
  if (
    parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port ||
    parsed.pathname !== "/auth/bootstrap" || parsed.search || parsed.hash ||
    `${parsed.origin}${parsed.pathname}` !== value
  ) invalid();
  return value;
}

export function createPanelBootstrapRequestAuthorityValidator(options: {
  sourceOrigin: string;
  publicBootstrapUrl: string;
}): PanelBootstrapRequestAuthorityValidator {
  if (!options || typeof options !== "object" || Array.isArray(options)) invalid();
  const sourceOrigin = exactSourceOrigin(options.sourceOrigin);
  exactPublicBootstrapUrl(options.publicBootstrapUrl);

  return Object.freeze({
    validate(request: unknown): PanelBootstrapRequestAuthorityDecision {
      if (!(request instanceof Request) || request.method !== "POST") return "method_not_allowed";
      if (request.headers.get("origin") !== sourceOrigin) return "request_invalid";
      let requestUrl: URL;
      try { requestUrl = new URL(request.url); } catch { return "request_invalid"; }
      if (
        !["http:", "https:"].includes(requestUrl.protocol) ||
        requestUrl.pathname !== "/auth/bootstrap" || requestUrl.search || requestUrl.hash
      ) return "request_invalid";
      return "approved";
    },
  });
}
