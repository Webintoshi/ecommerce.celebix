import assert from "node:assert/strict";
import test from "node:test";

import { resolveCampaignPageProjection, withCampaignPresentation } from "./campaign-page-resolution.ts";

const legacyStorefront = Object.freeze({ presentation: Object.freeze({ schemaVersion: 1 }) });
const campaignStorefront = Object.freeze({ presentation: Object.freeze({ schemaVersion: 2 }) });
const retailStorefront = Object.freeze({ presentation: Object.freeze({ schemaVersion: 3 }) });

test("legacy storefronts never request a campaign projection", async () => {
  let calls = 0;
  const result = await resolveCampaignPageProjection({
    storefront: legacyStorefront as never,
    repository: { resolveCampaignHome: async () => { calls += 1; return null; } } as never,
    now: new Date("2026-08-02T00:00:00.000Z"),
  });
  assert.deepEqual(result, { kind: "legacy" });
  assert.equal(calls, 0);
});

test("schema-v2 storefronts expose only a complete campaign projection", async () => {
  const projection = Object.freeze({ presentation: Object.freeze({ schemaVersion: 2 }) });
  let calls = 0;
  const result = await resolveCampaignPageProjection({
    storefront: campaignStorefront as never,
    repository: { resolveCampaignHome: async () => { calls += 1; return projection; } } as never,
    now: new Date("2026-08-02T00:00:00.000Z"),
  });
  assert.deepEqual(result, { kind: "campaign", projection });
  assert.equal(calls, 1);
});

test("schema-v3 storefronts resolve the complete retail campaign projection", async () => {
  const projection = Object.freeze({ presentation: Object.freeze({ schemaVersion: 3 }) });
  let calls = 0;
  const result = await resolveCampaignPageProjection({
    storefront: retailStorefront as never,
    repository: { resolveCampaignHome: async () => { calls += 1; return projection; } } as never,
    now: new Date("2026-08-02T00:00:00.000Z"),
  });
  assert.deepEqual(result, { kind: "campaign", projection });
  assert.equal(calls, 1);
});

test("campaign presentation becomes the canonical frame presentation on every page", () => {
  const storefront = Object.freeze({ ...campaignStorefront, hostname: "shop.example.test", canonicalUrl: "https://shop.example.test" });
  const projection = Object.freeze({ presentation: Object.freeze({ schemaVersion: 3, displayName: "Retail v3" }), productRows: Object.freeze([]) });
  const resolved = withCampaignPresentation(storefront as never, projection as never);
  assert.notEqual(resolved, storefront);
  assert.equal(resolved.hostname, storefront.hostname);
  assert.equal(resolved.presentation, projection.presentation);
  assert.equal(resolved.presentation.schemaVersion, 3);
});

test("schema-v2 storefronts fail closed when campaign authority is missing, empty, or broken", async () => {
  for (const repository of [
    {},
    { resolveCampaignHome: async () => null },
    { resolveCampaignHome: async () => { throw new Error("database_unavailable"); } },
  ]) {
    const result = await resolveCampaignPageProjection({
      storefront: campaignStorefront as never,
      repository: repository as never,
      now: new Date("2026-08-02T00:00:00.000Z"),
    });
    assert.deepEqual(result, { kind: "unavailable" });
  }
});
