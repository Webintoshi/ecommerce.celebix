import assert from "node:assert/strict";
import test from "node:test";
import { createLoyaltyDraft, draftForProgram, loyaltyConfigFor } from "./model.ts";

const ID = "11111111-1111-4111-8111-111111111111";
test("spend targets and rewards use exact minor units while purchase targets remain counts", () => {
  const money = loyaltyConfigFor({ ...createLoyaltyDraft("spend_discount"), target: "2000,05", amount: "150,01", minimumBasket: "0,10" }, "Europe/Istanbul");
  assert.equal(money.target, 200005); assert.deepEqual(money.reward, { kind: "discount", amountMinor: 15001 }); assert.equal(money.minimumBasketMinor, 10);
  assert.equal(loyaltyConfigFor(createLoyaltyDraft("purchase_shipping"), "Europe/Istanbul").target, 3);
  assert.throws(() => loyaltyConfigFor({ ...createLoyaltyDraft("purchase_shipping"), target: "3,5" }, "Europe/Istanbul"));
});
test("new programs keep approved repeat, carryover, channel and expiry defaults without silently choosing a gift", () => {
  const draft = createLoyaltyDraft("product_gift");
  assert.throws(() => loyaltyConfigFor(draft, "Europe/Istanbul"), /Hediye/);
  assert.throws(() => loyaltyConfigFor({ ...draft, variantId: ID }, "Europe/Istanbul"), /ürünleri/);
  const config = loyaltyConfigFor({ ...draft, variantId: ID, eligibleProductIds: [ID] }, "Europe/Istanbul");
  assert.equal(config.target, 5); assert.equal(config.repeat, true); assert.equal(config.allowCombination, false); assert.equal(config.allowMultiplePrograms, false);
  assert.equal(config.progressExpiryDays, null); assert.equal(config.rewardExpiryDays, null); assert.deepEqual(config.channels, ["storefront", "in_store", "manual"]);
});
test("earning schedule uses store civil dates and editing preserves an inclusive end date", () => {
  const config = loyaltyConfigFor({ ...createLoyaltyDraft("purchase_shipping"), startsOn: "2026-11-04", endsOn: "2026-11-05" }, "Europe/Istanbul");
  assert.equal(config.startsAt, "2026-11-03T21:00:00.000Z"); assert.equal(config.endsAt, "2026-11-05T21:00:00.000Z");
  const draft = draftForProgram({ id: ID, version: 1, name: "Kargo", status: "active", config, createdAt: "2026-11-04T00:00:00Z", updatedAt: "2026-11-04T00:00:00Z" });
  assert.equal(draft.startsOn, "2026-11-04"); assert.equal(draft.endsOn, "2026-11-05");
});
