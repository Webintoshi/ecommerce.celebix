# Self-Serve Store Registry Model

Status: proposal only

The self-serve registry is the future authority for store identity, domains, memberships, onboarding state, provisioning jobs, and billing entitlements. This proposal does not replace the current `owner_stores` table yet.

## Tables

| Table | Purpose | Key constraints |
| --- | --- | --- |
| `stores` | Platform store authority and lifecycle state. | Unique `slug`; status check; provisioning status check. |
| `store_domains` | Platform and custom domain registry. | Unique `hostname`; one primary domain per store/type. |
| `store_memberships` | Store owner/admin/staff/support authorization. | Unique `store_id`, `principal_id`, `subject_type`, `role`. |
| `store_invitations` | Store staff/admin invitation flow. | Unique active token hash; email normalized. |
| `store_onboarding_sessions` | Draft wizard payload and current step. | One active onboarding session per principal/store draft. |
| `store_provisioning_jobs` | Durable provisioning queue. | Unique idempotency key; retry-safe status model. |
| `store_billing_accounts` | Trial, plan, and billing entitlement authority. | One active billing account per store. |

## Migration Relationship

Current `owner_stores` should be treated as the legacy owner control-plane store authority during migration. The new `stores` table should first mirror existing rows in read-only mode.

The safe sequence:

1. Add proposal and code models.
2. Add migration file but do not apply it.
3. Build read-only mirror importer.
4. Verify all current stores map to stable `store_id` values.
5. Move central panel read paths.
6. Move write paths only after parity.

## Security Notes

Store authorization must always be resolved from DB membership, never from request slug alone and never from Logto claim alone.

Custom domain activation must require ownership verification. A domain cannot be primary until verification is current and unique.

Provisioning jobs must include idempotency keys and must not rely on HTTP request lifetime.

Billing state must be checked server-side before enabling gated actions such as custom domain, payment activation, large product limits, and staff invitations.
