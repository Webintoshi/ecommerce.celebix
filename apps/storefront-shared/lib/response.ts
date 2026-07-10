import type { StorefrontShellResult } from "./storefront-app.ts";

export const STOREFRONT_SECURITY_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
} as const;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderShell(result: StorefrontShellResult): string {
  const storeSlug = result.context?.store.slug;
  const eyebrow = storeSlug ? `Store: ${escapeHtml(storeSlug)}` : "Celebix shared storefront";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex,nofollow">
    <title>${escapeHtml(result.title)}</title>
    <style>
      :root { color-scheme: dark; font-family: ui-sans-serif, system-ui, sans-serif; background: #09090b; color: #fafafa; }
      body { min-height: 100vh; margin: 0; display: grid; place-items: center; }
      main { width: min(38rem, calc(100% - 3rem)); }
      p { color: #a1a1aa; line-height: 1.6; }
      .eyebrow { color: #d4d4d8; font-size: .75rem; letter-spacing: .12em; text-transform: uppercase; }
    </style>
  </head>
  <body>
    <main>
      <p class="eyebrow">${eyebrow}</p>
      <h1>${escapeHtml(result.title)}</h1>
      <p>${escapeHtml(result.message)}</p>
    </main>
  </body>
</html>`;
}

export function toStorefrontResponse(result: StorefrontShellResult): Response {
  if (result.kind === "canonical_redirect" && result.location) {
    return new Response(null, {
      status: result.status,
      headers: { ...STOREFRONT_SECURITY_HEADERS, Location: result.location },
    });
  }

  return new Response(renderShell(result), {
    status: result.status,
    headers: { ...STOREFRONT_SECURITY_HEADERS, "Content-Type": "text/html; charset=utf-8" },
  });
}
