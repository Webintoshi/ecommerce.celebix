import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  InMemoryStoreDomainResolver,
  type StorefrontStoreRecord,
} from "@celebix/saas-storefront-runtime";
import type { ResolvedStoreHost } from "@celebix/saas-contracts";

type AppModule = typeof import("./storefront-app.ts");

const app = await import("./storefront-app.ts").catch(() => ({} as Partial<AppModule>));

const activeHost: ResolvedStoreHost = {
  schemaVersion: 1,
  hostname: "shop.example.test",
  domainId: "domain_shop",
  domainType: "platform_subdomain",
  storeId: "store_shop",
  storeSlug: "shop",
  canonicalHostname: "shop.example.test",
  status: "active",
  cacheVersion: 2,
};

const store: StorefrontStoreRecord = {
  id: "store_shop",
  slug: "shop",
  status: "active",
  locale: "tr-TR",
  currency: "TRY",
  themeKey: "starter",
  entitlements: {
    schemaVersion: 1,
    planId: "plan_free",
    planCode: "free_starter",
    version: 1,
    status: "active",
    features: ["catalog"],
    limits: { products: 100, staff: 1, storageBytes: 1_000_000 },
    validFrom: "2026-07-10T00:00:00.000Z",
  },
};

function requireApp(): AppModule {
  assert.equal(typeof app.createStorefrontRequestHandler, "function");
  return app as AppModule;
}

function requestHeaders(host: string | null, forwardedHost = "attacker.example.test") {
  const values = new Map<string, string>();
  if (host) values.set("host", host);
  values.set("x-forwarded-host", forwardedHost);
  return { get: (name: string) => values.get(name.toLowerCase()) ?? null };
}

function dependencies(host = activeHost, currentStore: StorefrontStoreRecord | null = store) {
  return {
    resolver: new InMemoryStoreDomainResolver([{ host, storeStatus: currentStore?.status ?? "failed" }]),
    loadStorefrontStore: async () => currentStore,
  };
}

test("exports the fail-closed request handler factory", () => {
  assert.equal(typeof app.createStorefrontRequestHandler, "function");
});

test("trusted host adapter reads Host and never X-Forwarded-Host", () => {
  const headers = requestHeaders("shop.example.test", "other-store.example.test");
  assert.equal(requireApp().selectTrustedHostHeader(headers), "shop.example.test");
});

test("default app without a resolver returns controlled 503", async () => {
  const handle = requireApp().createStorefrontRequestHandler();
  const result = await handle({
    headers: requestHeaders("shop.example.test"),
    pathname: "/",
    requestId: "request_default",
  });
  assert.deepEqual(result, {
    kind: "host_not_configured",
    status: 503,
    title: "Storefront unavailable",
    message: "This shared storefront runtime is not configured.",
  });
});

test("unknown host returns the fail-closed unknown-host shell", async () => {
  const result = await requireApp().createStorefrontRequestHandler(dependencies())({
    headers: requestHeaders("unknown.example.test"),
    pathname: "/",
    requestId: "request_unknown",
  });
  assert.equal(result.kind, "unknown_host");
  assert.equal(result.status, 404);
  assert.equal("context" in result, false);
});

test("unverified custom domain returns the inactive-host shell", async () => {
  const result = await requireApp().createStorefrontRequestHandler(
    dependencies({ ...activeHost, domainType: "custom", status: "pending_verification" }),
  )({
    headers: requestHeaders(activeHost.hostname),
    pathname: "/",
    requestId: "request_pending",
  });
  assert.equal(result.kind, "inactive_host");
  assert.equal(result.status, 503);
});

test("ambiguous exact hostname fails closed without a tenant context", async () => {
  const resolver = new InMemoryStoreDomainResolver([
    { host: activeHost, storeStatus: "active" },
    { host: { ...activeHost, domainId: "domain_duplicate" }, storeStatus: "active" },
  ]);
  const result = await requireApp().createStorefrontRequestHandler({
    resolver,
    loadStorefrontStore: async () => store,
  })({
    headers: requestHeaders(activeHost.hostname),
    pathname: "/",
    requestId: "request_ambiguous",
  });
  assert.equal(result.kind, "ambiguous_host");
  assert.equal(result.status, 503);
  assert.equal("context" in result, false);
});

test("active exact host returns only the placeholder storefront shell", async () => {
  const result = await requireApp().createStorefrontRequestHandler(dependencies())({
    headers: requestHeaders(activeHost.hostname),
    pathname: "/products",
    requestId: "request_active",
  });
  assert.equal(result.kind, "active_placeholder");
  assert.equal(result.status, 200);
  assert.equal(result.context?.store.id, "store_shop");
  assert.equal(result.context?.store.slug, "shop");
});

test("active alias redirects to persisted canonical authority", async () => {
  const aliasHost = { ...activeHost, hostname: "alias.example.test", domainType: "custom" as const };
  const result = await requireApp().createStorefrontRequestHandler(dependencies(aliasHost))({
    headers: requestHeaders(aliasHost.hostname),
    pathname: "/products/item",
    requestId: "request_alias",
  });
  assert.equal(result.kind, "canonical_redirect");
  assert.equal(result.status, 308);
  assert.equal(result.location, "https://shop.example.test/products/item");
});

test("health response is safe and carries no tenant data", () => {
  assert.deepEqual(requireApp().createHealthPayload(), {
    status: "ok",
    service: "storefront-shared",
  });
});

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute);
    return /\.(?:ts|tsx|json)$/.test(entry.name) && !entry.name.endsWith(".test.ts") ? [absolute] : [];
  }));
  return nested.flat();
}

test("shared storefront imports no service-role, database, R2, Redis, or payment clients", async () => {
  const appRoot = path.resolve(import.meta.dirname, "..");
  const runtimeRoot = path.resolve(appRoot, "../../packages/saas-storefront-runtime");
  const files = [...await sourceFiles(appRoot), ...await sourceFiles(runtimeRoot)];
  const forbiddenImport = /(?:from\s+|import\s*\()["'][^"']*(?:supabase|postgres|drizzle|@aws-sdk|redis|stripe|iyzipay|craftgate|payment)[^"']*["']/i;
  const forbiddenConfig = /(?:service[_-]?role|DATABASE_URL|R2_ACCESS|REDIS_URL|PAYMENT_SECRET)/i;

  for (const file of files) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, forbiddenImport, file);
    assert.doesNotMatch(source, forbiddenConfig, file);
  }
});

test("application configuration defines baseline security headers", async () => {
  const config = await readFile(new URL("../next.config.ts", import.meta.url), "utf8");
  for (const header of ["Content-Security-Policy", "X-Content-Type-Options", "Referrer-Policy", "X-Frame-Options"]) {
    assert.match(config, new RegExp(header));
  }
});
