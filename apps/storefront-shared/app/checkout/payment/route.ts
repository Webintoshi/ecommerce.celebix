import { resolveDefaultPublicStorefrontRuntime } from "@/lib/default-runtime.ts";
import { selectTrustedStorefrontHostAuthority } from "@/lib/trusted-host-authority.ts";

const BASE_HEADERS = Object.freeze({
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "X-Robots-Tag": "noindex, nofollow",
});

const PAYMENT_FRAME_HEADERS = Object.freeze({
  ...BASE_HEADERS,
  "Referrer-Policy": "origin",
});

function text(status: number, value: string): Response {
  return new Response(value, { status, headers: { ...BASE_HEADERS, "Content-Type": "text/plain; charset=utf-8" } });
}

function page(body: string, status = 200, frameOrigin?: string): Response {
  const csp = frameOrigin
    ? `default-src 'none'; frame-src ${frameOrigin}; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; object-src 'none'`
    : "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; object-src 'none'";
  const headers = frameOrigin ? PAYMENT_FRAME_HEADERS : BASE_HEADERS;
  return new Response(`<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Güvenli ödeme</title><style>html,body{height:100%;margin:0;background:#fff;font-family:system-ui,sans-serif}main{height:100%;display:grid;place-items:center}iframe{width:100%;height:100%;border:0}.status{color:#202124;font-size:15px}</style><main>${body}</main>`, {
    status,
    headers: { ...headers, "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": csp },
  });
}

function escaped(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export async function GET(request: Request): Promise<Response> {
  let target: URL;
  try { target = new URL(request.url); } catch { return text(400, "Invalid payment request"); }
  const authority = selectTrustedStorefrontHostAuthority(request.headers);
  if (authority.kind !== "trusted" || request.method !== "GET" || target.pathname !== "/checkout/payment"
    || target.search || target.hash || target.username || target.password
    || (target.protocol !== "http:" && target.protocol !== "https:")) return text(404, "Not found");
  const runtime = (await resolveDefaultPublicStorefrontRuntime())?.hostedCheckout ?? null;
  if (runtime === null) return text(503, "Payment unavailable");
  const input = Object.freeze({ hostname: authority.hostname, cookieHeader: request.headers.get("cookie") });
  try {
    const presentation = await runtime.presentation(input);
    if (presentation.kind === "redirect") {
      return new Response(null, { status: 303, headers: { ...BASE_HEADERS, Location: presentation.url } });
    }
    if (presentation.kind === "iframe") {
      const origin = new URL(presentation.url).origin;
      return page(`<iframe title="Güvenli ödeme" src="${escaped(presentation.url)}" allow="payment" referrerpolicy="origin"></iframe>`, 200, origin);
    }
  } catch {
    try {
      const status = await runtime.status(input);
      if (status.status === "captured") return new Response(null, { status: 303, headers: { ...BASE_HEADERS, Location: "/checkout/payment/result" } });
      if (status.status === "failed" || status.status === "cancelled" || status.status === "expired" || status.status === "stock_conflict") {
        return new Response(null, { status: 303, headers: { ...BASE_HEADERS, Location: "/checkout/payment/result" } });
      }
      return page('<p class="status">Ödeme sağlayıcısı hazırlanıyor…</p><meta http-equiv="refresh" content="2">', 202);
    } catch { return text(404, "Not found"); }
  }
  return text(503, "Payment unavailable");
}
