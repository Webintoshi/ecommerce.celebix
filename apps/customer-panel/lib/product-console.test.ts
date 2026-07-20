import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

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
  const layout = await source("app/(panel)/layout.tsx");
  const shell = await source("components/panel/PanelShell.tsx");
  const clientFiles = await Promise.all([
    "components/panel/PanelLayoutClient.tsx",
    "components/panel/PanelSidebar.tsx",
    "components/panel/PanelNavigation.tsx",
  ].map(source));
  const logout = await source("components/panel/LogoutButton.tsx");
  assert.match(layout, /createPanelChromeModel\(tenantContext\)/);
  assert.match(layout, /PanelShell model=/);
  assert.match(shell, /PanelLayoutClient/);
  assert.match(shell, /createPanelChromeModel/);
  assert.match(shell, /SERVER_CONTEXT_PROP/);
  assert.doesNotMatch(clientFiles.join("\n"), /TenantContext|principal|issuer|subject|storeId|membershipId|planId|domainId|requestId/);
  assert.match(logout, /\/api\/session\/logout/);
  assert.match(logout, /application\/json/);
  assert.match(logout, /credentials:\s*["']same-origin["']/);
  assert.match(logout, /location\.assign\(["']\/login["']\)/);
  assert.doesNotMatch(`${shell}\n${logout}`, /document\.cookie|localStorage|sessionStorage/);
});

test("product UI includes safe states and responsive catalog behavior without fake records", async () => {
  const list = await source("components/catalog/ProductListConsole.tsx");
  const detail = await source("components/catalog/ProductDetailConsole.tsx");
  const styles = await source("app/globals.css");
  assert.match(list, /Henüz ürün yok/);
  assert.match(list, /Daha fazla yükle/);
  assert.match(list, /Arşivlemeyi onayla/);
  assert.match(detail, /version_conflict/);
  assert.match(detail, /En güncel veriler yeniden yüklendi/);
  assert.match(styles, /@media[^]*max-width:\s*640px/);
  assert.doesNotMatch(`${list}\n${detail}`, /placeholder analytics|fake product|image upload/i);
});

test("merchant shell adopts the Hemenaku visual language without its dedicated authorities", async () => {
  const shell = await source("components/panel/PanelShell.tsx");
  const navigation = await source("components/panel/PanelNavigation.tsx");
  const styles = await source("components/panel/panel-shell.module.css");
  const globals = await source("app/globals.css");
  assert.match(shell, /PanelLayoutClient/);
  assert.match(navigation, /PANEL_NAVIGATION/);
  assert.match(navigation, /isPanelNavigationPathActive/);
  assert.match(styles, /#2A2A2A/i);
  assert.match(styles, /#F9F9F9/i);
  assert.match(styles, /#FF6A00/i);
  assert.match(styles, /min-width:\s*1025px/);
  assert.match(globals, /--hemenaku-orange:\s*#FF6A00/i);
  assert.match(globals, /--hemenaku-canvas:\s*#F9F9F9/i);
  assert.doesNotMatch(`${shell}\n${navigation}`, /apps\/admin|\/admin\/|supabase|STORE_RUNTIME|ToshiAssistant/);
});

test("catalog pages adapt Hemenaku list, form and detail surfaces without unsupported modules", async () => {
  const list = await source("components/catalog/ProductListConsole.tsx");
  const create = await source("components/catalog/ProductCreateForm.tsx");
  const detail = await source("components/catalog/ProductDetailConsole.tsx");
  const styles = await source("app/globals.css");
  assert.match(list, /hemenaku-product-hero/);
  assert.match(list, /hemenaku-catalog-surface/);
  assert.match(list, /data-presentation="hemenaku-product-list"/);
  assert.match(list, /aria-label="Ürün durumu filtresi"/);
  assert.match(list, /Ürün kataloğu/);
  assert.match(create, /hemenaku-wizard-stepper/);
  assert.match(create, /Temel Bilgiler/);
  assert.match(create, /Fiyat ve Stok/);
  assert.match(detail, /hemenaku-detail-hero/);
  assert.match(detail, /Ürün Bilgileri/);
  assert.match(styles, /\.hemenaku-product-hero[^}]*border-radius:\s*30px/s);
  assert.match(styles, /\.catalog-form fieldset[^}]*border-radius:\s*28px/s);
  assert.doesNotMatch(`${list}\n${create}\n${detail}`, /\/api\/admin|\/admin\/urunler|category|image upload|seo|supabase/i);
});

test("detail and media surfaces retain versioned target commands", async () => {
  const detail = await source("components/catalog/ProductDetailConsole.tsx");
  const media = await source("components/catalog/ProductMediaManager.tsx");
  assert.match(detail, /data-presentation="hemenaku-product-detail"/);
  assert.match(detail, /updateProduct\(productId, parsed\.value\)/);
  assert.match(detail, /updateVariant\(productId, variant\.id, parsed\.value\)/);
  assert.match(detail, /archiveVariant\(productId, archiveVariant\.id, archiveVariant\.version\)/);
  assert.match(detail, /failure\.code === "version_conflict"/);
  assert.match(media, /productMediaApi\.reorder/);
  assert.match(media, /productMediaApi\.archive/);
  assert.match(detail, /aria-modal="true"/);
  assert.match(detail, /onKeyDown=\{handleArchiveDialogKeyDown\}/);
  assert.match(media, /aria-modal="true"/);
  assert.match(media, /onKeyDown=\{handleArchiveDialogKeyDown\}/);
  assert.match(detail, /ref=\{variantsHeadingRef\}[^>]*tabIndex=\{-1\}[^>]*id="variants-title"/);
  assert.match(detail, /restoreArchiveFocus\(archiveTriggerRef\.current, variantsHeadingRef\.current\)/);
  assert.match(media, /ref=\{mediaUploadCardRef\}/);
  assert.match(media, /restoreArchiveFocus\(archiveTriggerRef\.current, mediaUploadCardRef\.current\)/);
  assert.match(media, /export function restoreArchiveFocus/);
  assert.match(media, /failure instanceof ProductMediaApiError && failure\.code === "version_conflict"\) \{\s*await load\(\);\s*setArchiveTarget\(undefined\);\s*\}/);
  assert.doesNotMatch(`${detail}\n${media}`, /storeId|tenantId|document\.cookie|\/api\/admin|supabase/i);
});

class FocusTarget {
  isConnected = true;
  focusCount = 0;

  focus() { this.focusCount += 1; }
}

async function productionFocusRestorer() {
  const media = await source("components/catalog/ProductMediaManager.tsx");
  const match = media.match(/export function restoreArchiveFocus[\s\S]*?\n\}/);
  assert.ok(match, "the production focus restorer must be exported from the media manager");
  const compiled = ts.transpileModule(match[0].replace("export function", "function"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return Function(`${compiled}\nreturn restoreArchiveFocus;`)() as (trigger: HTMLElement | null, fallback: HTMLElement | null) => "trigger" | "fallback" | "none";
}

test("production archive focus restorer prefers a live trigger and safely falls back", async () => {
  const restoreArchiveFocus = await productionFocusRestorer();
  const trigger = new FocusTarget();
  const fallback = new FocusTarget();

  assert.equal(restoreArchiveFocus(trigger as unknown as HTMLElement, fallback as unknown as HTMLElement), "trigger");
  assert.equal(trigger.focusCount, 1);
  assert.equal(fallback.focusCount, 0);

  trigger.isConnected = false;
  assert.equal(restoreArchiveFocus(trigger as unknown as HTMLElement, fallback as unknown as HTMLElement), "fallback");
  assert.equal(fallback.focusCount, 1);

  fallback.isConnected = false;
  assert.equal(restoreArchiveFocus(trigger as unknown as HTMLElement, fallback as unknown as HTMLElement), "none");
});

test("creation wizard remains bound to the durable target workflow", async () => {
  const create = await source("components/catalog/ProductCreateForm.tsx");
  const createIndex = create.indexOf("await catalogApi.createProduct");
  const uploadIndex = create.indexOf("await productMediaApi.upload");
  const redirectIndex = create.indexOf("location.assign");
  assert.match(create, /data-presentation="hemenaku-product-create"/);
  assert.match(create, /buildCreateProductPayload/);
  assert.match(create, /await catalogApi\.createProduct/);
  assert.match(create, /if \(image !== undefined\) \{[^]*await productMediaApi\.upload\(result\.product\.id,/);
  assert.match(create, /location\.assign\(`\/products\/\$\{result\.product\.id\}`\)/);
  assert.ok(createIndex < uploadIndex && uploadIndex < redirectIndex);
  assert.doesNotMatch(create, /seo|nutrition|categoryId|\/api\/admin|supabase/i);
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
  const client = await source("components/panel/PanelLayoutClient.tsx");
  const sidebar = await source("components/panel/PanelSidebar.tsx");
  assert.doesNotMatch(`${client}\n${sidebar}\n${navigation}`, /StoreSelector|active-store|storeId/);
  assert.match(sidebar, /model\.storeSlug/);
  assert.match(shell, /PanelChromeModel/);
});

test("server access remains the sole protected-page redirect authority", async () => {
  const access = await source("lib/server-access.ts");
  const layout = await source("app/products/layout.tsx");
  assert.match(access, /decideServerPanelAccess/);
  assert.match(access, /redirect\(decision\.destination\)/);
  assert.doesNotMatch(layout, /searchParams|headers\(|cookies\(/);
});
