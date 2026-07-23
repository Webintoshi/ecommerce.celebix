import assert from "node:assert/strict";
import test from "node:test";

import {
  PRICE_CHANNELS,
  PRICE_LIST_STATUSES,
  PRICE_SOURCE_KINDS,
  parseEffectivePrice,
  parsePriceList,
  parsePriceListItem,
  parsePriceListRule,
} from "./index.ts";

const NOW = "2026-07-23T12:00:00.000Z";
const LATER = "2026-07-24T12:00:00.000Z";
const MICRO_NOW = "2026-07-23T12:00:00.123456Z";
const MICRO_LATER = "2026-07-24T12:00:00.654321Z";
const LIST_ID = "11111111-1111-4111-8111-111111111111";
const VARIANT_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_VARIANT_ID = "33333333-3333-4333-8333-333333333333";
const TAG_ID = "44444444-4444-4444-8444-444444444444";
const STORE_ID = "55555555-5555-4555-8555-555555555555";

function itemFixture() {
  return { variantId: VARIANT_ID, priceCents: 1250 };
}

function ruleFixture() {
  return { channel: "storefront" as const, startsAt: NOW, endsAt: LATER, priority: 10 };
}

function listFixture() {
  return {
    id: LIST_ID,
    name: "Summer prices",
    status: "draft" as const,
    items: [itemFixture()],
    rules: [ruleFixture()],
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

test("price list contracts export exact frozen finite registries", () => {
  assert.deepEqual(PRICE_CHANNELS, ["storefront", "quick_order"]);
  assert.deepEqual(PRICE_LIST_STATUSES, ["draft", "active", "archived"]);
  assert.deepEqual(PRICE_SOURCE_KINDS, ["base", "price_list"]);
  for (const registry of [PRICE_CHANNELS, PRICE_LIST_STATUSES, PRICE_SOURCE_KINDS]) {
    assert.equal(Object.isFrozen(registry), true);
  }
});

test("price rules are finite and cannot carry browser authority", () => {
  assert.throws(() => parsePriceListRule({ ...ruleFixture(), storeId: STORE_ID }));
  assert.throws(() => parsePriceListRule({ ...ruleFixture(), customerSegment: "vip" }));
  assert.equal(parsePriceListRule({ channel: "quick_order", customerTagId: TAG_ID, priority: 10 }).channel, "quick_order");
  assert.throws(() => parsePriceListRule({ ...ruleFixture(), channel: "browser" }));
  assert.throws(() => parsePriceListRule({ ...ruleFixture(), priority: -1 }));
  assert.throws(() => parsePriceListRule({ ...ruleFixture(), priority: 1001 }));
});

test("price rule timestamps preserve omitted starts and normalize a null optional end", () => {
  const omittedStart = parsePriceListRule({
    channel: "quick_order",
    customerTagId: TAG_ID,
    priority: 10,
  });
  const openEnded = parsePriceListRule({
    channel: "storefront",
    startsAt: NOW,
    endsAt: null,
    priority: 10,
  });
  assert.equal(Object.hasOwn(omittedStart, "startsAt"), false);
  assert.equal(Object.hasOwn(openEnded, "endsAt"), false);
  assert.throws(() => parsePriceListRule({
    channel: "storefront",
    startsAt: null,
    priority: 10,
  }));
  for (const timestamp of [
    "",
    "not-a-timestamp",
    "2026-07-23 12:00:00+00",
    "infinity",
  ]) {
    assert.throws(() => parsePriceListRule({
      channel: "storefront",
      startsAt: timestamp,
      priority: 10,
    }));
    assert.throws(() => parsePriceListRule({
      channel: "storefront",
      startsAt: NOW,
      endsAt: timestamp,
      priority: 10,
    }));
  }
});

test("price list timestamps preserve exact six-digit UTC microseconds", () => {
  const list = parsePriceList({
    ...listFixture(),
    rules: [{
      ...ruleFixture(),
      startsAt: MICRO_NOW,
      endsAt: MICRO_LATER,
    }],
    createdAt: MICRO_NOW,
    updatedAt: MICRO_LATER,
  });
  assert.equal(list.rules[0]?.startsAt, MICRO_NOW);
  assert.equal(list.rules[0]?.endsAt, MICRO_LATER);
  assert.equal(list.createdAt, MICRO_NOW);
  assert.equal(list.updatedAt, MICRO_LATER);
});

test("price list items accept only fixed safe integer cents for an exact variant", () => {
  assert.deepEqual(parsePriceListItem(itemFixture()), itemFixture());
  for (const invalidPrice of [-1, 12.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => parsePriceListItem({ ...itemFixture(), priceCents: invalidPrice }));
  }
  assert.throws(() => parsePriceListItem({ ...itemFixture(), percentage: 15 }));
  assert.throws(() => parsePriceListItem({ ...itemFixture(), amount: 12.5 }));
  assert.throws(() => parsePriceListItem({
    ...itemFixture(),
    variantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa".toUpperCase(),
  }));
});

test("price list DTOs are exact deeply frozen projections", () => {
  const list = parsePriceList(listFixture());
  assert.equal(Object.isFrozen(list), true);
  assert.equal(Object.isFrozen(list.items), true);
  assert.equal(Object.isFrozen(list.items[0]), true);
  assert.equal(Object.isFrozen(list.rules), true);
  assert.equal(Object.isFrozen(list.rules[0]), true);
  assert.throws(() => parsePriceList({ ...listFixture(), storeId: STORE_ID }));
  assert.throws(() => parsePriceList({ ...listFixture(), customerSegment: "vip" }));
});

test("price list DTOs reject duplicate variants invalid ranges and lifecycle incoherence", () => {
  assert.throws(() => parsePriceList({ ...listFixture(), items: [itemFixture(), itemFixture()] }));
  assert.throws(() => parsePriceList({
    ...listFixture(),
    items: [itemFixture(), { variantId: OTHER_VARIANT_ID, priceCents: 9007199254740991 }],
  }));
  assert.throws(() => parsePriceList({
    ...listFixture(),
    rules: [{ ...ruleFixture(), startsAt: LATER, endsAt: NOW }],
  }));
  assert.throws(() => parsePriceList({ ...listFixture(), status: "active" }));
  assert.throws(() => parsePriceList({ ...listFixture(), status: "draft", activatedAt: NOW }));
  assert.throws(() => parsePriceList({
    ...listFixture(),
    status: "archived",
    archivedAt: NOW,
    activatedAt: LATER,
  }));
});

test("effective price is exact frozen cents-only output with coherent source identity", () => {
  const listed = parseEffectivePrice({
    variantId: VARIANT_ID,
    channel: "storefront",
    priceCents: 1250,
    sourceKind: "price_list",
    priceListId: LIST_ID,
  });
  const base = parseEffectivePrice({
    variantId: VARIANT_ID,
    channel: "quick_order",
    priceCents: 1500,
    sourceKind: "base",
  });
  assert.equal(Object.isFrozen(listed), true);
  assert.equal(Object.isFrozen(base), true);
  assert.equal(listed.priceListId, LIST_ID);
  assert.equal(base.sourceKind, "base");
  assert.throws(() => parseEffectivePrice({ ...base, priceListId: LIST_ID }));
  assert.throws(() => parseEffectivePrice({ ...listed, sourceKind: "base" }));
  assert.throws(() => parseEffectivePrice({ ...listed, customerTagId: TAG_ID }));
});

test("price list arrays reject hostile sparse accessor and oversized shapes", () => {
  const sparse = new Array(1);
  const getter: unknown[] = [];
  let getterCalled = false;
  Object.defineProperty(getter, "0", {
    enumerable: true,
    configurable: true,
    get() {
      getterCalled = true;
      return itemFixture();
    },
  });
  const symbol = [itemFixture()];
  Object.defineProperty(symbol, Symbol("hidden"), { enumerable: true, value: "hidden" });
  const oversized = Array.from({ length: 501 }, (_, index) => ({
    variantId: `aaaaaaaa-aaaa-4aaa-8aaa-${index.toString(16).padStart(12, "0")}`,
    priceCents: index,
  }));
  for (const items of [sparse, getter, symbol, oversized]) {
    assert.throws(() => parsePriceList({ ...listFixture(), items }));
  }
  assert.equal(getterCalled, false);
});
