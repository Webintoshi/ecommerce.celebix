# Catalog Weight V1 implementation plan

1. Freeze parser behavior with anonymized real-format and adversarial unit tests.
2. Produce the exact read-only Güzide six-group manifest from running source 96764834.
3. Add admin-only store-profile/declaration/operation schema and tenant-authorized read/manual-save APIs.
4. Add workflow-only idempotent import and safe rollback functions.
5. Add strict repository/runtime/HTTP contracts and keep storefront DTOs unchanged.
6. Add a responsive, keyboard-safe product editor section driven only by the profile projection.
7. Rehearse migration and three-tenant isolation in disposable PostgreSQL; run focused and full suites.
8. Capture 1440/1024/390 fixture evidence, review the diff, push a draft PR, and report the exact
   staging release requirements without migrating or deploying shared staging.
