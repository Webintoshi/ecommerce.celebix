import assert from "node:assert/strict";
import test from "node:test";

import type { VariantPricingPolicy } from "@celebix/saas-contracts";

const SET = "20000000-0000-4000-8000-000000000001";
const REFERENCE = "30000000-0000-4000-8000-000000000001";
const VARIANT = "40000000-0000-4000-8000-000000000001";
const PRODUCT = "50000000-0000-4000-8000-000000000001";
const OP = "60000000-0000-4000-8000-000000000001";
const UTC = "2026-09-20T12:00:00.000000Z";
const DIGEST = "a".repeat(64);

const identity = { id: REFERENCE, kind: "usd" as const, label: "USD satış", createdAt: UTC };
const set = { setId: SET, version: 1, stateVersion: 2, isActive: false, createdAt: UTC, values: [{ referenceId: REFERENCE, kind: "usd" as const, label: "USD satış", rateTry: "40.5", active: true }] };
const policy: VariantPricingPolicy = { method: "fixed_try", fixedPriceCents: 12_000 };
const projection = { variantId: VARIANT, variantVersion: 4, version: 1, policy, updatedAt: UTC };
const preview = { setId: SET, scopeDigest: DIGEST, affectedProducts: 1, affectedVariants: 1, fixedOverrideVariants: 0, unavailableVariants: 0, entries: [{ variantId: VARIANT, productId: PRODUCT, oldPriceCents: 10_000, newPriceCents: 12_000, overriddenByPriceList: false }], nextCursor: null };
const candidate = { variantId: VARIANT, oldPriceCents: 10_000, newPriceCents: 12_000, sourceKind: "base" as const, priceListId: null, activeSetId: null, activeSetVersion: null, referenceId: null, referenceRateTry: null, method: "fixed_try" as const, metalComponentTry: null, laborTry: null, policyVersion: 1, variantVersion: 4, scopeDigest: DIGEST };

async function clientModule() { return import("./client.ts"); }

test("reference-pricing browser client uses finite same-origin routes and server-owned authority", async () => {
  const { createReferencePricingApi } = await clientModule();
  const calls: Array<[string, RequestInit | undefined]> = [];
  const api = createReferencePricingApi(async (input, init) => {
    const path = String(input);
    calls.push([path, init]);
    if (path.endsWith("/definitions")) return Response.json(init?.method === "POST" ? identity : { items: [identity] });
    if (path.endsWith(`/policies/${VARIANT}/preview`)) return Response.json(candidate);
    if (path.endsWith("/preview")) return Response.json(preview);
    if (path.endsWith("/activate")) return Response.json({ setId: SET, version: 1, stateVersion: 3, activatedAt: UTC });
    if (path.endsWith(`/policies/${VARIANT}`)) return Response.json(projection);
    if (path.includes("/sets?") || path.endsWith("/sets")) return Response.json(init?.method === "POST" ? set : { activeSetId: null, stateVersion: 2, items: [{ setId: SET, version: 1, createdAt: UTC, isActive: false }], nextCursor: null });
    return Response.json(set);
  }, () => OP);
  await api.listDefinitions();
  await api.listSets({ pageSize: 20, afterSetVersion: 2 });
  await api.getSet();
  await api.getSet(SET);
  await api.getPolicy(VARIANT);
  await api.preview({ setId: SET, channel: "storefront", pageSize: 50 });
  await api.previewPolicy({ variantId: VARIANT, policy, channel: "storefront" });
  await api.define({ referenceId: REFERENCE, kind: "usd", label: "USD satış" });
  await api.saveSet({ setId: SET, expectedStateVersion: 2, values: [{ referenceId: REFERENCE, rateTry: "40.5", active: true }] });
  await api.activate({ setId: SET, expectedStateVersion: 2, expectedScopeDigest: DIGEST });
  await api.savePolicy({ variantId: VARIANT, expectedVariantVersion: 4, expectedPolicyVersion: 1, expectedScopeDigest: DIGEST, policy });
  assert.deepEqual(calls.map(([path]) => path), [
    "/api/reference-pricing/definitions", "/api/reference-pricing/sets?pageSize=20&afterSetVersion=2",
    "/api/reference-pricing/sets/current", `/api/reference-pricing/sets/${SET}`,
    `/api/reference-pricing/policies/${VARIANT}`, "/api/reference-pricing/preview",
    `/api/reference-pricing/policies/${VARIANT}/preview`,
    "/api/reference-pricing/definitions", "/api/reference-pricing/sets",
    `/api/reference-pricing/sets/${SET}/activate`, `/api/reference-pricing/policies/${VARIANT}`,
  ]);
  for (const [, init] of calls) {
    assert.equal(init?.credentials, "same-origin");
    assert.equal(init?.cache, "no-store");
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      for (const forbidden of ["storeId", "tenantId", "principalId", "membershipId", "basePriceCents", "effectivePriceCents"]) assert.equal(Object.hasOwn(body, forbidden), false);
      assert.equal(Object.hasOwn(body, "operationId"), !Object.hasOwn(body, "channel"));
    }
  }
  assert.equal(JSON.parse(String(calls[7]?.[1]?.body)).operationId, OP);
  assert.deepEqual(JSON.parse(String(calls[5]?.[1]?.body)), { setId: SET, channel: "storefront", pageSize: 50 });
  assert.deepEqual(JSON.parse(String(calls[6]?.[1]?.body)), { policy, channel: "storefront" });
});

test("policy preview rejects uncorrelated or malformed server traces and stays read-only over POST", async () => {
  const { createReferencePricingApi, ReferencePricingApiError } = await clientModule();
  for (const hostile of [
    { ...candidate, variantId: PRODUCT },
    { ...candidate, method: "usd" },
    { ...candidate, scopeDigest: "bad" },
    { ...candidate, referenceRateTry: "40", referenceId: REFERENCE },
    { ...candidate, tenantId: PRODUCT },
  ]) {
    const api = createReferencePricingApi(async () => Response.json(hostile), () => OP);
    await assert.rejects(() => api.previewPolicy({ variantId: VARIANT, policy, channel: "storefront" }), (error: unknown) => error instanceof ReferencePricingApiError && error.code === "unavailable");
  }
  let calls = 0;
  const api = createReferencePricingApi(async (_path, init) => { calls += 1; assert.equal(init?.method, "POST"); return Response.json(candidate); }, () => OP);
  assert.deepEqual(await api.previewPolicy({ variantId: VARIANT, policy, channel: "storefront" }), candidate);
  assert.equal(calls, 1);
  const unresolvedOld = { ...candidate, oldPriceCents: null, sourceKind: null };
  const unresolvedOldApi = createReferencePricingApi(async () => Response.json(unresolvedOld), () => OP);
  assert.deepEqual(await unresolvedOldApi.previewPolicy({ variantId: VARIANT, policy, channel: "storefront" }), unresolvedOld);
  await assert.rejects(() => api.previewPolicy({ variantId: VARIANT, policy, channel: "quick_order" as never }), /reference_pricing_client_invalid/);
  await assert.rejects(() => api.savePolicy({ variantId: VARIANT, expectedVariantVersion: 4, expectedPolicyVersion: 1, policy } as never), /reference_pricing_client_invalid/);
  assert.equal(calls, 1);
});

test("reference-pricing client rejects unapproved inputs before fetch and unexpected outputs after fetch", async () => {
  const { createReferencePricingApi, ReferencePricingApiError } = await clientModule();
  let calls = 0;
  const api = createReferencePricingApi(async () => { calls += 1; return Response.json({ ...set, storeId: PRODUCT }); }, () => OP);
  await assert.rejects(() => api.getSet("invalid"), /reference_pricing_client_invalid/);
  await assert.rejects(() => api.saveSet({ setId: SET, expectedStateVersion: 2, values: [{ referenceId: REFERENCE, rateTry: "0", active: true }] }), /reference_pricing_client_invalid/);
  await assert.rejects(() => api.preview({ setId: SET, channel: "storefront", pageSize: 0 }), /reference_pricing_client_invalid/);
  await assert.rejects(() => api.define({ referenceId: REFERENCE, kind: "usd", label: "USD satış", storeId: PRODUCT } as never), /reference_pricing_client_invalid/);
  assert.equal(calls, 0);
  await assert.rejects(() => api.getSet(SET), (error: unknown) => error instanceof ReferencePricingApiError && error.code === "unavailable");
  assert.equal(calls, 1);
});

test("reference-pricing preview validates requested set and page bounds, never invents prices", async () => {
  const { createReferencePricingApi, ReferencePricingApiError } = await clientModule();
  for (const hostile of [{ ...preview, setId: PRODUCT }, { ...preview, entries: [...preview.entries, ...preview.entries] }, { ...preview, scopeDigest: "bad" }]) {
    const api = createReferencePricingApi(async () => Response.json(hostile), () => OP);
    await assert.rejects(() => api.preview({ setId: SET, channel: "storefront", pageSize: 1 }), (error: unknown) => error instanceof ReferencePricingApiError && error.code === "unavailable");
  }
});

test("reference-pricing client maps only finite API errors and never retries an uncertain mutation", async () => {
  const { createReferencePricingApi, ReferencePricingApiError, referencePricingErrorState } = await clientModule();
  let calls = 0;
  const api = createReferencePricingApi(async () => { calls += 1; throw new Error("network failed after request"); }, () => OP);
  await assert.rejects(() => api.activate({ setId: SET, expectedStateVersion: 2, expectedScopeDigest: DIGEST }), (error: unknown) => error instanceof ReferencePricingApiError && error.code === "verification_unavailable");
  assert.equal(calls, 1);
  assert.equal(referencePricingErrorState(new ReferencePricingApiError("verification_unavailable", 503)), "verification_unavailable");
  const conflict = createReferencePricingApi(async () => Response.json({ code: "conflict" }, { status: 409 }), () => OP);
  await assert.rejects(() => conflict.getSet(SET), (error: unknown) => error instanceof ReferencePricingApiError && error.code === "conflict");
  const hostile = createReferencePricingApi(async () => Response.json({ code: "conflict", details: "private" }, { status: 409 }), () => OP);
  await assert.rejects(() => hostile.getSet(SET), (error: unknown) => error instanceof ReferencePricingApiError && error.code === "unavailable");
});
