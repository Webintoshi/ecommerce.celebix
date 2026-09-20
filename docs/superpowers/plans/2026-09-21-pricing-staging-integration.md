# Reference Pricing Staging Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish one exact combined staging source to Customer Panel and Storefront with dynamic pricing activation OFF, then perform read-only merchant acceptance.

**Architecture:** Start from PR #80 head `78e3c070f767eea5b01afa031025a5453eebbed2` in an isolated temporary branch. Merge the exact currently running Panel source `69ee87990a53909968d64e4bc9f51d6be9e5f253` rather than the unpublished PR #79 head; the Storefront deployment record and image tag identify canonical `c09d59a21944fb24ef82cf904db5e444ec1d4fd5`, already an ancestor of PR #80, although its current generated `SOURCE_COMMIT` metadata incorrectly says `17e6c10f543917c3c4c85b6d662bce299a8da2ae`. Repair that identity mismatch only in the new exact release build, not by relabeling the old image. Use the existing staging DB and only feature-specific migrations after backup, ledger and closed-gate preflight. Build and deploy only the two approved apps from the final merge commit.

**Tech Stack:** Git, Node 22, PostgreSQL 16, Coolify, Next.js Customer Panel/Storefront.

**Spec:** `/Users/Celebix/.codex/attachments/c9327538-b683-42ad-96be-4cd520dcaca8/Yapıştırılan metin.txt`

## Global Constraints

- PR #79 and #80 remain draft and unmerged; no canonical merge or force-push.
- Owner and Analytics Worker are not deployed; all four apps retain Auto Deploy and Preview Deployments OFF.
- Dynamic pricing gate remains OFF in every store; no real reference, product policy, checkout, order, payment or provider mutation.
- Do not apply unrelated order archive/safe-delete migrations or change the existing hooks, DNS, auth, provider modes or merchant credentials.
- Shared staging DB is not a test database; isolated Linux/PostgreSQL tests precede all live changes.

## Review Focus

- Design preview product DTO under new pricing projections must render existing draft/catalog values without unexpected save.
- Existing product/variant editor must preserve fixed prices and fail closed when gate is OFF.
- Old browser and old RPC/API shapes must retain fixed barcode/catalog behavior while new V2/V4 clients use price context.
- Quote/payment and print snapshots must remain immutable after reference changes.
- Existing Panel `69ee8799` plus old Storefront `c09d59a` must tolerate additive migrations before either app is replaced.

---

### Task 1: Exact source integration

**Files:** Existing source files changed only where Git conflicts require a narrow resolution. Add integration evidence in `docs/qa/reference-pricing-staging.md`.

**Interfaces:** Consumes PR #80 source `78e3c070` and running Panel source `69ee8799`; produces a single release branch commit and exact `RELEASE_SHA`.

- [ ] Verify PR heads, runtime image IDs, source pins, deployment IDs and branch ancestry with read-only Git/Coolify checks.
- [ ] On `codex/atlas-pricing-staging-release`, run `git merge --no-ff 69ee87990a53909968d64e4bc9f51d6be9e5f253`; resolve only the overlapping Panel access and contract tests if needed.
- [ ] Compare the merge result with both parents; verify design, domain, orders, catalog, barcode and pricing paths; run `git diff --check`.
- [ ] Record exact merge commit and source parents, not a GitHub synthetic merge ref.

### Task 2: Combined isolated verification and independent review

**Files:** Only narrow integration fixes and corresponding tests if Task 1 reveals a concrete conflict.

**Interfaces:** Consumes the merged source; produces test logs, app build artifacts and a review disposition bound to the final source.

- [ ] Copy the exact source to the authorized isolated Linux runner without env files or secrets; run contracts/data/Panel/Storefront suites, relevant typechecks, Panel/Storefront release builds and design preview tests once.
- [ ] Run the nine reference-pricing disposable PostgreSQL harnesses, including canonical old parser/repository, gate, migration/down, quote and print replay tests; do not connect to staging DB.
- [ ] Check diff/secret/scope; independently review the five Review Focus boundaries and fix any new Critical/Important issue with a focused regression before repeating only affected verification.
- [ ] Commit any narrow integration fix, rerun necessary checks, and record final `RELEASE_SHA` with exact pass/skip/failure evidence.

### Task 3: Staging migration and build-readiness preflight

**Files:** Feature-specific migration manifest/runner and tests only if no existing approved runner supports migrations 130–141; QA evidence records checksums and ledger.

**Interfaces:** Consumes final source, current staging DB metadata and verified backup; produces an explicit list of missing feature migrations and safe release readiness.

- [ ] Read the actual migration files/assertions and existing runner/ledger format; verify the staging database identity, owner authority, related tenant isolation and absence of concurrent migration.
- [ ] Verify a recent backup's success, digest/integrity and scratch restore method without exposing customer data or credentials.
- [ ] Compare exact migration checksums with ledger/object probes; run no SQL if checksum, prerequisite, backup or existing fixed-consumer compatibility checks fail.
- [ ] Generate/check exact-SHA PayTR and Iyzico build evidence under the authorized approval scope; do not invent a human attestation.

### Task 4: Controlled staging publication

**Files:** No repository source edits after final `RELEASE_SHA`.

**Interfaces:** Consumes Task 3 readiness; produces two verified deployment IDs, runtime SHA/image IDs and gate-OFF evidence.

- [ ] Preserve prior Panel/Storefront image IDs, SHA, deployment IDs, pins, hooks and relevant settings for rollback; reconfirm four OFF toggles and empty queue.
- [ ] Apply only missing feature migrations in dependency order, asserting each step and fixed-product compatibility; confirm gate OFF across stores.
- [ ] Pin/build/deploy Customer Panel then Storefront from `RELEASE_SHA` with matching `SOURCE_COMMIT` and approved build evidence; do not modify Owner/Worker.
- [ ] Verify each image/build/runtime SHA, health, domains, metadata, old replica drain, compatible API and relevant price-cache freshness; on critical regression restore affected old image/settings while leaving additive schema in place.

### Task 5: Read-only live acceptance and closeout

**Files:** `docs/qa/reference-pricing-staging.md` for non-sensitive evidence only.

**Interfaces:** Consumes verified staging release; produces separate deployment and read-only acceptance statuses.

- [ ] In the existing authorized Chrome session verify Güzide tenant/store ID, `/settings/pricing`, fixed-product list/detail/sort/filter, barcode old/new safe reads and any existing print snapshot without writing.
- [ ] Verify `/settings/design` sections, real catalog preview, toolbar and 1440/1024/390 access; retain the A03 comments limitation.
- [ ] Verify Storefront product/category/media/fixed prices and new/old domains, plus observed console/network errors; do not add cart/order/payment data.
- [ ] Record exact source/deployment/image/ledger/gate evidence and distinguish isolated tests from live acceptance. Leave gate OFF and both PRs draft/unmerged.
