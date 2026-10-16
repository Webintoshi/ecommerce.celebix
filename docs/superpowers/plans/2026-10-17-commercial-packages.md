# Commercial Packages Implementation Plan

> **For agentic workers:** Use focused parallel workers and one release owner. Execute the user-approved design without another deployment permission request.

**Goal:** Four real packages, one positive upgrade experience and the four requested store assignments.
**Architecture:** Immutable catalog + plan-ID native capability policies; compatible legacy DTO; centralized page/native gates; existing TOTP owner assignment.
**Tech Stack:** TypeScript, Next.js/React, native PostgreSQL, existing Coolify release tooling.
**Spec:** `docs/superpowers/specs/2026-10-17-commercial-packages-design.md`

## Global constraints

- Exactly the approved prices/quotas; Free monthly orders = 50.
- No business-record deletion or silent subscription extension/charge.
- Preserve owner signup/profile and four independent storefront/payment/native witnesses.
- Shared positive UI, role-before-plan decision, finite route/feature inputs, no feature-data loading for locked screens.
- Root alone changes live refs/pins/queues/native/assignments; no automatic effect replay.

## Review focus

Unknown plan/feature and spoofed inputs; stale sessions and role denial; concurrent quotas and payment callbacks; expiry/open-debt downgrade; duplicated upgrade requests and cross-tenant reads.

## Tasks

- [x] 1. Root: test-first shared `commercial-packages/catalog.ts` + exports. Exact IDs/prices/limits/capabilities, legacy compatibility and minimum package tests.
- [x] 2. Native worker: additive246 policies/seeds, narrow capability/quota/assignment guards and upgrade-request authority, DOWN/assertions/focused real PostgreSQL cases. Keep legacy shape and recovery. Independent review before install.
- [x] 3. UI worker: shared route model, lock metadata, common `/upgrade` and `/settings/plan` UI, central early guard; responsive/role tests and screenshot acceptance. Uses catalog interfaces from Task1.
- [x] 4. Root: authenticated plan-change request API/client and TOTP owner requests rendering; new-registration free v2 compatibility, preserve live owner13 paths. Focused HTTP/data/onboarding tests.
- [ ] 5. Review branch and run affected suites/typechecks/builds once; resolve concrete findings.
- [ ] 6. Release worker prepares exact sealed compatible native/owner/panel packet; Root installs, deploys serially, verifies real runtime/UI. Activate new registration default and assign four stores with exact CAS/expiry preservation; verify resulting rights and lock UI without business writes.

## Progress

- Fresh live read-only baseline captured; all targets pilot v1, capacities fit. No live effects executed.

- Shared production snapshot parser accepts exact Free v2 and preserved v1 replays; native release-controlled starter selector retains v1 until all four applications are accepted.
- Independent TS review completed; both discovered cross-layer omissions were fixed with regression tests. UI/native review corrected Free overview, atomic manual-sale contract, quota lock refresh and pending-sale downgrade recovery.
- Validation to date: five workspace typechecks; data1097 (4 integration skips), owner1025 (13 skips), focused UI122 and POS44, native23; final production builds and publication remain pending. The contract frozen export snapshot included pre-existing additive exports and was reconciled with zero removals.
