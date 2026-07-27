import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../", import.meta.url);
const source = (path: string) => readFile(new URL(path, ROOT), "utf8");

test("three finite new routes derive exact server permissions without browser authority", async () => {
  for (const [path, read, manage] of [
    ["app/products/purchasing/new/page.tsx", "purchasing.read", "purchasing.manage"],
    ["app/products/inventory-counts/new/page.tsx", "inventory.read", "inventory.manage"],
    ["app/products/transfers/new/page.tsx", "inventory.read", "inventory.manage"],
  ] as const) {
    const page = await source(path);
    assert.match(page, /resolveServerPanelAccess\(\)/);
    assert.match(page, new RegExp(read.replace(".", "[.]")));
    assert.match(page, new RegExp(manage.replace(".", "[.]")));
    assert.match(page, /mode="new"/);
    assert.doesNotMatch(page, /tenantContext=|storeId=|tenantId=|currency=|searchParams|headers\(\)|cookies\(\)/);
  }
});

test("inventory operation form owns finite create/edit/receipt fields and truthful states", async () => {
  const component = `${await source("components/inventory/InventoryOperationForm.tsx")}\n${await source("lib/inventory-ui/form-intent.ts")}`;
  for (const marker of [
    "supplierName", "locationId", "sourceLocationId", "destinationLocationId",
    "orderedQuantity", "unitCostCents", "countedQuantity", "quantity",
    "expectedVersion", "lineId", "variantId",
  ]) assert.match(component, new RegExp(marker));
  for (const state of ["loading", "loaded", "empty", "error", "denied", "conflict", "verification_unavailable"]) {
    assert.match(component, new RegExp(state));
  }
  assert.match(component, /En az bir pozitif teslim miktarı girin/);
  assert.match(component, /Kalan miktardan fazla teslim alınamaz/);
  assert.match(component, /sourceLocationId !== destinationLocationId|Kaynak ve hedef konum farklı olmalıdır/);
  assert.doesNotMatch(component, /\bstoreId\b|\btenantId\b|\bcustomerId\b|name="(?:role|permission|currency|balance|status)"/);
});

test("inventory forms and list create actions remain Hemenaku responsive and permission-gated", async () => {
  const [form, purchase, count, transfer, css] = await Promise.all([
    source("components/inventory/InventoryOperationForm.tsx"),
    source("components/inventory/PurchasingConsole.tsx"),
    source("components/inventory/InventoryCountConsole.tsx"),
    source("components/inventory/InventoryTransferConsole.tsx"),
    source("components/inventory/inventory-console.module.css"),
  ]);
  assert.match(form, /mobileFormCards/);
  assert.match(form, /desktopFormTable/);
  assert.match(form, /aria-live/);
  assert.match(css, /min-height:\s*48px/);
  assert.match(css, /@media\s*\(max-width:\s*760px\)/);
  for (const [sourceText, href] of [
    [purchase, "/products/purchasing/new"],
    [count, "/products/inventory-counts/new"],
    [transfer, "/products/transfers/new"],
  ]) {
    assert.match(sourceText, new RegExp(href));
    assert.match(sourceText, /canManage/);
  }
});

test("draft details mount exact editable forms while terminal records remain read-only", async () => {
  for (const path of [
    "components/inventory/PurchasingConsole.tsx",
    "components/inventory/InventoryCountConsole.tsx",
    "components/inventory/InventoryTransferConsole.tsx",
  ]) {
    const component = await source(path);
    assert.match(component, /status === "draft"/);
    assert.match(component, /InventoryOperationForm/);
    assert.match(component, /record=\{item\}/);
  }
});

test("inventory operation form source contains no forbidden authority or external endpoint", async () => {
  const component = await source("components/inventory/InventoryOperationForm.tsx");
  assert.doesNotMatch(component, /localStorage|sessionStorage|document[.]cookie|window[.]location[.]host|x-forwarded|supabase|logto|\/api\/admin|https?:\/\//i);
  assert.match(component, /loadInventoryFormChoices/);
});

test("new line identities are submit-owned and never randomize server/client initial render", async () => {
  const component = await source("components/inventory/InventoryOperationForm.tsx");
  const initializer = component.match(/const newLine[\s\S]*?;\nconst statusError/)?.[0] ?? "";
  assert.doesNotMatch(initializer, /crypto[.]randomUUID/);
  assert.doesNotMatch(component, /crypto[.]randomUUID/);
  assert.match(component, /submitInventoryOperationForm\(/);
});
