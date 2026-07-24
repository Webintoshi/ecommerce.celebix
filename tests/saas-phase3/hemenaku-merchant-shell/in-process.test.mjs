import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createPanelChromeModel } from "../../../apps/customer-panel/lib/panel-ui/chrome-model.ts";
import { createPanelDashboardModel } from "../../../apps/customer-panel/lib/panel-ui/dashboard-model.ts";
import { PANEL_NAVIGATION, isPanelNavigationPathActive } from "../../../apps/customer-panel/lib/panel-ui/navigation.ts";

const tenant = {
  schemaVersion: 1,
  requestId: "90000000-0000-4000-8000-000000000001",
  principal: { id: "10000000-0000-4000-8000-000000000001", issuer: "https://id.example/oidc", subject: "subject" },
  store: { id: "20000000-0000-4000-8000-000000000001", slug: "pilot-store", status: "active" },
  membership: { id: "30000000-0000-4000-8000-000000000001", role: "store_owner", status: "active" },
  entitlements: {
    schemaVersion: 1, planId: "40000000-0000-4000-8000-000000000001",
    planCode: "free_starter", version: 1, status: "active",
    features: ["catalog"], limits: { products: 100, staff: 1, storageBytes: 1_000_000 },
    validFrom: "2026-07-19T00:00:00.000Z",
  },
  locale: "tr-TR",
};

test("composes durable context into truthful dashboard without authority IDs", () => {
  const dashboard = createPanelDashboardModel(createPanelChromeModel(tenant));
  assert.equal(dashboard.cards[0].value, "pilot-store");
  assert.doesNotMatch(JSON.stringify(dashboard), /10000000|20000000|30000000|40000000|issuer|subject/);
});

test("keeps only the intentional product-create action outside finite navigation", () => {
  const dashboard = createPanelDashboardModel(createPanelChromeModel(tenant));
  const hrefs = new Set(PANEL_NAVIGATION.flatMap((item) => [item.href, ...(item.children ?? []).map((child) => child.href)]));
  const actionOnly = dashboard.actions.filter((action) => !hrefs.has(action.href));
  assert.deepEqual(actionOnly.map(({ href }) => href), ["/products/new"]);
  assert.equal(dashboard.actions.filter(({ href }) => href === "/products/new").length, 1);
  assert.equal(hrefs.has("/products/new"), false);
  assert.equal(isPanelNavigationPathActive("/products/new", "/products"), true);

  const mobileDock = readFileSync(
    new URL("../../../apps/customer-panel/components/panel/PanelMobileDock.tsx", import.meta.url),
    "utf8",
  );
  const dockHrefs = [...mobileDock.matchAll(/\{ href: "([^"]+)" as const/g)].map((match) => match[1]);
  assert.deepEqual(dockHrefs, ["/", "/products"]);
  assert.equal(dockHrefs.includes("/products/new"), false);
});

test("rejects cross-store resolved-host composition", () => {
  const unsafe = { ...tenant, resolvedHost: {
    schemaVersion: 1, hostname: "other.celebix.site", domainId: "50000000-0000-4000-8000-000000000001",
    domainType: "platform_subdomain", storeId: "60000000-0000-4000-8000-000000000001",
    storeSlug: "other", canonicalHostname: "other.celebix.site", status: "active", cacheVersion: 1,
  } };
  assert.throws(() => createPanelChromeModel(unsafe), /panel_chrome_context_invalid/);
});

test("rejects navigation near matches in process", () => {
  assert.equal(isPanelNavigationPathActive("/products-evil", "/products"), false);
  assert.equal(isPanelNavigationPathActive("/products/new", "/products"), true);
});

test("freezes every public presentation boundary", () => {
  const chrome = createPanelChromeModel(tenant);
  const dashboard = createPanelDashboardModel(chrome);
  assert.equal(Object.isFrozen(chrome), true);
  assert.equal(Object.isFrozen(dashboard), true);
  assert.equal(Object.isFrozen(PANEL_NAVIGATION), true);
});
