import assert from "node:assert/strict";
import test from "node:test";

import {
  certificateCoversHostname,
  certificateHealth,
  evaluateTenantWildcardReadiness,
  parseSubjectAlternativeNames,
} from "./verify-tenant-wildcard-readiness.mjs";

const NOW = new Date("2026-07-31T10:00:00.000Z");
const SHA = Object.freeze({
  admin: "1".repeat(64),
  storefront: "2".repeat(64),
  unknownAdmin: "3".repeat(64),
  unknownStorefront: "4".repeat(64),
  panel: "5".repeat(64),
  auth: "6".repeat(64),
});

function healthyInput(environment = "staging") {
  const hosts = {
    staging: {
      admin: "admin.saas-staging.celebix.site",
      storefront: "saas-staging.celebix.site",
      panel: "panel.saas-staging.celebix.site",
      auth: "auth.saas-staging.celebix.site",
    },
    staging_net: {
      admin: "admin.saas-staging.celebix.net",
      storefront: "saas-staging.celebix.net",
      panel: "panel.saas-staging.celebix.net",
      auth: "auth.saas-staging.celebix.site",
    },
    production: {
      admin: "admin.celebix.site",
      storefront: "celebix.site",
      panel: "panel.celebix.site",
      auth: "auth.celebix.site",
    },
  }[environment];
  return {
    environment,
    now: NOW,
    certificates: [
      {
        role: "admin",
        hostname: `probe.${hosts.admin}`,
        subjectAltName: `DNS:*.${hosts.admin}`,
        validTo: "2026-10-31T10:00:00.000Z",
      },
      {
        role: "storefront",
        hostname: `probe.${hosts.storefront}`,
        subjectAltName: `DNS:*.${hosts.storefront}`,
        validTo: "2026-10-31T10:00:00.000Z",
      },
    ],
    http: {
      knownAdmin: { hostname: `guzide.${hosts.admin}`, status: 307, bodySha256: SHA.admin },
      knownStorefront: { hostname: `guzide.${hosts.storefront}`, status: 200, bodySha256: SHA.storefront },
      unknownAdmin: { hostname: `probe.${hosts.admin}`, status: 503, bodySha256: SHA.unknownAdmin },
      unknownStorefront: { hostname: `probe.${hosts.storefront}`, status: 404, bodySha256: SHA.unknownStorefront },
      panel: { hostname: hosts.panel, status: 307, bodySha256: SHA.panel },
      auth: { hostname: hosts.auth, status: 302, bodySha256: SHA.auth },
    },
  };
}

test("parses and matches exact and one-label wildcard certificate SANs", () => {
  assert.deepEqual(
    parseSubjectAlternativeNames("DNS:*.admin.saas-staging.celebix.site, DNS:panel.saas-staging.celebix.site"),
    ["*.admin.saas-staging.celebix.site", "panel.saas-staging.celebix.site"],
  );
  assert.equal(
    certificateCoversHostname("DNS:*.admin.saas-staging.celebix.site", "guzide.admin.saas-staging.celebix.site"),
    true,
  );
  assert.equal(
    certificateCoversHostname("DNS:*.saas-staging.celebix.site", "nested.shop.saas-staging.celebix.site"),
    false,
  );
  assert.equal(certificateCoversHostname("DNS:*.celebix.site", "celebix.site"), false);
});

test("classifies certificate renewal thresholds without rounding unsafe time up", () => {
  assert.deepEqual(certificateHealth("2026-09-01T10:00:00.000Z", NOW), { kind: "healthy", remainingDays: 32 });
  assert.deepEqual(certificateHealth("2026-08-20T10:00:00.000Z", NOW), { kind: "warning", remainingDays: 20 });
  assert.deepEqual(certificateHealth("2026-08-10T09:59:59.999Z", NOW), { kind: "critical", remainingDays: 9 });
  assert.deepEqual(certificateHealth("not-a-date", NOW), { kind: "invalid", remainingDays: null });
});

test("accepts separated admin/storefront routes, preserved platform hosts, and fail-closed unknown hosts", () => {
  const result = evaluateTenantWildcardReadiness(healthyInput());
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
});

test("accepts NET staging wildcard routes with the NET panel and shared SITE Logto host", () => {
  assert.deepEqual(evaluateTenantWildcardReadiness(healthyInput("staging_net")), {
    ok: true,
    errors: [],
    warnings: [],
  });
});

test("rejects SITE certificates and incorrect platform hosts for NET staging", () => {
  const input = healthyInput("staging_net");
  input.certificates[0].subjectAltName = "DNS:*.admin.saas-staging.celebix.site";
  input.certificates[1].hostname = "probe.saas-staging.celebix.site";
  input.http.panel.hostname = "panel.saas-staging.celebix.site";
  input.http.auth.hostname = "auth.saas-staging.celebix.net";
  const result = evaluateTenantWildcardReadiness(input);
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("admin_certificate_hostname_not_covered"));
  assert.ok(result.errors.includes("admin_certificate_wildcard_missing"));
  assert.ok(result.errors.includes("storefront_certificate_probe_invalid"));
  assert.ok(result.errors.includes("panel_platform_host_unhealthy"));
  assert.ok(result.errors.includes("auth_platform_host_unhealthy"));
});

test("rejects accepted unknown NET tenants and NET platform route collisions", () => {
  const input = healthyInput("staging_net");
  input.http.unknownAdmin.status = 200;
  input.http.unknownStorefront.status = 302;
  input.http.panel.bodySha256 = input.http.knownStorefront.bodySha256;
  input.http.auth.bodySha256 = input.http.knownStorefront.bodySha256;
  const result = evaluateTenantWildcardReadiness(input);
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("unknown_admin_tenant_accepted"));
  assert.ok(result.errors.includes("unknown_storefront_tenant_accepted"));
  assert.ok(result.errors.includes("panel_storefront_route_collision"));
  assert.ok(result.errors.includes("auth_storefront_route_collision"));
});

test("preserves SITE staging and production platform host isolation", () => {
  for (const environment of ["staging", "production"]) {
    const input = healthyInput(environment);
    assert.equal(evaluateTenantWildcardReadiness(input).ok, true, environment);
    input.http.panel.hostname = "panel.saas-staging.celebix.net";
    input.http.auth.hostname = "auth.saas-staging.celebix.net";
    const result = evaluateTenantWildcardReadiness(input);
    assert.equal(result.ok, false, environment);
    assert.ok(result.errors.includes("panel_platform_host_unhealthy"), environment);
    assert.ok(result.errors.includes("auth_platform_host_unhealthy"), environment);
  }
});

test("rejects unsupported environments instead of choosing a staging default", () => {
  const input = healthyInput();
  input.environment = "staging_preview";
  assert.deepEqual(evaluateTenantWildcardReadiness(input), {
    ok: false,
    errors: ["readiness_input_invalid"],
    warnings: [],
  });
});

test("rejects wrong SANs, unsafe expiry, cross-routed bodies, broken platform hosts, and accepted unknown tenants", () => {
  const input = healthyInput();
  input.certificates[0].subjectAltName = "DNS:other.example";
  input.certificates[1].validTo = "2026-08-05T10:00:00.000Z";
  input.http.knownAdmin.bodySha256 = input.http.knownStorefront.bodySha256;
  input.http.unknownAdmin.status = 200;
  input.http.unknownStorefront.status = 200;
  input.http.panel.status = 503;
  input.http.auth.bodySha256 = input.http.knownStorefront.bodySha256;
  const result = evaluateTenantWildcardReadiness(input);
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("admin_certificate_hostname_not_covered"));
  assert.ok(result.errors.includes("storefront_certificate_expiry_critical"));
  assert.ok(result.errors.includes("admin_storefront_route_collision"));
  assert.ok(result.errors.includes("unknown_admin_tenant_accepted"));
  assert.ok(result.errors.includes("unknown_storefront_tenant_accepted"));
  assert.ok(result.errors.includes("panel_platform_host_unhealthy"));
  assert.ok(result.errors.includes("auth_storefront_route_collision"));
});
