import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { registerHooks } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

import {
  digestCanonicalPaytrConfiguration,
  digestQuickLinkToken,
  sealQuickLinkSecret,
  serializeCanonicalPaytrConfiguration,
} from "../../../packages/saas-data/src/index.ts";

const APP = new URL("../../../apps/customer-panel/", import.meta.url);
const ORIGIN = "https://panel.saas-staging.celebix.site";
const BASE = "/api/orders/quick-links";
const LINK = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NEW_LINK = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ITEM = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const VARIANT = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const PROVIDER = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const OPERATION = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const REQUEST = "99999999-9999-4999-8999-999999999999";
const STORE = "11111111-1111-4111-8111-111111111111";
const PRINCIPAL = "22222222-2222-4222-8222-222222222222";
const MEMBERSHIP = "33333333-3333-4333-8333-333333333333";
const PLAN = "44444444-4444-4444-8444-444444444444";
const NOW = new Date("2026-07-21T08:00:00.000Z");
const EXPIRES = "2026-07-22T08:00:00.000Z";
const TOKEN = Buffer.alloc(32, 0x51).toString("base64url");
const CREDENTIAL = `v1.panel.current.${Buffer.alloc(32, 0x31).toString("base64url")}`;
const keyring = Object.freeze({ activeKeyId: "quick.current", keys: Object.freeze([
  { keyId: "quick.current", key: new Uint8Array(32).fill(7) },
]) });
const paytrConfiguration = Object.freeze({
  version: 1,
  merchantId: "merchant-id",
  merchantKey: "merchant-key",
  merchantSalt: "merchant-salt",
  callbackUrl: "https://pilot.saas-staging.celebix.site/api/payments/paytr/callback",
  testMode: 1,
});
const address = Object.freeze({
  recipientName: "Ada Lovelace", phone: "+905551112233", line1: "Örnek 1", city: "İstanbul", country: "TR",
});
const createBody = Object.freeze({
  items: Object.freeze([{ variantId: VARIANT, quantity: 2 }]),
  customerName: "Ada Lovelace",
  customerEmail: "ada@example.com",
  customerPhone: "+905551112233",
  shippingAddress: address,
  billingAddress: address,
  shippingCents: 500,
  discountCents: 0,
  expiryHours: 24,
});

const DEFAULT_QUICK_LINK_MODULE = new URL("lib/quick-link-http/default.ts", APP).href;
const ROUTE_WIRING_STUB = "mock:quick-link-route-wiring";

registerHooks({
  resolve(specifier, context, nextResolve) {
    const resolved = nextResolve(specifier, context);
    return resolved.url === DEFAULT_QUICK_LINK_MODULE
      ? { shortCircuit: true, url: ROUTE_WIRING_STUB }
      : resolved;
  },
  load(url, context, nextLoad) {
    if (url !== ROUTE_WIRING_STUB) return nextLoad(url, context);
    return {
      format: "module",
      shortCircuit: true,
      source: `
        const response = (handler, request, linkId) => Response.json({
          handler,
          method: request.method,
          ...(linkId === undefined ? {} : { linkId }),
        });
        export const handleDefaultQuickLinkList = (request) => response("list", request);
        export const handleDefaultQuickLinkPaymentMethods = (request) => response("paymentMethods", request);
        export const handleDefaultQuickLinkCreate = (request) => response("create", request);
        export const handleDefaultQuickLinkActivateProvider = (request) => response("activateProvider", request);
        export const handleDefaultQuickLinkRevokeProvider = (request) => response("revokeProvider", request);
        export const handleDefaultQuickLinkGet = async (request, context) => response("get", request, (await context.params).linkId);
        export const handleDefaultQuickLinkCancel = async (request, context) => response("cancel", request, (await context.params).linkId);
        export const handleDefaultQuickLinkDuplicate = async (request, context) => response("duplicate", request, (await context.params).linkId);
        export const handleDefaultQuickLinkRevealUrl = async (request, context) => response("revealUrl", request, (await context.params).linkId);
      `,
    };
  },
});

function context(role = "store_owner") {
  return Object.freeze({
    schemaVersion: 1,
    requestId: REQUEST,
    principal: Object.freeze({ id: PRINCIPAL, issuer: "https://identity.example/oidc", subject: "subject" }),
    store: Object.freeze({ id: STORE, slug: "pilot", status: "active" }),
    membership: Object.freeze({ id: MEMBERSHIP, role, status: "active" }),
    entitlements: Object.freeze({
      schemaVersion: 1, planId: PLAN, planCode: "pilot", version: 1, status: "active",
      features: Object.freeze(["orders", "checkout"]), limits: Object.freeze({ products: 100, staff: 4, storageBytes: 1024 }),
      validFrom: "2026-01-01T00:00:00.000Z", validUntil: "2027-01-01T00:00:00.000Z",
    }),
    locale: "tr-TR",
  });
}

function listItem(extra = {}) {
  return Object.freeze({
    id: LINK, customerName: "Ada Lovelace", customerEmail: "ada@example.com", firstProductName: "Çanta",
    itemCount: 1, status: "active", currency: "TRY", totalCents: 25_500, expiresAt: EXPIRES,
    createdAt: NOW.toISOString(), version: 1, ...extra,
  });
}

function detail(extra = {}) {
  return Object.freeze({
    ...listItem(), customerPhone: "+905551112233", shippingAddress: address, billingAddress: address,
    providerKey: "paytr", subtotalCents: 25_000, shippingCents: 500, discountCents: 0,
    items: Object.freeze([{ id: ITEM, position: 0, productName: "Çanta", unitPriceCents: 12_500, quantity: 2, lineTotalCents: 25_000 }]),
    updatedAt: NOW.toISOString(), ...extra,
  });
}

function browserRequest(path, { method = "GET", body, operation = true, origin = ORIGIN, headers = {} } = {}) {
  const selected = new Headers(headers);
  selected.set("cookie", `__Host-celebix_panel=${CREDENTIAL}`);
  if (method === "POST") {
    selected.set("origin", origin);
    selected.set("content-type", "application/json");
    if (operation) selected.set("idempotency-key", OPERATION);
  }
  return new Request(`http://customer-panel:3400${path}`, {
    method,
    headers: selected,
    ...(method === "POST" ? { body: JSON.stringify(body ?? {}) } : {}),
  });
}

async function harness({ role = "store_owner", accessKind = "authenticated", runtimeEnabled = true, replay = false } = {}) {
  const { createQuickLinkHttpHandlers } = await import(new URL("lib/quick-link-http/handler.ts", APP));
  const calls = { session: 0, list: 0, methods: 0, get: 0, create: 0, cancel: 0, duplicate: 0, readiness: 0, reveal: 0, configure: 0, revoke: 0, token: 0 };
  const runtime = {
    access: {
      readiness: { mode: "approved_staging" }, panelOrigin: ORIGIN,
      async resolveCredential() { calls.session += 1; return accessKind === "authenticated" ? { kind: "authenticated", tenantContext: context(role), session: {} } : { kind: accessKind }; },
    },
    links: {
      async list() { calls.list += 1; return { items: [listItem()] }; },
      async get() { calls.get += 1; return detail(); },
      async create() { calls.create += 1; return { id: replay ? LINK : NEW_LINK, status: "active", version: 1, expiresAt: EXPIRES, updatedAt: NOW.toISOString(), replayed: replay }; },
      async cancel() { calls.cancel += 1; return { id: LINK, status: "cancelled", version: 2, expiresAt: EXPIRES, updatedAt: NOW.toISOString(), replayed: false }; },
      async duplicate() { calls.duplicate += 1; return { id: replay ? LINK : NEW_LINK, status: "active", version: 1, expiresAt: EXPIRES, updatedAt: NOW.toISOString(), replayed: replay }; },
    },
    methods: {
      async list() { calls.methods += 1; return []; },
    },
    privateLinks: {
      async getProviderReadiness() { calls.readiness += 1; return { status: "active", providerConfigId: PROVIDER, version: 1 }; },
      async configureProvider(input) { calls.configure += 1; return { status: "active", providerConfigId: input.providerConfigId, version: 1 }; },
      async revokeProvider(input) { calls.revoke += 1; return { status: "revoked", providerConfigId: input.providerConfigId, version: 2 }; },
      async revealLinkCredential(input) {
        calls.reveal += 1;
        const digest = digestQuickLinkToken(TOKEN);
        return { storeId: STORE, linkId: input.linkId, tokenDigest: digest, canonicalHostname: "pilot.saas-staging.celebix.site", expiresAt: EXPIRES,
          sealedToken: sealQuickLinkSecret({ plaintext: TOKEN, purpose: "link-token", storeId: STORE, objectId: input.linkId, digest, keyring }) };
      },
      async revealProviderConfiguration() { throw new Error("unused"); },
    },
    keyring,
    paytrConfiguration,
  };
  const ids = [NEW_LINK, ITEM, PROVIDER];
  return {
    calls,
    handlers: createQuickLinkHttpHandlers({
      async resolveRuntime() { return runtimeEnabled ? runtime : null; },
      now: () => new Date(NOW), requestId: () => REQUEST,
      generateId: () => ids.shift() ?? PROVIDER,
      generateToken: () => { calls.token += 1; return TOKEN; },
    }),
  };
}

test("1/12 exports all nine real quick-link HTTP handlers", async () => {
  const { handlers } = await harness();
  assert.deepEqual(Object.keys(handlers).sort(), [
    "activateProvider", "cancel", "create", "duplicate", "get", "list", "paymentMethods", "revealUrl", "revokeProvider",
  ]);
});

test("2/12 invokes every mounted route export and no unsupported export", async () => {
  const routes = [
    ["app/api/orders/quick-links/route.ts", { GET: ["list", BASE], POST: ["create", BASE] }],
    ["app/api/orders/quick-links/payment-methods/route.ts", { GET: ["paymentMethods", `${BASE}/payment-methods`] }],
    ["app/api/orders/quick-links/[linkId]/route.ts", { GET: ["get", `${BASE}/${LINK}`, LINK] }],
    ["app/api/orders/quick-links/[linkId]/cancel/route.ts", { POST: ["cancel", `${BASE}/${LINK}/cancel`, LINK] }],
    ["app/api/orders/quick-links/[linkId]/duplicate/route.ts", { POST: ["duplicate", `${BASE}/${LINK}/duplicate`, LINK] }],
    ["app/api/orders/quick-links/[linkId]/url/route.ts", { POST: ["revealUrl", `${BASE}/${LINK}/url`, LINK] }],
    ["app/api/orders/quick-links/provider/activate/route.ts", { POST: ["activateProvider", `${BASE}/provider/activate`] }],
    ["app/api/orders/quick-links/provider/revoke/route.ts", { POST: ["revokeProvider", `${BASE}/provider/revoke`] }],
  ];
  for (const [path, expected] of routes) {
    const route = await import(new URL(path, APP));
    assert.deepEqual(Object.keys(route).sort(), Object.keys(expected).sort());
    for (const [method, [handler, requestPath, linkId]] of Object.entries(expected)) {
      const response = await route[method](browserRequest(requestPath, { method }), {
        params: Promise.resolve({ linkId: LINK }),
      });
      assert.deepEqual(await response.json(), {
        handler,
        method,
        ...(linkId === undefined ? {} : { linkId }),
      });
    }
  }
});

test("3/12 disabled runtime is a no-cookie 503 with no mutation", async () => {
  const { handlers, calls } = await harness({ runtimeEnabled: false });
  const response = await handlers.create(browserRequest(BASE, { method: "POST", body: createBody }));
  assert.equal(response.status, 503);
  assert.equal(response.headers.has("set-cookie"), false);
  assert.equal(calls.create, 0);
});

test("4/12 exact Origin cannot be rescued by forwarded headers", async () => {
  const { handlers, calls } = await harness();
  const response = await handlers.create(browserRequest(BASE, {
    method: "POST", body: createBody, origin: "https://evil.example",
    headers: { "x-forwarded-host": new URL(ORIGIN).host, "x-forwarded-proto": "https" },
  }));
  assert.equal(response.status, 403);
  assert.equal(calls.session, 0);
  assert.equal(calls.create, 0);
});

test("5/12 every repository path follows durable session resolution", async () => {
  const { handlers, calls } = await harness({ accessKind: "unauthenticated" });
  const response = await handlers.list(browserRequest(BASE));
  assert.equal(response.status, 401);
  assert.equal(calls.session, 1);
  assert.equal(calls.list, 0);
});

test("6/12 read and manage capabilities are enforced", async () => {
  const analyst = await harness({ role: "analyst" });
  assert.equal((await analyst.handlers.list(browserRequest(BASE))).status, 200);
  assert.equal((await analyst.handlers.cancel(browserRequest(`${BASE}/${LINK}/cancel`, { method: "POST", body: { expectedVersion: 1 } }), LINK)).status, 403);
  assert.equal(analyst.calls.cancel, 0);
});

test("7/12 browser price currency provider and store fields fail before token generation", async () => {
  const { handlers, calls } = await harness();
  const response = await handlers.create(browserRequest(BASE, { method: "POST", body: { ...createBody, currency: "TRY" } }));
  assert.equal(response.status, 400);
  assert.equal(calls.token, 0);
  assert.equal(calls.readiness, 0);
  assert.equal(calls.create, 0);
});

test("8/12 create uses persisted credentials and returns one canonical TRY share URL", async () => {
  const { handlers, calls } = await harness();
  const response = await handlers.create(browserRequest(BASE, { method: "POST", body: createBody }));
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { url: `https://pilot.saas-staging.celebix.site/odeme/hizli/${TOKEN}`, expiresAt: EXPIRES });
  assert.equal(calls.token, 1);
  assert.equal(calls.reveal, 1);
});

test("9/12 create replay opens the persisted original instead of returning the candidate directly", async () => {
  const { handlers, calls } = await harness({ replay: true });
  const response = await handlers.create(browserRequest(BASE, { method: "POST", body: createBody }));
  assert.equal(response.status, 200);
  assert.match((await response.json()).url, /\/odeme\/hizli\/[A-Za-z0-9_-]{43}$/);
  assert.equal(calls.reveal, 1);
});

test("10/12 URL reveal is POST and no-store", async () => {
  const { handlers } = await harness();
  const response = await handlers.revealUrl(browserRequest(`${BASE}/${LINK}/url`, { method: "POST", operation: false }), LINK);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(Object.keys(await response.json()).sort(), ["expiresAt", "url"]);
});

test("11/12 list and detail project no token or private TenantContext fields", async () => {
  const { handlers } = await harness();
  for (const [response] of [
    [await handlers.list(browserRequest(BASE))],
    [await handlers.get(browserRequest(`${BASE}/${LINK}`), LINK)],
  ]) {
    assert.equal(response.status, 200);
    assert.doesNotMatch(JSON.stringify(await response.json()), /token|sealed|storeId|principalId|membershipId|planId/i);
  }
});

test("12/13 provider activation and revocation remain server-owned and navigation keeps the reviewed order routes exact", async () => {
  const { handlers, calls } = await harness();
  assert.equal((await handlers.activateProvider(browserRequest(`${BASE}/provider/activate`, { method: "POST" }))).status, 200);
  assert.equal((await handlers.revokeProvider(browserRequest(`${BASE}/provider/revoke`, { method: "POST" }))).status, 200);
  assert.equal(calls.configure, 1);
  assert.equal(calls.revoke, 1);
  const navigation = await import(new URL("lib/panel-ui/navigation.ts", APP));
  const orders = navigation.PANEL_NAVIGATION.find(({ key }) => key === "orders");
  assert.deepEqual(orders?.children?.map(({ label, href }) => ({ label, href })), [
    { label: "Tüm Siparişler", href: "/orders" },
    { label: "Hızlı Siparişler", href: "/orders/quick-links" },
    { label: "Terk Edilen Sepetler", href: "/orders/abandoned-carts" },
  ]);
  assert.equal(navigation.isPanelNavigationPathActive("/orders/quick-links", "/orders/quick-links"), true);
  assert.equal(navigation.isPanelNavigationPathActive("/orders/quick-links-evil", "/orders/quick-links"), false);
});

test("13/13 signed storefront authority drives token-free checkout and iframe presentation in process", async () => {
  const storefront = new URL("../../../apps/storefront-shared/", import.meta.url);
  const runtimeModule = await import(new URL("lib/checkout/runtime.ts", storefront));
  const { selectTrustedStorefrontHostAuthority } = await import(new URL("lib/trusted-host-authority.ts", storefront));
  assert.equal(typeof runtimeModule.createQuickOrderCheckoutRoute, "function");
  assert.equal(typeof runtimeModule.createQuickOrderIframeRoute, "function");

  const hostname = "pilot.saas-staging.celebix.site";
  const proxyToken = Buffer.alloc(32, 0x41).toString("base64url");
  const source = Object.freeze({
    CELEBIX_DEPLOYMENT_TIER: "staging",
    CELEBIX_STOREFRONT_PROXY_MODE: "approved_staging",
    CELEBIX_STOREFRONT_PROXY_TOKEN_B64URL: proxyToken,
  });
  const credential = `q1.${Buffer.alloc(32, 0x32).toString("base64url")}`;
  const attemptId = "88888888-8888-4888-8888-888888888888";
  const merchantOid = "abcdef0123456789abcdef0123456789";
  const providerToken = "28cc613c3d7633cfa4ed0956fdf901e05cf9d9cc0c2ef8db54fa";
  const serialized = serializeCanonicalPaytrConfiguration(paytrConfiguration);
  const configurationDigest = digestCanonicalPaytrConfiguration(serialized);
  const providerTokenDigest = createHash("sha256").update(providerToken, "utf8").digest("hex");
  const sealedConfiguration = sealQuickLinkSecret({ plaintext: serialized, purpose: "provider-config", storeId: STORE, objectId: PROVIDER, digest: configurationDigest, keyring });
  const sealedProviderToken = sealQuickLinkSecret({ plaintext: providerToken, purpose: "provider-token", storeId: STORE, objectId: attemptId, digest: providerTokenDigest, keyring });
  const calls = { begin: 0, provider: 0, presentation: 0 };
  const paymentRepository = {
    async beginAttempt() { calls.begin += 1; return { outcome: "replayed", status: "provider_ready", storeId: STORE, attemptId, merchantOid, currency: "TRY", paymentAmount: 25_500, customerEmail: "ada@example.com", customerName: "Ada Lovelace", customerPhone: "+905551112233", customerAddress: "Örnek 1 İstanbul", basket: [{ name: "Çanta", unitPriceCents: 12_500, quantity: 2 }], providerConfigId: PROVIDER, configurationDigest, configurationKeyId: sealedConfiguration.keyId, sealedConfiguration }; },
    async getPaymentPresentation() { calls.presentation += 1; return { attemptId, storeId: STORE, merchantOid, providerTokenDigest, sealedProviderToken }; },
    async markProviderReady() { throw new Error("unexpected"); }, async markInitiationUnknown() { throw new Error("unexpected"); }, async markInitiationFailed() { throw new Error("unexpected"); },
  };
  const paymentRuntime = Object.freeze({ paymentRepository, keyring });
  const authority = (headers) => selectTrustedStorefrontHostAuthority(headers, source);
  const checkout = runtimeModule.createQuickOrderCheckoutRoute({
    selectAuthority: authority, resolveRuntime: async () => paymentRuntime,
    initiate: async () => { calls.provider += 1; return { status: "unknown" }; },
    now: () => new Date("2026-07-21T12:00:00.000Z"),
  });
  const headers = {
    "x-celebix-storefront-proxy": `p1.${proxyToken}`, "x-forwarded-host": hostname,
    "x-forwarded-proto": "https", "x-forwarded-for": "8.8.8.8", origin: `https://${hostname}`,
    cookie: `__Host-celebix_quick=${credential}`, "content-type": "application/x-www-form-urlencoded",
  };
  const response = await checkout(new Request(`https://${hostname}/api/quick-order/checkout`, { method: "POST", headers, body: `operation_id=${OPERATION}` }));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "/odeme/hizli/odeme");
  assert.deepEqual(calls, { begin: 1, provider: 0, presentation: 0 });

  const forged = await checkout(new Request(`https://${hostname}/api/quick-order/checkout`, { method: "POST", headers: { ...headers, "x-celebix-storefront-proxy": `p1.${Buffer.alloc(32, 0x42).toString("base64url")}` }, body: `operation_id=${OPERATION}` }));
  assert.equal(forged.status, 404);
  assert.equal(calls.begin, 1);

  const iframe = runtimeModule.createQuickOrderIframeRoute({ selectAuthority: authority, resolveRuntime: async () => paymentRuntime, now: () => new Date("2026-07-21T12:00:00.000Z") });
  const iframeResponse = await iframe(new Request(`https://${hostname}/odeme/hizli/odeme`, { headers }));
  const html = await iframeResponse.text();
  assert.equal(iframeResponse.status, 200);
  assert.match(html, new RegExp(`https://www[.]paytr[.]com/odeme/guvenli/${providerToken}`));
  assert.equal(html.split(providerToken).length - 1, 1);
  assert.equal(calls.presentation, 1);
});

function childResult(command, arguments_, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, options);
    let output = "";
    child.stdout?.on("data", (chunk) => { output = `${output}${String(chunk)}`.slice(-20_000); });
    child.stderr?.on("data", (chunk) => { output = `${output}${String(chunk)}`.slice(-20_000); });
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal, output }));
  });
}

async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  await new Promise((resolve) => server.close(resolve));
  return address.port;
}

function rawHttp(port, target, headers) {
  return new Promise((resolve, reject) => {
    const request = httpRequest({ hostname: "127.0.0.1", port, path: target, headers }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.once("end", () => resolve({ status: response.statusCode, rawHeaders: response.rawHeaders,
        headers: response.headers, body: Buffer.concat(chunks).toString("utf8") }));
    });
    request.once("error", reject); request.end();
  });
}

test("14/14 production server emits one success-aware iframe CSP with no token serialization", { timeout: 90_000 }, async () => {
  const storefrontRoot = path.resolve(new URL("../../../apps/storefront-shared/", import.meta.url).pathname);
  const fixture = await mkdtemp(path.join(storefrontRoot, ".paytr-csp-production-"));
  const routeRoot = path.join(fixture, "app", "odeme", "hizli", "odeme");
  const proxyToken = Buffer.alloc(32, 0x41).toString("base64url");
  const providerToken = "28cc613c3d7633cfa4ed0956fdf901e05cf9d9cc0c2ef8db54fa";
  const readyCookie = "__Host-celebix_quick=ready";
  const exactCsp = "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; object-src 'none'; frame-src https://www.paytr.com";
  let server;
  try {
    await mkdir(routeRoot, { recursive: true });
    await writeFile(path.join(fixture, "package.json"), JSON.stringify({ private: true, type: "module",
      dependencies: { next: "16.2.12", react: "19.2.3", "react-dom": "19.2.3" } }), "utf8");
    await writeFile(path.join(fixture, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2022", lib: ["dom", "dom.iterable", "esnext"],
      allowJs: true, skipLibCheck: true, strict: true, noEmit: true, esModuleInterop: true, module: "esnext",
      moduleResolution: "bundler", resolveJsonModule: true, isolatedModules: true, jsx: "react-jsx",
      incremental: true, allowImportingTsExtensions: true }, include: ["**/*.ts", "**/*.tsx", ".next/types/**/*.ts"] }), "utf8");
    await writeFile(path.join(fixture, "next.config.ts"), `
      import type { NextConfig } from "next";
      const config: NextConfig={poweredByHeader:false,async headers(){return [{source:"/:path*",headers:[
        {key:"Content-Security-Policy",value:"default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; object-src 'none'"},
        {key:"Referrer-Policy",value:"no-referrer"},{key:"X-Content-Type-Options",value:"nosniff"},{key:"X-Frame-Options",value:"DENY"},
      ]}]}};
      export default config;
    `, "utf8");
    await writeFile(path.join(fixture, "app", "layout.tsx"), "export default function Layout({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html>; }\n", "utf8");
    await writeFile(path.join(routeRoot, "route.ts"), `
      const TOKEN=${JSON.stringify(providerToken)};
      export function GET(request: Request) {
        const target=new URL(request.url);
        if (target.pathname!=="/odeme/hizli/odeme" || target.search || request.headers.get("cookie")!==${JSON.stringify(readyCookie)}) return new Response("Not found",{status:404});
        return new Response('<!doctype html><html><body><iframe src="https://www.paytr.com/odeme/guvenli/'+TOKEN+'" width="100%" height="720" scrolling="yes" frameborder="0" title="PayTR güvenli ödeme"></iframe></body></html>',{headers:{"content-type":"text/html; charset=utf-8"}});
      }
    `, "utf8");
    await writeFile(path.join(fixture, "proxy.ts"), `
      import { createStorefrontProxy } from "../proxy.ts";
      import { selectTrustedStorefrontHostAuthority } from "../lib/trusted-host-authority.ts";
      const source=Object.freeze({CELEBIX_DEPLOYMENT_TIER:"staging",CELEBIX_STOREFRONT_PROXY_MODE:"approved_staging",CELEBIX_STOREFRONT_PROXY_TOKEN_B64URL:${JSON.stringify(proxyToken)}});
      export const proxy=createStorefrontProxy({
        selectAuthority:(headers)=>selectTrustedStorefrontHostAuthority(headers,source),
        resolveMediaOrigin:()=>"https://media.saas-staging.celebix.site",
        authorizePaytrIframe:async ({cookieHeader})=>cookieHeader===${JSON.stringify(readyCookie)},
        now:()=>new Date("2026-07-21T12:00:00.000Z"),
      });
      export const config={matcher:["/((?!_next/static|_next/image|favicon.ico).*)"]};
    `, "utf8");
    const nextBin = path.join(path.resolve(new URL("../../../", import.meta.url).pathname), "node_modules", "next", "dist", "bin", "next");
    const built = await childResult(process.execPath, [nextBin, "build"], { cwd: fixture, env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" }, stdio: ["ignore", "pipe", "pipe"] });
    assert.equal(built.code, 0, built.output);
    const port = await availablePort();
    server = spawn(process.execPath, [nextBin, "start", "-p", String(port)], { cwd: fixture,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" }, stdio: ["ignore", "pipe", "pipe"] });
    let serverOutput = "";
    server.stdout.on("data", (chunk) => { serverOutput = `${serverOutput}${String(chunk)}`.slice(-10_000); });
    server.stderr.on("data", (chunk) => { serverOutput = `${serverOutput}${String(chunk)}`.slice(-10_000); });
    const signed = { "x-celebix-storefront-proxy": `p1.${proxyToken}`, "x-forwarded-host": "pilot.saas-staging.celebix.site", "x-forwarded-proto": "https" };
    let ready;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try { ready = await rawHttp(port, "/odeme/hizli/odeme", { ...signed, cookie: readyCookie }); break; }
      catch { await new Promise((resolve) => setTimeout(resolve, 50)); }
    }
    assert.ok(ready, serverOutput);
    const cspHeaders = (response) => response.rawHeaders.filter((_, index) => index % 2 === 0 && response.rawHeaders[index].toLowerCase() === "content-security-policy");
    assert.equal(ready.status, 200);
    assert.equal(cspHeaders(ready).length, 1);
    assert.equal(ready.headers["content-security-policy"], exactCsp);
    assert.equal(ready.body.split(providerToken).length - 1, 1);
    assert.doesNotMatch(ready.body, /self[.]__next_f|application\/json|<script|sealed|merchant_oid/i);
    for (const [target, cookie] of [["/odeme/hizli/odeme", undefined], ["/odeme/hizli/odeme", "__Host-celebix_quick=wrong"],
      ["/odeme/hizli/odeme?x=1", readyCookie], ["/odeme/hizli/ODeme", readyCookie]]) {
      const denied = await rawHttp(port, target, { ...signed, ...(cookie ? { cookie } : {}) });
      assert.equal(cspHeaders(denied).length, 1, target);
      assert.match(denied.headers["content-security-policy"] ?? "", /form-action 'none'/, target);
      assert.doesNotMatch(denied.headers["content-security-policy"] ?? "", /frame-src https:\/\/www[.]paytr[.]com/, target);
      assert.equal(denied.body.includes(providerToken), false);
    }
  } finally {
    if (server && server.exitCode === null) {
      server.kill("SIGTERM");
      await Promise.race([new Promise((resolve) => server.once("exit", resolve)), new Promise((resolve) => setTimeout(resolve, 2_000))]);
      if (server.exitCode === null) server.kill("SIGKILL");
    }
    await rm(fixture, { recursive: true, force: true });
  }
});

function reconciliationClaim(index = 1, overrides = {}) {
  const serialized = serializeCanonicalPaytrConfiguration(paytrConfiguration);
  const configurationDigest = digestCanonicalPaytrConfiguration(serialized);
  const attemptId = `88888888-8888-4888-8888-${String(index).padStart(12, "0")}`;
  return Object.freeze({
    storeId: STORE,
    attemptId,
    merchantOid: String(index).padStart(32, "a").slice(-32),
    providerConfigId: PROVIDER,
    status: "provider_ready",
    itemCount: 3,
    expectedPaymentAmount: 25_500,
    currency: "TRY",
    configurationDigest,
    configurationKeyId: "quick.current",
    sealedConfiguration: sealQuickLinkSecret({ plaintext: serialized, purpose: "provider-config", storeId: STORE,
      objectId: PROVIDER, digest: configurationDigest, keyring }),
    leaseToken: Buffer.alloc(32, index).toString("base64url"),
    attemptNumber: index,
    ...overrides,
  });
}

function reconciliationRepository(claims, beginOutcome = "acquired") {
  const calls = [];
  const repository = {
    async beginReconciliationRun(input) { calls.push(["begin", input]); return { outcome: beginOutcome }; },
    async cleanupPreProviderAttempts(input) { calls.push(["cleanup", input]); return { releasedCount: 0 }; },
    async claimReconciliation(input) { calls.push(["claim", input]); return claims; },
    async applyReconciliationSuccess(input) { calls.push(["success", input]); return { outcome: "settled", orderNumber: input.orderNumber }; },
    async recordReconciliationUnknown(input) { calls.push(["unknown", input]); },
    async finishReconciliationRun(input) { calls.push(["finish", input]); },
  };
  return { repository, calls };
}

test("15/18 reconciliation singleton exits busy before cleanup, claim, or provider access", async () => {
  const storefront = new URL("../../../apps/storefront-shared/", import.meta.url);
  const { runQuickOrderReconciliation } = await import(new URL("lib/checkout/runtime.ts", storefront));
  assert.equal(typeof runQuickOrderReconciliation, "function");
  const fixture = reconciliationRepository([], "busy");
  let providerCalls = 0;
  const result = await runQuickOrderReconciliation({
    paymentRepository: fixture.repository, keyring,
    now: () => new Date("2026-07-21T12:00:00.000Z"), monotonicNow: () => 0,
    randomUUID: () => "77777777-7777-4777-8777-777777777777",
    randomBytes: () => new Uint8Array(32).fill(7),
    createDeadlineSignal: () => new AbortController().signal,
    queryStatus: async () => { providerCalls += 1; return { status: "unknown" }; },
  });
  assert.deepEqual(result, { status: "busy", claimed: 0, settled: 0, unknown: 0, failures: 0 });
  assert.deepEqual(fixture.calls.map(([kind]) => kind), ["begin"]);
  assert.equal(providerCalls, 0);
});

test("16/18 reconciliation uses exact leases, cleanup-first 25-claim bounds, five workers, and three-second signals", async () => {
  const storefront = new URL("../../../apps/storefront-shared/", import.meta.url);
  const { runQuickOrderReconciliation } = await import(new URL("lib/checkout/runtime.ts", storefront));
  const claims = Array.from({ length: 8 }, (_, index) => reconciliationClaim(index + 1));
  const fixture = reconciliationRepository(claims);
  let active = 0; let maximum = 0; const deadlines = [];
  const result = await runQuickOrderReconciliation({
    paymentRepository: fixture.repository, keyring,
    now: () => new Date("2026-07-21T12:00:00.000Z"), monotonicNow: () => 0,
    randomUUID: () => "77777777-7777-4777-8777-777777777777",
    randomBytes: () => new Uint8Array(32).fill(7),
    createDeadlineSignal(milliseconds) { deadlines.push(milliseconds); return new AbortController().signal; },
    async queryStatus({ merchantOid, signal }) {
      assert.ok(signal instanceof AbortSignal);
      active += 1; maximum = Math.max(maximum, active);
      await new Promise((resolve) => setImmediate(resolve));
      active -= 1;
      return merchantOid === claims[0].merchantOid
        ? { status: "success", paymentAmount: 25_500, totalAmount: 25_600, currency: "TRY", testMode: 1 }
        : { status: "unknown" };
    },
  });
  assert.deepEqual(result, { status: "completed", claimed: 8, settled: 1, unknown: 7, failures: 0 });
  assert.equal(maximum, 5);
  assert.deepEqual(deadlines, Array(8).fill(3_000));
  assert.deepEqual(fixture.calls.slice(0, 3).map(([kind]) => kind), ["begin", "cleanup", "claim"]);
  const begin = fixture.calls[0][1];
  assert.equal(begin.leaseExpiresAt.getTime() - begin.now.getTime(), 60_000);
  assert.equal(fixture.calls[2][1].limit, 25);
  assert.equal(fixture.calls[2][1].leaseExpiresAt.getTime(), begin.leaseExpiresAt.getTime());
  const successfulSettlement = fixture.calls.find(([kind]) => kind === "success")[1];
  assert.equal(successfulSettlement.orderItemIds.length, 3);
  assert.equal(new Set(successfulSettlement.orderItemIds).size, 3);
  for (const [, input] of fixture.calls.filter(([kind]) => kind === "unknown")) {
    const claim = claims.find((candidate) => candidate.merchantOid === input.merchantOid);
    assert.ok(claim);
    assert.equal(input.nextAttemptAt.getTime() - input.now.getTime(), Math.min(21_600, 30 * (2 ** (claim.attemptNumber - 1))) * 1_000);
  }
  assert.equal(fixture.calls.at(-1)[0], "finish");
});

test("17/18 forty-second issue cutoff and lease-edge claims requeue without provider I/O", async () => {
  const storefront = new URL("../../../apps/storefront-shared/", import.meta.url);
  const { runQuickOrderReconciliation } = await import(new URL("lib/checkout/runtime.ts", storefront));
  for (const scenario of [
    { elapsed: 40_000, wall: 40_000 },
    { elapsed: 39_000, wall: 51_000 },
  ]) {
    let elapsed = 0; let wall = 0; let providerCalls = 0;
    const fixture = reconciliationRepository([reconciliationClaim(1)]);
    fixture.repository.claimReconciliation = async (input) => {
      fixture.calls.push(["claim", input]); elapsed = scenario.elapsed; wall = scenario.wall; return [reconciliationClaim(1)];
    };
    const result = await runQuickOrderReconciliation({
      paymentRepository: fixture.repository, keyring,
      now: () => new Date(Date.parse("2026-07-21T12:00:00.000Z") + wall), monotonicNow: () => elapsed,
      randomUUID: () => "77777777-7777-4777-8777-777777777777",
      randomBytes: () => new Uint8Array(32).fill(7),
      createDeadlineSignal: () => new AbortController().signal,
      queryStatus: async () => { providerCalls += 1; return { status: "unknown" }; },
    });
    assert.equal(providerCalls, 0);
    assert.equal(fixture.calls.filter(([kind]) => kind === "unknown").length, 1);
    assert.equal(result.unknown, 1);
  }
});

test("18/18 slow provider response cannot mutate after the 50-second budget or lease fencing expiry", async () => {
  const storefront = new URL("../../../apps/storefront-shared/", import.meta.url);
  const { runQuickOrderReconciliation } = await import(new URL("lib/checkout/runtime.ts", storefront));
  for (const finishAt of [50_000, 60_000]) {
    let elapsed = 0; let wall = 0;
    const fixture = reconciliationRepository([reconciliationClaim(1)]);
    const result = await runQuickOrderReconciliation({
      paymentRepository: fixture.repository, keyring,
      now: () => new Date(Date.parse("2026-07-21T12:00:00.000Z") + wall), monotonicNow: () => elapsed,
      randomUUID: () => "77777777-7777-4777-8777-777777777777",
      randomBytes: () => new Uint8Array(32).fill(7),
      createDeadlineSignal: () => new AbortController().signal,
      queryStatus: async () => {
        elapsed = finishAt; wall = finishAt;
        return { status: "success", paymentAmount: 25_500, totalAmount: 25_500, currency: "TRY", testMode: 1 };
      },
    });
    assert.equal(fixture.calls.filter(([kind]) => kind === "success" || kind === "unknown").length, 0);
    assert.equal(result.settled, 0);
    assert.equal(result.unknown, 0);
  }
});
