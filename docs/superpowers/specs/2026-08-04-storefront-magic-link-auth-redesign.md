# Storefront Magic-Link Authentication Redesign

**Date:** 2026-08-04  
**Status:** Product direction approved; written specification awaiting review  
**Scope:** Shared Celebix storefront customer authentication, beginning with Güzide Kuyumcu staging

## Objective

Replace the six-digit storefront login-code experience with a modern, one-click magic-link flow and redesign the account entry screen. Preserve the existing store-scoped PostgreSQL account, profile, address, favorite, order, session, and guest-checkout authorities.

## Considered Approaches

### 1. Keep the six-digit code and redesign only the page

This is the smallest change and works across devices, but it keeps the customer copying a code from email into the storefront. It does not deliver the one-click experience now selected for Celebix.

### 2. Use only a GET magic link that immediately creates a session

This is visually simple, but email security scanners and link-preview clients can open the URL before the customer. A GET request must not consume a credential or create a session.

### 3. Use a magic link that opens a confirmation page, then completes with POST

This is the selected approach. The email link carries a short-lived opaque credential to a branded verification page. Opening the page validates only the public shape; the explicit **Giriş yap** action submits a same-origin POST that atomically consumes the challenge and creates the account session. The email also displays a six-digit fallback code for customers whose email client breaks links.

## Platform Email Architecture

Celebix owns one central Resend account. Store owners do not enter Resend credentials for customer authentication.

- Production and staging use separate API keys with sending-only permission.
- The keys remain server-only and are independently rotatable.
- A dedicated verified subdomain such as `auth.celebix.co` isolates authentication-email reputation.
- The address is stable, for example `giris@auth.celebix.co`; the display name is the current store name.
- `Reply-To` may use the store's verified support address, but it is not authentication authority.
- The first release uses one Celebix-owned sending domain. Per-merchant custom sending domains are a future premium capability and cannot block login.
- Every delivery uses the durable outbox ID as its Resend idempotency key so retries cannot duplicate one message.

The existing platform email configuration remains fail-closed. Missing or invalid Resend configuration cannot expose a token or silently downgrade authentication; guest browsing, cart, and checkout remain available.

## User Experience

### Entry page

`/account/login` remains part of the merchant storefront frame but uses a consistent Celebix account pattern:

- no oversized editorial headline;
- no floating card or decorative box;
- a centered content column with a maximum readable width of about 480 pixels;
- the current store name and, when available, store logo;
- heading **Hesabınıza giriş yapın**;
- one email field and one full-width primary action **Giriş bağlantısı gönder**;
- compact trust text: **Şifre gerekmez · Bağlantı 10 dakika geçerlidir**;
- concise account benefits for orders, saved addresses, and favorites;
- visible focus, error, busy, and success states;
- one-column responsive layout on mobile without changing the global storefront header.

The page uses the store's published colors within contrast-safe bounds. It does not inherit typography choices that make form controls or authentication headings difficult to scan.

### Start response

Submitting a syntactically valid email always produces the same public success state:

**Giriş bağlantısı gönderildi. Gelen kutunuzu kontrol edin.**

The response does not reveal whether the store already has an account for the email. The page remains in place and provides a bounded resend action after sixty seconds. It does not automatically redirect to a code-entry page.

### Magic-link confirmation

The email button opens `/account/verify?ticket=<opaque-ticket>&returnTo=<safe-path>` on the exact storefront hostname that issued the challenge.

The GET page never consumes the ticket. It shows the current store identity, a short confirmation message, and one **Giriş yap** button. That button submits the ticket with POST to `/api/account/auth/verify`. Successful verification creates or resumes the store-scoped account, merges eligible favorites/cart data, and redirects to the validated `returnTo` path.

If the ticket is expired, consumed, malformed, copied to another store, or otherwise invalid, the page displays one generic recovery message and links back to `/account/login`.

### Fallback code

The email also contains the existing six-digit one-time code. `/account/verify` exposes a compact **Kod ile devam et** disclosure rather than a second primary experience. Code and link consume the same challenge; using either invalidates the other.

### Guest checkout

Guest checkout never redirects to login. A signed-in customer keeps the existing profile/address prefill and account-order linking behavior. Authentication delivery failure cannot disable guest checkout.

## Security Model

- A challenge is bound to the trusted storefront hostname, normalized email, challenge ID, and ten-minute expiry.
- The magic ticket is random, opaque, single use, and at least 256 bits. PostgreSQL stores only its keyed HMAC digest; raw tickets are never logged or persisted.
- The ticket is a bearer credential and can complete verification in another browser or device. Its digest is bound to the issuing storefront hostname and challenge, so copying it to another store cannot work.
- The encrypted challenge cookie remains host-only and carries the challenge ID, normalized email, and expiry for fallback-code entry, resend timing, and local recovery. Fallback-code verification requires this cookie; ticket verification does not.
- GET requests never create sessions, consume challenges, mutate carts/favorites, or disclose account existence.
- Verification is a same-origin JSON POST with existing origin and fetch-metadata validation.
- Successful consume, account resolution/creation, historical order claim, and session creation remain one PostgreSQL transaction.
- Link and code share the existing attempt, expiry, rate-limit, audit, and suspension controls.
- `returnTo` remains limited to the existing safe same-origin route allowlist.
- Email templates, provider metadata, application logs, analytics, and error bodies contain no raw session credential or database identity.
- Email delivery uses the outbox identity as the provider idempotency key.

## Component and Interface Changes

### Storefront UI

- Redesign `AccountAuthForm` into explicit email-sent, link-confirmation, fallback-code, busy, and error states.
- Replace the oversized two-column login hero with the compact account-entry composition.
- Keep `/account/verify` as the confirmation and fallback route.
- Preserve keyboard access, `aria-live` status, real labels, autocomplete hints, and reduced-motion behavior.

### Runtime

- Generate one high-entropy ticket and one six-digit fallback code for each challenge.
- Persist both keyed digests under the same challenge.
- Deliver a versioned branded magic-link email containing the confirmation URL and fallback code.
- Accept exactly one verification method per request: `ticket` or `code`.
- Consume the same challenge atomically regardless of the selected method.

### PostgreSQL

Add an additive migration for a ticket key ID and ticket digest on login challenges. Existing challenge rows remain code-verifiable until expiry. Direct runtime table privileges stay revoked and RLS remains forced. The rollback guard refuses removal while any unexpired ticket-capable challenge or active account authority exists.

### Resend adapter

The adapter receives the normalized recipient, store name, exact store origin, opaque ticket, fallback code, safe return path, template version, and outbox idempotency key. It builds a fixed Celebix transactional template with bounded store branding. It sends through the HTTPS API using the restricted environment key and a hard timeout.

## Error Handling

- Start remains enumeration-safe for existing and new accounts.
- Provider failure returns a generic Turkish temporary-unavailable message and leaves a bounded retryable outbox state.
- Invalid or expired ticket/code returns one generic verification failure.
- An already consumed challenge never creates a second session.
- A valid ticket can authenticate without the originating browser cookie, while a fallback code without its matching challenge cookie offers a new-link action.
- A failed favorite/cart merge does not invalidate the authenticated session and is surfaced as a non-blocking account notice.

## Testing

### Unit and contract tests

- ticket entropy, format, HMAC framing, key rotation, hostname binding, and malformed input;
- exactly-one-of ticket/code request validation;
- email template escapes merchant-controlled text and builds only an allowlisted HTTPS storefront URL;
- GET confirmation has no mutation side effect;
- modern entry form success, resend, fallback, busy, keyboard, and generic-error behavior.

### PostgreSQL integration tests

- ticket verification consumes one challenge and creates one store-scoped session;
- ticket replay, code-after-ticket, ticket-after-code, expiry, and other-store hostname fail;
- concurrent ticket submissions produce one durable result;
- migration preserves currently unexpired code challenges and all existing account/session data.

### Browser and deployment checks

- desktop and mobile login layouts have no overflow or oversized empty region;
- email submission stays on the entry page and displays the generic sent state;
- emailed link opens confirmation, explicit POST signs in, and safe return works;
- fallback code signs in when the link cannot be used;
- second-device login, logout, profile, addresses, favorites, and orders still work;
- guest checkout remains reachable and completable with accounts enabled or email delivery unavailable;
- staging and production keys are isolated and no secret appears in client bundles, logs, or responses.

## Rollout

1. Ship the additive database and runtime changes behind the existing account activation gate.
2. Configure a verified Celebix authentication subdomain and a sending-only staging Resend key.
3. Enable and test Güzide Kuyumcu staging end to end.
4. Observe non-PII start, delivery, confirmation, consume, expiry, replay, and provider-failure metrics.
5. Configure a separate production key and enable shared storefronts incrementally.

## Acceptance Criteria

A customer can enter an email on a modern, compact store-branded page, receive one Celebix-managed transactional email, confirm the link with an explicit action, and enter only that store's account. The same email may have separate accounts in other stores. Link scanners cannot create sessions, replay cannot create a second session, fallback code remains available, secrets stay server-only, and guest checkout is unaffected.
