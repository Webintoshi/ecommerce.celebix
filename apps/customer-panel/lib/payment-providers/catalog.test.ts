import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { parsePaymentProviderCatalogEntry } from "@celebix/saas-contracts";

type CatalogModule = typeof import("./catalog.ts");

const catalogModule = await import("./catalog.ts").catch(() => ({} as Partial<CatalogModule>));
const inventory = JSON.parse(readFileSync(path.join(import.meta.dirname, "source-inventory.json"), "utf8")) as {
  plugin: string;
  version: string;
  inspectedPath: string;
  inspectedAt: string;
  gatewaySlugs: string[];
};

const EXPECTED_FAMILY_MODES = Object.freeze({
  akbank: "akbank/virtual_pos",
  "akbank-json": "akbank/json",
  akode: "akode/hosted",
  albaraka: "albaraka_turk/virtual_pos",
  craftgate: "craftgate/orchestration",
  denizbank: "denizbank/virtual_pos",
  erpapay: "erpapay/hosted",
  esnekpos: "esnekpos/hosted",
  finansbank: "qnb_finansbank/virtual_pos",
  "finansbank-payfor": "qnb_finansbank/payfor",
  "finansbank-payfor-v2": "qnb_finansbank/payfor_v2",
  garanti: "garanti_bbva/virtual_pos",
  "garanti-pay": "garanti_bbva/garanti_pay",
  halkbank: "halkbank/virtual_pos",
  "halkbank-mkd": "halkbank/mkd",
  hepsipay: "hepsipay/wallet",
  "is-bankasi": "is_bankasi/virtual_pos",
  "is-bankasi-girogate": "is_bankasi/girogate",
  isyerimpos: "isyerimpos/orchestration",
  iyzico: "iyzico/api",
  "iyzico-iframe": "iyzico/iframe",
  "kuveyt-turk": "kuveyt_turk/virtual_pos",
  lidio: "lidio/hosted",
  moka: "moka/api",
  mollie: "mollie/hosted",
  ozan: "ozan/wallet",
  paidora: "paidora/hosted",
  papara: "papara/api",
  "papara-checkout": "papara/checkout",
  papel: "papel/wallet",
  param: "param/hosted",
  paratika: "paratika/hosted",
  "pay-with-iyzico": "iyzico/pay_with_iyzico",
  paybull: "paybull/hosted",
  paycell: "paycell/wallet",
  paynkolay: "paynkolay/hosted",
  paytr: "paytr/direct_api",
  "paytr-iframe": "paytr/iframe",
  qnbpay: "qnbpay/hosted",
  rubikpara: "rubikpara/hosted",
  sekerbank: "sekerbank/virtual_pos",
  setcard: "setcard/meal_card",
  shopier: "shopier/hosted",
  sipay: "sipay/hosted",
  tami: "tami/hosted",
  teb: "teb/virtual_pos",
  "united-payment": "united_payment/hosted",
  "vakif-katilim": "vakif_katilim/virtual_pos",
  vakifbank: "vakifbank/virtual_pos",
  vallet: "vallet/hosted",
  vepara: "vepara/hosted",
  weepay: "weepay/hosted",
  worldpay: "worldpay/hosted",
  wyld: "wyld/hosted",
  "yapi-kredi": "yapi_kredi/virtual_pos",
  ziraat: "ziraat_bankasi/virtual_pos",
  "ziraat-katilim": "ziraat_katilim/virtual_pos",
  ziraatpay: "ziraatpay/hosted",
} as const);

test("source inventory records the licensed plugin and all 59 gateway directories", () => {
  assert.equal(inventory.plugin, "POS Entegratör Pro");
  assert.equal(inventory.version, "2.6.73");
  assert.equal(inventory.inspectedAt, "2026-07-27");
  assert.equal(inventory.gatewaySlugs.length, 59);
  assert.equal(new Set(inventory.gatewaySlugs).size, 59);
  assert.deepEqual([...inventory.gatewaySlugs].sort(), inventory.gatewaySlugs);
  assert(inventory.gatewaySlugs.includes("dummy-payment"));
});

test("catalog maps every non-dummy source variant exactly once", () => {
  assert.equal(Array.isArray(catalogModule.PAYMENT_PROVIDER_CATALOG), true);
  const catalog = catalogModule.PAYMENT_PROVIDER_CATALOG!;
  assert.equal(catalog.length, 58);
  assert.equal(new Set(catalog.map((entry) => entry.providerCode)).size, 58);
  assert.equal(new Set(catalog.map((entry) => entry.sourceSlug)).size, 58);
  assert(!catalog.some((entry) => entry.sourceSlug === "dummy-payment"));
  assert.deepEqual(
    new Set(catalog.map((entry) => entry.sourceSlug)),
    new Set(inventory.gatewaySlugs.filter((slug) => slug !== "dummy-payment")),
  );
  assert.deepEqual(
    new Set(catalog.map((entry) => entry.sourceSlug)),
    new Set(Object.keys(EXPECTED_FAMILY_MODES)),
  );
});

test("catalog preserves the approved family and mode normalization", () => {
  const catalog = catalogModule.PAYMENT_PROVIDER_CATALOG!;
  for (const entry of catalog) {
    assert.equal(
      entry.familyCode + "/" + entry.modeCode,
      EXPECTED_FAMILY_MODES[entry.sourceSlug as keyof typeof EXPECTED_FAMILY_MODES],
      entry.sourceSlug,
    );
    assert.equal(entry.providerCode, entry.sourceSlug.replaceAll("-", "_"));
    assert.equal(entry.readiness, "planned");
    assert.deepEqual(entry.support, {
      threeDSecure: "unknown",
      installments: "unknown",
      refund: "unknown",
      cancel: "unknown",
      capture: "unknown",
    });
    assert.doesNotThrow(() => parsePaymentProviderCatalogEntry(entry));
  }
});

test("catalog and all nested values are immutable copies", () => {
  const catalog = catalogModule.listPaymentProviderCatalog!();
  assert.equal(Object.isFrozen(catalog), true);
  for (const entry of catalog) {
    assert.equal(Object.isFrozen(entry), true);
    assert.equal(Object.isFrozen(entry.support), true);
    assert.equal(Object.isFrozen(entry.aliases), true);
    assert.equal(Object.isFrozen(entry.environments), true);
  }
  assert.strictEqual(catalogModule.listPaymentProviderCatalog!(), catalog);
});

test("catalog lookup accepts only an exact canonical provider code", () => {
  const lookup = catalogModule.getPaymentProviderCatalogEntry!;
  assert.equal(lookup("paytr_iframe")?.sourceSlug, "paytr-iframe");
  for (const hostile of [
    "PAYTR_IFRAME", "paytr-iframe", " paytr_iframe", "paytr_iframe ",
    "dummy_payment", "unknown", "", "../paytr_iframe",
  ]) assert.equal(lookup(hostile), null, hostile);
});
