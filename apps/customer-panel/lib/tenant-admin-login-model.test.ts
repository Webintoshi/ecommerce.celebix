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

test("starts central login for an exact resolved custom admin hostname", async () => {
  const hostname = "admin.guzidekuyumcu.com.tr";
  const origin = `https://${hostname}`;
  const model = await resolveTenantAdminLoginModel({
    hostHeader: `${hostname}:443`,
    clock: () => new Date("2026-09-02T10:00:00.000Z"),
    async resolveRuntime() { return {
      access: { panelOrigin: PANEL },
      adminDomains: { async resolvePublicBrand() { return { kind: "resolved", brand: {
        storeSlug: "guzide-kuyumcu-4", displayName: "Güzide Kuyumcu", logoUrl: null,
        accentColor: null, canonicalAdminOrigin: origin,
      } }; } },
    }; },
  });
  assert.equal(model.kind, "tenant");
  assert.equal(model.canonicalAdminOrigin, origin);
  assert.equal(model.loginHref, `${PANEL}/auth/login?destination=${hostname}`);
});

test("unknown, spoofed, or mismatched hosts use the generic safe model", async () => {
  for (const hostHeader of ["evil.example", `${HOSTNAME}:not-a-port`, HOSTNAME.toUpperCase()]) {
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

test("valid staging admin hosts keep a central login destination when branding is temporarily unavailable", async () => {
  const model = await resolveTenantAdminLoginModel({
    hostHeader: HOSTNAME,
    clock: () => new Date("2026-07-30T10:00:00.000Z"),
    async resolveRuntime() { return null; },
  });
  assert.deepEqual(model, {
    kind: "generic",
    displayName: "Celebix",
    logoUrl: null,
    accentColor: "#ff6500",
    canonicalAdminOrigin: null,
    loginHref: `${PANEL}/auth/login?destination=${HOSTNAME}`,
  });
});

test("staging login model refuses a production canonical admin destination", async () => {
  const model = await resolveTenantAdminLoginModel({
    hostHeader: HOSTNAME,
    clock: () => new Date("2026-07-30T10:00:00.000Z"),
    async resolveRuntime() {
      return {
        access: { panelOrigin: PANEL },
        adminDomains: { async resolvePublicBrand() { return { kind: "resolved", brand: {
          storeSlug: "guzide-kuyumcu-4",
          displayName: "Güzide Kuyumcu",
          logoUrl: null,
          accentColor: "#b58a4a",
          canonicalAdminOrigin: "https://guzide-kuyumcu-4.admin.celebix.site",
        } }; } },
      };
    },
  });
  assert.equal(model.kind, "generic");
  assert.equal(model.loginHref, "/auth/login");
});
