# Admin WhatsApp verification

## Release boundaries

The merchant login sequence is Logto password, personal WhatsApp factor, then an
eight-hour merchant session. Owner and platform support keep their existing TOTP
authority. Storefront customer authentication uses separate records and keys.

Native migration `202610120228` installs compatible readers and guards with global
policy disabled. Apply its assertions against the actual catalog. The owner
workload may execute only the reviewed native workflow functions; never grant
direct access to factor, challenge, trust or recovery tables.

Publish the compatible owner applications NET then SITE, followed by the shared
customer panels NET then SITE. Preserve unrelated application environment rows,
payment and Google settings, and storefront releases. Use one owned deployment
per stage and record its running source, health and acceptance before advancing.

## Password proof

The issuer compatibility image pins the existing Logto version and changes only
the reviewed password-proof client/resource/scope flow. Its immutable signed ID
token AMR must match the V3 signed access-token claim. The owner also verifies
nonce, access-token hash, fresh authentication time and global single-use record.
An ordinary SSO, registration or missing-proof callback must require fresh
password login. The proof resource grants no merchant data access.

Create the dedicated proof resource, scope and default User role additively.
Preserve all existing roles and claims. Install the exact reviewed customizer.
Create the identity webhook disabled, privately bind its server-generated signing
key to both owners, then enable it after the signed receiver is ready.

## WhatsApp ingress and secrets

Use an independent admin master keyring and the existing VatanSMS adapter channel.
Only server runtime configuration receives the provider credentials, encryption
keys and webhook key. Codes, phone plaintext and credentials must not enter logs,
URLs, browser storage or release receipts.

Both central panels currently reach the origin directly. A private ForwardAuth
signer on the existing proxy network authenticates the source IP for the exact
POST `/api/admin-login/send` route. It has no public router or host port. Keep its
key solely in private runtime environments. Use `trustForwardHeader=false`,
`forwardBody=false`, and the reviewed header allowlist. The signer socket peer
must be the witnessed proxy address. Dynamic router configuration contains no
secret. A configured panel rejects unsigned ingress before calling the owner.

Run the transient actual-proxy regression before activation: forged forwarded IPs,
proof headers and Connection tokens must still produce the same verified client
IP. The transient route must bypass the broker/provider and be removed afterward.
An authenticated unknown IP retains account and recipient limits; missing proof
is not an unknown-IP fallback.

## Acceptance and activation

First enable an isolated store, then Alpler Spor. Verify real password login,
personal-phone enrollment, accepted WhatsApp delivery, backup-code recovery,
fixed device trust, forgetting the current device and tenant-domain return. Do
not record codes or recovery secrets in screenshots. Confirm all merchant roles,
new registration/invitations, switch/refresh and legacy original-expiry behavior.
Existing customer login, orders, manual sale and payment must remain operational.

Only after these gates enable global policy for current and future stores. The
cutover exemption belongs to the original session family and first expiration;
renewal and host/store transitions cannot extend it. Security revocation always
wins over an exemption.

No background WhatsApp polling is required. A delivery is explicit, ambiguous
sends are not automatically repeated, and retries preserve operation keys.

## Failure handling

Stop further activation when a gate fails. Inspect the owned operation/deployment
before retrying an uncertain result. Keep existing activated MFA enforcement.
Rollback affected application configuration only from the exact private release
snapshot after review; do not silently disable the native security policy.

Loss of all recovery methods requires the existing TOTP-protected platform
support endpoint with a recorded reason. Phone changes require fresh password,
old factor or backup code, and successful new-phone verification; all old device
trust is revoked.
