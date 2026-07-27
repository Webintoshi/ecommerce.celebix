import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import type { MerchantPaymentMethod } from "@celebix/saas-contracts";

import {
  buildPaymentMethodOrderCommands,
  hasPaymentMethodOrderChanged,
  loadPaymentSettingsSources,
  movePaymentMethodOrder,
} from "./payment-settings-ui/console-state.ts";

const root = new URL("../", import.meta.url);
const source = (path: string) => readFile(new URL(path, root), "utf8");
const NOW = "2026-07-27T12:00:00.000Z";

function method(id: string, position: number): MerchantPaymentMethod {
  return Object.freeze({
    id,
    kind: "cash_on_delivery",
    profileId: null,
    providerCode: null,
    label: `Yöntem ${position + 1}`,
    state: "active",
    emergencyReason: null,
    position,
    config: Object.freeze({}),
    version: position + 1,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

test("payment console contains the ikas-like Celebix payment structure without foreign rails", async () => {
  const [consoleSource, catalogSource, drawerSource, orderSource] = await Promise.all([
    source("components/settings/payment/PaymentSettingsConsole.tsx"),
    source("components/settings/payment/PaymentProviderCatalogDialog.tsx"),
    source("components/settings/payment/PaymentProviderConnectionDrawer.tsx"),
    source("components/settings/payment/PaymentMethodOrderDialog.tsx"),
  ]);
  const combined = [consoleSource, catalogSource, drawerSource, orderSource].join("\n");
  for (const copy of [
    "Ödeme Ayarları", "Ödeme kullanılabilirliği", "Önizleme ve Sıralama",
    "Ödeme Yöntemi Ekle", "Ödeme Yöntemleri", "Acil Durum", "Durum",
  ]) assert.match(combined, new RegExp(copy));
  assert.match(consoleSource, /PanelTopbarBridge/);
  assert.doesNotMatch(combined, /MerchantModuleConsole|ikas|Hızlı Öde|floating-order|right-action/i);
  assert.match(catalogSource, /from "next\/image"/);
  assert.match(catalogSource, /card\.logoPath/);
  assert.match(consoleSource, /Promise\.allSettled|loadPaymentSettingsSources/);
});

test("payment console keeps catalog, profile and method states independent", async () => {
  const calls: string[] = [];
  let releaseCatalog: ((value: readonly string[]) => void) | undefined;
  const catalog = new Promise<readonly string[]>((resolve) => { releaseCatalog = resolve; });
  const pending = loadPaymentSettingsSources({
    catalog: () => { calls.push("catalog"); return catalog; },
    definitions: async () => { calls.push("definitions"); return ["definition"] as const; },
    profiles: async () => { calls.push("profiles"); throw new Error("private provider detail"); },
    methods: async () => { calls.push("methods"); return [] as const; },
  });
  await Promise.resolve();
  assert.deepEqual(calls, ["catalog", "definitions", "profiles", "methods"]);
  releaseCatalog?.(["catalog"]);
  const state = await pending;
  assert.equal(state.catalog.phase, "ready");
  assert.equal(state.definitions.phase, "ready");
  assert.equal(state.profiles.phase, "error");
  assert.equal(state.methods.phase, "ready");
  assert.doesNotMatch(JSON.stringify(state), /private provider detail/);
  assert.equal(Object.isFrozen(state), true);
});

test("payment console skips dormant provider execution when the catalog has no executable adapter", async () => {
  let providerCalls = 0;
  const state = await loadPaymentSettingsSources({
    catalog: async (): Promise<readonly string[]> => ["planned-provider"],
    definitions: async () => { providerCalls += 1; return ["definition"] as const; },
    profiles: async () => { providerCalls += 1; return ["profile"] as const; },
    methods: async () => [] as const,
    shouldLoadProviderExecution: (catalog) => catalog.includes("executable-provider"),
  });

  assert.equal(providerCalls, 0);
  assert.deepEqual(state.definitions, { phase: "ready", value: [] });
  assert.deepEqual(state.profiles, { phase: "ready", value: [] });
});

test("payment order helpers require an exact changed method set", () => {
  const methods = [
    method("40000000-0000-4000-8000-000000000001", 0),
    method("40000000-0000-4000-8000-000000000002", 1),
    method("40000000-0000-4000-8000-000000000003", 2),
  ];
  const original = methods.map(({ id }) => id);
  const moved = movePaymentMethodOrder(original, original[1]!, "up");
  assert.deepEqual(moved, [original[1], original[0], original[2]]);
  assert.equal(Object.isFrozen(moved), true);
  assert.equal(hasPaymentMethodOrderChanged(original, original), false);
  assert.equal(hasPaymentMethodOrderChanged(original, moved), true);
  assert.deepEqual(buildPaymentMethodOrderCommands(methods, moved), [
    { id: original[1], expectedVersion: 2, position: 0 },
    { id: original[0], expectedVersion: 1, position: 1 },
    { id: original[2], expectedVersion: 3, position: 2 },
  ]);
  assert.throws(() => buildPaymentMethodOrderCommands(methods, moved.slice(1)), /payment_method_order_invalid/);
  assert.throws(() => buildPaymentMethodOrderCommands(methods, [...moved, moved[0]!]), /payment_method_order_invalid/);
});

test("payment dialogs provide focus safety, dormant credentials and mutation confirmations", async () => {
  const [consoleSource, catalogSource, drawerSource, orderSource, css] = await Promise.all([
    source("components/settings/payment/PaymentSettingsConsole.tsx"),
    source("components/settings/payment/PaymentProviderCatalogDialog.tsx"),
    source("components/settings/payment/PaymentProviderConnectionDrawer.tsx"),
    source("components/settings/payment/PaymentMethodOrderDialog.tsx"),
    source("components/settings/payment/payment-settings.module.css"),
  ]);
  assert.match(catalogSource, /role="dialog"/);
  assert.match(catalogSource, /aria-modal="true"/);
  assert.match(catalogSource, /searchRef\.current\?\.focus/);
  assert.match(catalogSource, /openerRef\.current\?\.focus/);
  assert.match(catalogSource, /event\.key [!=]== "Tab"/);
  assert.match(catalogSource, /event\.key === "Escape"/);
  assert.match(catalogSource, /disabled=\{!card\.connectable/);
  assert.match(drawerSource, /credentialFields/);
  assert.match(drawerSource, /type="password"/);
  assert.match(drawerSource, /autoComplete="off"/);
  assert.match(drawerSource, /form\.reset\(\)/);
  assert.match(drawerSource, /Doğrulama bekliyor/);
  assert.doesNotMatch(drawerSource, /maskedAccountReference|publicConfig\[/);
  assert.match(consoleSource, /emergencyReason/);
  assert.match(consoleSource, /window\.confirm/);
  assert.match(orderSource, /draggable/);
  assert.match(orderSource, /Yukarı/);
  assert.match(orderSource, /Aşağı/);
  assert.match(orderSource, /hasPaymentMethodOrderChanged/);
  assert.match(orderSource, /version_conflict/);
  assert.match(css, /@media \(max-width: 1024px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(css, /position:\s*fixed;[^}]*right:\s*0/m);
});

test("read-only payment console never exposes mutation actions", async () => {
  const combined = (await Promise.all([
    source("components/settings/payment/PaymentSettingsConsole.tsx"),
    source("components/settings/payment/PaymentProviderCatalogDialog.tsx"),
    source("components/settings/payment/PaymentMethodOrderDialog.tsx"),
  ])).join("\n");
  assert.match(combined, /canManage/);
  assert.match(combined, /disabled=\{[^}]*!canManage/);
  assert.match(combined, /Salt okunur/);
});
