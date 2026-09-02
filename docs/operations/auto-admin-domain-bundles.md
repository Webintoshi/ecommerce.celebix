# Automatic admin domain bundles

The native Cloudflare for SaaS custom-hostname path is sufficient for both purposes. No Worker is required: Cloudflare terminates each exact custom hostname, the storefront and Customer Panel runtimes already resolve exact host authority, and the central Logto callback returns only to an active allow-listed admin hostname.

Required configuration is purpose-specific:

- `CELEBIX_CUSTOM_DOMAIN_CNAME_TARGET` routes storefront hostnames (for example the staging shops target).
- `CELEBIX_CUSTOM_ADMIN_DOMAIN_CNAME_TARGET` routes managed admin companions (for example the staging customers target).
- Customer Panel creation and the Owner reconciliation worker require those targets to be distinct and validate both against the reserved platform suffix policy.
- Cloudflare zone/token and reserved-suffix settings remain shared and least-privileged.

Rollout order is backup/restore verification, migration 121, assertions, backfill dry-run, reviewed backfill apply, Owner reconciler, then Customer Panel deploy. External customer DNS is never mutated. Code rollback leaves adopted/created rows and both platform fallback hostnames in place; the down migration is emergency/pre-restore only.
