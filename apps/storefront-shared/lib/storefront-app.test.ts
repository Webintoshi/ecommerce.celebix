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

test("starter storefront consumes the public presentation and exposes no inert cart control", async () => {
  const [home, listing, detail, category, categoryShowcase, header, footer, frame, card] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/products/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/products/[slug]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/categories/[slug]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/CategoryShowcase.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/Header.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/Footer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/StorefrontFrame.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/ProductCard.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(home, /presentation[.]theme[.]homeProductLimit/);
  assert.match(home, /presentation[.]hero[.]destination/);
  assert.match(home, /presentation[.]theme[.]showBrandStory/);
  assert.match(home, /starterMarqueeTokens/);
  assert.match(home, /iconSymbol/);
  assert.match(home, /<CategoryShowcase showcase=\{presentation[.]categoryShowcase\}/);
  assert.match(listing, /ProductExplorer/);
  assert.match(category, /listPublicProductsByCategory/);
  assert.match(category, /PublicStorefrontRepositoryError/);
  assert.match(category, /error[.]code === "not_found" \|\| error[.]code === "invalid_input"/);
  assert.match(category, /notFound\(\)/);
  assert.match(category, /new URL\(categoryPath\(selected[.]storefront[.]locale, selected[.]category[.]slug\)/);
  assert.match(categoryShowcase, /href=\{categoryPath\(locale, item[.]slug\)\}/);
  assert.match(categoryShowcase, /showcase[.]heading/);
  assert.match(categoryShowcase, /item[.]image[.]url/);
  assert.match(categoryShowcase, /alt=\{item[.]name\}/);
  assert.match(detail, /presentation/);
  assert.match(header, /displayName, logo[^\n]+storefront[.]presentation/);
  assert.match(header, /logo[.]url/);
  assert.match(header, /className="store-logo"/);
  assert.match(footer, /displayName, supportEmail[^\n]+storefront[.]presentation/);
  assert.match(frame, /starterThemeTokens/);
  assert.match(card, /productImageRatio|imageRatio/);
  assert.doesNotMatch(header, /Çanta|Sepet yakında|header-bag/);
});

test("public content shell owns exact fixed policies search favorites and sibling card controls", async () => {
  const [policy, search, favorites, resolveRoute, utilities, favoriteButton, footer, card] = await Promise.all([
    readFile(new URL("../app/policies/[policyKey]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/search/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/favorites/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/favorites/resolve/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/StoreUtilities.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/FavoriteButton.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/Footer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/ProductCard.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(policy, /resolveStorefrontPolicyRoute/);
  assert.match(policy, /buildPublicPolicyPage/);
  assert.match(policy, /henüz yayımlanmadı/);
  assert.match(policy, /index: false, follow: false/);
  assert.match(search, /runtime[.]content[.]search/);
  assert.match(search, /ProductGrid/);
  assert.doesNotMatch(search, /storeId|tenantId|membershipId/);
  assert.match(favorites, /FavoritesPageClient/);
  assert.match(resolveRoute, /readFavoriteResolutionRequest/);
  assert.match(resolveRoute, /resolveProductIds/);
  for (const path of ["/search", "/favorites", "/account", "/cart"]) assert.match(utilities, new RegExp(`href: ['\"]${path.replace("/", "\\/")}`));
  assert.match(favoriteButton, /favoritesStorageKey/);
  assert.match(favoriteButton, /aria-pressed/);
  assert.match(footer, /runtime[.]content[.]listPolicies/);
  assert.match(footer, /mergePublishedPolicyFooterGroups/);
  assert.match(footer, /Object[.]freeze\(\[\]\)/);
  assert.doesNotMatch(footer, /FIXED_STOREFRONT_POLICIES[.]map/);
  assert.match(card, /<article/);
  assert.match(card, /<FavoriteButton/);
  assert.match(card, /<ProductCardCartButton/);
  assert.match(card, /cardAction/);
  assert.match(card, /action === "quick_add"/);
  assert.match(card, /ProductQuickView/);
  assert.match(search, /nextCursor/);
  assert.doesNotMatch(card, /<Link[\s\S]*<FavoriteButton[\s\S]*<\/Link>/);
});

test("native cart checkout success and account pages remain public-projection only", async () => {
  const [cart, checkout, success, account] = await Promise.all([
    readFile(new URL("../app/cart/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/checkout/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/checkout/success/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/account/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(cart, /CartPageClient/u);
  assert.match(checkout, /CheckoutForm/u);
  assert.match(success, /getReceipt/u);
  assert.match(account, /identity[.]orders/u);
  assert.doesNotMatch(`${cart}\n${checkout}\n${success}\n${account}`, /storeId|tenantId|membershipId|customerId|orderId|credential/u);
});

test("secondary storefront pages omit oversized listing headers without losing accessible titles", async () => {
  const [pages, account, accountDashboard] = await Promise.all([
    Promise.all([
      readFile(new URL("../app/favorites/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/products/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/categories/[slug]/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/search/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/cart/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/checkout/success/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/policies/[policyKey]/page.tsx", import.meta.url), "utf8"),
    ]),
    readFile(new URL("../app/account/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/account/AccountDashboard.tsx", import.meta.url), "utf8"),
  ]);
  const source = [...pages, account, accountDashboard].join("\n");
  assert.doesNotMatch(source, /className="listing-hero"/u);
  for (const page of pages) {
    assert.match(page, /<h1 className="sr-only">/u);
  }
  assert.match(account, /<AccountDashboard/u);
  assert.match(accountDashboard, /<h1>/u);
});

test("dark theme and every marquee preference drive bounded CSS without sacrificing contrast", async () => {
  const [home, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  for (const token of ["marquee-speed-slow", "marquee-speed-normal", "marquee-speed-fast", "marquee-direction-left", "marquee-direction-right", "marquee-animation-continuous", "marquee-animation-step"]) assert.match(css, new RegExp(token));
  assert.match(css, /theme-dark[^}]+--paper:\s*#151719/);
  assert.match(css, /theme-dark[^}]+--accent-ink:\s*#17120e/);
  assert.match(css, /store-button[^}]+color:\s*var\(--paper\)/);
  assert.match(css, /stock-callout[^}]+color:\s*#382624/);
  assert.match(css, /prefers-reduced-motion/);
  assert.doesNotMatch(home, /presentation[.]marquee[.]items[.]join\(" · "\)<\/aside>/);
});

test("category showcase keeps grid compact and stacks the duo layout on narrow mobile screens", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /@media \(max-width: 640px\)[\s\S]+[.]category-showcase-grid\[data-layout="grid"\]\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]+[.]category-showcase-grid\[data-layout="duo"\]\s*\{[^}]*grid-template-columns:\s*1fr/);
});

test("storefront metadata is presentation-owned and defaults to noindex", async () => {
  const home = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(home, /presentation[.]seo[.]allowIndex/);
  assert.match(home, /robots/);
  assert.match(home, /presentation[.]seo[.]title/);
  assert.match(home, /presentation[.]seo[.]description/);
});

test("document language follows the resolved storefront locale", async () => {
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /page[.]context[.]storefront[.]locale/u);
  assert.match(layout, /<html lang=\{locale\}>/u);
  assert.doesNotMatch(layout, /<html lang="tr">/u);
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
  kind: "side-effect" | "from" | "dynamic" | "invalid-dynamic" | "named-re-export" | "star-re-export";
}>;

function importEdges(source: string, sourceName: string): ImportEdge[] {
  const syntax = ts.createSourceFile(sourceName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edges: ImportEdge[] = [];
  const literalText = (node: ts.Node | undefined): string | null => node !== undefined
    && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    ? node.text
    : null;
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      edges.push({
        source: sourceName,
        specifier: node.moduleSpecifier.text,
        kind: node.importClause === undefined ? "side-effect" : "from",
      });
    } else if (ts.isExportDeclaration(node)) {
      const specifier = literalText(node.moduleSpecifier);
      if (specifier !== null) {
        edges.push({
          source: sourceName,
          specifier,
          kind: node.exportClause === undefined || ts.isNamespaceExport(node.exportClause)
            ? "star-re-export"
            : "named-re-export",
        });
      }
    } else if (
      ts.isCallExpression(node)
      && node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      const specifier = literalText(node.arguments[0]);
      if (specifier !== null) edges.push({
        source: sourceName,
        specifier,
        kind: node.arguments.length === 1 || node.arguments.length === 2
          ? "dynamic"
          : "invalid-dynamic",
      });
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
    "app/api/quick-order/checkout/route.ts\u0000@/lib/checkout/hosted-payment.ts\u0000from",
    "app/api/payments/[providerCode]/callback/[binding]/route.ts\u0000@/lib/payment-adapters/runtime.ts\u0000from",
    "lib/default-runtime.ts\u0000./checkout/hosted-payment.ts\u0000from",
    "lib/default-runtime.ts\u0000./payment-adapters/default.ts\u0000from",
    "lib/default-runtime.ts\u0000./payment-adapters/runtime.ts\u0000from",
    "lib/default-runtime.ts\u0000./checkout/standard-hosted-payment.ts\u0000from",
    "lib/default-runtime.ts\u0000@celebix/payment-adapters\u0000from",
    "lib/checkout/paytr.ts\u0000@celebix/payment-adapters\u0000from",
    "lib/checkout/hosted-payment.ts\u0000../payment-adapters/runtime.ts\u0000from",
    "lib/checkout/standard-hosted-payment.ts\u0000../payment-adapters/runtime.ts\u0000from",
    "lib/cart/route.ts\u0000../checkout/standard-hosted-payment.ts\u0000from",
    "lib/payment-adapters/default.ts\u0000@celebix/payment-adapters\u0000from",
    "lib/payment-adapters/callback-authority.ts\u0000@celebix/payment-adapters\u0000from",
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

  const unreviewedFixtures: ReadonlyArray<Readonly<{
    source: string;
    sourceName?: string;
    specifier: string;
    kind: ImportEdge["kind"];
  }>> = [
    {
      source: 'import { createHostedPaymentRuntime } from "@/lib/payment-adapters/runtime.ts";',
      specifier: "@/lib/payment-adapters/runtime.ts",
      kind: "from",
    },
    {
      source: 'import "evil-payment-sdk";',
      specifier: "evil-payment-sdk",
      kind: "side-effect",
    },
    {
      source: 'void import("@celebix/payment-adapters");',
      specifier: "@celebix/payment-adapters",
      kind: "dynamic",
    },
    {
      source: 'void import("@celebix/payment-adapters", {});',
      specifier: "@celebix/payment-adapters",
      kind: "dynamic",
    },
    {
      source: "void import(`@celebix/payment-adapters`);",
      specifier: "@celebix/payment-adapters",
      kind: "dynamic",
    },
    {
      source: "void import(`@celebix/payment-adapters`, { with: {} });",
      sourceName: "lib/payment-adapters/runtime.ts",
      specifier: "@celebix/payment-adapters",
      kind: "dynamic",
    },
    {
      source: 'void import("@celebix/payment-adapters", {}, {});',
      specifier: "@celebix/payment-adapters",
      kind: "invalid-dynamic",
    },
    {
      source: 'export { createHostedPaymentRuntime } from "@/lib/payment-adapters/runtime.ts";',
      specifier: "@/lib/payment-adapters/runtime.ts",
      kind: "named-re-export",
    },
    {
      source: 'export * from "@celebix/payment-adapters";',
      specifier: "@celebix/payment-adapters",
      kind: "star-re-export",
    },
  ];
  for (const fixture of unreviewedFixtures) {
    const sourceName = fixture.sourceName ?? "lib/unreviewed.ts";
    const edges = importEdges(fixture.source, sourceName);
    assert.deepEqual(edges, [{
      source: sourceName,
      specifier: fixture.specifier,
      kind: fixture.kind,
    }]);
    const edge = edges[0]!;
    assert.throws(
      () => assert.equal(reviewedPaymentEdges.has(edgeKey(edge)), true, edgeKey(edge)),
      assert.AssertionError,
    );
  }

  for (const relative of [
    "lib/checkout/hosted-payment.ts",
    "lib/payment-adapters/default.ts",
    "lib/payment-adapters/runtime.ts",
    "lib/payment-adapters/callback-authority.ts",
  ]) {
    const source = await readFile(path.join(appRoot, relative), "utf8");
    assert.match(source, /^import "server-only";/, relative);
  }
  const publicRuntime = await readFile(new URL("./default-runtime.ts", import.meta.url), "utf8");
  assert.match(publicRuntime, /PostgresPublicStorefrontRepository/);
  assert.match(publicRuntime, /PostgresPublicStorefrontContentRepository/);
  assert.match(publicRuntime, /celebix_saas_host_resolver/);
  assert.match(publicRuntime, /AS migration_071/);
  assert.match(publicRuntime, /row[.]migration_071 !== true/);
  assert.match(publicRuntime, /AS migration_103/);
  assert.match(publicRuntime, /row[.]migration_103 !== true/);
  assert.match(publicRuntime, /public_cart_mutate\(text,timestamp with time zone,jsonb,uuid,text,text,timestamp with time zone,uuid,text,text,bigint,uuid,uuid,integer,jsonb\)/);
  assert.match(publicRuntime, /public_cart_mutate_without_customer_identity_v103/);
  assert.match(publicRuntime, /abandoned_carts_projection/);
  assert.match(publicRuntime, /firstProductName/);
  assert.match(publicRuntime, /customerId/);
  assert.match(publicRuntime, /AS migration_073/);
  assert.match(publicRuntime, /row[.]migration_073 !== true/);
  assert.match(publicRuntime, /storefront_hosted_checkout_settlement_preflight/);
  assert.match(publicRuntime, /hostedMigration[.]rows\[0\][?][.]migration_092 === true/);
  assert.match(publicRuntime, /async function queryAsWorkflowRole/);
  assert.match(publicRuntime, /SET LOCAL ROLE celebix_saas_workflow/);
  assert.match(publicRuntime, /const hostedMigration = await queryAsWorkflowRole\(pool,/);
  assert.match(publicRuntime, /const preflight = await queryAsWorkflowRole\(pool,/);
  assert.doesNotMatch(publicRuntime, /const hostedMigration = await pool[.]query/);
  assert.match(publicRuntime, /content,/);
  assert.doesNotMatch(publicRuntime, /ProductMediaRepository|INSERT|UPDATE|DELETE/);
});

test("application configuration defines baseline security headers", async () => {
  const config = await readFile(new URL("../next.config.ts", import.meta.url), "utf8");
  for (const header of ["Content-Security-Policy", "X-Content-Type-Options", "Referrer-Policy", "X-Frame-Options"]) {
    assert.match(config, new RegExp(header));
  }
  const checkoutPaymentHeaderStart = config.indexOf('source: "/checkout/payment"');
  const baselineHeaderStart = config.indexOf('source: "/((?!checkout/payment$).*)"');
  assert.ok(checkoutPaymentHeaderStart >= 0);
  assert.ok(baselineHeaderStart > checkoutPaymentHeaderStart);
  const checkoutPaymentHeader = config.slice(checkoutPaymentHeaderStart, baselineHeaderStart);
  assert.match(config, /source: "\/checkout\/payment"[\s\S]*headers: \[\.\.\.BASE_SECURITY_HEADERS\]/);
  assert.match(config, /source: "\/\(\(\?!checkout\/payment\$\)\.\*\)"/);
  assert.doesNotMatch(checkoutPaymentHeader, /Content-Security-Policy/);
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

test("starter product detail owns one ordered sanitized rich-information surface", async () => {
  const page = await readFile(new URL("../app/products/[slug]/page.tsx", import.meta.url), "utf8");
  const experience = await readFile(new URL("../components/ProductDetailExperience.tsx", import.meta.url), "utf8");
  const disclosures = await readFile(new URL("../components/ProductInformationDisclosures.tsx", import.meta.url), "utf8");

  assert.match(page, /<ProductDetailExperience product=/);
  assert.match(experience, /<ProductInformationDisclosures informationSections=/);
  assert.doesNotMatch(page, /<p>\{item[.]description/);
  assert.match(disclosures, /aria-labelledby="product-information-title"/);
  assert.match(disclosures, /label: "Açıklama"/);
  assert.match(disclosures, /renderStarterProductDescription/);
  assert.match(disclosures, /dangerouslySetInnerHTML/);
  assert.match(experience, /aria-label="İçerik yolu"/);
  assert.match(experience, /href="\/">Ana sayfa/);
  assert.match(experience, /categoryPath/);
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

test("storefront CSP permits only the exact Google stylesheet and font origins", async () => {
  type Factory = (dependencies: Readonly<{
    selectAuthority: () => Readonly<{ kind: "trusted"; hostname: string }>;
    resolveMediaOrigin: () => string;
    authorizePaytrIframe: () => Promise<boolean>;
    now: () => Date;
  }>) => (request: import("next/server.js").NextRequest) => Promise<import("next/server.js").NextResponse>;
  const { createStorefrontProxy } = await import("../proxy.ts") as unknown as { createStorefrontProxy: Factory };
  const { NextRequest } = await import("next/server.js");
  const handler = createStorefrontProxy({
    selectAuthority: () => ({ kind: "trusted", hostname: "pilot.saas-staging.celebix.site" }),
    resolveMediaOrigin: () => "https://media.celebix.net",
    authorizePaytrIframe: async () => false,
    now: () => new Date("2026-08-07T12:00:00.000Z"),
  });
  const response = await handler(new NextRequest("https://internal.example/products"));
  const csp = response.headers.get("content-security-policy") ?? "";
  assert.match(csp, /style-src 'self' 'unsafe-inline' https:\/\/fonts[.]googleapis[.]com(?:;|$)/u);
  assert.match(csp, /font-src 'self' data: https:\/\/fonts[.]gstatic[.]com(?:;|$)/u);
  assert.doesNotMatch(csp, /style-src[^;]*(?:\shttps:(?:\s|;)|\s\*)/u);
  assert.doesNotMatch(csp, /font-src[^;]*(?:\shttps:(?:\s|;)|\s\*)/u);
});

test("storefront responses forbid intermediary HTML transforms", async () => {
  type Factory = (dependencies: Readonly<{
    selectAuthority: () => Readonly<{ kind: "trusted"; hostname: string }>;
    resolveMediaOrigin: () => string;
    authorizePaytrIframe: () => Promise<boolean>;
    now: () => Date;
  }>) => (request: import("next/server.js").NextRequest) => Promise<import("next/server.js").NextResponse>;
  const { createStorefrontProxy } = await import("../proxy.ts") as unknown as { createStorefrontProxy: Factory };
  const { NextRequest } = await import("next/server.js");
  const handler = createStorefrontProxy({
    selectAuthority: () => ({ kind: "trusted", hostname: "pilot.saas-staging.celebix.site" }),
    resolveMediaOrigin: () => "https://media.celebix.net",
    authorizePaytrIframe: async () => false,
    now: () => new Date("2026-08-14T12:00:00.000Z"),
  });

  const response = await handler(new NextRequest("https://internal.example/products"));

  assert.match(response.headers.get("cache-control") ?? "", /(?:^|,\s*)no-transform(?:,|$)/u);
});

test("proxy grants exact-origin form authority only to the account verification page", async () => {
  type Factory = (dependencies: Readonly<{
    selectAuthority: (headers: Headers) => Readonly<{ kind: "trusted"; hostname: string }>;
    resolveMediaOrigin: () => string;
    authorizePaytrIframe: () => Promise<boolean>;
    now: () => Date;
  }>) => (request: import("next/server.js").NextRequest) => Promise<import("next/server.js").NextResponse>;
  const { createStorefrontProxy } = await import("../proxy.ts") as unknown as { createStorefrontProxy: Factory };
  const { NextRequest } = await import("next/server.js");
  const handler = createStorefrontProxy({
    selectAuthority: () => ({ kind: "trusted", hostname: "pilot.saas-staging.celebix.site" }),
    resolveMediaOrigin: () => "https://media.celebix.net",
    authorizePaytrIframe: async () => false,
    now: () => new Date("2026-08-04T12:00:00.000Z"),
  });
  const exact = await handler(new NextRequest("https://internal.example/account/verify"));
  assert.match(exact.headers.get("content-security-policy") ?? "", /form-action https:\/\/pilot[.]saas-staging[.]celebix[.]site(?:;|$)/u);
  const magicLink = await handler(new NextRequest("https://internal.example/account/verify?ticket=opaque&returnTo=%2Faccount"));
  assert.match(magicLink.headers.get("content-security-policy") ?? "", /form-action https:\/\/pilot[.]saas-staging[.]celebix[.]site(?:;|$)/u);
  for (const path of ["/account/login", "/account/verify/"]) {
    const response = await handler(new NextRequest(`https://internal.example${path}`));
    assert.match(response.headers.get("content-security-policy") ?? "", /form-action 'none'/u);
  }
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

test("generic hosted callback route remains provider-neutral while the PayTR compatibility route is unchanged", async () => {
  const generic = await readFile(
    new URL("../app/api/payments/[providerCode]/callback/[binding]/route.ts", import.meta.url),
    "utf8",
  );
  const paytr = await readFile(
    new URL("../app/api/payments/paytr/callback/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(generic, /createHostedPaymentCallbackRoute/);
  assert.match(generic, /resolveDefaultHostedPaymentRuntime/);
  assert.doesNotMatch(generic, /paytr|iyzico|merchantKey|merchantSalt|apiKey|secretKey|cookie|authorization/i);
  assert.match(paytr, /createPaytrCallbackRoute/);
  assert.doesNotMatch(paytr, /iyzico/i);
});

test("proxy grants legacy PayTR frame authority while standard checkout payment owns its route CSP", async () => {
  type Factory = (dependencies: Readonly<{
    selectAuthority: (headers: Headers) => Readonly<{ kind: "trusted"; hostname: string }>;
    resolveMediaOrigin: () => string;
    authorizePaytrIframe: (input: Readonly<{ hostname: string; cookieHeader: string | null; now: Date }>) => Promise<boolean>;
    authorizeStandardHostedIframe?: (input: Readonly<{ hostname: string; cookieHeader: string | null; now: Date }>) => Promise<boolean>;
    now: () => Date;
  }>) => (request: import("next/server.js").NextRequest) => Promise<import("next/server.js").NextResponse>;
  const proxyModule = await import("../proxy.ts") as unknown as { createStorefrontProxy?: Factory };
  assert.equal(typeof proxyModule.createStorefrontProxy, "function");
  const calls: Array<Readonly<{ hostname: string; cookieHeader: string | null }>> = [];
  const standardCalls: Array<Readonly<{ hostname: string; cookieHeader: string | null }>> = [];
  const handler = proxyModule.createStorefrontProxy!({
    selectAuthority: () => ({ kind: "trusted", hostname: "pilot.saas-staging.celebix.site" }),
    resolveMediaOrigin: () => "https://media.saas-staging.celebix.site",
    authorizePaytrIframe: async ({ hostname, cookieHeader }) => {
      calls.push({ hostname, cookieHeader });
      return cookieHeader === "__Host-celebix_quick=ready" || cookieHeader === "__Host-celebix_hosted_checkout=ready";
    },
    authorizeStandardHostedIframe: async ({ hostname, cookieHeader }) => {
      standardCalls.push({ hostname, cookieHeader });
      return cookieHeader === "__Host-celebix_hosted_checkout=ready";
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
  const standardReady = await handler(request("/checkout/payment", "__Host-celebix_hosted_checkout=ready"));
  assert.equal(standardReady.headers.get("content-security-policy"), null);
  const hostedReturnBridge = await handler(request("/odeme/hizli/sonuc?durum=basarili", "__Host-celebix_hosted_checkout=ready"));
  const hostedReturnBridgeCsp = hostedReturnBridge.headers.get("content-security-policy") ?? "";
  assert.match(hostedReturnBridgeCsp, /^default-src 'none'; script-src 'nonce-[^']+'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'self' https:\/\/www[.]paytr[.]com; form-action 'none'; object-src 'none'$/);
  assert.equal(hostedReturnBridge.headers.get("x-frame-options"), null);
  const quickReturnBridge = await handler(request("/odeme/hizli/sonuc?durum=basarisiz", "__Host-celebix_quick=ready"));
  assert.match(quickReturnBridge.headers.get("content-security-policy") ?? "", /frame-ancestors 'self' https:\/\/www[.]paytr[.]com/);
  assert.equal(quickReturnBridge.headers.get("x-frame-options"), null);
  for (const deniedBridge of [
    request("/odeme/hizli/sonuc?durum=basarili"),
    request("/odeme/hizli/sonuc?durum=basarili", "__Host-celebix_quick=wrong"),
    request("/odeme/hizli/sonuc?durum=basarili&x=1", "__Host-celebix_quick=ready"),
    request("/odeme/hizli/sonuc/", "__Host-celebix_quick=ready"),
  ]) {
    const response = await handler(deniedBridge);
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    assert.doesNotMatch(response.headers.get("content-security-policy") ?? "", /frame-ancestors 'self' https:\/\/www[.]paytr[.]com/);
  }
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
  assert.ok(calls.some((call) => call.cookieHeader === "__Host-celebix_quick=ready"));
  assert.ok(calls.some((call) => call.cookieHeader === "__Host-celebix_hosted_checkout=ready"));
  assert.ok(calls.some((call) => call.cookieHeader === null));
  assert.ok(calls.some((call) => call.cookieHeader === "__Host-celebix_quick=wrong"));
  for (const routeOwned of [
    request("/checkout/payment"),
    request("/checkout/payment", "__Host-celebix_hosted_checkout=wrong"),
  ]) {
    const response = await handler(routeOwned);
    assert.equal(response.headers.get("content-security-policy"), null);
  }
  for (const denied of [
    request("/checkout/payment?x=1", "__Host-celebix_hosted_checkout=ready"),
    request("/checkout/payment/", "__Host-celebix_hosted_checkout=ready"),
  ]) {
    const response = await handler(denied);
    assert.doesNotMatch(response.headers.get("content-security-policy") ?? "", /frame-src https:\/\/www[.]paytr[.]com/);
  }
  assert.deepEqual(standardCalls, []);
});

test("standard checkout payment route permits only the exact PayTR frame and keeps fallback CSP closed", async () => {
  const route = await readFile(new URL("../app/checkout/payment/route.ts", import.meta.url), "utf8");
  assert.match(route, /Content-Security-Policy/);
  assert.match(route, /const FALLBACK_CSP = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; object-src 'none'"/);
  assert.match(route, /frame-src \$\{frameOrigin\}/);
  assert.match(route, /new URL\(presentation[.]url\)[.]origin/);
  assert.match(route, /allow="payment"/);
  assert.match(route, /PAYMENT_FRAME_HEADERS[\s\S]*"Referrer-Policy": "origin"/);
  assert.match(route, /referrerpolicy="origin"/);
  assert.doesNotMatch(route, /referrerpolicy="no-referrer"/);
  assert.doesNotMatch(route, /frame-src\s+(?:\*|https:(?:\s|$)|'self'(?:\s|$)|[^;\n]*unsafe-inline)/i);
});

test("standard hosted PayTR return page top-navigates out of the provider iframe without confirming an order", async () => {
  const source = await readFile(new URL("../app/odeme/hizli/sonuc/page.tsx", import.meta.url), "utf8");
  assert.match(source, /HOSTED_RESULT_TARGET = "\/checkout\/payment\/result"/);
  assert.match(source, /window[.]top[.]location[.]replace/);
  assert.match(source, /target="_top"/);
  assert.doesNotMatch(source, /Ödemeniz alındı|Siparişiniz başarıyla oluşturuldu/);
});

test("checkout sources contain no raw secret, provider log, off-origin redirect, or browser token serialization", async () => {
  const appRoot = path.resolve(import.meta.dirname, "..");
  const checkoutFiles = (await sourceFiles(appRoot)).filter((file) =>
    !file.includes(`${path.sep}.next${path.sep}`) && /(?:lib\/checkout|scripts\/reconcile-quick-orders|app\/(?:odeme\/hizli|checkout\/payment)|app\/api\/(?:quick-order\/checkout|payments\/paytr\/callback)|proxy[.]ts)/.test(file),
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
  assert.match(runtime, /<iframe src="\$\{createPaytrIframePresentationUrl\(token\)\}"/);
  assert.doesNotMatch(runtime, /Response[.]json\([^)]*(?:token|sealed)|Location[^\n]+paytr[.]com/i);
  assert.match(proxy, /frame-src https:\/\/www[.]paytr[.]com/);
  assert.doesNotMatch(proxy, /frame-src\s+(?:\*|https:(?:\s|$)|'self'(?:\s|$)|[^;\n]*unsafe-inline)/i);
});
