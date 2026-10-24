# Guest-first Product Reviews Implementation Plan

> **For agentic workers:** Use the current root-led parallel implementation, with disjoint storage and UI files; root alone integrates and publishes. Steps use checkbox tracking.

**Goal:** Let customers write reviews before WhatsApp sign-in and preserve one explicit submission through sign-in.

**Architecture:** Keep native274 and the existing review API unchanged. A bounded origin/product/path-scoped sessionStorage draft bridges the shared review component and existing safe account return flow. An explicit operation UUID and phase distinguish authentication resumption from uncertain retries.

**Tech Stack:** React 19, Next.js 16, TypeScript, existing native review API and node:test/Mira browser harness. No dependencies added.

**Spec:** `docs/superpowers/specs/2026-10-24-review-submit-login-design.md`

## Global Constraints

- Existing product-form UI at d1ce must remain intact.
- Only the shared storefront, draft utility, focused tests and these docs change.
- Authentication and native moderation remain authoritative; browser storage is never proof of identity.
- Draft lifetime 30 minutes; max name/title/body 120/200/2000; star range 0–5 for editing and 1–5 for submission.
- No review text, OTP or phone in a URL; no polling or new dependencies.
- Root sole publisher; NET → SITE only, four unchanged panel/owner witnesses and the full installed native catalog.

## Review Focus

- Blocked storage must preserve the form and prevent a lossy redirect.
- Returning without authentication must not loop back into login automatically.
- StrictMode/remount and concurrent clicks must retain one explicit intent and exact operation UUID.
- Interrupted submission must restore a manual same-operation retry rather than send repeatedly.
- Disabled/expired/foreign-product drafts must not auto-submit.

### Task 1: Bounded browser draft

**Files:** Create `apps/storefront-shared/lib/reviews/product-page-draft.ts` and `.test.ts`.

**Interface:** `ProductReviewDraft` carries version1, productId, returnTo, savedAt, raw fields and nullable pending `{operationId, review, phase}`. Export `readProductReviewDraft`, `writeProductReviewDraft`, `clearProductReviewDraft` and `REVIEW_DRAFT_TTL_MS`; consume existing `ReviewSubmission` parsing.

- [x] Write and observe failing tests for round-trip, expiry/future data, foreign scope, invalid intent and storage failure/readback.
- [x] Implement the exact bounded interface with scoped invalid-data cleanup.
- [x] Run focused Node24 tests; expected all pass.

### Task 2: Guest form and login continuation

**Files:** Modify `components/ProductPageReviewForm.tsx`, `product-page-review-form.module.css`, `ProductPageReviewForm.behavior.test.ts` in the shared storefront.

**Interface:** Consume Task1 with existing availability GET, authenticated POST and `/account/login?returnTo=<safe pathname>`. Produce the shared guest-first form and one explicit resumed operation.

- [x] Write and observe failing real-component tests for guest fields, submit/no guest POST/login, authenticated return, cancelled login, uncertain refresh, blocked storage, disabled state and 401.
- [x] Implement form state transitions and compact responsive styling.
- [x] Run focused review + existing account auth/profile tests and storefront typecheck; expected no relevant failures.
- [x] Validate actual rendered guest fields/stars and transition on desktop/mobile; no real customer review needed for the isolated rehearsal.

### Task 3: Review and publish

- [x] Root review diff and focused evidence; one independent final code review of the completed change.
- [ ] Check exact source-bound signup proof; refresh on Node24/PG16 only if stale, then commit with sources.
- [ ] Official storefront build on exact committed candidate; verify required source proof again before queues.
- [ ] Fresh root six-app/native/ref/HTTPS/Dockerfile evidence and >=11 GiB capacity; separately reviewed bounded cache recovery only if required.
- [ ] Advance only the shared storefront ref under its exact lease; publish NET then SITE, accept each and verify four unchanged witnesses/full native catalog.
- [ ] Confirm live guest form/stars on a real product, with the setting restored to its original state after reversible checks; report what was tested and any limits.
