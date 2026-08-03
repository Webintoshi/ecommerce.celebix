# Storefront Hero Slider and R2 Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the shared `Ana sayfa` design editor upload store-scoped R2 media and publish one-to-three responsive banners through one accessible slider used by admin preview and every storefront.

**Architecture:** Upgrade the storefront-design contract and PostgreSQL authority from schema version 1 to version 2, while normalizing legacy reads into the new hero shape. Keep binary writes in the existing authenticated same-origin media endpoint, repair the exact R2 key allowlist, use one focused admin editor for banner mutations, and render preview/storefront through one client-side slider component.

**Tech Stack:** TypeScript 5.9, React 19, Next.js 16 App Router, Node test runner, PostgreSQL 16, Cloudflare R2 S3-compatible API, CSS Modules, shared workspace packages.

## Global Constraints

- Store between one and three draft banners; never permit zero or more than three.
- Autoplay only when two or three public slides exist, at exactly 5,000 ms.
- Pause autoplay on hover and focus; manual navigation restarts the 5,000 ms interval.
- `prefers-reduced-motion: reduce` disables autoplay and animated transitions.
- Every newly published enabled banner requires a non-empty headline and a valid desktop R2 media reference; mobile media is optional and falls back to desktop media.
- Keep already-published version 1 text heroes readable during migration even if their image is null; apply version 2 publication rules to the next publish.
- Resolve only internal product, collection, and page destinations; arbitrary external links remain invalid.
- The browser never receives an R2 account ID, access key, secret key, bucket authority, object-key authority, or trusted store identifier.
- Derive the store from the authenticated panel session and write only `stores/{storeId}/design/{mediaId}.{jpg|png|webp}`.
- PostgreSQL remains the durable source of draft, publication, version, tenancy, and destination truth; R2 stores only image bytes and integrity metadata.
- Preserve the existing deployment order: migration first, application second.
- Do not introduce a second hero data source, video banners, scheduling, drag-only ordering, direct browser-to-R2 uploads, or a fourth banner.

---

## File Structure

- Modify `apps/customer-panel/lib/server-media/r2-storage.ts`: accept the exact design object namespace and tighten UUID segments for every supported namespace.
- Modify `apps/customer-panel/lib/server-media/r2-storage.test.ts`: prove accepted design keys and rejected malformed, nested, neighboring, and cross-shape keys.
- Modify `packages/saas-contracts/src/storefront-design/types.ts`: define version 2 draft/public hero and banner types.
- Modify `packages/saas-contracts/src/storefront-design/validation.ts`: normalize version 1 reads, validate version 2 documents, and expose a deterministic publish issue.
- Modify `packages/saas-contracts/src/storefront-design/index.ts` and `packages/saas-contracts/src/index.ts`: export the version 2 types and publish validation helper.
- Modify `packages/saas-contracts/src/storefront-design/storefront-design.test.ts`: cover bounds, legacy normalization, public privacy, and publish rules.
- Create `apps/owner/scripts/sql/saas/202608030082_storefront_hero_slider.up.sql`: migrate stored JSON and replace validation/publication projections.
- Create `apps/owner/scripts/sql/saas/202608030082_storefront_hero_slider.down.sql`: guarded one-slide rollback for disposable rehearsal only.
- Create `apps/owner/scripts/sql/saas/202608030082_storefront_hero_slider_assertions.sql`: verify schema, functions, data conversion, and least privilege.
- Create `apps/owner/scripts/sql/saas/phase3-storefront-hero-slider-manifest.json`: SHA-256 pin the migration artifacts.
- Create `apps/owner/scripts/sql/saas/storefront-hero-slider-migration.test.ts`: statically verify the migration package and manifest.
- Modify `tests/saas-phase3/storefront-design-workspace/postgres-harness.mjs`: execute 082 after 081 and prove migrate/save/publish/rollback/reapply behavior on PostgreSQL 16.
- Create `packages/storefront-design-ui/src/hero-slider-model.ts`: pure cyclic navigation and autoplay eligibility helpers.
- Create `packages/storefront-design-ui/src/StorefrontHeroSlider.tsx`: shared accessible client slider.
- Modify `packages/storefront-design-ui/src/StorefrontDesignRenderer.tsx`: delegate hero rendering to the shared slider.
- Modify `packages/storefront-design-ui/src/model.ts`: project enabled draft banners into public preview banners.
- Modify `packages/storefront-design-ui/src/storefront-design.css`: responsive picture, controls, dots, pause-safe layout, and reduced-motion styles.
- Modify `packages/storefront-design-ui/src/index.ts` and `packages/storefront-design-ui/src/StorefrontDesignRenderer.test.ts`: export and test the new shared behavior.
- Create `apps/customer-panel/components/settings/design/hero-slider-model.ts`: immutable add, remove, reorder, and replace operations for 1–3 banners.
- Create `apps/customer-panel/components/settings/design/HeroSliderEditor.tsx`: banner tabs, fields, desktop/mobile uploads, retry, add/remove, and move controls.
- Create `apps/customer-panel/components/settings/design/HeroSliderEditor.test.ts`: test banner mutations and source-level safety/accessibility invariants.
- Modify `apps/customer-panel/components/settings/design/DesignInspector.tsx`: route the `hero` section to `HeroSliderEditor` and restore actual upload access.
- Modify `apps/customer-panel/components/settings/design/DesignWorkspace.tsx`: show banner-specific publish errors without corrupting autosave state.
- Modify `apps/customer-panel/components/settings/design/DesignWorkspace.test.ts` and `apps/customer-panel/components/settings/design-settings.module.css`: update version 2 fixtures and editor styling.
- Modify `apps/customer-panel/lib/storefront-design-ui/client.test.ts`, `apps/customer-panel/lib/storefront-design-http/handler.test.ts`, and `packages/saas-data/src/storefront-design/repository.test.ts`: update exact version 2 fixtures and preserve tenant/version assertions.

---

### Task 1: Repair the exact R2 design namespace

**Files:**
- Modify: `apps/customer-panel/lib/server-media/r2-storage.ts:23-27`
- Modify: `apps/customer-panel/lib/server-media/r2-storage.test.ts:26-32`

**Interfaces:**
- Consumes: `ProductMediaStorage.publicUrl(objectKey: string): string` and existing S3-signing request path.
- Produces: one strict allowlist accepting `stores/{storeUuid}/design/{mediaUuid}.{jpg|png|webp}` and rejecting every neighboring shape before network I/O.

- [ ] **Step 1: Strengthen the failing namespace test**

Replace the existing design namespace test body with assertions for every accepted extension and exact malformed neighbors:

```ts
test("R2 storage accepts only exact tenant media namespaces", () => {
  const storage = createR2ProductMediaStorage(config, {
    async fetch() { throw new Error("not called"); },
    now: () => new Date("2026-07-18T10:00:00.000Z"),
  });
  for (const extension of ["jpg", "png", "webp"]) {
    const objectKey = `stores/${STORE}/design/${MEDIA}.${extension}`;
    assert.equal(storage.publicUrl(objectKey), `https://media.saas-staging.celebix.site/${objectKey}`);
  }
  for (const objectKey of [
    `stores/${STORE}/design/nested/${MEDIA}.png`,
    `stores/${STORE}/themes/${MEDIA}.png`,
    `stores/${STORE}/design/${MEDIA}.gif`,
    `stores/${STORE}/design/not-a-uuid.png`,
    `stores/${STORE}/design/${MEDIA}.png/extra`,
  ]) assert.throws(() => storage.publicUrl(objectKey), /product_media_storage_invalid/);
});
```

- [ ] **Step 2: Run the focused test and confirm the current failure**

Run:

```bash
node --conditions=react-server --experimental-transform-types --test apps/customer-panel/lib/server-media/r2-storage.test.ts
```

Expected: FAIL on the first `/design/` key with `product_media_storage_invalid`.

- [ ] **Step 3: Replace the loose key expression with an exact UUID-based allowlist**

Use one UUID fragment for all supported paths:

```ts
const UUID_SEGMENT = "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const OBJECT_KEY = new RegExp(
  `^stores/${UUID_SEGMENT}/(?:products/${UUID_SEGMENT}/${UUID_SEGMENT}|storefront/(?:logo|hero|social|favicon)/${UUID_SEGMENT}|design/${UUID_SEGMENT})[.](?:jpg|png|webp)$`,
);
```

Do not alter signing, redirect refusal, pending/active metadata, HEAD verification, delete verification, or error classification.

- [ ] **Step 4: Run storage and media handler tests**

Run:

```bash
node --conditions=react-server --experimental-transform-types --test \
  apps/customer-panel/lib/server-media/r2-storage.test.ts \
  apps/customer-panel/lib/storefront-design-http/handler.test.ts
```

Expected: PASS, including the existing authenticated tenant object-key assertion.

- [ ] **Step 5: Commit the storage boundary fix**

```bash
git add apps/customer-panel/lib/server-media/r2-storage.ts \
  apps/customer-panel/lib/server-media/r2-storage.test.ts
git commit -m "fix(customer-panel): allow exact design media keys in R2"
```

---

### Task 2: Upgrade and normalize the storefront-design contract

**Files:**
- Modify: `packages/saas-contracts/src/storefront-design/types.ts:20-140`
- Modify: `packages/saas-contracts/src/storefront-design/validation.ts:150-322`
- Modify: `packages/saas-contracts/src/storefront-design/index.ts:1-36`
- Modify: `packages/saas-contracts/src/index.ts:490-516`
- Modify: `packages/saas-contracts/src/storefront-design/storefront-design.test.ts:10-134`

**Interfaces:**
- Consumes: existing brand, promotion, announcement, media, destination, workspace, and mutation fields.
- Produces: `StorefrontDesignHeroSlide`, `PublicStorefrontDesignHeroSlide`, schema version 2 documents/workspaces/publications, `parseStorefrontDesignDocument(value)`, `parsePublicStorefrontDesign(value)`, and `getStorefrontDesignPublishIssue(design)`.

- [ ] **Step 1: Write failing version 2 and legacy-normalization tests**

Define the canonical draft hero in the test fixture:

```ts
hero: {
  enabled: true,
  slides: [{
    headline: "Zarafetin ışıltısı",
    body: "Her anınıza değer katan zamansız tasarımlar.",
    desktopImage: { kind: "media", mediaId: MEDIA_ID },
    mobileImage: null,
    destination: { kind: "product", resourceId: PRODUCT_ID },
    enabled: true,
  }],
},
```

Add these exact behavioral assertions:

```ts
assert.deepEqual(parseStorefrontDesignDocument(DESIGN), DESIGN);
assert.equal(parseStorefrontDesignDocument(LEGACY_DESIGN).schemaVersion, 2);
assert.deepEqual(parseStorefrontDesignDocument(LEGACY_DESIGN).hero.slides[0], {
  headline: LEGACY_DESIGN.hero.headline,
  body: LEGACY_DESIGN.hero.body,
  desktopImage: LEGACY_DESIGN.hero.image,
  mobileImage: null,
  destination: LEGACY_DESIGN.hero.destination,
  enabled: true,
});
assert.throws(() => parseStorefrontDesignDocument({ ...DESIGN, hero: { ...DESIGN.hero, slides: [] } }));
assert.throws(() => parseStorefrontDesignDocument({ ...DESIGN, hero: { ...DESIGN.hero, slides: [SLIDE, SLIDE, SLIDE, SLIDE] } }));
assert.deepEqual(getStorefrontDesignPublishIssue({ ...DESIGN, hero: { ...DESIGN.hero, slides: [{ ...SLIDE, desktopImage: null }] } }), {
  code: "hero_slide_desktop_image_missing",
  slideIndex: 0,
});
```

For the public fixture use `hero: { enabled: true, slides: [{ headline, body, desktopImage, mobileImage: null, destination }] }` and assert version 1 public input normalizes to version 2 without exposing `mediaId` or `resourceId`.

- [ ] **Step 2: Run the contract test and confirm version 1-only rejection**

Run:

```bash
node --experimental-strip-types --test \
  --test-name-pattern="storefront design|design contract|public contract|authenticated workspace" \
  packages/saas-contracts/src/storefront-design/storefront-design.test.ts
```

Expected: FAIL because schema version 2 and `hero.slides` are not yet accepted.

- [ ] **Step 3: Define the version 2 hero and public types**

Replace the single hero type with these exact shapes and set document/public/workspace `schemaVersion` to `2`:

```ts
export type StorefrontDesignHeroSlide = Readonly<{
  headline: string;
  body: string;
  desktopImage: DesignMediaReference;
  mobileImage: DesignMediaReference;
  destination: DesignDestination;
  enabled: boolean;
}>;

export type StorefrontDesignHero = Readonly<{
  enabled: boolean;
  slides: readonly StorefrontDesignHeroSlide[];
}>;

export type PublicStorefrontDesignHeroSlide = Readonly<{
  headline: string;
  body: string;
  desktopImage: PublicDesignMedia;
  mobileImage: PublicDesignMedia;
  destination: PublicDesignDestination;
}>;

export type StorefrontDesignPublishIssue = Readonly<{
  code: "hero_enabled_slide_missing" | "hero_slide_headline_missing" | "hero_slide_desktop_image_missing";
  slideIndex?: number;
}>;
```

Public hero keeps `enabled` and `slides`; public slides do not contain draft `enabled`, media IDs, or destination resource IDs.

- [ ] **Step 4: Parse version 2 and normalize version 1 at the boundary**

Add focused parsers and keep the existing hostile-object protections:

```ts
function parseHeroSlide(value: unknown): StorefrontDesignHeroSlide {
  const slide = exact(value, ["headline", "body", "desktopImage", "mobileImage", "destination", "enabled"]);
  return Object.freeze({
    headline: text(slide.headline, 0, 120),
    body: text(slide.body, 0, 500),
    desktopImage: parseMediaReference(slide.desktopImage),
    mobileImage: parseMediaReference(slide.mobileImage),
    destination: parseDestination(slide.destination),
    enabled: boolean(slide.enabled),
  });
}

function legacyDocument(value: Record<string, unknown>): unknown {
  const hero = exact(value.hero, ["headline", "body", "image", "destination", "enabled"]);
  return {
    ...value,
    schemaVersion: 2,
    hero: {
      enabled: boolean(hero.enabled),
      slides: [{
        headline: text(hero.headline, 1, 120),
        body: text(hero.body, 0, 500),
        desktopImage: parseMediaReference(hero.image),
        mobileImage: null,
        destination: parseDestination(hero.destination),
        enabled: true,
      }],
    },
  };
}
```

`parseStorefrontDesignDocument` must accept schema `1` only through `legacyDocument`, parse schema `2` directly, require one-to-three draft slides, and always return a deeply frozen schema version 2 document. Apply the same normalization rule to legacy public hero input and accept zero-to-three public slides so disabled draft slides can disappear from preview and the rollout-only legacy projection remains readable.

- [ ] **Step 5: Add deterministic client-side publication validation**

Export this pure helper after parsing the document:

```ts
export function getStorefrontDesignPublishIssue(value: StorefrontDesignDocument): StorefrontDesignPublishIssue | null {
  const design = parseStorefrontDesignDocument(value);
  const enabled = design.hero.slides
    .map((slide, slideIndex) => ({ slide, slideIndex }))
    .filter(({ slide }) => slide.enabled);
  if (!enabled.length) return Object.freeze({ code: "hero_enabled_slide_missing" });
  for (const { slide, slideIndex } of enabled) {
    if (!slide.headline) return Object.freeze({ code: "hero_slide_headline_missing", slideIndex });
    if (slide.desktopImage === null) return Object.freeze({ code: "hero_slide_desktop_image_missing", slideIndex });
  }
  return null;
}
```

- [ ] **Step 6: Run contract tests and typecheck**

Run:

```bash
npm test --workspace @celebix/saas-contracts
npm run typecheck --workspace @celebix/saas-contracts
```

Expected: PASS with version 1 normalization, version 2 bounds, strict public privacy, and publication issues covered.

- [ ] **Step 7: Commit the contract upgrade**

```bash
git add packages/saas-contracts/src/storefront-design \
  packages/saas-contracts/src/index.ts
git commit -m "feat(contracts): add versioned storefront hero slides"
```

---

### Task 3: Migrate PostgreSQL authority to schema version 2

**Files:**
- Create: `apps/owner/scripts/sql/saas/202608030082_storefront_hero_slider.up.sql`
- Create: `apps/owner/scripts/sql/saas/202608030082_storefront_hero_slider.down.sql`
- Create: `apps/owner/scripts/sql/saas/202608030082_storefront_hero_slider_assertions.sql`
- Create: `apps/owner/scripts/sql/saas/phase3-storefront-hero-slider-manifest.json`
- Create: `apps/owner/scripts/sql/saas/storefront-hero-slider-migration.test.ts`
- Modify: `tests/saas-phase3/storefront-design-workspace/postgres-harness.mjs:143-204`

**Interfaces:**
- Consumes: migration 081 tables and exact RPC signatures.
- Produces: version 2 stored JSON, version 2 public/workspace projection, unchanged RPC signatures, `saas.storefront_design_publishable(uuid,jsonb)`, and guarded reversible one-slide rehearsal.

- [ ] **Step 1: Add a failing static migration test**

Pin these files and assertions:

```ts
const files = {
  up: "202608030082_storefront_hero_slider.up.sql",
  down: "202608030082_storefront_hero_slider.down.sql",
  assertions: "202608030082_storefront_hero_slider_assertions.sql",
  manifest: "phase3-storefront-hero-slider-manifest.json",
} as const;

assert.match(up, /storefront_design_upgrade_v2/);
assert.match(up, /storefront_design_publishable/);
assert.match(up, /jsonb_array_length\(p_config->'hero'->'slides'\) NOT BETWEEN 1 AND 3/);
assert.match(up, /'schemaVersion',2/);
assert.match(up, /published_config=draft_config/);
assert.match(down, /STOREFRONT_HERO_SLIDER_DOWN_BLOCKED/);
assert.match(assertions, /storefront_hero_slider_contract_invalid/);
```

Reuse the existing SHA-256 manifest test pattern, but require phase `phase3-storefront-hero-slider`, PostgreSQL major `16`, `externalConnections: 0`, and `productionMutations: 0`.

- [ ] **Step 2: Run the static test and confirm missing artifacts**

Run:

```bash
node --experimental-transform-types --test apps/owner/scripts/sql/saas/storefront-hero-slider-migration.test.ts
```

Expected: FAIL because all 082 artifacts are absent.

- [ ] **Step 3: Implement the forward conversion and exact validators**

Start the up migration with a precondition for migration 081 objects. Add a conversion function that preserves brand, promotion, announcement, hero visibility, text, native media, and destination:

```sql
CREATE FUNCTION saas.storefront_design_upgrade_v2(p_config jsonb,p_draft boolean)
RETURNS jsonb LANGUAGE sql STABLE STRICT SET search_path=pg_catalog,saas AS $function$
  SELECT CASE WHEN p_config->>'schemaVersion'='2' THEN p_config ELSE
    pg_catalog.jsonb_build_object(
      'schemaVersion',2,
      'brand',p_config->'brand',
      'hero',pg_catalog.jsonb_build_object(
        'enabled',p_config->'hero'->'enabled',
        'slides',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
          'headline',p_config->'hero'->>'headline',
          'body',p_config->'hero'->>'body',
          'desktopImage',CASE
            WHEN p_draft AND p_config->'hero'->'image'->>'kind'='legacy_https' THEN 'null'::jsonb
            ELSE p_config->'hero'->'image'
          END,
          'mobileImage','null'::jsonb,
          'destination',p_config->'hero'->'destination',
          'enabled',true
        ))
      ),
      'promotion',p_config->'promotion',
      'announcement',p_config->'announcement'
    ) END
$function$;
```

The draft-only legacy URL removal prevents the next autosave from persisting an untrusted remote URL; the published conversion retains that URL until the merchant uploads R2 media and publishes version 2.

Replace `saas.storefront_design_document_valid` so it requires schema `2`, exact hero keys `enabled/slides`, one-to-three exact slide objects, blank-or-valid draft headline, two validated media references, internal destination, and boolean slide state. Keep promotion/announcement validation unchanged.

- [ ] **Step 4: Convert rows without changing business versions or timestamps**

Drop only the auto-generated `schema_version=1` check, change the default, and update the row atomically:

```sql
ALTER TABLE saas.storefront_designs
  DROP CONSTRAINT storefront_designs_schema_version_check;
ALTER TABLE saas.storefront_designs ALTER COLUMN schema_version SET DEFAULT 2;
UPDATE saas.storefront_designs
SET schema_version=2,
    draft_config=saas.storefront_design_upgrade_v2(draft_config,true),
    published_config=saas.storefront_design_upgrade_v2(published_config,false);
ALTER TABLE saas.storefront_designs
  ADD CONSTRAINT storefront_designs_schema_version_check CHECK(schema_version=2);
```

Do not update `draft_version`, `published_version`, `draft_updated_at`, `published_at`, or actor columns.

- [ ] **Step 5: Enforce publication rules and build the public projection**

Create `saas.storefront_design_publishable` with these exact outcomes:

```sql
IF NOT saas.storefront_design_document_valid(p_store_id,p_config,false) THEN RETURN false; END IF;
IF NOT EXISTS (
  SELECT 1 FROM pg_catalog.jsonb_array_elements(p_config->'hero'->'slides') slide
  WHERE (slide->>'enabled')::boolean
) THEN RETURN false; END IF;
FOR slide IN SELECT value FROM pg_catalog.jsonb_array_elements(p_config->'hero'->'slides') LOOP
  IF (slide->>'enabled')::boolean AND (
    NOT saas.storefront_design_text_valid(slide->'headline',1,120)
    OR slide->'desktopImage'='null'::jsonb
    OR NOT saas.storefront_design_media_reference_valid(p_store_id,slide->'desktopImage',false)
  ) THEN RETURN false; END IF;
END LOOP;
RETURN true;
```

Replace the existing publish RPC body so its validation line calls `storefront_design_publishable`. Preserve idempotency, double authority checks, optimistic versions, event evidence, and `published_config=draft_config`.

Replace `storefront_design_public_payload` so it returns schema version 2 and hero `{enabled, slides}`. Build slides in stored order with `WITH ORDINALITY`, filter `enabled=true`, resolve desktop/mobile media and destination server-side, and aggregate with `ORDER BY ordinal`. Replace `storefront_design_workspace_payload` so its outer `schemaVersion` is `2`.

- [ ] **Step 6: Implement a guarded down migration and assertions**

The down migration must refuse execution unless both conditions hold:

```sql
IF COALESCE(pg_catalog.current_setting('celebix.allow_storefront_hero_slider_down',true),'off')<>'on' THEN
  RAISE EXCEPTION 'STOREFRONT_HERO_SLIDER_DOWN_BLOCKED';
END IF;
IF EXISTS (
  SELECT 1 FROM saas.storefront_designs design
  CROSS JOIN LATERAL (VALUES(design.draft_config),(design.published_config)) config(value)
  WHERE pg_catalog.jsonb_array_length(config.value->'hero'->'slides')<>1
     OR config.value->'hero'->'slides'->0->'mobileImage'<>'null'::jsonb
     OR config.value->'hero'->'slides'->0->>'enabled'<>'true'
) THEN RAISE EXCEPTION 'STOREFRONT_HERO_SLIDER_DOWN_DATA_LOSS'; END IF;
```

After the guard, convert the first slide back to the migration 081 hero keys, restore schema version 1, restore the exact 081 validator/public/workspace/publish function bodies and grants, and drop only `storefront_design_publishable` and `storefront_design_upgrade_v2`. Assertions must prove every row has schema version 2, one-to-three slides, exact grants, no direct table privileges, and all projection/RPC functions exist.

- [ ] **Step 7: Extend the PostgreSQL 16 harness**

After applying 081 and its assertions, apply 082 and its assertions. Update harness JSON paths from `hero.image` to `hero.slides[0].desktopImage` and add scenarios that prove:

```js
assert.equal(workspace.result.schemaVersion, 2);
assert.equal(workspace.result.draft.hero.slides.length, 1);
assert.equal(workspace.result.published.hero.slides[0].headline, "Eski vitrin");
assert.equal(validThreeSlideSave.outcome, "saved");
assert.equal(zeroSlideSave.outcome, "design_input_invalid");
assert.equal(fourSlideSave.outcome, "design_input_invalid");
assert.equal(missingDesktopPublish.outcome, "design_publish_invalid");
assert.equal(crossStoreMediaSave.outcome, "design_input_invalid");
assert.equal(published.result.published.hero.slides.length, 3);
```

For rollback rehearsal, first prove down is blocked, remove extra slides so the data is one-slide compatible, apply 082 down with `SET celebix.allow_storefront_hero_slider_down='on';`, assert schema version 1, then reapply 082 and assert schema version 2.

- [ ] **Step 8: Generate checksums and run static plus PostgreSQL tests**

Generate SHA-256 values from the three SQL artifacts and write them into `phase3-storefront-hero-slider-manifest.json` in `up`, `down`, `verify` order. Then run:

```bash
node --experimental-transform-types --test apps/owner/scripts/sql/saas/storefront-hero-slider-migration.test.ts
node tests/saas-phase3/storefront-design-workspace/postgres-harness.mjs
```

Expected: both PASS; the harness reports PostgreSQL 16, migration/rollback/reapply, tenant isolation, and publication bounds.

- [ ] **Step 9: Commit the database authority upgrade**

```bash
git add apps/owner/scripts/sql/saas/202608030082_storefront_hero_slider.* \
  apps/owner/scripts/sql/saas/phase3-storefront-hero-slider-manifest.json \
  apps/owner/scripts/sql/saas/storefront-hero-slider-migration.test.ts \
  tests/saas-phase3/storefront-design-workspace/postgres-harness.mjs
git commit -m "feat(database): add versioned storefront hero slider"
```

---

### Task 4: Render one shared accessible storefront slider

**Files:**
- Create: `packages/storefront-design-ui/src/hero-slider-model.ts`
- Create: `packages/storefront-design-ui/src/StorefrontHeroSlider.tsx`
- Modify: `packages/storefront-design-ui/src/StorefrontDesignRenderer.tsx:1-50`
- Modify: `packages/storefront-design-ui/src/model.ts:23-70`
- Modify: `packages/storefront-design-ui/src/storefront-design.css:31-59`
- Modify: `packages/storefront-design-ui/src/index.ts:1-2`
- Modify: `packages/storefront-design-ui/src/StorefrontDesignRenderer.test.ts:9-42`

**Interfaces:**
- Consumes: `PublicStorefrontDesign["hero"]` with zero-to-three already-resolved public slides.
- Produces: `nextHeroSlide(index,count,direction)`, `canAutoplayHeroSlider(count,reducedMotion,paused)`, and `<StorefrontHeroSlider hero storeName compact />`.

- [ ] **Step 1: Write failing pure model and renderer-source tests**

Add assertions for cyclic navigation and autoplay:

```ts
assert.equal(nextHeroSlide(0, 3, -1), 2);
assert.equal(nextHeroSlide(2, 3, 1), 0);
assert.equal(nextHeroSlide(0, 1, 1), 0);
assert.equal(canAutoplayHeroSlider(2, false, false), true);
assert.equal(canAutoplayHeroSlider(2, true, false), false);
assert.equal(canAutoplayHeroSlider(2, false, true), false);
assert.equal(canAutoplayHeroSlider(1, false, false), false);
```

Read `StorefrontHeroSlider.tsx` and assert it contains `5000`, `matchMedia("(prefers-reduced-motion: reduce)")`, `onMouseEnter`, `onFocusCapture`, `<picture>`, `aria-label="Önceki banner"`, `aria-label="Sonraki banner"`, and no `dangerouslySetInnerHTML`, `mediaId`, or `resourceId`.

- [ ] **Step 2: Run the UI package tests and confirm missing exports**

Run:

```bash
npm test --workspace @celebix/storefront-design-ui
```

Expected: FAIL because the slider model and component do not exist.

- [ ] **Step 3: Implement pure navigation helpers**

```ts
export function nextHeroSlide(index: number, count: number, direction: -1 | 1): number {
  if (!Number.isSafeInteger(index) || !Number.isSafeInteger(count) || count < 1 || index < 0 || index >= count) return 0;
  return (index + direction + count) % count;
}

export function canAutoplayHeroSlider(count: number, reducedMotion: boolean, paused: boolean): boolean {
  return Number.isSafeInteger(count) && count > 1 && count <= 3 && !reducedMotion && !paused;
}
```

- [ ] **Step 4: Implement the client slider with a single resettable interval**

`StorefrontHeroSlider.tsx` starts with `"use client"`. Track `activeIndex`, `hovered`, `focused`, `reducedMotion`, and `navigationEpoch`. Observe reduced-motion changes and use one interval effect whose dependencies include `navigationEpoch`:

```tsx
useEffect(() => {
  if (!canAutoplayHeroSlider(slides.length, reducedMotion, hovered || focused)) return;
  const timer = window.setInterval(() => setActiveIndex((current) => nextHeroSlide(current, slides.length, 1)), 5_000);
  return () => window.clearInterval(timer);
}, [slides.length, reducedMotion, hovered, focused, navigationEpoch]);

function select(index: number) {
  setActiveIndex(index);
  setNavigationEpoch((value) => value + 1);
}
```

Render only the active slide. Use `<picture>` with a mobile `<source media="(max-width: 720px)" srcSet={mobileImage.url}>` and the desktop image as `<img>`. For one slide, omit arrows and dots. For two or three slides, render named previous/next buttons and one dot button per slide with `aria-current={index === activeIndex ? "true" : undefined}`. The carousel section uses `aria-roledescription="carousel"`, and navigation never moves focus.

- [ ] **Step 5: Project draft banners into the same public shape**

In `createPreviewStorefrontDesign`, replace the single hero fields with:

```ts
hero: {
  enabled: input.draft.hero.enabled,
  slides: input.draft.hero.slides
    .filter((slide) => slide.enabled)
    .map((slide) => ({
      headline: slide.headline,
      body: slide.body,
      desktopImage: media(input, slide.desktopImage),
      mobileImage: media(input, slide.mobileImage),
      destination: destination(input, slide.destination),
    })),
},
```

Update the media/destination helper parameter types so both brand and hero references are accepted without casts.

- [ ] **Step 6: Delegate renderer hero output and add responsive styles**

Replace the inline single hero section with:

```tsx
{showHomeSurfaces && design.hero.enabled && design.hero.slides.length ? (
  <StorefrontHeroSlider hero={design.hero} storeName={storeName} compact={compact} />
) : null}
```

CSS must position slide controls over the hero without covering copy, keep existing color tokens, use opacity/transform transitions only when motion is allowed, stack copy and image below 720 px, give all controls at least 44×44 px hit areas, and include:

```css
@media (prefers-reduced-motion: reduce) {
  .celebix-store-announcement > div { animation: none !important; }
  .celebix-store-hero-slide { transition: none !important; }
}
```

- [ ] **Step 7: Run UI tests and typecheck**

Run:

```bash
npm test --workspace @celebix/storefront-design-ui
npm run typecheck --workspace @celebix/storefront-design-ui
```

Expected: PASS for cyclic navigation, autoplay gating, preview projection, responsive fallback source, accessible controls, and unsafe identifier exclusion.

- [ ] **Step 8: Commit the shared renderer**

```bash
git add packages/storefront-design-ui/src
git commit -m "feat(storefront): render accessible hero slider"
```

---

### Task 5: Build the one-to-three banner admin editor and upload states

**Files:**
- Create: `apps/customer-panel/components/settings/design/hero-slider-model.ts`
- Create: `apps/customer-panel/components/settings/design/HeroSliderEditor.tsx`
- Create: `apps/customer-panel/components/settings/design/HeroSliderEditor.test.ts`
- Modify: `apps/customer-panel/components/settings/design/DesignInspector.tsx:1-50`
- Modify: `apps/customer-panel/components/settings/design/DesignWorkspace.tsx:19-85`
- Modify: `apps/customer-panel/components/settings/design/DesignWorkspace.test.ts:7-46`
- Modify: `apps/customer-panel/components/settings/design-settings.module.css:9-48`

**Interfaces:**
- Consumes: `StorefrontDesignHero`, media options, destination options, `onUpload(file,altText)`, and the existing immutable `onChange(document)` path.
- Produces: child-friendly banner tabs and immutable `addHeroSlide`, `removeHeroSlide`, `moveHeroSlide`, and `updateHeroSlide` operations.

- [ ] **Step 1: Write failing immutable-model tests**

Use a one-slide fixture and assert exact boundaries:

```ts
assert.equal(addHeroSlide(HERO).slides.length, 2);
assert.equal(addHeroSlide(addHeroSlide(addHeroSlide(HERO))).slides.length, 3);
assert.equal(removeHeroSlide(HERO, 0).slides.length, 1);
assert.deepEqual(moveHeroSlide(THREE_SLIDES, 0, -1), THREE_SLIDES);
assert.equal(moveHeroSlide(THREE_SLIDES, 0, 1).slides[1].headline, THREE_SLIDES.slides[0].headline);
assert.equal(updateHeroSlide(HERO, 0, { headline: "Yeni başlık" }).slides[0].headline, "Yeni başlık");
assert.equal(HERO.slides[0].headline, "Eski başlık");
```

Read `HeroSliderEditor.tsx` and assert the source includes `Banner ekle`, `Banner 1`, `Masaüstü görseli`, `Mobil görseli`, `Tekrar dene`, move controls, one file accept list, and no `localStorage`, `sessionStorage`, `x-store-id`, or direct R2 hostname.

- [ ] **Step 2: Run the editor test and confirm missing files**

Run:

```bash
node --experimental-transform-types --test apps/customer-panel/components/settings/design/HeroSliderEditor.test.ts
```

Expected: FAIL because the model and component are absent.

- [ ] **Step 3: Implement immutable one-to-three banner operations**

```ts
export const EMPTY_HERO_SLIDE: StorefrontDesignHeroSlide = Object.freeze({
  headline: "Yeni banner",
  body: "",
  desktopImage: null,
  mobileImage: null,
  destination: Object.freeze({ kind: "none" }),
  enabled: true,
});

export function addHeroSlide(hero: StorefrontDesignHero): StorefrontDesignHero {
  if (hero.slides.length >= 3) return hero;
  return Object.freeze({ ...hero, slides: Object.freeze([...hero.slides, Object.freeze({ ...EMPTY_HERO_SLIDE })]) });
}

export function removeHeroSlide(hero: StorefrontDesignHero, index: number): StorefrontDesignHero {
  if (hero.slides.length <= 1 || index < 0 || index >= hero.slides.length) return hero;
  return Object.freeze({ ...hero, slides: Object.freeze(hero.slides.filter((_, position) => position !== index)) });
}
```

Implement move as a bounded adjacent swap and update as a bounded immutable replacement. Freeze every returned slide array and hero object.

- [ ] **Step 4: Implement the focused editor and finite upload state**

Render tabs for existing banners plus an add button until three. For the active banner render visibility, headline, body, desktop image, optional mobile image, and destination. Add explicit move-left, move-right, and remove buttons with Turkish accessible labels.

Track one upload attempt:

```ts
type UploadAttempt = Readonly<{
  slideIndex: number;
  field: "desktopImage" | "mobileImage";
  file: File;
  status: "uploading" | "failed";
}> | null;
```

`uploadFile` sets `uploading`, awaits the existing `onUpload`, updates only the requested field on the same active slide, and clears state. On rejection it changes only the attempt status to `failed`; it never clears or replaces the prior media reference. `Tekrar dene` calls the same function with the retained `File`. Disable add/remove/reorder during upload so the slide index cannot drift. Clear the native file input value after every attempt.

- [ ] **Step 5: Route the hero section through the focused editor**

In `DesignInspector`, remove the inline single-hero branch and render:

```tsx
if (section === "hero") return (
  <HeroSliderEditor
    hero={design.hero}
    media={media}
    destinations={destinations}
    storeName={storeName}
    disabled={disabled}
    onChange={(value) => onChange({ ...design, hero: value })}
    onUpload={onUpload}
  />
);
```

Delete the `showUpload` escape hatch added by commit `761ae7d3`; brand uploads continue using the generic `MediaField`, while banner uploads use the new finite-state controls.

- [ ] **Step 6: Add a compact publication error in the workspace**

Import `getStorefrontDesignPublishIssue`, keep `publishError` state, clear it on a valid edit, and stop before any network call when the design is not publishable:

```ts
const issue = getStorefrontDesignPublishIssue(editorRef.current.design);
if (issue) {
  const banner = issue.slideIndex === undefined ? "" : `Banner ${issue.slideIndex + 1}: `;
  setPublishError(issue.code === "hero_enabled_slide_missing"
    ? "En az bir banner etkin olmalı."
    : issue.code === "hero_slide_headline_missing"
      ? `${banner}başlık gerekli.`
      : `${banner}masaüstü görseli gerekli.`);
  return;
}
```

Render the error as one short `role="alert"` line above the inspector fields. Do not add explanatory cards, onboarding copy, or persistent banners.

- [ ] **Step 7: Style a flat, responsive editor**

Add horizontal banner tabs, a thin action row, upload status, and compact error styles. Use border-bottom separators instead of nested cards. Keep existing 320 px desktop inspector and one-column mobile layout. All buttons and file labels need at least 44 px hit areas, visible focus, and disabled states. Do not change the shared top navigation or preview viewport.

- [ ] **Step 8: Run editor, workspace, client, and handler tests**

Run:

```bash
node --experimental-transform-types --test \
  apps/customer-panel/components/settings/design/HeroSliderEditor.test.ts \
  apps/customer-panel/components/settings/design/DesignWorkspace.test.ts \
  apps/customer-panel/lib/storefront-design-ui/client.test.ts
node --conditions=react-server --experimental-transform-types --test \
  apps/customer-panel/lib/storefront-design-http/handler.test.ts
```

Expected: PASS for 1–3 bounds, immutable edits, upload retry safety, no browser tenant authority, save state, and authenticated media upload.

- [ ] **Step 9: Commit the admin editor**

```bash
git add apps/customer-panel/components/settings/design \
  apps/customer-panel/components/settings/design-settings.module.css
git commit -m "feat(customer-panel): add R2-backed banner editor"
```

---

### Task 6: Update integration fixtures and prove the complete build

**Files:**
- Modify: `apps/customer-panel/lib/storefront-design-ui/client.test.ts:8-130`
- Modify: `apps/customer-panel/lib/storefront-design-http/handler.test.ts:23-194`
- Modify: `packages/saas-data/src/storefront-design/repository.test.ts:19-151`
- Modify: any exact storefront-design fixture reported by the typechecker, restricted to the version 2 hero shape.

**Interfaces:**
- Consumes: schema version 2 types and unchanged repository/HTTP method signatures.
- Produces: full workspace consistency across contracts, data, customer panel, shared renderer, and storefront build.

- [ ] **Step 1: Replace remaining exact version 1 test fixtures**

Use this canonical shape everywhere a current write/workspace fixture is expected:

```ts
schemaVersion: 2,
hero: {
  enabled: true,
  slides: [{
    headline: "Güzide Kuyumcu",
    body: "Zamansız tasarımlar",
    desktopImage: null,
    mobileImage: null,
    destination: { kind: "none" },
    enabled: true,
  }],
},
```

Public fixtures remove slide `enabled`, resolve destinations to `null` or `{path}`, and keep `desktopImage/mobileImage` as public media objects or null. Preserve every existing authorization, idempotency, version-conflict, unknown-commit, and cross-tenant assertion.

- [ ] **Step 2: Run the focused cross-package suite**

Run:

```bash
npm test --workspace @celebix/saas-contracts
npm test --workspace @celebix/saas-data
npm test --workspace @celebix/storefront-design-ui
node --experimental-transform-types --test \
  apps/customer-panel/components/settings/design/HeroSliderEditor.test.ts \
  apps/customer-panel/components/settings/design/DesignWorkspace.test.ts \
  apps/customer-panel/lib/storefront-design-ui/client.test.ts
node --conditions=react-server --experimental-transform-types --test \
  apps/customer-panel/lib/server-media/r2-storage.test.ts \
  apps/customer-panel/lib/storefront-design-http/handler.test.ts
```

Expected: all PASS with no skipped slider or R2 assertions.

- [ ] **Step 3: Run typechecks and production builds**

Run:

```bash
npm run typecheck --workspace @celebix/saas-contracts
npm run typecheck --workspace @celebix/saas-data
npm run typecheck --workspace @celebix/storefront-design-ui
npm run typecheck --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/storefront-shared
npm run build --workspace @celebix/customer-panel
npm run build --workspace @celebix/storefront-shared
```

Expected: all commands exit `0`; Next production builds contain no server/client boundary, CSS module, or schema-version error.

- [ ] **Step 4: Inspect the final diff and run security scans**

Run:

```bash
git diff --check
rg -n 'CELEBIX_R2_(ACCOUNT_ID|ACCESS_KEY_ID|SECRET_ACCESS_KEY)|x-store-id|localStorage|sessionStorage|dangerouslySetInnerHTML' \
  apps/customer-panel/components/settings/design \
  apps/customer-panel/lib/storefront-design-ui \
  packages/storefront-design-ui/src
git status --short
```

Expected: `git diff --check` is clean; source contains no R2 secret names, forged store header, browser storage authority, or unsafe HTML path. Any expected server-only environment references remain confined to existing server config files outside these scanned client paths.

- [ ] **Step 5: Commit fixture and integration completion**

```bash
git add apps/customer-panel/lib/storefront-design-ui/client.test.ts \
  apps/customer-panel/lib/storefront-design-http/handler.test.ts \
  packages/saas-data/src/storefront-design/repository.test.ts
git commit -m "test: verify storefront hero slider integration"
```

---

### Task 7: Apply migration, deploy, and verify Güzide Kuyumcu live

**Files:**
- No new source file is required.
- Verify deployed source commit and migration checksum against the committed artifacts.

**Interfaces:**
- Consumes: migration 082, the fully green application commit, the existing Coolify app `yk1h6d97z7ex0h74ok3zrj5c`, and server-held PostgreSQL/R2 credentials.
- Produces: live admin upload/save/publish evidence and responsive storefront slider evidence without exposing secrets.

- [ ] **Step 1: Record the release candidate and remote parity**

Run:

```bash
git status --short
git rev-parse HEAD
git log -8 --oneline
git ls-remote origin refs/heads/codex/guzide-staging-integration
```

Expected: clean worktree; local release SHA is known; remote is either the same SHA or is updated only by the explicit push in the next step.

- [ ] **Step 2: Push the reviewed commits**

```bash
git push origin HEAD:refs/heads/codex/guzide-staging-integration
```

Expected: remote branch resolves to the exact local release SHA.

- [ ] **Step 3: Back up and migrate staging PostgreSQL before the app**

Using only the existing server-side migration credential, create a timestamped custom-format backup, verify it with `pg_restore --list`, apply `202608030082_storefront_hero_slider.up.sql` with `ON_ERROR_STOP=1`, then apply `202608030082_storefront_hero_slider_assertions.sql`. Never print the connection string or environment values.

Read-only verification query:

```sql
SELECT schema_version,
       count(*) AS stores,
       min(jsonb_array_length(draft_config->'hero'->'slides')) AS minimum_slides,
       max(jsonb_array_length(draft_config->'hero'->'slides')) AS maximum_slides
FROM saas.storefront_designs
GROUP BY schema_version;
```

Expected: only schema version `2`, with minimum at least `1` and maximum at most `3`.

- [ ] **Step 4: Deploy the exact Coolify branch revision**

Trigger the existing customer-panel/storefront deployment for app UUID `yk1h6d97z7ex0h74ok3zrj5c`. Poll deployment state until terminal success, then verify the running container/image revision equals the pushed SHA. Do not rotate DNS, R2 credentials, Logto configuration, or unrelated services.

- [ ] **Step 5: Verify admin upload, save, reload, and publish**

In a fresh authenticated Güzide admin session open:

```text
https://guzide-kuyumcu-4.admin.saas-staging.celebix.site/settings/design?section=hero
```

Perform one reversible test:

1. Upload a small valid desktop WebP or PNG to Banner 1.
2. Confirm UI states move from `Yükleniyor` to selected uploaded media without showing an infrastructure error.
3. Add Banner 2, upload its desktop image, save through autosave, and reload the page.
4. Confirm both banners, order, text, and media survive reload.
5. Publish and confirm the compact saved state.
6. Inspect the media response: it contains only `id`, HTTPS `url`, `altText`, `mediaType`, `width`, and `height`; its path begins with the authenticated store design namespace.

- [ ] **Step 6: Verify storefront behavior and restore temporary content**

Open:

```text
https://guzide-kuyumcu-4.saas-staging.celebix.site/
```

Confirm two banners advance after five seconds, arrows and dots navigate, hover/focus pauses, manual navigation restarts the interval, mobile viewport uses the mobile image when configured and desktop fallback otherwise, and reduced-motion disables autoplay. Confirm one-banner mode has no controls after removing the temporary second banner. Restore the merchant's intended text/order/publication and remove only temporary test media if it is no longer referenced.

- [ ] **Step 7: Capture final evidence**

Record without secrets:

```text
release SHA
migration 082 SHA-256 values
backup filename and pg_restore list success
Coolify deployment success identifier
admin upload/save/reload/publish result
desktop/mobile/reduced-motion storefront result
```

Do not claim completion until every item is observed on the live Güzide admin and storefront URLs.
