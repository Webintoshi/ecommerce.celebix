import assert from "node:assert/strict";
import test from "node:test";

type AuthorityModule = typeof import("./trusted-host-authority.ts");

const authority = await import("./trusted-host-authority.ts").catch(() => ({} as Partial<AuthorityModule>));
const TOKEN = Buffer.alloc(32, 0x42).toString("base64url");
const ENVIRONMENT = Object.freeze({
  CELEBIX_DEPLOYMENT_TIER: "staging",
  CELEBIX_STOREFRONT_PROXY_MODE: "approved_staging",
  CELEBIX_STOREFRONT_PROXY_TOKEN_B64URL: TOKEN,
});

function requireAuthority(): AuthorityModule {
  assert.equal(typeof authority.selectTrustedStorefrontHostAuthority, "function");
  return authority as AuthorityModule;
}

function headers(overrides: Record<string, string | readonly string[] | undefined> = {}) {
  const values = new Map<string, string>(Object.entries({
    host: "attacker.internal:3450",
    "x-celebix-storefront-proxy": `p1.${TOKEN}`,
    "x-forwarded-host": "pilot.saas-staging.celebix.site",
    "x-forwarded-proto": "https",
    forwarded: "host=forged.example;proto=http",
    "x-original-host": "forged.example",
    "x-host": "forged.example",
  }));

  for (const [name, value] of Object.entries(overrides)) {
    values.delete(name);
    if (Array.isArray(value)) {
      values.set(name, value.join(", "));
    } else if (typeof value === "string") {
      values.set(name, value);
    }
  }
  return { get: (name: string) => values.get(name.toLowerCase()) ?? null };
}

test("valid authenticated proxy authority selects one canonical HTTPS hostname", () => {
  assert.deepEqual(
    requireAuthority().selectTrustedStorefrontHostAuthority(headers(), ENVIRONMENT),
    { kind: "trusted", hostname: "pilot.saas-staging.celebix.site" },
  );
});

test("disabled configuration is checked before request headers", () => {
  assert.deepEqual(requireAuthority().selectTrustedStorefrontHostAuthority(headers(), {}), { kind: "disabled" });
});

test("missing proxy authority fails closed", () => {
  assert.deepEqual(
    requireAuthority().selectTrustedStorefrontHostAuthority(
      headers({ "x-celebix-storefront-proxy": undefined }),
      ENVIRONMENT,
    ),
    { kind: "missing_proxy_authority" },
  );
});

test("wrong, malformed, duplicate, comma-separated, and whitespace-modified proxy tokens fail closed", () => {
  const invalidValues: Array<string | readonly string[]> = [
    `p1.${Buffer.alloc(32, 0x43).toString("base64url")}`,
    TOKEN,
    "p1.short",
    `p1.${TOKEN},p1.${TOKEN}`,
    [`p1.${TOKEN}`, `p1.${TOKEN}`],
    ` p1.${TOKEN}`,
    `p1.${TOKEN} `,
  ];

  for (const value of invalidValues) {
    assert.deepEqual(
      requireAuthority().selectTrustedStorefrontHostAuthority(
        headers({ "x-celebix-storefront-proxy": value }),
        ENVIRONMENT,
      ),
      { kind: "invalid_proxy_authority" },
    );
  }
});

test("missing, duplicate, comma-separated, and non-canonical forwarded hosts fail closed", () => {
  const invalidValues: Array<string | readonly string[] | undefined> = [
    undefined,
    "pilot.saas-staging.celebix.site,other.example",
    ["pilot.saas-staging.celebix.site", "other.example"],
    "pilot.saas-staging.celebix.site:443",
    "https://pilot.saas-staging.celebix.site",
    "pilot.saas-staging.celebix.site/path",
    "pilot.saas-staging.celebix.site?tenant=other",
    "pilot.saas-staging.celebix.site#fragment",
    " pilot.saas-staging.celebix.site",
    "pilot.saas-staging.celebix.site ",
    "PILOT.saas-staging.celebix.site",
    "*.saas-staging.celebix.site",
    "pilot..saas-staging.celebix.site",
    "pilot\n.saas-staging.celebix.site",
  ];

  for (const value of invalidValues) {
    assert.deepEqual(
      requireAuthority().selectTrustedStorefrontHostAuthority(
        headers({ "x-forwarded-host": value }),
        ENVIRONMENT,
      ),
      { kind: "invalid_forwarded_host" },
    );
  }
});

test("forwarded proto must be the single exact value https", () => {
  for (const value of [undefined, "http", "HTTPS", "https,http", " https", "https "]) {
    assert.deepEqual(
      requireAuthority().selectTrustedStorefrontHostAuthority(
        headers({ "x-forwarded-proto": value }),
        ENVIRONMENT,
      ),
      { kind: "invalid_forwarded_proto" },
    );
  }
});

test("raw and forged authority headers never affect the selected hostname", () => {
  const result = requireAuthority().selectTrustedStorefrontHostAuthority(
    headers({
      host: "another-store.example",
      forwarded: "host=another-store.example;proto=https",
      "x-original-host": "another-store.example",
      "x-host": "another-store.example",
    }),
    ENVIRONMENT,
  );
  assert.deepEqual(result, { kind: "trusted", hostname: "pilot.saas-staging.celebix.site" });
  assert.equal("headers" in result, false);
  assert.equal("proxyToken" in result, false);
});

test("raw Host alone never establishes storefront authority", () => {
  assert.deepEqual(
    requireAuthority().selectTrustedStorefrontHostAuthority(
      headers({
        host: "pilot.saas-staging.celebix.site",
        "x-celebix-storefront-proxy": undefined,
        "x-forwarded-host": undefined,
        "x-forwarded-proto": undefined,
      }),
      ENVIRONMENT,
    ),
    { kind: "missing_proxy_authority" },
  );
});
