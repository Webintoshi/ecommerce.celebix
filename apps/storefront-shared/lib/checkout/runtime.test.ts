import assert from "node:assert/strict";
import test from "node:test";

import { createCheckoutRuntime } from "./runtime.ts";

const storefrontRepository = { getPublicStorefront: async () => { throw new Error("unused"); }, listPublicProducts: async () => ({ items: [] }), listPublicProductsByCategory: async () => { throw new Error("unused"); }, getPublicProductBySlug: async () => { throw new Error("unused"); }, listPublicProductMedia: async () => [], getPublicStorefrontDesign: async () => { throw new Error("unused"); } };
const quickOrderRepository = { claimRedemption: async () => { throw new Error("unused"); }, resolveRedemption: async () => { throw new Error("unused"); }, getStatus: async () => ({ kind: "unavailable" as const }), revokeRedemption: async () => undefined };

test("creates an immutable runtime with only public storefront and workflow repositories", () => {
  const runtime = createCheckoutRuntime({ storefrontRepository, quickOrderRepository });
  assert.equal(runtime.storefrontRepository, storefrontRepository);
  assert.equal(runtime.quickOrderRepository, quickOrderRepository);
  assert.equal(Object.isFrozen(runtime), true);
});

test("rejects unknown runtime authority fields", () => {
  assert.throws(() => createCheckoutRuntime({ storefrontRepository, quickOrderRepository, storeId: "browser" } as never), /checkout_runtime_invalid/);
});

test("rejects missing or malformed repository method surfaces", () => {
  assert.throws(() => createCheckoutRuntime({ storefrontRepository: {}, quickOrderRepository } as never), /checkout_runtime_invalid/);
  assert.throws(() => createCheckoutRuntime({ storefrontRepository, quickOrderRepository: {} } as never), /checkout_runtime_invalid/);
});

test("runtime surface contains no private provider, token, or tenant authority", () => {
  assert.deepEqual(Object.keys(createCheckoutRuntime({ storefrontRepository, quickOrderRepository })).sort(), ["quickOrderRepository", "storefrontRepository"]);
});
