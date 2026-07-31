import assert from "node:assert/strict";
import test from "node:test";

import {
  createCanonicalAdminOrigin,
  createCanonicalAdminOriginFromPanelOrigin,
  createPanelStoreUrl,
  normalizeExactHttpsOrigin,
  parseCanonicalAdminOriginFromPanelOrigin,
  parseCanonicalAdminHostname,
} from "./panel-origin.ts";

test("exact HTTPS origins accept canonical roots and normalize one trailing slash", () => {
  assert.equal(normalizeExactHttpsOrigin("https://panel.celebix.site"), "https://panel.celebix.site");
  assert.equal(normalizeExactHttpsOrigin("https://panel.example.test/"), "https://panel.example.test");
  assert.equal(createPanelStoreUrl("https://panel.example.test/", "tenant-a"), "https://panel.example.test/stores/tenant-a");
});

test("exact HTTPS origins reject authority, path, encoding, and protocol ambiguity", () => {
  for (const value of [
    "http://panel.example.test",
    "https://user:password@panel.example.test",
    "https://panel.example.test?query=1",
    "https://panel.example.test#fragment",
    "https://panel.example.test/path",
    "https://panel.example.test//",
    "https://panel.example.test/%2Fconfused",
    "https://panel.example.test/path/extra",
    "/relative",
    "not a url",
    "https:///empty-host",
    "",
  ]) assert.throws(() => normalizeExactHttpsOrigin(value), /invalid_exact_https_origin/, value);
});

test("creates exact production and staging tenant admin origins", () => {
  assert.equal(
    createCanonicalAdminOrigin("guzide-kuyumcu-4", "production"),
    "https://guzide-kuyumcu-4.admin.celebix.site",
  );
  assert.equal(
    createCanonicalAdminOrigin("guzide-kuyumcu-4", "staging"),
    "https://guzide-kuyumcu-4.admin.saas-staging.celebix.site",
  );
});

test("derives only the approved production or staging admin environment from the panel origin", () => {
  assert.equal(
    createCanonicalAdminOriginFromPanelOrigin("https://panel.celebix.site", "guzide-kuyumcu-4"),
    "https://guzide-kuyumcu-4.admin.celebix.site",
  );
  assert.equal(
    createCanonicalAdminOriginFromPanelOrigin("https://panel.saas-staging.celebix.site/", "guzide-kuyumcu-4"),
    "https://guzide-kuyumcu-4.admin.saas-staging.celebix.site",
  );
  for (const origin of [
    "https://panel.example.test",
    "https://guzide-kuyumcu-4.admin.celebix.site",
    "https://panel.saas-staging.celebix.site.attacker.test",
  ]) {
    assert.throws(
      () => createCanonicalAdminOriginFromPanelOrigin(origin, "guzide-kuyumcu-4"),
      /invalid_exact_https_origin/,
      origin,
    );
  }
});

test("parses a canonical tenant admin origin only in the central panel environment", () => {
  assert.deepEqual(
    parseCanonicalAdminOriginFromPanelOrigin(
      "https://guzide-kuyumcu-4.admin.saas-staging.celebix.site",
      "https://panel.saas-staging.celebix.site",
    ),
    {
      origin: "https://guzide-kuyumcu-4.admin.saas-staging.celebix.site",
      hostname: "guzide-kuyumcu-4.admin.saas-staging.celebix.site",
      storeSlug: "guzide-kuyumcu-4",
      environment: "staging",
    },
  );
  assert.deepEqual(
    parseCanonicalAdminOriginFromPanelOrigin(
      "https://guzide-kuyumcu-4.admin.celebix.site",
      "https://panel.celebix.site",
    ),
    {
      origin: "https://guzide-kuyumcu-4.admin.celebix.site",
      hostname: "guzide-kuyumcu-4.admin.celebix.site",
      storeSlug: "guzide-kuyumcu-4",
      environment: "production",
    },
  );
});

test("rejects canonical admin origins from the other panel environment", () => {
  for (const [canonicalAdminOrigin, panelOrigin] of [
    ["https://guzide-kuyumcu-4.admin.celebix.site", "https://panel.saas-staging.celebix.site"],
    ["https://guzide-kuyumcu-4.admin.saas-staging.celebix.site", "https://panel.celebix.site"],
    ["https://admin.hemenaku.com", "https://panel.saas-staging.celebix.site"],
    ["https://guzide-kuyumcu-4.admin.saas-staging.celebix.site/", "https://panel.saas-staging.celebix.site"],
  ] as const) {
    assert.throws(
      () => parseCanonicalAdminOriginFromPanelOrigin(canonicalAdminOrigin, panelOrigin),
      /invalid_exact_https_origin/,
      `${panelOrigin}:${canonicalAdminOrigin}`,
    );
  }
});

test("parses only exact canonical tenant admin hostnames", () => {
  assert.equal(
    parseCanonicalAdminHostname("guzide-kuyumcu-4.admin.celebix.site", "production"),
    "guzide-kuyumcu-4",
  );
  assert.equal(
    parseCanonicalAdminHostname("guzide-kuyumcu-4.admin.saas-staging.celebix.site", "staging"),
    "guzide-kuyumcu-4",
  );
});

test("rejects ambiguous admin origins, slugs, environments, and hostnames", () => {
  for (const slug of ["", "Guzide", "-guzide", "guzide-", "guzide--kuyumcu", "güzide", "admin.celebix.site"]) {
    assert.throws(
      () => createCanonicalAdminOrigin(slug, "production"),
      /invalid_exact_https_origin/,
      `slug=${slug}`,
    );
  }

  assert.throws(
    () => createCanonicalAdminOrigin("guzide", "preview" as "production"),
    /invalid_exact_https_origin/,
  );

  for (const [hostname, environment] of [
    ["GUZIDE.admin.celebix.site", "production"],
    ["guzide.admin.celebix.site.", "production"],
    ["guzide.admin.celebix.site:443", "production"],
    ["guzide.admin.celebix.site/path", "production"],
    ["guzide.admin.celebix.site?query=1", "production"],
    ["guzide.admin.celebix.site#fragment", "production"],
    ["user@guzide.admin.celebix.site", "production"],
    ["güzide.admin.celebix.site", "production"],
    ["guzide.admin.evil.test", "production"],
    ["guzide.admin.saas-staging.celebix.site", "production"],
    ["guzide.admin.celebix.site", "staging"],
  ] as const) {
    assert.throws(
      () => parseCanonicalAdminHostname(hostname, environment),
      /invalid_exact_https_origin/,
      `${environment}:${hostname}`,
    );
  }
});
