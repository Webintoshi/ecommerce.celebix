# Storefront Customer Identity Design

**Date:** 2026-08-04  
**Status:** Approved for implementation  
**Scope:** Shared Celebix storefronts, beginning with Güzide Kuyumcu staging

## Objective

Add durable, store-scoped customer accounts to every Celebix storefront without coupling shoppers to merchant-admin Logto identities and without making account creation a checkout requirement.

The first release provides passwordless email-code registration and sign-in, order history and detail, saved addresses, profile data, synchronized favorites, device sessions, and safe claim of historical guest orders.

## Current State

The shared storefront has no durable shopper login. Checkout creates or reuses a `saas.customers` record and writes a 30-day `__Host-celebix_customer` credential. `/account` can list receipts associated with that credential only in the same browser. Clearing cookies or changing devices removes that access.

Merchant admins use Logto through the customer-panel. That authority remains completely separate from shopper identity.

## Product Decisions

1. A customer account belongs to exactly one store.
2. The same email may create independent accounts in multiple stores.
3. Registration and sign-in are one passwordless flow using a six-digit email code.
4. Guest checkout remains available and must continue working if account auth is disabled or temporarily unavailable.
5. After email verification, historical guest orders with the same normalized email in the same store are linked to the account.
6. The first release includes orders, addresses, profile, favorites, device sessions, current-device logout, and all-device logout.
7. Returns, loyalty points, rewards, and social login are outside this release.

## Selected Architecture

Build a dedicated Celebix Storefront Identity boundary on shared PostgreSQL. Do not use the merchant-admin Logto application, a global shopper identity, Supabase Auth, or one identity-provider tenant per store.

Every public request resolves `store_id` from the trusted storefront hostname. The browser never supplies `store_id`, `tenant_id`, `customer_id`, `account_id`, or order database IDs as authority.

The storefront application owns the browser flow and branded pages. A server-only identity runtime validates requests and calls narrowly granted PostgreSQL functions. A platform-managed email adapter delivers sign-in codes. The existing cart, checkout, receipt, and customer credentials remain operational for guests.

## User Experience

### Unified registration and sign-in

1. The customer selects **Hesabım**.
2. `/account/login` shows the current store logo, name, and published design colors.
3. The customer submits an email address.
4. The API always returns the same accepted response and sends a six-digit code when delivery is available.
5. `/account/verify` accepts the code. If the store already has an account for the email, a full session is created.
6. For a new account, an existing same-store customer with that email is reused and activated immediately. If no customer exists, verification creates a `pending_profile` account plus a fifteen-minute registration session; the customer then supplies first name, last name, and phone before a full session is issued.
7. The email remains read-only in the first release; a future email-change flow must require verification of the new address.
8. The customer returns to a validated same-origin `returnTo` path, defaulting to `/account`.

There is no separate “register” versus “sign in” decision, no password, and no account-existence disclosure.

### Account area

`/account` is an authenticated dashboard with links to:

- `/account/orders` and `/account/orders/[orderReference]`
- `/account/addresses`
- `/account/profile`
- `/account/favorites`
- `/account/security`

The header account icon goes to `/account` when authenticated and `/account/login` otherwise. Protected account pages redirect to `/account/login?returnTo=...` when the session is absent, expired, revoked, or store-mismatched.

### Checkout and guest behavior

- Guest checkout remains unchanged and never redirects to login.
- A signed-in checkout is prefilled from the customer profile and selected address.
- Checkout edits update saved profile/address data only after an explicit “save” choice.
- New signed-in orders are linked to the account’s canonical `customer_id` and to the account-order mapping in the same transaction.
- A guest order remains accessible through the existing short-lived receipt flow. It appears in the durable account only after email verification and claim.

### Cart and favorites merge

On successful login:

- if only an anonymous cart exists, it becomes the account’s active cart;
- if both carts exist, matching line quantities are summed, capped by current stock and product limits, and all prices are recalculated server-side;
- the merge operation is idempotent and returns any quantity adjustment as a visible notice;
- browser favorites are unioned with valid active products already saved in the account;
- product IDs are resolved under the current store and cannot reference another store.

Logout revokes the account session and clears account-only client state. The ordinary product cart may remain available as an anonymous cart, but no account profile, address, favorite, order, or session data remains readable.

## Persistence Model

All new tables live in `saas`, include `store_id`, and use composite foreign keys or equivalent store-equality constraints to prevent cross-store references.

### `saas.storefront_accounts`

- `id uuid primary key`
- `store_id uuid not null`
- `customer_id uuid`
- `email text not null`
- `email_normalized text not null`
- `status text not null check (status in ('pending_profile','active','suspended'))`
- `verified_at`, `last_login_at`, `created_at`, `updated_at timestamptz not null`
- `version bigint not null`
- unique `(store_id, id)`
- unique `(store_id, email_normalized)`
- partial unique `(store_id, customer_id)` where `customer_id is not null`
- composite foreign key `(store_id, customer_id)` to `saas.customers`

Email normalization is deterministic: trim surrounding ASCII whitespace, require a valid bounded email, Unicode-normalize to NFC, and lowercase the complete value. Both stored fields contain the canonical address in the first release; `email_normalized` exists to make authority and uniqueness explicit. Application and PostgreSQL validation must agree.

The existing customer schema already enforces unique `(store_id,email)`. When an account is first verified, reuse that same-store customer when present. An archived customer is reactivated because a verified customer has returned, unless the storefront account is suspended. If no customer exists, keep the account in `pending_profile`; profile completion creates the customer and activates the account atomically.

### `saas.storefront_login_challenges`

- random `id uuid`, `store_id`, `email_digest`, `code_key_id`, `code_digest`
- `purpose='sign_in_or_register'`
- `attempt_count`, `send_count`, `expires_at`, `consumed_at`, `locked_at`
- `created_at`, `last_sent_at`

The table does not store the six-digit code. `code_digest` is HMAC-SHA-256 over a versioned frame containing challenge ID, store ID, normalized email, and code, using a server keyring. A low-entropy code must never be stored with an unkeyed hash.

The normalized email remains in a short-lived encrypted, authenticated `__Host-celebix_account_challenge` cookie. The database stores only its digest until verification. Successful verification compares the sealed cookie, email digest, code digest, hostname-derived store, expiry, attempt count, and unused state atomically.

### `saas.storefront_account_sessions`

- `id uuid`, `store_id`, `account_id`
- `session_kind in ('registration','full')`
- `key_id`, `credential_digest`
- `created_at`, `last_seen_at`, `idle_expires_at`, `absolute_expires_at`
- `revoked_at`, `revocation_reason`
- bounded sanitized `device_label` and `user_agent_digest`
- unique `(store_id, credential_digest)`

The browser receives a random 32-byte opaque credential in `__Host-celebix_account`. Only a keyed digest is stored. Full sessions expire after seven idle days or thirty absolute days, whichever occurs first. Registration sessions expire after fifteen absolute minutes, can call only profile-completion and logout routes, and are rotated into a new full session after profile completion. Successful login always creates a new credential. Logout revokes the current row; all-device logout revokes every active session for that account.

### `saas.storefront_account_order_links`

- `store_id`, `account_id`, `order_id`, `claim_source`
- `claimed_at`
- primary key `(store_id, account_id, order_id)`
- unique `(store_id, order_id)`

Historical claim inserts links for same-store orders whose linked customer has the exact verified normalized email. It does not rewrite `orders.customer_id`. The claim runs in the verification transaction, is idempotent, and can be safely retried after an unknown commit.

### Existing address storage

The logical account-address feature reuses `saas.customer_addresses` through the account’s canonical customer. A parallel physical address table is intentionally not added, avoiding divergence between the storefront and merchant-admin customer view.

### `saas.storefront_account_favorites`

- `store_id`, `account_id`, `product_id`
- `created_at`
- primary key `(store_id, account_id, product_id)`
- composite same-store product foreign key

### `saas.storefront_account_cart_links`

- `store_id`, `account_id`, `cart_id`
- `status in ('active','absorbed','closed')`
- `linked_at`, `updated_at`
- at most one active cart per account and store

Existing cart credentials remain the browser capability. Account linkage enables another authenticated device to resolve the active cart without exposing an account or cart ID to the browser.

### Audit and email outbox

`saas.storefront_identity_audit` records bounded event codes, store/account/challenge/session references where applicable, timestamps, and non-PII request correlation IDs. Codes, credentials, raw email addresses, full user agents, request bodies, and provider responses are forbidden.

`saas.storefront_identity_email_outbox` stores idempotent delivery work with store branding snapshot, encrypted recipient authority, template version, attempt state, and timestamps. Provider credentials remain platform-managed and server-only. Merchant email configuration cannot disable customer login.

## Server Interfaces

Public route handlers:

- `POST /api/account/auth/start`
- `POST /api/account/auth/verify`
- `POST /api/account/profile/complete`
- `POST /api/account/logout`
- `POST /api/account/logout-all`
- `GET/PATCH /api/account/profile`
- `GET/POST/PATCH/DELETE /api/account/addresses`
- `GET/POST/DELETE /api/account/favorites`
- `GET /api/account/orders`
- `GET /api/account/orders/[orderReference]`
- `GET /api/account/sessions`

`auth/start` and `auth/verify` use the challenge cookie. Authenticated routes use the account cookie. Responses expose public order references, never database order IDs.

The data package exposes focused repositories for challenges, sessions, profile/address access, favorites, cart merge, historical claim, and account orders. SQL functions receive hostname plus credential digests and derive store/account authority internally. Public application roles have no direct table writes.

## Security Requirements

- `__Host-` cookies use `Secure`, `HttpOnly`, `Path=/`, `SameSite=Lax`, and no `Domain` attribute. Custom-domain sessions are naturally isolated by hostname.
- All authenticated mutations require an exact trusted `Origin`, JSON content type, fetch-metadata checks, and a session-bound CSRF token.
- `returnTo` accepts only a normalized same-origin absolute path from an allowlisted account, checkout, cart, product, or favorite route.
- Start responses are enumeration-safe and have the same public shape for existing and new accounts.
- A challenge lasts ten minutes, permits five incorrect attempts, and can be resent only after sixty seconds.
- Sending is limited to five attempts per normalized email and store per fifteen minutes and twenty attempts per trusted client-IP bucket per hour. Limits are enforced server-side before provider delivery.
- Successful consume, account creation/read, activation when possible, historical claim, and session creation are one transaction. For a new customer without a reusable customer row, verification atomically creates one pending account and one registration session; profile completion atomically creates the customer, activates the account, performs the claim, revokes the registration session, and creates the full session. Concurrent requests produce one durable outcome.
- Session, challenge, email-outbox, and audit repositories fail closed when PostgreSQL authority is unavailable. Guest cart and checkout repositories remain independent and available.
- Suspended accounts cannot create or refresh sessions. Merchant-admin customer detail may show verified-account status, last login, and active-device count and may suspend/re-enable an account or revoke all sessions. It can never read codes or credentials.
- Logs, analytics, error bodies, metrics labels, and audit payloads must not include raw emails, codes, tokens, cookie values, addresses, phones, or order contents.

## Error Behavior

- Invalid, expired, consumed, locked, or mismatched codes return the same Turkish error: `Kod geçersiz veya süresi dolmuş.`
- Rate-limited starts return a bounded retry time without revealing account existence.
- Missing platform email configuration returns controlled `503 account_email_unavailable` before creating a challenge.
- A provider delivery failure leaves a retryable outbox record and shows a generic temporary delivery message; it never creates a session.
- Revoked or expired sessions clear the browser cookie and redirect account pages to login.
- Account-data repository failure renders a controlled account error and does not fall back to browser email/name matching.
- Cart merge conflicts recalculate against current catalog and stock, preserve an idempotent result, and never silently discard a valid line.

## Rollout

1. Add additive PostgreSQL migration, assertions, rollback guard, repository contracts, and feature flags with all stores disabled.
2. Configure platform identity-email delivery in staging.
3. Enable Güzide Kuyumcu only and run cross-device, guest-to-account, checkout, logout, and tenant-isolation tests.
4. Observe delivery, verification, session, and claim metrics using non-PII identifiers.
5. Enable shared storefront accounts for all active stores after the staging acceptance gate.
6. Keep a kill switch that disables account entry and protected account routes without disabling guest cart or checkout.

Rollback first disables account auth and code delivery, then revokes active account sessions. Additive tables remain until their maximum credential lifetime has elapsed and a reviewed cleanup/export decision is made. Existing customer, order, cart, checkout, receipt, admin Logto, R2, domain, and deployment data are not removed.

## Verification Plan

### Contract and unit tests

- exact public request/response shapes and hostile extra-key rejection;
- email normalization parity between TypeScript and PostgreSQL;
- code HMAC/key rotation, expiry, consume, lock, resend, and enumeration behavior;
- pending-profile registration-session scope, expiry, completion, and full-session rotation;
- session creation, idle/absolute expiry, rotation, current/all-device revocation;
- same-origin return path and CSRF enforcement;
- cart/favorite merge arithmetic, stock caps, and idempotency.

### PostgreSQL integration tests

- Store A credentials cannot read or mutate Store B accounts, customers, orders, carts, addresses, favorites, or sessions;
- simultaneous first verification creates exactly one account and either one full session or one scoped registration session; concurrent profile completion creates one customer and one historical claim set;
- consumed code replay and old session reuse fail on every connection;
- guest orders with exact verified same-store email link once, while similar, unverified, edited, or other-store emails do not;
- unknown-commit recovery returns the original committed outcome without duplicating sessions, links, or outbox work;
- disabling account auth leaves guest checkout and receipt flows unchanged.

### Browser tests

- new account, existing account, wrong/expired code, resend, return-to-checkout;
- guest checkout followed by account claim;
- login on a second device and cross-device orders/favorites/cart;
- profile and address CRUD;
- current-device and all-device logout;
- suspended account denial;
- responsive and keyboard-accessible login, code, dashboard, orders, address, favorite, and security pages;
- branded rendering on starter domain and custom domain.

### Acceptance gate

- relevant package tests, migration harness, customer-panel build, and shared-storefront production build pass;
- Güzide staging completes the full guest and authenticated purchase flows without database IDs or secrets reaching browser output;
- both the admin panel and storefront continue returning healthy responses after deployment;
- no account feature is enabled globally until the tenant-isolation and guest-checkout regression suites pass.

## Success Criteria

A customer can use one verified email to create independent accounts in different Celebix stores, log in on a new device, see only that store’s linked orders, reuse profile and addresses, synchronize favorites and cart, and securely log out. A customer can also ignore accounts entirely and complete the existing guest checkout. No shopper identity or session is shared with merchant-admin Logto.
