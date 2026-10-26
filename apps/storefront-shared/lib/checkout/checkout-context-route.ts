import "server-only";
import type { HostedPaymentPresentation } from "../payment-adapters/runtime.ts";
import { renderAkbankFormPost } from "./akbank-form-post.ts";
import { checkoutContextPaymentPath, checkoutContextResultPath, parseCheckoutContextId } from "./checkout-context.ts";
import { hostedPaymentFrameSources } from "./paytr-frame-policy.ts";
import { checkoutContextFrameReturnScript } from "./checkout-return-bridge.ts";

type ContextInput = Readonly<{ hostname: string; cookieHeader: string | null; contextId: string }>;
type ContextRuntime = Readonly<{
  presentation(input: ContextInput): Promise<HostedPaymentPresentation>;
  status(input: ContextInput): Promise<unknown>;
}>;
type Authority = Readonly<{ kind: "trusted"; hostname: string }> | Readonly<{ kind: string; hostname?: never }>;
const BASE_HEADERS = Object.freeze({
  "Cache-Control": "no-store",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Referrer-Policy": "no-referrer",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "X-Robots-Tag": "noindex, nofollow",
});
const FALLBACK_CSP = "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; object-src 'none'";

function text(status: number, value: string): Response {
  return new Response(value, { status, headers: { ...BASE_HEADERS, "Content-Security-Policy": FALLBACK_CSP, "Content-Type": "text/plain; charset=utf-8" } });
}

function page(body: string, frameSources?: string, formCsp?: string, nonce?: string): Response {
  const csp = formCsp ?? (frameSources
    ? `default-src 'none'; frame-src ${frameSources};${nonce ? ` script-src 'nonce-${nonce}';` : ""} style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; object-src 'none'`
    : FALLBACK_CSP);
  return new Response(`<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Güvenli ödeme</title><style>html,body{height:100%;margin:0;background:#fff;font-family:system-ui,sans-serif}main{height:100%;display:grid;place-items:center}iframe{width:100%;height:100%;border:0}.status{color:#202124;font-size:15px}</style><main>${body}</main>`, {
    status: 200,
    headers: { ...BASE_HEADERS, ...(frameSources ? { "Referrer-Policy": "origin" } : {}), "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": csp },
  });
}

function escaped(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function createCheckoutContextPaymentRoute(dependencies: Readonly<{
  selectAuthority(headers: Headers): Authority;
  resolveRuntime(): Promise<ContextRuntime | null>;
  nonce(): string;
}>) {
  return async function GET(request: Request, context: Readonly<{ params: Promise<Readonly<{ contextId: string }>> }>): Promise<Response> {
    let target: URL;
    try { target = new URL(request.url); } catch { return text(400, "Invalid payment request"); }
    const contextId = parseCheckoutContextId((await context.params).contextId);
    const authority = dependencies.selectAuthority(request.headers);
    if (contextId === null || authority.kind !== "trusted" || request.method !== "GET"
      || target.pathname !== checkoutContextPaymentPath(contextId) || target.search || target.hash
      || target.username || target.password || (target.protocol !== "http:" && target.protocol !== "https:")) return text(404, "Not found");
    const runtime = await dependencies.resolveRuntime();
    if (runtime === null) return text(503, "Payment unavailable");
    const input = Object.freeze({ hostname: authority.hostname!, cookieHeader: request.headers.get("cookie"), contextId });
    try {
      const presentation = await runtime.presentation(input);
      if (presentation.kind === "redirect") return new Response(null, { status: 303, headers: { ...BASE_HEADERS, Location: presentation.url } });
      if (presentation.kind === "form_post") {
        const rendered = renderAkbankFormPost(presentation, dependencies.nonce(), authority.hostname!);
        return rendered === null ? text(503, "Payment unavailable") : page(rendered.body, undefined, rendered.csp);
      }
      if (presentation.kind === "iframe") {
        const frameSources = hostedPaymentFrameSources(new URL(presentation.url).origin, authority.hostname!);
        if (frameSources === null) return text(503, "Payment unavailable");
        const nonce = dependencies.nonce();
        if (!/^[A-Za-z0-9+/]{32}$/.test(nonce)) return text(503, "Payment unavailable");
        return page(`<script nonce="${nonce}">${checkoutContextFrameReturnScript(contextId)}</script><iframe id="celebix-hosted-payment" title="Güvenli ödeme" src="${escaped(presentation.url)}" allow="payment" referrerpolicy="origin"></iframe>`, frameSources, undefined, nonce);
      }
    } catch {
      try {
        await runtime.status(input);
        return new Response(null, { status: 303, headers: { ...BASE_HEADERS, Location: checkoutContextResultPath(contextId) } });
      } catch { return text(404, "Not found"); }
    }
    return text(503, "Payment unavailable");
  };
}
