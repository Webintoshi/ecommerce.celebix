# İKAS-Quality Product Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a truthful sixty-second product creation path plus a complete simple/variant editor backed by tenant-isolated PostgreSQL authority, without breaking the current catalog, media, inventory, import, or storefront flows.

**Architecture:** Add an additive `catalog-onboarding` contract/repository boundary and migration `056`. Quick and advanced intents converge on one PostgreSQL function; media remains a separately proven R2 operation followed by an optimistic publication completion. Customer-panel HTTP handlers derive all authority from the durable panel session and expose only bounded options/projections.

**Tech Stack:** TypeScript, React 19, Next.js App Router, Node test runner, PostgreSQL 16, `pg`, existing R2 media runtime, CSS modules/global panel tokens.

## Global Constraints

- Implementation base is `6fadaa05ad6e7422bda463ccb7c785f8326ee24b`; the approved spec is commit `85dc434e6b7bd3866d45bbb32ab3529255b2c6b7`.
- `apps/admin/**` remains byte-for-byte unchanged.
- Tenant/store authority is only `__Host-celebix_panel` -> durable PostgreSQL session -> revalidated `TenantContext`.
- Browser tenant, store, principal, membership, plan, subscription, database, channel, or provider authority is rejected.
- Existing catalog contracts and routes remain backward-compatible.
- No field or option is rendered unless the server returns a persisted, active authority projection.
- Quick create requires only `title` and `priceCents`; stock defaults to `0`, currency to `TRY`, type to `physical`, and variant title to `Standart`.
- Product creation is atomic except R2 media; media failure leaves an honest durable draft.
- No HEIC/video, AI copy generation, recurring feed scheduling, production deploy, production credential mutation, or merge in this delivery.
- Every production behavior starts with a focused failing test and observed expected failure.
- No dependency changes are authorized or required.

---

### Task 1: Immutable onboarding contracts

**Files:**
- Create: `packages/saas-contracts/src/catalog-onboarding/types.ts`
- Create: `packages/saas-contracts/src/catalog-onboarding/validation.ts`
- Create: `packages/saas-contracts/src/catalog-onboarding/index.ts`
- Create: `packages/saas-contracts/src/catalog-onboarding/catalog-onboarding.test.ts`
- Modify: `packages/saas-contracts/src/index.ts:53-66`

**Interfaces:**
- Produces `CatalogQuickCreateIntent`, `CatalogAdvancedCreateIntent`, `CatalogOnboardingIntent`, `CatalogOnboardingOptions`, `CatalogProductEditorProjection`, `CatalogOnboardingResult`.
- Produces `parseCatalogOnboardingIntent`, `parseCatalogOnboardingOptions`, `parseCatalogProductEditorProjection`, `parseCatalogOnboardingResult`.
- All returned objects and nested arrays are frozen exact-key projections.

- [ ] **Step 1: Write failing exact-shape and bounds tests**

```ts
test("quick intent requires only title and price and applies no browser authority", () => {
  assert.deepEqual(parseCatalogOnboardingIntent({
    kind: "quick", title: "Kupa", priceCents: 12990, publish: true,
  }), Object.freeze({ kind: "quick", title: "Kupa", priceCents: 12990, publish: true }));
  assert.throws(() => parseCatalogOnboardingIntent({
    kind: "quick", title: "Kupa", priceCents: 12990, publish: true, storeId: STORE_ID,
  }), /catalog_onboarding_contract_invalid/);
});

test("advanced intent preserves bounded variants and assignments", () => {
  const parsed = parseCatalogOnboardingIntent(advancedIntent());
  assert.equal(parsed.kind, "advanced");
  assert.equal(parsed.variants.length, 2);
  assert.ok(Object.isFrozen(parsed.variants));
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test --workspace @celebix/saas-contracts -- --test-name-pattern='quick intent|advanced intent'`

Expected: FAIL because `catalog-onboarding/index.ts` and parsers do not exist.

- [ ] **Step 3: Add minimal closed types and parsers**

```ts
export type CatalogQuickCreateIntent = Readonly<{
  kind: "quick";
  title: string;
  priceCents: number;
  publish: boolean;
  stockQuantity?: number;
  categoryId?: string;
}>;

export type CatalogAdvancedCreateIntent = Readonly<{
  kind: "advanced";
  productType: "physical" | "digital";
  title: string;
  description?: string;
  publish: boolean;
  variants: readonly CatalogOnboardingVariantIntent[];
  categoryIds: readonly string[];
  resourceIds: Readonly<{ brand?: string; collections: readonly string[]; tags: readonly string[]; attributes: readonly string[]; extras: readonly string[]; definitions: readonly string[] }>;
  channelIds: readonly string[];
  profile: CatalogProductMerchandisingFields;
}>;

export function parseCatalogOnboardingIntent(value: unknown): CatalogOnboardingIntent {
  const parsed = exactRecord(value);
  return parsed.kind === "quick" ? parseQuick(parsed) : parsed.kind === "advanced" ? parseAdvanced(parsed) : invalid();
}
```

Implement exact UUID, text, money, quantity, SEO, unit-price, desi, HS, array-count, duplicate, and cross-field checks described in the spec. Reject prototypes, unknown keys, control characters, non-safe integers, digital shipping fields, and more than 100 variants/8 categories/50 tags.

- [ ] **Step 4: Verify GREEN and public exports**

Run: `npm test --workspace @celebix/saas-contracts && npm run typecheck --workspace @celebix/saas-contracts`

Expected: all existing and new contract tests PASS; typecheck PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/saas-contracts
git commit -m "feat(catalog): define product onboarding contracts"
```

### Task 2: Additive PostgreSQL onboarding schema

**Files:**
- Create: `apps/owner/scripts/sql/saas/202607280056_catalog_product_onboarding.up.sql`
- Create: `apps/owner/scripts/sql/saas/202607280056_catalog_product_onboarding.down.sql`
- Create: `apps/owner/scripts/sql/saas/202607280056_catalog_product_onboarding_assertions.sql`
- Create: `apps/owner/scripts/sql/saas/phase3-product-onboarding-manifest.json`
- Create: `tests/saas-phase3/catalog-product-onboarding/static-security.test.mjs`

**Interfaces:**
- Produces store-scoped tables `catalog_product_profiles`, `catalog_categories`, `catalog_product_categories`, `catalog_variant_commerce_profiles`, `catalog_product_channels`, `catalog_onboarding_operations`.
- Does not grant table writes to `celebix_saas_app`; later tasks expose only narrow security-definer functions.

- [ ] **Step 1: Write failing static migration assertions**

```js
test("migration 056 owns and protects every onboarding table", () => {
  for (const table of TABLES) {
    assert.match(up, new RegExp(`CREATE TABLE saas\\.${table}`));
    assert.match(up, new RegExp(`ALTER TABLE saas\\.${table} ENABLE ROW LEVEL SECURITY`));
    assert.match(up, new RegExp(`ALTER TABLE saas\\.${table} FORCE ROW LEVEL SECURITY`));
    assert.match(up, new RegExp(`REVOKE ALL ON saas\\.${table} FROM celebix_saas_app`));
  }
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test tests/saas-phase3/catalog-product-onboarding/static-security.test.mjs`

Expected: FAIL because migration `056` is absent.

- [ ] **Step 3: Add schema with composite store authority**

```sql
CREATE TABLE saas.catalog_product_profiles (
  product_id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  product_type text NOT NULL CHECK (product_type IN ('physical','digital')),
  supplier_name text,
  google_product_category_id text,
  seo_title text,
  seo_description text,
  minimum_purchase_quantity bigint NOT NULL DEFAULT 1 CHECK (minimum_purchase_quantity >= 1),
  maximum_purchase_quantity bigint,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (store_id, product_id),
  FOREIGN KEY (store_id, product_id) REFERENCES saas.products(store_id, id) ON DELETE RESTRICT,
  CHECK (maximum_purchase_quantity IS NULL OR maximum_purchase_quantity >= minimum_purchase_quantity)
);
```

Add equivalent bounded/composite constraints for the five remaining tables, category depth/cycle protection, immutable operation trigger, tenant policies, owner ownership, `PUBLIC` revokes, and zero direct app-role DML.

- [ ] **Step 4: Add exact rollback, assertions, and checksums**

The down migration drops only migration-056 functions/triggers/policies/tables in dependency order. Assertions verify ownership, RLS, ACLs, composite FKs, checks, immutable operations, function search paths, and grants. Generate manifest hashes with `shasum -a 256`; do not hand-invent hashes.

- [ ] **Step 5: Verify GREEN**

Run: `node --test tests/saas-phase3/catalog-product-onboarding/static-security.test.mjs && git diff --check`

Expected: static security PASS and clean diff.

- [ ] **Step 6: Commit**

```bash
git add apps/owner/scripts/sql/saas/202607280056_* apps/owner/scripts/sql/saas/phase3-product-onboarding-manifest.json tests/saas-phase3/catalog-product-onboarding/static-security.test.mjs
git commit -m "feat(catalog): add product onboarding schema"
```

### Task 3: Atomic SQL functions and disposable PostgreSQL 16 proof

**Files:**
- Modify: `apps/owner/scripts/sql/saas/202607280056_catalog_product_onboarding.up.sql`
- Modify: `apps/owner/scripts/sql/saas/202607280056_catalog_product_onboarding.down.sql`
- Modify: `apps/owner/scripts/sql/saas/202607280056_catalog_product_onboarding_assertions.sql`
- Modify: `apps/owner/scripts/sql/saas/phase3-product-onboarding-manifest.json`
- Create: `tests/saas-phase3/catalog-product-onboarding/postgres-harness.mjs`

**Interfaces:**
- Produces `saas.catalog_get_onboarding_options(...)`, `saas.catalog_onboard_product(...)`, `saas.catalog_get_product_editor(...)`, `saas.catalog_update_merchandising(...)`, `saas.catalog_publish_after_media(...)`, `saas.catalog_recover_onboarding_operation(...)`.
- Every function returns exactly `(outcome text, result_payload jsonb)` and is executable only by `celebix_saas_app`.

- [ ] **Step 1: Write the failing PostgreSQL scenarios**

```js
await scenario("quick create allocates a unique slug and server defaults", async () => {
  const result = queryJson(`SELECT * FROM saas.catalog_onboard_product(..., '${quickIntent}'::jsonb)`);
  assert.equal(result.outcome, "created");
  assert.equal(result.result_payload.product.slug, "seramik-kupa");
  assert.equal(result.result_payload.variants[0].title, "Standart");
});

await scenario("concurrent equal titles allocate distinct canonical slugs", async () => {
  const [left, right] = await Promise.all([onboard("Kupa"), onboard("Kupa")]);
  assert.deepEqual(new Set([left.slug, right.slug]), new Set(["kupa", "kupa-2"]));
});
```

Cover migration apply/assertions, quick defaults, advanced variants, categories/resources/channels/locations, replay/mismatch, cross-store denial, inactive references, one-brand/limits, SKU collision, product limit, roles/features/subscription, version conflict, immutable proof, backup/restore, rollback/reapply, and cleanup.

- [ ] **Step 2: Verify RED**

Run: `node tests/saas-phase3/catalog-product-onboarding/postgres-harness.mjs`

Expected: FAIL at the first missing `catalog_get_onboarding_options`/`catalog_onboard_product` function.

- [ ] **Step 3: Implement server-owned canonicalization and atomic mutation**

```sql
CREATE FUNCTION saas.catalog_onboard_product(
  authority_store_id uuid,
  authority_principal_id uuid,
  authority_membership_id uuid,
  authority_plan_id uuid,
  authority_plan_code text,
  authority_plan_version bigint,
  authority_products_limit bigint,
  authority_now timestamptz,
  requested_operation_id uuid,
  requested_fingerprint text,
  requested_product_id uuid,
  requested_variant_ids uuid[],
  requested_intent jsonb
) RETURNS TABLE(outcome text, result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $function$
BEGIN
  -- validate durable authority and lock store/membership/subscription;
  -- recover or reject operation reuse;
  -- allocate slug under advisory/store lock;
  -- validate all referenced store-scoped rows;
  -- insert product, variants, profile, assignments, balances and immutable proof;
  RETURN QUERY SELECT 'created', canonical_projection;
END
$function$;
```

The real function must contain explicit fail-closed branches and must never interpolate dynamic SQL. `publish_after_media` re-reads product/media and only activates the expected draft version.

- [ ] **Step 4: Verify GREEN and lifecycle rehearsal**

Run: `node tests/saas-phase3/catalog-product-onboarding/postgres-harness.mjs`

Expected: every named scenario PASS, PostgreSQL reports major 16, backup/restore PASS, rollback/reapply PASS, cleanup confirms no disposable process/container/data directory remains.

- [ ] **Step 5: Refresh manifest hashes and commit**

```bash
git add apps/owner/scripts/sql/saas/202607280056_* apps/owner/scripts/sql/saas/phase3-product-onboarding-manifest.json tests/saas-phase3/catalog-product-onboarding/postgres-harness.mjs
git commit -m "feat(catalog): prove atomic product onboarding"
```

### Task 4: PostgreSQL repository adapter

**Files:**
- Create: `packages/saas-data/src/catalog-onboarding/types.ts`
- Create: `packages/saas-data/src/catalog-onboarding/validation.ts`
- Create: `packages/saas-data/src/catalog-onboarding/canonical.ts`
- Create: `packages/saas-data/src/catalog-onboarding/errors.ts`
- Create: `packages/saas-data/src/catalog-onboarding/repository.ts`
- Create: `packages/saas-data/src/catalog-onboarding/repository.test.ts`
- Create: `packages/saas-data/src/catalog-onboarding/index.ts`
- Modify: `packages/saas-data/src/index.ts:13-39`

**Interfaces:**
- Produces `CatalogOnboardingRepository` with `getOptions`, `createProduct`, `getProductEditor`, `updateMerchandising`, and `publishAfterMedia`.
- Produces `PostgresCatalogOnboardingRepository` using existing pool/timeout/unknown-commit conventions.

- [ ] **Step 1: Write failing repository protocol tests**

```ts
test("createProduct validates, fingerprints, and sends one SQL mutation", async () => {
  const result = await repository.createProduct({ tenantContext, now, operationId, intent: quickIntent });
  assert.equal(calls.filter(({ text }) => text.includes("catalog_onboard_product")).length, 1);
  assert.equal(result.product.slug, "kupa");
});

test("unknown COMMIT performs exactly one read-only recovery", async () => {
  await repository.createProduct(input);
  assert.deepEqual(transactionStarts, ["BEGIN ISOLATION LEVEL READ COMMITTED", "BEGIN READ ONLY"]);
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test --workspace @celebix/saas-data -- --test-name-pattern='createProduct validates|unknown COMMIT'`

Expected: FAIL because `PostgresCatalogOnboardingRepository` is absent.

- [ ] **Step 3: Implement the narrow adapter**

```ts
export interface CatalogOnboardingRepository {
  getOptions(input: CatalogOnboardingAuthorityInput): Promise<CatalogOnboardingOptions>;
  createProduct(input: CreateCatalogOnboardingProductInput): Promise<CatalogOnboardingResult>;
  getProductEditor(input: GetCatalogProductEditorInput): Promise<CatalogProductEditorProjection>;
  updateMerchandising(input: UpdateCatalogMerchandisingInput): Promise<CatalogOnboardingResult>;
  publishAfterMedia(input: PublishCatalogAfterMediaInput): Promise<CatalogOnboardingResult>;
}
```

Reuse the catalog transaction discipline: local terminal states, destroy client after unknown COMMIT, one read-only recovery, fixed safe errors, exact result parsing, and generated IDs before the SQL call. Never retry writes.

- [ ] **Step 4: Verify GREEN**

Run: `npm test --workspace @celebix/saas-data && npm run typecheck --workspace @celebix/saas-data`

Expected: full saas-data tests and typecheck PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/saas-data
git commit -m "feat(catalog): add product onboarding repository"
```

### Task 5: Session-owned runtime and HTTP API

**Files:**
- Create: `apps/customer-panel/lib/server-catalog-onboarding/runtime.ts`
- Create: `apps/customer-panel/lib/server-catalog-onboarding/default.ts`
- Create: `apps/customer-panel/lib/server-catalog-onboarding/runtime.test.ts`
- Create: `apps/customer-panel/lib/catalog-onboarding-http/request-authority.ts`
- Create: `apps/customer-panel/lib/catalog-onboarding-http/request-input.ts`
- Create: `apps/customer-panel/lib/catalog-onboarding-http/handler.ts`
- Create: `apps/customer-panel/lib/catalog-onboarding-http/default.ts`
- Create: `apps/customer-panel/lib/catalog-onboarding-http/handler.test.ts`
- Create: `apps/customer-panel/app/api/catalog/onboarding/options/route.ts`
- Create: `apps/customer-panel/app/api/catalog/onboarding/products/route.ts`
- Create: `apps/customer-panel/app/api/catalog/products/[productId]/merchandising/route.ts`
- Create: `apps/customer-panel/app/api/catalog/products/[productId]/publish-after-media/route.ts`

**Interfaces:**
- GET options and editor projections are `no-store`.
- POST create, PATCH merchandising, and POST publish require exact Origin and idempotency UUID.
- All repository calls receive the server-resolved `TenantContext`; none accept browser authority.

- [ ] **Step 1: Write failing authority and routing tests**

```ts
test("quick create forwards only session TenantContext and parsed intent", async () => {
  const response = await handlers.createProduct(request(QUICK_BODY));
  assert.equal(response.status, 201);
  assert.deepEqual(calls[0], { tenantContext, now, operationId, intent: parseCatalogOnboardingIntent(QUICK_BODY) });
});

test("private authority headers are rejected before repository access", async () => {
  const response = await handlers.createProduct(request(QUICK_BODY, { "x-store-id": STORE_ID }));
  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --experimental-transform-types --test apps/customer-panel/lib/server-catalog-onboarding/*.test.ts apps/customer-panel/lib/catalog-onboarding-http/*.test.ts`

Expected: FAIL because runtime/handler modules are absent.

- [ ] **Step 3: Implement minimal runtime facade and handlers**

```ts
export type ServerCatalogOnboardingRuntime = Readonly<{
  access: ApprovedPanelAccessRuntime;
  onboarding: CatalogOnboardingRepository;
}>;

return repository.createProduct({
  tenantContext: authorized.tenantContext,
  now: authorized.now,
  operationId: input.operationId,
  intent: input.intent,
});
```

Use the existing exact method/path/query/protocol validator pattern, bounded fatal UTF-8 JSON reader, private-header denial, persistent-session reader, stable code/status map, and exact route exports.

- [ ] **Step 4: Verify GREEN**

Run: `node --experimental-transform-types --test apps/customer-panel/lib/server-catalog-onboarding/*.test.ts apps/customer-panel/lib/catalog-onboarding-http/*.test.ts && npm run typecheck --workspace @celebix/customer-panel`

Expected: focused tests and typecheck PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/customer-panel/lib/server-catalog-onboarding apps/customer-panel/lib/catalog-onboarding-http apps/customer-panel/app/api/catalog
git commit -m "feat(customer-panel): expose product onboarding api"
```

### Task 6: Browser forms and API client

**Files:**
- Create: `apps/customer-panel/lib/catalog-onboarding-ui/forms.ts`
- Create: `apps/customer-panel/lib/catalog-onboarding-ui/forms.test.ts`
- Create: `apps/customer-panel/lib/catalog-onboarding-ui/client.ts`
- Create: `apps/customer-panel/lib/catalog-onboarding-ui/client.test.ts`

**Interfaces:**
- Produces `buildQuickCreateIntent`, `buildAdvancedCreateIntent`, `createCatalogOnboardingClient`.
- Client creates one operation UUID per user action and never creates a second write after an unknown result.

- [ ] **Step 1: Write failing Turkish quick-form tests**

```ts
test("quick form needs only name and Turkish sale price", () => {
  assert.deepEqual(buildQuickCreateIntent({ title: "Kupa", price: "129,90", publish: true }), {
    ok: true,
    value: { kind: "quick", title: "Kupa", priceCents: 12990, publish: true },
  });
});

test("client uses one idempotency key and same-origin credentials", async () => {
  await client.createProduct(quickIntent);
  assert.equal(calls[0].init.headers["idempotency-key"], OPERATION_ID);
  assert.equal(calls[0].init.credentials, "same-origin");
});
```

- [ ] **Step 2: Verify RED**

Run: `node --experimental-transform-types --test apps/customer-panel/lib/catalog-onboarding-ui/*.test.ts`

Expected: FAIL because form builder/client do not exist.

- [ ] **Step 3: Implement minimal builders and strict response parsing**

```ts
export function buildQuickCreateIntent(input: QuickCreateFormInput): CatalogFormResult<CatalogQuickCreateIntent> {
  const title = boundedText(input.title, 1, 200);
  const priceCents = parseTurkishMoneyToCents(input.price);
  if (title === null) return invalid("Ürün adı zorunludur.");
  return valid(Object.freeze({ kind: "quick", title, priceCents, publish: input.publish, ...optionalStockAndCategory(input) }));
}
```

Reject unknown keys, malformed money, unsafe quantities, duplicate assignments, and hostile response projections.

- [ ] **Step 4: Verify GREEN and commit**

Run: `node --experimental-transform-types --test apps/customer-panel/lib/catalog-onboarding-ui/*.test.ts`

```bash
git add apps/customer-panel/lib/catalog-onboarding-ui
git commit -m "feat(customer-panel): add product onboarding client"
```

### Task 7: Sixty-second quick-create dialog

**Files:**
- Create: `apps/customer-panel/components/catalog-onboarding/ProductQuickCreateDialog.tsx`
- Create: `apps/customer-panel/components/catalog-onboarding/product-onboarding.module.css`
- Create: `apps/customer-panel/lib/product-onboarding-console.test.ts`
- Modify: `apps/customer-panel/components/catalog/ProductListConsole.tsx:179-520`
- Modify: `apps/customer-panel/components/catalog/ProductCreateForm.tsx:1-142`
- Modify: `apps/customer-panel/app/products/new/page.tsx:1-80`

**Interfaces:**
- `ProductQuickCreateDialog` accepts `open`, `options`, `onClose`, `onCreated`, and optional injected API/media clients for deterministic tests.
- `/products/new` renders the same form surface in page mode.

- [ ] **Step 1: Write failing source/behavior tests**

```ts
test("quick create exposes only two required merchant fields", () => {
  assert.match(source, /name="title"[^>]*required/);
  assert.match(source, /name="price"[^>]*required/);
  assert.doesNotMatch(source, /name="slug"[^>]*required|name="sku"[^>]*required/);
});

test("launcher opens a dialog instead of navigating away", () => {
  assert.match(listSource, /setQuickCreateOpen\(true\)/);
  assert.match(dialogSource, /role="dialog"|<dialog/);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --experimental-transform-types --test apps/customer-panel/lib/product-onboarding-console.test.ts`

Expected: FAIL because the current page requires slug and renders a long form.

- [ ] **Step 3: Implement quick surface and honest media recovery**

```tsx
<input name="title" required maxLength={200} autoFocus />
<input name="price" required inputMode="decimal" />
<input name="stockQuantity" defaultValue="0" inputMode="numeric" />
<select name="categoryId"><option value="">Kategori seçilmedi</option>{options.categories.map(...)}</select>
<button type="submit" name="intent" value="draft">Taslak kaydet</button>
<button type="submit" name="intent" value="publish">Kaydet ve satışa aç</button>
<button type="button" onClick={onAdvanced}>Gelişmiş ürün eklemeye geç</button>
```

Use focus containment, Escape/backdrop/close, focus return, synchronous duplicate-submit lock, before-close confirmation while active, mobile bottom sheet at `<=1024px`, and 48px targets. On media failure show `Ürün oluşturuldu, görsel yüklenemedi` with retry and product links; never report publication.

- [ ] **Step 4: Verify GREEN, accessibility, and responsive source gates**

Run: `node --experimental-transform-types --test apps/customer-panel/lib/product-onboarding-console.test.ts apps/customer-panel/lib/product-console.test.ts && npm run typecheck --workspace @celebix/customer-panel`

Expected: onboarding and existing product-console tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/customer-panel/components/catalog-onboarding apps/customer-panel/components/catalog/ProductListConsole.tsx apps/customer-panel/components/catalog/ProductCreateForm.tsx apps/customer-panel/app/products/new/page.tsx apps/customer-panel/lib/product-onboarding-console.test.ts
git commit -m "feat(customer-panel): add sixty-second product create"
```

### Task 8: Advanced simple/variant editor and categories

**Files:**
- Modify: `packages/saas-contracts/src/catalog-onboarding/types.ts`
- Modify: `packages/saas-contracts/src/catalog-onboarding/validation.ts`
- Modify: `packages/saas-contracts/src/catalog-onboarding/catalog-onboarding.test.ts`
- Modify: `packages/saas-data/src/catalog-onboarding/types.ts`
- Modify: `packages/saas-data/src/catalog-onboarding/repository.ts`
- Modify: `packages/saas-data/src/catalog-onboarding/repository.test.ts`
- Modify: `apps/owner/scripts/sql/saas/202607280056_catalog_product_onboarding.up.sql`
- Modify: `apps/owner/scripts/sql/saas/202607280056_catalog_product_onboarding.down.sql`
- Modify: `apps/owner/scripts/sql/saas/202607280056_catalog_product_onboarding_assertions.sql`
- Modify: `apps/owner/scripts/sql/saas/phase3-product-onboarding-manifest.json`
- Modify: `tests/saas-phase3/catalog-product-onboarding/postgres-harness.mjs`
- Modify: `apps/customer-panel/lib/server-catalog-onboarding/runtime.ts`
- Modify: `apps/customer-panel/lib/catalog-onboarding-http/request-input.ts`
- Modify: `apps/customer-panel/lib/catalog-onboarding-http/handler.ts`
- Modify: `apps/customer-panel/lib/catalog-onboarding-http/default.ts`
- Modify: `apps/customer-panel/lib/catalog-onboarding-http/handler.test.ts`
- Create: `apps/customer-panel/app/api/catalog/onboarding/categories/route.ts`
- Create: `apps/customer-panel/app/api/catalog/onboarding/categories/[categoryId]/route.ts`
- Create: `apps/customer-panel/app/api/catalog/onboarding/categories/[categoryId]/archive/route.ts`
- Create: `apps/customer-panel/components/catalog-onboarding/ProductAdvancedEditor.tsx`
- Create: `apps/customer-panel/components/catalog-onboarding/ProductEditorSection.tsx`
- Create: `apps/customer-panel/components/catalog-onboarding/ProductVariantBuilder.tsx`
- Create: `apps/customer-panel/components/catalog-onboarding/CategoryManager.tsx`
- Modify: `apps/customer-panel/components/catalog-onboarding/product-onboarding.module.css`
- Modify: `apps/customer-panel/components/catalog/ProductCreateForm.tsx`
- Create: `apps/customer-panel/app/products/categories/page.tsx`
- Modify: `apps/customer-panel/lib/panel-ui/navigation.ts:148-164,250-270,450-480`
- Modify: `apps/customer-panel/lib/panel-ui/navigation.test.ts:210-235,450-480`
- Modify: `apps/customer-panel/lib/product-onboarding-console.test.ts`

**Interfaces:**
- Advanced editor emits one `CatalogAdvancedCreateIntent`.
- Category manager uses category CRUD functions added to the onboarding repository/HTTP boundary and never accepts a browser store ID.

- [ ] **Step 1: Write failing editor and navigation tests**

```ts
test("advanced editor is one collapsible form, not a wizard", () => {
  for (const label of SECTIONS) assert.match(source, new RegExp(label));
  assert.doesNotMatch(source, /İleri|Önceki|stepIndex|currentStep/);
});

test("variant builder rejects duplicate attribute combinations", () => {
  assert.equal(buildVariantMatrix(duplicateOptions).ok, false);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --experimental-transform-types --test apps/customer-panel/lib/product-onboarding-console.test.ts apps/customer-panel/lib/panel-ui/navigation.test.ts`

Expected: FAIL because advanced sections/category route are absent.

- [ ] **Step 3: Implement simple/variant choice and collapsible sections**

Render exactly: `Temel bilgiler`, `Fiyat ve stok`, `Varyantlar`, `Medya`, `Kategori, koleksiyon, marka ve etiket`, `Kargo ve gümrük`, `SEO`, `Satış kanalları`, `Nitelikler ve ekstralar`. The sticky summary derives product state, variant count, media count, channels, and missing publication requirements from local validated form state only.

- [ ] **Step 4: Implement persisted category CRUD**

Add the following exact methods to the contract, repository, runtime, handler, and client boundaries:

```ts
listCategories(input: CatalogOnboardingAuthorityInput): Promise<readonly CatalogCategory[]>;
createCategory(input: CreateCatalogCategoryInput): Promise<CatalogCategoryMutationResult>;
updateCategory(input: UpdateCatalogCategoryInput): Promise<CatalogCategoryMutationResult>;
archiveCategory(input: ArchiveCatalogCategoryInput): Promise<CatalogCategoryMutationResult>;
```

The manager supports bounded name, parent, position, status and archive; PostgreSQL rejects cycles, depth above eight, cross-store parents, active product assignments, stale versions, replay mismatch, and direct app-role mutation. Refresh migration checksums after the SQL changes and rerun the complete PostgreSQL harness without reducing its scenario count.

- [ ] **Step 5: Verify GREEN and commit**

Run: `node --experimental-transform-types --test apps/customer-panel/lib/product-onboarding-console.test.ts apps/customer-panel/lib/panel-ui/navigation.test.ts && npm run typecheck --workspace @celebix/customer-panel`

```bash
git add apps/customer-panel/components/catalog-onboarding apps/customer-panel/components/catalog/ProductCreateForm.tsx apps/customer-panel/app/products/categories apps/customer-panel/lib/panel-ui apps/customer-panel/lib/product-onboarding-console.test.ts
git commit -m "feat(customer-panel): add advanced product editor"
```

### Task 9: Reuse the editor for durable product editing

**Files:**
- Modify: `apps/customer-panel/components/catalog/ProductDetailConsole.tsx:1-340`
- Modify: `apps/customer-panel/components/catalog-onboarding/ProductAdvancedEditor.tsx`
- Modify: `apps/customer-panel/lib/catalog-onboarding-ui/client.ts`
- Modify: `apps/customer-panel/lib/catalog-onboarding-ui/client.test.ts`
- Modify: `apps/customer-panel/lib/product-console.test.ts`

**Interfaces:**
- Create mode consumes `CatalogOnboardingOptions`; edit mode consumes `CatalogProductEditorProjection` and submits `expectedVersion`.
- Existing variant/media actions remain available and backward-compatible.

- [ ] **Step 1: Write failing projection/edit tests**

```ts
test("detail editor loads and preserves the complete merchandising projection", async () => {
  const projection = await client.getProductEditor(PRODUCT_ID);
  assert.deepEqual(projection.categoryIds, [CATEGORY_ID]);
  assert.equal(projection.profile.seoTitle, "Seramik Kupa");
});
```

- [ ] **Step 2: Verify RED**

Run: `node --experimental-transform-types --test apps/customer-panel/lib/catalog-onboarding-ui/client.test.ts apps/customer-panel/lib/product-console.test.ts`

Expected: FAIL because product detail does not load merchandising.

- [ ] **Step 3: Integrate shared editor and conflict recovery**

Load base product details and merchandising concurrently. On `version_conflict`, retain local values, announce the conflict, and offer a canonical reload. Never overwrite the server automatically. Keep media ordering/archive and variant archive/edit behaviors intact.

- [ ] **Step 4: Verify GREEN and commit**

Run: `node --experimental-transform-types --test apps/customer-panel/lib/catalog-onboarding-ui/*.test.ts apps/customer-panel/lib/product-console.test.ts && npm run typecheck --workspace @celebix/customer-panel`

```bash
git add apps/customer-panel/components/catalog/ProductDetailConsole.tsx apps/customer-panel/components/catalog-onboarding apps/customer-panel/lib/catalog-onboarding-ui apps/customer-panel/lib/product-console.test.ts
git commit -m "feat(customer-panel): complete product merchandising editor"
```

### Task 10: Multi-image publication completion

**Files:**
- Modify: `apps/customer-panel/components/catalog-onboarding/ProductQuickCreateDialog.tsx`
- Modify: `apps/customer-panel/components/catalog-onboarding/ProductAdvancedEditor.tsx`
- Modify: `apps/customer-panel/lib/catalog-onboarding-ui/client.ts`
- Create: `apps/customer-panel/lib/catalog-onboarding-ui/media-completion.ts`
- Create: `apps/customer-panel/lib/catalog-onboarding-ui/media-completion.test.ts`
- Modify: `apps/customer-panel/lib/product-onboarding-console.test.ts`

**Interfaces:**
- Produces `completeProductMedia({ result, files, upload, publish, recover })` with no automatic write retry.
- Supports JPEG/PNG/WebP only, existing 5 MiB per-image limit, bounded image count, deterministic upload order.

- [ ] **Step 1: Write failing draft-first orchestration tests**

```ts
test("publish waits for every image and uses expected draft version", async () => {
  const outcome = await completeProductMedia(inputWithTwoImages);
  assert.deepEqual(calls.map(({ kind }) => kind), ["upload", "upload", "publish"]);
  assert.equal(outcome.kind, "published");
});

test("upload failure leaves draft and does not publish", async () => {
  const outcome = await completeProductMedia(inputWithFailedUpload);
  assert.equal(outcome.kind, "draft_media_failed");
  assert.equal(publishCalls, 0);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --experimental-transform-types --test apps/customer-panel/lib/catalog-onboarding-ui/media-completion.test.ts`

Expected: FAIL because completion orchestrator is absent.

- [ ] **Step 3: Implement deterministic two-phase completion**

```ts
for (const [position, file] of files.entries()) {
  await upload(result.product.id, { file, position });
}
return intent.publish
  ? { kind: "published", result: await publish(result.product.id, result.product.version) }
  : { kind: "draft", result };
```

Catch upload error as `draft_media_failed`. If publish result is unknown, run one read-only editor projection and accept success only if the canonical product is active with the expected media count; otherwise return `completion_unknown` and no second write.

- [ ] **Step 4: Verify GREEN and commit**

Run: `node --experimental-transform-types --test apps/customer-panel/lib/catalog-onboarding-ui/*.test.ts apps/customer-panel/lib/product-onboarding-console.test.ts`

```bash
git add apps/customer-panel/components/catalog-onboarding apps/customer-panel/lib/catalog-onboarding-ui apps/customer-panel/lib/product-onboarding-console.test.ts
git commit -m "feat(customer-panel): complete product media publication"
```

### Task 11: Full regression, security, accessibility, and local visual gate

**Files:**
- Create: `tests/saas-phase3/catalog-product-onboarding/static-ui.test.mjs`
- Create: `tests/saas-phase3/catalog-product-onboarding/browser-acceptance.mjs`
- Modify only if a real new assertion requires it: `apps/customer-panel/lib/routes.test.ts`

**Interfaces:**
- No new runtime interface; this task proves the complete delivery.

- [ ] **Step 1: Add failing forbidden-authority and accessibility scans**

```js
test("onboarding has no browser or legacy authority", () => {
  assert.doesNotMatch(source, /x-store-id|x-tenant-id|localStorage|sessionStorage|supabase|\/api\/admin\//i);
});

test("dialog and sheet preserve accessibility invariants", () => {
  assert.match(source, /aria-modal="true"|showModal\(/);
  assert.match(css, /min-(?:width|height):\s*48px/);
  assert.match(css, /prefers-reduced-motion/);
});
```

- [ ] **Step 2: Verify RED then repair only proven gaps**

Run: `node --test tests/saas-phase3/catalog-product-onboarding/static-ui.test.mjs`

Expected: initial FAIL identifies any missing gate. Repair production code only after each specific failure is observed.

- [ ] **Step 3: Run focused and cumulative automated matrix**

```bash
npm test --workspace @celebix/saas-contracts
npm run typecheck --workspace @celebix/saas-contracts
npm test --workspace @celebix/saas-data
npm run typecheck --workspace @celebix/saas-data
node --experimental-transform-types --test apps/customer-panel/lib/catalog-onboarding-ui/*.test.ts apps/customer-panel/lib/catalog-onboarding-http/*.test.ts apps/customer-panel/lib/server-catalog-onboarding/*.test.ts apps/customer-panel/lib/product-onboarding-console.test.ts apps/customer-panel/lib/product-console.test.ts
npm test --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/customer-panel
npm run build --workspace @celebix/customer-panel
npm test --workspace @celebix/owner
npm run typecheck --workspace @celebix/owner
npm run build --workspace @celebix/owner
npm run test:saas-phase1
npm run test:saas-phase3:current
node tests/saas-phase3/catalog-product-onboarding/postgres-harness.mjs
git diff --check
```

Expected: all commands PASS. Record exact totals from actual output; never estimate or inherit totals from an earlier run.

- [ ] **Step 4: Run local authenticated browser acceptance**

At 1440×900, 1025×768, 1024×768, 390×844, and 320×720 prove dialog/page switching, keyboard focus, Escape/backdrop/close, focus return, simple/variant editor, partial media failure copy, zero horizontal overflow, 48×48 targets, CTA contrast >=4.5:1, reduced-motion near 0.01ms, and no console/network secret leakage. Save untracked screenshots under `/tmp/celebix-product-onboarding-evidence/`.

- [ ] **Step 5: Run final scope and secret scans**

```bash
git diff --name-only 6fadaa05ad6e7422bda463ccb7c785f8326ee24b...HEAD
git diff --name-only 6fadaa05ad6e7422bda463ccb7c785f8326ee24b...HEAD -- apps/admin
git diff 6fadaa05ad6e7422bda463ccb7c785f8326ee24b...HEAD | rg -n 'BEGIN (RSA|EC|OPENSSH) PRIVATE KEY|postgres(?:ql)?://[^ ]+:[^ ]+@|__Host-celebix_panel=|authorization_code|client_secret' && exit 1 || true
```

Expected: `apps/admin/**` diff count `0`; secret scan returns no matches; production/deploy/credential/merge impact remains `0`.

- [ ] **Step 6: Commit verification artifacts**

```bash
git add tests/saas-phase3/catalog-product-onboarding apps/customer-panel/lib/routes.test.ts
git commit -m "test(catalog): verify product onboarding delivery"
```

### Task 12: Branch completion without deployment

**Files:** none unless verification identifies an authorized defect.

- [ ] **Step 1: Re-run final proof**

Run: `git status --short && git log --oneline 6fadaa05ad6e7422bda463ccb7c785f8326ee24b..HEAD && git diff --check 6fadaa05ad6e7422bda463ccb7c785f8326ee24b...HEAD`

Expected: clean worktree, planned commit chain, no whitespace errors.

- [ ] **Step 2: Push normally**

```bash
git push -u origin codex/ikas-quality-product-onboarding-implementation
```

Expected: remote branch points to the exact local HEAD; no force-push.

- [ ] **Step 3: Stop before any staging gate**

Report code-complete evidence. Staging deployment, authenticated staging mutation, production connection, production deploy, merge, and credentials remain unauthorized and must stay at `0`.
