# Task 1 implementation report — read-only draft storefront projection

Date: 2026-09-15

## Status and commits

Implemented the bounded read-only A03 projection path and its focused regressions. The delivery is intentionally **partial** where current authority cannot prove equivalent public data: testimonials remain unavailable, a `configuration.read`-only actor may see selected legacy assets as unavailable, and the isolated browser fixture proves the canonical media URL but does not provide the CDN image bytes.

- `3780c449 feat(design): load bounded draft preview projections`
- `bebdca7d test(design): bind preview fixture to postgres projection`
- `d5df7e5a fix(design): keep preview resources bounded and current`

No push, merge, deployment, migration, SQL source change, auth expansion, live browser mutation, or production data write was performed.

## Implemented source

### Server/read boundary

- Added `apps/customer-panel/lib/server-storefront-design-preview/` with an exact-input, bounded loader and the existing customer Panel runtime registration.
- Reused `PostgresPublicStorefrontRepository` for public storefront/product/category/product-detail reads and `PostgresStorefrontAssetRepository.listAssets` for the already-authorized legacy asset list. No repository or SQL authority was added.
- Required an active durable `resolvedHost`; required its tenant id/slug/hostname/canonical hostname to exactly match the returned public storefront before any dependent product/asset reads.
- Separated optional preview preflight/registration from the existing design-runtime preflight. Missing preview functions produce unavailable preview resources and do not make the design workspace fail initialization. The exact product detail prerequisite is `public_starter_product_detail`.
- Added the same-origin authenticated `POST /api/storefront-design/preview` route. Its request contains only `{ composition }`; tenant/store/host/principal authority comes from the server session. Authorization is `configuration.read`, response caching is `no-store`, and existing write handlers are unchanged.

### Bounded resource contract and composition

- Added `storefront-design-preview-model.ts`: dependency keys are derived only from enabled selected source/media/hotspot/category dependencies. Headings, colors, order, section ids, and viewport changes do not trigger resource reads.
- Product source results are deduplicated by key and retain the largest requested limit. Sale reads 48 ordered candidates, filters discounted candidates, applies the section limit, and only then does composition filter availability. Latest/category also apply the source limit before availability, matching migration 113 semantics.
- Sale and latest share the same 48-item public read when both are selected. A hotspot reuses an already-validated source product before making a product-detail read.
- Transport now uses a strict card DTO only: id, slug, title, TRY price/optional compare-at, availability, optional brand name, and at most two safe image records. Description, status, variants, SKU, attributes, category path, merchandising and reviews do not cross the preview boundary.
- The client parser accepts zero-cent hotspot/product prices, rejects unknown product fields and foreign media, limits all arrays/strings, and stream-reads at most 1 MiB. It cancels as soon as the cap is exceeded instead of allocating an unbounded `arrayBuffer` first.
- Current normalized composition is always recomposed with immutable resources, preserving current section ids, order and headings. Missing/partial hero, mobile image, hotspot, split image and category resources remain explicit per-section states. Testimonials are explicit `unavailable`; there is no private review fallback.

### React/render integration

- Initial server resources reach `DesignWorkspace`; subsequent dependency changes use a separate abort/version coordinator.
- Added a real `loading` state distinct from `unavailable`. StrictMode effect cleanup is restartable. A→B-pending→A cancels B and refreshes A, so a late B result cannot apply.
- The resolved canvas preserves the enabled composition order even when `composeCampaignHomeSections` correctly omits a missing public category showcase. The preview keeps a labelled placeholder and truthful missing/unavailable state instead of silently dropping it.
- Preview links have prefetch disabled and the resolved preview wrapper prevents navigation during capture, before the injected/Next link action runs.
- Reused the storefront campaign presentation through the small pure `CampaignSectionContent` and `ProductCardContent` extractions. The storefront keeps its existing interactive `CampaignProductRow`/`ProductCard` wrappers. Shared product helper types were narrowed structurally; commerce behavior was not removed.
- Resolved mobile product rows intentionally retain the canonical storefront horizontal-scroll campaign behavior (`min(72vw, 300px)` cards). Canvas-scoped rules keep later cards accessible at both 390 px and a 390 px canvas inside a 1440 px outer viewport; this is not the legacy two-column scaffold layout.

### Isolated real-repository fixture

- Extended `tests/saas-phase3/homepage-builder/postgres-harness.mjs` without changing migration SQL. It seeds a real active product, variant and canonical product-media row in disposable PostgreSQL 16.
- The harness saves and publishes a product-row composition using the real design repository, saves a subsequent unpublished heading change, then runs the real public storefront repository through the draft preview loader.
- It compares published `resolveCampaignHome` product title/media URL with the unpublished draft loader result, compares the loader result exactly with `postgres-preview-snapshot.json`, and compares the design workspace before/after byte-for-structure to prove zero preview writes.
- The `/design-settings-fix` page and refresh endpoint consume that tracked, production-parser-validated PG snapshot. They do not construct a mock product repository. The old `fixture.invalid` banner is disabled so it cannot be mistaken for new media evidence.

## TDD evidence

### Original RED

The first focused canvas regression was run before production wiring:

```text
node --experimental-transform-types --test components/settings/design/VisualStorefrontCanvas.behavior.test.ts
8 passed, 1 failed: the real projection product title was absent and sample cards were rendered.
```

The server loader, HTTP client/handler, model and coordinator tests were each introduced before their modules/behaviors. The initial loader/client runs failed with missing modules; subsequent behavioral REDs demonstrated source duplication, limit/availability ordering, partial-media status, stale completion and the absent same-origin route.

The final independent review corrections were reproduced with concrete failures before changes:

```text
node --experimental-transform-types --test lib/storefront-design-preview-ui/use-preview-resources.test.ts components/settings/design/VisualStorefrontCanvas.behavior.test.ts components/settings/design/DesignWorkspaceToolbar.behavior.test.ts
14 tests: 11 passed, 3 failed
FAIL missing category section was absent
FAIL coordinator could not refresh after StrictMode-style cleanup
FAIL A→B→A test had no cancellation API
```

```text
node --experimental-transform-types --test lib/storefront-design-preview-ui/client.test.ts components/settings/design/VisualStorefrontCanvas.behavior.test.ts
16 tests: 12 passed, 4 failed
FAIL missing category disappeared
FAIL injected product navigation ran before bubble-phase prevention
FAIL zero-cent hotspot was rejected
FAIL body reader continued beyond the byte cap
```

```text
node --experimental-transform-types --test lib/server-storefront-design-preview/loader.test.ts lib/storefront-design-preview-model.test.ts lib/storefront-design-preview-ui/client.test.ts lib/storefront-design-preview-ui/use-preview-resources.test.ts components/settings/design/VisualStorefrontCanvas.behavior.test.ts
26 tests: 16 passed, 10 failed
The additional failures covered broad PublicProduct transport, missing loading resources, the mounted loading/stale hook behavior, and the same four parser/canvas regressions.
```

Disposable PG setup also failed safely during RED iteration before the exact fixture authority was completed:

```text
INVENTORY_STOCK_SOURCE_REQUIRED
feature_not_enabled
durable_authority_invalid
```

Those failures were resolved only in synthetic harness setup by supplying the existing required inventory provenance, catalog/media entitlements and a matching custom canonical host; no production validator or permission was relaxed.

### Focused GREEN

Final post-commit focused correction group:

```text
cd apps/customer-panel
node --experimental-transform-types --test lib/server-storefront-design-preview/loader.test.ts lib/storefront-design-preview-model.test.ts lib/storefront-design-preview-ui/client.test.ts lib/storefront-design-preview-ui/use-preview-resources.test.ts components/settings/design/VisualStorefrontCanvas.behavior.test.ts components/settings/design/DesignWorkspaceToolbar.behavior.test.ts
30 tests, 30 passed, 0 failed
```

Shared storefront presentation regression:

```text
cd apps/storefront-shared
node --experimental-transform-types --test components/CampaignHome.test.ts
20 tests, 20 passed, 0 failed
```

Real PostgreSQL/repository parity and zero-write proof:

```text
node --experimental-transform-types tests/saas-phase3/homepage-builder/postgres-harness.mjs
18/18 PASS
PASS 14/18 real Postgres public repository feeds bounded draft products and media
PASS 18/18 disposable database has no leaked sessions
```

Focused type checks:

```text
npm run typecheck --workspace @celebix/customer-panel
tsc -p tsconfig.json --noEmit  # exit 0

npm run typecheck --workspace @celebix/storefront-shared
tsc -p tsconfig.json --noEmit  # exit 0
```

Earlier focused integration greens retained by the final correction were: preview HTTP handler 2/2, server preview/design runtime 5/5, canonical design route 1/1, DesignWorkspace source/lifecycle 23/23, and the initial preview client 3/3. One intermediate command incorrectly applied `--conditions=react-server` to client tests and produced two module-mode failures; rerunning client and server groups under their correct conditions passed. It is not counted as product GREEN.

Per controller ownership, I did **not** run the full Panel suite or either production build. The controller runs the final combined suite/typecheck/build and browser matrix once against the frozen SHA.

## Query and permission budget

For one preview load after the caller has read its workspace:

1. Exactly one canonical public storefront read; mismatch stops all dependent reads.
2. Zero product-list reads when no product source is selected.
3. Latest-only: one public list read at the maximum selected latest limit (4/8/12).
4. Sale selected: one public list read at 48; latest, when also selected, reuses its ordered prefix rather than making a second list query.
5. At most one category product read for each distinct selected category source, each at that source's maximum selected limit; source count is bounded by the normalized composition and the 12-entry response parser.
6. At most one legacy asset-list read, and only when at least one enabled section selected an asset.
7. At most one public product-detail read for each distinct selected hotspot not already present in a validated source result; hotspot response count is capped at 12.
8. Category showcase is reused from the canonical public storefront presentation; there is no additional category-showcase query.

The route requires only existing `configuration.read`. Product reads use the public repository/host-resolver authority. Asset reads retain the existing app repository permission checks. An actor allowed to read configuration but denied the legacy asset list gets a bounded per-asset `unavailable` result; no `catalog_admin.manage` or SQL execute grant was added. The parser returns no object key, credential, tenant id or principal id.

## Self-review

- Verified current section ids/order/headings are composed from the current draft, not copied from an earlier response.
- Verified mixed available/unavailable candidates are sliced before availability filtering; no “fill from later candidates” behavior was introduced.
- Verified sale and latest share only the same ordered public authority read; category sources remain independent.
- Verified missing mobile/desktop/hotspot/panel/category dependencies are not reported ready.
- Verified strict origin/session/configuration-read boundary and canonical tenant/storefront match occur before dependent reads.
- Verified no newly added `any`, `as any`, `as never`, validator relaxation, default substitution, initialization write, cache/worker or private-review fallback.
- Verified preview render has no cart/favorite/API actions, no link prefetch and no navigation.
- Verified shared storefront CampaignHome behavior remains covered by 20 focused tests.
- `git diff --check` was clean before each scoped commit. Controller-owned QA documents, evidence directories and `design-a03-browser-check.mjs` were not staged.

## Exact remaining gaps / partial boundaries

1. **Testimonials unavailable:** no existing read path was proven equivalent to the published `approved_product_reviews` projection for an unpublished composition. Raw `catalog_admin.listReviews` was deliberately not exposed.
2. **Legacy assets permission-sensitive:** existing asset listing is usable for owner/admin/editor authority already granted by the application. A `configuration.read` actor without that repository permission receives explicit unavailable state; permissions were not widened.
3. **Canonical host required:** if the authenticated tenant context has no active durable canonical `resolvedHost`, preview resources are unavailable. No fallback hostname is invented.
4. **Fixture image bytes not supplied:** the disposable PG test proves the canonical URL and exact public-repository/media projection. The browser fixture references `https://media.saas-staging.celebix.site/stores/10000000-0000-4000-8000-000000000100/products/42000000-0000-4000-8000-000000000100/44000000-0000-4000-8000-000000000100.webp`, but this task does not upload to the live CDN. No service worker, browser cache or success simulation was added. A browser capture may therefore show the product and canonical `<img>` source while reporting the external image as not loaded.
5. **Synthetic category showcase absent:** the PG fixture's published presentation has no category showcase. The design fixture now shows the configured category section in exact order with a truthful missing placeholder rather than fabricating category content.

These gaps are visible and do not substitute example content for authoritative unavailable data.
