# Product-page Reviews Implementation Plan

> **For agentic workers:** Use subagent-driven-development for bounded independent tasks; root is sole publisher.

**Goal:** Collect moderated product-page reviews, independently enabled from Products → Reviews.

**Architecture:** Additive native274 + dedicated contracts/repository; same-origin authenticated storefront routes; one shared form; independent panel setting. Existing invitation and approved-display contracts remain unchanged.

**Tech Stack:** Next.js/React, TypeScript, PostgreSQL16, existing native auth.

**Spec:** docs/superpowers/specs/2026-10-24-product-page-reviews-design.md

## Global constraints
- Shared implementation; no tenant-specific branding or credentials.
- Default disabled; one Apply saves the real setting.
- Native274 is additive; frozen historical SQL and all current functions remain unchanged.
- No polling, email send or new dependencies.
- Exact candidate signup proof, affected panel/storefront builds and guarded serial publication.

## Review focus
- Disable between availability read and submit denies the new write.
- Lost response retries the same operation without duplicate reviews.
- An account cookie from another store or an incomplete/expired session cannot submit.
- Ordinary authenticated reviews never receive an unsupported verified-purchase claim.
- Loading/error states preserve entered content; mobile controls do not overflow.

## Tasks
1. [x] Native/data: failing disposable native tests; new settings/operations/submission attribution tables and four scoped RPCs; contracts and repository validation; focused green tests.
2. [x] Admin: independent settings component/client with pending/error/version behavior; runtime registration and GET/POST authenticated handlers; preserve existing actions; behavior and route tests.
3. [x] Storefront: credential adapter using existing account keyring; availability and submission routes; shared accessible form and per-theme placement; focused route/runtime/component tests.
4. [ ] Review: native security and compatibility review, 1440/1024/390 visual checks, short regressions and affected builds.
5. [ ] Release: refreshed source-bound signup proof committed with sources; additive native admission/apply, guarded shared storefront NET→SITE then panel NET→SITE, final running-source and live UI acceptance.
