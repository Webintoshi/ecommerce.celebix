import assert from "node:assert/strict";
import test from "node:test";

type ProxyModule = typeof import("./storefront-proxy");

const proxyModuleUrl = new URL("./storefront-proxy.ts", import.meta.url).href;
const proxy = await import(proxyModuleUrl).catch(() => ({} as Partial<ProxyModule>));
const TOKEN = Buffer.alloc(32, 0x41).toString("base64url");

function requireProxy(): ProxyModule {
  assert.equal(typeof proxy.resolveStorefrontProxyConfig, "function");
  return proxy as ProxyModule;
}

const approvedEnvironment = Object.freeze({
  CELEBIX_DEPLOYMENT_TIER: "staging",
  CELEBIX_STOREFRONT_PROXY_MODE: "approved_staging",
  CELEBIX_STOREFRONT_PROXY_TOKEN_B64URL: TOKEN,
});

test("storefront proxy configuration is disabled when absent", () => {
  assert.deepEqual(requireProxy().resolveStorefrontProxyConfig({}), { mode: "disabled" });
});

test("partial storefront proxy configuration remains disabled", () => {
  for (const partial of [
    { CELEBIX_DEPLOYMENT_TIER: "staging" },
    { CELEBIX_STOREFRONT_PROXY_MODE: "approved_staging" },
    { CELEBIX_STOREFRONT_PROXY_TOKEN_B64URL: TOKEN },
    {
      CELEBIX_DEPLOYMENT_TIER: "staging",
      CELEBIX_STOREFRONT_PROXY_MODE: "approved_staging",
    },
  ]) {
    assert.deepEqual(requireProxy().resolveStorefrontProxyConfig(partial), { mode: "disabled" });
  }
});

test("malformed and non-canonical tokens remain disabled", () => {
  for (const token of [
    "short",
    `${TOKEN}=`,
    ` ${TOKEN}`,
    `${TOKEN} `,
    Buffer.alloc(31, 0x41).toString("base64url"),
    Buffer.alloc(33, 0x41).toString("base64url"),
  ]) {
    assert.deepEqual(
      requireProxy().resolveStorefrontProxyConfig({
        ...approvedEnvironment,
        CELEBIX_STOREFRONT_PROXY_TOKEN_B64URL: token,
      }),
      { mode: "disabled" },
    );
  }
});

test("production and production-like tiers cannot activate storefront proxy authority", () => {
  for (const tier of ["production", "prod", "staging-production", "STAGING"]) {
    assert.deepEqual(
      requireProxy().resolveStorefrontProxyConfig({
        ...approvedEnvironment,
        CELEBIX_DEPLOYMENT_TIER: tier,
      }),
      { mode: "disabled" },
    );
  }
});

test("only the exact approved-staging configuration activates authority", () => {
  const result = requireProxy().resolveStorefrontProxyConfig(approvedEnvironment);
  assert.equal(result.mode, "approved_staging");
  if (result.mode !== "approved_staging") return;
  assert.equal(result.proxyToken, TOKEN);
  assert.equal(Object.isFrozen(result), true);
});

test("browser-shaped keys cannot activate storefront proxy authority", () => {
  assert.deepEqual(
    requireProxy().resolveStorefrontProxyConfig({
      Host: "shop.saas-staging.celebix.site",
      "X-Celebix-Storefront-Proxy": `p1.${TOKEN}`,
      "X-Forwarded-Host": "shop.saas-staging.celebix.site",
      "X-Forwarded-Proto": "https",
    }),
    { mode: "disabled" },
  );
});
