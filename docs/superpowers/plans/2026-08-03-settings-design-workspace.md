# Settings and Storefront Design Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a grouped Settings index and one tenant-safe Design workspace whose durable drafts publish atomically from PostgreSQL to the real shared storefront.

**Architecture:** Add one versioned storefront-design contract and one PostgreSQL authority that owns draft, publication, design media, destination validation, and public projection. The customer panel uses server-derived tenant authority for read, upload, autosave, and publish; a shared React renderer powers both the panel preview and storefront, which reads only the published projection.

**Tech Stack:** PostgreSQL 16 security-definer functions and forced RLS, TypeScript 5.9, Node test runner, React 19, Next.js 16 App Router, CSS Modules, shared R2-compatible media storage, Lucide icons.

## Global Constraints

- The panel is operational, not conversational: short labels and truthful state only.
- The page canvas is open; decorative outer cards and duplicate body titles are prohibited.
- Every store, media, destination, draft, and publication decision is derived from server-owned tenant authority.
- Demo content, localStorage, sessionStorage, arbitrary HTML, JavaScript, CSS, remote fonts, and browser-supplied authority identifiers are prohibited.
- Draft saving and publication are separate, versioned, idempotent, recoverable operations.
- Public storefront reads return only published design; draft data is never anonymously reachable.
- Legacy storefront appearance must remain byte-for-byte equivalent after migration until the merchant publishes a change.
- Existing six baseline failures are recorded separately; no new test may hide, rewrite, or normalize those failures.
- No production code is written before its focused test has been observed failing for the expected missing behavior.

---

## File Structure

### Shared contracts

- Create `packages/saas-contracts/src/storefront-design/types.ts`: exact admin and public design DTO types.
- Create `packages/saas-contracts/src/storefront-design/validation.ts`: hostile-shape-safe exact parsers.
- Create `packages/saas-contracts/src/storefront-design/index.ts`: public exports.
- Create `packages/saas-contracts/src/storefront-design/storefront-design.test.ts`: contract behavior tests.
- Modify `packages/saas-contracts/src/index.ts`: re-export the new contract.

### Durable authority and repositories

- Create `apps/owner/scripts/sql/saas/202608030081_storefront_design_workspace.up.sql`: tables, validation, migration, RPCs, RLS, ACLs.
- Create `apps/owner/scripts/sql/saas/202608030081_storefront_design_workspace.down.sql`: drift-guarded rollback.
- Create `apps/owner/scripts/sql/saas/202608030081_storefront_design_workspace_assertions.sql`: exact metadata and authority assertions.
- Create `apps/owner/scripts/sql/saas/phase3-storefront-design-workspace-manifest.json`: immutable checksums.
- Create `apps/owner/scripts/sql/saas/storefront-design-workspace-migration.test.ts`: static migration contract.
- Create `tests/saas-phase3/storefront-design-workspace/postgres-harness.mjs`: real PostgreSQL 16 lifecycle proof.
- Modify `tests/saas-phase3/run-current-suite.mjs`: register the new focused static and PostgreSQL tests without changing historical expected inventories.
- Create `packages/saas-data/src/storefront-design/types.ts`: repository ports and operation inputs.
- Create `packages/saas-data/src/storefront-design/errors.ts`: finite repository errors.
- Create `packages/saas-data/src/storefront-design/canonical.ts`: save/publish/media fingerprints.
- Create `packages/saas-data/src/storefront-design/repository.ts`: application-role repository.
- Create `packages/saas-data/src/storefront-design/public-repository.ts`: host-resolver public repository.
- Create `packages/saas-data/src/storefront-design/repository.test.ts`: adapter and unknown-commit tests.
- Create `packages/saas-data/src/storefront-design/index.ts`: exports.
- Modify `packages/saas-data/src/index.ts`: re-export repositories and types.

### Customer-panel server and HTTP boundaries

- Create `apps/customer-panel/lib/server-storefront-design/runtime.ts`: validated runtime facade.
- Create `apps/customer-panel/lib/server-storefront-design/default.ts`: approved-staging PostgreSQL/R2 registration.
- Create `apps/customer-panel/lib/server-storefront-design/runtime.test.ts`: runtime boundary tests.
- Create `apps/customer-panel/lib/storefront-design-http/request-authority.ts`: exact origin/method authority.
- Create `apps/customer-panel/lib/storefront-design-http/handler.ts`: read, draft, publish, and media handlers.
- Create `apps/customer-panel/lib/storefront-design-http/handler.test.ts`: real handler behavior tests.
- Create `apps/customer-panel/lib/storefront-design-http/default.ts`: thin default delegates.
- Create `apps/customer-panel/app/api/storefront-design/route.ts`: GET workspace.
- Create `apps/customer-panel/app/api/storefront-design/draft/route.ts`: PATCH draft.
- Create `apps/customer-panel/app/api/storefront-design/publish/route.ts`: POST publication.
- Create `apps/customer-panel/app/api/storefront-design/media/route.ts`: POST media upload.
- Create `apps/customer-panel/lib/storefront-design-ui/client.ts`: safe browser DTO client.
- Create `apps/customer-panel/lib/storefront-design-ui/client.test.ts`: client parsing and error mapping.

### Settings and Design UI

- Create `packages/storefront-design-ui/package.json`: shared renderer workspace package.
- Create `packages/storefront-design-ui/tsconfig.json`: TypeScript project config.
- Create `packages/storefront-design-ui/src/StorefrontDesignRenderer.tsx`: shared brand, hero, promotion, and announcement renderer.
- Create `packages/storefront-design-ui/src/storefront-design.css`: renderer visual contract.
- Create `packages/storefront-design-ui/src/index.ts`: renderer exports.
- Create `packages/storefront-design-ui/src/StorefrontDesignRenderer.test.tsx`: deterministic render tests.
- Modify `apps/customer-panel/components/merchant-admin/MerchantFamilyOverview.tsx`: grouped Settings mode.
- Modify `apps/customer-panel/components/merchant-admin/merchant-family-overview.module.css`: open grouped rows.
- Modify `apps/customer-panel/lib/panel-ui/navigation.ts`: one Design navigation destination.
- Modify `apps/customer-panel/lib/panel-ui/navigation.test.ts`: exact navigation behavior.
- Replace `apps/customer-panel/components/settings/DesignSettingsHub.tsx` with a server-fed workspace shell.
- Replace `apps/customer-panel/components/settings/design-settings.module.css` with open editor layout.
- Create `apps/customer-panel/components/settings/design/DesignWorkspace.tsx`: autosave, section selection, preview mode, publish.
- Create `apps/customer-panel/components/settings/design/DesignInspector.tsx`: child-friendly controls.
- Create `apps/customer-panel/components/settings/design/DesignPreview.tsx`: shared renderer host.
- Create `apps/customer-panel/components/settings/design/DesignWorkspace.test.tsx`: interaction and accessibility tests.
- Modify `apps/customer-panel/app/settings/design/page.tsx`: load authorized workspace.
- Modify `apps/customer-panel/app/settings/hero-banner/page.tsx`: redirect to Design hero.
- Modify `apps/customer-panel/app/settings/promotion-banner/page.tsx`: redirect to Design promotion.
- Modify `apps/customer-panel/app/settings/marquee/page.tsx`: redirect to Design announcement.
- Modify `apps/customer-panel/lib/design-settings.test.ts`: replace static-hub assertions with real workspace behavior.
- Modify `apps/customer-panel/lib/routes.test.ts`: exact API and redirect routes.

### Shared storefront

- Modify `packages/saas-data/src/storefront/types.ts`: add `getPublicStorefrontDesign` to the public repository port.
- Modify `packages/saas-data/src/storefront/repository.ts`: call the new public RPC and parse the public contract.
- Modify `packages/saas-data/src/storefront/repository.test.ts`: exact public read tests.
- Modify `apps/storefront-shared/lib/default-runtime.ts`: preflight migration 081.
- Modify `apps/storefront-shared/app/page.tsx`: load products and design in parallel.
- Modify `apps/storefront-shared/components/StorefrontFrame.tsx`: render published brand and announcement.
- Modify `apps/storefront-shared/app/globals.css`: import shared renderer CSS and map existing layout tokens.
- Modify `apps/storefront-shared/lib/public-storefront.test.ts`: prove draft is never read.
- Modify `apps/storefront-shared/lib/storefront-app.test.ts`: prove published projection stays tenant-bound.

### Visual evidence and operations

- Create `docs/superpowers/concepts/2026-08-03-settings-design-workspace-desktop.png`: accepted desktop implementation reference.
- Create `docs/superpowers/concepts/2026-08-03-settings-design-workspace-mobile.png`: responsive reference.
- Create `docs/superpowers/verification/2026-08-03-settings-design-workspace.md`: fidelity ledger and reversible Güzide evidence.
- Modify `apps/customer-panel/lib/panel-ui/parity-manifest.ts`: replace static hub evidence with the published vertical slice.
- Modify `apps/customer-panel/lib/panel-ui/functional-maturity.ts`: mark design publication runtime complete only after verification.

---

### Task 1: Lock the visual reference and implementation inventory

**Files:**
- Create: `docs/superpowers/concepts/2026-08-03-settings-design-workspace-desktop.png`
- Create: `docs/superpowers/concepts/2026-08-03-settings-design-workspace-mobile.png`
- Create: `docs/superpowers/verification/2026-08-03-settings-design-workspace.md`

**Interfaces:**
- Consumes: approved design spec `docs/superpowers/specs/2026-08-03-settings-design-workspace-design.md`.
- Produces: desktop/mobile concepts and a fixed inventory used by Tasks 7 and 9.

- [ ] **Step 1: Generate the complete desktop editor concept**

Use Image Gen in `ui-mockup` mode. The full 1440×900 screen must include the existing Celebix sidebar/top bar, exact visible labels `Tasarım`, `Marka`, `Renkler`, `Yazı`, `Ana sayfa`, `Promosyon`, `Duyuru`, `Taslak kaydedildi`, `Masaüstü`, `Mobil`, and `Yayınla`; an open white canvas; a narrow left inspector; and a bounded storefront preview. It must not add cards, gradients, fake metrics, explanatory copy, or invented features.

- [ ] **Step 2: Generate the coordinated mobile editor concept**

Use the same palette, typography, icons, and white canvas. Show section tabs as a horizontal row, controls first, preview second, 48-pixel controls, and no horizontal overflow.

- [ ] **Step 3: Inspect both concepts at original detail**

Run `view_image` for each concept and reject any output with unreadable labels, decorative cards, clipped controls, or a different admin skeleton. Iterate one targeted change at a time until both meet the approved spec.

- [ ] **Step 4: Write the locked implementation inventory**

Record in the verification document:

```markdown
## Allowed first-viewport copy
Tasarım; Marka; Renkler; Yazı; Ana sayfa; Promosyon; Duyuru; Taslak kaydedildi; Masaüstü; Mobil; Yayınla

## Container model
Open white page canvas; one functional preview boundary; no outer editor card; divider-based section rail.

## Tokens
Accent #FF5A00; text #171717; muted #667085; divider #E8EDF4; background #FFFFFF; control radius 10px; preview radius 12px; 48px minimum targets.

## Typography
Existing panel font; 14px/600 control labels; 13px/500 status; 15px/600 section rows; storefront type comes from the selected design font.
```

- [ ] **Step 5: Commit the visual reference**

```bash
git add docs/superpowers/concepts docs/superpowers/verification/2026-08-03-settings-design-workspace.md
git commit -m "design: lock storefront workspace concept"
```

### Task 2: Add exact storefront-design contracts

**Files:**
- Create: `packages/saas-contracts/src/storefront-design/types.ts`
- Create: `packages/saas-contracts/src/storefront-design/validation.ts`
- Create: `packages/saas-contracts/src/storefront-design/index.ts`
- Create: `packages/saas-contracts/src/storefront-design/storefront-design.test.ts`
- Modify: `packages/saas-contracts/src/index.ts`

**Interfaces:**
- Consumes: existing `TenantContext`, UUID, timestamp, and public media conventions.
- Produces: `StorefrontDesignDocument`, `StorefrontDesignWorkspace`, `PublicStorefrontDesign`, `parseStorefrontDesignDocument`, `parseStorefrontDesignWorkspace`, and `parsePublicStorefrontDesign`.

- [ ] **Step 1: Write failing exact-shape contract tests**

```typescript
test("design contract accepts one complete version-one document", () => {
  assert.deepEqual(parseStorefrontDesignDocument(DESIGN), DESIGN);
});

test("public contract rejects draft fields and private resource identifiers", () => {
  assert.throws(() => parsePublicStorefrontDesign({ ...PUBLIC_DESIGN, draftVersion: 2 }));
  assert.throws(() => parsePublicStorefrontDesign({ ...PUBLIC_DESIGN, hero: { ...PUBLIC_DESIGN.hero, mediaId: MEDIA_ID } }));
});

test("admin writes reject legacy remote images", () => {
  assert.throws(() => parseStorefrontDesignDocument({ ...DESIGN, hero: { ...DESIGN.hero, image: { kind: "legacy_https", url: "https://legacy.example/hero.jpg" } } }));
});
```

- [ ] **Step 2: Run the contract test and verify RED**

Run: `node --experimental-strip-types --test packages/saas-contracts/src/storefront-design/storefront-design.test.ts`

Expected: FAIL because `parseStorefrontDesignDocument` and related exports do not exist.

- [ ] **Step 3: Implement the exact DTOs and parsers**

Use these public shapes without local aliases:

```typescript
export type DesignDestination = Readonly<
  | { kind: "none" }
  | { kind: "product" | "collection" | "page"; resourceId: string }
>;

export type DesignMediaReference = Readonly<{ kind: "media"; mediaId: string }> | null;

export type StorefrontDesignDocument = Readonly<{
  schemaVersion: 1;
  brand: Readonly<{ logo: DesignMediaReference; favicon: DesignMediaReference; primaryColor: string; accentColor: string; backgroundColor: string; textColor: string; fontFamily: "inter" | "manrope" | "playfair" | "montserrat" }>;
  hero: Readonly<{ headline: string; body: string; image: DesignMediaReference; destination: DesignDestination; enabled: boolean }>;
  promotion: Readonly<{ headline: string; body: string; destination: DesignDestination; startsAt: string | null; endsAt: string | null; enabled: boolean }>;
  announcement: Readonly<{ items: readonly string[]; icon: "none" | "sparkle" | "truck" | "shield"; speed: "slow" | "normal" | "fast"; direction: "left" | "right"; animation: "continuous" | "step"; enabled: boolean }>;
}>;
```

`PublicStorefrontDesign` resolves media to `{ url, altText } | null`, destinations to `{ path } | null`, and includes `publicationVersion` plus `publishedAt`; it contains no resource/media/store/principal identifiers. Parsers must reject accessors, proxies, sparse arrays, unknown keys, unsafe text, non-canonical timestamps, invalid hex colors, and unapproved enums.

- [ ] **Step 4: Run focused and package tests GREEN**

Run:

```bash
node --experimental-strip-types --test packages/saas-contracts/src/storefront-design/storefront-design.test.ts
npm test --workspace @celebix/saas-contracts
npm run typecheck --workspace @celebix/saas-contracts
```

Expected: all commands pass with no new warning beyond Node's existing experimental transform notice.

- [ ] **Step 5: Commit contracts**

```bash
git add packages/saas-contracts/src/storefront-design packages/saas-contracts/src/index.ts
git commit -m "feat: define storefront design contracts"
```

### Task 3: Add PostgreSQL design, media, draft, and publication authority

**Files:**
- Create: `apps/owner/scripts/sql/saas/202608030081_storefront_design_workspace.up.sql`
- Create: `apps/owner/scripts/sql/saas/202608030081_storefront_design_workspace.down.sql`
- Create: `apps/owner/scripts/sql/saas/202608030081_storefront_design_workspace_assertions.sql`
- Create: `apps/owner/scripts/sql/saas/phase3-storefront-design-workspace-manifest.json`
- Create: `apps/owner/scripts/sql/saas/storefront-design-workspace-migration.test.ts`
- Create: `tests/saas-phase3/storefront-design-workspace/postgres-harness.mjs`
- Modify: `tests/saas-phase3/run-current-suite.mjs`

**Interfaces:**
- Consumes: `saas.stores`, memberships/plans, `saas.store_media_namespaces`, products, categories/collections, content pages, and legacy typed merchant settings.
- Produces: `saas.storefront_design_get`, `saas.storefront_design_save_draft`, `saas.storefront_design_publish`, `saas.storefront_design_media_*`, and `saas.storefront_design_get_public`.

- [ ] **Step 1: Write the failing static migration test**

The test must assert one row per store, separate draft/published JSON, exact version columns, forced RLS, app/host-resolver function-only ACLs, immutable operation/event ledgers, no arbitrary URL write path, and the five exact RPC signatures.

```typescript
test("081 owns one versioned design document per store", async () => {
  const sql = await readFile(UP, "utf8");
  assert.match(sql, /CREATE TABLE saas[.]storefront_designs/);
  assert.match(sql, /PRIMARY KEY\s*\(store_id\)/);
  assert.match(sql, /draft_config jsonb NOT NULL/);
  assert.match(sql, /published_config jsonb NOT NULL/);
  assert.doesNotMatch(sql, /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE).*storefront_designs.*celebix_saas_(?:app|host_resolver)/is);
});
```

- [ ] **Step 2: Run static test and verify RED**

Run: `node --experimental-transform-types --test apps/owner/scripts/sql/saas/storefront-design-workspace-migration.test.ts`

Expected: FAIL because migration 081 does not exist.

- [ ] **Step 3: Implement tables and finite validators**

Create:

```sql
CREATE TABLE saas.storefront_designs(
  store_id uuid PRIMARY KEY REFERENCES saas.stores(id) ON DELETE RESTRICT,
  schema_version integer NOT NULL DEFAULT 1 CHECK(schema_version=1),
  draft_config jsonb NOT NULL,
  published_config jsonb NOT NULL,
  draft_version bigint NOT NULL DEFAULT 1 CHECK(draft_version>0),
  published_version bigint NOT NULL DEFAULT 1 CHECK(published_version>0),
  draft_updated_at timestamptz NOT NULL,
  published_at timestamptz NOT NULL,
  draft_updated_by uuid NOT NULL,
  published_by uuid NOT NULL
);
```

Also create store-scoped `storefront_design_media`, append-only `storefront_design_operations`, and append-only `storefront_design_events`. Media object keys must be exactly `stores/<store_uuid>/design/<media_uuid>.<jpg|png|webp>`. Document validation must use an exact key allowlist, finite enums, canonical uppercase `#RRGGBB`, bounded UTF-8 text, media ownership, active destination ownership, and strict UTC timestamps.

- [ ] **Step 4: Implement idempotent RPCs and migration**

The five browser/server-facing signatures are:

```sql
saas.storefront_design_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz)
saas.storefront_design_save_draft(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,bigint,jsonb)
saas.storefront_design_publish(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,bigint,bigint)
saas.storefront_design_media_reserve(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,text,text,integer,integer,bigint,text)
saas.storefront_design_get_public(uuid,text,timestamptz)
```

Save and publish lock the store row, reauthorize after lock acquisition, bind a SHA-256 fingerprint to a globally unique operation ID, enforce expected versions, and recover byte-identically. Publish copies the full validated draft to publication in one update and appends one event. Public read validates hostname/store pairing and projects only resolved public URLs/paths.

Seed every store idempotently. Convert the newest active legacy typed records. Convert canonical Celebix media URLs to media IDs; otherwise preserve the current hero URL only in an owner-created `legacy_https` publication variant that app mutations cannot create.

- [ ] **Step 5: Write and run the PostgreSQL harness RED then GREEN**

The harness must execute literal scenarios for: one row per store, exact migration preservation, app read/manage role matrix, cross-store denial, media ownership, destination ownership, save replay/mismatch, stale save, atomic publish, stale publish, public draft exclusion, legacy URL one-way migration, backup/restore, guarded down, clean down/up, and cleanup.

Run: `node tests/saas-phase3/storefront-design-workspace/postgres-harness.mjs`

Expected after implementation: every named scenario passes on disposable PostgreSQL 16.

- [ ] **Step 6: Pin checksums and run focused gates**

Run:

```bash
node --experimental-transform-types --test apps/owner/scripts/sql/saas/storefront-design-workspace-migration.test.ts
node tests/saas-phase3/storefront-design-workspace/postgres-harness.mjs
```

Expected: PASS with exact manifest bytes and no direct relation grants.

- [ ] **Step 7: Commit durable authority**

```bash
git add apps/owner/scripts/sql/saas/202608030081_storefront_design_workspace.* apps/owner/scripts/sql/saas/phase3-storefront-design-workspace-manifest.json apps/owner/scripts/sql/saas/storefront-design-workspace-migration.test.ts tests/saas-phase3/storefront-design-workspace tests/saas-phase3/run-current-suite.mjs
git commit -m "feat: add durable storefront design authority"
```

### Task 4: Implement strict application and public repositories

**Files:**
- Create: `packages/saas-data/src/storefront-design/types.ts`
- Create: `packages/saas-data/src/storefront-design/errors.ts`
- Create: `packages/saas-data/src/storefront-design/canonical.ts`
- Create: `packages/saas-data/src/storefront-design/repository.ts`
- Create: `packages/saas-data/src/storefront-design/public-repository.ts`
- Create: `packages/saas-data/src/storefront-design/repository.test.ts`
- Create: `packages/saas-data/src/storefront-design/index.ts`
- Modify: `packages/saas-data/src/index.ts`
- Modify: `packages/saas-data/src/storefront/types.ts`
- Modify: `packages/saas-data/src/storefront/repository.ts`
- Modify: `packages/saas-data/src/storefront/repository.test.ts`

**Interfaces:**
- Consumes: Task 2 parsers and Task 3 RPCs.
- Produces: `StorefrontDesignRepository`, `PostgresStorefrontDesignRepository`, and `PublicStorefrontRepository.getPublicStorefrontDesign`.

- [ ] **Step 1: Write failing repository behavior tests**

```typescript
test("save draft recovers one unknown commit without a second write", async () => {
  const result = await repository.saveDraft(SAVE_INPUT);
  assert.equal(result.replayed, true);
  assert.equal(writeCalls, 1);
  assert.equal(recoveryCalls, 1);
});

test("public repository rejects a projection containing media identity", async () => {
  await assert.rejects(
    publicRepository.getPublicStorefrontDesign(PUBLIC_INPUT),
    (error: unknown) => error instanceof StorefrontDesignRepositoryError && error.code === "unavailable",
  );
});
```

- [ ] **Step 2: Run repository tests and verify RED**

Run: `node --experimental-strip-types --test packages/saas-data/src/storefront-design/repository.test.ts`

Expected: FAIL because the repository classes do not exist.

- [ ] **Step 3: Implement finite ports and adapters**

Use this application port:

```typescript
export interface StorefrontDesignRepository {
  getWorkspace(input: DesignAuthorityInput): Promise<StorefrontDesignWorkspace>;
  saveDraft(input: DesignAuthorityInput & Readonly<{ operationId: string; expectedDraftVersion: number; design: StorefrontDesignDocument }>): Promise<StorefrontDesignDraftMutation>;
  publish(input: DesignAuthorityInput & Readonly<{ operationId: string; expectedDraftVersion: number; expectedPublishedVersion: number }>): Promise<StorefrontDesignPublicationMutation>;
  reserveMedia(input: ReserveStorefrontDesignMediaInput): Promise<StorefrontDesignMediaReservation>;
  finalizeMedia(input: StorefrontDesignMediaLifecycleInput): Promise<StorefrontDesignMedia>;
  recoverMedia(input: StorefrontDesignMediaLifecycleInput): Promise<StorefrontDesignMedia>;
}
```

Adapters use read-only transactions for reads, `SET LOCAL ROLE`, exact result envelopes, bounded timeouts, parser validation, rollback on known failures, and one read-only recovery after unknown commit. Extend `PublicStorefrontRepository` with:

```typescript
getPublicStorefrontDesign(input: TrustedStorefrontContext & Readonly<{ now: Date }>): Promise<PublicStorefrontDesign>;
```

- [ ] **Step 4: Run focused tests and type checks GREEN**

```bash
node --experimental-strip-types --test packages/saas-data/src/storefront-design/repository.test.ts packages/saas-data/src/storefront/repository.test.ts
npm test --workspace @celebix/saas-data
npm run typecheck --workspace @celebix/saas-data
```

- [ ] **Step 5: Commit repositories**

```bash
git add packages/saas-data/src/storefront-design packages/saas-data/src/storefront packages/saas-data/src/index.ts
git commit -m "feat: expose storefront design repositories"
```

### Task 5: Add authenticated design HTTP and media upload boundaries

**Files:**
- Create: `apps/customer-panel/lib/server-storefront-design/runtime.ts`
- Create: `apps/customer-panel/lib/server-storefront-design/default.ts`
- Create: `apps/customer-panel/lib/server-storefront-design/runtime.test.ts`
- Create: `apps/customer-panel/lib/storefront-design-http/request-authority.ts`
- Create: `apps/customer-panel/lib/storefront-design-http/handler.ts`
- Create: `apps/customer-panel/lib/storefront-design-http/handler.test.ts`
- Create: `apps/customer-panel/lib/storefront-design-http/default.ts`
- Create: `apps/customer-panel/app/api/storefront-design/route.ts`
- Create: `apps/customer-panel/app/api/storefront-design/draft/route.ts`
- Create: `apps/customer-panel/app/api/storefront-design/publish/route.ts`
- Create: `apps/customer-panel/app/api/storefront-design/media/route.ts`
- Create: `apps/customer-panel/lib/storefront-design-ui/client.ts`
- Create: `apps/customer-panel/lib/storefront-design-ui/client.test.ts`
- Modify: `apps/customer-panel/lib/server-media/r2-storage.ts`
- Modify: `apps/customer-panel/lib/server-media/r2-storage.test.ts`

**Interfaces:**
- Consumes: `StorefrontDesignRepository`, panel session authority, existing image validator, and store media namespace.
- Produces: same-origin browser endpoints and `createStorefrontDesignClient`.

- [ ] **Step 1: Write failing HTTP authority tests**

Test unauthenticated read, cross-origin mutation, private authority headers, browser store IDs, analyst read-only access, manager save/publish, invalid expected versions, unknown-commit recovery, oversized JSON, malformed multipart, invalid image, and tenant-safe media reservation.

```typescript
test("publish derives tenant authority from the persistent session", async () => {
  const response = await handlers.publish(request("/api/storefront-design/publish", {
    expectedDraftVersion: 4,
    expectedPublishedVersion: 2,
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(repositoryInput.tenantContext, SESSION_TENANT);
  assert.equal(JSON.stringify(await response.json()).includes(SESSION_TENANT.store.id), false);
});
```

- [ ] **Step 2: Run handler tests and verify RED**

Run: `node --experimental-transform-types --test apps/customer-panel/lib/storefront-design-http/handler.test.ts`

Expected: FAIL because the handler factory is missing.

- [ ] **Step 3: Generalize the R2 object-key boundary with a compatibility alias**

Permit only two server-generated key families:

```typescript
const OBJECT_KEY = /^stores\/[0-9a-f-]{36}\/(?:products\/[0-9a-f-]{36}|design)\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/;
export type TenantMediaStorage = ProductMediaStorage;
```

Existing product-media tests must remain green. The design upload path uses `stores/<storeId>/design/<mediaId>.<ext>` and the same validation, SHA-256, pending write, publication metadata, and recovery rules.

- [ ] **Step 4: Implement server runtime, handlers, routes, and client**

Handlers accept:

- GET workspace with no body;
- PATCH draft with exact `{ expectedDraftVersion, design }` and an `Idempotency-Key` UUID;
- POST publish with exact `{ expectedDraftVersion, expectedPublishedVersion }` and an `Idempotency-Key` UUID;
- POST media multipart with exactly `file` and `altText`, maximum 5 MiB.

Responses are `Cache-Control: no-store`, finite, parser-validated, and contain no TenantContext. Client errors map to Turkish operational messages for `version_conflict`, `membership_denied`, `invalid_input`, and `unavailable`.

- [ ] **Step 5: Run HTTP, client, media, and route tests GREEN**

```bash
node --experimental-transform-types --test apps/customer-panel/lib/server-storefront-design/runtime.test.ts apps/customer-panel/lib/storefront-design-http/handler.test.ts apps/customer-panel/lib/storefront-design-ui/client.test.ts apps/customer-panel/lib/server-media/r2-storage.test.ts
npm run typecheck --workspace @celebix/customer-panel
```

- [ ] **Step 6: Commit HTTP boundaries**

```bash
git add apps/customer-panel/lib/server-storefront-design apps/customer-panel/lib/storefront-design-http apps/customer-panel/lib/storefront-design-ui apps/customer-panel/app/api/storefront-design apps/customer-panel/lib/server-media/r2-storage*
git commit -m "feat: add storefront design API"
```

### Task 6: Replace Settings cards and legacy appearance routes

**Files:**
- Modify: `apps/customer-panel/components/merchant-admin/MerchantFamilyOverview.tsx`
- Modify: `apps/customer-panel/components/merchant-admin/merchant-family-overview.module.css`
- Modify: `apps/customer-panel/lib/panel-ui/navigation.ts`
- Modify: `apps/customer-panel/lib/panel-ui/navigation.test.ts`
- Modify: `apps/customer-panel/app/settings/hero-banner/page.tsx`
- Modify: `apps/customer-panel/app/settings/promotion-banner/page.tsx`
- Modify: `apps/customer-panel/app/settings/marquee/page.tsx`
- Modify: `apps/customer-panel/lib/routes.test.ts`

**Interfaces:**
- Consumes: current Settings definitions and Next.js `redirect`.
- Produces: grouped Settings rows and canonical Design entry points.

- [ ] **Step 1: Write failing navigation and rendered-index tests**

```typescript
test("settings exposes one design destination", () => {
  const settings = PANEL_NAVIGATION.find(({ key }) => key === "settings");
  assert.deepEqual(settings?.children?.map(({ href }) => href), [
    "/settings/general", "/settings/language", "/settings/administrators",
    "/settings/payment", "/settings/shipping", "/settings/notifications",
    "/settings/artificial-intelligence", "/settings/design",
  ]);
});
```

Render `MerchantFamilyOverview` with `family="settings"` and assert four group headings, one Design link, no Hero/Promotion/Marquee sibling links, and no generic page description.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --experimental-transform-types --test apps/customer-panel/lib/panel-ui/navigation.test.ts apps/customer-panel/lib/design-settings.test.ts apps/customer-panel/lib/routes.test.ts`

Expected: FAIL because Settings still exposes separate appearance links and a card grid.

- [ ] **Step 3: Implement grouped open Settings rows**

Use the exact groups and order from the spec. Rows have icon, title, optional server-provided state, divider, 48-pixel minimum target, and focus ring. Remove card border/radius/shadow and generic descriptions. Keep other merchant families unchanged.

- [ ] **Step 4: Implement exact legacy redirects**

```typescript
import { redirect } from "next/navigation";
export default function LegacyHeroSettingsPage() {
  redirect("/settings/design?section=hero");
}
```

Use `section=promotion` and `section=announcement` for the other routes. They retain no merchant console or writable legacy form.

- [ ] **Step 5: Run focused tests and type check GREEN**

```bash
node --experimental-transform-types --test apps/customer-panel/lib/panel-ui/navigation.test.ts apps/customer-panel/lib/design-settings.test.ts apps/customer-panel/lib/routes.test.ts
npm run typecheck --workspace @celebix/customer-panel
```

- [ ] **Step 6: Commit Settings information architecture**

```bash
git add apps/customer-panel/components/merchant-admin apps/customer-panel/lib/panel-ui/navigation* apps/customer-panel/app/settings/hero-banner apps/customer-panel/app/settings/promotion-banner apps/customer-panel/app/settings/marquee apps/customer-panel/lib/design-settings.test.ts apps/customer-panel/lib/routes.test.ts
git commit -m "feat: group storefront settings under design"
```

### Task 7: Build the shared renderer and child-friendly Design workspace

**Files:**
- Create: `packages/storefront-design-ui/package.json`
- Create: `packages/storefront-design-ui/tsconfig.json`
- Create: `packages/storefront-design-ui/src/StorefrontDesignRenderer.tsx`
- Create: `packages/storefront-design-ui/src/storefront-design.css`
- Create: `packages/storefront-design-ui/src/index.ts`
- Create: `packages/storefront-design-ui/src/StorefrontDesignRenderer.test.tsx`
- Modify: `apps/customer-panel/components/settings/DesignSettingsHub.tsx`
- Modify: `apps/customer-panel/components/settings/design-settings.module.css`
- Create: `apps/customer-panel/components/settings/design/DesignWorkspace.tsx`
- Create: `apps/customer-panel/components/settings/design/DesignInspector.tsx`
- Create: `apps/customer-panel/components/settings/design/DesignPreview.tsx`
- Create: `apps/customer-panel/components/settings/design/DesignWorkspace.test.tsx`
- Modify: `apps/customer-panel/app/settings/design/page.tsx`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: Task 1 visual inventory, Task 2 DTOs, Task 5 client.
- Produces: `StorefrontDesignRenderer`, `DesignWorkspace`, autosave/publish workflow, responsive preview.

- [ ] **Step 1: Write failing shared-renderer tests**

Render one public design and assert brand CSS variables, logo alt text, enabled hero, in-window promotion, and announcement items. Render a disabled/out-of-window document and assert those surfaces are absent.

```typescript
test("renderer applies one published design without private identity", () => {
  const html = renderToStaticMarkup(<StorefrontDesignRenderer design={PUBLIC_DESIGN} storeName="Güzide Kuyumcu" now="2026-08-03T10:00:00.000Z" />);
  assert.match(html, /--store-primary:#FF5A00/);
  assert.match(html, />Güzide Kuyumcu</);
  assert.doesNotMatch(html, new RegExp(MEDIA_ID));
});
```

- [ ] **Step 2: Write failing editor interaction tests**

Use Happy DOM and the real client boundary. Test section selection, live field preview, desktop/mobile mode, 600 ms debounced autosave, saved/error/conflict state, publish enabled only after durable save, validation focus, image upload, destination selector, and keyboard/touch semantics.

- [ ] **Step 3: Run renderer/editor tests and verify RED**

Run:

```bash
NODE_OPTIONS='--conditions=react-server' node --experimental-transform-types --test packages/storefront-design-ui/src/StorefrontDesignRenderer.test.tsx
node --experimental-transform-types --test apps/customer-panel/components/settings/design/DesignWorkspace.test.tsx
```

Expected: FAIL because renderer and workspace do not exist.

- [ ] **Step 4: Implement the shared renderer package**

Create `@celebix/storefront-design-ui` as a private ESM workspace package with `react` and `react-dom` peer dependencies, exact `exports` for the renderer and stylesheet, and `test`/`typecheck` scripts that are runnable from the root workspace. Do not add a second React copy.

The component accepts only:

```typescript
export type StorefrontDesignRendererProps = Readonly<{
  design: PublicStorefrontDesign;
  storeName: string;
  now: string;
  mode?: "storefront" | "preview";
}>;
```

It sets four CSS variables, uses the selected finite font stack, renders code-native UI, computes promotion activity from the passed canonical time, and has no data fetching or tenant authority.

- [ ] **Step 5: Implement the editor state machine**

`DesignWorkspace` owns `working`, `durableDraft`, versions, selected section, preview mode, and finite status. A valid edit updates preview immediately and schedules one debounced save. A new edit cancels the prior timer. Publish waits for the current save, sends exact versions, and updates both publication and draft state only from the server response. Version conflict never overwrites local edits.

The inspector uses media thumbnails, real destination choices, color input plus hex field, font previews, direct `Göster/Gizle` toggles, store-timezone schedule controls, and no raw IDs/URLs.

- [ ] **Step 6: Match the accepted desktop and mobile concepts**

Implement the Task 1 tokens exactly. Keep the page white, the preview as the only functional frame, the inspector open, the section rail divider-based, and control typography explicit. Add `prefers-reduced-motion` and no accidental mobile overflow.

- [ ] **Step 7: Run focused tests, type checks, and package tests GREEN**

```bash
NODE_OPTIONS='--conditions=react-server' node --experimental-transform-types --test packages/storefront-design-ui/src/StorefrontDesignRenderer.test.tsx
node --experimental-transform-types --test apps/customer-panel/components/settings/design/DesignWorkspace.test.tsx apps/customer-panel/lib/design-settings.test.ts
npm run typecheck --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/storefront-design-ui
```

- [ ] **Step 8: Commit Design workspace**

```bash
git add packages/storefront-design-ui apps/customer-panel/components/settings apps/customer-panel/app/settings/design package-lock.json
git commit -m "feat: build live storefront design workspace"
```

### Task 8: Connect published design to the real shared storefront

**Files:**
- Modify: `apps/storefront-shared/lib/default-runtime.ts`
- Modify: `apps/storefront-shared/app/page.tsx`
- Modify: `apps/storefront-shared/components/StorefrontFrame.tsx`
- Modify: `apps/storefront-shared/app/globals.css`
- Modify: `apps/storefront-shared/lib/public-storefront.test.ts`
- Modify: `apps/storefront-shared/lib/storefront-app.test.ts`

**Interfaces:**
- Consumes: Task 4 public repository and Task 7 shared renderer.
- Produces: published brand, hero, promotion, announcement, and cache-version behavior on the actual storefront.

- [ ] **Step 1: Write failing storefront consumption tests**

```typescript
test("home loads catalog and published design in parallel", async () => {
  const result = await loadHomeFixture();
  assert.equal(result.design.publicationVersion, 7);
  assert.equal(result.html.includes("Taslak başlık"), false);
  assert.equal(result.html.includes("Yayındaki başlık"), true);
});
```

Add a repository fixture where draft differs from published and assert the page receives only published. Add a second-store fixture and assert no shared render/cache value crosses stores.

- [ ] **Step 2: Run storefront tests and verify RED**

Run: `npm test --workspace @celebix/storefront-shared`

Expected: the new tests fail because storefront pages do not request design.

- [ ] **Step 3: Add migration preflight and parallel data loading**

Require migration 081's exact public function in `default-runtime.ts`. In the home page start the product and design reads together:

```typescript
const productsPromise = runtime.repository.listPublicProducts({ storefront, now, limit: 8 });
const designPromise = runtime.repository.getPublicStorefrontDesign({ storefront, now });
const [products, design] = await Promise.all([productsPromise, designPromise]);
```

Pass design into `StorefrontFrame` and the shared renderer. Set favicon metadata from the public design without exposing media identity. Cache keys include `storefront.id` and `publicationVersion`.

- [ ] **Step 4: Replace hard-coded home copy only where owned by design**

Use the published hero, promotion, and announcement. Preserve product grid and existing store sections. Disabled or out-of-window surfaces are omitted; they are not replaced with fake promotion copy.

- [ ] **Step 5: Run storefront and cross-package tests GREEN**

```bash
npm test --workspace @celebix/storefront-shared
npm run typecheck --workspace @celebix/storefront-shared
npm test --workspace @celebix/saas-data
npm test --workspace @celebix/saas-contracts
```

- [ ] **Step 6: Commit storefront integration**

```bash
git add apps/storefront-shared packages/saas-data/src/storefront
git commit -m "feat: render published storefront design"
```

### Task 9: Verify, migrate, deploy, and record reversible Güzide evidence

**Files:**
- Modify: `apps/customer-panel/lib/panel-ui/parity-manifest.ts`
- Modify: `apps/customer-panel/lib/panel-ui/functional-maturity.ts`
- Modify: `docs/superpowers/verification/2026-08-03-settings-design-workspace.md`

**Interfaces:**
- Consumes: all prior tasks and the approved staging deployment path.
- Produces: tested migration, browser fidelity ledger, restored Güzide publication, and deployment evidence.

- [ ] **Step 1: Run all focused automated gates**

```bash
npm test --workspace @celebix/saas-contracts
npm test --workspace @celebix/saas-data
npm test --workspace @celebix/customer-panel
npm test --workspace @celebix/storefront-shared
npm run typecheck
node --experimental-transform-types --test apps/owner/scripts/sql/saas/storefront-design-workspace-migration.test.ts
node tests/saas-phase3/storefront-design-workspace/postgres-harness.mjs
git diff --check
```

Expected: all feature-focused and workspace package tests pass. The known six pre-existing cumulative failures remain separately listed and no new cumulative failure appears.

- [ ] **Step 2: Build deployment artifacts**

```bash
npm run build:coolify:customer-panel
npm run build:coolify:storefront-shared
```

Expected: both production builds complete.

- [ ] **Step 3: Apply migration through the self-hosted migration command**

Use the existing approved staging database environment and run:

```bash
npm run migrate:selfhosted-store-db
```

Verify migration 081 and assertions are recorded before deploying application images. Do not print the connection string or credentials.

- [ ] **Step 4: Deploy customer panel and shared storefront through the existing Coolify path**

Deploy only the reviewed branch commit. Wait for both services to report healthy before browser testing. Do not change unrelated Coolify resources or tenant DNS.

- [ ] **Step 5: Perform reversible Güzide functional verification**

In Browser/IAB:

1. Open `https://guzide-kuyumcu-4.admin.saas-staging.celebix.site/settings` and confirm grouped Settings with one Design row.
2. Open Design, switch every section, upload/select a safe test image, change one reversible headline and accent color, and observe autosave.
3. Confirm the storefront remains unchanged before publish.
4. Publish and open `https://guzide-kuyumcu-4.saas-staging.celebix.site/` in a fresh tab; confirm the exact published headline/color/image.
5. Verify desktop and mobile layouts, keyboard focus, no horizontal overflow, and no console/network errors.
6. Publish the recorded original design again and confirm restoration.

- [ ] **Step 6: Complete visual fidelity QA**

Capture current desktop/mobile screenshots, then use `view_image` on each accepted concept and matching implementation screenshot in the same QA pass. Record at least these five comparisons: copy/order, open-canvas geometry, typography, Celebix palette, preview framing, responsive collapse, and icon/target treatment. Record the above-the-fold copy diff and every fixed mismatch.

- [ ] **Step 7: Update truthful maturity metadata**

Mark design publication complete only after the reversible storefront observation. Replace static-hub parity evidence with contract, PostgreSQL, browser, and restoration evidence.

- [ ] **Step 8: Run the cumulative suite and classify only known baseline failures**

Run: `npm run test:saas-phase3:current`

Expected: no new failure beyond the six baseline failures recorded before Task 1. If a seventh failure appears, stop and fix it before completion.

- [ ] **Step 9: Commit verification evidence**

```bash
git add apps/customer-panel/lib/panel-ui/parity-manifest.ts apps/customer-panel/lib/panel-ui/functional-maturity.ts docs/superpowers/verification/2026-08-03-settings-design-workspace.md
git commit -m "test: verify storefront design publication"
```

- [ ] **Step 10: Finish the development branch**

Use `superpowers:finishing-a-development-branch`, verify final status and commit log, and present the reviewed integration options without merging or deleting the worktree automatically.
