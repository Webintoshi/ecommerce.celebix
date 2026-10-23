# Shared Product VAT Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collect authoritative product VAT and carry it into future sales, marketplace configuration and a clearly scoped accounting breakdown without changing prices or historical orders.

**Architecture:** Add nullable native metadata and immutable tax sidecars, with shape-compatible existing public catalog responses. Opt-in atomic writer wrappers and a dedicated tax projection connect the new panel to canonical tax. Prepared sales capture the applied tax facts; historical unknowns remain unknown.

**Tech Stack:** TypeScript/React/Next.js, shared saas-contracts/saas-data, native PostgreSQL16.

**Spec:** docs/superpowers/specs/2026-10-23-product-vat-design.md

## Global Constraints

- Root is sole publisher; reuse the active isolated cart-empty-removal worktree at9f34efb1a0abbac8cd8c9f34b17b59edd88a357b.
- No guessed VAT backfill, repricing, old order/quote/ledger rewrite, added polling or new dependency.
- Existing owner/storefront JSON shapes, immutable tariffs, operation receipts and unknown-commit behavior remain compatible.
- Taxable0, exempt and missing are different. Gross/base/tax arithmetic uses cents and integer basis points.

## Review Focus

- A catalog rate changes after checkout/POS preparation: settlement uses the prepared rate.
- Lost create/update acknowledgement: retry retains the same price, tax and operation identity.
- Mixed-rate discounts/returns: allocate cents consistently and preserve original sale tax evidence.
- Legacy or imported missing tax: no default20%, zero tax or inferred net profit.
- Provider-specific VAT restrictions and pending writes: no silent replacement or serialization bypass.

### Task1: Canonical contracts and authoritative panel bridge

Files: packages/saas-contracts/src/product-tax/*; packages/saas-data/src/product-tax/*; catalog/catalog-onboarding validators/repositories; Customer Panel tax GET route/runtime.

- [x] Write failing choice/projection/arithmetic, tenant authority and replay tests.
- [x] Implement strict shared tax helpers, atomic opt-in scalar wrappers and optional JSON fields; preserve old responses/fingerprints.
- [x] Pass focused tests and coordinate exact SQL/HTTP interfaces.

### Task2: Native metadata and immutable sale evidence

Files: new apps/owner/scripts/sql/saas/202610230268_product_tax.{up,down}.sql, assertions and focused disposable native tests.

- [x] Prove current missing metadata/prepared evidence failures.
- [x] Add constrained nullable catalog tax, narrow read authority and atomic writers.
- [x] Capture future checkout/POS preparation, settlement and revision/return tax evidence; expose dated accounting tax/coverage.
- [x] Prove old prices/orders/ledgers, tenant/version/replay and safe rollback protections.

### Task3: Product experience

Files: product quick/advanced/detail/variant components and form/draft/client helpers.

- [x] Add failing UI/model tests for required new selection, missing existing data and rate-only price preservation.
- [x] Implement KDV field, variant inheritance, explicit exclusive-entry conversion/preview and atomic payloads; preserve drafts/retries.
- [ ] Pass focused create/edit and keyboard/recovery checks.

### Task4: Marketplace and accounting integration

Files: Trendyol editor/worker/native bridge migration269; accounting tax contracts/data/API/workspace.

- [x] Prove missing/default/provider conflict and dated coverage failures.
- [x] Use canonical VAT for future mapping/delivery, surface missing/unsupported tax; keep Google gross prices unchanged.
- [x] Add scoped sales VAT accounting breakdown with historical unknown coverage, without changing existing profit/cash meaning.
- [x] Pass money, queue267, orders/accounting and API authority regression tests.

### Task5: Review and shared rollout

- [x] Independently review cross-component tax and compatibility boundaries; fix confirmed findings.
- [ ] Run affected typechecks/builds and source-bound current/historical signup rehearsals; commit tested sources/proof.
- [ ] Fresh live preflight and transactional native installation with all existing rows protected.
- [ ] Publish NET→SITE; verify candidate runtime, unchanged witnesses/env and authenticated shared product/accounting UI.
- [ ] Record exact acceptance and disclose any provider/account prerequisite.
