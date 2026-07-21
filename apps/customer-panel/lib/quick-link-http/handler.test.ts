import assert from "node:assert/strict";
import test from "node:test";

import type { TenantContext } from "@celebix/saas-contracts";
import {
  QuickOrderLinkRepositoryError,
  digestQuickLinkToken,
  openQuickLinkSecret,
  sealQuickLinkSecret,
  serializeCanonicalPaytrConfiguration,
} from "@celebix/saas-data";

import { createQuickLinkHttpHandlers } from "./handler.ts";

const ORIGIN = "https://panel.saas-staging.celebix.site";
const BASE = "/api/orders/quick-links";
const LINK_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NEW_LINK_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ITEM_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const VARIANT_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const PROVIDER_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const OPERATION_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const REVOCATION_OPERATION_ID = "77777777-7777-4777-8777-777777777777";
const REACTIVATION_OPERATION_ID = "88888888-8888-4888-8888-888888888888";
const REQUEST_ID = "99999999-9999-4999-8999-999999999999";
const STORE_ID = "11111111-1111-4111-8111-111111111111";
const PRINCIPAL_ID = "22222222-2222-4222-8222-222222222222";
const MEMBERSHIP_ID = "33333333-3333-4333-8333-333333333333";
const PLAN_ID = "44444444-4444-4444-8444-444444444444";
const NOW = new Date("2026-07-21T08:00:00.000Z");
const EXPIRES = "2026-07-22T08:00:00.000Z";
const CREDENTIAL = `v1.panel.current.${Buffer.alloc(32, 0x31).toString("base64url")}`;
const COOKIE = `__Host-celebix_panel=${CREDENTIAL}`;
const GENERATED_TOKEN = Buffer.alloc(32, 0x51).toString("base64url");
const REPLAY_TOKEN = Buffer.alloc(32, 0x61).toString("base64url");

const keyring = Object.freeze({
  activeKeyId: "quick.current",
  keys: Object.freeze([{ keyId: "quick.current", key: new Uint8Array(32).fill(7) }]),
});
const paytrConfiguration = Object.freeze({
  version: 1 as const,
  merchantId: "merchant-id",
  merchantKey: "merchant-key",
  merchantSalt: "merchant-salt",
  callbackUrl: "https://shop.saas-staging.celebix.site/api/payments/paytr/callback",
  testMode: 1 as const,
});
const address = Object.freeze({
  recipientName: "Ada Lovelace",
  phone: "+905551112233",
  line1: "Örnek Mahallesi 1",
  city: "İstanbul",
  country: "TR",
});

function tenantContext(role: TenantContext["membership"]["role"] = "store_owner"): TenantContext {
  return Object.freeze({
    schemaVersion: 1,
    requestId: REQUEST_ID,
    principal: Object.freeze({ id: PRINCIPAL_ID, issuer: "https://identity.example/oidc", subject: "subject-1" }),
    store: Object.freeze({ id: STORE_ID, slug: "pilot", status: "active" }),
    membership: Object.freeze({ id: MEMBERSHIP_ID, role, status: "active" }),
    entitlements: Object.freeze({
      schemaVersion: 1,
      planId: PLAN_ID,
      planCode: "pilot",
      version: 1,
      status: "active",
      features: Object.freeze(["orders", "checkout"]),
      limits: Object.freeze({ products: 100, staff: 4, storageBytes: 1_024 }),
      validFrom: "2026-01-01T00:00:00.000Z",
      validUntil: "2027-01-01T00:00:00.000Z",
    }),
    locale: "tr-TR",
  }) as TenantContext;
}

function listItem(overrides: Record<string, unknown> = {}) {
  return Object.freeze({
    id: LINK_ID,
    customerName: "Ada Lovelace",
    customerEmail: "ada@example.com",
    firstProductName: "Kanvas Çanta",
    itemCount: 1,
    status: "active",
    currency: "TRY",
    totalCents: 25_500,
    expiresAt: EXPIRES,
    createdAt: NOW.toISOString(),
    version: 1,
    ...overrides,
  });
}

function detail(overrides: Record<string, unknown> = {}) {
  return Object.freeze({
    ...listItem(),
    customerPhone: "+905551112233",
    shippingAddress: address,
    billingAddress: address,
    providerKey: "paytr",
    subtotalCents: 25_000,
    shippingCents: 500,
    discountCents: 0,
    items: Object.freeze([Object.freeze({
      id: ITEM_ID,
      position: 0,
      productName: "Kanvas Çanta",
      variantName: "Siyah",
      sku: "BAG-BLACK",
      unitPriceCents: 12_500,
      quantity: 2,
      lineTotalCents: 25_000,
    })]),
    updatedAt: NOW.toISOString(),
    ...overrides,
  });
}

function mutation(id = LINK_ID, replayed = false, status = "active", version = 1) {
  return Object.freeze({ id, status, version, expiresAt: EXPIRES, updatedAt: NOW.toISOString(), replayed });
}

const createBody = Object.freeze({
  items: Object.freeze([Object.freeze({ variantId: VARIANT_ID, quantity: 2 })]),
  customerName: "Ada Lovelace",
  customerEmail: "ada@example.com",
  customerPhone: "+905551112233",
  shippingAddress: address,
  billingAddress: address,
  shippingCents: 500,
  discountCents: 0,
  expiryHours: 24,
});

type Counters = Record<string, number>;

function fixture(options: {
  role?: TenantContext["membership"]["role"];
  accessKind?: "authenticated" | "unauthenticated" | "unauthorized" | "unavailable";
  runtime?: boolean;
  replay?: boolean;
  hostileList?: unknown;
  hostileGet?: unknown;
  hostileCancel?: unknown;
  credentialExpiresAt?: string;
  hostileProviderId?: string;
  repositoryError?: QuickOrderLinkRepositoryError;
  providerStatus?: "missing" | "active" | "disabled" | "revoked";
  providerLifecycle?: boolean;
  generatedIds?: string[];
} = {}) {
  const calls: Counters = {
    session: 0, list: 0, get: 0, create: 0, cancel: 0, duplicate: 0,
    readiness: 0, reveal: 0, configure: 0, revoke: 0, ids: 0, tokens: 0,
  };
  const generatedIds = [...(options.generatedIds ?? [NEW_LINK_ID, ITEM_ID, PROVIDER_ID])];
  let configuredInput: Record<string, unknown> | undefined;
  let revokedInput: Record<string, unknown> | undefined;
  let providerReadiness: Record<string, unknown> = options.providerStatus === "missing"
    ? { status: "missing" }
    : { status: options.providerStatus ?? "active", providerConfigId: PROVIDER_ID, version: options.providerStatus === "revoked" ? 2 : 1 };
  let originalConfiguration: Readonly<{ operationId: string; providerConfigId: string; result: Record<string, unknown> }> | undefined;
  const runtime = {
    access: {
      readiness: { mode: "approved_staging" },
      panelOrigin: ORIGIN,
      async resolveCredential() {
        calls.session += 1;
        const kind = options.accessKind ?? "authenticated";
        return kind === "authenticated"
          ? { kind, tenantContext: tenantContext(options.role), session: {} }
          : { kind };
      },
    },
    links: {
      async list() { calls.list += 1; if (options.repositoryError) throw options.repositoryError; return options.hostileList ?? { items: [listItem()] }; },
      async get() { calls.get += 1; if (options.repositoryError) throw options.repositoryError; return options.hostileGet ?? detail(); },
      async create(input: Record<string, unknown>) {
        calls.create += 1;
        if (options.repositoryError) throw options.repositoryError;
        assert.deepEqual((input.items as Array<Record<string, unknown>>).map(({ variantId, quantity }) => ({ variantId, quantity })), createBody.items);
        assert.equal(input.providerConfigId, PROVIDER_ID);
        if (options.providerStatus !== undefined && options.providerStatus !== "active" && options.replay !== true) {
          throw new QuickOrderLinkRepositoryError("provider_not_ready");
        }
        return options.replay ? mutation(LINK_ID, true) : mutation(NEW_LINK_ID, false);
      },
      async cancel() { calls.cancel += 1; if (options.repositoryError) throw options.repositoryError; return options.hostileCancel ?? mutation(LINK_ID, false, "cancelled", 2); },
      async duplicate() { calls.duplicate += 1; if (options.repositoryError) throw options.repositoryError; return options.replay ? mutation(LINK_ID, true) : mutation(NEW_LINK_ID, false); },
    },
    privateLinks: {
      async getProviderReadiness() {
        calls.readiness += 1;
        return providerReadiness;
      },
      async configureProvider(input: Record<string, unknown>) {
        calls.configure += 1;
        configuredInput = input;
        if (options.providerLifecycle) {
          const existingConfiguration = originalConfiguration;
          if (existingConfiguration !== undefined && existingConfiguration.operationId === input.operationId) {
            if (existingConfiguration.providerConfigId !== input.providerConfigId) {
              throw new QuickOrderLinkRepositoryError("operation_mismatch");
            }
            return existingConfiguration.result;
          }
          if (providerReadiness.status === "revoked") throw new QuickOrderLinkRepositoryError("invalid_transition");
          const result = { status: "active", providerConfigId: input.providerConfigId, version: 1 };
          originalConfiguration = {
            operationId: String(input.operationId), providerConfigId: String(input.providerConfigId), result,
          };
          providerReadiness = result;
          return result;
        }
        return { status: "active", providerConfigId: options.hostileProviderId ?? input.providerConfigId, version: 1 };
      },
      async revokeProvider(input: Record<string, unknown>) {
        calls.revoke += 1;
        revokedInput = input;
        const result = { status: "revoked", providerConfigId: input.providerConfigId, version: Number(input.expectedVersion) + 1 };
        if (options.providerLifecycle) providerReadiness = result;
        return result;
      },
      async revealLinkCredential(input: Record<string, unknown>) {
        calls.reveal += 1;
        const id = String(input.linkId);
        const token = options.replay ? REPLAY_TOKEN : GENERATED_TOKEN;
        const digest = digestQuickLinkToken(token);
        return Object.freeze({
          storeId: STORE_ID,
          linkId: id,
          tokenDigest: digest,
          sealedToken: sealQuickLinkSecret({ plaintext: token, purpose: "link-token", storeId: STORE_ID, objectId: id, digest, keyring }),
          canonicalHostname: "pilot.saas-staging.celebix.site",
          expiresAt: options.credentialExpiresAt ?? EXPIRES,
        });
      },
      async revealProviderConfiguration() { throw new Error("unused"); },
    },
    keyring,
    paytrConfiguration,
  };
  const handlers = createQuickLinkHttpHandlers({
    async resolveRuntime() { return options.runtime === false ? null : runtime as never; },
    now: () => new Date(NOW),
    requestId: () => REQUEST_ID,
    generateId() { calls.ids += 1; return generatedIds.shift() ?? PROVIDER_ID; },
    generateToken() { calls.tokens += 1; return GENERATED_TOKEN; },
  });
  return { calls, handlers, runtime, configuredInput: () => configuredInput, revokedInput: () => revokedInput };
}

function request(path: string, options: { method?: "GET" | "POST"; body?: unknown; origin?: string; operation?: boolean; operationId?: string; extraHeaders?: HeadersInit } = {}) {
  const method = options.method ?? "GET";
  const headers = new Headers(options.extraHeaders);
  headers.set("cookie", COOKIE);
  if (method === "POST") {
    headers.set("origin", options.origin ?? ORIGIN);
    headers.set("content-type", "application/json");
    if (options.operation !== false) headers.set("idempotency-key", options.operationId ?? OPERATION_ID);
  }
  return new Request(`http://customer-panel:3400${path}`, {
    method,
    headers,
    ...(method === "POST" ? { body: JSON.stringify(options.body ?? {}) } : {}),
  });
}

test("disabled runtime returns controlled 503 without session repository mutation or Set-Cookie", async () => {
  const { calls, handlers } = fixture({ runtime: false });
  const response = await handlers.create(request(BASE, { method: "POST", body: createBody }));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { code: "unavailable" });
  assert.equal(response.headers.has("set-cookie"), false);
  assert.deepEqual(calls, { session: 0, list: 0, get: 0, create: 0, cancel: 0, duplicate: 0, readiness: 0, reveal: 0, configure: 0, revoke: 0, ids: 0, tokens: 0 });
});

test("all routes authenticate the panel cookie before any repository call", async () => {
  const cases = [
    ["list", request(BASE)],
    ["get", request(`${BASE}/${LINK_ID}`), LINK_ID],
    ["create", request(BASE, { method: "POST", body: createBody })],
    ["cancel", request(`${BASE}/${LINK_ID}/cancel`, { method: "POST", body: { expectedVersion: 1 } }), LINK_ID],
    ["duplicate", request(`${BASE}/${LINK_ID}/duplicate`, { method: "POST" }), LINK_ID],
    ["revealUrl", request(`${BASE}/${LINK_ID}/url`, { method: "POST", operation: false }), LINK_ID],
    ["activateProvider", request(`${BASE}/provider/activate`, { method: "POST" })],
    ["revokeProvider", request(`${BASE}/provider/revoke`, { method: "POST" })],
  ] as const;
  for (const [name, input, id] of cases) {
    const { calls, handlers } = fixture({ accessKind: "unauthenticated" });
    const response = await (handlers[name] as (request: Request, id?: string) => Promise<Response>)(input, id);
    assert.equal(response.status, 401, name);
    assert.equal(calls.session, 1, name);
    assert.equal(Object.entries(calls).filter(([key, value]) => key !== "session" && value !== 0).length, 0, name);
  }
});

test("read roles can list and get while only owner and admin can manage or reveal", async () => {
  for (const role of ["editor", "analyst"] as const) {
    const reading = fixture({ role });
    assert.equal((await reading.handlers.list(request(BASE))).status, 200);
    assert.equal((await reading.handlers.get(request(`${BASE}/${LINK_ID}`), LINK_ID)).status, 200);
    const denied = await reading.handlers.cancel(
      request(`${BASE}/${LINK_ID}/cancel`, { method: "POST", body: { expectedVersion: 1 } }), LINK_ID,
    );
    assert.equal(denied.status, 403);
    assert.equal(reading.calls.cancel, 0);
    const reveal = await reading.handlers.revealUrl(
      request(`${BASE}/${LINK_ID}/url`, { method: "POST", operation: false }), LINK_ID,
    );
    assert.equal(reveal.status, 403);
    assert.equal(reading.calls.reveal, 0);
  }
  for (const role of ["store_owner", "admin"] as const) {
    const allowed = fixture({ role });
    assert.equal((await allowed.handlers.cancel(
      request(`${BASE}/${LINK_ID}/cancel`, { method: "POST", body: { expectedVersion: 1 } }), LINK_ID,
    )).status, 200);
  }
});

test("rejects browser authority and unsupported currency before credential generation or repository/provider access", async () => {
  for (const extra of [
    { storeId: STORE_ID }, { currency: "USD" }, { providerConfigId: PROVIDER_ID },
    { items: [{ variantId: VARIANT_ID, quantity: 2, unitPriceCents: 1 }] },
  ]) {
    const { calls, handlers } = fixture();
    const body = extra.items === undefined ? { ...createBody, ...extra } : { ...createBody, items: extra.items };
    const response = await handlers.create(request(BASE, { method: "POST", body }));
    assert.equal(response.status, 400);
    assert.equal(calls.tokens, 0);
    assert.equal(calls.ids, 0);
    assert.equal(calls.create, 0);
    assert.equal(calls.readiness, 0);
  }
  const forged = fixture();
  const response = await forged.handlers.list(request(BASE, { extraHeaders: { authorization: "Bearer unsafe", "x-forwarded-store-id": STORE_ID } }));
  assert.equal(response.status, 400);
  assert.equal(forged.calls.list, 0);
});

test("create generates each credential once and a replay reveals the original persisted token", async () => {
  const committed = fixture();
  const created = await committed.handlers.create(request(BASE, { method: "POST", body: createBody }));
  assert.equal(created.status, 201);
  assert.deepEqual(await created.json(), {
    url: `https://pilot.saas-staging.celebix.site/odeme/hizli/${GENERATED_TOKEN}`,
    expiresAt: EXPIRES,
  });
  assert.equal(committed.calls.tokens, 1);
  assert.equal(committed.calls.create, 1);
  assert.equal(committed.calls.reveal, 1);

  const replay = fixture({ replay: true });
  const replayed = await replay.handlers.create(request(BASE, { method: "POST", body: createBody }));
  assert.equal(replayed.status, 200);
  assert.deepEqual(await replayed.json(), {
    url: `https://pilot.saas-staging.celebix.site/odeme/hizli/${REPLAY_TOKEN}`,
    expiresAt: EXPIRES,
  });
  assert.equal(replay.calls.tokens, 1);
  assert.equal(replay.calls.reveal, 1);

  const microseconds = fixture({ credentialExpiresAt: "2026-07-22T08:00:00.000000Z" });
  const canonical = await microseconds.handlers.create(request(BASE, { method: "POST", body: createBody }));
  assert.equal(canonical.status, 201);
  assert.equal((await canonical.json()).expiresAt, "2026-07-22T08:00:00.000000Z");

  const duplicated = fixture();
  const duplicate = await duplicated.handlers.duplicate(
    request(`${BASE}/${LINK_ID}/duplicate`, { method: "POST" }), LINK_ID,
  );
  assert.equal(duplicate.status, 201);
  assert.equal((await duplicate.json()).url, `https://pilot.saas-staging.celebix.site/odeme/hizli/${GENERATED_TOKEN}`);
  assert.equal(duplicated.calls.tokens, 1);
  assert.equal(duplicated.calls.reveal, 1);

  const duplicateReplay = fixture({ replay: true });
  const original = await duplicateReplay.handlers.duplicate(
    request(`${BASE}/${LINK_ID}/duplicate`, { method: "POST" }), LINK_ID,
  );
  assert.equal(original.status, 200);
  assert.equal((await original.json()).url, `https://pilot.saas-staging.celebix.site/odeme/hizli/${REPLAY_TOKEN}`);
  assert.equal(duplicateReplay.calls.tokens, 1);
  assert.equal(duplicateReplay.calls.reveal, 1);
});

test("create replays the persisted original after provider disable or revocation while fresh creates stay denied", async () => {
  for (const providerStatus of ["disabled", "revoked"] as const) {
    const replay = fixture({ providerStatus, replay: true });
    const replayed = await replay.handlers.create(request(BASE, { method: "POST", body: createBody }));
    assert.equal(replayed.status, 200, providerStatus);
    assert.deepEqual(await replayed.json(), {
      url: `https://pilot.saas-staging.celebix.site/odeme/hizli/${REPLAY_TOKEN}`,
      expiresAt: EXPIRES,
    });
    assert.equal(replay.calls.create, 1, providerStatus);
    assert.equal(replay.calls.reveal, 1, providerStatus);

    const fresh = fixture({ providerStatus });
    const denied = await fresh.handlers.create(request(BASE, { method: "POST", body: createBody }));
    assert.equal(denied.status, 409, providerStatus);
    assert.deepEqual(await denied.json(), { code: "provider_not_ready" });
    assert.equal(fresh.calls.create, 1, providerStatus);
    assert.equal(fresh.calls.reveal, 0, providerStatus);
  }
});

test("URL reveal is POST no-store and list detail reject token-bearing or hostile repository projections", async () => {
  const revealed = fixture();
  const getDenied = await revealed.handlers.revealUrl(new Request(`http://internal${BASE}/${LINK_ID}/url`, {
    headers: { cookie: COOKIE },
  }), LINK_ID);
  assert.equal(getDenied.status, 405);
  const response = await revealed.handlers.revealUrl(
    request(`${BASE}/${LINK_ID}/url`, { method: "POST", operation: false }), LINK_ID,
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(JSON.stringify(await response.json()).includes(STORE_ID), false);

  for (const hostileList of [
    { items: [{ ...listItem(), tokenDigest: "a".repeat(64) }] },
    { items: new Proxy([], { ownKeys() { throw new Error("private-token-error"); } }) },
    { items: [], nextCursor: "unexpected_cursor" },
  ]) {
    const logs: unknown[] = [];
    const original = console.error;
    console.error = (...values: unknown[]) => { logs.push(values); };
    try {
      const guarded = fixture({ hostileList });
      const denied = await guarded.handlers.list(request(BASE));
      assert.equal(denied.status, 503);
      assert.deepEqual(await denied.json(), { code: "unavailable" });
      assert.deepEqual(logs, []);
    } finally { console.error = original; }
  }

  const wrongDetail = fixture({ hostileGet: detail({ id: NEW_LINK_ID }) });
  assert.equal((await wrongDetail.handlers.get(request(`${BASE}/${LINK_ID}`), LINK_ID)).status, 503);
  const wrongCancel = fixture({ hostileCancel: mutation(NEW_LINK_ID, false, "cancelled", 2) });
  assert.equal((await wrongCancel.handlers.cancel(
    request(`${BASE}/${LINK_ID}/cancel`, { method: "POST", body: { expectedVersion: 1 } }), LINK_ID,
  )).status, 503);
});

test("maps conflicts and activates or revokes PayTR only from sealed server staging configuration", async () => {
  for (const code of ["version_conflict", "invalid_transition", "operation_mismatch", "provider_not_ready"] as const) {
    const guarded = fixture({ repositoryError: new QuickOrderLinkRepositoryError(code) });
    const response = await guarded.handlers.cancel(
      request(`${BASE}/${LINK_ID}/cancel`, { method: "POST", body: { expectedVersion: 1 } }), LINK_ID,
    );
    assert.equal(response.status, 409, code);
    assert.deepEqual(await response.json(), { code });
  }

  const provider = fixture();
  const activated = await provider.handlers.activateProvider(request(`${BASE}/provider/activate`, { method: "POST" }));
  assert.equal(activated.status, 200);
  const configured = provider.configuredInput()!;
  const serialized = serializeCanonicalPaytrConfiguration(paytrConfiguration);
  assert.equal(openQuickLinkSecret({
    envelope: configured.sealedConfiguration as never,
    purpose: "provider-config",
    storeId: STORE_ID,
    objectId: String(configured.providerConfigId),
    digest: String(configured.configurationDigest),
    keyring,
  }), serialized);
  assert.equal(JSON.stringify(await activated.json()).includes("merchant"), false);

  const hostileProvider = fixture({ hostileProviderId: NEW_LINK_ID });
  assert.equal((await hostileProvider.handlers.activateProvider(
    request(`${BASE}/provider/activate`, { method: "POST" }),
  )).status, 503);

  const revoked = await provider.handlers.revokeProvider(request(`${BASE}/provider/revoke`, { method: "POST" }));
  assert.equal(revoked.status, 200);
  assert.equal(provider.calls.revoke, 1);
  assert.deepEqual(Object.keys(provider.revokedInput()!).sort(), [
    "expectedVersion", "fingerprint", "now", "operationId", "providerConfigId", "tenantContext",
  ]);
});

test("provider activation reuses revoked identity for original replay and terminally denies fresh reactivation", async () => {
  const provider = fixture({
    providerStatus: "missing",
    providerLifecycle: true,
    generatedIds: [PROVIDER_ID, NEW_LINK_ID],
  });
  const activated = await provider.handlers.activateProvider(request(`${BASE}/provider/activate`, { method: "POST" }));
  assert.equal(activated.status, 200);
  assert.deepEqual(await activated.json(), { status: "active", version: 1 });
  assert.equal(provider.configuredInput()!.providerConfigId, PROVIDER_ID);
  assert.equal(provider.configuredInput()!.expectedVersion, 0);

  const revoked = await provider.handlers.revokeProvider(request(`${BASE}/provider/revoke`, {
    method: "POST", operationId: REVOCATION_OPERATION_ID,
  }));
  assert.equal(revoked.status, 200);
  assert.deepEqual(await revoked.json(), { status: "revoked", version: 2 });

  const replayed = await provider.handlers.activateProvider(request(`${BASE}/provider/activate`, { method: "POST" }));
  assert.equal(replayed.status, 200);
  assert.deepEqual(await replayed.json(), { status: "active", version: 1 });
  assert.equal(provider.configuredInput()!.providerConfigId, PROVIDER_ID);
  assert.equal(provider.configuredInput()!.expectedVersion, 2);

  const denied = await provider.handlers.activateProvider(request(`${BASE}/provider/activate`, {
    method: "POST", operationId: REACTIVATION_OPERATION_ID,
  }));
  assert.equal(denied.status, 409);
  assert.deepEqual(await denied.json(), { code: "invalid_transition" });
  assert.equal(provider.calls.ids, 1);
});
