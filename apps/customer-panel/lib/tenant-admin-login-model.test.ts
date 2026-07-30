import assert from "node:assert/strict";
import test from "node:test";

import { resolveTenantAdminLoginModel } from "./tenant-admin-login-model.ts";

const HOSTNAME = "guzide-kuyumcu-4.admin.saas-staging.celebix.site";
const ORIGIN = `https://${HOSTNAME}`;
const PANEL = "https://panel.saas-staging.celebix.site";

test("resolves the exact public store brand and central login authority server-side", async () => {
  const model = await resolveTenantAdminLoginModel({
    hostHeader: HOSTNAME,
    clock: () => new Date("2026-07-30T10:00:00.000Z"),
    async resolveRuntime() {
      return {
        access: { panelOrigin: PANEL },
        adminDomains: { async resolvePublicBrand() { return { kind: "resolved", brand: {
          storeSlug: "guzide-kuyumcu-4",
          displayName: "Güzide Kuyumcu",
          logoUrl: "https://assets.celebix.site/guzide.svg",
          accentColor: "#b58a4a",
          canonicalAdminOrigin: ORIGIN,
        } }; } },
      };
    },
  });
  assert.deepEqual(model, {
    kind: "tenant",
    displayName: "Güzide Kuyumcu",
    logoUrl: "https://assets.celebix.site/guzide.svg",
    accentColor: "#b58a4a",
    canonicalAdminOrigin: ORIGIN,
    loginHref: `${PANEL}/auth/login?destination=${HOSTNAME}`,
  });
  assert.equal(Object.isFrozen(model), true);
});

test("unknown, spoofed, or mismatched hosts use the generic safe model", async () => {
  for (const hostHeader of ["evil.example", `${HOSTNAME}:443`, HOSTNAME.toUpperCase()]) {
    const model = await resolveTenantAdminLoginModel({
      hostHeader,
      clock: () => new Date("2026-07-30T10:00:00.000Z"),
      async resolveRuntime() { return null; },
    });
    assert.deepEqual(model, {
      kind: "generic",
      displayName: "Celebix",
      logoUrl: null,
      accentColor: "#ff6500",
      canonicalAdminOrigin: null,
      loginHref: "/auth/login",
    });
  }
});
