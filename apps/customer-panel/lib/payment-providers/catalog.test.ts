import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { parsePaymentProviderCatalogEntry } from "@celebix/saas-contracts";
import {
  PAYMENT_ADAPTER_PACKET_INVENTORY,
  PAYTR_APPROVED_EXECUTION_AUTHORITIES,
} from "../../../../packages/payment-adapters/src/index.ts";

type CatalogModule = typeof import("./catalog.ts");

const catalogModule = await import("./catalog.ts").catch(() => ({} as Partial<CatalogModule>));
const IYZICO_CANDIDATE = Object.freeze({
  buildMetadataSchemaVersion: 1,
  evidenceSchemaVersion: 1,
  providerCode: "iyzico_iframe",
  capability: "payment_processing",
  environment: "test",
  adapterVersion: 1,
  gitSha: "1".repeat(40),
  sourceDigest: `sha256:${"2".repeat(64)}`,
  candidateExecutionDigest: "sha256:7ecaafb855013a97aa62097126f9ab30b791c805e0b84104a74d67dd19e972cd",
} as const);
const IYZICO_AUTHORITY = Object.freeze({
  environment: "test",
  adapterVersion: 1,
  evidenceDigest: IYZICO_CANDIDATE.candidateExecutionDigest,
} as const);
const inventory = JSON.parse(readFileSync(path.join(import.meta.dirname, "source-inventory.json"), "utf8")) as {
  plugin: string;
  version: string;
  inspectedPath: string;
  inspectedAt: string;
  gatewaySlugs: string[];
};
const logoManifest = JSON.parse(readFileSync(path.join(import.meta.dirname, "logo-manifest.json"), "utf8")) as Array<{
  familyCode: string;
  file: string;
}>;

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
    assert.equal(
      entry.readiness,
      entry.providerCode === "paytr_iframe"
        ? "sandbox_ready"
        : entry.providerCode === "iyzico_iframe"
        ? "verification"
        : "planned",
    );
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

test("catalog codes stay aligned with inventory records and Iyzico is configurable but dormant", () => {
  const catalog = catalogModule.PAYMENT_PROVIDER_CATALOG!;
  assert.deepEqual(
    PAYMENT_ADAPTER_PACKET_INVENTORY.map((item) => [
      item.providerCode,
      item.familyCode,
      item.modeCode,
      item.sourceSlug,
    ]),
    catalog.map((entry) => [
      entry.providerCode,
      entry.familyCode,
      entry.modeCode,
      entry.sourceSlug,
    ]),
  );
  assert.deepEqual(
    PAYMENT_ADAPTER_PACKET_INVENTORY.filter((item) => item.implementationState === "executable").map((item) => item.providerCode),
    ["paytr_iframe"],
  );
  assert.equal(
    PAYMENT_ADAPTER_PACKET_INVENTORY.find((item) => item.providerCode === "iyzico_iframe")?.implementationState,
    "configurable",
  );
  const iyzico = catalog.find((entry) => entry.providerCode === "iyzico_iframe");
  assert.ok(iyzico);
  assert.equal(iyzico.label, "iyzico");
  assert.equal(iyzico.modeLabel, "Checkout Form");
  assert.equal(iyzico.logoPath, "/payment-providers/iyzico.svg");
  assert.deepEqual(iyzico.environments, ["test", "live"]);
  assert.equal(iyzico.executionAuthority, null);
  const paytr = catalog.find((entry) => entry.providerCode === "paytr_iframe");
  assert.ok(paytr);
  assert.equal(paytr.readiness, "sandbox_ready");
  assert.deepEqual(paytr.environments, ["test"]);
  assert.ok(PAYTR_APPROVED_EXECUTION_AUTHORITIES.test, "PayTR test execution authority must be generated");
  assert.deepEqual(paytr.executionAuthority, PAYTR_APPROVED_EXECUTION_AUTHORITIES.test);
});

test("catalog exposes Iyzico as sandbox-ready only for the exact future compiled binding", () => {
  const candidate = catalogModule as Partial<CatalogModule> & {
    createPaymentProviderCatalog?: (
      approved?: unknown,
      generated?: unknown,
    ) => NonNullable<CatalogModule["PAYMENT_PROVIDER_CATALOG"]>;
  };
  assert.equal(typeof candidate.createPaymentProviderCatalog, "function");
  const createCatalog = candidate.createPaymentProviderCatalog!;
  const current = createCatalog();
  const currentIyzico = current.find((entry) => entry.providerCode === "iyzico_iframe");
  assert.ok(currentIyzico);
  assert.equal(currentIyzico.readiness, "verification");
  assert.deepEqual(currentIyzico.environments, ["test", "live"]);
  assert.equal(currentIyzico.executionAuthority, null);
  const currentPaytr = current.find((entry) => entry.providerCode === "paytr_iframe");
  assert.ok(currentPaytr);
  assert.equal(currentPaytr.readiness, "sandbox_ready");
  assert.deepEqual(currentPaytr.environments, ["test"]);
  assert.ok(PAYTR_APPROVED_EXECUTION_AUTHORITIES.test, "PayTR test execution authority must be generated");
  assert.deepEqual(currentPaytr.executionAuthority, PAYTR_APPROVED_EXECUTION_AUTHORITIES.test);

  const future = createCatalog(IYZICO_AUTHORITY, IYZICO_CANDIDATE);
  const futureIyzico = future.find((entry) => entry.providerCode === "iyzico_iframe");
  assert.ok(futureIyzico);
  assert.equal(futureIyzico.readiness, "sandbox_ready");
  assert.deepEqual(futureIyzico.environments, ["test"]);
  assert.deepEqual(futureIyzico.executionAuthority, IYZICO_AUTHORITY);
  assert.equal(Object.isFrozen(futureIyzico.executionAuthority), true);
  const futurePaytr = future.find((entry) => entry.providerCode === "paytr_iframe");
  assert.ok(futurePaytr);
  assert.equal(futurePaytr.readiness, "sandbox_ready");
  assert.deepEqual(futurePaytr.environments, ["test"]);
  assert.deepEqual(futurePaytr.executionAuthority, currentPaytr.executionAuthority);

  const mismatch = createCatalog(IYZICO_AUTHORITY, {
    ...IYZICO_CANDIDATE,
    candidateExecutionDigest: `sha256:${"3".repeat(64)}`,
  });
  const mismatchIyzico = mismatch.find((entry) => entry.providerCode === "iyzico_iframe");
  assert.ok(mismatchIyzico);
  assert.equal(mismatchIyzico.readiness, "verification");
  assert.equal(mismatchIyzico.executionAuthority, null);
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

test("catalog logo paths are owned by the exact manifest family", () => {
  const validate = catalogModule.validatePaymentProviderLogoBindings!;
  assert.doesNotThrow(() => validate(catalogModule.PAYMENT_PROVIDER_CATALOG!, logoManifest));
  assert.deepEqual(
    new Set(catalogModule.PAYMENT_PROVIDER_CATALOG!.map((entry) => entry.logoPath)),
    new Set(logoManifest.map((row) => row.file)),
  );
  assert.equal(logoManifest.length, 48);
  assert.equal(new Set(logoManifest.map((row) => row.file)).size, 48);
});

test("logo binding rejects missing duplicated remote and cross-family paths", () => {
  const validate = catalogModule.validatePaymentProviderLogoBindings!;
  const catalog = catalogModule.PAYMENT_PROVIDER_CATALOG!;
  assert.throws(() => validate(catalog, logoManifest.slice(1)), /logo manifest/i);
  assert.throws(() => validate(catalog, [...logoManifest, logoManifest[0]!]), /logo manifest/i);
  assert.throws(
    () => validate(
      [{ ...catalog[0]!, logoPath: "https://cdn.example.test/akbank.svg" }, ...catalog.slice(1)],
      logoManifest,
    ),
    /logo path/i,
  );
  assert.throws(
    () => validate(
      [{ ...catalog[0]!, logoPath: "/payment-providers/akode.svg" }, ...catalog.slice(1)],
      logoManifest,
    ),
    /logo path/i,
  );
});
