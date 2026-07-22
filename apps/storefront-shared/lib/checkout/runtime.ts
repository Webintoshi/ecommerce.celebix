import { createHash, randomBytes as secureRandomBytes, randomUUID as secureRandomUUID, timingSafeEqual } from "node:crypto";
import {
  CheckoutPaymentRepositoryError,
  PostgresCheckoutPaymentRepository,
  digestCanonicalPaytrConfiguration,
  openQuickLinkSecret,
  parseCanonicalPaytrConfiguration,
  sealQuickLinkSecret,
  type CheckoutPaymentRepository,
  type ReconciliationAuthority,
  type PublicQuickOrderRepository,
  type PublicStorefrontRepository,
  type QuickLinkKeyring,
} from "@celebix/saas-data";
import pg from "pg";

import { parseCheckoutRuntimeConfig } from "./config.ts";
import { readExactPaytrCallbackRequest } from "./callback-authority.ts";
import { authenticatePaytrCallback, queryPaytrStatus, requestPaytrIframeToken,
  type PaytrIframeTokenResult } from "./paytr.ts";
import { digestRedemptionCredential, parseRedemptionCookie } from "./redemption-cookie.ts";
import { parseTrustedClientIp } from "./trusted-client-ip.ts";

export type CheckoutRuntime = Readonly<{
  storefrontRepository: PublicStorefrontRepository;
  quickOrderRepository: PublicQuickOrderRepository;
}>;

function invalid(): never {
  throw new Error("checkout_runtime_invalid");
}

function exactObject(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const selected = value as Record<string, unknown>;
  if (Object.keys(selected).length !== keys.length || keys.some((key) => !Object.hasOwn(selected, key))) invalid();
  return selected;
}

function methods(value: unknown, names: readonly string[]): void {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) invalid();
  for (const name of names) {
    let member: unknown;
    try { member = (value as Record<string, unknown>)[name]; } catch { return invalid(); }
    if (typeof member !== "function") invalid();
  }
}

export function createCheckoutRuntime(input: Readonly<{
  storefrontRepository: PublicStorefrontRepository;
  quickOrderRepository: PublicQuickOrderRepository;
}>): CheckoutRuntime {
  const parsed = exactObject(input, ["storefrontRepository", "quickOrderRepository"]);
  methods(parsed.storefrontRepository, ["getPublicStorefront", "listPublicProducts", "getPublicProductBySlug", "listPublicProductMedia"]);
  methods(parsed.quickOrderRepository, ["claimRedemption", "resolveRedemption", "getStatus", "revokeRedemption"]);
  return Object.freeze({
    storefrontRepository: parsed.storefrontRepository as PublicStorefrontRepository,
    quickOrderRepository: parsed.quickOrderRepository as PublicQuickOrderRepository,
  });
}

type PaymentRepository = Pick<CheckoutPaymentRepository,
  "beginAttempt" | "markProviderReady" | "markInitiationUnknown" | "markInitiationFailed" | "getPaymentPresentation">;

export type CheckoutPaymentInfrastructureRuntime = Readonly<{
  paymentRepository: PaymentRepository;
  keyring: QuickLinkKeyring;
}>;

type DefaultCheckoutPaymentInfrastructureRuntime = Readonly<{
  paymentRepository: CheckoutPaymentRepository;
  keyring: QuickLinkKeyring;
}>;

export type CheckoutPaymentRuntime = CheckoutPaymentInfrastructureRuntime & Readonly<{
  checkout: CheckoutRuntime;
}>;

type HostAuthority = Readonly<{ kind: "trusted"; hostname: string }> | Readonly<{ kind: string }>;
type PaymentRouteDependencies = Readonly<{
  selectAuthority: (headers: Headers) => HostAuthority;
  resolveRuntime: () => Promise<CheckoutPaymentRuntime | null>;
  now?: () => Date;
  initiate?: (input: Parameters<typeof requestPaytrIframeToken>[0]) => Promise<PaytrIframeTokenResult>;
}>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MERCHANT_OID = /^[a-f0-9]{32}$/;
const PROVIDER_TOKEN = /^[A-Za-z0-9_-]{32,256}$/;
const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const ROUTE_HEADERS = Object.freeze({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow" });

function routeText(status: number, text: string): Response {
  return new Response(text, { status, headers: { ...ROUTE_HEADERS, "Content-Type": "text/plain; charset=utf-8" } });
}

function validHostname(value: unknown): value is string {
  return typeof value === "string" && value.length <= 253 && value === value.toLowerCase() && value === value.trim() && HOSTNAME.test(value);
}

function validNow(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function fingerprint(hostname: string, redemptionDigest: string, operationId: string): string {
  return digestParts("intent", hostname, redemptionDigest, operationId);
}

function digestParts(kind: string, ...parts: readonly string[]): string {
  return createHash("sha256").update(JSON.stringify(["celebix-paytr-checkout", 1, kind, ...parts]), "utf8").digest("hex");
}

function uuidFromDigest(digest: string): string {
  const bytes = Buffer.from(digest.slice(0, 32), "hex");
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  bytes.fill(0);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function paymentSettlementIdentity(attemptId: string, itemCount: number) {
  if (!Number.isSafeInteger(itemCount) || itemCount < 1 || itemCount > 100) invalid();
  const authority = digestParts("settlement", attemptId);
  return Object.freeze({
    orderId: uuidFromDigest(digestParts("order", authority)),
    orderItemIds: Object.freeze(Array.from({ length: itemCount }, (_, index) =>
      uuidFromDigest(digestParts("order-item", authority, String(index))))),
    orderEventId: uuidFromDigest(digestParts("order-event", authority)),
    orderNumber: `QO-${authority.slice(0, 20).toUpperCase()}`,
  });
}

function phaseAuthority(kind: string, ...parts: readonly string[]) {
  const selected = digestParts(kind, ...parts);
  return Object.freeze({
    operationId: uuidFromDigest(digestParts("operation", kind, selected)),
    fingerprint: digestParts("fingerprint", kind, selected),
  });
}

function openPaytrConfiguration(authority: Readonly<{
  storeId: string; providerConfigId: string; configurationDigest: string;
  sealedConfiguration: Parameters<typeof openQuickLinkSecret>[0]["envelope"];
}>, keyring: QuickLinkKeyring) {
  const serialized = openQuickLinkSecret({ envelope: authority.sealedConfiguration, purpose: "provider-config",
    storeId: authority.storeId, objectId: authority.providerConfigId, digest: authority.configurationDigest, keyring });
  if (digestCanonicalPaytrConfiguration(serialized) !== authority.configurationDigest) invalid();
  return parseCanonicalPaytrConfiguration(serialized);
}

function intentAuthority(hostname: string, redemptionDigest: string, intentId: string) {
  const intent = fingerprint(hostname, redemptionDigest, intentId);
  const attemptId = uuidFromDigest(digestParts("attempt", intent));
  const merchantOid = digestParts("merchant-oid", intent).slice(0, 32);
  const phase = (kind: "begin_attempt" | "provider_ready" | "initiation_unknown" | "initiation_failed", payload = "") => Object.freeze({
    operationId: uuidFromDigest(digestParts("operation", kind, intent)),
    fingerprint: digestParts("fingerprint", kind, intent, attemptId, merchantOid, payload),
  });
  return Object.freeze({ attemptId, merchantOid, phase });
}

function paytrBasket(items: readonly Readonly<{ name: string; unitPriceCents: number; quantity: number }>[]): string {
  if (!Array.isArray(items) || items.length < 1 || items.length > 100) invalid();
  const selected = items.map((item) => {
    if (typeof item.name !== "string" || item.name.length < 1 || item.name.length > 200 || item.name !== item.name.trim() || /[\u0000-\u001f\u007f]/.test(item.name) ||
        !Number.isSafeInteger(item.unitPriceCents) || item.unitPriceCents < 1 || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 9_999) invalid();
    return [item.name, `${String(Math.floor(item.unitPriceCents / 100))}.${String(item.unitPriceCents % 100).padStart(2, "0")}`, item.quantity];
  });
  const encoded = Buffer.from(JSON.stringify(selected), "utf8").toString("base64");
  if (Buffer.byteLength(encoded, "ascii") > 16_384) invalid();
  return encoded;
}

async function operationId(request: Request): Promise<string | null> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null && (!/^(?:0|[1-9][0-9]{0,2})$/.test(contentLength) || Number(contentLength) > 128)) return null;
  let body: string;
  try {
    const bytes = await boundedRequestBody(request.body, 128);
    body = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (!Buffer.from(body, "utf8").equals(bytes)) return null;
  } catch { return null; }
  if (body.length < 1) return null;
  const prefix = "operation_id=";
  const selected = body.startsWith(prefix) ? body.slice(prefix.length) : "";
  return UUID.test(selected) && body === `${prefix}${selected}` ? selected : null;
}

async function boundedRequestBody(stream: ReadableStream<Uint8Array> | null, maximumBytes: number): Promise<Uint8Array> {
  if (stream === null) invalid();
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const selected = await reader.read();
      if (selected.done) break;
      if (!(selected.value instanceof Uint8Array)) invalid();
      total += selected.value.byteLength;
      if (total > maximumBytes) {
        try { await reader.cancel(); } catch { /* invalid request remains invalid */ }
        invalid();
      }
      chunks.push(selected.value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  } finally { reader.releaseLock(); }
}

function trustedRequestTarget(request: Request, hostname: string, pathname: string, method: "GET" | "POST"): URL | null {
  if (!validHostname(hostname) || request.method !== method) return null;
  let url: URL;
  try { url = new URL(request.url); } catch { return null; }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password || url.pathname !== pathname || url.search || url.hash) return null;
  if (request.headers.has("authorization") || request.headers.has("transfer-encoding")) return null;
  for (const name of request.headers.keys()) {
    const lower = name.toLowerCase();
    if (lower.startsWith("x-celebix-") && lower !== "x-celebix-storefront-proxy") return null;
  }
  return url;
}

function checkoutFailure(error: unknown): Response {
  if (error instanceof CheckoutPaymentRepositoryError && error.code === "attempt_in_progress") return routeText(409, "Checkout already in progress");
  if (error instanceof CheckoutPaymentRepositoryError && (error.code === "catalog_item_unavailable" || error.code === "stock_unavailable")) return routeText(409, "Checkout unavailable");
  return routeText(503, "Checkout unavailable");
}

async function persistedCheckoutState(runtime: CheckoutPaymentRuntime, hostname: string, redemptionDigest: string, now: Date): Promise<Response> {
  try {
    const state = await runtime.checkout.quickOrderRepository.getStatus({ hostname, redemptionDigest, now: new Date(now) });
    if (state.kind === "paid") return routeText(200, `Payment completed: ${state.orderNumber}`);
    if (state.kind === "failed") return routeText(409, "Payment failed");
    if (state.kind === "processing") return routeText(202, "Payment is processing");
    if (state.kind === "ready") return routeText(409, "Checkout already in progress");
    return routeText(503, "Checkout unavailable");
  } catch { return routeText(503, "Checkout unavailable"); }
}

export function createQuickOrderCheckoutRoute(dependencies: PaymentRouteDependencies) {
  return async (request: Request): Promise<Response> => {
    const authority = dependencies.selectAuthority(request.headers);
    if (authority.kind !== "trusted" || !("hostname" in authority) || !validHostname(authority.hostname)) return routeText(404, "Not found");
    if (trustedRequestTarget(request, authority.hostname, "/api/quick-order/checkout", "POST") === null ||
        request.headers.get("origin") !== `https://${authority.hostname}` ||
        request.headers.get("content-type") !== "application/x-www-form-urlencoded") return routeText(400, "Invalid checkout request");
    const ip = parseTrustedClientIp(request.headers.get("x-forwarded-for"));
    const cookie = parseRedemptionCookie(request.headers.get("cookie"));
    if (ip === null || cookie.kind !== "valid") return routeText(404, "Not found");
    const operation = await operationId(request);
    if (operation === null) return routeText(400, "Invalid checkout request");
    const runtime = await dependencies.resolveRuntime();
    if (runtime === null) return routeText(503, "Checkout unavailable");
    const now = (dependencies.now ?? (() => new Date()))();
    if (!validNow(now)) return routeText(503, "Checkout unavailable");
    const redemptionDigest = digestRedemptionCredential(cookie.credential);
    const intent = intentAuthority(authority.hostname, redemptionDigest, operation);
    const attemptId = intent.attemptId;
    const oid = intent.merchantOid;
    const beginAuthority = intent.phase("begin_attempt");
    if (!UUID.test(attemptId) || !MERCHANT_OID.test(oid)) return routeText(503, "Checkout unavailable");
    let begun;
    try {
      begun = await runtime.paymentRepository.beginAttempt({ hostname: authority.hostname, redemptionDigest, attemptId, merchantOid: oid,
        operationId: beginAuthority.operationId, fingerprint: beginAuthority.fingerprint, now: new Date(now) });
    } catch (error) {
      if (error instanceof CheckoutPaymentRepositoryError && (error.code === "invalid_transition" || error.code === "provider_not_ready")) {
        return persistedCheckoutState(runtime, authority.hostname, redemptionDigest, now);
      }
      return checkoutFailure(error);
    }
    if (begun.outcome !== "created" || begun.status !== "reserved") {
      if (begun.status === "provider_ready") return new Response(null, { status: 303, headers: { ...ROUTE_HEADERS, Location: "/odeme/hizli/odeme" } });
      if (begun.status === "initiation_unknown") return routeText(202, "Payment initiation is processing");
      if (begun.outcome === "replayed") {
        try {
          const presentation = await runtime.paymentRepository.getPaymentPresentation({ hostname: authority.hostname, redemptionDigest, now: new Date(now) });
          if (presentation.attemptId !== attemptId || presentation.merchantOid !== oid) return routeText(503, "Checkout unavailable");
          return new Response(null, { status: 303, headers: { ...ROUTE_HEADERS, Location: "/odeme/hizli/odeme" } });
        } catch { return persistedCheckoutState(runtime, authority.hostname, redemptionDigest, now); }
      }
      return routeText(409, "Checkout already in progress");
    }
    if (begun.attemptId !== attemptId || begun.merchantOid !== oid || begun.currency !== "TRY") return routeText(503, "Checkout unavailable");
    let selectedConfiguration;
    try {
      selectedConfiguration = openPaytrConfiguration(begun, runtime.keyring);
    } catch { return routeText(503, "Checkout unavailable"); }
    const successUrl = `https://${authority.hostname}/odeme/hizli/sonuc?durum=basarili`;
    const failureUrl = `https://${authority.hostname}/odeme/hizli/sonuc?durum=basarisiz`;
    const signal = AbortSignal.timeout(20_000);
    const initiated = await (dependencies.initiate ?? requestPaytrIframeToken)({
      configuration: selectedConfiguration, userIp: ip, merchantOid: begun.merchantOid, email: begun.customerEmail,
      paymentAmount: begun.paymentAmount, userBasket: paytrBasket(begun.basket), userName: begun.customerName,
      userAddress: begun.customerAddress, userPhone: begun.customerPhone, successUrl, failureUrl,
      noInstallment: 0, maxInstallment: 0, signal,
    });
    if (initiated.status === "rejected") {
      const failed = intent.phase("initiation_failed");
      try { await runtime.paymentRepository.markInitiationFailed({ attemptId: begun.attemptId, ...failed, now: new Date(now) }); } catch { return routeText(503, "Checkout unavailable"); }
      return routeText(502, "Payment provider rejected initiation");
    }
    if (initiated.status === "unknown") {
      const unknown = intent.phase("initiation_unknown");
      try { await runtime.paymentRepository.markInitiationUnknown({ attemptId: begun.attemptId, ...unknown, now: new Date(now) }); } catch { return routeText(503, "Checkout unavailable"); }
      return routeText(202, "Payment initiation is processing");
    }
    if (!PROVIDER_TOKEN.test(initiated.token)) return routeText(503, "Checkout unavailable");
    const providerTokenDigest = createHash("sha256").update(initiated.token, "utf8").digest("hex");
    const sealedProviderToken = sealQuickLinkSecret({ plaintext: initiated.token, purpose: "provider-token", storeId: begun.storeId, objectId: begun.attemptId, digest: providerTokenDigest, keyring: runtime.keyring });
    try {
      const readyAuthority = intent.phase("provider_ready", providerTokenDigest);
      const ready = await runtime.paymentRepository.markProviderReady({ attemptId: begun.attemptId, ...readyAuthority, providerTokenDigest, sealedProviderToken, now: new Date(now) });
      if (ready.attemptId !== begun.attemptId || ready.status !== "provider_ready" || ready.providerTokenDigest !== providerTokenDigest) {
        return routeText(503, "Checkout unavailable");
      }
      const persistedToken = openQuickLinkSecret({ envelope: ready.sealedProviderToken, purpose: "provider-token", storeId: begun.storeId, objectId: begun.attemptId, digest: providerTokenDigest, keyring: runtime.keyring });
      const expected = Buffer.from(initiated.token, "utf8");
      const persisted = Buffer.from(persistedToken, "utf8");
      const matches = expected.byteLength === persisted.byteLength && timingSafeEqual(expected, persisted);
      expected.fill(0); persisted.fill(0);
      if (!matches) return routeText(503, "Checkout unavailable");
    } catch { return routeText(503, "Checkout unavailable"); }
    return new Response(null, { status: 303, headers: { ...ROUTE_HEADERS, Location: "/odeme/hizli/odeme" } });
  };
}

export function createQuickOrderIframeRoute(dependencies: Readonly<{
  selectAuthority: (headers: Headers) => HostAuthority;
  resolveRuntime: () => Promise<CheckoutPaymentInfrastructureRuntime | null>;
  now?: () => Date;
}>) {
  return async (request: Request): Promise<Response> => {
    const authority = dependencies.selectAuthority(request.headers);
    if (authority.kind !== "trusted" || !("hostname" in authority) ||
        trustedRequestTarget(request, authority.hostname, "/odeme/hizli/odeme", "GET") === null) return routeText(404, "Not found");
    const cookie = parseRedemptionCookie(request.headers.get("cookie"));
    if (cookie.kind !== "valid") return routeText(404, "Not found");
    const runtime = await dependencies.resolveRuntime();
    if (runtime === null) return routeText(503, "Checkout unavailable");
    const now = (dependencies.now ?? (() => new Date()))();
    if (!validNow(now)) return routeText(503, "Checkout unavailable");
    try {
      const presentation = await runtime.paymentRepository.getPaymentPresentation({ hostname: authority.hostname, redemptionDigest: digestRedemptionCredential(cookie.credential), now: new Date(now) });
      const token = openQuickLinkSecret({ envelope: presentation.sealedProviderToken, purpose: "provider-token", storeId: presentation.storeId, objectId: presentation.attemptId, digest: presentation.providerTokenDigest, keyring: runtime.keyring });
      if (!PROVIDER_TOKEN.test(token) || createHash("sha256").update(token, "utf8").digest("hex") !== presentation.providerTokenDigest) return routeText(503, "Checkout unavailable");
      const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Güvenli ödeme</title></head><body><iframe src="https://www.paytr.com/odeme/guvenli/${token}" width="100%" height="720" scrolling="yes" frameborder="0" title="PayTR güvenli ödeme"></iframe></body></html>`;
      return new Response(html, { status: 200, headers: { ...ROUTE_HEADERS, "Content-Type": "text/html; charset=utf-8" } });
    } catch { return routeText(404, "Not found"); }
  };
}

type CallbackRepository = Pick<CheckoutPaymentRepository, "getCallbackAuthority" | "settleCallback">;

export function createPaytrCallbackRoute(dependencies: Readonly<{
  selectAuthority: (headers: Headers) => HostAuthority;
  resolveRuntime: () => Promise<Readonly<{ paymentRepository: CallbackRepository; keyring: QuickLinkKeyring }> | null>;
  now?: () => Date;
}>) {
  const callbackResponse = (status: number, text: "OK" | "INVALID" | "RETRY") => routeText(status, text);
  return async (request: Request): Promise<Response> => {
    const authority = dependencies.selectAuthority(request.headers);
    if (authority.kind !== "trusted" || !("hostname" in authority) || !validHostname(authority.hostname)) {
      return callbackResponse(400, "INVALID");
    }
    const externalCallbackUrl = `https://${authority.hostname}/api/payments/paytr/callback`;
    const callback = await readExactPaytrCallbackRequest({ request, trustedHostname: authority.hostname,
      configuredCallbackUrl: externalCallbackUrl });
    if (callback === null) return callbackResponse(400, "INVALID");
    const now = (dependencies.now ?? (() => new Date()))();
    if (!validNow(now)) return callbackResponse(400, "INVALID");
    const runtime = await dependencies.resolveRuntime();
    if (runtime === null) return callbackResponse(400, "INVALID");
    try {
      const selectedAuthority = await runtime.paymentRepository.getCallbackAuthority({ merchantOid: callback.merchantOid, now: new Date(now) });
      if (selectedAuthority.merchantOid !== callback.merchantOid || selectedAuthority.currency !== "TRY") return callbackResponse(400, "INVALID");
      const selectedConfiguration = openPaytrConfiguration(selectedAuthority, runtime.keyring);
      if (selectedConfiguration.callbackUrl !== externalCallbackUrl) return callbackResponse(400, "INVALID");
      const authenticated = authenticatePaytrCallback({ configuration: selectedConfiguration, form: callback.form,
        expectedPaymentAmount: selectedAuthority.expectedPaymentAmount });
      if (authenticated === null || authenticated.merchantOid !== selectedAuthority.merchantOid) return callbackResponse(400, "INVALID");
      const operation = phaseAuthority("callback", selectedAuthority.attemptId, callback.callbackDigest);
      const facts = digestParts("callback-facts", callback.callbackDigest, authenticated.status,
        String(authenticated.totalAmount), authenticated.paymentType,
        authenticated.status === "success" ? String(authenticated.paymentAmount) : authenticated.failedReasonCode,
        authenticated.status === "failed" ? authenticated.failedReasonMessageDigest : "TRY");
      const result = await runtime.paymentRepository.settleCallback(authenticated.status === "success"
        ? { ...authenticated, merchantOid: selectedAuthority.merchantOid, callbackDigest: callback.callbackDigest,
            operationId: operation.operationId, fingerprint: facts,
            ...paymentSettlementIdentity(selectedAuthority.attemptId, selectedAuthority.itemCount), now: new Date(now) }
        : { ...authenticated, merchantOid: selectedAuthority.merchantOid, callbackDigest: callback.callbackDigest,
            operationId: operation.operationId, fingerprint: facts, now: new Date(now) });
      if (result.outcome === "commit_unknown") return callbackResponse(503, "RETRY");
      return result.outcome === "settled" || result.outcome === "replayed" || result.outcome === "failed"
        ? callbackResponse(200, "OK") : callbackResponse(400, "INVALID");
    } catch { return callbackResponse(400, "INVALID"); }
  };
}

type ReconciliationRepository = Pick<CheckoutPaymentRepository,
  "beginReconciliationRun" | "cleanupPreProviderAttempts" | "claimReconciliation" |
  "applyReconciliationSuccess" | "recordReconciliationUnknown" | "finishReconciliationRun">;

export type QuickOrderReconciliationResult = Readonly<{
  status: "busy" | "completed" | "failed";
  claimed: number;
  settled: number;
  unknown: number;
  failures: number;
}>;

type ReconciliationDependencies = Readonly<{
  paymentRepository: ReconciliationRepository;
  keyring: QuickLinkKeyring;
  now?: () => Date;
  monotonicNow?: () => number;
  randomUUID?: () => string;
  randomBytes?: (size: number) => Uint8Array;
  createDeadlineSignal?: (milliseconds: number) => AbortSignal;
  queryStatus?: typeof queryPaytrStatus;
}>;

function unknownBackoff(attemptNumber: number): number {
  return Math.min(21_600, 30 * (2 ** Math.min(10, attemptNumber - 1)));
}

function safePositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

export async function runQuickOrderReconciliation(dependencies: ReconciliationDependencies): Promise<QuickOrderReconciliationResult> {
  const now = dependencies.now ?? (() => new Date());
  const monotonicNow = dependencies.monotonicNow ?? (() => performance.now());
  const startedAt = now();
  const monotonicStart = monotonicNow();
  let claimed = 0; let settled = 0; let unknown = 0; let failures = 0;
  if (!validNow(startedAt) || !Number.isFinite(monotonicStart)) return Object.freeze({ status: "failed", claimed, settled, unknown, failures: 1 });
  const workerId = (dependencies.randomUUID ?? secureRandomUUID)();
  const runTokenBytes = (dependencies.randomBytes ?? secureRandomBytes)(32);
  if (!(runTokenBytes instanceof Uint8Array) || runTokenBytes.byteLength !== 32 || !UUID.test(workerId)) {
    runTokenBytes.fill(0); return Object.freeze({ status: "failed", claimed, settled, unknown, failures: 1 });
  }
  const runToken = Buffer.from(runTokenBytes).toString("base64url");
  runTokenBytes.fill(0);
  const runTokenDigest = createHash("sha256").update(runToken, "utf8").digest("hex");
  const runLeaseExpiresAt = new Date(startedAt.getTime() + 60_000);
  let acquired = false;
  try {
    const begun = await dependencies.paymentRepository.beginReconciliationRun({ workerId, runTokenDigest,
      now: new Date(startedAt), leaseExpiresAt: new Date(runLeaseExpiresAt) });
    if (begun.outcome === "busy") return Object.freeze({ status: "busy", claimed, settled, unknown, failures });
    acquired = true;
    const cleanup = phaseAuthority("cleanup", workerId, startedAt.toISOString());
    try {
      await dependencies.paymentRepository.cleanupPreProviderAttempts({ workerId, ...cleanup, now: new Date(now()), limit: 25 });
    } catch { failures += 1; }
    let claims: readonly ReconciliationAuthority[] = [];
    if (monotonicNow() - monotonicStart < 50_000) {
      try {
        claims = await dependencies.paymentRepository.claimReconciliation({ workerId, now: new Date(now()),
          leaseExpiresAt: new Date(runLeaseExpiresAt), limit: 25 });
        claimed = claims.length;
      } catch { failures += 1; }
    }
    let cursor = 0;
    const recordUnknown = async (claim: ReconciliationAuthority, mutationNow: Date) => {
      const phase = phaseAuthority("reconcile-unknown", claim.attemptId, claim.leaseToken, String(claim.attemptNumber));
      await dependencies.paymentRepository.recordReconciliationUnknown({ merchantOid: claim.merchantOid, workerId,
        leaseToken: claim.leaseToken, ...phase, nextAttemptAt: new Date(mutationNow.getTime() + unknownBackoff(claim.attemptNumber) * 1_000),
        now: new Date(mutationNow) });
      unknown += 1;
    };
    const work = async () => {
      while (true) {
        const index = cursor; cursor += 1;
        const claim = claims[index];
        if (claim === undefined) return;
        const before = now();
        const elapsed = monotonicNow() - monotonicStart;
        const remaining = runLeaseExpiresAt.getTime() - before.getTime();
        if (!validNow(before) || !Number.isFinite(elapsed)) { failures += 1; continue; }
        if (elapsed >= 40_000 || remaining < 10_000) {
          if (elapsed < 50_000 && remaining >= 6_000) {
            try { await recordUnknown(claim, before); } catch { failures += 1; }
          }
          continue;
        }
        let providerResult: Awaited<ReturnType<typeof queryPaytrStatus>> = Object.freeze({ status: "unknown" });
        try {
          const configuration = openPaytrConfiguration(claim, dependencies.keyring);
          const signal = (dependencies.createDeadlineSignal ?? AbortSignal.timeout)(3_000);
          if (!(signal instanceof AbortSignal)) throw new TypeError("checkout_runtime_invalid");
          providerResult = await (dependencies.queryStatus ?? queryPaytrStatus)({ configuration,
            merchantOid: claim.merchantOid, signal });
        } catch { providerResult = Object.freeze({ status: "unknown" }); }
        const mutationNow = now();
        const mutationElapsed = monotonicNow() - monotonicStart;
        const mutationRemaining = runLeaseExpiresAt.getTime() - mutationNow.getTime();
        if (!validNow(mutationNow) || !Number.isFinite(mutationElapsed) || mutationElapsed >= 50_000 || mutationRemaining <= 0) continue;
        if (providerResult.status === "success" && safePositiveInteger(providerResult.paymentAmount) &&
            providerResult.paymentAmount === claim.expectedPaymentAmount && safePositiveInteger(providerResult.totalAmount) &&
            providerResult.totalAmount >= providerResult.paymentAmount && providerResult.currency === "TRY" && providerResult.testMode === 1) {
          const phase = phaseAuthority("reconcile-success", claim.attemptId, claim.leaseToken, String(claim.attemptNumber),
            String(providerResult.paymentAmount), String(providerResult.totalAmount));
          try {
            await dependencies.paymentRepository.applyReconciliationSuccess({ merchantOid: claim.merchantOid, workerId,
              leaseToken: claim.leaseToken, ...phase, paymentAmount: providerResult.paymentAmount,
              totalAmount: providerResult.totalAmount, currency: "TRY", testMode: 1,
              ...paymentSettlementIdentity(claim.attemptId, claim.itemCount), now: new Date(mutationNow) });
            settled += 1;
          } catch { failures += 1; }
        } else if (mutationRemaining >= 6_000) {
          try { await recordUnknown(claim, mutationNow); } catch { failures += 1; }
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(5, claims.length) }, () => work()));
  } catch { failures += 1; }
  finally {
    if (acquired) {
      const finishAt = now();
      if (validNow(finishAt) && finishAt.getTime() < runLeaseExpiresAt.getTime()) {
        try { await dependencies.paymentRepository.finishReconciliationRun({ workerId, runToken, now: new Date(finishAt) }); }
        catch { failures += 1; }
      }
    }
  }
  return Object.freeze({ status: failures === 0 ? "completed" : "failed", claimed, settled, unknown, failures });
}

const { Pool } = pg;
const PAYMENT_TIMEOUTS = Object.freeze({ poolCheckoutMs: 2_000, statementMs: 5_000, lockMs: 2_000, idleTransactionMs: 5_000 });
const RECONCILIATION_TIMEOUTS = Object.freeze({ poolCheckoutMs: 2_000, statementMs: 4_000, lockMs: 2_000, idleTransactionMs: 5_000 });
let defaultPaymentRuntime: Promise<DefaultCheckoutPaymentInfrastructureRuntime | null> | undefined;
let defaultReconciliationRuntime: Promise<(DefaultCheckoutPaymentInfrastructureRuntime & Readonly<{ close: () => Promise<void> }>) | null> | undefined;

function environmentKeyring(source: NodeJS.ProcessEnv): QuickLinkKeyring {
  const activeKeyId = source.CELEBIX_QUICK_ORDER_ACTIVE_KEY_ID;
  const serialized = source.CELEBIX_QUICK_ORDER_KEYS;
  if (!activeKeyId || !/^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,126}[A-Za-z0-9])?$/.test(activeKeyId) || !serialized || serialized.length > 16_384 || /\s/.test(serialized)) invalid();
  const keys: Array<Readonly<{ keyId: string; key: Uint8Array }>> = [];
  try {
    for (const segment of serialized.split(",")) {
      const separator = segment.indexOf(":");
      if (separator < 1 || separator !== segment.lastIndexOf(":")) invalid();
      const keyId = segment.slice(0, separator); const encoded = segment.slice(separator + 1);
      if (!/^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,126}[A-Za-z0-9])?$/.test(keyId) || !/^[A-Za-z0-9_-]{43}$/.test(encoded)) invalid();
      const bytes = Buffer.from(encoded, "base64url");
      try {
        if (bytes.byteLength !== 32 || bytes.toString("base64url") !== encoded) invalid();
        keys.push(Object.freeze({ keyId, key: new Uint8Array(bytes) }));
      } finally { bytes.fill(0); }
    }
    if (keys.length < 1 || keys.length > 64 || !keys.some(({ keyId }) => keyId === activeKeyId) || new Set(keys.map(({ keyId }) => keyId)).size !== keys.length) invalid();
    for (let left = 0; left < keys.length; left += 1) for (let right = left + 1; right < keys.length; right += 1) if (timingSafeEqual(keys[left]!.key, keys[right]!.key)) invalid();
    return Object.freeze({ activeKeyId, keys: Object.freeze(keys) });
  } catch (error) {
    for (const { key } of keys) key.fill(0);
    throw error;
  }
}

export async function resolveDefaultCheckoutPaymentRuntime(): Promise<DefaultCheckoutPaymentInfrastructureRuntime | null> {
  defaultPaymentRuntime ??= Promise.resolve().then(() => {
    try {
      if (process.env.CELEBIX_DEPLOYMENT_TIER !== "staging" || process.env.CELEBIX_STOREFRONT_DATA_MODE !== "approved_staging") return null;
      const config = parseCheckoutRuntimeConfig(process.env);
      const keyring = environmentKeyring(process.env);
      const pool = new Pool({ connectionString: config.database.url, max: 8, connectionTimeoutMillis: PAYMENT_TIMEOUTS.poolCheckoutMs, idleTimeoutMillis: 10_000,
        statement_timeout: PAYMENT_TIMEOUTS.statementMs, lock_timeout: PAYMENT_TIMEOUTS.lockMs, idle_in_transaction_session_timeout: PAYMENT_TIMEOUTS.idleTransactionMs,
        application_name: "celebix-storefront-checkout-staging" });
      pool.on("error", () => undefined);
      const paymentRepository = new PostgresCheckoutPaymentRepository({ pool, role: "celebix_saas_workflow", timeouts: PAYMENT_TIMEOUTS, audit: () => undefined });
      return Object.freeze({ paymentRepository, keyring });
    } catch { return null; }
  });
  return defaultPaymentRuntime;
}

export async function resolveDefaultCheckoutReconciliationRuntime(): Promise<(DefaultCheckoutPaymentInfrastructureRuntime & Readonly<{ close: () => Promise<void> }>) | null> {
  defaultReconciliationRuntime ??= Promise.resolve().then(() => {
    try {
      if (process.env.CELEBIX_DEPLOYMENT_TIER !== "staging" || process.env.CELEBIX_STOREFRONT_DATA_MODE !== "approved_staging") return null;
      const config = parseCheckoutRuntimeConfig(process.env);
      const keyring = environmentKeyring(process.env);
      const pool = new Pool({ connectionString: config.database.url, max: 6, connectionTimeoutMillis: RECONCILIATION_TIMEOUTS.poolCheckoutMs, idleTimeoutMillis: 10_000,
        statement_timeout: RECONCILIATION_TIMEOUTS.statementMs, lock_timeout: RECONCILIATION_TIMEOUTS.lockMs,
        idle_in_transaction_session_timeout: RECONCILIATION_TIMEOUTS.idleTransactionMs,
        application_name: "celebix-storefront-reconciliation-staging" });
      pool.on("error", () => undefined);
      const paymentRepository = new PostgresCheckoutPaymentRepository({ pool, role: "celebix_saas_workflow", timeouts: RECONCILIATION_TIMEOUTS, audit: () => undefined });
      return Object.freeze({ paymentRepository, keyring, close: () => pool.end() });
    } catch { return null; }
  });
  return defaultReconciliationRuntime;
}
