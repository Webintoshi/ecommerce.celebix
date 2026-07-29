# Catalog Category Hierarchy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve parent/child category authority through manual category management, manual product assignment, and WooCommerce bulk import without introducing a second category or tenant authority.

**Architecture:** Reuse `saas.catalog_categories.parent_id` as the only durable hierarchy. Add one environment-independent category-tree projection for customer-panel presentation, extend only category migration taxonomy with `parentSlug`, and replace `catalog_migration_begin` through additive migration `066` so a complete category tree is validated and created atomically from root to leaf.

**Tech Stack:** TypeScript 5.9, React 19, Next.js 16, Node test runner, PostgreSQL 16.14, PL/pgSQL, npm workspaces.

## Global Constraints

- Category depth remains exactly bounded to levels `1..8`.
- `saas.catalog_categories.parent_id` and session-derived `TenantContext` remain the only category and tenant authorities.
- Browser input must not supply store ID, tenant ID, principal ID, membership ID, PostgreSQL coordinates, or secret authority.
- `parentSlug` is allowed only for imported categories; imported brands remain exact `{ name, slug }` records.
- Imported product assignments contain each source path's leaf slug; manual assignments contain the category IDs explicitly selected by the merchant. Ancestors are never auto-duplicated into `catalog_product_categories`.
- Existing root-only category manifests remain accepted without rewriting completed jobs.
- Existing Güzide records, media, customer data, and the first staging store must not be rewritten.
- No dependency or lockfile change is permitted.
- `apps/admin/**` remains byte-for-byte unchanged.
- Production deploy, production credentials, DNS, merge, and production data mutation remain forbidden.
- PostgreSQL changes must be additive migration `066`, with exact rollback, assertions, immutable checksum manifest, backup/restore, reapply, and cleanup proof.

## File Map

- Create `apps/customer-panel/lib/catalog-onboarding-ui/category-tree.ts`: validate and project category records into stable tree rows, full labels, and descendant sets.
- Create `apps/customer-panel/lib/catalog-onboarding-ui/category-tree.test.ts`: unit proof for order, labels, descendants, malformed graphs, and immutability.
- Modify `apps/customer-panel/components/catalog-onboarding/CategoryManager.tsx:1-73`: render the tree and add a child-category action without changing CRUD authority.
- Modify `apps/customer-panel/components/catalog-onboarding/ProductQuickCreateDialog.tsx:232-249`: show full category paths in the quick form.
- Modify `apps/customer-panel/components/catalog-onboarding/ProductAdvancedEditor.tsx:180-197`: show full category paths in the multi-select editor.
- Modify `apps/customer-panel/components/catalog-onboarding/product-onboarding.module.css:1-154`: tree-row and 48px child-action styles.
- Modify `tests/saas-phase3/catalog-product-onboarding/static-ui.test.mjs:9-67`: include the tree helper in authority scans and assert hierarchy usage.
- Modify `apps/customer-panel/lib/catalog-import/woocommerce-migration.ts:1-439`: compile `>` category paths and preserve root-to-leaf taxonomy authority.
- Modify `apps/customer-panel/lib/catalog-import/woocommerce-migration.test.ts:1-202`: red/green category-path and negative tests.
- Modify `packages/saas-data/src/catalog-migration/types.ts:1-82`: add optional `parentSlug` only to category taxonomy.
- Modify `packages/saas-data/src/catalog-migration/index.ts:1-20`: export the category-specific public type.
- Modify `packages/saas-data/src/catalog-migration/validation.ts:80-110`: split category and brand taxonomy validation.
- Modify `packages/saas-data/src/catalog-migration/repository.ts:110-123`: bind validated hierarchical categories to fingerprint and SQL.
- Modify `packages/saas-data/src/catalog-migration/repository.test.ts:127-177,304-327`: prove exact persisted JSON and fail-before-checkout negatives.
- Create `apps/owner/scripts/sql/saas/202607290066_catalog_category_hierarchy.up.sql`: helper validators and hierarchy-aware `catalog_migration_begin`.
- Create `apps/owner/scripts/sql/saas/202607290066_catalog_category_hierarchy.down.sql`: remove helpers and restore the exact migration-059 begin function.
- Create `apps/owner/scripts/sql/saas/202607290066_catalog_category_hierarchy_assertions.sql`: catalog, ACL, volatility, function-body, and public-execute assertions.
- Create `apps/owner/scripts/sql/saas/phase3y-catalog-category-hierarchy-manifest.json`: SHA-256 pin for all three migration artifacts.
- Create `tests/saas-phase3/catalog-category-hierarchy/static-security.test.mjs`: immutable manifest and source-boundary checks.
- Create `tests/saas-phase3/catalog-category-hierarchy/postgres-harness.mjs`: isolated native PostgreSQL 16.14, exactly 23 scenarios.

---

### Task 1: Shared category-tree projection and manual UI

**Files:**
- Create: `apps/customer-panel/lib/catalog-onboarding-ui/category-tree.ts`
- Create: `apps/customer-panel/lib/catalog-onboarding-ui/category-tree.test.ts`
- Modify: `apps/customer-panel/components/catalog-onboarding/CategoryManager.tsx:1-73`
- Modify: `apps/customer-panel/components/catalog-onboarding/ProductQuickCreateDialog.tsx:232-249`
- Modify: `apps/customer-panel/components/catalog-onboarding/ProductAdvancedEditor.tsx:180-197`
- Modify: `apps/customer-panel/components/catalog-onboarding/product-onboarding.module.css:1-154`
- Modify: `tests/saas-phase3/catalog-product-onboarding/static-ui.test.mjs:9-67`

**Interfaces:**
- Consumes: records shaped as `Readonly<{ id: string; parentId?: string; name: string; position: number }>` from session-bound onboarding APIs.
- Produces:

```ts
export interface CatalogCategoryTreeEntry {
  readonly id: string;
  readonly parentId?: string;
  readonly name: string;
  readonly position: number;
}

export interface CatalogCategoryTreeRow<T extends CatalogCategoryTreeEntry> {
  readonly category: T;
  readonly depth: number;
  readonly path: readonly string[];
  readonly label: string;
}

export interface CatalogCategoryHierarchy<T extends CatalogCategoryTreeEntry> {
  readonly valid: boolean;
  readonly rows: readonly CatalogCategoryTreeRow<T>[];
  labelFor(id: string): string | undefined;
  descendantIds(id: string): readonly string[];
}

export function buildCatalogCategoryHierarchy<T extends CatalogCategoryTreeEntry>(
  categories: readonly T[],
): CatalogCategoryHierarchy<T>;
```

- [ ] **Step 1: Write failing tree-projection tests**

Add five tests covering deterministic Turkish order, full labels, descendants, malformed orphan/cycle graphs, and frozen results:

```ts
test("projects a stable root-to-leaf category tree", () => {
  const result = buildCatalogCategoryHierarchy([
    { id: "b", name: "Yüzük", parentId: "a", position: 2 },
    { id: "c", name: "Kolye", parentId: "a", position: 1 },
    { id: "a", name: "Takı", position: 0 },
  ]);
  assert.equal(result.valid, true);
  assert.deepEqual(result.rows.map(({ category, label, depth }) => [category.id, label, depth]), [
    ["a", "Takı", 1],
    ["c", "Takı › Kolye", 2],
    ["b", "Takı › Yüzük", 2],
  ]);
  assert.deepEqual(result.descendantIds("a"), ["c", "b"]);
});

test("fails closed for orphan and cyclic category graphs", () => {
  assert.equal(buildCatalogCategoryHierarchy([{ id: "a", parentId: "missing", name: "A", position: 0 }]).valid, false);
  assert.equal(buildCatalogCategoryHierarchy([
    { id: "a", parentId: "b", name: "A", position: 0 },
    { id: "b", parentId: "a", name: "B", position: 0 },
  ]).valid, false);
});

test("rejects category depth above eight", () => {
  const categories = Array.from({ length: 9 }, (_, index) => ({
    id: String(index), name: `Seviye ${index + 1}`, position: index,
    ...(index === 0 ? {} : { parentId: String(index - 1) }),
  }));
  assert.equal(buildCatalogCategoryHierarchy(categories).valid, false);
});

test("distinguishes equal leaf names by their complete paths", () => {
  const result = buildCatalogCategoryHierarchy([
    { id: "a", name: "Kadın", position: 0 }, { id: "b", name: "Erkek", position: 1 },
    { id: "c", parentId: "a", name: "Yüzük", position: 0 },
    { id: "d", parentId: "b", name: "Yüzük", position: 0 },
  ]);
  assert.deepEqual([result.labelFor("c"), result.labelFor("d")], ["Kadın › Yüzük", "Erkek › Yüzük"]);
});

test("returns frozen rows, paths, and descendant copies", () => {
  const result = buildCatalogCategoryHierarchy([
    { id: "a", name: "Takı", position: 0 }, { id: "b", parentId: "a", name: "Yüzük", position: 0 },
  ]);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.rows), true);
  assert.equal(Object.isFrozen(result.rows[1]?.path), true);
  assert.equal(Object.isFrozen(result.descendantIds("a")), true);
});
```

- [ ] **Step 2: Run the focused test and observe RED**

Run:

```bash
node --experimental-transform-types --test apps/customer-panel/lib/catalog-onboarding-ui/category-tree.test.ts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `category-tree.ts`.

- [ ] **Step 3: Implement the minimal immutable projection**

Use a parent-index plus depth-first traversal; reject duplicate IDs, missing parents, cycles, unreachable nodes, and depth above eight:

```ts
const compare = <T extends CatalogCategoryTreeEntry>(left: T, right: T) =>
  left.position - right.position
  || left.name.localeCompare(right.name, "tr-TR")
  || left.id.localeCompare(right.id);

function invalidHierarchy<T extends CatalogCategoryTreeEntry>(): CatalogCategoryHierarchy<T> {
  const empty = Object.freeze([]) as readonly CatalogCategoryTreeRow<T>[];
  return Object.freeze({ valid: false, rows: empty, labelFor: () => undefined, descendantIds: () => Object.freeze([]) });
}

function validHierarchy<T extends CatalogCategoryTreeEntry>(source: readonly CatalogCategoryTreeRow<T>[]): CatalogCategoryHierarchy<T> {
  const rows = Object.freeze([...source]);
  const byId = new Map(rows.map((row) => [row.category.id, row]));
  const descendants = new Map<string, string[]>();
  for (const row of rows) {
    let parentId = row.category.parentId;
    while (parentId !== undefined) {
      const values = descendants.get(parentId) ?? [];
      values.push(row.category.id); descendants.set(parentId, values);
      parentId = byId.get(parentId)?.category.parentId;
    }
  }
  return Object.freeze({
    valid: true,
    rows,
    labelFor: (id: string) => byId.get(id)?.label,
    descendantIds: (id: string) => Object.freeze([...(descendants.get(id) ?? [])]),
  });
}

export function buildCatalogCategoryHierarchy<T extends CatalogCategoryTreeEntry>(categories: readonly T[]) {
  const byId = new Map<string, T>();
  for (const category of categories) {
    if (byId.has(category.id)) return invalidHierarchy<T>();
    byId.set(category.id, category);
  }
  const children = new Map<string | undefined, T[]>();
  for (const category of categories) {
    if (category.parentId !== undefined && !byId.has(category.parentId)) return invalidHierarchy<T>();
    const branch = children.get(category.parentId) ?? [];
    branch.push(category);
    children.set(category.parentId, branch);
  }
  const rows: CatalogCategoryTreeRow<T>[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const walk = (category: T, path: readonly string[]) => {
    if (visiting.has(category.id) || path.length >= 8) return false;
    visiting.add(category.id);
    const nextPath = Object.freeze([...path, category.name]);
    rows.push(Object.freeze({ category, depth: nextPath.length, path: nextPath, label: nextPath.join(" › ") }));
    for (const child of [...(children.get(category.id) ?? [])].sort(compare)) if (!walk(child, nextPath)) return false;
    visiting.delete(category.id); visited.add(category.id); return true;
  };
  for (const root of [...(children.get(undefined) ?? [])].sort(compare)) if (!walk(root, [])) return invalidHierarchy<T>();
  if (visited.size !== categories.length) return invalidHierarchy<T>();
  return validHierarchy(rows);
}
```

- [ ] **Step 4: Run the tree tests and observe GREEN**

Run the Step 2 command.

Expected: `5/5 PASS`.

- [ ] **Step 5: Add UI assertions before changing components**

Add a seventh top-level test to `static-ui.test.mjs` that expects `buildCatalogCategoryHierarchy`, `descendantIds`, the exact full-path separator `›`, and an “Alt kategori ekle” action. The existing authority test must continue rejecting `storeId`, `tenantId`, cookies, local storage, and database authority.

Run:

```bash
node --test tests/saas-phase3/catalog-product-onboarding/static-ui.test.mjs
```

Expected: FAIL because the components do not use the new projection yet.

- [ ] **Step 6: Wire the hierarchy into all manual paths**

In `CategoryManager`, maintain `creatingUnderId`, derive one hierarchy model, and exclude descendants from the parent selector:

```tsx
const hierarchy = buildCatalogCategoryHierarchy(categories);
const unavailableParents = new Set(editing ? [editing.id, ...hierarchy.descendantIds(editing.id)] : []);
const activeRows = hierarchy.rows.filter(({ category }) => category.status === "active");

function createChild(category: CatalogCategory) {
  setEditing(undefined);
  setCreatingUnderId(category.id);
}

<form key={editing?.id ?? `new:${creatingUnderId ?? "root"}`} onSubmit={save}>
<select name="parentId" defaultValue={editing?.parentId ?? creatingUnderId ?? ""}>
  <option value="">Ana kategori</option>
  {activeRows
    .filter(({ category, depth }) => !unavailableParents.has(category.id) && depth < 8)
    .map(({ category, label }) => <option key={category.id} value={category.id}>{label}</option>)}
</select>
</form>
```

Render `hierarchy.rows` with full path text and a 48×48px button labelled `${category.name} altında alt kategori ekle`. Clear `creatingUnderId` on successful save, cancel, or edit selection. If `valid === false`, show a controlled category-service error and do not offer mutations from an untrusted graph.

In quick and advanced forms:

```tsx
const categoryHierarchy = buildCatalogCategoryHierarchy(options.categories);
{categoryHierarchy.rows.map(({ category, label }) => (
  <option key={category.id} value={category.id}>{label}</option>
))}
```

Both product forms must use `categoryHierarchy.valid ? categoryHierarchy.rows : []`; when false, render `role="alert"` with “Kategori seçenekleri şu anda kullanılamıyor.” and do not submit a category UUID from the invalid graph.

- [ ] **Step 7: Run focused UI, type, and authority checks**

Run:

```bash
node --experimental-transform-types --test apps/customer-panel/lib/catalog-onboarding-ui/category-tree.test.ts
node --test tests/saas-phase3/catalog-product-onboarding/static-ui.test.mjs
npm run typecheck --workspace @celebix/customer-panel
git diff --check
```

Expected: tree `5/5 PASS`, static UI `7/7 PASS`, typecheck PASS, diff check PASS.

- [ ] **Step 8: Commit the independently reviewable manual hierarchy**

```bash
git add apps/customer-panel/lib/catalog-onboarding-ui/category-tree.ts \
  apps/customer-panel/lib/catalog-onboarding-ui/category-tree.test.ts \
  apps/customer-panel/components/catalog-onboarding/CategoryManager.tsx \
  apps/customer-panel/components/catalog-onboarding/ProductQuickCreateDialog.tsx \
  apps/customer-panel/components/catalog-onboarding/ProductAdvancedEditor.tsx \
  apps/customer-panel/components/catalog-onboarding/product-onboarding.module.css \
  tests/saas-phase3/catalog-product-onboarding/static-ui.test.mjs
git commit -m "feat(catalog): render merchant category hierarchy"
```

---

### Task 2: WooCommerce category-path compiler

**Files:**
- Modify: `apps/customer-panel/lib/catalog-import/woocommerce-migration.ts:1-42,283-333,359-435`
- Modify: `apps/customer-panel/lib/catalog-import/woocommerce-migration.test.ts:47-202`

**Interfaces:**
- Consumes: WooCommerce category cell such as `Takı > Yüzük > Altın Yüzük, Kampanyalar`.
- Produces:

```ts
export interface WooCommerceMigrationTaxonomy {
  readonly name: string;
  readonly slug: string;
  readonly parentSlug?: string;
}

type CompiledCategoryPaths = Readonly<{
  taxonomies: readonly WooCommerceMigrationTaxonomy[];
  leafSlugs: readonly string[];
}>;
```

- [ ] **Step 1: Write failing path compiler tests**

```ts
test("compiles category paths root-to-leaf and assigns only leaves", async () => {
  const manifest = await compileWooCommerceMigration(exportCsv(sourceRow({
    Kategoriler: "Takı > Yüzük > Altın Yüzük, Kampanyalar > Yeni Gelenler",
  })));
  assert.deepEqual(manifest.categories, [
    { name: "Takı", slug: "taki" },
    { name: "Yüzük", slug: "yuzuk", parentSlug: "taki" },
    { name: "Altın Yüzük", slug: "altin-yuzuk", parentSlug: "yuzuk" },
    { name: "Kampanyalar", slug: "kampanyalar" },
    { name: "Yeni Gelenler", slug: "yeni-gelenler", parentSlug: "kampanyalar" },
  ]);
  assert.deepEqual(manifest.products[0]?.categorySlugs, ["altin-yuzuk", "yeni-gelenler"]);
});

test("rejects malformed and over-depth category paths", async () => {
  for (const categories of ["Takı > > Yüzük", "Takı >", Array.from({ length: 9 }, (_, index) => `S${index}`).join(" > ")]) {
    await assert.rejects(() => compileWooCommerceMigration(exportCsv(sourceRow({ Kategoriler: categories }))));
  }
});
```

Add a third test proving a repeated slug with a different name or parent is rejected rather than silently merged.

```ts
test("rejects one canonical slug requested under two parents", async () => {
  const source = exportCsv(
    sourceRow({ Kimlik: "10", Kategoriler: "Kadın > Yüzük" }),
    sourceRow({ Kimlik: "11", "Stok kodu (SKU)": "SKU-11", "GTIN, UPC, EAN veya ISBN": "100000014582", Kategoriler: "Erkek > Yüzük" }),
  );
  await assert.rejects(() => compileWooCommerceMigration(source), /woocommerce_migration_source_invalid/);
});
```

- [ ] **Step 2: Run focused tests and observe RED**

Run:

```bash
node --experimental-transform-types --test apps/customer-panel/lib/catalog-import/woocommerce-migration.test.ts
```

Expected: the three new hierarchy tests FAIL; the existing 20 assertions remain green.

- [ ] **Step 3: Implement category-path compilation**

Keep the current flat taxonomy parser for brands. Add a category-only compiler:

```ts
function categoryPaths(value: string): CompiledCategoryPaths {
  const taxonomies: WooCommerceMigrationTaxonomy[] = [];
  const leafSlugs: string[] = [];
  const known = new Map<string, WooCommerceMigrationTaxonomy>();
  for (const rawPath of value.split(",")) {
    if (!rawPath.trim()) continue;
    const levels = rawPath.split(">");
    if (levels.length > 8 || levels.some((level) => level.trim().length === 0)) invalid();
    let parentSlug: string | undefined;
    for (const rawLevel of levels) {
      const name = boundedText(decodeEntities(rawLevel), 1, 120);
      const selected = slug(name);
      const candidate = Object.freeze({ name, slug: selected, ...(parentSlug ? { parentSlug } : {}) });
      const existing = known.get(selected);
      if (existing && (existing.name !== candidate.name || existing.parentSlug !== candidate.parentSlug)) invalid();
      if (!existing) { known.set(selected, candidate); taxonomies.push(candidate); }
      parentSlug = selected;
    }
    if (parentSlug && !leafSlugs.includes(parentSlug)) leafSlugs.push(parentSlug);
  }
  if (leafSlugs.length > 8) invalid();
  return Object.freeze({ taxonomies: Object.freeze(taxonomies), leafSlugs: Object.freeze(leafSlugs) });
}
```

Aggregate `selectedCategories.taxonomies` into the manifest and assign `selectedCategories.leafSlugs` to each product. Do not change brand parsing or image/media behavior.

- [ ] **Step 4: Run parser and real-export compatibility tests**

Run:

```bash
node --experimental-transform-types --test apps/customer-panel/lib/catalog-import/woocommerce-migration.test.ts
node tests/saas-phase3/guzide-catalog-migration/real-export-audit.mjs
```

Expected: WooCommerce `23/23 PASS`; real Güzide audit retains `1,628 products`, `5,423 media`, `50 categories`, `6 brands`, `66 batches`.

- [ ] **Step 5: Commit the independently reviewable compiler change**

```bash
git add apps/customer-panel/lib/catalog-import/woocommerce-migration.ts \
  apps/customer-panel/lib/catalog-import/woocommerce-migration.test.ts
git commit -m "feat(catalog): preserve bulk category paths"
```

---

### Task 3: Repository contract and fail-closed validation

**Files:**
- Modify: `packages/saas-data/src/catalog-migration/types.ts:1-82`
- Modify: `packages/saas-data/src/catalog-migration/index.ts:1-20`
- Modify: `packages/saas-data/src/catalog-migration/validation.ts:80-110`
- Modify: `packages/saas-data/src/catalog-migration/repository.ts:110-123`
- Modify: `packages/saas-data/src/catalog-migration/repository.test.ts:127-177,304-327`

**Interfaces:**
- Consumes: `CatalogMigrationCategory` records in root-to-leaf order.
- Produces:

```ts
export interface CatalogMigrationTaxonomy {
  readonly name: string;
  readonly slug: string;
}

export interface CatalogMigrationCategory extends CatalogMigrationTaxonomy {
  readonly parentSlug?: string;
}

export interface BeginCatalogMigrationInput {
  // existing authority and job fields remain unchanged
  readonly categories: readonly CatalogMigrationCategory[];
  readonly brands: readonly CatalogMigrationTaxonomy[];
}

export function catalogMigrationCategories(value: unknown, maximum: number): readonly CatalogMigrationCategory[];
export function catalogMigrationTaxonomies(value: unknown, maximum: number): readonly CatalogMigrationTaxonomy[];
```

- [ ] **Step 1: Write failing repository tests**

Keep the existing root-only compatibility test unchanged. Add `CHILD_CATEGORY`, then add one new positive test with root and child categories and assert exact persisted JSON:

```ts
const CHILD_CATEGORY = "31000000-0000-4000-8000-00000000000d";

const writer = new Client((text) => text.includes("catalog_migration_begin")
  ? [{ outcome: "begun", result_payload: projection({ categoryCount: 2 }) }]
  : []);
await repository(new Pool([writer]), [], [JOB, CATEGORY, CHILD_CATEGORY, BRAND]).begin({
  tenantContext: tenant(), now: NOW, operationId: OPERATION, sourceDigest: DIGEST,
  totalProducts: 1, totalMedia: 0,
  categories: [
    { name: "Takı", slug: "taki" },
    { name: "Yüzük", slug: "yuzuk", parentSlug: "taki" },
  ],
  brands: [{ name: "Güzide", slug: "guzide" }],
});
const sql = call(writer, "catalog_migration_begin");
assert.deepEqual(JSON.parse(String(sql.values[14])), [
  { id: CATEGORY, name: "Takı", slug: "taki" },
  { id: CHILD_CATEGORY, name: "Yüzük", slug: "yuzuk", parentSlug: "taki" },
]);
```

Add a negative test covering child-before-parent, missing parent, same slug/different parent, ninth level, `parentSlug` on brands, duplicate category slug, and hostile extra keys. Assert `pool.connect()` is never called.

```ts
test("invalid category graphs fail before pool checkout", async () => {
  const invalidCategories = [
    [{ name: "Çocuk", slug: "cocuk", parentSlug: "eksik" }],
    [{ name: "A", slug: "a", parentSlug: "b" }, { name: "B", slug: "b" }],
    Array.from({ length: 9 }, (_, index) => ({ name: `S${index}`, slug: `s${index}`, ...(index ? { parentSlug: `s${index - 1}` } : {}) })),
    [
      { name: "A", slug: "a" }, { name: "B", slug: "b" },
      { name: "X", slug: "x", parentSlug: "a" }, { name: "X", slug: "x", parentSlug: "b" },
    ],
    [{ name: "A", slug: "a", unknown: true }],
  ];
  for (const categories of invalidCategories) {
    const pool = new Pool([]);
    await assert.rejects(() => repository(pool).begin({
      tenantContext: tenant(), now: NOW, operationId: OPERATION, sourceDigest: DIGEST,
      totalProducts: 1, totalMedia: 0, categories: categories as never, brands: [],
    }), (error: unknown) => error instanceof CatalogMigrationRepositoryError && error.code === "invalid_input");
  }
  await assert.rejects(() => repository(new Pool([])).begin({
    tenantContext: tenant(), now: NOW, operationId: OPERATION, sourceDigest: DIGEST,
    totalProducts: 1, totalMedia: 0, categories: [], brands: [{ name: "Marka", slug: "marka", parentSlug: "x" }] as never,
  }));
});
```

- [ ] **Step 2: Run focused tests and observe RED**

Run:

```bash
node --experimental-strip-types --test packages/saas-data/src/catalog-migration/repository.test.ts
```

Expected: FAIL because `CatalogMigrationCategory` and category-specific validation do not exist.

- [ ] **Step 3: Implement exact category validation**

```ts
export function catalogMigrationCategories(value: unknown, maximum: number): readonly CatalogMigrationCategory[] {
  if (!Array.isArray(value) || value.length > maximum) fail();
  const knownDepth = new Map<string, number>();
  const result = value.map((candidate) => {
    const parsed = exactCatalogMigrationInput(candidate, ["name", "slug"], ["parentSlug"]);
    const selectedSlug = slug(parsed.slug);
    const parentSlug = parsed.parentSlug === undefined ? undefined : slug(parsed.parentSlug);
    if (knownDepth.has(selectedSlug) || parentSlug === selectedSlug) fail();
    const depth = parentSlug === undefined ? 1 : (knownDepth.get(parentSlug) ?? 0) + 1;
    if (depth < 1 || depth > 8 || (parentSlug !== undefined && !knownDepth.has(parentSlug))) fail();
    knownDepth.set(selectedSlug, depth);
    return Object.freeze({ name: text(parsed.name, 1, 120), slug: selectedSlug, ...(parentSlug ? { parentSlug } : {}) });
  });
  return Object.freeze(result);
}
```

In `repository.begin`, replace only the category validator call:

```ts
const categories = catalogMigrationCategories(parsed.categories, 100);
const brands = catalogMigrationTaxonomies(parsed.brands, 50);
```

Keep the fingerprint input as `{ sourceDigest, totalProducts, totalMedia, categories, brands }`, so `parentSlug` is automatically authority-bound.

- [ ] **Step 4: Run repository and package tests**

Run:

```bash
node --experimental-strip-types --test packages/saas-data/src/catalog-migration/repository.test.ts
npm test --workspace @celebix/saas-data
npm run typecheck --workspace @celebix/saas-data
```

Expected: repository `11/11 PASS`; workspace `387/387 PASS`; typecheck PASS.

- [ ] **Step 5: Commit the independently reviewable repository contract**

```bash
git add packages/saas-data/src/catalog-migration/types.ts \
  packages/saas-data/src/catalog-migration/index.ts \
  packages/saas-data/src/catalog-migration/validation.ts \
  packages/saas-data/src/catalog-migration/repository.ts \
  packages/saas-data/src/catalog-migration/repository.test.ts
git commit -m "feat(catalog): validate imported category hierarchy"
```

---

### Task 4: PostgreSQL migration 066 hierarchy authority

**Files:**
- Create: `apps/owner/scripts/sql/saas/202607290066_catalog_category_hierarchy.up.sql`
- Create: `apps/owner/scripts/sql/saas/202607290066_catalog_category_hierarchy.down.sql`
- Create: `apps/owner/scripts/sql/saas/202607290066_catalog_category_hierarchy_assertions.sql`
- Create: `apps/owner/scripts/sql/saas/phase3y-catalog-category-hierarchy-manifest.json`
- Create: `tests/saas-phase3/catalog-category-hierarchy/static-security.test.mjs`
- Create: `tests/saas-phase3/catalog-category-hierarchy/postgres-harness.mjs`

**Interfaces:**
- Consumes the unchanged `catalog_migration_begin(..., p_categories jsonb, p_brands jsonb)` SQL signature.
- Produces:

```sql
saas.catalog_migration_category_manifest_valid(p_categories jsonb) RETURNS boolean
saas.catalog_migration_category_manifest_matches(p_store_id uuid, p_categories jsonb) RETURNS boolean
```

- Replaces the body, not the signature, of `saas.catalog_migration_begin(...)`.
- Every SQL artifact starts with `BEGIN; SET LOCAL ROLE celebix_saas_owner;` and ends with `COMMIT;`; helper functions remain owner-only and receive no app-role grant.

- [ ] **Step 1: Write failing static and PostgreSQL harness tests**

The static test must expect migration `066`, exact SHA-256 entries, no table grants, no production/customer hostname, public EXECUTE revoked, and the unchanged begin signature.

The harness must declare `const TOTAL = 23` and run these exact scenarios:

1. manifest checksums are exact;
2. full base chain plus 066 and assertions apply on PostgreSQL 16;
3. helper and begin functions have exact owner/ACL/volatility/security-definer authority;
4. root-child-grandchild categories are created atomically;
5. persisted `parent_id` and `depth` equal the requested tree;
6. product batch assigns only the requested leaf category;
7. legacy root-only manifests still begin;
8. repeated shared ancestors across multiple paths create once;
9. missing parent rejects with no category/job/operation rows;
10. child-before-parent rejects with no durable reach;
11. a ninth level rejects with no durable reach;
12. duplicate slug with different parent rejects;
13. an exact existing active tree is reused;
14. existing category name mismatch returns `import_conflict`;
15. existing category parent mismatch returns `import_conflict`;
16. archived parent cannot satisfy a child;
17. another store's matching slug cannot satisfy the parent;
18. exact operation replay returns the original immutable result;
19. changed `parentSlug` under the same operation ID returns `operation_mismatch`;
20. concurrent equal begin calls leave one job and one exact tree;
21. backup/restore preserves hierarchy, RLS, ACL, functions, jobs, and product assignment;
22. down restores migration-059 root-only behavior and reapply restores 066;
23. cleanup removes the isolated cluster and process.

Run:

```bash
node --test tests/saas-phase3/catalog-category-hierarchy/static-security.test.mjs
node tests/saas-phase3/catalog-category-hierarchy/postgres-harness.mjs
```

Expected: RED because the six new files do not exist.

- [ ] **Step 2: Implement SQL manifest validation helpers**

The validation helper must require exact keys and root-to-leaf order:

```sql
CREATE FUNCTION saas.catalog_migration_category_manifest_valid(p_categories jsonb)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,saas
AS $function$
DECLARE
  candidate jsonb;
  selected_slug text;
  selected_parent text;
  selected_depth integer;
  parent_index integer;
  known_slugs text[]:=ARRAY[]::text[];
  known_depths integer[]:=ARRAY[]::integer[];
BEGIN
  IF p_categories IS NULL OR pg_catalog.jsonb_typeof(p_categories)<>'array'
     OR pg_catalog.jsonb_array_length(p_categories)>100
     OR pg_catalog.pg_column_size(p_categories)>65536 THEN RETURN false; END IF;
  FOR candidate IN SELECT value FROM pg_catalog.jsonb_array_elements(p_categories) LOOP
    IF NOT saas.catalog_migration_json_exact(candidate,ARRAY['id','name','slug'],ARRAY['parentSlug'])
       OR candidate->>'id'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       OR candidate->>'name' IS NULL OR candidate->>'name'<>pg_catalog.btrim(candidate->>'name')
       OR pg_catalog.char_length(candidate->>'name') NOT BETWEEN 1 AND 120 OR candidate->>'name'~'[[:cntrl:]]'
       OR candidate->>'slug'!~'^[a-z0-9]+(-[a-z0-9]+)*$' OR pg_catalog.char_length(candidate->>'slug')>100
       OR (candidate ? 'parentSlug' AND (
         pg_catalog.jsonb_typeof(candidate->'parentSlug')<>'string'
         OR candidate->>'parentSlug'!~'^[a-z0-9]+(-[a-z0-9]+)*$'
         OR pg_catalog.char_length(candidate->>'parentSlug')>100
       )) THEN RETURN false; END IF;
    selected_slug:=candidate->>'slug'; selected_parent:=candidate->>'parentSlug';
    IF pg_catalog.array_position(known_slugs,selected_slug) IS NOT NULL OR selected_parent=selected_slug THEN RETURN false; END IF;
    IF selected_parent IS NULL THEN selected_depth:=1;
    ELSE
      parent_index:=pg_catalog.array_position(known_slugs,selected_parent);
      IF parent_index IS NULL THEN RETURN false; END IF;
      selected_depth:=known_depths[parent_index]+1;
    END IF;
    IF selected_depth>8 THEN RETURN false; END IF;
    known_slugs:=pg_catalog.array_append(known_slugs,selected_slug);
    known_depths:=pg_catalog.array_append(known_depths,selected_depth);
  END LOOP;
  RETURN true;
END
$function$;
```

Preserve the migration-059 name length, trimming, control-character, slug length, JSON byte, and brand exact-key checks in the begin function; the helper supplements rather than weakens them.

Implement the store comparison helper as a read-only exact topology check:

```sql
CREATE FUNCTION saas.catalog_migration_category_manifest_matches(p_store_id uuid,p_categories jsonb)
RETURNS boolean
LANGUAGE plpgsql STABLE
SET search_path=pg_catalog,saas
AS $function$
DECLARE
  candidate jsonb;
  persisted_name text;
  persisted_status text;
  persisted_parent_slug text;
BEGIN
  IF NOT saas.catalog_migration_category_manifest_valid(p_categories) THEN RETURN false; END IF;
  FOR candidate IN SELECT value FROM pg_catalog.jsonb_array_elements(p_categories) LOOP
    SELECT category.name,category.status,parent.slug
    INTO persisted_name,persisted_status,persisted_parent_slug
    FROM saas.catalog_categories category
    LEFT JOIN saas.catalog_categories parent
      ON parent.store_id=category.store_id AND parent.id=category.parent_id
    WHERE category.store_id=p_store_id AND category.slug=candidate->>'slug';
    IF NOT FOUND OR persisted_status<>'active'
       OR persisted_name<>candidate->>'name'
       OR persisted_parent_slug IS DISTINCT FROM candidate->>'parentSlug' THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END
$function$;
```

- [ ] **Step 3: Replace `catalog_migration_begin` atomically**

Resolve the requested parent inside the existing transaction and enforce exact existing topology:

```sql
DECLARE
  candidate jsonb;
  candidate_ordinality bigint;
  requested_parent_id uuid;
  existing_category saas.catalog_categories%ROWTYPE;
  -- Retain every migration-059 declaration as well.
BEGIN
FOR candidate,candidate_ordinality IN
  SELECT value,ordinality FROM pg_catalog.jsonb_array_elements(p_categories) WITH ORDINALITY
LOOP
requested_parent_id:=NULL;
IF candidate ? 'parentSlug' THEN
  SELECT category.id INTO requested_parent_id
  FROM saas.catalog_categories category
  WHERE category.store_id=p_store_id
    AND category.slug=candidate->>'parentSlug'
    AND category.status='active';
  IF requested_parent_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='foreign_key_violation'; END IF;
END IF;

SELECT category.* INTO existing_category
FROM saas.catalog_categories category
WHERE category.store_id=p_store_id AND category.slug=candidate->>'slug'
FOR UPDATE;

IF FOUND THEN
  IF existing_category.status<>'active'
     OR existing_category.name<>candidate->>'name'
     OR existing_category.parent_id IS DISTINCT FROM requested_parent_id
  THEN RAISE EXCEPTION USING ERRCODE='unique_violation'; END IF;
ELSE
  INSERT INTO saas.catalog_categories(
    id,store_id,parent_id,name,slug,position,status,version,created_at,updated_at
  ) VALUES (
    (candidate->>'id')::uuid,p_store_id,requested_parent_id,candidate->>'name',candidate->>'slug',
    candidate_ordinality-1,'active',1,p_now,p_now
  );
END IF;
END LOOP;
```

In the existing-job branch, call `catalog_migration_category_manifest_matches(p_store_id,p_categories)` so equal slugs with changed parents cannot reuse a prior job. Retain advisory locks, product-limit lock, operation replay, all brand behavior, finite outcomes, and function-only app authority.

- [ ] **Step 4: Implement exact rollback and assertions**

The down file must:

1. `CREATE OR REPLACE` the exact migration-059 `catalog_migration_begin` body;
2. revoke/grant the same begin function privileges;
3. drop only the two new helper functions;
4. leave category, job, product, and media rows untouched.

The assertion file must inspect `pg_get_functiondef`, `prosecdef`, `provolatile`, owner, public/app privileges, and ensure both `parentSlug` and exact parent comparison are present in the new begin body.

- [ ] **Step 5: Generate the checksum manifest from real files**

Use shell digest output, then write the JSON with those exact values:

```bash
shasum -a 256 \
  apps/owner/scripts/sql/saas/202607290066_catalog_category_hierarchy.up.sql \
  apps/owner/scripts/sql/saas/202607290066_catalog_category_hierarchy.down.sql \
  apps/owner/scripts/sql/saas/202607290066_catalog_category_hierarchy_assertions.sql
```

Manifest fixed fields:

```json
{
  "phase": "phase3y-catalog-category-hierarchy",
  "postgresqlMajor": 16,
  "classification": "additive-tenant-catalog-category-hierarchy-authority",
  "externalConnections": 0,
  "productionMutations": 0,
  "artifacts": []
}
```

Populate `artifacts` in `up`, `down`, `verify` order from the command output; do not fabricate hashes.

- [ ] **Step 6: Run new and historical PostgreSQL gates**

Run:

```bash
node --test tests/saas-phase3/catalog-category-hierarchy/static-security.test.mjs
node tests/saas-phase3/catalog-category-hierarchy/postgres-harness.mjs
node tests/saas-phase3/guzide-catalog-migration/postgres-harness.mjs
node tests/saas-phase3/catalog-product-onboarding/postgres-harness.mjs
```

Expected: static `3/3 PASS`; new PostgreSQL `23/23 PASS`; migration regression `31/31 PASS`; onboarding regression `26/26 PASS`; every disposable cluster reports cleanup PASS.

- [ ] **Step 7: Commit the independently reviewable durable authority**

```bash
git add apps/owner/scripts/sql/saas/202607290066_catalog_category_hierarchy.up.sql \
  apps/owner/scripts/sql/saas/202607290066_catalog_category_hierarchy.down.sql \
  apps/owner/scripts/sql/saas/202607290066_catalog_category_hierarchy_assertions.sql \
  apps/owner/scripts/sql/saas/phase3y-catalog-category-hierarchy-manifest.json \
  tests/saas-phase3/catalog-category-hierarchy/static-security.test.mjs \
  tests/saas-phase3/catalog-category-hierarchy/postgres-harness.mjs
git commit -m "feat(catalog): persist imported category hierarchy"
```

---

### Task 5: Whole-branch verification, push, and isolated staging gate

**Files:**
- No source file is expected to change.
- If a test reveals a defect, repair it only in the owning task's listed files, rerun that task's RED/GREEN cycle, and create a non-amended corrective commit.

**Interfaces:**
- Consumes: all four task commits and exact branch history.
- Produces: local regression evidence, remote SHA parity, and—after source verification—isolated staging evidence only.

- [ ] **Step 1: Run the complete local matrix**

```bash
npm ci
node --experimental-transform-types --test apps/customer-panel/lib/catalog-onboarding-ui/category-tree.test.ts
node --experimental-transform-types --test apps/customer-panel/lib/catalog-import/woocommerce-migration.test.ts
node --experimental-strip-types --test packages/saas-data/src/catalog-migration/repository.test.ts
node --test tests/saas-phase3/catalog-product-onboarding/static-ui.test.mjs
node --test tests/saas-phase3/catalog-category-hierarchy/static-security.test.mjs
node tests/saas-phase3/catalog-category-hierarchy/postgres-harness.mjs
node tests/saas-phase3/guzide-catalog-migration/postgres-harness.mjs
node tests/saas-phase3/catalog-product-onboarding/postgres-harness.mjs
npm test --workspace @celebix/customer-panel
npm test --workspace @celebix/saas-data
npm test --workspace @celebix/owner
npm run typecheck --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/saas-data
npm run typecheck --workspace @celebix/owner
npm run build --workspace @celebix/customer-panel
npm run build --workspace @celebix/owner
git diff --check
```

Expected focused totals: tree `5/5`, WooCommerce `23/23`, repository `11/11`, static UI `7/7`, static hierarchy `3/3`, PostgreSQL `23/23`, `31/31`, and `26/26`. Baseline regressions remain at least customer-panel command PASS, saas-data `387/387`, Owner `421/421`, with typecheck/build PASS.

- [ ] **Step 2: Run scope, secret, authority, and donor scans**

```bash
git diff --name-only 7825df3cfd6ec4612e53ef3c57962cd1f74c41b4...HEAD
git diff --name-only 7825df3cfd6ec4612e53ef3c57962cd1f74c41b4...HEAD -- apps/admin
git diff 7825df3cfd6ec4612e53ef3c57962cd1f74c41b4...HEAD -- . \
  | rg -n '(BEGIN (RSA|OPENSSH|EC) PRIVATE KEY|DATABASE_URL=|AWS_SECRET_ACCESS_KEY=|R2_SECRET|password\s*[:=]|x-store-id|x-tenant-id|localStorage|sessionStorage)'
git status --short
```

Expected: only plan-authorized files plus the approved spec/plan; `apps/admin/**` output empty; secret/browser-authority scan empty; worktree clean.

- [ ] **Step 3: Push without rewriting history and prove remote parity**

```bash
git push origin codex/guzide-staging-integration
git rev-parse HEAD
git ls-remote --heads origin refs/heads/codex/guzide-staging-integration
git log --oneline --decorate -8
```

Expected: local HEAD equals the remote branch SHA; no force-push, squash, amend, or merge commit.

- [ ] **Step 4: Apply only migration 066 to isolated staging and deploy only customer-panel**

Before mutation, verify the target is the existing isolated staging database and customer-panel service, back up the database, verify PostgreSQL major `16`, and apply the exact pushed SHA's `up` plus assertions files. Redeploy only customer-panel from that same SHA. Do not deploy Owner or storefront because their runtime source is unchanged.

Expected: migration assertions PASS, customer-panel health `200`, Owner/storefront deploy count `0`, production mutation count `0`.

- [ ] **Step 5: Run authenticated staging acceptance without changing existing Güzide records**

Use the genuine staging session and a disposable hierarchy fixture created through the UI/API, not direct inserts:

1. create `Test Takı` as a root;
2. create `Test Yüzük` with `Test Takı` as parent;
3. verify category list shows `Test Takı › Test Yüzük`;
4. verify quick and advanced product forms show the same full label;
5. preview/import one disposable WooCommerce row with `Test Takı > Test Yüzük > Test Altın`;
6. verify PostgreSQL through the authorized read-only admin path shows exact parent IDs/depths and one leaf product assignment;
7. verify another tenant cannot see or select the fixture;
8. archive the disposable product first and then archive disposable categories leaf-to-root through supported application flows; if a required archive flow is unavailable, leave the clearly named staging fixture and report it instead of issuing a direct database delete;
9. scan browser network, console, runtime logs, DOM, and RSC for store IDs, tenant IDs, secrets, SQL, raw credentials, and production hosts.

Expected: manual and bulk hierarchies work end-to-end; existing Güzide category/product counts remain unchanged except explicitly disposable fixture rows; production effects all `0`.

- [ ] **Step 6: Report completion truthfully**

The final report must include:

- final branch/SHA and commit map;
- exact changed files;
- focused RED/GREEN totals;
- PostgreSQL version and `23/23`, `31/31`, `26/26` results;
- workspace tests/typechecks/builds;
- staging migration/deploy SHA and health;
- manual and bulk hierarchy acceptance evidence;
- `apps/admin/**` diff count `0`;
- tenant isolation, secret, forbidden authority, and production impact scans;
- disposable cleanup status;
- remote parity and clean worktree.

Report PASS only if every local and isolated staging gate above succeeds. Otherwise report the exact failing gate and do not claim completion.
