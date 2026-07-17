import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../", import.meta.url);

async function source(path: string) {
  return readFile(new URL(path, ROOT), "utf8");
}

test("product routes stay behind the durable server panel access guard", async () => {
  const layout = await source("app/products/layout.tsx");
  assert.match(layout, /requireServerPanelAccess/);
  assert.match(layout, /tenantContext/);
  for (const path of [
    "app/products/page.tsx",
    "app/products/new/page.tsx",
    "app/products/[productId]/page.tsx",
  ]) {
    assert.ok((await source(path)).length > 0, path);
  }
});

test("catalog browser code is same-origin and contains no browser tenant or credential authority", async () => {
  const files = [
    "lib/catalog-ui/client.ts",
    "components/catalog/ProductListConsole.tsx",
    "components/catalog/ProductCreateForm.tsx",
    "components/catalog/ProductDetailConsole.tsx",
  ];
  const combined = (await Promise.all(files.map(source))).join("\n");
  assert.match(combined, /credentials:\s*["']same-origin["']/);
  assert.match(combined, /crypto\.randomUUID/);
  assert.doesNotMatch(combined, /document\.cookie|localStorage|sessionStorage|x-forwarded|\bstoreId\b/i);
  assert.doesNotMatch(combined, /postgres|repository|database/i);
});

test("authenticated shell shows store role and uses JSON session logout with a full navigation", async () => {
  const shell = await source("components/panel/PanelShell.tsx");
  const logout = await source("components/panel/LogoutButton.tsx");
  assert.match(shell, /tenantContext\.store\.slug/);
  assert.match(shell, /tenantContext\.membership\.role/);
  assert.match(logout, /\/api\/session\/logout/);
  assert.match(logout, /application\/json/);
  assert.match(logout, /credentials:\s*["']same-origin["']/);
  assert.match(logout, /location\.assign\(["']\/login["']\)/);
  assert.doesNotMatch(`${shell}\n${logout}`, /document\.cookie|localStorage|sessionStorage/);
});

test("product UI includes safe states and responsive mobile navigation without fake records", async () => {
  const list = await source("components/catalog/ProductListConsole.tsx");
  const detail = await source("components/catalog/ProductDetailConsole.tsx");
  const styles = await source("app/globals.css");
  assert.match(list, /Henüz ürün yok/);
  assert.match(list, /Daha fazla yükle/);
  assert.match(list, /Arşivlemeyi onayla/);
  assert.match(detail, /version_conflict/);
  assert.match(detail, /En güncel veriler yeniden yüklendi/);
  assert.match(styles, /@media[^]*max-width:\s*640px/);
  assert.match(styles, /mobile-navigation/);
  assert.doesNotMatch(`${list}\n${detail}`, /placeholder analytics|fake product|image upload/i);
});

test("create, archive, variant and conflict flows keep rendered versions and navigate safely", async () => {
  const create = await source("components/catalog/ProductCreateForm.tsx");
  const list = await source("components/catalog/ProductListConsole.tsx");
  const detail = await source("components/catalog/ProductDetailConsole.tsx");
  assert.match(create, /location\.assign\(`\/products\/\$\{result\.product\.id\}`\)/);
  assert.match(list, /archiveProduct\(archiveCandidate\.id, archiveCandidate\.version\)/);
  assert.match(list, /filter\(\(item\) => item\.id !== archiveCandidate\.id\)/);
  assert.match(detail, /updateProduct\(productId, parsed\.value\)/);
  assert.match(detail, /createVariant\(productId, parsed\.value\)/);
  assert.match(detail, /updateVariant\(productId, variant\.id, parsed\.value\)/);
  assert.match(detail, /archiveVariant\(productId, archiveVariant\.id, archiveVariant\.version\)/);
  assert.match(detail, /failure\.code === "version_conflict"/);
  assert.match(detail, /await load\(true\)/);
});

test("store selection is omitted when no authorized server projection exists", async () => {
  const shell = await source("components/panel/PanelShell.tsx");
  const navigation = await source("components/panel/PanelNavigation.tsx");
  assert.doesNotMatch(`${shell}\n${navigation}`, /StoreSelector|active-store|storeId/);
  assert.match(shell, /tenantContext\.store\.slug/);
});

test("server access remains the sole protected-page redirect authority", async () => {
  const access = await source("lib/server-access.ts");
  const layout = await source("app/products/layout.tsx");
  assert.match(access, /decideServerPanelAccess/);
  assert.match(access, /redirect\(decision\.destination\)/);
  assert.doesNotMatch(layout, /searchParams|headers\(|cookies\(/);
});
