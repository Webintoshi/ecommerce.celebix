import "server-only";
import { timingSafeEqual } from "node:crypto";

import {
  openQuickLinkSecret,
  QuickOrderHostedPaymentRepositoryError,
  type PaymentAttemptRepository,
  type QuickLinkKeyring,
  type QuickOrderHostedPaymentAuthority,
  type QuickOrderHostedPaymentRepository,
} from "@celebix/saas-data";

import type { HostedPaymentRuntime, HostedPaymentPresentation } from "../payment-adapters/runtime.ts";
import { digestRedemptionCredential, parseRedemptionCookie } from "./redemption-cookie.ts";
import { parseTrustedClientIp } from "./trusted-client-ip.ts";

type HostAuthority = Readonly<{ kind: "trusted"; hostname: string }> | Readonly<{ kind: string }>;
export type QuickOrderHostedPaymentExecution = Readonly<{
  attempts: PaymentAttemptRepository;
  keyring: QuickLinkKeyring;
  createRuntime: (attempts: PaymentAttemptRepository) => HostedPaymentRuntime | null;
}>;
export type QuickOrderHostedPaymentBridgeRuntime = Readonly<{
  hostedPayments: QuickOrderHostedPaymentRepository;
  resolveExecution: () => Promise<QuickOrderHostedPaymentExecution | null>;
}>;
type Dependencies = Readonly<{
  selectAuthority: (headers: Headers) => HostAuthority;
  resolveRuntime: () => Promise<QuickOrderHostedPaymentBridgeRuntime | null>;
  fallback: (request: Request) => Promise<Response>;
  now?: () => Date;
}>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const BUYER_IDENTITY = /^[0-9]{5,50}$/;
const TOKEN = /^[A-Za-z0-9_-]{36,256}$/;
const HEADERS = Object.freeze({
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
});

function text(status: number, value: string): Response {
  return new Response(value, { status, headers: { ...HEADERS, "Content-Type": "text/plain; charset=utf-8" } });
}
function validHostname(value: unknown): value is string {
  return typeof value === "string" && value.length <= 253 && value === value.trim()
    && value === value.toLowerCase() && HOSTNAME.test(value);
}
function validNow(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}
function requestTarget(request: Request, hostname: string): boolean {
  if (!validHostname(hostname) || request.method !== "POST") return false;
  let url: URL;
  try { url = new URL(request.url); } catch { return false; }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password
    || url.pathname !== "/api/quick-order/checkout" || url.search || url.hash
    || request.headers.has("authorization") || request.headers.has("transfer-encoding")) return false;
  for (const name of request.headers.keys()) {
    const lower = name.toLowerCase();
    if (lower.startsWith("x-celebix-") && lower !== "x-celebix-storefront-proxy") return false;
  }
  return true;
}
async function boundedBody(stream: ReadableStream<Uint8Array> | null): Promise<Uint8Array | null> {
  if (stream === null) return null;
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      if (!(next.value instanceof Uint8Array)) return null;
      total += next.value.byteLength;
      if (total > 128) { try { await reader.cancel(); } catch { /* invalid remains invalid */ } return null; }
      chunks.push(next.value);
    }
    const bytes = new Uint8Array(total); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  } catch { return null; }
  finally { reader.releaseLock(); }
}
async function operationId(request: Request): Promise<string | null> {
  const length = request.headers.get("content-length");
  if (length !== null && (!/^(?:0|[1-9][0-9]{0,2})$/.test(length) || Number(length) > 128)) return null;
  const bytes = await boundedBody(request.body);
  if (bytes === null) return null;
  let body: string;
  try {
    body = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (!Buffer.from(body, "utf8").equals(bytes)) return null;
  } catch { return null; }
  const prefix = "operation_id=";
  const selected = body.startsWith(prefix) ? body.slice(prefix.length) : "";
  return UUID.test(selected) && body === `${prefix}${selected}` ? selected : null;
}
function identity(value: string): string | null {
  if (!BUYER_IDENTITY.test(value) || value === "12345678901") return null;
  const bytes = Buffer.from(value, "ascii");
  const repeated = Buffer.alloc(bytes.length, bytes[0]);
  try { return timingSafeEqual(bytes, repeated) ? null : value; }
  finally { bytes.fill(0); repeated.fill(0); }
}
function exactIyzicoUrl(presentation: HostedPaymentPresentation, environment: "test" | "live"): string | null {
  let selectedUrl: string;
  let selectedToken: string | null = null;
  if (presentation.kind === "redirect") selectedUrl = presentation.url;
  else if (presentation.kind === "iframe") { selectedUrl = presentation.url; selectedToken = presentation.token; }
  else return null;
  let url: URL;
  try { url = new URL(selectedUrl); } catch { return null; }
  const expectedOrigin = environment === "test" ? "https://sandbox-cpp.iyzipay.com" : "https://cpp.iyzipay.com";
  const token = url.searchParams.get("token");
  if (url.origin !== expectedOrigin || url.protocol !== "https:" || url.username || url.password || url.port
    || url.pathname !== "/" || url.hash || url.searchParams.size !== 2
    || [...url.searchParams.keys()].join(",") !== "token,lang" || url.searchParams.get("lang") !== "tr"
    || token === null || !TOKEN.test(token) || (selectedToken !== null && selectedToken !== token)
    || url.toString() !== selectedUrl) return null;
  return selectedUrl;
}
function scopedAttempts(input: Readonly<{
  base: PaymentAttemptRepository;
  hosted: QuickOrderHostedPaymentRepository;
  hostname: string;
  redemptionDigest: string;
  authority: QuickOrderHostedPaymentAuthority;
}>): PaymentAttemptRepository {
  const authority = input.authority;
  const scoped: PaymentAttemptRepository = {
    begin: async (payment) => {
      if (payment.authority.storeId !== authority.storeId || !validNow(payment.authority.now)
        || payment.operationId.length !== 36 || payment.paymentMethodId !== authority.paymentMethodId
        || payment.orderReference !== authority.orderReference || payment.amountMinor !== authority.amountMinor
        || payment.currency !== authority.currency) throw new QuickOrderHostedPaymentRepositoryError("durable_authority_invalid");
      return input.hosted.begin({ hostname: input.hostname, redemptionDigest: input.redemptionDigest,
        expectedAuthorityDigest: authority.authorityDigest, payment });
    },
    markInitialized: (value) => input.base.markInitialized(value),
    markUnknown: (value) => input.base.markUnknown(value),
    getCallbackAuthority: (value) => input.base.getCallbackAuthority(value),
    getReconciliationAuthority: (value) => input.base.getReconciliationAuthority(value),
    settleCallback: (value) => input.base.settleCallback(value),
    applyHostedCallback: (value) => input.base.applyHostedCallback(value),
    claimReconciliation: (value) => input.base.claimReconciliation(value),
    finalizeReconciliation: (value) => input.base.finalizeReconciliation(value),
  };
  return Object.freeze(scoped);
}

export function createQuickOrderHostedPaymentBridgeRoute(dependencies: Dependencies) {
  return async (request: Request): Promise<Response> => {
    const selectedHost = dependencies.selectAuthority(request.headers);
    if (selectedHost.kind !== "trusted" || !("hostname" in selectedHost) || !validHostname(selectedHost.hostname)) return text(404, "Not found");
    if (!requestTarget(request, selectedHost.hostname)
      || request.headers.get("origin") !== `https://${selectedHost.hostname}`
      || request.headers.get("content-type") !== "application/x-www-form-urlencoded") return text(400, "Invalid checkout request");
    const cookie = parseRedemptionCookie(request.headers.get("cookie"));
    const clientIp = parseTrustedClientIp(request.headers.get("x-forwarded-for"));
    if (cookie.kind !== "valid" || clientIp === null) return text(404, "Not found");
    const now = (dependencies.now ?? (() => new Date()))();
    if (!validNow(now)) return text(503, "Checkout unavailable");
    const redemptionDigest = digestRedemptionCredential(cookie.credential);
    const runtime = await dependencies.resolveRuntime();
    if (runtime === null) return dependencies.fallback(request);
    let selected;
    try {
      selected = await runtime.hostedPayments.getAuthority({
        hostname: selectedHost.hostname, redemptionDigest, now: new Date(now),
      });
    } catch (error) {
      return error instanceof QuickOrderHostedPaymentRepositoryError && error.code === "quick_link_not_found"
        ? text(404, "Not found") : text(503, "Checkout unavailable");
    }
    if (selected.kind === "legacy") return dependencies.fallback(request);
    const authority = selected.authority;
    if (authority.providerCode !== "iyzico_iframe") return text(503, "Checkout unavailable");
    const operation = await operationId(request);
    if (operation === null) return text(400, "Invalid checkout request");
    const execution = await runtime.resolveExecution();
    if (execution === null) return text(503, "Checkout unavailable");
    let buyerIdentity: string;
    try {
      const opened = openQuickLinkSecret({ envelope: authority.sealedIdentity, purpose: "buyer-identity",
        storeId: authority.storeId, objectId: authority.linkId, digest: authority.identityAuthority,
        keyring: execution.keyring });
      const parsed = identity(opened);
      if (parsed === null) return text(503, "Checkout unavailable");
      buyerIdentity = parsed;
    } catch { return text(503, "Checkout unavailable"); }
    const attempts = scopedAttempts({ base: execution.attempts, hosted: runtime.hostedPayments,
      hostname: selectedHost.hostname, redemptionDigest, authority });
    const hosted = execution.createRuntime(attempts);
    if (hosted === null) return text(503, "Checkout unavailable");
    let presentation: HostedPaymentPresentation;
    try {
      presentation = await hosted.initialize({
        headers: new Headers(request.headers), storeId: authority.storeId, operationId: operation,
        paymentMethodId: authority.paymentMethodId, orderReference: authority.orderReference,
        amountMinor: authority.amountMinor, currency: authority.currency,
        customer: Object.freeze({ name: authority.customerName, email: authority.customerEmail,
          phone: authority.customerPhone, ipAddress: clientIp, address: authority.customerAddress,
          identityNumber: buyerIdentity, city: authority.city, country: authority.country,
          ...(authority.postalCode === undefined ? {} : { postalCode: authority.postalCode }) }),
        basket: authority.basket,
      });
    } catch { return text(503, "Checkout unavailable"); }
    if (presentation.kind === "processing") return text(202, "Payment is processing");
    if (presentation.kind === "rejected") return text(503, "Checkout unavailable");
    const redirect = exactIyzicoUrl(presentation, authority.environment);
    return redirect === null
      ? text(503, "Checkout unavailable")
      : new Response(null, { status: 303, headers: { ...HEADERS, Location: redirect } });
  };
}
