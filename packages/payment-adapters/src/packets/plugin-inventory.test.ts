import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  PAYMENT_ADAPTER_PACKET_INVENTORY,
  PAYMENT_PROTOCOL_FAMILIES,
  getPaymentAdapterPacketSource,
} from "./plugin-inventory.ts";

const sourceInventory = JSON.parse(
  readFileSync(
    path.resolve(
      import.meta.dirname,
      "../../../../apps/customer-panel/lib/payment-providers/source-inventory.json",
    ),
    "utf8",
  ),
) as {
  gatewaySlugs: string[];
};

const EST_V3 = new Set([
  "akbank",
  "akbank-json",
  "finansbank",
  "halkbank",
  "halkbank-mkd",
  "is-bankasi",
  "is-bankasi-girogate",
  "sekerbank",
  "teb",
  "ziraat",
]);
const PAYFOR = new Set(["finansbank-payfor", "finansbank-payfor-v2", "ziraat-katilim"]);
const POSNET = new Set(["worldpay", "yapi-kredi"]);
const PAY_SMART = new Set(["paybull", "qnbpay", "sipay", "vepara"]);
const BASE_PLUGIN = new Set([
  "iyzico",
  "iyzico-iframe",
  "papara",
  "papara-checkout",
  "paratika",
  "pay-with-iyzico",
  "paytr-iframe",
]);

function expectedProtocol(sourceSlug: string) {
  if (EST_V3.has(sourceSlug)) return "est_v3";
  if (PAYFOR.has(sourceSlug)) return "payfor";
  if (POSNET.has(sourceSlug)) return "posnet";
  if (sourceSlug === "albaraka") return "posnet_v1";
  if (PAY_SMART.has(sourceSlug)) return "pay_smart";
  if (sourceSlug === "vakifbank") return "payflex_v4";
  if (sourceSlug === "denizbank") return "interpos";
  if (BASE_PLUGIN.has(sourceSlug)) return "base_plugin";
  return "provider_specific";
}

test("inventories every non-dummy gateway and promotes only the conformed PayTR iframe implementation", () => {
  assert.equal(PAYMENT_ADAPTER_PACKET_INVENTORY.length, 58);
  assert.equal(new Set(PAYMENT_ADAPTER_PACKET_INVENTORY.map((item) => item.providerCode)).size, 58);
  assert.equal(new Set(PAYMENT_ADAPTER_PACKET_INVENTORY.map((item) => item.sourceSlug)).size, 58);
  assert.equal(
    new Set(PAYMENT_ADAPTER_PACKET_INVENTORY.map((item) => `${item.familyCode}/${item.modeCode}`))
      .size,
    58,
  );
  assert.deepEqual(
    PAYMENT_ADAPTER_PACKET_INVENTORY.map((item) => item.sourceSlug).sort(),
    sourceInventory.gatewaySlugs.filter((slug) => slug !== "dummy-payment").sort(),
  );
  assert.equal(
    PAYMENT_ADAPTER_PACKET_INVENTORY.some((item) => item.sourceSlug === "dummy-payment"),
    false,
  );
  assert.deepEqual(
    PAYMENT_ADAPTER_PACKET_INVENTORY
      .filter((item) => item.implementationState === "executable")
      .map((item) => item.providerCode),
    ["paytr_iframe"],
  );
  assert.equal(getPaymentAdapterPacketSource("paytr")?.implementationState, "inventory_only");
  assert.equal(
    PAYMENT_ADAPTER_PACKET_INVENTORY.every(
      (item) =>
        !("readiness" in item) &&
        !("endpoints" in item) &&
        !("implementation" in item),
    ),
    true,
  );
});

test("preserves canonical catalog codes and the curated protocol families", () => {
  assert.deepEqual(PAYMENT_PROTOCOL_FAMILIES, [
    "est_v3",
    "payfor",
    "posnet",
    "posnet_v1",
    "pay_smart",
    "payflex_v4",
    "interpos",
    "provider_specific",
    "base_plugin",
  ]);
  assert.equal(Object.isFrozen(PAYMENT_PROTOCOL_FAMILIES), true);

  for (const item of PAYMENT_ADAPTER_PACKET_INVENTORY) {
    assert.equal(item.providerCode, item.sourceSlug.replaceAll("-", "_"), item.sourceSlug);
    assert.match(item.providerCode, /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/);
    assert.match(item.familyCode, /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/);
    assert.match(item.modeCode, /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/);
    assert.equal(item.protocolFamily, expectedProtocol(item.sourceSlug), item.sourceSlug);
  }
});

test("records unique PHP gateway/settings evidence from the two audited plugin versions", () => {
  const gatewayClasses = new Set<string>();
  const settingsClasses = new Set<string>();
  const allClasses = new Set<string>();
  const gatewayPaths = new Set<string>();
  const settingsPaths = new Set<string>();
  const allowedPath =
    /^includes\/(?:payment-gateways|abstracts)\/[a-z0-9]+(?:[/-][a-z0-9]+)*\.php$/;

  for (const item of PAYMENT_ADAPTER_PACKET_INVENTORY) {
    assert.equal(item.pluginVersion, "2.6.73");
    assert.equal(item.basePluginVersion, "3.8.1");
    assert.equal(
      item.gatewaySourcePath,
      `includes/payment-gateways/${item.sourceSlug}/class-gpospro-${item.sourceSlug}-gateway.php`,
    );
    assert.equal(
      item.settingsSourcePath,
      `includes/payment-gateways/${item.sourceSlug}/class-gpospro-${item.sourceSlug}-settings.php`,
    );
    assert.match(item.gatewaySourcePath, allowedPath);
    assert.match(item.settingsSourcePath, allowedPath);
    for (const sourcePath of item.inheritanceSourcePaths) assert.match(sourcePath, allowedPath);
    assert.equal(gatewayClasses.has(item.gatewayClass), false, item.gatewayClass);
    assert.equal(settingsClasses.has(item.settingsClass), false, item.settingsClass);
    assert.equal(allClasses.has(item.gatewayClass), false, item.gatewayClass);
    assert.equal(allClasses.has(item.settingsClass), false, item.settingsClass);
    assert.equal(gatewayPaths.has(item.gatewaySourcePath), false, item.gatewaySourcePath);
    assert.equal(settingsPaths.has(item.settingsSourcePath), false, item.settingsSourcePath);
    gatewayClasses.add(item.gatewayClass);
    settingsClasses.add(item.settingsClass);
    allClasses.add(item.gatewayClass);
    allClasses.add(item.settingsClass);
    gatewayPaths.add(item.gatewaySourcePath);
    settingsPaths.add(item.settingsSourcePath);
  }
});

test("captures audited inheritance edge cases without copying executable PHP", () => {
  assert.deepEqual(
    {
      gatewayClass: getPaymentAdapterPacketSource("akbank")?.gatewayClass,
      gatewayParentClass: getPaymentAdapterPacketSource("akbank")?.gatewayParentClass,
      settingsParentClass: getPaymentAdapterPacketSource("akbank")?.settingsParentClass,
    },
    {
      gatewayClass: "GPOSPRO_Akbank_Gateway",
      gatewayParentClass: "GPOSPRO_EST_V3_Gateway",
      settingsParentClass: "GPOSPRO_EST_V3_Settings",
    },
  );
  assert.equal(
    getPaymentAdapterPacketSource("is_bankasi_girogate")?.gatewayParentClass,
    "GPOS_Payment_Gateway",
  );
  assert.equal(
    getPaymentAdapterPacketSource("is_bankasi_girogate")?.settingsParentClass,
    "GPOSPRO_EST_V3_Settings",
  );
  assert.equal(
    getPaymentAdapterPacketSource("iyzico")?.gatewayParentClass,
    "GPOS_Iyzico_Gateway",
  );
  assert.equal(
    getPaymentAdapterPacketSource("paytr")?.gatewayParentClass,
    "GPOS_PayTR_IFrame_Gateway",
  );
  assert.equal(
    getPaymentAdapterPacketSource("ziraatpay")?.gatewayParentClass,
    "GPOS_Payten_Gateway",
  );
});

test("deep-freezes source metadata, documentation candidates, and exact lookup results", () => {
  assert.equal(Object.isFrozen(PAYMENT_ADAPTER_PACKET_INVENTORY), true);
  for (const item of PAYMENT_ADAPTER_PACKET_INVENTORY) {
    assert.equal(Object.isFrozen(item), true);
    assert.equal(Object.isFrozen(item.inheritanceSourcePaths), true);
    assert.equal(Object.isFrozen(item.officialDocumentationCandidates), true);
    assert(item.officialDocumentationCandidates.length > 0);
    for (const url of item.officialDocumentationCandidates) assert.match(url, /^https:\/\//);
    assert.strictEqual(getPaymentAdapterPacketSource(item.providerCode), item);
  }

  assert.equal(getPaymentAdapterPacketSource("paytr_iframe")?.sourceSlug, "paytr-iframe");
  for (const hostile of [
    "PAYTR_IFRAME",
    "paytr-iframe",
    " paytr_iframe",
    "paytr_iframe ",
    "dummy_payment",
    "unknown",
    "",
    "../paytr_iframe",
  ]) {
    assert.equal(getPaymentAdapterPacketSource(hostile), null, hostile);
  }
});
