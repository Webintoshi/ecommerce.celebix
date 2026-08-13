import assert from "node:assert/strict";
import test from "node:test";

import {
  CONTENT_WORKSPACE_TABS,
  CUSTOMER_WORKSPACE_TABS,
  IMPORT_WORKSPACE_TABS,
  MARKETING_WORKSPACE_TABS,
  getWorkspaceActiveHref,
} from "./workspace-navigation.ts";

test("defines the approved route-backed workspace tabs", () => {
  assert.deepEqual(CUSTOMER_WORKSPACE_TABS, [
    { label: "Tümü", href: "/customers" },
    { label: "Segmentler", href: "/customers/segments" },
    { label: "Etiketler", href: "/customers/tags" },
  ]);
  assert.deepEqual(MARKETING_WORKSPACE_TABS, [
    { label: "Özet", href: "/marketing" },
    { label: "E-posta", href: "/marketing/email" },
    { label: "Telefon", href: "/marketing/phone" },
    { label: "WhatsApp", href: "/marketing/whatsapp" },
  ]);
  assert.deepEqual(CONTENT_WORKSPACE_TABS, [
    { label: "Blog", href: "/content/blog" },
    { label: "Sayfalar", href: "/content/pages" },
    { label: "Politikalar", href: "/content/policies" },
  ]);
  assert.deepEqual(IMPORT_WORKSPACE_TABS, [
    { label: "Otomatik Yükle", href: "/products/auto-import" },
    { label: "Shopify Dönüştürücü", href: "/products/shopify-converter" },
  ]);
});

test("selects only the exact active workspace route", () => {
  assert.equal(
    getWorkspaceActiveHref("/customers/segments", CUSTOMER_WORKSPACE_TABS),
    "/customers/segments",
  );
  assert.equal(
    getWorkspaceActiveHref("/marketing/whatsapp", MARKETING_WORKSPACE_TABS),
    "/marketing/whatsapp",
  );
  assert.equal(
    getWorkspaceActiveHref("/products/shopify-converter", IMPORT_WORKSPACE_TABS),
    "/products/shopify-converter",
  );

  for (const pathname of [
    "/customers/segments/child",
    "/customers/segments?mode=edit",
    "/customers/tags#list",
    "/customers-evil",
    "/content",
  ]) {
    assert.equal(getWorkspaceActiveHref(pathname, CUSTOMER_WORKSPACE_TABS), null);
    assert.equal(getWorkspaceActiveHref(pathname, CONTENT_WORKSPACE_TABS), null);
  }
});

test("workspace definitions and records are immutable", () => {
  for (const tabs of [
    CUSTOMER_WORKSPACE_TABS,
    MARKETING_WORKSPACE_TABS,
    CONTENT_WORKSPACE_TABS,
    IMPORT_WORKSPACE_TABS,
  ]) {
    assert.equal(Object.isFrozen(tabs), true);
    assert.equal(tabs.every(Object.isFrozen), true);
  }
});
