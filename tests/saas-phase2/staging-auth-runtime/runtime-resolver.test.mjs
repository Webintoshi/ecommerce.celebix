import assert from "node:assert/strict";
import test from "node:test";

import { createOwnerStagingAuthRouteSetResolver } from "../../../apps/owner/lib/self-serve-auth-route-runtime/resolver.ts";
import { createCustomerPanelStagingAuthRouteSetResolver } from "../../../apps/customer-panel/lib/panel-auth-route-runtime/resolver.ts";
import { validOwnerEnvironment, validCustomerEnvironment } from "./config.test.mjs";

function routeSet(label) {
  const response = async () => Response.json({ label });
  return Object.freeze({
    publicRegistration: response,
    internalBrowserBinding: response,
    internalCallback: response,
    browserBootstrap: response,
    browserCallback: response,
    readiness: Object.freeze({ mode: "approved_staging_injected" }),
  });
}

test("absent and invalid modes stay disabled without reading secrets or initializing", async () => {
  for (const create of [createOwnerStagingAuthRouteSetResolver, createCustomerPanelStagingAuthRouteSetResolver]) {
    const reads = [];
    let initialized = 0;
    const source = new Proxy({}, {
      get(_target, name) {
        reads.push(name);
        if (name === "CELEBIX_SAAS_AUTH_MODE") return undefined;
        if (name === "CELEBIX_DEPLOYMENT_TIER") return undefined;
        throw new Error("secret read");
      },
    });
    const resolver = create({
      source,
      disabled: () => routeSet("disabled"),
      unavailable: () => routeSet("unavailable"),
      initialize: async () => { initialized += 1; return routeSet("staging"); },
      diagnostic: () => assert.fail("unexpected diagnostic"),
    });
    const resolved = await resolver.resolve();
    assert.equal((await resolved.publicRegistration(new Request("https://example.test"))).status, 200);
    assert.equal(initialized, 0);
    assert.deepEqual(reads, ["CELEBIX_SAAS_AUTH_MODE", "CELEBIX_DEPLOYMENT_TIER"]);
  }
});

test("approved staging initialization receives exact known fields once and is memoized", async () => {
  for (const [create, environment] of [
    [createOwnerStagingAuthRouteSetResolver, validOwnerEnvironment()],
    [createCustomerPanelStagingAuthRouteSetResolver, validCustomerEnvironment()],
  ]) {
    let initialized = 0;
    const expected = routeSet("staging");
    const resolver = create({
      source: environment,
      disabled: () => routeSet("disabled"),
      unavailable: () => routeSet("unavailable"),
      initialize: async (config) => {
        initialized += 1;
        assert.equal(config.activationId, "staging_20260715_a1");
        return expected;
      },
      diagnostic: () => assert.fail("unexpected diagnostic"),
    });
    const [first, second, third] = await Promise.all([resolver.resolve(), resolver.resolve(), resolver.resolve()]);
    assert.equal(first, expected);
    assert.equal(second, expected);
    assert.equal(third, expected);
    assert.equal(initialized, 1);
  }
});

test("initialization failure is throttled and remains controlled unavailable", async () => {
  let initialized = 0;
  const diagnostics = [];
  const unavailable = routeSet("unavailable");
  const resolver = createOwnerStagingAuthRouteSetResolver({
    source: validOwnerEnvironment(),
    disabled: () => routeSet("disabled"),
    unavailable: () => unavailable,
    initialize: async () => { initialized += 1; throw new Error("secret database details"); },
    diagnostic: (code) => diagnostics.push(code),
  });
  assert.equal(await resolver.resolve(), unavailable);
  assert.equal(await resolver.resolve(), unavailable);
  assert.equal(initialized, 1);
  assert.deepEqual(diagnostics, ["owner_staging_auth_initialization_failed"]);
  assert.equal(JSON.stringify(diagnostics).includes("secret database details"), false);
});

test("owner initialization recovers after a transient failure and coalesces the retry", async (t) => {
  let now = 0;
  t.mock.method(Date, "now", () => now);
  let initialized = 0;
  let release;
  const retry = new Promise((resolve) => { release = resolve; });
  const unavailable = routeSet("unavailable");
  const healthy = routeSet("healthy");
  const resolver = createOwnerStagingAuthRouteSetResolver({
    source: validOwnerEnvironment(),
    disabled: () => routeSet("disabled"),
    unavailable: () => unavailable,
    initialize: async () => {
      initialized += 1;
      if (initialized === 1) throw new Error("transient preflight failure");
      await retry;
      return healthy;
    },
    diagnostic: () => {},
  });
  assert.equal(await resolver.resolve(), unavailable);
  assert.equal(await resolver.resolve(), unavailable);
  assert.equal(initialized, 1);
  now = 1_000;
  const pending = [resolver.resolve(), resolver.resolve(), resolver.resolve()];
  release();
  assert.deepEqual(await Promise.all(pending), [healthy, healthy, healthy]);
  assert.equal(await resolver.resolve(), healthy);
  assert.equal(initialized, 2);
});

test("owner initialization backs off repeated failures and remains disabled outside approved staging", async (t) => {
  let now = 0;
  t.mock.method(Date, "now", () => now);
  let initialized = 0;
  const source = validOwnerEnvironment();
  const unavailable = routeSet("unavailable");
  const disabled = routeSet("disabled");
  const resolver = createOwnerStagingAuthRouteSetResolver({
    source,
    disabled: () => disabled,
    unavailable: () => unavailable,
    initialize: async () => { initialized += 1; throw new Error("unavailable"); },
    diagnostic: () => {},
  });
  assert.equal(await resolver.resolve(), unavailable);
  now = 1_000;
  assert.equal(await resolver.resolve(), unavailable);
  assert.equal(initialized, 2);
  now = 2_999;
  assert.equal(await resolver.resolve(), unavailable);
  assert.equal(initialized, 2);
  now = 3_000;
  assert.equal(await resolver.resolve(), unavailable);
  assert.equal(initialized, 3);
  source.CELEBIX_DEPLOYMENT_TIER = "production";
  now = 100_000;
  assert.equal(await resolver.resolve(), disabled);
  assert.equal(initialized, 3);
});
