import assert from "node:assert/strict";
import test from "node:test";

import {
  MERCHANT_MODULE_DEFINITIONS,
  buildMerchantModuleSummary,
  formatMerchantAdminConfig,
  getMerchantModuleDefinition,
} from "./presentation.ts";

const NOW = "2026-07-22T19:00:00.000Z";

function record(
  id: string,
  status: "active" | "archived" | "draft",
  name: string,
  config: Readonly<Record<string, boolean | number | string | readonly string[]>>,
) {
  return Object.freeze({
    id,
    kind: "discount" as const,
    name,
    config,
    status,
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

test("defines every durable merchant module with a unique route and field contract", () => {
  assert.equal(MERCHANT_MODULE_DEFINITIONS.length, 21);
  assert.equal(new Set(MERCHANT_MODULE_DEFINITIONS.map(({ kind }) => kind)).size, 21);
  assert.equal(new Set(MERCHANT_MODULE_DEFINITIONS.map(({ route }) => route)).size, 21);

  assert.equal(getMerchantModuleDefinition("discount").route, "/discounts");
  assert.equal(getMerchantModuleDefinition("lucky_wheel").route, "/discounts/lucky-wheel");
  assert.equal(getMerchantModuleDefinition("administrator_invite").route, "/settings/administrators");
  assert.equal(getMerchantModuleDefinition("indexing_request").route, "/seo/fast-indexing");

  for (const definition of MERCHANT_MODULE_DEFINITIONS) {
    assert.equal(Object.isFrozen(definition), true);
    assert.equal(Object.isFrozen(definition.fields), true);
    assert.equal(definition.fields.length > 0, true);
    assert.equal(new Set(definition.fields.map(({ key }) => key)).size, definition.fields.length);
  }
});

test("marks only real in-application workflows durable and external execution provider-gated", () => {
  for (const kind of [
    "email_campaign",
    "phone_campaign",
    "whatsapp_campaign",
    "marketplace_connection",
    "invoice_integration",
    "indexing_request",
  ] as const) {
    const definition = getMerchantModuleDefinition(kind);
    assert.equal(definition.execution, "provider_required");
    assert.match(definition.notice ?? "", /sağlayıcı/i);
  }

  for (const kind of [
    "discount",
    "lucky_wheel",
    "blog_post",
    "page",
    "policy",
    "general_setting",
    "shipping_setting",
    "seo_control",
  ] as const) {
    assert.equal(getMerchantModuleDefinition(kind).execution, "durable");
  }
});

test("builds truthful status metrics and applies exact status and locale-aware search filters", () => {
  const rows = Object.freeze([
    record("71000000-0000-4000-8000-000000000001", "active", "Yaz İndirimi", { code: "YAZ20" }),
    record("71000000-0000-4000-8000-000000000002", "draft", "VIP Teklifi", { code: "VIP" }),
    record("71000000-0000-4000-8000-000000000003", "archived", "Eski Kampanya", { code: "ESKI" }),
  ]);

  assert.deepEqual(buildMerchantModuleSummary(rows, "", "all"), {
    active: 1,
    archived: 1,
    draft: 1,
    total: 3,
    visible: rows,
  });
  assert.deepEqual(
    buildMerchantModuleSummary(rows, "indİrİm", "active").visible.map(({ name }) => name),
    ["Yaz İndirimi"],
  );
  assert.deepEqual(buildMerchantModuleSummary(rows, "vip", "archived").visible, []);
});

test("formats only labelled safe configuration fields and never emits private or unknown keys", () => {
  const definition = getMerchantModuleDefinition("marketplace_connection");
  const formatted = formatMerchantAdminConfig(definition, {
    provider: "trendyol",
    merchantReference: "magaza-42",
    syncEnabled: true,
    unexpected: "must-not-render",
  });

  assert.deepEqual(formatted, [
    { label: "Pazar yeri", value: "trendyol" },
    { label: "Mağaza referansı", value: "magaza-42" },
    { label: "Senkronizasyon isteği", value: "Evet" },
  ]);
  assert.equal(JSON.stringify(formatted).includes("unexpected"), false);
});
