import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveUmamiConfigFromEnv } from "./umami-config";

describe("resolveUmamiConfigFromEnv", () => {
  it("accepts supported alias keys without exposing values in presence metadata", () => {
    const result = resolveUmamiConfigFromEnv({
      storeSlug: "hemenaku",
      env: {
        NEXT_PUBLIC_UMAMI_BASE_URL: "https://analytics.example.test",
        UMAMI_MANAGEMENT_TOKEN: "server-management-token",
        UMAMI_SITE_ID: "site-id",
      },
    });

    assert.equal(result.presence.configured, true);
    assert.equal(result.presence.baseUrlPresent, true);
    assert.equal(result.presence.apiTokenPresent, true);
    assert.equal(result.presence.websiteIdPresent, true);
    assert.deepEqual(result.presence.selectedKeys, {
      baseUrl: "NEXT_PUBLIC_UMAMI_BASE_URL",
      apiToken: "UMAMI_MANAGEMENT_TOKEN",
      websiteId: "UMAMI_SITE_ID",
    });
  });

  it("uses scoped primary keys before global primary and alias keys", () => {
    const result = resolveUmamiConfigFromEnv({
      storeSlug: "hemenaku",
      env: {
        UMAMI_BASE_URL: "https://global-primary.example.test",
        UMAMI_BASE_URL_HEMENAKU: "https://scoped-primary.example.test",
        NEXT_PUBLIC_UMAMI_BASE_URL_HEMENAKU: "https://scoped-alias.example.test",
        UMAMI_API_TOKEN: "global-primary-token",
        UMAMI_API_TOKEN_HEMENAKU: "scoped-primary-token",
        UMAMI_MANAGEMENT_TOKEN_HEMENAKU: "scoped-alias-token",
        UMAMI_WEBSITE_ID: "global-primary-site",
        UMAMI_WEBSITE_ID_HEMENAKU: "scoped-primary-site",
        UMAMI_SITE_ID_HEMENAKU: "scoped-alias-site",
      },
    });

    assert.equal(result.config?.baseUrl, "https://scoped-primary.example.test");
    assert.deepEqual(result.presence.selectedKeys, {
      baseUrl: "UMAMI_BASE_URL_HEMENAKU",
      apiToken: "UMAMI_API_TOKEN_HEMENAKU",
      websiteId: "UMAMI_WEBSITE_ID_HEMENAKU",
    });
  });

  it("does not treat public token names as server-side API tokens", () => {
    const result = resolveUmamiConfigFromEnv({
      storeSlug: "hemenaku",
      env: {
        UMAMI_BASE_URL: "https://analytics.example.test",
        NEXT_PUBLIC_UMAMI_API_TOKEN: "must-not-be-used",
        UMAMI_WEBSITE_ID: "site-id",
      },
    });

    assert.equal(result.config, null);
    assert.equal(result.presence.configured, false);
    assert.equal(result.presence.apiTokenPresent, false);
    assert.equal(result.presence.selectedKeys.apiToken, null);
  });
});
