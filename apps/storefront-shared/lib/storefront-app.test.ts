import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

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

function requestHeaders(forwardedHost: string | null, rawHost = "storefront.internal:3450") {
  const values = new Map<string, string>();
  values.set("host", rawHost);
  if (forwardedHost) values.set("x-forwarded-host", forwardedHost);
  return { get: (name: string) => values.get(name.toLowerCase()) ?? null };
}

function testAuthority(headers: { get(name: string): string | null }) {
  const hostname = headers.get("x-forwarded-host");
  return hostname
    ? ({ kind: "trusted", hostname } as const)
    : ({ kind: "invalid_forwarded_host" } as const);
}

function dependencies(
  host = activeHost,
  currentStore: StorefrontStoreRecord | null = store,
  canonicalHosts: readonly ResolvedStoreHost[] = [],
) {
  return {
    trustedHostAuthority: testAuthority,
    resolver: new InMemoryStoreDomainResolver([
      { host, storeStatus: currentStore?.status ?? "failed" },
      ...canonicalHosts.map((canonicalHost) => ({
        host: canonicalHost,
        storeStatus: currentStore?.status ?? "failed",
      })),
    ]),
    loadStorefrontStore: async () => currentStore,
  };
}

test("exports the fail-closed request handler factory", () => {
  assert.equal(typeof app.createStorefrontRequestHandler, "function");
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
    trustedHostAuthority: testAuthority,
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
  const result = await requireApp().createStorefrontRequestHandler(dependencies(aliasHost, store, [activeHost]))({
    headers: requestHeaders(aliasHost.hostname),
    pathname: "/products/item",
    requestId: "request_alias",
  });
  assert.equal(result.kind, "canonical_redirect");
  assert.equal(result.status, 308);
  assert.equal(result.location, "https://shop.example.test/products/item");
});

test("store loader cannot mutate a verified alias into another redirect authority", async () => {
  const aliasHost = { ...activeHost, hostname: "alias.example.test", domainType: "custom" as const };
  const resolver = new InMemoryStoreDomainResolver([
    { host: aliasHost, storeStatus: "active" },
    { host: activeHost, storeStatus: "active" },
  ]);
  const result = await requireApp().createStorefrontRequestHandler({
    trustedHostAuthority: testAuthority,
    resolver,
    loadStorefrontStore: async (_storeId, resolvedHost) => {
      resolvedHost.canonicalHostname = "evil.example.test";
      return store;
    },
  })({
    headers: requestHeaders(aliasHost.hostname),
    pathname: "/products/item",
    requestId: "request_alias_mutation",
  });

  assert.equal(result.kind, "canonical_redirect");
  assert.equal(result.status, 308);
  assert.equal(result.location, "https://shop.example.test/products/item");
});

test("invalid proxy authority invokes neither resolver nor store loader", async () => {
  let resolverCalls = 0;
  let loaderCalls = 0;
  const result = await requireApp().createStorefrontRequestHandler({
    trustedHostAuthority: () => ({ kind: "invalid_proxy_authority" }),
    resolver: {
      async resolveExactHostname() {
        resolverCalls += 1;
        return activeHost;
      },
    },
    loadStorefrontStore: async () => {
      loaderCalls += 1;
      return store;
    },
  })({
    headers: requestHeaders("shop.example.test", "shop.example.test"),
    pathname: "/",
    requestId: "request_invalid_proxy",
  });

  assert.equal(result.kind, "host_not_configured");
  assert.equal(result.status, 503);
  assert.equal(resolverCalls, 0);
  assert.equal(loaderCalls, 0);
});

test("valid proxy authority invokes resolver exactly once with only the selected hostname", async () => {
  const received: string[] = [];
  const result = await requireApp().createStorefrontRequestHandler({
    trustedHostAuthority: () => ({ kind: "trusted", hostname: activeHost.hostname }),
    resolver: {
      async resolveExactHostname(hostname) {
        received.push(hostname);
        return activeHost;
      },
    },
    loadStorefrontStore: async () => store,
  })({
    headers: requestHeaders(activeHost.hostname, "attacker.internal"),
    pathname: "/",
    requestId: "request_trusted_proxy",
  });

  assert.equal(result.kind, "active_placeholder");
  assert.deepEqual(received, [activeHost.hostname]);
});

test("unknown authenticated hostname reaches exact resolver and raw Host cannot select a default tenant", async () => {
  const received: string[] = [];
  const result = await requireApp().createStorefrontRequestHandler({
    trustedHostAuthority: () => ({ kind: "trusted", hostname: "unknown.example.test" }),
    resolver: {
      async resolveExactHostname(hostname) {
        received.push(hostname);
        return new (await import("@celebix/saas-storefront-runtime")).StorefrontResolutionError("host_not_found");
      },
    },
    loadStorefrontStore: async () => store,
  })({
    headers: requestHeaders("unknown.example.test", activeHost.hostname),
    pathname: "/",
    requestId: "request_unknown_proxy",
  });

  assert.equal(result.kind, "unknown_host");
  assert.equal(result.status, 404);
  assert.deepEqual(received, ["unknown.example.test"]);
});

test("alias with a missing canonical exact record fails closed without Location", async () => {
  const aliasHost = { ...activeHost, hostname: "alias.example.test", domainType: "custom" as const };
  const result = await requireApp().createStorefrontRequestHandler(dependencies(aliasHost))({
    headers: requestHeaders(aliasHost.hostname),
    pathname: "/products/item",
    requestId: "request_missing_canonical",
  });

  assert.equal(result.kind, "inactive_host");
  assert.equal(result.status, 503);
  assert.equal(result.location, undefined);
  assert.equal(result.context, undefined);
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
    if (entry.isDirectory() && (entry.name === ".next" || entry.name === "node_modules" || entry.name.startsWith(".paytr-csp-production-"))) {
      return [];
    }
    if (entry.isDirectory()) return sourceFiles(absolute);
    return /\.(?:ts|tsx|json)$/.test(entry.name) && !entry.name.endsWith(".test.ts") ? [absolute] : [];
  }));
  return nested.flat();
}

type ImportEdge = Readonly<{
  source: string;
  specifier: string;
  kind: "side-effect" | "from" | "dynamic";
}>;

function importEdges(source: string, sourceName: string): ImportEdge[] {
  const syntax = ts.createSourceFile(sourceName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edges: ImportEdge[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      edges.push({
        source: sourceName,
        specifier: node.moduleSpecifier.text,
        kind: node.importClause === undefined ? "side-effect" : "from",
      });
    } else if (
      ts.isCallExpression(node)
      && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments.length === 1
      && ts.isStringLiteral(node.arguments[0]!)
    ) {
      edges.push({ source: sourceName, specifier: node.arguments[0].text, kind: "dynamic" });
    }
    ts.forEachChild(node, visit);
  };
  visit(syntax);
  return edges;
}

function edgeKey(edge: ImportEdge): string {
  return `${edge.source}\u0000${edge.specifier}\u0000${edge.kind}`;
}

test("shared storefront uses only the reviewed public PostgreSQL repository and no private service clients", async () => {
  const appRoot = path.resolve(import.meta.dirname, "..");
  const runtimeRoot = path.resolve(appRoot, "../../packages/saas-storefront-runtime");
  const files = [...await sourceFiles(appRoot), ...await sourceFiles(runtimeRoot)];
  const forbiddenImport = /(?:from\s+|import\s*\()["'][^"']*(?:supabase|drizzle|@aws-sdk|redis|stripe|iyzipay|craftgate)[^"']*["']/i;
  const reviewedPaymentEdges = new Set([
    "app/api/payments/[providerCode]/callback/[binding]/route.ts\u0000@/lib/payment-adapters/runtime.ts\u0000from",
    "lib/default-runtime.ts\u0000./payment-adapters/runtime.ts\u0000from",
    "lib/default-runtime.ts\u0000@celebix/payment-adapters\u0000from",
    "lib/payment-adapters/runtime.ts\u0000@celebix/payment-adapters\u0000from",
  ]);
  const forbiddenConfig = /(?:service[_-]?role|R2_ACCESS|R2_SECRET|REDIS_URL|PAYMENT_SECRET|celebix_saas_app)/i;
  const actualPaymentEdges: ImportEdge[] = [];

  for (const file of files) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, forbiddenImport, file);
    const sourceName = file.startsWith(appRoot)
      ? path.relative(appRoot, file).split(path.sep).join("/")
      : `../../packages/saas-storefront-runtime/${path.relative(runtimeRoot, file).split(path.sep).join("/")}`;
    for (const edge of importEdges(source, sourceName)) {
      if (!/payment/i.test(edge.specifier)) continue;
      actualPaymentEdges.push(edge);
      assert.equal(reviewedPaymentEdges.has(edgeKey(edge)), true, edgeKey(edge));
    }
    assert.doesNotMatch(source, forbiddenConfig, file);
  }
  assert.deepEqual(
    actualPaymentEdges.map(edgeKey).sort(),
    [...reviewedPaymentEdges].sort(),
  );

  for (const edge of [
    importEdges('import { createHostedPaymentRuntime } from "@/lib/payment-adapters/runtime.ts";', "lib/unreviewed.ts")[0]!,
    importEdges('import "evil-payment-sdk";', "lib/unreviewed.ts")[0]!,
    importEdges('void import("@celebix/payment-adapters");', "lib/unreviewed.ts")[0]!,
  ]) {
    assert.throws(
      () => assert.equal(reviewedPaymentEdges.has(edgeKey(edge)), true, edgeKey(edge)),
      assert.AssertionError,
    );
  }

  for (const relative of [
    "lib/payment-adapters/runtime.ts",
    "lib/payment-adapters/callback-authority.ts",
  ]) {
    const source = await readFile(path.join(appRoot, relative), "utf8");
    assert.match(source, /^import "server-only";/, relative);
  }
  const publicRuntime = await readFile(new URL("./default-runtime.ts", import.meta.url), "utf8");
  assert.match(publicRuntime, /PostgresPublicStorefrontRepository/);
  assert.match(publicRuntime, /celebix_saas_host_resolver/);
  assert.doesNotMatch(publicRuntime, /ProductMediaRepository|INSERT|UPDATE|DELETE/);
});

test("application configuration defines baseline security headers", async () => {
  const config = await readFile(new URL("../next.config.ts", import.meta.url), "utf8");
  for (const header of ["Content-Security-Policy", "X-Content-Type-Options", "Referrer-Policy", "X-Frame-Options"]) {
    assert.match(config, new RegExp(header));
  }
  const claimRoute = await readFile(new URL("../app/odeme/hizli/[token]/route.ts", import.meta.url), "utf8");
  const quotePage = await readFile(new URL("../app/odeme/hizli/page.tsx", import.meta.url), "utf8");
  const statusRoute = await readFile(new URL("../app/api/quick-order/status/route.ts", import.meta.url), "utf8");
  const routeAdapter = await readFile(new URL("./checkout/public-quick-link.ts", import.meta.url), "utf8");
  for (const source of [claimRoute, statusRoute, routeAdapter]) {
    assert.doesNotMatch(source, /console[.]|JSON[.]stringify\([^)]*(?:token|cookie|credential)/i);
  }
  assert.match(routeAdapter, /no-store/);
  assert.match(routeAdapter, /no-referrer/);
  assert.match(quotePage, /index: false, follow: false/);
  assert.match(quotePage, /referrer: "no-referrer"/);
  assert.match(quotePage, /force-dynamic/);
  assert.doesNotMatch(quotePage, /tokenDigest|redemptionDigest|customerEmail|customerPhone|shippingAddress|billingAddress/);
});

test("checkout quote page uses one native exact-origin form and no client token transport", async () => {
  const quotePage = await readFile(new URL("../app/odeme/hizli/page.tsx", import.meta.url), "utf8");
  const checkoutRoute = await readFile(new URL("../app/api/quick-order/checkout/route.ts", import.meta.url), "utf8");
  assert.match(quotePage, /randomUUID/);
  assert.match(quotePage, /<form[^>]+method="post"[^>]+action="\/api\/quick-order\/checkout"/);
  assert.match(quotePage, /type="hidden" name="operation_id" value=/);
  assert.doesNotMatch(quotePage, /fetch\(|XMLHttpRequest|use client|content-security-policy|http-equiv/i);
  assert.match(checkoutRoute, /createQuickOrderCheckoutRoute/);
  assert.doesNotMatch(checkoutRoute, /merchantKey|merchantSalt|console[.]/);
});

test("iframe and return routes are token-free browser surfaces and return is not settlement", async () => {
  const iframeRoute = await readFile(new URL("../app/odeme/hizli/odeme/route.ts", import.meta.url), "utf8");
  const resultPage = await readFile(new URL("../app/odeme/hizli/sonuc/page.tsx", import.meta.url), "utf8");
  assert.match(iframeRoute, /createQuickOrderIframeRoute/);
  assert.doesNotMatch(iframeRoute, /searchParams|token|paytr[.]com|NextResponse[.]redirect|Response[.]json/);
  assert.match(resultPage, /api\/quick-order\/status|Ödeme sonucu|durum/i);
  assert.doesNotMatch(resultPage, /settle|markProvider|payment_amount|merchant_oid|token/i);
});

test("proxy owns exact checkout form and PayTR iframe CSP while every near-match stays denied", async () => {
  const proxy = await readFile(new URL("../proxy.ts", import.meta.url), "utf8");
  assert.match(proxy, /form-action https:\/\/\$\{authority[.]hostname\}/);
  assert.match(proxy, /frame-src https:\/\/www[.]paytr[.]com/);
  assert.match(proxy, /pathname === "\/odeme\/hizli"/);
  assert.match(proxy, /pathname === "\/odeme\/hizli\/odeme"/);
  assert.match(proxy, /search === ""/);
  assert.match(proxy, /FALLBACK_CSP/);
  assert.doesNotMatch(proxy, /form-action 'self'|form-action https:(?:[;'\s])|form-action \*|frame-src \*/);
});

test("exact signed PayTR callback bypasses presentation dependencies while near matches remain unavailable", async () => {
  type Factory = (dependencies: Readonly<{
    selectAuthority: (headers: Headers) => Readonly<{ kind: string; hostname?: string }>;
    resolveMediaOrigin: () => string;
    authorizePaytrIframe: () => Promise<boolean>;
    now: () => Date;
  }>) => (request: import("next/server.js").NextRequest) => Promise<import("next/server.js").NextResponse>;
  const { createStorefrontProxy } = await import("../proxy.ts") as unknown as { createStorefrontProxy: Factory };
  const { NextRequest } = await import("next/server.js");
  let mediaCalls = 0;
  const handler = createStorefrontProxy({
    selectAuthority: (headers) => headers.get("x-auth") === "ok"
      ? { kind: "trusted", hostname: "pilot.saas-staging.celebix.site" }
      : { kind: "invalid" },
    resolveMediaOrigin() { mediaCalls += 1; throw new Error("presentation unavailable"); },
    authorizePaytrIframe: async () => false,
    now: () => new Date("2026-07-21T12:00:00.000Z"),
  });
  const exact = await handler(new NextRequest("https://internal.example/api/payments/paytr/callback", {
    method: "POST", headers: { "x-auth": "ok" },
  }));
  assert.equal(exact.status, 200);
  assert.equal(exact.headers.get("x-middleware-next"), "1");
  assert.match(exact.headers.get("content-security-policy") ?? "", /default-src 'none'/);
  assert.equal(mediaCalls, 0);
  for (const request of [
    new NextRequest("https://internal.example/api/payments/paytr/callback?x=1", { method: "POST", headers: { "x-auth": "ok" } }),
    new NextRequest("https://internal.example/api/payments/paytr/callback/", { method: "POST", headers: { "x-auth": "ok" } }),
    new NextRequest("https://internal.example/api/payments/paytr/callback", { method: "GET", headers: { "x-auth": "ok" } }),
    new NextRequest("https://internal.example/api/payments/paytr/callback", { method: "POST" }),
  ]) assert.equal((await handler(request)).status, 503);
});

test("callback route is one server-owned plain response adapter with no browser or secret authority", async () => {
  const route = await readFile(new URL("../app/api/payments/paytr/callback/route.ts", import.meta.url), "utf8");
  assert.match(route, /createPaytrCallbackRoute/);
  assert.match(route, /selectTrustedStorefrontHostAuthority/);
  assert.match(route, /resolveDefaultCheckoutPaymentRuntime/);
  assert.doesNotMatch(route, /GET|Origin|cookie|merchantKey|merchantSalt|Response[.]json|console[.]/i);
});

test("proxy grants PayTR frame authority only after cookie-bound provider-ready preflight", async () => {
  type Factory = (dependencies: Readonly<{
    selectAuthority: (headers: Headers) => Readonly<{ kind: "trusted"; hostname: string }>;
    resolveMediaOrigin: () => string;
    authorizePaytrIframe: (input: Readonly<{ hostname: string; cookieHeader: string | null; now: Date }>) => Promise<boolean>;
    now: () => Date;
  }>) => (request: import("next/server.js").NextRequest) => Promise<import("next/server.js").NextResponse>;
  const proxyModule = await import("../proxy.ts") as unknown as { createStorefrontProxy?: Factory };
  assert.equal(typeof proxyModule.createStorefrontProxy, "function");
  const calls: Array<Readonly<{ hostname: string; cookieHeader: string | null }>> = [];
  const handler = proxyModule.createStorefrontProxy!({
    selectAuthority: () => ({ kind: "trusted", hostname: "pilot.saas-staging.celebix.site" }),
    resolveMediaOrigin: () => "https://media.saas-staging.celebix.site",
    authorizePaytrIframe: async ({ hostname, cookieHeader }) => {
      calls.push({ hostname, cookieHeader });
      return cookieHeader === "__Host-celebix_quick=ready";
    },
    now: () => new Date("2026-07-21T12:00:00.000Z"),
  });
  const { NextRequest } = await import("next/server.js");
  const request = (target: string, cookie?: string) => new NextRequest(`https://internal.example${target}`, {
    headers: cookie ? { cookie } : undefined,
  });
  const exactCsp = "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; object-src 'none'; frame-src https://www.paytr.com";
  const ready = await handler(request("/odeme/hizli/odeme", "__Host-celebix_quick=ready"));
  assert.equal(ready.headers.get("content-security-policy"), exactCsp);
  for (const denied of [
    request("/odeme/hizli/odeme"),
    request("/odeme/hizli/odeme", "__Host-celebix_quick=wrong"),
    request("/odeme/hizli/odeme?x=1", "__Host-celebix_quick=ready"),
    request("/odeme/hizli/odeme/", "__Host-celebix_quick=ready"),
  ]) {
    const response = await handler(denied);
    const csp = response.headers.get("content-security-policy");
    assert.match(csp ?? "", /form-action 'none'/);
    assert.doesNotMatch(csp ?? "", /frame-src https:\/\/www[.]paytr[.]com/);
  }
  assert.deepEqual(calls, [
    { hostname: "pilot.saas-staging.celebix.site", cookieHeader: "__Host-celebix_quick=ready" },
    { hostname: "pilot.saas-staging.celebix.site", cookieHeader: null },
    { hostname: "pilot.saas-staging.celebix.site", cookieHeader: "__Host-celebix_quick=wrong" },
  ]);
});

test("checkout sources contain no raw secret, provider log, off-origin redirect, or browser token serialization", async () => {
  const appRoot = path.resolve(import.meta.dirname, "..");
  const checkoutFiles = (await sourceFiles(appRoot)).filter((file) =>
    !file.includes(`${path.sep}.next${path.sep}`) && /(?:lib\/checkout|scripts\/reconcile-quick-orders|app\/odeme\/hizli|app\/api\/(?:quick-order\/checkout|payments\/paytr\/callback)|proxy[.]ts)/.test(file),
  );
  for (const file of checkoutFiles) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /console[.]|merchant[_-]?(?:key|salt)\s*[:=]\s*["'][^"']+["']/i, file);
    assert.doesNotMatch(source, /Response[.]json\([^)]*(?:token|sealed)|Location[^\n]+paytr[.]com/i, file);
  }
});

test("the token-free iframe route remains a server-only PayTR boundary", async () => {
  const runtime = await readFile(new URL("./checkout/runtime.ts", import.meta.url), "utf8");
  const proxy = await readFile(new URL("../proxy.ts", import.meta.url), "utf8");
  assert.match(runtime, /<iframe src="https:\/\/www[.]paytr[.]com\/odeme\/guvenli\/\$\{token\}"/);
  assert.doesNotMatch(runtime, /Response[.]json\([^)]*(?:token|sealed)|Location[^\n]+paytr[.]com/i);
  assert.match(proxy, /frame-src https:\/\/www[.]paytr[.]com/);
  assert.doesNotMatch(proxy, /frame-src\s+(?:\*|https:(?:\s|$)|'self'(?:\s|$)|[^;\n]*unsafe-inline)/i);
});
