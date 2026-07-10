import assert from "node:assert/strict";
import test from "node:test";

import { isPlanFeatureEnabled, type PlanEntitlements, type ResolvedStoreHost } from "@celebix/saas-contracts";

type RuntimeModule = typeof import("./index.ts");

const runtime = await import("./index.ts").catch(() => ({} as Partial<RuntimeModule>));

const activeHost: ResolvedStoreHost = {
  schemaVersion: 1,
  hostname: "shop.example.test",
  domainId: "domain_shop",
  domainType: "platform_subdomain",
  storeId: "store_shop",
  storeSlug: "shop",
  canonicalHostname: "shop.example.test",
  status: "active",
  cacheVersion: 3,
};

const entitlements: PlanEntitlements = {
  schemaVersion: 1,
  planId: "plan_free",
  planCode: "free_starter",
  version: 2,
  status: "active",
  features: ["catalog"],
  limits: {
    products: 100,
    staff: 1,
    storageBytes: 1_000_000,
  },
  validFrom: "2026-07-10T00:00:00.000Z",
};

function requireRuntime(): RuntimeModule {
  assert.equal(typeof runtime.normalizeStoreHostname, "function");
  return runtime as RuntimeModule;
}

function errorCode(result: unknown): string | undefined {
  return result && typeof result === "object" && "code" in result
    ? String(result.code)
    : undefined;
}

test("exports the strict hostname normalizer", () => {
  assert.equal(typeof runtime.normalizeStoreHostname, "function");
});

test("normalizes hostnames to lowercase", () => {
  assert.equal(requireRuntime().normalizeStoreHostname("SHOP.Example.TEST").hostname, "shop.example.test");
});

test("trims surrounding spaces and removes one numeric port", () => {
  assert.equal(requireRuntime().normalizeStoreHostname("  shop.example.test:443  ").hostname, "shop.example.test");
});

test("removes a trailing DNS root dot", () => {
  assert.equal(requireRuntime().normalizeStoreHostname("shop.example.test.").hostname, "shop.example.test");
});

test("normalizes an internationalized hostname through IDNA ASCII", () => {
  assert.equal(requireRuntime().normalizeStoreHostname("BÜCHER.example").hostname, "xn--bcher-kva.example");
});

for (const [label, value] of [
  ["schemes", "https://shop.example.test"],
  ["paths", "shop.example.test/catalog"],
  ["queries", "shop.example.test?store=other"],
  ["fragments", "shop.example.test#other"],
  ["userinfo", "user@shop.example.test"],
  ["comma-separated hosts", "shop.example.test,evil.example.test"],
  ["control characters", "shop.example.test\n"],
  ["internal whitespace", "shop .example.test"],
  ["leading-hyphen labels", "-shop.example.test"],
  ["trailing-hyphen labels", "shop-.example.test"],
  ["overlong labels", `${"a".repeat(64)}.example.test`],
  ["invalid numeric ports", "shop.example.test:70000"],
] as const) {
  test(`rejects ${label}`, () => {
    assert.throws(() => requireRuntime().normalizeStoreHostname(value));
  });
}

test("rejects localhost and IP hosts unless explicit local-test mode is enabled", () => {
  const api = requireRuntime();
  assert.throws(() => api.normalizeStoreHostname("localhost:3000"));
  assert.throws(() => api.normalizeStoreHostname("127.0.0.1:3000"));
  assert.equal(api.normalizeStoreHostname("localhost:3000", { allowLocalTestHosts: true }).hostname, "localhost");
  assert.equal(api.normalizeStoreHostname("[::1]:3000", { allowLocalTestHosts: true }).hostname, "::1");
});

test("rejects malformed IPv6 even in local-test mode", () => {
  assert.throws(() => requireRuntime().normalizeStoreHostname("[::not-an-ip]:3000", { allowLocalTestHosts: true }));
});

test("unknown exact hostname returns host_not_found", async () => {
  const api = requireRuntime();
  const resolver = new api.InMemoryStoreDomainResolver([{ host: activeHost, storeStatus: "active" }]);
  const result = await resolver.resolveExactHostname("missing.example.test");
  assert.equal(errorCode(result), "host_not_found");
});

test("pending custom domain returns host_unverified", async () => {
  const api = requireRuntime();
  const resolver = new api.InMemoryStoreDomainResolver([
    {
      host: { ...activeHost, hostname: "custom.example.test", domainType: "custom", status: "pending_verification" },
      storeStatus: "active",
    },
  ]);
  const result = await resolver.resolveExactHostname("custom.example.test");
  assert.equal(errorCode(result), "host_unverified");
});

test("disabled host fails closed", async () => {
  const api = requireRuntime();
  const resolver = new api.InMemoryStoreDomainResolver([
    { host: { ...activeHost, status: "disabled" }, storeStatus: "active" },
  ]);
  const result = await resolver.resolveExactHostname(activeHost.hostname);
  assert.equal(errorCode(result), "store_inactive");
});

test("duplicate exact records return ambiguous_host", async () => {
  const api = requireRuntime();
  const resolver = new api.InMemoryStoreDomainResolver([
    { host: activeHost, storeStatus: "active" },
    { host: { ...activeHost, domainId: "domain_duplicate" }, storeStatus: "active" },
  ]);
  const result = await resolver.resolveExactHostname(activeHost.hostname);
  assert.equal(errorCode(result), "ambiguous_host");
});

test("one active exact hostname resolves exactly one persisted record", async () => {
  const api = requireRuntime();
  const resolver = new api.InMemoryStoreDomainResolver([{ host: activeHost, storeStatus: "active" }]);
  assert.deepEqual(await resolver.resolveExactHostname(activeHost.hostname), activeHost);
});

test("suffix similarity never resolves another store", async () => {
  const api = requireRuntime();
  const resolver = new api.InMemoryStoreDomainResolver([{ host: activeHost, storeStatus: "active" }]);
  const result = await resolver.resolveExactHostname(`evil.${activeHost.hostname}`);
  assert.equal(errorCode(result), "host_not_found");
});

test("an inactive store record returns store_inactive", async () => {
  const api = requireRuntime();
  const resolver = new api.InMemoryStoreDomainResolver([{ host: activeHost, storeStatus: "suspended" }]);
  const result = await resolver.resolveExactHostname(activeHost.hostname);
  assert.equal(errorCode(result), "store_inactive");
});

test("exact resolver never falls back to a default tenant", async () => {
  const api = requireRuntime();
  const resolver = new api.InMemoryStoreDomainResolver([{ host: activeHost, storeStatus: "active" }]);
  const result = await resolver.resolveExactHostname("totally-unrelated.example.test");
  assert.notEqual(result, activeHost);
  assert.equal(errorCode(result), "host_not_found");
});

function createContextInput(overrides: Record<string, unknown> = {}) {
  const api = requireRuntime();
  return {
    requestId: "request_1",
    trustedHost: activeHost.hostname,
    resolver: new api.InMemoryStoreDomainResolver([{ host: activeHost, storeStatus: "active" }]),
    loadStorefrontStore: async () => ({
      id: "store_shop",
      slug: "shop",
      status: "active" as const,
      locale: "tr-TR",
      currency: "TRY",
      themeKey: "starter",
      entitlements,
    }),
    ...overrides,
  };
}

test("creates a server-produced public storefront context without principal or membership", async () => {
  const api = requireRuntime();
  const result = await api.resolveStorefrontRequestContext(createContextInput());
  assert.equal(errorCode(result), undefined);
  assert.deepEqual(result, {
    schemaVersion: 1,
    requestId: "request_1",
    resolvedHost: activeHost,
    store: {
      id: "store_shop",
      slug: "shop",
      status: "active",
      locale: "tr-TR",
      currency: "TRY",
      themeKey: "starter",
    },
    entitlements,
    canonicalOrigin: "https://shop.example.test",
    namespaceVersion: 3,
  });
  assert.equal("principal" in result, false);
  assert.equal("membership" in result, false);
});

test("host and store ID mismatch rejects public context", async () => {
  const api = requireRuntime();
  const result = await api.resolveStorefrontRequestContext(
    createContextInput({
      loadStorefrontStore: async () => ({
        id: "store_other",
        slug: "other",
        status: "active",
        locale: "tr-TR",
        currency: "TRY",
        themeKey: "starter",
        entitlements,
      }),
    }),
  );
  assert.equal(errorCode(result), "host_store_mismatch");
});

test("resolver output hostname must equal the normalized requested hostname", async () => {
  const api = requireRuntime();
  let storeLoaderCalled = false;
  const result = await api.resolveStorefrontRequestContext({
    requestId: "request_adversarial_resolver",
    trustedHost: "attacker.example.test",
    resolver: {
      resolveExactHostname: async () => activeHost,
    },
    loadStorefrontStore: async () => {
      storeLoaderCalled = true;
      return {
        id: "store_shop",
        slug: "shop",
        status: "active",
        locale: "tr-TR",
        currency: "TRY",
        themeKey: "starter",
        entitlements,
      };
    },
  });

  assert.equal(errorCode(result), "host_store_mismatch");
  assert.equal(storeLoaderCalled, false);
});

test("resolver canonical hostname must already satisfy the normalized persisted-host contract", async () => {
  const api = requireRuntime();
  let storeLoaderCalled = false;
  const result = await api.resolveStorefrontRequestContext({
    requestId: "request_bad_canonical",
    trustedHost: activeHost.hostname,
    resolver: {
      resolveExactHostname: async () => ({ ...activeHost, canonicalHostname: "SHOP.Example.TEST" }),
    },
    loadStorefrontStore: async () => {
      storeLoaderCalled = true;
      return null;
    },
  });

  assert.equal(errorCode(result), "invalid_input");
  assert.equal(storeLoaderCalled, false);
});

test("inactive store rejects public context", async () => {
  const api = requireRuntime();
  const result = await api.resolveStorefrontRequestContext(
    createContextInput({
      loadStorefrontStore: async () => ({
        id: "store_shop",
        slug: "shop",
        status: "suspended",
        locale: "tr-TR",
        currency: "TRY",
        themeKey: "starter",
        entitlements,
      }),
    }),
  );
  assert.equal(errorCode(result), "store_inactive");
});

test("invalid host never receives a public context", async () => {
  const result = await requireRuntime().resolveStorefrontRequestContext(
    createContextInput({ trustedHost: "https://shop.example.test" }),
  );
  assert.equal(errorCode(result), "invalid_input");
});

test("unknown injected entitlement features remain disabled", async () => {
  const unsafeEntitlements = {
    ...entitlements,
    features: ["catalog", "unknown-feature"],
  } as unknown as PlanEntitlements;
  const result = await requireRuntime().resolveStorefrontRequestContext(
    createContextInput({
      loadStorefrontStore: async () => ({
        id: "store_shop",
        slug: "shop",
        status: "active",
        locale: "tr-TR",
        currency: "TRY",
        themeKey: "starter",
        entitlements: unsafeEntitlements,
      }),
    }),
  );
  assert.equal(errorCode(result), undefined);
  if (!(result instanceof requireRuntime().StorefrontResolutionError)) {
    assert.equal(isPlanFeatureEnabled(result.entitlements, "unknown-feature"), false);
  }
});

test("canonical URL uses only the persisted canonical hostname", () => {
  const aliasHost = {
    ...activeHost,
    hostname: "alias.example.test",
    domainType: "custom" as const,
  };
  assert.equal(
    requireRuntime().buildCanonicalStorefrontUrl(aliasHost, "/catalog/item"),
    "https://shop.example.test/catalog/item",
  );
});

test("alias redirect input cannot become an open redirect", () => {
  const api = requireRuntime();
  assert.throws(() => api.buildCanonicalStorefrontUrl(activeHost, "//evil.example.test/steal"));
  assert.throws(() => api.buildCanonicalStorefrontUrl(activeHost, "https://evil.example.test/steal"));
  assert.throws(() => api.buildCanonicalStorefrontUrl(activeHost, "/callback?token=secret"));
});

test("canonical helper permits HTTP only for an explicit loopback local test", () => {
  const localHost = {
    ...activeHost,
    hostname: "localhost",
    canonicalHostname: "localhost",
  };
  assert.throws(() => requireRuntime().buildCanonicalStorefrontUrl(localHost, "/"));
  assert.equal(
    requireRuntime().buildCanonicalStorefrontUrl(localHost, "/", { allowLocalTestHosts: true }),
    "http://localhost/",
  );
});

test("object keys are store-prefixed and immutable across stores", () => {
  const api = requireRuntime();
  const first = api.buildStoreObjectKey("store_one", "media", "01j2asset/image.webp");
  const second = api.buildStoreObjectKey("store_two", "media", "01j2asset/image.webp");
  assert.equal(first, "stores/store_one/media/01j2asset/image.webp");
  assert.equal(second, "stores/store_two/media/01j2asset/image.webp");
  assert.notEqual(first, second);
});

for (const unsafeObjectName of [
  "../other-store/secret",
  "/leading/asset.webp",
  "folder\\asset.webp",
  "stores/store_other/media/asset.webp",
  "folder/%2e%2e/asset.webp",
] as const) {
  test(`object key rejects traversal or prefix injection: ${unsafeObjectName}`, () => {
    assert.throws(() => requireRuntime().buildStoreObjectKey("store_one", "media", unsafeObjectName));
  });
}

test("cache keys differ between stores for the same resource", () => {
  const api = requireRuntime();
  assert.notEqual(
    api.buildStoreCacheKey("store_one", "catalog", "product_1", 4),
    api.buildStoreCacheKey("store_two", "catalog", "product_1", 4),
  );
  assert.equal(
    api.buildStoreCacheKey("store_one", "catalog", "product_1", 4),
    "celebix:store_one:catalog:product_1:v4",
  );
});

test("cache tags differ between stores for the same resource", () => {
  const api = requireRuntime();
  assert.notEqual(
    api.buildStoreCacheTag("store_one", "products", 4),
    api.buildStoreCacheTag("store_two", "products", 4),
  );
  assert.equal(api.buildStoreCacheTag("store_one", "products", 4), "store:store_one:products:4");
});

test("job keys differ between stores for the same idempotency input", () => {
  const api = requireRuntime();
  assert.notEqual(
    api.buildStoreJobKey("store_one", "catalog_sync", "opaque_1"),
    api.buildStoreJobKey("store_two", "catalog_sync", "opaque_1"),
  );
  assert.equal(api.buildStoreJobKey("store_one", "catalog_sync", "opaque_1"), "store:store_one:job:catalog_sync:opaque_1");
});

test("store namespaces reject non-normalized and injectable store IDs", () => {
  const api = requireRuntime();
  for (const storeId of ["Store_One", " store_one", "store:other", "../store_other", "stores/store_other"]) {
    assert.throws(() => api.assertStoreNamespace(storeId));
  }
});
