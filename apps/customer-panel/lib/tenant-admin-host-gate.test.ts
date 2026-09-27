import "next/dist/server/node-environment.js";
import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server.js";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server.js";

import { config, createCustomerPanelProxy } from "../proxy.ts";

const NOW = new Date("2026-09-27T12:00:00.000Z");
const ENVIRONMENTS = [
  { panel: "https://panel.saas-staging.celebix.net", tenant: "alpler-spor.admin.saas-staging.celebix.net", unknown: "unknown.admin.saas-staging.celebix.net" },
  { panel: "https://panel.saas-staging.celebix.site", tenant: "alpler-spor.admin.saas-staging.celebix.site", unknown: "unknown.admin.saas-staging.celebix.site" },
  { panel: "https://panel.celebix.site", tenant: "alpler-spor.admin.celebix.site", unknown: "unknown.admin.celebix.site" },
] as const;

function request(hostname: string, pathname: string, headers: Record<string, string> = {}) {
  return new NextRequest(`http://panel.internal:3400${pathname}`, { headers: { host: hostname, ...headers } });
}

test("unknown exact NET, SITE and production admin hosts return 404 on root and login before session redirects", async () => {
  for (const environment of ENVIRONMENTS) {
    const received: string[] = [];
    const handler = createCustomerPanelProxy({
      clock: () => NOW,
      async resolveRuntime() { return {
        access: { panelOrigin: environment.panel },
        adminDomains: { async resolvePublicBrand(input) {
          received.push(input.hostname);
          assert.deepEqual(input.now, NOW);
          return { kind: "admin_host_unknown" as const };
        } },
      }; },
    });
    for (const pathname of ["/", "/login"]) {
      const response = await handler(request(environment.unknown, pathname, {
        cookie: "__Host-celebix_panel=untrusted-cookie",
        "x-forwarded-host": environment.tenant,
      }));
      assert.equal(response.status, 404, `${environment.unknown}${pathname}`);
      assert.equal(response.headers.has("location"), false);
      assert.equal(response.headers.get("cache-control"), "no-store");
    }
    assert.deepEqual(received, [environment.unknown, environment.unknown]);
  }
});

test("exact active tenant and custom admin hosts continue to the existing branded login and session pages", async () => {
  for (const environment of ENVIRONMENTS) {
    for (const hostname of [environment.tenant, "admin.alplerspor.example"]) {
      const received: string[] = [];
      const handler = createCustomerPanelProxy({
        clock: () => NOW,
        async resolveRuntime() { return {
          access: { panelOrigin: environment.panel },
          adminDomains: { async resolvePublicBrand(input) {
            received.push(input.hostname);
            return { kind: "resolved" as const, brand: {
              storeSlug: "alpler-spor", displayName: "Alpler Spor", logoUrl: null,
              accentColor: null, canonicalAdminOrigin: `https://${hostname}`,
            } };
          } },
        }; },
      });
      for (const pathname of ["/", "/login"]) {
        const response = await handler(request(`${hostname}:443`, pathname));
        assert.equal(response.headers.get("x-middleware-next"), "1");
        assert.equal(response.headers.has("location"), false);
      }
      assert.deepEqual(received, [hostname, hostname]);
    }
  }
});

test("only the configured exact central panel host bypasses tenant lookup", async () => {
  for (const environment of ENVIRONMENTS) {
    let lookups = 0;
    const handler = createCustomerPanelProxy({
      clock: () => NOW,
      async resolveRuntime() { return {
        access: { panelOrigin: environment.panel },
        adminDomains: { async resolvePublicBrand() { lookups += 1; return { kind: "admin_host_unknown" as const }; } },
      }; },
    });
    for (const pathname of ["/", "/login"]) {
      assert.equal((await handler(request(new URL(environment.panel).hostname, pathname))).headers.get("x-middleware-next"), "1");
    }
    assert.equal(lookups, 0);
    assert.equal((await handler(request("panel.unapproved.example", "/login"))).status, 404);
    assert.equal(lookups, 1);
  }
});

test("runtime and exact hostname authority failures return 503 without exposing errors", async () => {
  for (const resolveRuntime of [
    async () => null,
    async () => { throw new Error("private database detail"); },
    ...["unavailable", "durable_authority_invalid"].map((kind) => async () => ({
      access: { panelOrigin: ENVIRONMENTS[0].panel },
      adminDomains: { async resolvePublicBrand() { return { kind } as { kind: "unavailable" | "durable_authority_invalid" }; } },
    })),
    async () => ({ access: { panelOrigin: ENVIRONMENTS[0].panel }, adminDomains: {
      async resolvePublicBrand(): Promise<never> { throw new Error("private database detail"); },
    } }),
  ]) {
    const handler = createCustomerPanelProxy({ clock: () => NOW, resolveRuntime });
    for (const pathname of ["/", "/login"]) {
      const response = await handler(request(ENVIRONMENTS[0].tenant, pathname));
      assert.equal(response.status, 503);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.doesNotMatch(await response.text(), /private database detail/);
    }
  }
});

test("invalid Host authority is rejected without runtime or database work", async () => {
  let resolutions = 0;
  const handler = createCustomerPanelProxy({
    clock: () => NOW,
    async resolveRuntime() { resolutions += 1; return null; },
  });
  for (const hostname of ["ALPLER-SPOR.admin.saas-staging.celebix.net", "evil.example, panel.saas-staging.celebix.net", "evil.example:invalid"]) {
    assert.equal((await handler(request(hostname, "/login"))).status, 404);
  }
  assert.equal(resolutions, 0);
});

test("unapproved central panel configuration fails closed", async () => {
  const handler = createCustomerPanelProxy({
    clock: () => NOW,
    async resolveRuntime() { return {
      access: { panelOrigin: "https://panel.unapproved.example" },
      adminDomains: { async resolvePublicBrand() { throw new Error("must not lookup"); } },
    }; },
  });
  assert.equal((await handler(request("panel.unapproved.example", "/login"))).status, 503);
});

test("development allows only exact local Next hosts on root and login without runtime resolution", async () => {
  let resolutions = 0;
  const handler = createCustomerPanelProxy({
    development: true,
    clock: () => NOW,
    async resolveRuntime() { resolutions += 1; return null; },
  });
  for (const hostname of ["localhost:3400", "127.0.0.1:3400", "[::1]:3400"]) {
    for (const pathname of ["/", "/login"]) {
      assert.equal((await handler(request(hostname, pathname))).headers.get("x-middleware-next"), "1", `${hostname}${pathname}`);
    }
  }
  assert.equal(resolutions, 0);
  for (const hostname of ["localhost:3401", "LOCALHOST:3400", "localhost", "[::1]:3401", ENVIRONMENTS[0].unknown]) {
    const response = await handler(request(hostname, "/login", { "x-forwarded-host": "localhost:3400" }));
    assert.notEqual(response.headers.get("x-middleware-next"), "1", hostname);
    assert.ok([404, 503].includes(response.status), hostname);
  }
});

test("production and test modes reject the same local hosts instead of bypassing authority", async () => {
  const handler = createCustomerPanelProxy({
    development: false,
    clock: () => NOW,
    async resolveRuntime() { return null; },
  });
  for (const hostname of ["localhost:3400", "127.0.0.1:3400", "[::1]:3400"]) {
    for (const pathname of ["/", "/login"]) {
      const response = await handler(request(hostname, pathname));
      assert.notEqual(response.headers.get("x-middleware-next"), "1");
      assert.ok([404, 503].includes(response.status), `${hostname}${pathname}`);
    }
  }
});

test("matcher and handler preserve auth handoff, callbacks and API health without runtime resolution", async () => {
  let resolutions = 0;
  const handler = createCustomerPanelProxy({
    clock: () => NOW,
    async resolveRuntime() { resolutions += 1; throw new Error("must not resolve"); },
  });
  for (const pathname of ["/", "/login", "/login?next=home"]) {
    assert.equal(unstable_doesMiddlewareMatch({ config, url: `https://panel.example${pathname}` }), true);
  }
  for (const pathname of ["/auth/handoff", "/auth/login", "/auth/callback", "/auth/logout", "/api/health", "/api/session/switch", "/_next/static/chunk.js", "/orders"]) {
    assert.equal(unstable_doesMiddlewareMatch({ config, url: `https://panel.example${pathname}` }), false, pathname);
    assert.equal((await handler(request(ENVIRONMENTS[0].unknown, pathname))).headers.get("x-middleware-next"), "1", pathname);
  }
  assert.equal(resolutions, 0);
});
