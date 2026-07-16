import { PANEL_BROWSER_BOOTSTRAP_URL } from "../../../../packages/platform-config/src/saas.ts";

const CONTROL = /[\u0000-\u001f\u007f]/;
const MAXIMUM_HTML_BYTES = 131_072;
const MAXIMUM_PROVIDER_AUTHORIZATION_URL_LENGTH = 16_384;

function invalid(): never {
  throw new Error("browser_bound_registration_bridge_unavailable");
}

function safeValue(value: unknown): string {
  if (typeof value !== "string" || !value || value.trim() !== value || CONTROL.test(value)) invalid();
  return value;
}

function providerAuthorization(value: unknown): Readonly<{ exact: string; origin: string }> {
  const exact = safeValue(value);
  if (exact.length > MAXIMUM_PROVIDER_AUTHORIZATION_URL_LENGTH) invalid();
  let parsed: URL;
  try { parsed = new URL(exact); } catch { return invalid(); }
  if (
    parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port ||
    parsed.hash || parsed.toString() !== exact
  ) invalid();
  return Object.freeze({ exact, origin: parsed.origin });
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function createOwnerPanelBootstrapAutoPostResponse(input: {
  bootstrapCredential: string;
  providerAuthorizationUrl: string;
  panelBootstrapAuthority?: string;
  randomBytes(size: number): Uint8Array;
}): Response {
  if (!input || typeof input.randomBytes !== "function") invalid();
  const panelBootstrapAuthority = input.panelBootstrapAuthority ?? PANEL_BROWSER_BOOTSTRAP_URL;
  try {
    const parsed = new URL(panelBootstrapAuthority);
    if (
      parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port ||
      parsed.pathname !== "/auth/bootstrap" || parsed.search || parsed.hash ||
      `${parsed.origin}${parsed.pathname}` !== panelBootstrapAuthority
    ) invalid();
  } catch { return invalid(); }
  const provider = providerAuthorization(input.providerAuthorizationUrl);
  const bootstrapCredential = escapeAttribute(safeValue(input.bootstrapCredential));
  const providerAuthorizationUrl = escapeAttribute(provider.exact);
  const produced = input.randomBytes(24);
  if (!(produced instanceof Uint8Array) || produced.byteLength !== 24) invalid();
  const nonce = Buffer.from(new Uint8Array(produced)).toString("base64url");
  if (nonce.length !== 32 || !/^[A-Za-z0-9_-]{32}$/.test(nonce)) invalid();

  const html = "<!doctype html>" +
    "<html lang=\"tr\"><head><meta charset=\"utf-8\"><title>Güvenli yönlendirme</title></head><body>" +
    `<form method="post" action="${panelBootstrapAuthority}" enctype="application/x-www-form-urlencoded" accept-charset="UTF-8" autocomplete="off">` +
    `<input type="hidden" name="bootstrapCredential" value="${bootstrapCredential}">` +
    `<input type="hidden" name="providerAuthorizationUrl" value="${providerAuthorizationUrl}">` +
    "<noscript><button type=\"submit\">Devam et</button></noscript>" +
    "</form>" +
    `<script nonce="${nonce}">document.forms[0].submit();</script>` +
    "</body></html>";
  if (new TextEncoder().encode(html).byteLength > MAXIMUM_HTML_BYTES) invalid();

  const csp = [
    "default-src 'none'",
    "base-uri 'none'",
    `form-action ${panelBootstrapAuthority} ${provider.origin}`,
    "frame-ancestors 'none'",
    `script-src 'nonce-${nonce}'`,
    "connect-src 'none'",
    "img-src 'none'",
    "style-src 'none'",
    "object-src 'none'",
  ].join("; ");
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, max-age=0",
      pragma: "no-cache",
      expires: "0",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "cross-origin-opener-policy": "same-origin",
      "cross-origin-resource-policy": "same-origin",
      "content-security-policy": csp,
    },
  });
}
