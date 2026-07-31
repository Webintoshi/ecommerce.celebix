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

function healthyInput() {
  return {
    environment: "staging",
    now: NOW,
    certificates: [
      {
        role: "admin",
        hostname: "probe.admin.saas-staging.celebix.site",
        subjectAltName: "DNS:*.admin.saas-staging.celebix.site",
        validTo: "2026-10-31T10:00:00.000Z",
      },
      {
        role: "storefront",
        hostname: "probe.saas-staging.celebix.site",
        subjectAltName: "DNS:*.saas-staging.celebix.site",
        validTo: "2026-10-31T10:00:00.000Z",
      },
    ],
    http: {
      knownAdmin: { hostname: "guzide.admin.saas-staging.celebix.site", status: 307, bodySha256: SHA.admin },
      knownStorefront: { hostname: "guzide.saas-staging.celebix.site", status: 200, bodySha256: SHA.storefront },
      unknownAdmin: { hostname: "probe.admin.saas-staging.celebix.site", status: 503, bodySha256: SHA.unknownAdmin },
      unknownStorefront: { hostname: "probe.saas-staging.celebix.site", status: 404, bodySha256: SHA.unknownStorefront },
      panel: { hostname: "panel.saas-staging.celebix.site", status: 307, bodySha256: SHA.panel },
      auth: { hostname: "auth.saas-staging.celebix.site", status: 302, bodySha256: SHA.auth },
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
