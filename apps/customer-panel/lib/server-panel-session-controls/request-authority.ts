import "server-only";

export const PANEL_ACTIVE_STORE_SESSION_CONTROL_PATH = "/api/session/active-store";
export const PANEL_LOGOUT_SESSION_CONTROL_PATH = "/api/session/logout";

const PATHS = new Set([
  PANEL_ACTIVE_STORE_SESSION_CONTROL_PATH,
  PANEL_LOGOUT_SESSION_CONTROL_PATH,
]);

export type PanelSessionControlRequestAuthorityDecision =
  | "approved"
  | "method_not_allowed"
  | "origin_denied"
  | "request_invalid";

export type PanelSessionControlRequestAuthorityValidator = Readonly<{
  validate(request: unknown): PanelSessionControlRequestAuthorityDecision;
}>;

function invalid(): never {
  throw new Error("panel_session_control_request_authority_invalid");
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

function exactPathname(value: unknown): string {
  if (typeof value !== "string" || !PATHS.has(value)) invalid();
  return value;
}

export function createPanelSessionControlRequestAuthorityValidator(options: {
  panelOrigin: string;
  pathname: string;
}): PanelSessionControlRequestAuthorityValidator {
  if (!options || typeof options !== "object" || Array.isArray(options)) invalid();
  const panelOrigin = canonicalPanelOrigin(options.panelOrigin);
  const pathname = exactPathname(options.pathname);
  return Object.freeze({
    validate(request: unknown): PanelSessionControlRequestAuthorityDecision {
      if (!(request instanceof Request)) return "request_invalid";
      if (request.method !== "POST") return "method_not_allowed";
      if (request.headers.get("origin") !== panelOrigin) return "origin_denied";
      let url: URL;
      try { url = new URL(request.url); } catch { return "request_invalid"; }
      if (
        !["http:", "https:"].includes(url.protocol) || url.username || url.password ||
        url.pathname !== pathname || url.search || url.hash
      ) return "request_invalid";
      return "approved";
    },
  });
}
