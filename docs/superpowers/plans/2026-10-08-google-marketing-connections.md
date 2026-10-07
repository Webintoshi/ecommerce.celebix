# Google Marketing Connections Implementation Plan
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.
**Goal:** Ship tenant-safe Google setup in the shared marketing area.
**Architecture:** Shared typed service and PostgreSQL persistence behind existing host/session authority; lazy client selection and controlled storefront public projection. Google credentials remain private; Google acceptance depends on actual central Cloud setup.
**Tech Stack:** Next.js, TypeScript, PostgreSQL, native fetch, existing AES authenticated encryption patterns.
**Spec:** docs/superpowers/specs/2026-10-08-google-marketing-connections-design.md
## Global Constraints
- /marketing/google; gtm, ads, search_console; no reports/custom code.
- Uygula/Vazgeç; store binding, expectedVersion, Idempotency-Key, support audit.
- Preserve active payment/stock/native analytics authority; exact NET->SITE rollout.
- No new heavyweight dependency or polling. No production fake finance/provider success.
## Review Focus
- Support expires while Google authorizes: revalidate before saving.
- Another actor/store reuses state/operation/resource: deny.
- Publish/verification succeeds but response disappears: same operation recovery.
- Old tags or new live version: preserve and prevent conflicting publication.
- Consent declines, pending order, repeat payment event: no unauthorized/double conversion.
## Task 1: typed provider service and persistence
Files: packages/saas-contracts/src/google-marketing/*, packages/saas-data/src/google-marketing/*, apps/owner/scripts/sql/saas additive migration.
- [x] Write and run failing validation/OAuth/provider/tenant/replay/idempotency tests.
- [x] Implement spec interfaces, encrypted persistence and bounded official Google APIs.
- [x] Verify source fixtures and PostgreSQL isolated assertions; report migration allocation.
## Task 2: marketing UI and navigation
Files: apps/customer-panel/components/google-marketing/*, app/marketing/google/page.tsx, nav/routes.
- [x] Record actions; add behavioral tests before code.
- [x] Implement lazy setup modal, account/resource choice, Uygula/Vazgeç, state preservation, retry.
- [x] Visual QA 1440/1024/390 and independent review.
## Task 3: public storefront and consent
Files: packages/saas-contracts/src/google-marketing storefront projection, shared loader/consent/adapter, shared page-context/proxy/layout.
- [x] Write failing consent/CSP/purchase-truth/isolation tests.
- [x] Implement conditional Google native loader and validated public projection.
- [x] Verify empty stores cause no additional external requests, paid purchase authority and CSP.
## Task 4: HTTP/runtime/integration and release
Files: apps/customer-panel/lib/google-marketing-http/*, server-google-marketing/*, API routes; runtime registration; ops docs.
- [x] Test host/session/origin/support/state/error redaction.
- [x] Wire real service and callback safe completion.
- [ ] Activate central Google OAuth after policy/credential authorization.
- [x] Typecheck/build affected apps; independent security review, address findings.
- [ ] Verify actual Cloud setup; ask for required account login only if missing while continuing code.
- [x] Stage migration + readers then admin NET->SITE; verify exact running sources and live software acceptance.


## Activation status
- Server routes and callback are wired; central OAuth is deliberately unconfigured pending Google data-policy/credential authorization.
- Code/transport fixtures are not real Google account acceptance. Google production verification and Ads project access remain external prerequisites.
- Independent review fixes: disconnect race cancellation, Ads destination gating, unpublished GTM version preservation, late captured-result proof reread.
- SQL220 and all four shared application deployments verified at `9dcdbd721a50390c18a00e90d45eaafe85cec907` on 2026-10-08. Authenticated Güzide UI shows the three cards with connections disabled while central OAuth remains unconfigured. No actual Google account/provider acceptance has been claimed.
