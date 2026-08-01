import assert from "node:assert/strict";
import test from "node:test";

import {
  ADMIN_MODULE_MATURITY,
  getAdminModuleMaturity,
  type AdminModuleKey,
} from "./functional-maturity.ts";

const EXPECTED_MODULES = Object.freeze([
  "orders",
  "customers",
  "catalog_inventory",
  "discounts_marketing_content",
  "settings_team",
  "marketplaces_accounting_seo",
  "dashboard_analytics",
] as const satisfies readonly AdminModuleKey[]);

test("order maturity stays truthful until every advertised commerce workflow is operational", () => {
  assert.deepEqual(getAdminModuleMaturity("orders"), {
    module: "orders",
    state: "foundation",
    operational: [
      "list", "detail", "status", "payment_status", "shipping", "notes", "print", "quick_links", "abandoned_carts",
      "manual_order_drafts", "manual_order_creation",
    ],
    gaps: [
      "billing", "taxes", "fulfillment_locations", "tags", "payment_requests", "provider_refunds", "invoices", "shipping_labels",
    ],
  });
});

test("customer maturity records the linked order workspace and editable address book without hiding privacy gaps", () => {
  assert.deepEqual(getAdminModuleMaturity("customers"), {
    module: "customers",
    state: "foundation",
    operational: [
      "list", "detail", "create", "update", "archive", "notes", "tags", "segments", "export", "address_book", "order_history",
    ],
    gaps: ["consent_history", "privacy_erasure"],
  });
});

test("functional maturity covers every top-level admin family exactly once and never overclaims readiness", () => {
  assert.deepEqual(ADMIN_MODULE_MATURITY.map(({ module }) => module), EXPECTED_MODULES);
  assert.equal(new Set(ADMIN_MODULE_MATURITY.map(({ module }) => module)).size, EXPECTED_MODULES.length);
  assert.equal(Object.isFrozen(ADMIN_MODULE_MATURITY), true);

  for (const entry of ADMIN_MODULE_MATURITY) {
    assert.equal(Object.isFrozen(entry), true, entry.module);
    assert.equal(Object.isFrozen(entry.operational), true, `${entry.module}:operational`);
    assert.equal(Object.isFrozen(entry.gaps), true, `${entry.module}:gaps`);
    assert.equal(new Set(entry.operational).size, entry.operational.length, `${entry.module}:operational`);
    assert.equal(new Set(entry.gaps).size, entry.gaps.length, `${entry.module}:gaps`);
    assert.equal(entry.operational.some((capability) => entry.gaps.includes(capability)), false, entry.module);
    if (entry.gaps.length > 0) assert.notEqual(entry.state, "production_ready", entry.module);
  }
});

test("maturity lookup returns the registry identity instead of a mutable copy", () => {
  for (const module of EXPECTED_MODULES) {
    const selected = getAdminModuleMaturity(module);
    assert.equal(selected, ADMIN_MODULE_MATURITY.find((entry) => entry.module === module));
  }
});
