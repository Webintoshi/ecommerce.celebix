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

NET → SITE rollout completed for `3fb989171f52c485a3905fc80ee481cd68195339`. NET `b132ioe18x0t9zc228bbu75m` and SITE `srxi0rwgu2jj6eebwjae8arm` finished, both running sources and the final six-application/seven-alias checks passed, and the global queue is idle. Full configuration and all four owner/storefront witnesses were preserved; native225 remains unchanged.

The authenticated Chrome deletion modal for the reported promotion on `https://admin.guzidekuyumcu.com` now loads its impact, enables **Sil**, and clears the prior error. The client accepted the impact payload; raw HTTP status was not captured. No live deletion was submitted or performed during acceptance.

The initial prepublication check held on a missing shared release lock. Root inspected its absence, recreated the private lock without application changes or a deployment, and manually resumed the guarded check. The final kit was independently reviewed with no material findings.

Scoped checks and the production build passed. The full-suite limitation recorded above remains: 61 baseline failures plus 2 timing failures that passed in isolation without source edits.

Sanitized acceptance: [machine receipt](evidence/discount-delete-runtime/live-release-20261010.json), [release record](evidence/discount-delete-runtime/live-release-20261010.md).
