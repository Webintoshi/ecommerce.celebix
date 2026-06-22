# Abandoned Cart Common Rollout

This runbook documents the shared abandoned cart contract for light_postgres stores.

## Runtime Contract

- Storefront public API write endpoints accept cart tracking payloads only.
- `GET /api/abandoned-carts` remains disabled for public storefront traffic and returns `405` with `abandoned_cart_public_read_disabled`.
- Public `POST`, `PATCH`, and `DELETE` responses must not include raw customer name, email, phone, or session identifiers.
- Admin API returns full customer contact data only after authenticated `super_admin` authorization.
- Umami and other analytics payloads must not include raw name, email, phone, or session tokens.

## Payload Aliases

The common route normalizes these aliases before persistence:

- Name: `customerName`, `customer_name`, `name`, `firstName` + `lastName`, `billingFirstName` + `billingLastName`.
- Email: `customerEmail`, `customer_email`, `email`, `billingEmail`.
- Phone: `customerPhone`, `customer_phone`, `phone`, `billingPhone`.
- Lookup: `cartId`, `cart_id`, `sessionId`, `session_id`, `customerId`, `customer_id`, `email`.

## New Store Provisioning

`apps/owner/lib/light-postgres-provisioning.ts` is the canonical new-store bootstrap source. It now:

- Creates `public.abandoned_carts` idempotently inside `buildLightPostgresSchemaSql()`.
- Adds `abandoned_carts` to `LIGHT_POSTGRES_REQUIRED_TABLES`.
- Creates indexes for `store_slug`, `cart_id`, `session_id`, `customer_id`, `email`, `status`, and `last_activity_at`.
- Adds an update trigger using `public.celebix_set_updated_at()`.

The mirror SQL file at `apps/owner/scripts/sql/light-postgres-abandoned-carts.sql` is for review/runbook use and controlled backfill planning only.

## Existing Store Backfill

Do not run a platform-wide live migration from this branch. Existing tenants must be reviewed individually, then the idempotent SQL can be applied through an approved rollout window.

Minimum live acceptance per tenant:

- Public GET returns `405`.
- Public no-Origin POST returns `403` when origin enforcement is active.
- Public valid POST/PATCH returns `200` and stays PII-free.
- Authenticated `super_admin` admin API shows full name/email/phone.
- Admin UI lists the test cart with product, total, status, and contact data.
- Test record is soft-cleared after verification.

## Privacy Notes

- Raw PII is restricted to authorized admin UI/API.
- Public storefront responses are sanitized.
- Analytics events must remain PII-free.
- Store owner privacy/KVKK notices must cover abandoned cart processing and recovery use cases.
