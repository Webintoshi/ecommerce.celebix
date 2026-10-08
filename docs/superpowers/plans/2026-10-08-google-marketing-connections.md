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
- [x] Activate central Google OAuth after policy/credential authorization.
- [x] Typecheck/build affected apps; independent security review, address findings.
- [x] Verify actual Cloud client, exact callback, four enabled APIs and saved scopes.
- [x] Accept Güzide's real Search Console OAuth grant, canonical site verification and sitemap submission.
- [ ] Complete Google brand/scope/Ads access and GTM/Ads source/measurement acceptance before general availability.
- [x] Stage migration + readers then admin NET->SITE; verify exact running sources and live software acceptance.


## Activation status
- Server routes and callback are wired; central OAuth is configured on both shared panels after the user's exact client/API/server-secret authorization.
- Code/transport fixtures are not real Google account acceptance. Google production verification and Ads project access remain external prerequisites.
- Independent review fixes: disconnect race cancellation, Ads destination gating, unpublished GTM version preservation, late captured-result proof reread.
- SQL220 and all four shared application deployments verified at `9dcdbd721a50390c18a00e90d45eaafe85cec907` on 2026-10-08. Central configuration activation reuses that source: panel NET `curylcef4zq4mxqhn32lmwus`, then SITE `d64uaff8c8c4dvdfap4il4v6`. Exact runtime/payment/keyring/configuration checks and four-store HTTP acceptance passed; global queues idle. Authenticated Güzide UI shows three enabled connection buttons.
- Actual Google Cloud state: **External / In production**, published through **Publish app → Confirm** on 2026-10-08 after the user's explicit action-time approval. Audience status and Back to testing button verified; private screenshot `google-in-production.jpg`. No merchant OAuth grant was given by the agent. Verification Center still requires verified/published branding before data-access review (Prepare for verification disabled); unapproved sensitive scopes still show a 100-user cap. Ads Test access remains the last observed Ads state. Existing public Celebix homepage/privacy/TOS URLs are saved; an accurate Google data-use addendum is prepared only as a private unpublished draft. That disconnected observation preceded the user’s later Güzide Search Console OAuth grant; current acceptance state is recorded below. Brand/scope/Ads production acceptance and real merchant/resource/measurement acceptance remain outstanding; no new server deployment or payment mutation was needed for the Cloud publishing change.

## Search Console response correction
- Actual Google META response was a complete tag; the original raw-token validator rejected it before checkpointing. Bound extraction now preserves only safe token content, with adversarial HTML/duplicate attribute/length regression cases. Existing checkpoint and same-operation retry remain intact.
- 38 targeted tests, package typecheck, shared panel production build and independent review passed. Candidate `e02b313068e47d7e79d689a4033fee6a1f0c2ea5` deployed to admin NET `tj4pknl69xk1t3pu9bzlx7m7`, then SITE `gpm1mfh6nuwcr82n8zkrhvn5`. Both storefronts and containers remained at9dc; exact payment/Google/keyring/runtime configuration preservation and all four tenant HTTP checks passed. Rollback rehearsal verified, final queue idle; no new SQL/env rows.
- Authenticated retry revealed SQL220's checkpoint precedence error after the provider response fix. SQL221 (`b9121c224e45f8ddc782a132f1e3ce6c2130f727`) changes only the parenthesized progress expression. Real isolated RED/GREEN/up-replay/down-RED/reapply-GREEN checkpoint/recovery/finalize/replay tests passed; all337 table data and function identities/authority stayed unchanged. The disposable cluster was stopped and discarded.
- Initial native dispatch stopped before SQL because a Coolify restart removed the ephemeral release lock. Original evidence was preserved; a separately reviewed recovery bound the restored lock, fresh complete configuration/native/runtime witnesses and exact committed SQL. The guarded native transaction succeeded with337 tables unchanged and1706 other function definitions unchanged. No app queue, source pin or environment rows changed.
- Güzide live acceptance completed after the user's exact ownership/sitemap authorization: actual Chrome shows Connected and Connection applied, operation `5f113d83-d655-4b65-8c2c-249a7e9d1787` complete/verified, connection version1, one apply event. Anonymous HTTP confirms200 homepage with exactly one matching verification META and200 sitemapindex. The official Google verification/site/sitemap calls completed successfully; indexing itself is asynchronous. GTM/Ads and general Google verification prerequisites remain outstanding.
