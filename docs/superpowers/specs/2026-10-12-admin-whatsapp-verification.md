# Admin WhatsApp verification — approved implementation specification

User explicitly approved implementation of the full in-chat plan on 2026-10-12.
This specification preserves that plan; no further design approval is required.

## Required outcome

Existing Logto password verification, then WhatsApp verification, then the real
merchant panel session/handoff. All store_owner/admin/editor/analyst/cashier roles
and current/future tenant admin domains are covered. Central owner and platform
support password/TOTP/AAL2 authentication remain separate and unchanged.

First login enrolls the authenticated administrator's own phone. Never adopt a
store contact or a storefront customer's phone. One personal factor per principal;
phone is not a principal lookup key and does not merge identities. Opt-in remember
browser for30 fixed days defaults unchecked; normal sessions remain8 hours.
Enrollment provides10 single-use backup codes. Backup-code login never creates
a remembered browser. Ordinary logout revokes panel sessions but retains explicitly
selected device trust; Forget/revoke removes trust. Change phone requires fresh
password + old WhatsApp/backup + new phone OTP; revokes trust. Lost all factors
uses a reason-recorded support reset protected by existing platform TOTP.

## Trust boundaries

No full merchant session or native handoff may be issued before second-factor
proof. Enforce in durable issue/resolve/rotate/switch/handoff authority, not only
UI. Separate principal factor, pending login, OTP, device digest and backup digest
records; purpose-separated cryptography/keyring from all customer/payment/Google
secrets. Telephone encrypted; secrets and codes absent from logs/URLs/storage.

First-factor proof resource: urn:celebix:admin-signin-proof, scope signin:proof.
Logto1.41.0 supports custom access-token context.interaction.verificationRecords.
Only an actual verified Password record matching identified user can attest it.
Customizer compares interaction.userId/context.user.id/token.accountId; signed
JWT sub is verified separately against ID-token sub on owner server. Installed
Logto does not forward an authorization sign_in_context to that customizer, and
its most recent interaction is mutable across concurrent flows. The reviewed
1.41.0 compatibility image therefore adds a narrowly scoped immutable AMR:
current verified Password record must identify the submitted user, then its
record ID and fixed submission time are preserved through consent and into the
authorization code. Only the dedicated client/resource/scope emits this AMR in
the signed ID token. V3 access claims must match that exact record ID and token
jti. Owner verifies both signatures, expected ID nonce, mandatory at_hash of the
exact access JWT, fresh auth_time, client, subject, audience and scope. Global
single-use SHA256 binds issuer/subject/record ID independently of client,
environment or encryption-key rotation. Never accept a browser flag, refresh,
passwordless/social flow or unrelated password record. Existing custom scripts,
claims, methods and M2M paths are preserved; the compatibility image pins the
exact existing vendor version rather than upgrading it. Registration without
actual completed password
proof goes through fresh login after idempotent tenant creation, without creating
the store again.

## OTP and recovery

Reuse the pure VatanSMS connected-device adapter (api.toplusms.app NtoN), not
customer verification/session SQL. Six-digit CSPRNG code,10min lifetime,60s resend,
6 wrong guesses/challenge lock. Principal and recipient each5 sends/15min;
trusted-source IP30/15min. Missing IP does not remove principal/recipient budget.
Persistent delivery pending→accepted→consumed; no open DB transaction while
provider waits, no automatic retry of ambiguous send. Failed resend preserves
the previous accepted unexpired challenge. Verify operation replay is idempotent;
codes/backup codes cannot issue multiple sessions concurrently.

Trusted credentials are opaque random cookies, host-only on central panel,
HttpOnly/Secure; principal/environment/security-version bound. Trust does not
extend its fixed expiry or grant direct30day API access. Security management can
forget current/all devices and regenerate backup codes. Signed and deduplicated
Logto identity/password reset/suspension/deletion events invalidate security
version and remembered devices. Phone change/reset invalidates existing assurance.

## Migration/publication

Add compatible native schema/readers first, owner services then panels NET→SITE.
ROOT is sole publisher. No agent changes live data/config/refs/queues. Existing
legacy session exemption is only an immutable pre-cutover family + original
expiry, maximum8h; descendants inherit the same ceiling, never renew it.
Revocation/security-version invalidation outranks exemption. No new legacy
session may bypass enabled policy. Keep policy disabled until code, private env,
provider proof and isolated acceptance are ready. Canary isolated store then
Alpler, activate all/new tenants after real acceptance. Stop new activation on
failure; never silently bypass verification.

Test first: real behavior and isolated native PostgreSQL fixtures covering every
boundary above; regression login/logout/customer/cart/orders/payment; sequential
build/test processes to keep laptop memory bounded. No production fixture writes,
provider calls, registration or personal phone replacement without ROOT review.
