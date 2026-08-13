import assert from "node:assert/strict";
import test from "node:test";

import {
  MERCHANT_MODULE_DEFINITIONS,
  buildMerchantModuleSummary,
  buildProviderWorkflowState,
  formatMerchantAdminConfig,
  getMerchantModuleDefinition,
  isSingletonMerchantModule,
  selectSingletonEditorRecord,
  singletonRecordState,
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
  assert.equal(MERCHANT_MODULE_DEFINITIONS.length, 34);
  assert.equal(new Set(MERCHANT_MODULE_DEFINITIONS.map(({ kind }) => kind)).size, 34);
  assert.equal(new Set(MERCHANT_MODULE_DEFINITIONS.map(({ route }) => route)).size, 34);

  assert.equal(getMerchantModuleDefinition("discount").route, "/discounts");
  assert.equal(getMerchantModuleDefinition("lucky_wheel").route, "/discounts/lucky-wheel");
  assert.equal(getMerchantModuleDefinition("administrator_invite").route, "/settings/administrators");
  assert.equal(getMerchantModuleDefinition("indexing_request").route, "/seo/fast-indexing");
  assert.equal(getMerchantModuleDefinition("notification_setting").route, "/settings/notifications");
  assert.equal(getMerchantModuleDefinition("notification_setting").cardinality, "singleton");
  assert.deepEqual(getMerchantModuleDefinition("notification_setting").fields.map(({ key, label, type }) => ({ key, label, type })), [
    { key: "orderNotificationsEnabled", label: "Yeni sipariş e-postası", type: "boolean" },
    { key: "notificationEmail", label: "Bildirim adresi", type: "email" },
    { key: "senderLabel", label: "Gönderici adı", type: "text" },
    { key: "replyToEmail", label: "Yanıt adresi", type: "email" },
  ]);
  assert.equal(getMerchantModuleDefinition("hero_banner").route, "/settings/hero-banner");
  assert.equal(getMerchantModuleDefinition("promotion_banner").route, "/settings/promotion-banner");
  assert.equal(getMerchantModuleDefinition("marquee_setting").route, "/settings/marquee");
  assert.equal(getMerchantModuleDefinition("theme_setting").route, "/settings/theme");

  for (const definition of MERCHANT_MODULE_DEFINITIONS) {
    assert.equal(Object.isFrozen(definition), true);
    assert.equal(Object.isFrozen(definition.fields), true);
    assert.equal(definition.fields.length > 0, true);
    assert.equal(new Set(definition.fields.map(({ key }) => key)).size, definition.fields.length);
  }
});

test("theme settings expose only bounded visual choices and a numeric home product limit", () => {
  const definition = getMerchantModuleDefinition("theme_setting");
  assert.deepEqual(definition.fields.map(({ key, type, allowedValues }) => ({ key, type, allowedValues })), [
    { key: "colorScheme", type: "enum", allowedValues: ["neutral", "warm", "dark", "ocean"] },
    { key: "headingStyle", type: "enum", allowedValues: ["serif", "sans"] },
    { key: "productCardStyle", type: "enum", allowedValues: ["editorial", "compact"] },
    { key: "productImageRatio", type: "enum", allowedValues: ["portrait", "square"] },
    { key: "homeProductLimit", type: "number", allowedValues: ["4", "8", "12"] },
    { key: "showBrandStory", type: "boolean", allowedValues: undefined },
  ]);
  assert.equal(definition.fields.some(({ key }) => /css|html|script|font|url|colorValue/i.test(key)), false);
});

test("starter presentation settings expose one effective singleton editor and identify superseded active rows", () => {
  const singletonKinds = ["general_setting", "notification_setting", "theme_setting", "hero_banner", "promotion_banner", "marquee_setting", "category_showcase", "seo_control", "social_preview"] as const;
  for (const kind of singletonKinds) assert.equal(isSingletonMerchantModule(kind), true);
  assert.equal(isSingletonMerchantModule("discount"), false);
  const older = { ...record("71000000-0000-4000-8000-000000000001", "active", "Eski tema", {}), kind: "theme_setting" as const, updatedAt: "2026-07-20T19:00:00.000Z" };
  const winner = { ...record("71000000-0000-4000-8000-000000000002", "active", "Yeni tema", {}), kind: "theme_setting" as const, updatedAt: "2026-07-22T19:00:00.000Z" };
  const draft = { ...record("71000000-0000-4000-8000-000000000003", "draft", "Taslak tema", {}), kind: "theme_setting" as const, updatedAt: "2026-07-23T19:00:00.000Z" };
  const rows = Object.freeze([older, draft, winner]);
  assert.equal(selectSingletonEditorRecord("theme_setting", rows)?.id, winner.id);
  assert.equal(singletonRecordState("theme_setting", winner, rows), "effective");
  assert.equal(singletonRecordState("theme_setting", older, rows), "superseded");
  assert.equal(singletonRecordState("theme_setting", draft, rows), null);
  assert.equal(selectSingletonEditorRecord("discount", rows as never), null);
  assert.equal(selectSingletonEditorRecord("theme_setting", [draft])?.id, draft.id);
});

test("shipping settings preserve the exact durable delivery fields", () => {
  const shipping = MERCHANT_MODULE_DEFINITIONS.find((entry) => entry.kind === "shipping_setting");
  assert.deepEqual(shipping?.fields.map((field) => field.key), [
    "regions",
    "freeShippingThresholdCents",
    "estimatedDays",
  ]);
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

test("defines finite advanced SEO and AI preferences without a provider job", () => {
  const expected = {
    seo_geo_profile: { route: "/seo/geo-optimization", fields: [["businessName", "text"], ["businessCategory", "text"], ["serviceAreas", "string-list"], ["locale", "text"], ["description", "textarea"]] },
    seo_internal_link: { route: "/seo/internal-linking", fields: [["sourcePath", "text"], ["targetPath", "text"], ["anchorText", "text"], ["enabled", "boolean"]] },
    seo_content_entry: { route: "/seo/content", fields: [["resourceId", "text"], ["metaTitle", "text"], ["metaDescription", "textarea"], ["canonicalPath", "text"], ["structuredDataType", "enum"]] },
    seo_category_entry: { route: "/seo/categories", fields: [["resourceId", "text"], ["metaTitle", "text"], ["metaDescription", "textarea"], ["canonicalPath", "text"]] },
    seo_page_entry: { route: "/seo/pages", fields: [["resourceId", "text"], ["metaTitle", "text"], ["metaDescription", "textarea"], ["canonicalPath", "text"]] },
    seo_product_entry: { route: "/seo/products", fields: [["resourceId", "text"], ["metaTitle", "text"], ["metaDescription", "textarea"], ["canonicalPath", "text"]] },
    ai_setting: { route: "/settings/artificial-intelligence", fields: [["tone", "text"], ["locale", "text"], ["enabledFeatures", "enum-list"]] },
  } as const;
  for (const [kind, expectedDefinition] of Object.entries(expected)) {
    const definition = getMerchantModuleDefinition(kind as keyof typeof expected);
    assert.equal(definition.route, expectedDefinition.route);
    assert.equal(definition.execution, "durable");
    assert.equal(definition.workflow, undefined);
    assert.deepEqual(definition.fields.map(({ key, type }) => [key, type]), expectedDefinition.fields);
  }
  assert.equal(getMerchantModuleDefinition("seo_geo_profile").fields.find(({ key }) => key === "serviceAreas")?.maxItems, 24);
  const ai = getMerchantModuleDefinition("ai_setting");
  assert.match(ai.notice ?? "", /harici.*üreti[mş]/i);
  const features = ai.fields.find(({ key }) => key === "enabledFeatures");
  assert.deepEqual(features?.allowedValues, ["description_suggestions", "seo_suggestions", "campaign_drafts"]);
  assert.equal(Object.isFrozen(features?.allowedValues), true);
  assert.equal(features?.maxItems, 3);
  assert.deepEqual(getMerchantModuleDefinition("seo_content_entry").fields.find(({ key }) => key === "structuredDataType")?.allowedValues, ["Article", "FAQPage", "Product", "WebPage"]);
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

test("provider workflows distinguish configuration readiness from external execution", () => {
  const definition = getMerchantModuleDefinition("marketplace_connection");
  assert.deepEqual(definition.workflow, {
    action: "synchronization",
    actionLabel: "Senkronizasyon hazırlığı",
    requiredFields: ["provider", "merchantReference", "syncEnabled"],
  });
  const base = {
    id: "11111111-1111-4111-8111-111111111111",
    kind: "marketplace_connection" as const,
    name: "Trendyol",
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
  };
  assert.deepEqual(buildProviderWorkflowState(definition, { ...base, status: "draft", config: {} }), {
    code: "configuration_incomplete",
    label: "Yapılandırma eksik",
    canPrepare: false,
    missingFields: ["Pazar yeri", "Mağaza referansı", "Senkronizasyon isteği"],
  });
  assert.deepEqual(buildProviderWorkflowState(definition, {
    ...base,
    status: "active",
    config: { provider: "trendyol", merchantReference: "store-42", syncEnabled: true },
  }), {
    code: "awaiting_preparation",
    label: "Hazırlık oluşturulabilir",
    canPrepare: true,
    missingFields: [],
  });
  assert.equal(buildProviderWorkflowState(getMerchantModuleDefinition("discount"), { ...base, kind: "discount", status: "active", config: {} }), null);
});

test("general settings require storefront identity fields", () => {
  const general = getMerchantModuleDefinition("general_setting");
  assert.deepEqual(
    general.fields.map(({ key, required }) => [key, required]),
    [
      ["storeDisplayName", true],
      ["supportEmail", true],
      ["timezone", true],
    ],
  );
});
