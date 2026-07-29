import assert from "node:assert/strict";
import test from "node:test";

type RolloutGateModule = typeof import("./rollout-gate.ts");

const rolloutGate = await import("./rollout-gate.ts").catch(
  () => ({} as Partial<RolloutGateModule>),
);

function requireRolloutGate(): RolloutGateModule {
  assert.equal(typeof rolloutGate.checkoutRolloutAllowsHost, "function");
  return rolloutGate as RolloutGateModule;
}

const VALID_ENVIRONMENT = Object.freeze({
  CELEBIX_DEPLOYMENT_TIER: "staging",
  CELEBIX_CHECKOUT_ROLLOUT_MODE: "approved_staging",
  CELEBIX_CHECKOUT_ROLLOUT_HOSTS:
    "store-a.checkout.test,store-b.checkout.test",
});
const PROXY_TOKEN = Buffer.alloc(32, 0x63).toString("base64url");
const VALID_REQUEST_ENVIRONMENT = Object.freeze({
  ...VALID_ENVIRONMENT,
  CELEBIX_STOREFRONT_PROXY_MODE: "approved_staging",
  CELEBIX_STOREFRONT_PROXY_TOKEN_B64URL: PROXY_TOKEN,
});

function requestHeaders(overrides: Record<string, string | undefined> = {}) {
  const values = new Map(Object.entries({
    host: "internal.example.test",
    "x-celebix-storefront-proxy": `p1.${PROXY_TOKEN}`,
    "x-forwarded-host": "store-a.checkout.test",
    "x-forwarded-proto": "https",
    ...overrides,
  }).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  return { get: (name: string) => values.get(name.toLowerCase()) ?? null };
}

test("approved staging rollout allows one exact canonical host", () => {
  assert.equal(
    requireRolloutGate().checkoutRolloutAllowsHost(
      VALID_ENVIRONMENT,
      "store-b.checkout.test",
    ),
    true,
  );
});

test("rollout configuration fails closed when absent or not approved staging", () => {
  for (const environment of [
    {},
    { ...VALID_ENVIRONMENT, CELEBIX_DEPLOYMENT_TIER: undefined },
    { ...VALID_ENVIRONMENT, CELEBIX_DEPLOYMENT_TIER: "production" },
    { ...VALID_ENVIRONMENT, CELEBIX_CHECKOUT_ROLLOUT_MODE: undefined },
    { ...VALID_ENVIRONMENT, CELEBIX_CHECKOUT_ROLLOUT_MODE: "enabled" },
    { ...VALID_ENVIRONMENT, CELEBIX_CHECKOUT_ROLLOUT_HOSTS: undefined },
  ]) {
    assert.equal(
      requireRolloutGate().checkoutRolloutAllowsHost(
        environment,
        "store-a.checkout.test",
      ),
      false,
    );
  }
});

test("the entire allowlist fails closed for duplicates and non-canonical hosts", () => {
  const malformedAllowlists = [
    "",
    "store-a.checkout.test,",
    ",store-a.checkout.test",
    "store-a.checkout.test,,store-b.checkout.test",
    "store-a.checkout.test,store-a.checkout.test",
    "*.checkout.test",
    "store-a.checkout.test:443",
    "https://store-a.checkout.test",
    "store-a.checkout.test/path",
    "store-a.checkout.test?tenant=other",
    "store-a.checkout.test#fragment",
    " store-a.checkout.test",
    "store-a.checkout.test ",
    "store-a.checkout.test, store-b.checkout.test",
    "STORE-A.checkout.test",
    "localhost",
    "store-a..checkout.test",
    ".store-a.checkout.test",
    "store-a.checkout.test.",
    "-store-a.checkout.test",
    "store-a-.checkout.test",
    "store_a.checkout.test",
    `store-${"a".repeat(64)}.checkout.test`,
  ];

  for (const allowlist of malformedAllowlists) {
    assert.equal(
      requireRolloutGate().checkoutRolloutAllowsHost(
        { ...VALID_ENVIRONMENT, CELEBIX_CHECKOUT_ROLLOUT_HOSTS: allowlist },
        "store-a.checkout.test",
      ),
      false,
      allowlist,
    );
  }
});

test("rollout matching is exact and never wildcard or suffix based", () => {
  for (const hostname of [
    "checkout.test",
    "other.checkout.test",
    "evilstore-a.checkout.test",
    "store-a.checkout.test.evil.example",
    "STORE-A.checkout.test",
    "store-a.checkout.test:443",
    "store-a.checkout.test/path",
  ]) {
    assert.equal(
      requireRolloutGate().checkoutRolloutAllowsHost(VALID_ENVIRONMENT, hostname),
      false,
      hostname,
    );
  }
});

test("product buy-now rendering is enabled only by an authenticated approved request host", () => {
  const gate = requireRolloutGate();
  assert.equal(
    gate.checkoutRolloutAllowsRequest(requestHeaders(), VALID_REQUEST_ENVIRONMENT),
    true,
  );

  for (const selectedHeaders of [
    requestHeaders({ "x-forwarded-host": "store-c.checkout.test" }),
    requestHeaders({
      host: "store-a.checkout.test",
      "x-forwarded-host": "store-c.checkout.test",
    }),
    requestHeaders({ "x-celebix-storefront-proxy": `p1.${Buffer.alloc(32, 0x64).toString("base64url")}` }),
    requestHeaders({ "x-forwarded-proto": "http" }),
  ]) {
    assert.equal(
      gate.checkoutRolloutAllowsRequest(selectedHeaders, VALID_REQUEST_ENVIRONMENT),
      false,
    );
  }

  assert.equal(gate.checkoutRolloutAllowsRequest(requestHeaders(), {}), false);
});

test("proxy denies only new checkout initiation surfaces for a non-approved authority", async () => {
  type ProxyFactory = (dependencies: Readonly<{
    selectAuthority: () => Readonly<{ kind: "trusted"; hostname: string }>;
    resolveMediaOrigin: () => string;
    authorizePaytrIframe: () => Promise<boolean>;
    checkoutRolloutAllows: (hostname: string) => boolean;
    now: () => Date;
  }>) => (request: import("next/server.js").NextRequest) => Promise<Response>;
  const [{ createStorefrontProxy }, { NextRequest }] = await Promise.all([
    import("../../proxy.ts") as Promise<{ createStorefrontProxy: ProxyFactory }>,
    import("next/server.js"),
  ]);
  const checkedHosts: string[] = [];
  const handler = createStorefrontProxy({
    selectAuthority: () => ({
      kind: "trusted",
      hostname: "denied.checkout.test",
    }),
    resolveMediaOrigin: () => "https://media.example.test",
    authorizePaytrIframe: async () => false,
    checkoutRolloutAllows: (hostname) => {
      checkedHosts.push(hostname);
      return false;
    },
    now: () => new Date("2026-07-29T12:00:00.000Z"),
  });

  for (const [pathname, method] of [
    ["/odeme", "GET"],
    ["/api/checkout/quote", "GET"],
    ["/api/checkout/delivery", "POST"],
    ["/api/checkout/submit", "POST"],
  ] as const) {
    const response = await handler(new NextRequest(
      `https://internal.example${pathname}`,
      {
        method,
        headers: {
          host: "store-a.checkout.test",
          "x-forwarded-host": "store-a.checkout.test",
        },
      },
    ));
    assert.equal(response.status, 503, pathname);
    assert.equal(await response.text(), "Storefront unavailable", pathname);
    assert.equal(response.headers.get("cache-control"), "no-store", pathname);
    assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow", pathname);
    assert.equal(response.headers.get("referrer-policy"), "no-referrer", pathname);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff", pathname);
  }

  for (const [pathname, method] of [
    ["/odeme/sonuc", "GET"],
    ["/api/checkout/status", "GET"],
    ["/odeme/hizli", "GET"],
    ["/api/quick-order/checkout", "POST"],
    ["/api/payments/paytr/callback", "POST"],
  ] as const) {
    const response = await handler(new NextRequest(
      `https://internal.example${pathname}`,
      { method },
    ));
    assert.equal(response.headers.get("x-middleware-next"), "1", pathname);
  }

  assert.deepEqual(checkedHosts, Array(4).fill("denied.checkout.test"));
});

test("proxy passes new checkout initiation only when the trusted exact host is approved", async () => {
  type ProxyFactory = (dependencies: Readonly<{
    selectAuthority: () => Readonly<{ kind: "trusted"; hostname: string }>;
    resolveMediaOrigin: () => string;
    authorizePaytrIframe: () => Promise<boolean>;
    checkoutRolloutAllows: (hostname: string) => boolean;
    now: () => Date;
  }>) => (request: import("next/server.js").NextRequest) => Promise<Response>;
  const [{ createStorefrontProxy }, { NextRequest }] = await Promise.all([
    import("../../proxy.ts") as Promise<{ createStorefrontProxy: ProxyFactory }>,
    import("next/server.js"),
  ]);
  const handler = createStorefrontProxy({
    selectAuthority: () => ({
      kind: "trusted",
      hostname: "store-a.checkout.test",
    }),
    resolveMediaOrigin: () => "https://media.example.test",
    authorizePaytrIframe: async () => false,
    checkoutRolloutAllows: (hostname) => hostname === "store-a.checkout.test",
    now: () => new Date("2026-07-29T12:00:00.000Z"),
  });

  for (const [pathname, method] of [
    ["/odeme", "GET"],
    ["/api/checkout/quote", "GET"],
    ["/api/checkout/delivery", "POST"],
    ["/api/checkout/submit", "POST"],
  ] as const) {
    const response = await handler(
      new NextRequest(`https://internal.example${pathname}`, { method }),
    );
    assert.equal(response.headers.get("x-middleware-next"), "1", pathname);
  }
});
