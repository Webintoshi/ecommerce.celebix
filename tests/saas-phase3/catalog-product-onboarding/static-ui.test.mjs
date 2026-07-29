import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../");
const read = (file) => readFileSync(path.join(ROOT, file), "utf8");
const UI_FILES = Object.freeze([
  "apps/customer-panel/components/catalog-onboarding/ProductQuickCreateDialog.tsx",
  "apps/customer-panel/components/catalog-onboarding/ProductAdvancedEditor.tsx",
  "apps/customer-panel/components/catalog-onboarding/ProductVariantBuilder.tsx",
  "apps/customer-panel/components/catalog-onboarding/CategoryManager.tsx",
  "apps/customer-panel/components/catalog/ProductCreateForm.tsx",
  "apps/customer-panel/components/catalog/ProductDetailConsole.tsx",
  "apps/customer-panel/lib/catalog-onboarding-ui/client.ts",
  "apps/customer-panel/lib/catalog-onboarding-ui/forms.ts",
  "apps/customer-panel/lib/catalog-onboarding-ui/media-completion.ts",
]);
const source = UI_FILES.map(read).join("\n");
const css = read("apps/customer-panel/components/catalog-onboarding/product-onboarding.module.css");

test("onboarding UI contains no browser, legacy, or transport authority", () => {
  assert.doesNotMatch(source, /x-store-id|x-tenant-id|localStorage|sessionStorage|document[.]cookie|supabase|\/api\/admin\//i);
  assert.doesNotMatch(source, /postgres(?:ql)?|DATABASE_URL|storeId\s*[:=]|tenantId\s*[:=]|membershipId\s*[:=]/i);
  assert.match(source, /credentials:\s*"same-origin"/);
});

test("quick dialog and page use truthful accessibility semantics", () => {
  const quick = read(UI_FILES[0]);
  assert.match(quick, /role=\{mode === "dialog" \? "dialog" : "region"\}/);
  assert.match(quick, /aria-modal=\{mode === "dialog" \? "true" : undefined\}/);
  assert.match(quick, /event[.]key === "Escape"/);
  assert.match(quick, /event[.]key !== "Tab"/);
  assert.match(quick, /returnFocusRef[.]current[?][.]focus/);
  assert.match(css, /min-height:\s*48px/);
  assert.match(css, /@media \(max-width:\s*1024px\)/);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /0[.]01ms/);
});

test("advanced editor remains one form with complete truthful sections", () => {
  const editor = read(UI_FILES[1]);
  for (const label of ["Temel bilgiler", "Fiyat ve stok", "Varyantlar", "Medya", "Kategori, koleksiyon, marka ve etiket", "Kargo ve gümrük", "SEO", "Satış kanalları", "Nitelikler ve ekstralar"]) assert.match(editor, new RegExp(label));
  assert.doesNotMatch(editor, /İleri|Önceki|currentStep|stepIndex/);
  assert.match(editor, /expectedProfileVersion:\s*editor[.]profile[.]version/);
  assert.match(editor, /Yerel alanlarınız korunuyor/);
});

test("multi-image completion is bounded, ordered, and never retries publication", () => {
  const completion = read("apps/customer-panel/lib/catalog-onboarding-ui/media-completion.ts");
  assert.match(completion, /MAX_MEDIA_COUNT = 16/);
  assert.match(completion, /image\/jpeg.*image\/png.*image\/webp/);
  assert.match(completion, /for \(const \[index, selected\] of input[.]files[.]entries\(\)\)/);
  assert.equal((completion.match(/input[.]complete\(/g) ?? []).length, 1);
  assert.equal((completion.match(/input[.]recover\(/g) ?? []).length, 1);
  assert.match(completion, /draft_media_failed/);
  assert.match(completion, /completion_unknown/);
});

test("category UI uses only session-owned same-origin CRUD", () => {
  const manager = read("apps/customer-panel/components/catalog-onboarding/CategoryManager.tsx");
  const client = read("apps/customer-panel/lib/catalog-onboarding-ui/client.ts");
  for (const method of ["listCategories", "createCategory", "updateCategory", "archiveCategory"]) assert.match(manager, new RegExp(method));
  assert.match(client, /\/api\/catalog\/onboarding\/categories/);
  assert.doesNotMatch(manager, /storeId|tenantId|principalId|document[.]cookie|localStorage|sessionStorage/);
});

test("no generated UI copy claims unsupported automation or fake data", () => {
  assert.doesNotMatch(source, /AI generated|yapay zeka ile oluştur|örnek satış|sahte KPI|fake product|otomatik feed/i);
  assert.doesNotMatch(source, /video\/(?:mp4|webm)|image\/heic/i);
});
