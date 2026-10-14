# Google Merchant Implementation Plan

> For agentic workers: use subagent-driven development for disjoint implementation tasks and one scoped final review. User requested short targeted checks.

**Goal:** Add a working tenant-isolated Google Merchant product connection to the shared Pazaryeri area.
**Architecture:** Reuse native Google OAuth and credentials. Dedicated native catalog projection and coalescing queue feed a bounded Merchant API worker; panel reads local state.
**Tech Stack:** Next.js/React, TypeScript, PostgreSQL native saas functions, existing Node worker runtime, Google Merchant API v1.
**Spec:** ../specs/2026-10-14-google-merchant-design.md

## Global Constraints
- Shared apps/customer-panel and apps/storefront-shared; no per-store legacy admin exports.
- Merchant API v1 only, own account/source/domain, no automatic claim transfer or fabricated identifiers.
- Stable variant IDs; public effective price/stock; exclude continuously indexed prices.
- Durable generation/lease guarded jobs and bounded retry; existing transactions never wait for Google.
- No browser polling, token exposure, customer export or false approved status.
- Existing Google GTM/Ads/Search Console behavior preserved.
- Root alone applies migrations, commits and deploys NET → SITE. No agent commits.

## Review Focus
- Other tenant account/domain and stale job credentials cannot be used.
- Timeout/unknown result and disconnect during job do not falsely complete/reconnect.
- Internal barcode, variant mismatch, missing public price are rejected rather than invented.
- Only actual Google status proves approval; changed/removed products converge.
- Missing Google registration and scope are actionable configuration failures, not app outages.

## Task 1 — Native data and queue (agent)
- [x] Implement new packages/saas-data/src/google-merchant repository/types/errors and matching contracts exports.
- [x] Migration 202610140230 extends native Google service compatibility and adds secure Merchant state/product queue/projection functions.
- [x] Provide panel methods overview, products (cursor/limit), sync (idempotent enqueue), and worker claim/finish/retry/refresh boundaries. Coordinate exact TypeScript signatures immediately with root/UI.
- [x] Use existing native catalog authority/public price resolver; enqueue/coalesce on relevant catalog/inventory mutation, periodic renewal and deletion. Preserve roles/ACLs; short SQL transactional rehearsal and targeted TS tests.

## Task 2 — Google OAuth/account setup (agent)
- [x] Add merchant service/scope to Google contracts/provider/repository and native compatibility coordination.
- [x] List only authorized Merchant accounts; select validated numeric account; verify own homepage without overwriting foreign claim; create/reuse only owned API source with durable checkpoints.
- [x] Add Merchant-specific errors and trusted callback destination /marketplaces/google-merchant while preserving old services.
- [x] Provide dedicated provider methods for standard product insert/update/delete/get, status, with fixed Google endpoints and bounded timeouts. Coordinate exact signatures with root.
- [x] Run scoped provider/Google contract checks, no account changes or deployment.

## Task 3 — Marketplace UI (agent)
- [x] Add /marketplaces/google-merchant page and Merchant card to existing marketplace screen, preserving other marketplace console.
- [x] Reuse Google connection UI where safe with explicit service filter; add brand logo, account selection/create-account guidance, domain/setup errors and product status/preflight table.
- [x] Use Task1 overview/products/sync endpoints; no polling; refresh button, safe retries, retained input, clear submitted vs approved statuses.
- [x] Run only new UI/client behavior checks; no deploy or commits.

## Task 4 — Integrate and release (root)
- [x] Implement authenticated merchant HTTP routes and server runtime registration using existing origin/session/role/idempotency boundaries.
- [x] Wire bounded durable worker into existing deployed worker runtime, with encrypted credential refresh, quota backoff and Google status reconciliation.
- [x] Ensure variant-specific shared storefront landing and structured data are truthful; add missing safe query selection if needed.
- [ ] Scoped independent review, TypeScript and affected build. Apply compatible SQL safely, deploy shared apps NET → SITE and verify running source/live page.
- [ ] Report code/release completion separately from Google's external account/approval requirements; do not send live product data under a new user's account without their OAuth/Apply action.
