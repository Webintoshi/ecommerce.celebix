import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import test from "node:test";

import {
  digestQuickLinkToken,
  sealQuickLinkSecret,
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
  const calls = { session: 0, list: 0, get: 0, create: 0, cancel: 0, duplicate: 0, readiness: 0, reveal: 0, configure: 0, revoke: 0, token: 0 };
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

test("1/12 exports all eight real quick-link HTTP handlers", async () => {
  const { handlers } = await harness();
  assert.deepEqual(Object.keys(handlers).sort(), [
    "activateProvider", "cancel", "create", "duplicate", "get", "list", "revealUrl", "revokeProvider",
  ]);
});

test("2/12 invokes every mounted route export and no unsupported export", async () => {
  const routes = [
    ["app/api/orders/quick-links/route.ts", { GET: ["list", BASE], POST: ["create", BASE] }],
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

test("12/12 provider activation and revocation remain server-owned and navigation remains unchanged", async () => {
  const { handlers, calls } = await harness();
  assert.equal((await handlers.activateProvider(browserRequest(`${BASE}/provider/activate`, { method: "POST" }))).status, 200);
  assert.equal((await handlers.revokeProvider(browserRequest(`${BASE}/provider/revoke`, { method: "POST" }))).status, 200);
  assert.equal(calls.configure, 1);
  assert.equal(calls.revoke, 1);
  const navigation = await readFile(new URL("lib/panel-ui/navigation.ts", APP), "utf8");
  assert.doesNotMatch(navigation, /quick-links|quick-orders|Hızlı Sipariş/i);
});
