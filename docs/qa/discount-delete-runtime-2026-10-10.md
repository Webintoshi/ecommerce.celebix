# Discount deletion runtime follow-up — 2026-10-10

## Reproduced failure

The authenticated Güzide discount console reproduced the reported failure: opening the deletion confirmation for `ATLAS-QA-INFLUENCER-20260906` displayed an operation error and left **Sil** disabled. No merchant record was deleted during reproduction.

The PostgreSQL promotion repository supplied `deletionImpact` and `delete`, but the registered server runtime facade copied only the older required methods and optional `apply`. Consequently the HTTP handler received neither deletion method and returned `503 promotion_unavailable` before any database call. The previous isolated SQL and compiled-route checks did not cover this registration boundary.

## Narrow correction

- Preserve, validate and bind the optional `apply`, `deletionImpact` and `delete` methods when constructing the server facade.
- Invalidate the shared promotions namespace after a successful, committed deletion; failure does not rotate the namespace.
- Include the existing native225 deletion table and exact callable functions in the database readiness check.

No database migration, payment provider change, worker setting or storefront change is introduced.

## Verification before rollout

- Regression tests reproduced the omission before the fix: 5 expected failures among 16 tests.
- Scoped server runtime, authenticated HTTP, cache and PostgreSQL readiness checks: **59 passed, 0 failed**.
- TypeScript check and whitespace check: passed.
- Independent review of the six source/test files: passed with no material finding.
- One full panel suite run: 2,357 tests, 2,293 passed, 63 failed, 1 skipped. All 61 known baseline failure names remain. The two additional timing failures passed independently without source changes. The chained second suite was not reached; the affected server tests were run separately in the scoped checks. This is not a clean full-suite result.

## Live acceptance

NET → SITE rollout, running-source verification and a fresh authenticated deletion-impact check will be recorded in the follow-up acceptance receipt. The current source candidate does not claim that a merchant promotion has been permanently deleted.
