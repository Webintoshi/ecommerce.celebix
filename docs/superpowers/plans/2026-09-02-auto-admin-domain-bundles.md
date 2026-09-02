# Automatic Admin Domain Bundles — Implementation Plan

1. Add failing domain-core tests for safe URL normalization and public-suffix admin derivation; implement the minimal normalizer/deriver.
2. Add contract and data validation tests for managed admin linkage; extend the additive projection fields.
3. Add failing bundle-service tests for atomic prepare, independent provider binding, replay, partial failure, and paired lifecycle; implement the service ports.
4. Add migration 121 up/down/assertions, manifest/static tests, and a disposable PostgreSQL harness covering adoption, uniqueness, tenant isolation, old/new compatibility, and code-only rollback.
5. Add a dry-run-first owner backfill CLI and behavior tests; keep apply owner-only and audited.
6. Wire Customer Panel runtime with separate storefront/admin CNAME configuration and independent provider calls; make merchant admin collection POST fail closed.
7. Add frontend behavior tests; replace the manual admin form with a responsive bundle UI and technical recovery disclosure.
8. Run targeted tests after each red/green cycle, then all five test/typecheck workspaces, two builds, Phase 3 current/base comparison, and `git diff --check`.
9. Run independent review, resolve all Critical/Important findings, create logical commits, push, open the requested PR, and merge with a merge commit.
10. Take and verify a staging backup, apply migration-first, run adoption, deploy exact merge SHA, then verify Güzide browser/network/responsive behavior and a controlled second tenant or report the single external QA-domain blocker.
