# Atlas Catalog Weight V1 — QA checkpoint

Date: 2026-09-21

Source baseline: `96764834f99a24f8c32ebd1d1ba246742d02740e`

Branch: `codex/atlas-catalog-weight`

## Scope and safety result

- Güzide inventory was read through the existing authorized staging database path without mutations.
- Inventory reviewed: 1,642 products and 1,646 variants.
- Deterministic single-value declarations: 1,583.
  - Exact and eligible for an empty single-variant target: 1.
  - Approximate or tolerance-bearing, manual review only: 1,582.
- Conflicting multiple values, manual review only: 4.
- No supported weight declaration found: 55.
- Existing declared/pricing weights preserved: 0 found in this pre-migration inventory.
- Unmappable multi-variant declarations: 0.
- Live records written: 0. The required schema has not been migrated or deployed.
- Price, stock, SKU, category, description, media, sales status, pricing policy and activation-gate changes: 0.

The sole exact eligible candidate is product `a4ec8ad7-fe92-4dd0-8ce3-f6526851cf92`, variant `7f904f01-4472-4ae1-bb65-58d666e4f7d8`, source product/variant version 1, with the declaration `Ağırlık: 100 Gr`. It remains unapplied.

## Implementation result

- Declared weight has its own admin-only contract and tables. It never writes pricing `metalGrams` and never activates `gold_gram`.
- Store profile is an explicit `general` or `jewelry` opt-in. An absent profile returns the generic safe default and the editor section remains hidden.
- The common UI contains no Güzide store ID, tenant slug or domain condition.
- The product editor supports product-level and variant-level declarations, source, scope, sales unit, approximation/tolerance and pricing-verification state.
- Public storefront product parsing rejects declared weight and audit-source fields.
- Exact backfill is store/tenant/ID allowlisted, source-hash and version pinned, empty-target only, idempotent and transaction bounded. Rollback removes only its own unchanged version-1 import.

## Verification

- Focused catalog-weight contracts, repository, manifest, migration checksum and static security: 20/20 PASS.
- `@celebix/saas-contracts` full package: 359/359 PASS.
- `@celebix/saas-data` full package: 633/634 in the concurrent run; the unrelated hosted-checkout 1-second child-process timeout passed 23/23 when isolated immediately afterward.
- Customer Panel: 1,441 tests total, 1,440 PASS / 1 existing SKIP.
- Typecheck: `@celebix/saas-contracts`, `@celebix/saas-data`, Customer Panel PASS.
- Customer Panel production build: PASS.
- Browser acceptance: 1440 / 1024 / 390 PASS, no horizontal overflow, focus returns through Escape, no console errors or exceptions.
- Manifest dry run: PASS; eligible 1, live writes 0.
- Disposable PostgreSQL 16 rehearsal: NOT RUN on this host because no isolated PostgreSQL runtime is installed. Shared staging was intentionally not used for synthetic migration testing.

## Evidence

- Exact inventory/backfill manifest: `docs/qa/artifacts/catalog-weight-v1/guzide-weight-manifest-96764834.json`
- Browser evidence: `docs/qa/artifacts/catalog-weight-v1/browser-evidence.json`
- Screenshots: `catalog-weight-1440.png`, `catalog-weight-1024.png`, `catalog-weight-390.png`
- Release checksum pin: `apps/owner/scripts/sql/saas/phase-catalog-weight-v1-staging-manifest.json`

## Release requirements

No migration, backfill, deployment or activation is authorized by this checkpoint. A future controlled staging window must:

1. Rehearse up/assert/down on disposable PostgreSQL 16.
2. Build and run generator/check controls for the exact candidate SHA.
3. Apply the checksum-pinned migration before starting the matching Customer Panel build.
4. Re-read the exact candidate product/version/source hash, run the backfill in dry-run mode, and require a separate approved apply step.
5. Confirm the one eligible declaration remains empty before import and verify that price, stock, policy and activation gate remain unchanged.
6. Perform authenticated product-editor and public-storefront boundary acceptance; keep Auto Deploy off.
