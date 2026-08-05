# Order Lifecycle Transactional Email Design

**Date:** 2026-08-05
**Status:** User-approved section by section; awaiting written-spec review
**Scope:** Every Celebix store and every durable order path, beginning with Güzide Kuyumcu staging

## Objective

Add a reliable, store-branded email layer to the existing PostgreSQL order lifecycle. A committed order or lifecycle transition must create its email work in the same database transaction, while email-provider downtime must never undo or delay the commerce transaction.

The first release is deliberately email-only. SMS and WhatsApp are separate future channels; this design does not add dormant provider credentials, channel selectors, or unfinished UI for them.

## Current Authority

Celebix already has the durable commerce authority required by this feature:

- `saas.orders`, `saas.order_items`, and `saas.order_events` are store-scoped PostgreSQL records;
- order states are `pending`, `confirmed`, `preparing`, `shipped`, `delivered`, `cancelled`, and `refunded`;
- payment states are `pending`, `processing`, `completed`, `failed`, and `refunded`;
- carrier, tracking number, tracking URL, and shipment time are already part of the order contract;
- checkout settlement, quick-order settlement, manual order conversion, inventory changes, and order events already commit atomically;
- merchant-admin transitions are versioned and idempotent through `saas.order_operations`;
- the platform already sends storefront sign-in mail through a central Resend account, but there is no general order-email outbox or order-delivery worker.

PostgreSQL remains the only order, tenant, recipient, and lifecycle authority. The browser and Resend are never allowed to decide which store or order a notification belongs to.

## Product Decisions

1. Celebix operates one central Resend account and one verified Celebix transactional sender domain.
2. A merchant never enters a Resend key, SMTP password, or provider secret.
3. A store controls only its visible sender label, reply-to address, merchant new-order alert toggle, and merchant notification address.
4. Customer transactional messages cannot be disabled by the merchant.
5. Merchant new-order alerts can be disabled.
6. The `preparing` state does not generate customer mail.
7. Existing historical orders are not backfilled when the feature is deployed.
8. `manual_import` orders never generate mail. New `manual` orders may notify the customer but do not alert the merchant who created them.
9. Email acceptance or failure never changes order, payment, stock, reservation, or refund state.
10. Templates contain no marketing tracking pixel and no open/click tracking dependency.

## Selected Architecture

Use a PostgreSQL transactional outbox with a leased worker in the owner service.

```text
checkout / provider webhook / admin transition
                    |
                    v
        PostgreSQL commerce transaction
      order + stock + order_event + outbox row
                    |
                 COMMIT
                    |
                    v
       owner order-email worker claims lease
                    |
        bounded SQL projection + sealed snapshot
                    |
                    v
          Resend POST /emails with one key
                    |
                    v
 signed webhook -> provider event receipt -> status
```

The application never sends an order email inline with checkout, payment webhook handling, or an admin status mutation. Those paths only create durable outbox work. The worker performs external I/O after the commerce transaction has committed.

## Notification Matrix

### Customer messages

| Logical event | Trigger | Required content |
| --- | --- | --- |
| `order_received` | A new non-import order commits | Order number, item summary, totals, delivery summary |
| `payment_completed` | Payment first reaches `completed` | Order number, paid total, payment confirmation |
| `order_shipped` | Order first reaches `shipped` | Order number, carrier and tracking when present |
| `order_delivered` | Order first reaches `delivered` | Order number and delivery confirmation |
| `order_cancelled` | Order first reaches `cancelled` | Order number and cancellation state |
| `refund_completed` | Payment first reaches `refunded` | Order number and refunded total |

`confirmed`, `preparing`, `processing`, and `failed` do not send customer mail. An order-status transition to `refunded` does not by itself claim that money was refunded; `refund_completed` is created only by the authoritative payment refund transition. The unique logical event key still protects against payment-webhook replay and duplicate admin operations.

If an order is created already paid, its creation transaction enqueues both `order_received` and `payment_completed`. Each is a separate, intentional message.

### Merchant messages

| Logical event | Trigger | Required content |
| --- | --- | --- |
| `merchant_new_order` | A new `storefront`, `quick_link`, or `marketplace` order commits | Order number, customer display name, total, authenticated admin detail link |

The alert is omitted when `orderNotificationsEnabled` is false or `notificationEmail` is absent. `manual` and `manual_import` sources never create this alert.

## Durable Data Model

### `saas.order_email_deliveries`

One row represents one logical recipient/message pair.

- `id uuid primary key`
- `store_id uuid not null`
- `order_id uuid not null`
- `order_event_id uuid not null`
- `event_type text not null` constrained to the seven logical events above
- `recipient_kind text not null` constrained to `customer` or `merchant`
- `template_version integer not null default 1`
- `status text not null` constrained to `pending`, `leased`, `accepted`, `delivered`, `delayed`, `failed`, `bounced`, `complained`, or `suppressed`
- `attempt_count integer not null default 0` constrained to `0..8`
- `next_attempt_at timestamptz not null`
- `lease_id uuid`, `lease_owner text`, `lease_expires_at timestamptz`
- `idempotency_key text not null` with a fixed, bounded format
- `first_attempt_at timestamptz`, `idempotency_expires_at timestamptz`
- `seal_key_id text`, `sealed_request bytea`, `request_digest char(64)`
- `recipient_digest char(64)`, `recipient_mask text`
- `provider_message_id text`
- `last_error_code text`, `last_error_retryable boolean`
- `accepted_at`, `delivered_at`, `provider_event_at`, `failed_at timestamptz`
- `created_at`, `updated_at timestamptz not null`
- unique `(store_id, order_id, event_type, recipient_kind)`
- unique non-null `provider_message_id`
- composite same-store foreign keys to the order and originating order event

The row contains no plaintext recipient address, order payload, rendered HTML, or provider response. Before the first provider call, the worker reads one bounded server-side projection, renders the exact HTML/plain-text request, then encrypts and authenticates that request into `sealed_request`. Every retry decrypts the same snapshot. This prevents a branding, tracking, address, or order change from producing a different request under the same Resend idempotency key.

The idempotency key is exactly `order-email/v1/{delivery-id}`. `first_attempt_at` and `idempotency_expires_at=first_attempt_at + 24 hours` are written immediately before the first provider request, not when the outbox row is created. A job may therefore remain safely pending while the worker is disabled. Once the first provider attempt has occurred, the worker never sends that delivery after the stored safety window expires.

`request_digest` detects accidental mutation. `recipient_digest` supports equality diagnostics without exposing the address. `recipient_mask` is the only recipient representation available to the merchant UI.

The sealed-request keyring is server-only and versioned. The active key ID is stored per row so older pending deliveries remain decryptable during key rotation. Removing a retired key is forbidden while a delivery references it.

### `saas.order_email_provider_events`

Webhook deliveries are stored as a small, PII-free receipt ledger:

- `provider_event_id text primary key`, populated from the verified `svix-id` header;
- `provider_message_id text not null`;
- `delivery_id uuid` when reconciliation succeeds;
- `event_type text not null` constrained to the accepted Resend email events;
- `occurred_at`, `received_at timestamptz not null`;
- `safe_reason_code text` when the event supplies a mappable finite reason.

The raw webhook body, recipient arrays, subject, sender, headers, and provider diagnostic text are never stored. An event that arrives before the worker records `provider_message_id` remains safely unmatched and is reconciled when acceptance is committed. Replayed webhooks are harmless because `provider_event_id` is unique.

### Settings extension

Extend `notification_setting` with:

- `orderNotificationsEnabled boolean`;
- `notificationEmail email`;
- existing `senderLabel`;
- existing `replyToEmail`.

Existing `emailEnabled`, `smsEnabled`, and `pushEnabled` fields remain readable for compatibility but are not authority for customer transactional email. For existing stores, migration derives merchant-alert defaults deterministically: `orderNotificationsEnabled=true` only when the previous `emailEnabled` is true and a valid `replyToEmail` exists; that address becomes `notificationEmail`. Otherwise the alert starts disabled. New-store onboarding seeds `notificationEmail` from the verified owner email and enables the alert.

## Transactional Enqueue Contract

Introduce one private PostgreSQL helper that inserts eligible delivery rows using deterministic IDs and `ON CONFLICT DO NOTHING`. It is callable only from reviewed commerce functions, not directly by the application role.

The helper is integrated into every current order-creation and lifecycle authority:

- storefront checkout settlement;
- quick-order checkout settlement;
- payment-provider settlement and refund processing;
- manual order conversion;
- `orders_transition_status`;
- `orders_transition_payment`.

Order, stock/reservation changes, immutable `order_event`, operation receipt, and eligible delivery rows commit together. Provider availability is irrelevant to this transaction because no network request occurs here.

All paths pass the real originating `order_event_id`. The delivery uniqueness constraint is the final duplicate barrier, so provider webhook replay, an unknown database commit, repeated admin operation IDs, or worker restarts cannot create a second logical email.

The helper applies source rules:

- `manual_import`: no delivery rows;
- `manual`: customer lifecycle rows only;
- `storefront`, `quick_link`, `marketplace`: customer rows plus the optional merchant new-order row.

## Worker Contract

The owner service starts the worker from its server instrumentation only when all required configuration is valid. Multiple instances may run; PostgreSQL leases serialize each delivery.

1. Poll every five seconds while enabled.
2. Claim at most 25 due rows with `FOR UPDATE SKIP LOCKED` through a `SECURITY DEFINER` workflow function.
3. Give each claim a 90-second lease.
4. On first claim, read the tenant-bound order, item, settings, published branding, storefront host, and recipient projection; validate it; render HTML and plain text; seal the exact request; and persist its digest before sending.
5. POST the request to Resend with the stored idempotency key.
6. On a successful API response, persist `provider_message_id`, clear the lease, and set `accepted`.
7. On a retryable response, clear the lease, set `failed` with `last_error_retryable=true`, and schedule the next attempt.
8. On a permanent response or the eighth failed attempt, clear the lease and set `failed` with a finite safe code.

The worker uses a workflow database role with execute permission only on its claim, snapshot, outcome, and recovery functions. It has no direct table privileges and cannot claim another tenant through caller-supplied store authority.

### Retry schedule

The request attempt limit is eight. After attempts 1 through 7 fail, the next attempt is scheduled after:

1. 30 seconds;
2. 2 minutes;
3. 10 minutes;
4. 1 hour;
5. 3 hours;
6. 6 hours;
7. 12 hours.

The cumulative window stays below Resend's documented 24-hour idempotency retention. Network errors, timeouts, HTTP `429`, HTTP `500`, and `concurrent_idempotent_requests` are retryable. A due retry whose idempotency window has expired becomes terminal `idempotency_window_expired` without another provider request. Invalid credentials, unverified sender domain, invalid recipient/request data, and other non-concurrent `4xx` responses are permanent. `invalid_idempotent_request` is terminal because it proves a programming or snapshot-integrity fault.

The admin **Tekrar dene** action is shown only while `status=failed`, `last_error_retryable=true`, `attempt_count<8`, and the original `idempotency_expires_at` has not passed. It moves the already scheduled attempt to the present; it does not reset the count, create a ninth attempt, change the sealed request, or invent a new logical delivery. After the eighth attempt or the 24-hour safety window, the UI shows the terminal state without a send action.

## Resend Boundary

The provider request uses:

- the central server-only API key;
- a verified technical address such as `siparis@notify.celebix.co`;
- the sanitized store name as the visible display name;
- the store's validated `replyToEmail` as `Reply-To` when present;
- the persisted idempotency key in the `Idempotency-Key` header;
- one recipient per request;
- HTML and plain-text bodies generated from the same typed template input.

The official Resend documentation states that `POST /emails` accepts idempotency keys, retains them for 24 hours, and returns the original result for an identical retry: <https://resend.com/docs/dashboard/emails/idempotency-keys>.

Runtime configuration is explicit:

- `CELEBIX_ORDER_EMAIL_WORKER_ENABLED`;
- `CELEBIX_ORDER_EMAIL_DELIVERY_MODE=disabled|test|live`;
- `CELEBIX_ORDER_EMAIL_RESEND_API_KEY`;
- `CELEBIX_ORDER_EMAIL_FROM`;
- `CELEBIX_ORDER_EMAIL_RESEND_WEBHOOK_SECRET`;
- `CELEBIX_ORDER_EMAIL_PAYLOAD_KEYRING`;
- `CELEBIX_ORDER_EMAIL_ACTIVE_KEY_ID`;
- `CELEBIX_ORDER_EMAIL_TEST_RECIPIENT`, required only in test mode.

In `test` mode the worker replaces every actual recipient with the one controlled test address before sealing and prefixes the subject with `[TEST]`. No real customer or merchant address is transmitted to Resend. `disabled` mode leaves durable jobs pending. `live` mode uses the authorized recipient projection.

## Webhook Contract

The public route is `POST /api/webhooks/resend/order-email` in the owner application. It reads the raw request body and verifies it with the Resend webhook signing secret plus `svix-id`, `svix-timestamp`, and `svix-signature`. Parsed-then-reserialized JSON is forbidden because it breaks signature verification. Resend documents this exact requirement at <https://resend.com/docs/webhooks/verify-webhooks-requests>.

After verification, only these event types are accepted:

- `email.sent` -> `accepted`;
- `email.delivered` -> `delivered`;
- `email.delivery_delayed` -> `delayed` unless a later terminal/delivered state already exists;
- `email.failed` -> `failed`;
- `email.bounced` -> `bounced`;
- `email.complained` -> `complained`;
- `email.suppressed` -> `suppressed`.

Open and click events are neither subscribed to nor stored. The official event definitions are at <https://resend.com/docs/webhooks/event-types>.

State application is monotonic. `complained`, `bounced`, `suppressed`, and provider `failed` are terminal. `delayed` cannot downgrade `delivered`; `sent` cannot downgrade any later state. No automatic resend occurs after the provider accepted a message, or after bounce, complaint, suppression, or provider failure.

Invalid signatures return `400`. A verified duplicate returns `200` without another mutation. A verified supported event is durably recorded before returning `200`; database unavailability returns `503`, allowing Resend's webhook retry behavior to recover it.

## Template and Branding Contract

All stores use the same accessible layout and typed template components. The variable layer contains:

- published store logo, falling back to a text store name;
- store display name;
- published primary color, constrained for readable contrast;
- reply-to/support address;
- public order number, immutable item facts, currency, and totals;
- delivery summary and tracking only when relevant;
- one safe call-to-action URL.

Customer links use the store's active verified custom domain when available and otherwise its Celebix starter hostname. If the order is linked to a storefront account, the link uses the public account-order reference. Otherwise it points to the passwordless account entry with a same-origin account-orders return path. Database order IDs, tenant IDs, receipt credentials, and admin tokens never enter customer mail.

Merchant links use the authenticated per-store admin hostname and order-detail route. They may contain the order UUID because that route is protected and re-authorizes store membership; the UUID is never treated as authority.

Every dynamic value is escaped. URLs are generated from server-owned hostname and path projections, not raw template text. The logo must be an approved public R2 asset. Remote CSS, scripts, forms, tracking pixels, arbitrary HTML, and merchant-supplied subject markup are forbidden.

## Admin Experience

### Order detail

Add a compact **Bildirimler** section to the existing order detail. It contains only:

- Turkish message label;
- masked recipient;
- status;
- latest meaningful time;
- **Tekrar dene** only when the safe retry contract allows it.

The section is a quiet table/timeline integrated into the open-canvas order detail, not a new boxed dashboard. It exposes no provider IDs, internal attempts, raw errors, API credentials, or email body.

### Settings

The notification settings page contains:

- **Yeni sipariş e-postası** toggle;
- **Bildirim adresi**;
- **Gönderici adı**;
- **Yanıt adresi**.

It does not show Resend, SMTP, webhook, queue, SMS, WhatsApp, or infrastructure settings. Validation is immediate and Turkish. Saving affects future jobs only; already sealed jobs remain immutable.

## Security and Privacy

- All store/order authority is derived inside PostgreSQL from authenticated server context or trusted worker functions.
- Public requests cannot provide `store_id`, `tenant_id`, `order_id`, delivery IDs, provider IDs, or database URLs as authority.
- API key, signing secret, encryption keyring, and sender address remain server-only Coolify secrets.
- Database connections require verified TLS in staging and production.
- Logs contain only correlation ID, delivery ID, finite event/error code, attempt number, and duration.
- Logs and metrics never contain raw email, customer name, address, phone, order contents, subject, HTML, provider body, API key, or decrypted snapshot.
- Provider webhook bodies are verified before parsing and are not logged or persisted.
- Admin retry requires the same store membership and order-management permission as the order detail.
- Customer transactional messages are operational mail and contain no marketing consent assumption.

## Failure Behavior

- Resend outage: commerce commits; delivery remains retryable.
- Worker stopped: commerce commits; pending rows accumulate and resume later.
- Worker crash after claim: lease expires and another worker resumes the same sealed request.
- Worker crash after Resend acceptance but before database acknowledgement: the same idempotency key is retried inside its 24-hour window, preventing a second send.
- Database unavailable to checkout: existing commerce fail-closed behavior remains; the system never pretends an order committed.
- Database unavailable only to the worker: no provider request is made without a durable claim/snapshot.
- Invalid recipient: delivery becomes `failed` with `recipient_invalid`; order remains valid.
- Invalid provider configuration: affected deliveries fail with a safe configuration code; secrets and provider text stay hidden.
- Bounce, complaint, or suppression: terminal state, no automatic resend.
- Unknown or unsupported verified webhook event: acknowledge with `200` and record nothing.

## Testing Strategy

### Contract and unit tests

- exact logical-event mapping and source eligibility;
- deterministic delivery ID, uniqueness key, and Resend idempotency key;
- template HTML escaping, plain-text parity, URL allowlisting, and contrast fallback;
- sealed-request encryption, authentication, digest verification, and key rotation;
- retry classification and exact eight-attempt schedule;
- monotonic provider-event state reducer;
- PII-free log and admin projection.

### PostgreSQL 16 integration tests

- migration up, assertions, manifest registration, and guarded down behavior;
- outbox row commits with order/event/stock settlement and rolls back with that transaction;
- duplicate payment webhook, unknown commit recovery, repeated operation ID, and concurrent transition create one logical delivery;
- order/payment transition matrix creates exactly the approved messages and none for `preparing`;
- `manual_import`, `manual`, and ordinary source rules;
- Store A cannot claim, read, retry, or correlate Store B deliveries;
- lease expiry, competing workers, snapshot CAS, provider-event replay, early-webhook reconciliation, and manual retry window;
- existing inventory reservation, decrement, cancellation restoration, and refund behavior are unchanged.

### HTTP and component tests

- raw-body signature verification with the three Svix headers;
- invalid signature, duplicate webhook, supported event, unsupported event, and database-unavailable response codes;
- order-detail notification projection and authorized retry;
- notification-settings validation, compatibility migration, and future-job-only behavior;
- no public response contains raw provider or tenant authority.

### Staging acceptance

1. Deploy migration with worker disabled.
2. Deploy application and verify health/build/runtime contracts.
3. Configure the central Resend key, verified sender, webhook signing secret, and payload keyring in Coolify.
4. Run Güzide Kuyumcu in `test` mode with one controlled recipient.
5. Exercise order received, paid, shipped with tracking, delivered, cancelled, refunded, merchant alert, provider retry, and webhook replay.
6. Confirm every message uses Güzide branding while every recipient is the controlled test address.
7. Confirm order detail displays the correct masked delivery history and no secret/PII appears in logs.
8. Enable `live` mode only after the complete gate passes.

## Deployment and Rollback

Release order is migration, application, provider webhook configuration, test-mode verification, then worker/live enablement. Enabling the worker before schema and secret validation is prohibited.

The migration is additive. Deployment creates no jobs for historical events. Application rollback first disables the worker and webhook mutations, leaving outbox rows durable. Database rollback is allowed only when no delivery rows or provider-event receipts exist; otherwise the down migration stops with a clear guard. Existing order, payment, stock, customer, account, checkout, Logto, R2, domain, and storefront data are never deleted.

## Out of Scope

- SMS, WhatsApp, push notifications, and merchant-supplied provider accounts;
- marketing campaigns, abandoned-cart campaigns, newsletters, and promotional consent;
- arbitrary merchant HTML or per-store template builders;
- attachments and invoices;
- multilingual templates beyond the current Turkish storefront locale;
- retroactive sending for historical order events;
- customer controls that disable required transactional order mail.

## Acceptance Criteria

The feature is accepted when every new eligible order and approved lifecycle transition creates exactly one durable store-scoped email job in its commerce transaction; the worker sends the exact sealed branded request through the central Resend account without duplicate delivery; signed provider events update a visible, PII-safe admin history; merchant new-order alerts respect their setting; and checkout, payment, order, stock, refund, account, and tenant-isolation regressions all pass while Resend is both available and unavailable.
