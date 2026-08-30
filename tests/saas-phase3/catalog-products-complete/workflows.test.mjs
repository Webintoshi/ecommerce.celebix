import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const read = (relative) => readFileSync(path.join(ROOT, relative), "utf8");

test("quick and advanced creation share one immutable draft including File objects", () => {
  const session = read("apps/customer-panel/lib/catalog-ui/product-draft-session.ts");
  const list = read("apps/customer-panel/components/catalog/ProductListConsole.tsx");
  const create = read("apps/customer-panel/components/catalog/ProductCreateForm.tsx");
  assert.match(session, /export type ProductDraftSession/);
  assert.match(session, /media: quick[.]media/);
  assert.match(session, /initial: session[.]initial/);
  assert.match(list, /draftSession/);
  assert.match(list, /onAdvanced=\{\(\) => \{ setQuickCreateOpen\(false\); setAdvancedCreateOpen\(true\); \}\}/);
  assert.match(create, /onAdvanced=\{\(\) => setMode\("advanced"\)\}/);
  assert.match(create, /productDraftIsDirty/);
});

test("list workflow exposes global query, URL pagination and atomic bulk controls", () => {
  const list = read("apps/customer-panel/components/catalog/ProductListConsole.tsx");
  const query = read("apps/customer-panel/lib/catalog-ui/product-list-query.ts");
  assert.match(query, /parseCatalogProductPageSize/);
  assert.match(list, /<option value="20">20<\/option><option value="50">50<\/option><option value="100">100<\/option>/);
  assert.match(list, /history[.]pushState/);
  assert.match(list, /history[.]replaceState/);
  assert.match(list, /addEventListener\("popstate"/);
  assert.match(list, /bulkMutateProducts/);
  assert.match(list, /bulkArchiveConfirmation/);
  assert.match(list, /Önceki/);
  assert.match(list, /Sonraki/);
});

test("edit workflow preserves local conflict state and offers explicit server reload", () => {
  const detail = read("apps/customer-panel/components/catalog/ProductDetailConsole.tsx");
  assert.match(detail, /failure instanceof CatalogApiError && failure[.]code === "version_conflict"/);
  assert.match(detail, /setConflict\(true\)/);
  assert.match(detail, /Sunucudaki sürümü yükle/);
  assert.match(detail, /removalConfirmation !== product[.]title/);
  assert.match(detail, /Mağazada önizle/);
  assert.doesNotMatch(detail, /version_conflict[\s\S]{0,180}location[.]reload/);
});

test("media workflow represents archive retention restore and verified cleanup", () => {
  const media = read("apps/customer-panel/components/catalog/ProductMediaManager.tsx");
  assert.match(media, /useState<"active" \| "archived">\("active"\)/);
  assert.match(media, /retentionExpiresAt/);
  assert.match(media, /Geri yükle/);
  assert.match(media, /Kalıcı temizle/);
  assert.match(media, /cleanup_pending/);
  assert.match(media, /Nesne kalıcı olarak temizlendi/);
});
